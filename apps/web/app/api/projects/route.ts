import { NextResponse } from "next/server";
import { authErrorResponse, getCurrentUser } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { jsonError, parseObjectBody } from "../../../lib/http";

export const runtime = "nodejs";

function rolePartyCompatible(roleSlug: string, partyType: string): boolean {
  if (["contractor_pm", "document_controller"].includes(roleSlug)) return partyType === "contractor";
  if (roleSlug === "client_re_er") return partyType === "client";
  if (roleSlug === "design_consultant") return partyType === "design_consultant";
  if (roleSlug === "subcontractor") return partyType === "subcontractor";
  if (roleSlug === "supplier") return partyType === "supplier";
  return true;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const result = await db.query(`
    SELECT * FROM (
      SELECT DISTINCT ON (p.id)
        p.id,
        p.code,
        p.name,
        p.timezone,
        p.status,
        p.organization_id AS "organizationId",
        o.code AS "organizationCode",
        o.name AS "organizationName",
        om.role_slug AS "organizationRole",
        pm.role_slug AS "roleSlug",
        pm.permissions,
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt"
      FROM projects p
      JOIN organizations o ON o.id = p.organization_id
      LEFT JOIN project_memberships pm ON pm.project_id = p.id AND pm.user_id = $1 AND pm.active = true
      JOIN organization_memberships om ON om.organization_id = p.organization_id AND om.user_id = $1 AND om.active
      WHERE (pm.user_id IS NOT NULL OR om.role_slug IN ('org_owner', 'org_admin'))
        AND p.status <> 'closed' AND o.status <> 'closed'
      ORDER BY p.id, pm.created_at ASC NULLS LAST
    ) available_projects
    ORDER BY "organizationName", name
  `, [user.id]);

    return NextResponse.json({ data: result.rows });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "Asia/Hong_Kong";
  const partyId = typeof body.partyId === "string" ? body.partyId : "";
  const roleSlug = typeof body.roleSlug === "string" ? body.roleSlug : "";
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return jsonError("organizationId must be a UUID");
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) return jsonError("code must contain 2-32 uppercase letters, numbers, hyphens, or underscores");
  if (name.length < 2 || name.length > 160) return jsonError("name must be 2-160 characters");
  if (!/^[0-9a-f-]{36}$/i.test(partyId) || !/^[a-z][a-z0-9_]{2,63}$/.test(roleSlug)) return jsonError("partyId and roleSlug are required");
  try {
    const user = await getCurrentUser(request);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const org = await client.query(`SELECT o.id FROM organizations o JOIN organization_memberships om ON om.organization_id = o.id WHERE o.id = $1 AND o.status = 'active' AND om.user_id = $2 AND om.active AND om.role_slug IN ('org_owner','org_admin')`, [organizationId, user.id]);
      if (!org.rows[0]) { await client.query("ROLLBACK"); return jsonError("Organization not found or access is not permitted", 403); }
      const validParty = await client.query<{ partyType: string }>(
        `SELECT pa.party_type AS "partyType" FROM parties pa WHERE pa.id = $1 AND pa.active`,
        [partyId],
      );
      if (!validParty.rows[0]) { await client.query("ROLLBACK"); return jsonError("An active party is required", 400); }
      const validRole = await client.query(`SELECT 1 FROM role_catalog WHERE slug = $1`, [roleSlug]);
      if (!validRole.rows[0]) { await client.query("ROLLBACK"); return jsonError("The selected project role does not exist", 400); }
      if (!rolePartyCompatible(roleSlug, validParty.rows[0].partyType)) {
        await client.query("ROLLBACK");
        return jsonError("The selected project role is not compatible with the initial party", 400);
      }
      const created = await client.query(`INSERT INTO projects (organization_id, code, name, timezone) VALUES ($1, $2, $3, $4) RETURNING id, code, name, timezone, status, organization_id AS "organizationId", created_at AS "createdAt", updated_at AS "updatedAt"`, [organizationId, code, name, timezone]);
      const project = created.rows[0];
      await client.query(`INSERT INTO project_parties (project_id, party_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [project.id, partyId]);
      await client.query(`INSERT INTO organization_memberships (organization_id, user_id, role_slug) VALUES ($1, $2, 'org_member') ON CONFLICT (organization_id, user_id) DO UPDATE SET active = true`, [organizationId, user.id]);
      await client.query(`INSERT INTO project_memberships (project_id, user_id, party_id, role_slug) VALUES ($1, $2, $3, $4)`, [project.id, user.id, partyId, roleSlug]);
      await client.query(`INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id) VALUES ($1, $2, 'project.created', 'project', $1, $3::jsonb, $4)`, [project.id, user.id, JSON.stringify({ code, name, organizationId, roleSlug, partyId }), request.headers.get("x-request-id")]);
      await client.query("COMMIT");
      return NextResponse.json({ data: { ...project, organizationId } }, { status: 201 });
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return jsonError("A project with this code already exists", 409);
    return authErrorResponse(error);
  }
}
