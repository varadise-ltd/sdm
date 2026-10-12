import { NextResponse } from "next/server";
import { authErrorResponse, getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { isUuid, jsonError, parseObjectBody } from "../../../../lib/http";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ organizationId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  if (!isUuid(organizationId)) return jsonError("organizationId must be a UUID");
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const name = body.name === undefined ? undefined : typeof body.name === "string" ? body.name.trim() : "";
  const timezone = body.timezone === undefined ? undefined : typeof body.timezone === "string" ? body.timezone.trim() : "";
  const status = body.status === undefined ? undefined : String(body.status);
  if (name !== undefined && (name.length < 2 || name.length > 160)) return jsonError("name must be 2-160 characters");
  if (status !== undefined && !["active", "paused", "closed"].includes(status)) return jsonError("status is invalid");
  if (name === undefined && timezone === undefined && status === undefined) return jsonError("At least one organization field is required");
  try {
    const user = await getCurrentUser(request);
    const result = await db.query(
      `UPDATE organizations o SET name = COALESCE($2, o.name), timezone = COALESCE($3, o.timezone), status = COALESCE($4, o.status)
        WHERE o.id = $1 AND EXISTS (SELECT 1 FROM organization_memberships om WHERE om.organization_id = o.id AND om.user_id = $5 AND om.active AND om.role_slug IN ('org_owner','org_admin'))
        RETURNING o.id, o.code, o.name, o.timezone, o.status, o.updated_at AS "updatedAt"`,
      [organizationId, name ?? null, timezone ?? null, status ?? null, user.id],
    );
    if (!result.rows[0]) return jsonError("Organization not found or access is not permitted", 404);
    await db.query(`INSERT INTO audit_events (actor_user_id, event_type, entity_type, entity_id, payload, request_id) VALUES ($1, 'organization.updated', 'organization', $2, $3::jsonb, $4)`, [user.id, organizationId, JSON.stringify({ name, timezone, status }), request.headers.get("x-request-id")]);
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) { return authErrorResponse(error); }
}
