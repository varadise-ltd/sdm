import { NextResponse } from "next/server";
import { authErrorResponse, authMode, projectPermissionKeys, requireProjectMembership, type SdmRole } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { isUuid, jsonError, parseObjectBody } from "../../../../../lib/http";
import { hashLocalPassword, validateLocalPassword } from "../../../../../lib/password";

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
  const search = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  try {
    const { membership } = await requireProjectMembership(request, projectCode, adminRoles, "members.manage");
    const result = await db.query(
      `SELECT u.id, u.email::text AS email, u.display_name AS "displayName", u.external_subject AS "externalSubject", u.active,
              u.created_at AS "createdAt", u.updated_at AS "updatedAt",
              COALESCE(json_agg(json_build_object('membershipId', pm.id, 'partyId', pa.id, 'partyCode', pa.code, 'partyName', pa.name, 'roleSlug', pm.role_slug, 'active', pm.active)) FILTER (WHERE pm.id IS NOT NULL), '[]'::json) AS memberships
       FROM users u
       LEFT JOIN project_memberships pm ON pm.user_id = u.id AND pm.project_id = $1
       LEFT JOIN parties pa ON pa.id = pm.party_id
       WHERE ($2 = '' OR u.email::text ILIKE '%' || $2 || '%' OR u.display_name ILIKE '%' || $2 || '%')
         AND (EXISTS (SELECT 1 FROM project_memberships scoped_pm WHERE scoped_pm.project_id = $1 AND scoped_pm.user_id = u.id)
              OR NOT EXISTS (SELECT 1 FROM project_memberships any_pm WHERE any_pm.user_id = u.id))
       GROUP BY u.id ORDER BY u.active DESC, u.display_name ASC`,
      [membership.projectId, search],
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request, context: RouteContext) {
  const { projectCode } = await context.params;
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const externalSubjectValue = body.externalSubject === undefined || body.externalSubject === null ? "" : typeof body.externalSubject === "string" ? body.externalSubject.trim() : "";
  const externalSubject = externalSubjectValue || null;
  const password = body.password === undefined || body.password === null ? null : typeof body.password === "string" ? body.password : "";
  const rawAssignments = body.assignments ?? body.projectAssignments;
  if (rawAssignments !== undefined && !Array.isArray(rawAssignments)) return jsonError("assignments must be an array");
  let assignments: Array<{ projectCode: string; partyId: string; roleSlug: string; permissions: Record<string, boolean> }> = [];
  try {
    assignments = (Array.isArray(rawAssignments) ? rawAssignments : []).map((item) => {
      if (!item || typeof item !== "object") throw new Error("Each project assignment must be an object");
      const value = item as Record<string, unknown>;
      const targetProjectCode = typeof value.projectCode === "string" ? value.projectCode.trim().toUpperCase() : "";
      const partyId = typeof value.partyId === "string" ? value.partyId : "";
      const roleSlug = typeof value.roleSlug === "string" ? value.roleSlug : "";
      if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(targetProjectCode)) throw new Error("Each assignment needs a valid project code");
      if (!isUuid(partyId)) throw new Error("Each assignment needs a valid party");
      if (!/^[a-z][a-z0-9_]{2,63}$/.test(roleSlug)) throw new Error("Each assignment needs a valid role");
      return { projectCode: targetProjectCode, partyId, roleSlug, permissions: parsePermissions(value.permissions) };
    });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "assignments are invalid"); }
  if (assignments.length === 0) return jsonError("At least one project access assignment is required");
  if (new Set(assignments.map((item) => item.projectCode)).size !== assignments.length) return jsonError("Each project may appear only once in assignments");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return jsonError("email must be a valid address");
  if (displayName.length < 2 || displayName.length > 160) return jsonError("displayName must be 2-160 characters");
  if (externalSubject !== null && (externalSubject.length < 2 || externalSubject.length > 255)) return jsonError("externalSubject must be 2-255 characters when provided");
  if ((authMode === "local" || authMode === "development") && externalSubject === null && password === null) return jsonError("password is required for local users");
  if (password !== null) { const passwordError = validateLocalPassword(password); if (passwordError) return jsonError(passwordError); }
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, adminRoles, "members.manage");
    const passwordHash = password === null ? null : await hashLocalPassword(password);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const targetRows = await client.query<{ id: string; code: string; organizationId: string; actorCanAdmin: boolean }>(
        `SELECT p.id, p.code, p.organization_id AS "organizationId",
                (EXISTS (SELECT 1 FROM project_memberships actor_pm WHERE actor_pm.project_id = p.id AND actor_pm.user_id = $1 AND actor_pm.active AND actor_pm.role_slug = ANY($2::text[]))
                 OR EXISTS (SELECT 1 FROM organization_memberships actor_om WHERE actor_om.organization_id = p.organization_id AND actor_om.user_id = $1 AND actor_om.active AND actor_om.role_slug IN ('org_owner','org_admin'))) AS "actorCanAdmin"
           FROM projects p
          JOIN organizations target_o ON target_o.id = p.organization_id AND target_o.status <> 'closed'
          WHERE p.code = ANY($3::text[]) AND p.status <> 'closed'`,
        [user.id, adminRoles, assignments.map((item) => item.projectCode)],
      );
      const projectsByCode = new Map(targetRows.rows.map((item) => [item.code, item]));
      for (const assignment of assignments) {
        const target = projectsByCode.get(assignment.projectCode);
        if (!target || !target.actorCanAdmin) throw new Error(`You do not have administration access to project ${assignment.projectCode}`);
        const party = await client.query<{ partyType: string; active: boolean }>(
          `SELECT pa.party_type AS "partyType", pa.active FROM parties pa JOIN project_parties pp ON pp.party_id = pa.id AND pp.project_id = $1 AND pp.active WHERE pa.id = $2`,
          [target.id, assignment.partyId],
        );
        if (!party.rows[0]?.active || !rolePartyCompatible(assignment.roleSlug, party.rows[0].partyType)) throw new Error(`Party and role are not compatible for project ${assignment.projectCode}`);
      }
      const result = await client.query(
        `INSERT INTO users (email, display_name, external_subject, password_hash, password_updated_at) VALUES ($1, $2, $3, $4::text, CASE WHEN $4::text IS NULL THEN NULL ELSE now() END)
         RETURNING id, email::text AS email, display_name AS "displayName", external_subject AS "externalSubject", active, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [email, displayName, externalSubject, passwordHash],
      );
      const newUserId = result.rows[0].id as string;
      for (const assignment of assignments) {
        const target = projectsByCode.get(assignment.projectCode)!;
        await client.query(`INSERT INTO organization_memberships (organization_id, user_id, role_slug) VALUES ($1, $2, 'org_member') ON CONFLICT (organization_id, user_id) DO UPDATE SET active = true`, [target.organizationId, newUserId]);
        await client.query(
          `INSERT INTO project_memberships (project_id, user_id, party_id, role_slug, permissions) VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [target.id, newUserId, assignment.partyId, assignment.roleSlug, JSON.stringify(assignment.permissions)],
        );
        await client.query(
          `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
           VALUES ($1, $2, 'membership.created', 'project_membership', $3, $4::jsonb, $5)`,
          [target.id, user.id, newUserId, JSON.stringify({ userId: newUserId, projectCode: target.code, partyId: assignment.partyId, roleSlug: assignment.roleSlug, permissions: assignment.permissions, provisioned: true }), request.headers.get("x-request-id")],
        );
      }
      await client.query(
        `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
         VALUES ($1, $2, 'user.provisioned', 'user', $3, $4::jsonb, $5)`,
        [membership.projectId, user.id, newUserId, JSON.stringify({ email, displayName, externalSubject, passwordConfigured: Boolean(passwordHash), assignments: assignments.map((item) => ({ projectCode: item.projectCode, roleSlug: item.roleSlug, partyId: item.partyId, permissions: item.permissions })) }), request.headers.get("x-request-id")],
      );
      await client.query("COMMIT");
      return NextResponse.json({ data: { ...result.rows[0], assignments } }, { status: 201 });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return jsonError("A user with this email or external subject already exists", 409);
    if (error instanceof Error && /^(You do not have administration access|Party and role are not compatible)/.test(error.message)) return jsonError(error.message, 403);
    return authErrorResponse(error);
  }
}
