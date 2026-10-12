import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";
import { isUuid, jsonError, parseObjectBody } from "../../../../../../lib/http";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectCode: string; partyId: string }> };
const adminRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];
const partyTypes = ["contractor", "client", "subcontractor", "supplier", "design_consultant", "other"] as const;

async function getParty(projectId: string, partyId: string) {
  const result = await db.query(
    `SELECT pa.id, pa.code, pa.name, pa.party_type AS "partyType", pa.active,
            pa.parent_party_id AS "parentPartyId", pa.created_at AS "createdAt", pa.updated_at AS "updatedAt"
     FROM parties pa JOIN project_parties pp ON pp.party_id = pa.id AND pp.project_id = $2 AND pp.active
      WHERE pa.id = $1`,
    [partyId, projectId],
  );
  return result.rows[0] ?? null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectCode, partyId } = await context.params;
  if (!isUuid(partyId)) return jsonError("partyId must be a UUID", 400);
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const name = body.name === undefined ? undefined : typeof body.name === "string" ? body.name.trim() : "";
  const partyType = body.partyType === undefined ? undefined : typeof body.partyType === "string" ? body.partyType : "";
  const active = body.active === undefined ? undefined : body.active;
  if (name !== undefined && (name.length < 2 || name.length > 160)) return jsonError("name must be 2-160 characters");
  if (partyType !== undefined && !partyTypes.includes(partyType as (typeof partyTypes)[number])) return jsonError("partyType is invalid");
  if (active !== undefined && typeof active !== "boolean") return jsonError("active must be boolean");
  if (name === undefined && partyType === undefined && active === undefined) return jsonError("At least one party field is required");
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, adminRoles, "members.manage");
    const current = await getParty(membership.projectId, partyId);
    if (!current) return jsonError("Party not found in project", 404);
    const result = await db.query(
      `UPDATE parties SET name = COALESCE($2, name), party_type = COALESCE($3, party_type), active = COALESCE($4, active)
       WHERE id = $1
       RETURNING id, code, name, party_type AS "partyType", active, parent_party_id AS "parentPartyId", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [partyId, name ?? null, partyType ?? null, active ?? null],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'party.updated', 'party', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, partyId, JSON.stringify({ name, partyType, active }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) { return authErrorResponse(error); }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectCode, partyId } = await context.params;
  if (!isUuid(partyId)) return jsonError("partyId must be a UUID", 400);
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, adminRoles, "members.manage");
    const current = await getParty(membership.projectId, partyId);
    if (!current) return jsonError("Party not found in project", 404);
    const assigned = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM project_memberships WHERE project_id = $1 AND party_id = $2 AND active`, [membership.projectId, partyId]);
    if (Number(assigned.rows[0]?.count ?? 0) > 0) return jsonError("Remove or deactivate active memberships before deactivating this party", 409);
    const result = await db.query(`UPDATE parties SET active = false WHERE id = $1 RETURNING id, code, name, active`, [partyId]);
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'party.deactivated', 'party', $3, '{}'::jsonb, $4)`,
      [membership.projectId, user.id, partyId, request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0], deleted: true });
  } catch (error) { return authErrorResponse(error); }
}
