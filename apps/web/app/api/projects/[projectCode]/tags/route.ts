import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { jsonError, normalizeTagSlug, parseObjectBody } from "../../../../../lib/http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectCode: string }> };

const tagAdminRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];

export async function GET(request: Request, context: RouteContext) {
  const { projectCode: rawProjectCode } = await context.params;
  const projectCode = rawProjectCode.trim().toUpperCase();
  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";

  try {
    const { membership } = await requireProjectMembership(request, projectCode, undefined, "documents.read");

    const result = await db.query(
      `
        SELECT
          t.id,
          p.code AS "projectCode",
          t.name,
          t.slug,
          t.tag_kind AS "tagKind",
          t.active,
          t.created_at AS "createdAt",
          t.updated_at AS "updatedAt",
          count(ct.container_id)::integer AS "containerCount"
        FROM tags t
        JOIN projects p ON p.id = t.project_id
        LEFT JOIN container_tags ct ON ct.tag_id = t.id
        WHERE t.project_id = $1
          AND ($2 OR t.active)
        GROUP BY t.id, p.code
        ORDER BY t.active DESC, t.name ASC
      `,
      [membership.projectId, includeInactive],
    );
    return NextResponse.json({ data: result.rows, project: projectCode });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { projectCode: rawProjectCode } = await context.params;
  const projectCode = rawProjectCode.trim().toUpperCase();

  let body: Record<string, unknown> | null;
  try {
    body = parseObjectBody(await request.json());
  } catch {
    return jsonError("Request body must be valid JSON");
  }
  if (!body) return jsonError("Request body must be a JSON object");

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = normalizeTagSlug(typeof body.slug === "string" ? body.slug : name);
  const tagKind = body.tagKind === "system" ? "system" : "custom";
  if (name.length < 1 || name.length > 100) return jsonError("name must be 1-100 characters");
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(slug)) {
    return jsonError("slug must contain 2-64 lowercase letters, numbers, hyphens, or underscores");
  }

  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, tagAdminRoles, "documents.edit");
    const result = await db.query(
      `
        INSERT INTO tags (project_id, name, slug, tag_kind, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, slug, tag_kind AS "tagKind", active,
                  created_at AS "createdAt", updated_at AS "updatedAt"
      `,
      [membership.projectId, name, slug, tagKind, user.id],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'tag.created', 'tag', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, result.rows[0].id, JSON.stringify({ name, slug, tagKind }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0], project: projectCode }, { status: 201 });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return jsonError("A tag with this slug already exists in the project", 409);
    }
    return authErrorResponse(error);
  }
}
