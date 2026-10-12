import { NextResponse } from "next/server";
import { authErrorResponse, projectPermissionKeys, requireProjectMembership, type SdmRole } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";
import { isUuid, jsonError, parseObjectBody } from "../../../../../../lib/http";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectCode: string; membershipId: string }> };
const adminRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];
function rolePartyCompatible(roleSlug: string, partyType: string): boolean {
  if (["contractor_pm", "document_controller"].includes(roleSlug)) return partyType === "contractor";
  if (roleSlug === "client_re_er") return partyType === "client";
  if (roleSlug === "design_consultant") return partyType === "design_consultant";
  if (roleSlug === "subcontractor") return partyType === "subcontractor";
  if (roleSlug === "supplier") return partyType === "supplier";
  return true;
}
function parsePermissions(value: unknown): Record<string, boolean> {
  if (value === undefined || value === null) return {};
  if (Array.isArray(value)) return Object.fromEntries(value.filter((item): item is string => typeof item === "string" && projectPermissionKeys.includes(item as (typeof projectPermissionKeys)[number])).map((item) => [item, true]));
  if (typeof value !== "object") throw new Error("permissions must be an object or array");
  const input = value as Record<string, unknown>;
  return Object.fromEntries(projectPermissionKeys.filter((key) => Object.prototype.hasOwnProperty.call(input, key)).map((key) => [key, input[key] === true]));
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectCode, membershipId } = await context.params;
  if (!isUuid(membershipId)) return jsonError("membershipId must be a UUID");
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const partyId = body.partyId === undefined ? undefined : typeof body.partyId === "string" ? body.partyId : "";
  const roleSlug = body.roleSlug === undefined ? undefined : typeof body.roleSlug === "string" ? body.roleSlug : "";
  const active = body.active === undefined ? undefined : body.active;
  let permissions: Record<string, boolean> | undefined;
  try { permissions = body.permissions === undefined ? undefined : parsePermissions(body.permissions); } catch (error) { return jsonError(error instanceof Error ? error.message : "permissions are invalid"); }
  if (partyId !== undefined && !isUuid(partyId)) return jsonError("partyId must be a UUID");
  if (roleSlug !== undefined && !/^[a-z][a-z0-9_]{2,63}$/.test(roleSlug)) return jsonError("roleSlug is invalid");
  if (active !== undefined && typeof active !== "boolean") return jsonError("active must be boolean");
  if (partyId === undefined && roleSlug === undefined && active === undefined && permissions === undefined) return jsonError("At least one membership field is required");
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, adminRoles, "members.manage");
    const current = await db.query(`SELECT id, user_id AS "userId" FROM project_memberships WHERE id = $1 AND project_id = $2`, [membershipId, membership.projectId]);
    if (!current.rows[0]) return jsonError("Membership not found", 404);
    if (active === false) {
      const role = await db.query<{ roleSlug: string }>(`SELECT role_slug AS "roleSlug" FROM project_memberships WHERE id = $1 AND active`, [membershipId]);
      if (role.rows[0]?.roleSlug === "contractor_pm" || role.rows[0]?.roleSlug === "document_controller") {
        const admins = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM project_memberships WHERE project_id = $1 AND active AND role_slug IN ('contractor_pm', 'document_controller') AND id <> $2`, [membership.projectId, membershipId]);
        if (Number(admins.rows[0]?.count ?? 0) === 0) return jsonError("A project must retain at least one project administrator", 409);
      }
    }
    const valid = await db.query<{ partyType: string; roleSlug: string }>(
      `SELECT pa.party_type AS "partyType", rc.slug AS "roleSlug" FROM project_memberships pm
       JOIN parties pa ON pa.id = COALESCE($2::uuid, pm.party_id)
       JOIN project_parties pp ON pp.project_id = pm.project_id AND pp.party_id = pa.id AND pp.active
       JOIN role_catalog rc ON rc.slug = COALESCE($3::text, pm.role_slug)
       WHERE pm.id = $1 AND pa.active AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM role_catalog r WHERE r.slug = $3))`,
      [membershipId, partyId ?? null, roleSlug ?? null],
    );
    if (!valid.rows[0]) return jsonError("Party or role is not valid", 400);
    if (!rolePartyCompatible(valid.rows[0].roleSlug, valid.rows[0].partyType)) return jsonError("The selected role is not compatible with the party type", 400);
    const result = await db.query(
      `UPDATE project_memberships SET party_id = COALESCE($2, party_id), role_slug = COALESCE($3, role_slug), active = COALESCE($4, active), permissions = COALESCE($5::jsonb, permissions)
       WHERE id = $1
       RETURNING id, project_id AS "projectId", user_id AS "userId", party_id AS "partyId", role_slug AS "roleSlug", permissions, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [membershipId, partyId ?? null, roleSlug ?? null, active ?? null, permissions === undefined ? null : JSON.stringify(permissions)],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'membership.updated', 'project_membership', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, membershipId, JSON.stringify({ partyId, roleSlug, active, permissions }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0] });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return jsonError("That user already has this role in the party", 409);
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectCode, membershipId } = await context.params;
  if (!isUuid(membershipId)) return jsonError("membershipId must be a UUID");
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, adminRoles, "members.manage");
    const current = await db.query<{ roleSlug: string }>(`SELECT role_slug AS "roleSlug" FROM project_memberships WHERE id = $1 AND project_id = $2 AND active`, [membershipId, membership.projectId]);
    if (!current.rows[0]) return jsonError("Membership not found", 404);
    if (current.rows[0].roleSlug === "contractor_pm" || current.rows[0].roleSlug === "document_controller") {
      const admins = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM project_memberships WHERE project_id = $1 AND active AND role_slug IN ('contractor_pm', 'document_controller') AND id <> $2`, [membership.projectId, membershipId]);
      if (Number(admins.rows[0]?.count ?? 0) === 0) return jsonError("A project must retain at least one project administrator", 409);
    }
    const result = await db.query(`UPDATE project_memberships SET active = false WHERE id = $1 AND project_id = $2 RETURNING id, user_id AS "userId", active`, [membershipId, membership.projectId]);
    if (!result.rows[0]) return jsonError("Membership not found", 404);
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'membership.deactivated', 'project_membership', $3, '{}'::jsonb, $4)`,
      [membership.projectId, user.id, membershipId, request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0], deleted: true });
  } catch (error) { return authErrorResponse(error); }
}
