import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode);
    const result = await db.query(
      `SELECT id, alert_type AS "alertType", target_type AS "targetType", target_id AS "targetId",
              message, read_at AS "readAt", created_at AS "createdAt"
       FROM alerts WHERE project_id = $1 AND user_id = $2
       ORDER BY read_at NULLS FIRST, created_at DESC LIMIT 100`,
      [membership.projectId, user.id],
    );
    return NextResponse.json({ data: result.rows, project: membership.projectCode });
  } catch (error) {
    return authErrorResponse(error);
  }
}
