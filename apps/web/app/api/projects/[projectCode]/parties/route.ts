import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { jsonError, parseObjectBody } from "../../../../../lib/http";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectCode: string }> };
const adminRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];
const partyTypes = ["contractor", "client", "subcontractor", "supplier", "design_consultant", "other"] as const;

export async function GET(request: Request, context: RouteContext) {
  const { projectCode } = await context.params;
  try {
    const { membership } = await requireProjectMembership(request, projectCode, adminRoles, "members.manage");
    const result = await db.query(
      `SELECT pa.id, pa.code, pa.name, pa.party_type AS "partyType", pa.active,
              pa.parent_party_id AS "parentPartyId", pa.created_at AS "createdAt", pa.updated_at AS "updatedAt",
              COUNT(pm.id)::integer AS "memberCount"
       FROM parties pa
       JOIN project_parties pp ON pp.party_id = pa.id AND pp.project_id = $1 AND pp.active
       LEFT JOIN project_memberships pm ON pm.party_id = pa.id AND pm.project_id = $1 AND pm.active
       GROUP BY pa.id ORDER BY pa.active DESC, pa.name ASC`,
      [membership.projectId],
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request, context: RouteContext) {
  const { projectCode } = await context.params;
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const partyType = typeof body.partyType === "string" ? body.partyType : "";
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) return jsonError("code must contain 2-32 uppercase letters, numbers, hyphens, or underscores");
  if (name.length < 2 || name.length > 160) return jsonError("name must be 2-160 characters");
  if (!partyTypes.includes(partyType as (typeof partyTypes)[number])) return jsonError("partyType is invalid");
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, adminRoles, "members.manage");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO parties (code, name, party_type) VALUES ($1, $2, $3)
         RETURNING id, code, name, party_type AS "partyType", active, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [code, name, partyType],
      );
      await client.query(
        `INSERT INTO project_parties (project_id, party_id) VALUES ($1, $2)`,
        [membership.projectId, result.rows[0].id],
      );
      await client.query(
        `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
         VALUES ($1, $2, 'party.created', 'party', $3, $4::jsonb, $5)`,
        [membership.projectId, user.id, result.rows[0].id, JSON.stringify({ code, name, partyType }), request.headers.get("x-request-id")],
      );
      await client.query("COMMIT");
      return NextResponse.json({ data: result.rows[0] }, { status: 201 });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return jsonError("A party with this code already exists", 409);
    return authErrorResponse(error);
  }
}
