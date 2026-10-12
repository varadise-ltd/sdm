import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../../lib/auth";
import { db } from "../../../../../../../lib/db";

export const runtime = "nodejs";

const sendRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];

export async function POST(request: Request, context: { params: Promise<{ projectCode: string; transmittalId: string }> }) {
  try {
    const { projectCode, transmittalId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, sendRoles);
    if (!/^[0-9a-f-]{36}$/i.test(transmittalId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Transmittal not found" } }, { status: 404 });
    const result = await db.query(
      `UPDATE transmittals
       SET status = 'sent', sent_at = now()
       WHERE id = $1 AND project_id = $2 AND status = 'draft'
         AND (sender_party_id = $3::uuid OR $4::text = 'document_controller')
       RETURNING id, transmittal_number AS "transmittalNumber", status, sent_at AS "sentAt"`,
      [transmittalId, membership.projectId, membership.partyId, membership.roleSlug],
    );
    if (result.rowCount === 0) return NextResponse.json({ error: { code: "INVALID_STATE", message: "Only draft transmittals can be sent" } }, { status: 409 });
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'transmittal.sent', 'transmittal', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, transmittalId, JSON.stringify({ transmittalNumber: result.rows[0].transmittalNumber }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    return authErrorResponse(error);
  }
}
