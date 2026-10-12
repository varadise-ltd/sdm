import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { membership } = await requireProjectMembership(request, projectCode, undefined, "documents.read");
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 200);
    const result = await db.query(
      `SELECT ae.id, ae.event_type AS "eventType", ae.entity_type AS "entityType", ae.entity_id AS "entityId",
              ae.payload, ae.occurred_at AS "occurredAt", u.display_name AS "actorName"
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.actor_user_id
       WHERE ae.project_id = $1
         AND ($2::text IS NULL OR ae.entity_type = $2)
         AND ($3::uuid IS NULL OR ae.entity_id = $3::uuid)
       ORDER BY ae.occurred_at DESC LIMIT $4`,
      [membership.projectId, entityType || null, entityId && /^[0-9a-f-]{36}$/i.test(entityId) ? entityId : null, limit],
    );
    return NextResponse.json({ data: result.rows, project: membership.projectCode });
  } catch (error) {
    return authErrorResponse(error);
  }
}
