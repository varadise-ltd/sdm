import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";
import { jsonError, normalizeTagSlug, parseObjectBody } from "../../../../../../lib/http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectCode: string; tagSlug: string }> };
const tagAdminRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];

async function findTag(projectId: string, tagSlug: string) {
  const result = await db.query(
    `
      SELECT t.id, t.project_id AS "projectId", p.code AS "projectCode",
             t.name, t.slug, t.tag_kind AS "tagKind", t.active,
             t.created_at AS "createdAt", t.updated_at AS "updatedAt"
      FROM tags t
      JOIN projects p ON p.id = t.project_id
      WHERE t.project_id = $1 AND t.slug = $2
    `,
    [projectId, tagSlug.toLowerCase()],
  );
  return result.rows[0] ?? null;
}

export async function GET(request: Request, context: RouteContext) {
  const { projectCode, tagSlug } = await context.params;
  try {
    const { membership } = await requireProjectMembership(request, projectCode, undefined, "documents.read");
    const tag = await findTag(membership.projectId, tagSlug);
    if (!tag || !tag.active) return jsonError("Tag not found", 404);
    return NextResponse.json({ data: tag });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectCode, tagSlug } = await context.params;
  let body: Record<string, unknown> | null;
  try {
    body = parseObjectBody(await request.json());
  } catch {
    return jsonError("Request body must be valid JSON");
  }
  if (!body) return jsonError("Request body must be a JSON object");

  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, tagAdminRoles, "documents.edit");
    const current = await findTag(membership.projectId, tagSlug);
    if (!current) return jsonError("Tag not found", 404);

    const name = body.name === undefined ? current.name : typeof body.name === "string" ? body.name.trim() : "";
    const slug = body.slug === undefined ? current.slug : normalizeTagSlug(String(body.slug));
    const active = body.active === undefined ? current.active : body.active;
    if (name.length < 1 || name.length > 100) return jsonError("name must be 1-100 characters");
    if (typeof active !== "boolean") return jsonError("active must be boolean");
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(slug)) {
      return jsonError("slug must contain 2-64 lowercase letters, numbers, hyphens, or underscores");
    }

    const result = await db.query(
      `
        UPDATE tags
        SET name = $1, slug = $2, active = $3
        WHERE id = $4
        RETURNING id, name, slug, tag_kind AS "tagKind", active,
                  created_at AS "createdAt", updated_at AS "updatedAt"
      `,
      [name, slug, active, current.id],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'tag.updated', 'tag', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, current.id, JSON.stringify({ name, slug, active }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0] });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return jsonError("A tag with this slug already exists in the project", 409);
    }
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectCode, tagSlug } = await context.params;
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, tagAdminRoles, "documents.edit");
    const current = await findTag(membership.projectId, tagSlug);
    if (!current) return jsonError("Tag not found", 404);
    const result = await db.query(
      `
        UPDATE tags
        SET active = false
        WHERE id = $1
        RETURNING id, name, slug, tag_kind AS "tagKind", active,
                  created_at AS "createdAt", updated_at AS "updatedAt"
      `,
      [current.id],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'tag.deleted', 'tag', $3, '{}'::jsonb, $4)`,
      [membership.projectId, user.id, current.id, request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0], deleted: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
