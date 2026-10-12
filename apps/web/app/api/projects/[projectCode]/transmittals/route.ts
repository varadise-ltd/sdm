import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";

export const runtime = "nodejs";

const createRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];

export async function GET(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { membership } = await requireProjectMembership(request, projectCode);
    const result = await db.query(
      `
        SELECT t.id, t.transmittal_number AS "transmittalNumber", t.direction,
               t.status, t.subject, t.sender_party_id AS "senderPartyId",
               sender.code AS "senderPartyCode", t.recipient_party_id AS "recipientPartyId",
               recipient.code AS "recipientPartyCode", t.sent_at AS "sentAt",
               t.received_at AS "receivedAt", t.created_at AS "createdAt",
               count(ti.id)::integer AS "itemCount"
        FROM transmittals t
        JOIN parties sender ON sender.id = t.sender_party_id
        JOIN parties recipient ON recipient.id = t.recipient_party_id
        LEFT JOIN transmittal_items ti ON ti.transmittal_id = t.id
        WHERE t.project_id = $1
          AND (
            $3::text = 'document_controller'
            OR t.sender_party_id = $2::uuid
            OR t.recipient_party_id = $2::uuid
          )
        GROUP BY t.id, sender.code, recipient.code
        ORDER BY t.created_at DESC
      `,
      [membership.projectId, membership.partyId, membership.roleSlug],
    );
    return NextResponse.json({ data: result.rows, project: projectCode });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  const client = await db.connect();
  try {
    const { projectCode } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, createRoles);
    const body = (await request.json()) as Record<string, unknown>;
    const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 500) : "";
    const recipientPartyCode = typeof body.recipientPartyCode === "string" ? body.recipientPartyCode.trim().toUpperCase() : "";
    const revisionIds = Array.isArray(body.revisionIds) ? body.revisionIds.filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)) : [];
    if (!subject || !recipientPartyCode || revisionIds.length === 0 || revisionIds.length > 500) {
      return NextResponse.json({ error: { code: "INVALID_TRANSMITTAL", message: "subject, recipientPartyCode and at least one revisionId are required" } }, { status: 400 });
    }

    await client.query("BEGIN");
    const recipient = await client.query<{ id: string }>(
      `SELECT pa.id FROM parties pa
       JOIN project_memberships pm ON pm.party_id = pa.id AND pm.project_id = $1 AND pm.active = true
       WHERE pa.code = $2 AND pa.active = true LIMIT 1`,
      [membership.projectId, recipientPartyCode],
    );
    if (!recipient.rows[0] || recipient.rows[0].id === membership.partyId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "INVALID_RECIPIENT", message: "Recipient party is not available for this project" } }, { status: 400 });
    }
    const revisionCheck = await client.query<{ id: string; workflowStatus: string }>(
      `SELECT r.id FROM document_revisions r JOIN containers c ON c.id = r.container_id
       WHERE r.id = ANY($1::uuid[]) AND c.project_id = $2 AND r.is_current = true
         AND r.workflow_status IN ('submitted', 'approved')`,
      [revisionIds, membership.projectId],
    );
    if (revisionCheck.rowCount !== revisionIds.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "INVALID_REVISIONS", message: "Every revision must be a current revision in this project" } }, { status: 400 });
    }
    const sequence = await client.query<{ value: string }>("SELECT sdm_next_sequence($1, 'transmittal')::text AS value", [membership.projectId]);
    const number = `TRN-${projectCode.toUpperCase()}-${String(sequence.rows[0].value).padStart(4, "0")}`;
    const transmittal = await client.query<{ id: string }>(
      `INSERT INTO transmittals (project_id, transmittal_number, direction, sender_party_id, recipient_party_id, created_by_user_id, subject)
       VALUES ($1, $2, 'outgoing', $3, $4, $5, $6) RETURNING id`,
      [membership.projectId, number, membership.partyId, recipient.rows[0].id, user.id, subject],
    );
    await client.query(
      `INSERT INTO transmittal_items (transmittal_id, revision_id, item_order)
       SELECT $1, value::uuid, row_number() OVER ()::integer FROM unnest($2::uuid[]) AS value`,
      [transmittal.rows[0].id, revisionIds],
    );
    await client.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'transmittal.created', 'transmittal', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, transmittal.rows[0].id, JSON.stringify({ transmittalNumber: number, revisionIds }), request.headers.get("x-request-id")],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: { id: transmittal.rows[0].id, transmittalNumber: number, status: "draft", direction: "outgoing", revisionIds } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(error);
  } finally {
    client.release();
  }
}
