import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../lib/auth";
import { connectorAdminRoles, connectorPublicSelect, parseConnectorPayload } from "../../../../../lib/connectors";
import { db } from "../../../../../lib/db";
import { jsonError, parseObjectBody } from "../../../../../lib/http";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectCode: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { projectCode } = await context.params;
  try {
    const { membership } = await requireProjectMembership(request, projectCode, connectorAdminRoles);
    const result = await db.query(`SELECT ${connectorPublicSelect()} FROM project_connectors WHERE project_id = $1 ORDER BY name ASC`, [membership.projectId]);
    return NextResponse.json({ data: result.rows, project: projectCode.toUpperCase() });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { projectCode } = await context.params;
  const body = parseObjectBody(await request.json().catch(() => null));
  if (!body) return jsonError("Request body must be a JSON object");
  const parsed = parseConnectorPayload(body);
  if (parsed instanceof Response) return parsed;
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, connectorAdminRoles);
    const result = await db.query(
      `INSERT INTO project_connectors
         (project_id, name, provider, status, endpoint_url, external_drive_id, account_label, config, credential_ref, created_by_user_id, updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $10)
       RETURNING ${connectorPublicSelect()}`,
      [membership.projectId, parsed.name, parsed.provider, parsed.status, parsed.endpointUrl, parsed.externalDriveId, parsed.accountLabel, JSON.stringify(parsed.config), parsed.credentialRef, user.id],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'connector.created', 'project_connector', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, result.rows[0].id, JSON.stringify({ name: parsed.name, provider: parsed.provider, status: parsed.status }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return jsonError("A connector with this name already exists in the project", 409);
    return authErrorResponse(error);
  }
}
