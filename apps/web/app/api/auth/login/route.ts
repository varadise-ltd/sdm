import { NextResponse } from "next/server";
import { authMode, authErrorResponse, AuthError } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { jsonError, parseObjectBody } from "../../../../lib/http";
import { hashLocalPassword, verifyLocalPassword } from "../../../../lib/password";
import { createSession, setSessionCookie } from "../../../../lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (authMode !== "local" && authMode !== "development") {
    return jsonError("Local password sign-in is disabled; use the configured identity provider", 400);
  }
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return jsonError("Email and password are required");
  try {
    const result = await db.query<{ id: string; email: string; displayName: string; externalSubject: string | null; passwordHash: string | null }>(
      `SELECT id, email::text AS email, display_name AS "displayName", external_subject AS "externalSubject", password_hash AS "passwordHash"
       FROM users WHERE email = $1::citext AND active = true LIMIT 1`, [email],
    );
    const user = result.rows[0];
    // Keep the response deliberately generic so account existence cannot be
    // enumerated through the login endpoint.
    if (!user || !(await verifyLocalPassword(password, user.passwordHash))) {
      throw new AuthError(401, "Invalid email or password");
    }
    const session = await createSession(user.id, request);
    const response = NextResponse.json({ data: { id: user.id, email: user.email, displayName: user.displayName, externalSubject: user.externalSubject } });
    setSessionCookie(response, session.token);
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
