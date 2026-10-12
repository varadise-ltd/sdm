import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { isUuid, jsonError, parseObjectBody } from "../../../../../lib/http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ containerId: string }> };
const tagWriteRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant"];

async function findContainer(containerId: string) {
  const result = await db.query(
    `SELECT c.id, c.project_id AS "projectId", p.code AS "projectCode",
             c.is_internal AS "isInternal", c.originator_party_id AS "originatorPartyId"
       FROM containers c JOIN projects p ON p.id = c.project_id
      WHERE c.id = $1`,
    [containerId],
  );
  return result.rows[0] ?? null;
}

function assertVisible(container: { isInternal: boolean; originatorPartyId: string }, membership: { roleSlug: string; partyId: string }) {
  if (container.isInternal && membership.roleSlug !== "document_controller" && container.originatorPartyId !== membership.partyId) {
    throw new AuthError(403, "This internal document is outside your party scope");
  }
}

function requestedTag(body: Record<string, unknown> | null) {
  const tagId = typeof body?.tagId === "string" ? body.tagId : null;
  const tagSlug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : null;
  if ((!tagId && !tagSlug) || (tagId && !isUuid(tagId))) return null;
  return { tagId, tagSlug };
}

export async function GET(request: Request, context: RouteContext) {
  const { containerId } = await context.params;
  if (!isUuid(containerId)) return jsonError("Document ID must be a UUID");
  try {
    const container = await findContainer(containerId);
    if (!container) return jsonError("Document not found", 404);
    const { membership } = await requireProjectMembership(request, container.projectCode, undefined, "documents.read");
    assertVisible(container, membership);
    const result = await db.query(
      `
        SELECT t.id, t.name, t.slug, t.tag_kind AS "tagKind", t.active,
               ct.applied_at AS "appliedAt", ct.applied_by_user_id AS "appliedByUserId"
          FROM container_tags ct
          JOIN tags t ON t.id = ct.tag_id
         WHERE ct.container_id = $1
         ORDER BY t.name
      `,
      [containerId],
    );
    return NextResponse.json({ data: result.rows, containerId, project: container.projectCode });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { containerId } = await context.params;
  if (!isUuid(containerId)) return jsonError("Document ID must be a UUID");

  let body: Record<string, unknown> | null;
  try {
    body = parseObjectBody(await request.json());
  } catch {
    return jsonError("Request body must be valid JSON");
  }
  if (!body) return jsonError("Request body must be a JSON object");
  const target = requestedTag(body);
  if (!target) return jsonError("Provide either a valid tagId or a tag slug");

  try {
    const container = await findContainer(containerId);
    if (!container) return jsonError("Document not found", 404);
    const { user, membership } = await requireProjectMembership(request, container.projectCode, tagWriteRoles, "documents.edit");
    assertVisible(container, membership);
    const result = await db.query(
      `
        WITH target AS (
          SELECT c.id AS container_id, t.id AS tag_id
            FROM containers c
            JOIN tags t ON t.project_id = c.project_id
           WHERE c.id = $1
             AND t.active
             AND (($2::uuid IS NOT NULL AND t.id = $2::uuid) OR ($3::text IS NOT NULL AND t.slug = $3::text))
        )
        INSERT INTO container_tags (container_id, tag_id, applied_by_user_id)
        SELECT container_id, tag_id, $4::uuid FROM target
        ON CONFLICT (container_id, tag_id) DO NOTHING
        RETURNING container_id AS "containerId", tag_id AS "tagId",
                  applied_by_user_id AS "appliedByUserId", applied_at AS "appliedAt"
      `,
      [containerId, target.tagId, target.tagSlug, user.id],
    );
    if (result.rowCount === 0) return jsonError("Document or active project tag not found", 404);
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'container.tag_assigned', 'container', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, containerId, JSON.stringify({ tagId: result.rows[0].tagId, slug: target.tagSlug }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0], project: membership.projectCode }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { containerId } = await context.params;
  if (!isUuid(containerId)) return jsonError("Document ID must be a UUID");

  let body: Record<string, unknown> | null;
  try {
    body = parseObjectBody(await request.json());
  } catch {
    return jsonError("Request body must be valid JSON");
  }
  const target = requestedTag(body);
  if (!target) return jsonError("Provide either a valid tagId or a tag slug");

  try {
    const container = await findContainer(containerId);
    if (!container) return jsonError("Document not found", 404);
    const { user, membership } = await requireProjectMembership(request, container.projectCode, tagWriteRoles, "documents.edit");
    assertVisible(container, membership);
    const result = await db.query(
      `
        DELETE FROM container_tags ct
        USING tags t
        WHERE ct.container_id = $1
          AND ct.tag_id = t.id
          AND (($2::uuid IS NOT NULL AND t.id = $2::uuid) OR ($3::text IS NOT NULL AND t.slug = $3::text))
        RETURNING ct.tag_id AS "tagId"
      `,
      [containerId, target.tagId, target.tagSlug],
    );
    if (result.rowCount === 0) return jsonError("Document tag assignment not found", 404);
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'container.tag_removed', 'container', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, containerId, JSON.stringify({ tagId: result.rows[0].tagId, slug: target.tagSlug }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ deleted: true, containerId, tagId: result.rows[0].tagId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
