import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../../lib/auth";
import { connectorAdminRoles, connectorPublicSelect, parseConnectorPayload } from "../../../../../../lib/connectors";
import { db } from "../../../../../../lib/db";
import { isUuid, jsonError, parseObjectBody } from "../../../../../../lib/http";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectCode: string; connectorId: string }> };

async function findConnector(projectId: string, connectorId: string) {
  const result = await db.query(`SELECT ${connectorPublicSelect()}, credential_ref AS "credentialRef" FROM project_connectors WHERE project_id = $1 AND id = $2`, [projectId, connectorId]);
  return result.rows[0] ?? null;
}

export async function GET(request: Request, context: RouteContext) {
  const { projectCode, connectorId } = await context.params;
  if (!isUuid(connectorId)) return jsonError("Connector id must be a UUID", 400);
  try {
    const { membership } = await requireProjectMembership(request, projectCode, connectorAdminRoles);
    const connector = await findConnector(membership.projectId, connectorId);
    if (!connector) return jsonError("Connector not found", 404);
    delete connector.credentialRef;
    return NextResponse.json({ data: connector });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectCode, connectorId } = await context.params;
  if (!isUuid(connectorId)) return jsonError("Connector id must be a UUID", 400);
  const body = parseObjectBody(await request.json().catch(() => null));
  if (!body) return jsonError("Request body must be a JSON object");
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, connectorAdminRoles);
    const current = await findConnector(membership.projectId, connectorId);
    if (!current) return jsonError("Connector not found", 404);
    const parsed = parseConnectorPayload(body, current);
    if (parsed instanceof Response) return parsed;
    const result = await db.query(
      `UPDATE project_connectors
          SET name = $1, provider = $2, status = $3, endpoint_url = $4,
              external_drive_id = $5, account_label = $6, config = $7::jsonb,
              credential_ref = $8, updated_by_user_id = $9, last_error = CASE WHEN $3 = 'error' THEN last_error ELSE NULL END
        WHERE id = $10 AND project_id = $11
        RETURNING ${connectorPublicSelect()}`,
      [parsed.name, parsed.provider, parsed.status, parsed.endpointUrl, parsed.externalDriveId, parsed.accountLabel, JSON.stringify(parsed.config), parsed.credentialRef, user.id, connectorId, membership.projectId],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'connector.updated', 'project_connector', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, connectorId, JSON.stringify({ name: parsed.name, provider: parsed.provider, status: parsed.status }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0] });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return jsonError("A connector with this name already exists in the project", 409);
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectCode, connectorId } = await context.params;
  if (!isUuid(connectorId)) return jsonError("Connector id must be a UUID", 400);
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, connectorAdminRoles);
    const current = await findConnector(membership.projectId, connectorId);
    if (!current) return jsonError("Connector not found", 404);
    await db.query("DELETE FROM project_connectors WHERE id = $1 AND project_id = $2", [connectorId, membership.projectId]);
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'connector.deleted', 'project_connector', $3, '{}'::jsonb, $4)`,
      [membership.projectId, user.id, connectorId, request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: { id: connectorId }, deleted: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
