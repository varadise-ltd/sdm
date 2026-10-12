import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ projectCode: string; taskId: string }> }) {
  try {
    const { projectCode, taskId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode);
    if (!/^[0-9a-f-]{36}$/i.test(taskId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const status = body.status === "completed" ? "completed" : body.status === "in_progress" ? "in_progress" : null;
    if (!status) return NextResponse.json({ error: { code: "INVALID_TASK", message: "status must be completed or in_progress" } }, { status: 400 });
    const result = await db.query(
      `UPDATE tasks SET status = $1, completed_at = CASE WHEN $1 = 'completed' THEN now() ELSE NULL END
       WHERE id = $2 AND project_id = $3
         AND (assignee_user_id = $4 OR assignee_party_id = $5 OR $6::text = 'document_controller')
       RETURNING id, status, completed_at AS "completedAt"`,
      [status, taskId, membership.projectId, user.id, membership.partyId, membership.roleSlug],
    );
    if (!result.rows[0]) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, { status: 404 });
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload)
       VALUES ($1, $2, 'task.updated', 'task', $3, $4::jsonb)`,
      [membership.projectId, user.id, taskId, JSON.stringify({ status })],
    );
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    return authErrorResponse(error);
  }
}
