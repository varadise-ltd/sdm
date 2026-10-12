import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { defaultLibraryFolder, libraryFolderCompatibilityError } from "../../../../../lib/library-folders";

export const runtime = "nodejs";

const draftRoles: readonly SdmRole[] = [
  "contractor_pm",
  "document_controller",
  "subcontractor",
  "supplier",
  "design_consultant",
];

function textValue(value: unknown, max = 255): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, draftRoles, "documents.read");
    const result = await db.query(
      `
        SELECT d.id, d.title, d.document_type_code AS "documentTypeCode",
               d.is_drawing AS "isDrawing", d.is_internal AS "isInternal",
               d.library_folder AS "libraryFolder",
               d.internal_category AS "internalCategory", d.metadata, d.status,
               d.due_at AS "dueAt", d.submitted_at AS "submittedAt",
               d.promoted_container_id AS "promotedContainerId",
               d.created_at AS "createdAt", d.updated_at AS "updatedAt",
               u.display_name AS "creatorName"
        FROM drafts d
        JOIN projects p ON p.id = d.project_id AND p.code = $1
        JOIN users u ON u.id = d.creator_user_id
        WHERE d.project_id = $2
          AND ($3 = 'document_controller' OR d.creator_user_id = $4)
        ORDER BY d.updated_at DESC
      `,
      [projectCode.trim().toUpperCase(), membership.projectId, membership.roleSlug, user.id],
    );
    return NextResponse.json({ data: result.rows, project: membership.projectCode });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, draftRoles, "documents.create");
    const body = (await request.json()) as Record<string, unknown>;
    const title = textValue(body.title, 500);
    const documentTypeCode = textValue(body.documentTypeCode, 32).toUpperCase();
    const isDrawing = body.isDrawing === true;
    const libraryFolder = body.libraryFolder === undefined ? defaultLibraryFolder(documentTypeCode, isDrawing) : (typeof body.libraryFolder === "string" ? body.libraryFolder.trim() : "");
    const isInternal = body.isInternal === true;
    const internalCategory = textValue(body.internalCategory, 120);
    const dueAt = textValue(body.dueAt, 80);
    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};

    if (!title || !/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(documentTypeCode)) {
      return NextResponse.json({ error: { code: "INVALID_DRAFT", message: "title and a valid documentTypeCode are required" } }, { status: 400 });
    }
    const folderError = libraryFolderCompatibilityError(libraryFolder, documentTypeCode, isDrawing);
    if (folderError) return NextResponse.json({ error: { code: "INVALID_LIBRARY_FOLDER", message: folderError } }, { status: 400 });
    if (isInternal && !internalCategory) {
      return NextResponse.json({ error: { code: "INVALID_DRAFT", message: "internalCategory is required for Internal Shared drafts" } }, { status: 400 });
    }
    const dueDate = dueAt ? new Date(dueAt) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ error: { code: "INVALID_DRAFT", message: "dueAt must be a valid ISO date" } }, { status: 400 });
    }

    const result = await db.query(
      `
        INSERT INTO drafts (
          project_id, creator_user_id, owning_party_id, title, document_type_code,
          is_drawing, is_internal, internal_category, library_folder, metadata, due_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''), $9, $10::jsonb, $11)
        RETURNING id, title, document_type_code AS "documentTypeCode", is_drawing AS "isDrawing",
                  is_internal AS "isInternal", library_folder AS "libraryFolder", internal_category AS "internalCategory",
                  metadata, status, due_at AS "dueAt", created_at AS "createdAt"
      `,
      [membership.projectId, user.id, membership.partyId, title, documentTypeCode, isDrawing, isInternal, internalCategory, libraryFolder, JSON.stringify(metadata), dueDate.toISOString()],
    );

    const draft = result.rows[0];
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'draft.created', 'draft', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, draft.id, JSON.stringify({ title, documentTypeCode, isInternal }), request.headers.get("x-request-id")],
    );

    return NextResponse.json({ data: draft }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
