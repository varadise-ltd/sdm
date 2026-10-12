import { createHash, randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { db } from "./db";

export const SESSION_COOKIE_NAME = "sdm_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieValue(token: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function createSession(userId: string, request: Request): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await db.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), expiresAt, request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, request.headers.get("user-agent")?.slice(0, 512) ?? null],
  );
  return { token, expiresAt };
}

export function setSessionCookie(response: NextResponse, token: string, maxAge = SESSION_TTL_SECONDS): void {
  response.headers.append("Set-Cookie", cookieValue(token, maxAge));
}

export function clearSessionCookie(response: NextResponse): void {
  response.headers.append("Set-Cookie", cookieValue("", 0));
}

export function sessionTokenFromRequest(request: Request): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  const match = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!match) return undefined;
  const value = match.slice(SESSION_COOKIE_NAME.length + 1);
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { return undefined; }
}

export async function resolveSessionUserId(request: Request): Promise<string | undefined> {
  const token = sessionTokenFromRequest(request);
  if (!token) return undefined;
  const result = await db.query<{ userId: string }>(
    `UPDATE auth_sessions SET last_seen_at = now()
     WHERE token_hash = $1 AND expires_at > now() AND revoked_at IS NULL
     RETURNING user_id AS "userId"`,
    [hashToken(token)],
  );
  return result.rows[0]?.userId;
}

export async function revokeSession(request: Request): Promise<void> {
  const token = sessionTokenFromRequest(request);
  if (!token) return;
  await db.query(`UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [hashToken(token)]);
}
