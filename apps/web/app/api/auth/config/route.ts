import { NextResponse } from "next/server";
import { authMode, isLocalAuthEnabled } from "../../../../lib/auth";
import { LOCAL_PASSWORD_POLICY } from "../../../../lib/password";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ data: {
    mode: authMode,
    localPasswordEnabled: isLocalAuthEnabled(),
    passwordPolicy: LOCAL_PASSWORD_POLICY,
    keycloakReady: Boolean((process.env.OIDC_ISSUER_URL ?? process.env.KEYCLOAK_ISSUER_URL) && (process.env.OIDC_AUDIENCE ?? process.env.KEYCLOAK_CLIENT_ID)),
  } });
}
