import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ containerId: string }> }) {
  try {
    const { containerId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(containerId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Document not found" } }, { status: 404 });
    const lookup = await db.query<{ projectCode: string }>(
      `SELECT p.code AS "projectCode" FROM containers c JOIN projects p ON p.id = c.project_id WHERE c.id = $1`, [containerId],
    );
    if (!lookup.rows[0]) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Document not found" } }, { status: 404 });
    const { membership, user } = await requireProjectMembership(request, lookup.rows[0].projectCode, undefined, "documents.read");
    const result = await db.query(
      `SELECT r.id, r.revision_code AS "revisionCode", r.revision_sequence AS "revisionSequence",
              r.suitability_code AS "suitabilityCode", r.client_response_code AS "clientResponseCode",
              r.cde_state AS "cdeState", r.workflow_status AS "workflowStatus", r.metadata,
              r.submitted_at AS "submittedAt", r.published_at AS "publishedAt", r.created_at AS "createdAt",
              r.updated_at AS "updatedAt", r.is_current AS "isCurrent",
              sr.revision_code AS "supersedesRevisionCode",
              u.display_name AS "submittedBy",
              (SELECT count(*)::int FROM revision_files rf WHERE rf.revision_id = r.id) AS "fileCount"
       FROM document_revisions r
       JOIN containers c ON c.id = r.container_id
       LEFT JOIN document_revisions sr ON sr.id = r.supersedes_revision_id
       LEFT JOIN users u ON u.id = r.submitted_by_user_id
       WHERE r.container_id = $1
         AND ($2::text = 'document_controller' OR c.is_internal = false OR c.originator_party_id = $3::uuid)
       ORDER BY r.revision_sequence DESC`,
      [containerId, membership.roleSlug, membership.partyId],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload)
       VALUES ($1, $2, 'container.revisions.viewed', 'container', $3, '{}'::jsonb)`,
      [membership.projectId, user.id, containerId],
    );
    return NextResponse.json({ data: result.rows, containerId });
  } catch (error) { return authErrorResponse(error); }
}
