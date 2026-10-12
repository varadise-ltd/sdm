import { NextResponse } from "next/server";
import { authMode } from "../../../../../lib/auth";
import { revokeSession } from "../../../../../lib/session";

export const runtime = "nodejs";

function clearSessionCookie(): string { return `sdm_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`; }

export async function GET(request: Request) {
  await revokeSession(request);
  if (authMode !== "oidc") {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.headers.append("Set-Cookie", clearSessionCookie());
    return response;
  }
  const issuer = (process.env.OIDC_ISSUER_URL ?? process.env.KEYCLOAK_ISSUER_URL)?.replace(/\/$/, "");
  const clientId = process.env.OIDC_CLIENT_ID ?? process.env.KEYCLOAK_CLIENT_ID ?? process.env.OIDC_AUDIENCE;
  const postLogout = process.env.SDM_OIDC_POST_LOGOUT_REDIRECT_URI ?? `${new URL(request.url).origin}/login`;
  if (!issuer || !clientId) return NextResponse.redirect(new URL("/login", request.url));
  const endpoint = process.env.OIDC_END_SESSION_ENDPOINT ?? `${issuer}/protocol/openid-connect/logout`;
  const logout = new URL(endpoint);
  logout.searchParams.set("client_id", clientId);
  logout.searchParams.set("post_logout_redirect_uri", postLogout);
  const response = NextResponse.redirect(logout);
  response.headers.append("Set-Cookie", clearSessionCookie());
  return response;
}
