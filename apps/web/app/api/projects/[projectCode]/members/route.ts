import { NextResponse } from "next/server";
import { authErrorResponse, projectPermissionKeys, requireProjectMembership, type SdmRole } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { isUuid, jsonError, parseObjectBody } from "../../../../../lib/http";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectCode: string }> };
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

export async function GET(request: Request, context: RouteContext) {
  const { projectCode } = await context.params;
  try {
    const { membership } = await requireProjectMembership(request, projectCode, adminRoles, "members.manage");
    const [members, roles, parties, users] = await Promise.all([
      db.query(
        `SELECT pm.id, pm.user_id AS "userId", u.email::text AS email, u.display_name AS "displayName", u.active AS "userActive",
                pm.party_id AS "partyId", pa.code AS "partyCode", pa.name AS "partyName", pm.role_slug AS "roleSlug", pm.active,
                pm.permissions,
                pm.created_at AS "createdAt", pm.updated_at AS "updatedAt"
         FROM project_memberships pm JOIN users u ON u.id = pm.user_id JOIN parties pa ON pa.id = pm.party_id
         WHERE pm.project_id = $1 ORDER BY pm.active DESC, u.display_name ASC`, [membership.projectId],
      ),
      db.query(`SELECT slug, display_name AS "displayName", description, is_client_role AS "isClientRole" FROM role_catalog ORDER BY display_name`),
      db.query(`SELECT pa.id, pa.code, pa.name, pa.party_type AS "partyType", pa.active
                  FROM parties pa JOIN project_parties pp ON pp.party_id = pa.id
                 WHERE pp.project_id = $1 AND pp.active ORDER BY pa.active DESC, pa.name ASC`, [membership.projectId]),
      db.query(`SELECT u.id, u.email::text AS email, u.display_name AS "displayName", u.active
                  FROM users u
                 WHERE EXISTS (SELECT 1 FROM project_memberships scoped_pm WHERE scoped_pm.project_id = $1 AND scoped_pm.user_id = u.id)
                    OR NOT EXISTS (SELECT 1 FROM project_memberships any_pm WHERE any_pm.user_id = u.id)
                 ORDER BY u.active DESC, u.display_name ASC`, [membership.projectId]),
    ]);
    return NextResponse.json({ data: members.rows, roles: roles.rows, parties: parties.rows, users: users.rows });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request, context: RouteContext) {
  const { projectCode } = await context.params;
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const userId = typeof body.userId === "string" ? body.userId : "";
  const partyId = typeof body.partyId === "string" ? body.partyId : "";
  const roleSlug = typeof body.roleSlug === "string" ? body.roleSlug : "";
  let permissions: Record<string, boolean>;
  try { permissions = parsePermissions(body.permissions); } catch (error) { return jsonError(error instanceof Error ? error.message : "permissions are invalid"); }
  if (!isUuid(userId) || !isUuid(partyId)) return jsonError("userId and partyId must be UUIDs");
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(roleSlug)) return jsonError("roleSlug is invalid");
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, adminRoles, "members.manage");
    const valid = await db.query(
      `SELECT u.id AS "userId", pa.id AS "partyId", pa.party_type AS "partyType", rc.slug
       FROM users u CROSS JOIN parties pa CROSS JOIN role_catalog rc
       WHERE u.id = $1 AND u.active AND pa.id = $2 AND pa.active AND rc.slug = $3
         AND EXISTS (SELECT 1 FROM project_parties pp WHERE pp.project_id = $4 AND pp.party_id = pa.id AND pp.active)`, [userId, partyId, roleSlug, membership.projectId],
    );
    if (!valid.rows[0]) return jsonError("Active user, party, and role are required", 400);
    if (!rolePartyCompatible(roleSlug, valid.rows[0].partyType)) return jsonError("The selected role is not compatible with the party type", 400);
    // Every project grant also creates the user's organization membership. This
    // keeps organization scope and project scope consistent when an existing
    // user is added later, instead of only when the user is first provisioned.
    await db.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role_slug)
         SELECT organization_id, $2, 'org_member' FROM projects WHERE id = $1
       ON CONFLICT (organization_id, user_id) DO UPDATE SET active = true`,
      [membership.projectId, userId],
    );
    const result = await db.query(
      `INSERT INTO project_memberships (project_id, user_id, party_id, role_slug, permissions) VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, project_id AS "projectId", user_id AS "userId", party_id AS "partyId", role_slug AS "roleSlug", permissions, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [membership.projectId, userId, partyId, roleSlug, JSON.stringify(permissions)],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'membership.created', 'project_membership', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, result.rows[0].id, JSON.stringify({ userId, partyId, roleSlug, permissions }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return jsonError("That user already has this role in the party", 409);
    return authErrorResponse(error);
  }
}
