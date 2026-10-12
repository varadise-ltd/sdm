import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";

export const runtime = "nodejs";

const responseCodes = new Set(["A", "C", "D"]);

export async function POST(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  const client = await db.connect();
  try {
    const { projectCode } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, ["client_re_er"], "documents.approve");
    const body = (await request.json()) as Record<string, unknown>;
    const transmittalItemId = typeof body.transmittalItemId === "string" ? body.transmittalItemId : "";
    const responseCode = typeof body.responseCode === "string" ? body.responseCode.toUpperCase() : "";
    const comments = typeof body.comments === "string" ? body.comments.trim().slice(0, 4000) : null;
    if (!/^[0-9a-f-]{36}$/i.test(transmittalItemId) || !responseCodes.has(responseCode)) {
      return NextResponse.json({ error: { code: "INVALID_DECISION", message: "transmittalItemId and responseCode A, C, or D are required" } }, { status: 400 });
    }

    await client.query("BEGIN");
    const item = await client.query<{ revisionId: string; transmittalId: string; cdeState: string; isDrawing: boolean; workflowStatus: string | null }>(
      `
        SELECT ti.revision_id AS "revisionId", ti.transmittal_id AS "transmittalId",
               r.cde_state AS "cdeState", c.is_drawing AS "isDrawing", wi.status AS "workflowStatus"
        FROM transmittal_items ti
        JOIN transmittals t ON t.id = ti.transmittal_id AND t.project_id = $2
          AND t.recipient_party_id = $3 AND t.status IN ('sent', 'received', 'closed')
        JOIN document_revisions r ON r.id = ti.revision_id
        JOIN containers c ON c.id = r.container_id
        LEFT JOIN workflow_instances wi ON wi.revision_id = r.id
        WHERE ti.id = $1
        FOR UPDATE OF ti, r
      `,
      [transmittalItemId, membership.projectId, membership.partyId],
    );
    const target = item.rows[0];
    if (!target) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Transmittal item not found" } }, { status: 404 });
    }
    if (target.workflowStatus !== "completed") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "WORKFLOW_INCOMPLETE", message: "All assigned workflow signatures must be completed before a client response" } }, { status: 409 });
    }

    const endorsement = target.isDrawing && responseCode === "A"
      ? await client.query<{ pending: boolean; endorsed: boolean }>(
          `SELECT
             EXISTS (SELECT 1 FROM drawing_endorsements WHERE revision_id = $1 AND status IN ('pending', 'rejected')) AS pending,
             EXISTS (SELECT 1 FROM drawing_endorsements WHERE revision_id = $1 AND status = 'endorsed') AS endorsed`,
          [target.revisionId],
        )
      : { rows: [{ pending: false, endorsed: true }] };
    if (endorsement.rows[0].pending) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "ENDORSEMENT_REQUIRED", message: "Drawing endorsements must be complete before Client acceptance" } }, { status: 409 });
    }
    if (target.isDrawing && responseCode === "A" && !endorsement.rows[0].endorsed) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "ENDORSEMENT_REQUIRED", message: "At least one Independent Design Checker (IDC), Independent Checking Engineer (ICE), or Client drawing endorsement is required before acceptance" } }, { status: 409 });
    }

    const suitability = responseCode === "A" ? "A" : "S3";
    const cdeState = responseCode === "A" ? "Published" : "Shared";
    const workflowStatus = responseCode === "A" ? "published" : "returned";
    await client.query(
      `INSERT INTO client_decisions (transmittal_item_id, revision_id, response_code, resulting_suitability, response_comments, responded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [transmittalItemId, target.revisionId, responseCode, suitability, comments, user.id],
    );
    await client.query(
      `UPDATE document_revisions
       SET suitability_code = $1, client_response_code = $2, cde_state = $3,
           workflow_status = $4, published_at = CASE WHEN $4 = 'published' THEN now() ELSE NULL END
       WHERE id = $5`,
      [suitability, responseCode, cdeState, workflowStatus, target.revisionId],
    );
    await client.query(
      `UPDATE workflow_instances
       SET status = $1,
           completed_at = CASE WHEN $1 = 'completed' THEN now() ELSE NULL END
       WHERE revision_id = $2`,
      [responseCode === "A" ? "completed" : "returned", target.revisionId],
    );
    if (responseCode === "A") {
      await client.query("UPDATE transmittals SET status = 'received', received_at = now(), sent_at = COALESCE(sent_at, now()) WHERE id = $1", [target.transmittalId]);
    }
    await client.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'client.decision.recorded', 'revision', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, target.revisionId, JSON.stringify({ responseCode, suitability, cdeState, transmittalItemId }), request.headers.get("x-request-id")],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: { revisionId: target.revisionId, responseCode, suitabilityCode: suitability, cdeState, workflowStatus } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(error);
  } finally {
    client.release();
  }
}
