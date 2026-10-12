import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { isUuid, jsonError, parseObjectBody } from "../../../../../lib/http";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode);
    const result = await db.query(
      `SELECT t.id, t.task_type AS "taskType", t.target_type AS "targetType", t.target_id AS "targetId",
              t.status, t.due_at AS "dueAt", t.completed_at AS "completedAt", t.created_at AS "createdAt",
              COALESCE(c.title, direct_c.title, direct_rev_c.title) AS "targetTitle", COALESCE(c.document_number, c.container_number, direct_c.document_number, direct_c.container_number, direct_rev_c.document_number, direct_rev_c.container_number) AS "containerNumber"
       FROM tasks t
       LEFT JOIN workflow_steps ws ON ws.id = t.target_id AND t.target_type = 'workflow_step'
       LEFT JOIN workflow_instances wi ON wi.id = ws.workflow_instance_id
       LEFT JOIN document_revisions r ON r.id = wi.revision_id
       LEFT JOIN containers c ON c.id = r.container_id
       LEFT JOIN containers direct_c ON direct_c.id = t.target_id AND t.target_type = 'container'
       LEFT JOIN document_revisions direct_r ON direct_r.id = t.target_id AND t.target_type = 'revision'
       LEFT JOIN containers direct_rev_c ON direct_rev_c.id = direct_r.container_id
       WHERE t.project_id = $1
         AND (t.assignee_user_id = $2 OR t.assignee_party_id = $3 OR $4::text = 'document_controller')
         AND (COALESCE(c.id, direct_c.id, direct_rev_c.id) IS NULL OR COALESCE(c.is_internal, direct_c.is_internal, direct_rev_c.is_internal) = false OR COALESCE(c.originator_party_id, direct_c.originator_party_id, direct_rev_c.originator_party_id) = $3 OR $4::text = 'document_controller')
       ORDER BY t.status = 'open' DESC, t.due_at NULLS LAST, t.created_at DESC
       LIMIT 200`,
      [membership.projectId, user.id, membership.partyId, membership.roleSlug],
    );
    return NextResponse.json({ data: result.rows, project: membership.projectCode });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  const { projectCode } = await context.params;
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const targetType = body.targetType === undefined ? "container" : typeof body.targetType === "string" ? body.targetType : "";
  const targetId = typeof body.targetId === "string" ? body.targetId : "";
  const taskType = typeof body.taskType === "string" && body.taskType.trim() ? body.taskType.trim() : "request_changes";
  const message = typeof body.message === "string" ? body.message.trim() : typeof body.comment === "string" ? body.comment.trim() : "";
  const assigneeUserId = body.assigneeUserId === undefined || body.assigneeUserId === null ? null : typeof body.assigneeUserId === "string" ? body.assigneeUserId : "";
  const assigneePartyId = body.assigneePartyId === undefined || body.assigneePartyId === null ? null : typeof body.assigneePartyId === "string" ? body.assigneePartyId : "";
  if (!isUuid(targetId)) return jsonError("targetId must be a UUID");
  if (!["container", "revision"].includes(targetType) || !/^[a-z][a-z0-9_.-]{2,63}$/.test(taskType)) return jsonError("targetType or taskType is invalid");
  if (message.length > 2000) return jsonError("message must be at most 2000 characters");
  if (assigneeUserId !== null && !isUuid(assigneeUserId)) return jsonError("assigneeUserId must be a UUID");
  if (assigneePartyId !== null && !isUuid(assigneePartyId)) return jsonError("assigneePartyId must be a UUID");
  if (assigneeUserId !== null && assigneePartyId !== null) return jsonError("Choose a user or party assignee, not both");
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode);
    const target = await db.query<{ id: string; originatorPartyId: string; isInternal: boolean }>(
      `SELECT c.id, c.originator_party_id AS "originatorPartyId", c.is_internal AS "isInternal"
       FROM containers c WHERE c.id = $1 AND c.project_id = $2 AND $3 = 'container'
       UNION ALL
       SELECT c.id, c.originator_party_id AS "originatorPartyId", c.is_internal AS "isInternal"
       FROM document_revisions r JOIN containers c ON c.id = r.container_id
       WHERE r.id = $1 AND c.project_id = $2 AND $3 = 'revision'`, [targetId, membership.projectId, targetType],
    );
    if (!target.rows[0]) return jsonError("Target document not found", 404);
    if (target.rows[0].isInternal && target.rows[0].originatorPartyId !== membership.partyId && membership.roleSlug !== "document_controller") return jsonError("Target document is internal to another party", 403);
    const resolvedParty = assigneePartyId ?? target.rows[0].originatorPartyId;
    const assignee = await db.query(`SELECT 1 FROM parties pa
      WHERE pa.id = $1 AND pa.active
        AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM users u JOIN project_memberships pm ON pm.user_id = u.id WHERE u.id = $2 AND u.active AND pm.project_id = $3 AND pm.party_id = $1 AND pm.active))`, [resolvedParty, assigneeUserId, membership.projectId]);
    if (!assignee.rows[0]) return jsonError("Assignee is not active", 400);
    const result = await db.query(
      `INSERT INTO tasks (project_id, assignee_user_id, assignee_party_id, task_type, target_type, target_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, task_type AS "taskType", target_type AS "targetType", target_id AS "targetId", status, created_at AS "createdAt"`,
      [membership.projectId, assigneeUserId, resolvedParty, taskType, targetType, targetId],
    );
    await db.query(
      `INSERT INTO alerts (project_id, user_id, alert_type, target_type, target_id, message)
       SELECT $1, pm.user_id, 'task.assigned', 'task', $2, $3
       FROM project_memberships pm
       WHERE pm.project_id = $1 AND pm.party_id = $4 AND pm.active
         AND ($5::uuid IS NULL OR pm.user_id = $5)
       ON CONFLICT DO NOTHING`,
      [membership.projectId, result.rows[0].id, message || "A new task has been assigned to your project party", resolvedParty, assigneeUserId],
    );
    await db.query(`INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id) VALUES ($1, $2, 'task.created', 'task', $3, $4::jsonb, $5)`, [membership.projectId, user.id, result.rows[0].id, JSON.stringify({ taskType, targetType, targetId, assigneeUserId, assigneePartyId: resolvedParty, message }), request.headers.get("x-request-id")]);
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) { return authErrorResponse(error); }
}
