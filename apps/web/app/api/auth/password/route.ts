import { NextResponse } from "next/server";
import { authErrorResponse, authMode, getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { jsonError, parseObjectBody } from "../../../../lib/http";
import { hashLocalPassword, validateLocalPassword, verifyLocalPassword } from "../../../../lib/password";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  if (authMode !== "local" && authMode !== "development") return jsonError("Local password management is disabled; use the identity provider", 400);
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const validationError = validateLocalPassword(newPassword);
  if (validationError) return jsonError(validationError);
  try {
    const user = await getCurrentUser(request);
    const current = await db.query<{ passwordHash: string | null }>(`SELECT password_hash AS "passwordHash" FROM users WHERE id = $1 AND active = true`, [user.id]);
    if (!current.rows[0] || !(await verifyLocalPassword(currentPassword, current.rows[0].passwordHash))) return jsonError("Current password is incorrect", 401);
    const passwordHash = await hashLocalPassword(newPassword);
    await db.query(`UPDATE users SET password_hash = $2, password_updated_at = now() WHERE id = $1`, [user.id, passwordHash]);
    await db.query(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [user.id]);
    return NextResponse.json({ data: { passwordChanged: true } });
  } catch (error) { return authErrorResponse(error); }
}
