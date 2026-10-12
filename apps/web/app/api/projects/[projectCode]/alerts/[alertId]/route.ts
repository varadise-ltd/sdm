import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ projectCode: string; alertId: string }> }) {
  try {
    const { projectCode, alertId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode);
    if (!/^[0-9a-f-]{36}$/i.test(alertId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Alert not found" } }, { status: 404 });
    const result = await db.query(
      `UPDATE alerts SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND project_id = $2 AND user_id = $3
       RETURNING id, read_at AS "readAt"`,
      [alertId, membership.projectId, user.id],
    );
    if (!result.rows[0]) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Alert not found" } }, { status: 404 });
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    return authErrorResponse(error);
  }
}
