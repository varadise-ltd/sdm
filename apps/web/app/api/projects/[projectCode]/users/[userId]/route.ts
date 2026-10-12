import { NextResponse } from "next/server";
import { authErrorResponse, authMode, requireProjectMembership, type SdmRole } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";
import { isUuid, jsonError, parseObjectBody } from "../../../../../../lib/http";
import { hashLocalPassword, validateLocalPassword } from "../../../../../../lib/password";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectCode: string; userId: string }> };
const adminRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];

export async function PATCH(request: Request, context: RouteContext) {
  const { projectCode, userId } = await context.params;
  if (!isUuid(userId)) return jsonError("userId must be a UUID");
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const displayName = body.displayName === undefined ? undefined : typeof body.displayName === "string" ? body.displayName.trim() : "";
  const externalSubjectValue = body.externalSubject === undefined || body.externalSubject === null ? "" : typeof body.externalSubject === "string" ? body.externalSubject.trim() : "";
  const externalSubject = externalSubjectValue || null;
  const active = body.active === undefined ? undefined : body.active;
  const password = body.password === undefined || body.password === null ? undefined : typeof body.password === "string" ? body.password : "";
  if (displayName !== undefined && (displayName.length < 2 || displayName.length > 160)) return jsonError("displayName must be 2-160 characters");
  if (externalSubject !== null && (externalSubject.length < 2 || externalSubject.length > 255)) return jsonError("externalSubject must be 2-255 characters when provided");
  if (password !== undefined) { const passwordError = validateLocalPassword(password); if (passwordError) return jsonError(passwordError); }
  if (active !== undefined && typeof active !== "boolean") return jsonError("active must be boolean");
  if (displayName === undefined && body.externalSubject === undefined && active === undefined && password === undefined) return jsonError("At least one user field is required");
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, adminRoles, "members.manage");
    if (active === false && userId === user.id) return jsonError("You cannot deactivate your own active account", 409);
    const exists = await db.query(
      `SELECT u.id
         FROM users u
        WHERE u.id = $1
          AND (EXISTS (SELECT 1 FROM project_memberships scoped_pm WHERE scoped_pm.project_id = $2 AND scoped_pm.user_id = u.id)
               OR NOT EXISTS (SELECT 1 FROM project_memberships any_pm WHERE any_pm.user_id = u.id))`,
      [userId, membership.projectId],
    );
    if (!exists.rows[0]) return jsonError("User not found", 404);
    if (active === false) {
      const assigned = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM project_memberships WHERE project_id = $1 AND user_id = $2 AND active`, [membership.projectId, userId]);
      if (Number(assigned.rows[0]?.count ?? 0) > 0) return jsonError("Deactivate the user's project memberships before deactivating the account", 409);
    }
    if (password !== undefined && authMode !== "local" && authMode !== "development") return jsonError("Local password management is disabled; use the identity provider", 400);
    const passwordHash = password === undefined ? null : await hashLocalPassword(password);
    const result = await db.query(
      `UPDATE users SET display_name = COALESCE($2, display_name), external_subject = CASE WHEN $3::boolean THEN $4 ELSE external_subject END, active = COALESCE($5, active), password_hash = CASE WHEN $6::boolean THEN $7 ELSE password_hash END, password_updated_at = CASE WHEN $6::boolean THEN now() ELSE password_updated_at END
       WHERE id = $1
       RETURNING id, email::text AS email, display_name AS "displayName", external_subject AS "externalSubject", active, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [userId, displayName ?? null, body.externalSubject !== undefined, externalSubject, active ?? null, password !== undefined, passwordHash],
    );
    if (active === false) {
      // Deactivation must take effect immediately for local sessions; waiting
      // for the eight-hour cookie expiry would leave a disabled account usable.
      await db.query(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    }
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'user.updated', 'user', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, userId, JSON.stringify({ displayName, externalSubjectChanged: body.externalSubject !== undefined, active, passwordChanged: password !== undefined }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0] });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return jsonError("A user with this external subject already exists", 409);
    return authErrorResponse(error);
  }
}
