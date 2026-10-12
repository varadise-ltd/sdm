import { NextResponse } from "next/server";
import { authMode, verifyOidcToken } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { createSession, setSessionCookie } from "../../../../../lib/session";

export const runtime = "nodejs";

const stateCookie = "sdm_oidc_state";
const verifierCookie = "sdm_oidc_verifier";
const nonceCookie = "sdm_oidc_nonce";
const nextCookie = "sdm_oidc_next";

function readCookie(request: Request, name: string): string | undefined {
  const value = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { return undefined; }
}
function clearCookie(name: string): string { return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`; }
function safeNext(value: string | undefined): string { return value && value.startsWith("/") && !value.startsWith("//") ? value : "/"; }

async function discovery(issuer: string): Promise<{ token_endpoint: string }> {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!response.ok) throw new Error("OIDC discovery failed");
  const data = await response.json() as { token_endpoint?: string };
  if (!data.token_endpoint) throw new Error("OIDC discovery has no token endpoint");
  return { token_endpoint: data.token_endpoint };
}

export async function GET(request: Request) {
  if (authMode !== "oidc") return NextResponse.redirect(new URL("/login?error=OIDC%20sign-in%20is%20not%20enabled", request.url));
  try {
    const url = new URL(request.url);
    const error = url.searchParams.get("error");
    if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(url.searchParams.get("error_description") ?? error)}`, request.url));
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = readCookie(request, stateCookie);
    const verifier = readCookie(request, verifierCookie);
    const nonce = readCookie(request, nonceCookie);
    if (!code || !state || !expectedState || state !== expectedState || !verifier || !nonce) throw new Error("OIDC authorization response failed state validation");
    const issuer = (process.env.OIDC_ISSUER_URL ?? process.env.KEYCLOAK_ISSUER_URL)?.replace(/\/$/, "");
    const clientId = process.env.OIDC_CLIENT_ID ?? process.env.KEYCLOAK_CLIENT_ID ?? process.env.OIDC_AUDIENCE;
    const clientSecret = process.env.OIDC_CLIENT_SECRET ?? process.env.KEYCLOAK_CLIENT_SECRET;
    const redirectUri = process.env.SDM_OIDC_REDIRECT_URI ?? `${url.origin}/api/auth/oidc/callback`;
    if (!issuer || !clientId) throw new Error("OIDC is not configured: set issuer and client id");
    const endpoints = await discovery(issuer);
    const body = new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier });
    if (clientSecret) body.set("client_secret", clientSecret);
    const tokenResponse = await fetch(endpoints.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
    const tokenPayload = await tokenResponse.json() as { id_token?: string; error?: string; error_description?: string };
    if (!tokenResponse.ok || !tokenPayload.id_token) throw new Error(tokenPayload.error_description ?? tokenPayload.error ?? "OIDC token exchange failed");
    const identity = await verifyOidcToken(tokenPayload.id_token, nonce);
    const user = await db.query<{ id: string; email: string; displayName: string; externalSubject: string | null }>(
      `SELECT id, email::text AS email, display_name AS "displayName", external_subject AS "externalSubject"
       FROM users WHERE active = true AND external_subject = $1 LIMIT 1`, [identity.subject],
    );
    if (!user.rows[0]) throw new Error("Your Keycloak identity is not provisioned in SDM");
    const session = await createSession(user.rows[0].id, request);
    const response = NextResponse.redirect(new URL(safeNext(readCookie(request, nextCookie)), request.url));
    setSessionCookie(response, session.token);
    for (const cookie of [stateCookie, verifierCookie, nonceCookie, nextCookie]) response.headers.append("Set-Cookie", clearCookie(cookie));
    return response;
  } catch (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error instanceof Error ? error.message : "OIDC sign-in failed")}`, request.url));
  }
}
