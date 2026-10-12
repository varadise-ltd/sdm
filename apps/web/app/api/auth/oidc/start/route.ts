import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authMode, authErrorResponse } from "../../../../../lib/auth";

export const runtime = "nodejs";

const stateCookie = "sdm_oidc_state";
const verifierCookie = "sdm_oidc_verifier";
const nonceCookie = "sdm_oidc_nonce";
const nextCookie = "sdm_oidc_next";

function encoded(value: Buffer): string { return value.toString("base64url"); }
function transientCookie(name: string, value: string, maxAge = 600): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function discovery(issuer: string): Promise<{ authorization_endpoint: string }> {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!response.ok) throw new Error("OIDC discovery failed");
  const data = await response.json() as { authorization_endpoint?: string };
  if (!data.authorization_endpoint) throw new Error("OIDC discovery has no authorization endpoint");
  return { authorization_endpoint: data.authorization_endpoint };
}

export async function GET(request: Request) {
  if (authMode !== "oidc") return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("OIDC sign-in is not enabled")}`, request.url));
  try {
    const issuer = (process.env.OIDC_ISSUER_URL ?? process.env.KEYCLOAK_ISSUER_URL)?.replace(/\/$/, "");
    const clientId = process.env.OIDC_CLIENT_ID ?? process.env.KEYCLOAK_CLIENT_ID ?? process.env.OIDC_AUDIENCE;
    const redirectUri = process.env.SDM_OIDC_REDIRECT_URI ?? `${new URL(request.url).origin}/api/auth/oidc/callback`;
    if (!issuer || !clientId) throw new Error("OIDC is not configured: set issuer and client id");
    const endpoints = await discovery(issuer);
    const state = encoded(randomBytes(32));
    const verifier = encoded(randomBytes(48));
    const nonce = encoded(randomBytes(32));
    const challenge = encoded(createHash("sha256").update(verifier).digest());
    const authorization = new URL(endpoints.authorization_endpoint);
    authorization.searchParams.set("client_id", clientId);
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("scope", "openid profile email");
    authorization.searchParams.set("redirect_uri", redirectUri);
    authorization.searchParams.set("state", state);
    authorization.searchParams.set("nonce", nonce);
    authorization.searchParams.set("code_challenge", challenge);
    authorization.searchParams.set("code_challenge_method", "S256");
    const response = NextResponse.redirect(authorization);
    response.headers.append("Set-Cookie", transientCookie(stateCookie, state));
    response.headers.append("Set-Cookie", transientCookie(verifierCookie, verifier));
    response.headers.append("Set-Cookie", transientCookie(nonceCookie, nonce));
    response.headers.append("Set-Cookie", transientCookie(nextCookie, safeNext(new URL(request.url).searchParams.get("next"))));
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
