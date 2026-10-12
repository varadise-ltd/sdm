import { NextResponse } from "next/server";
import { revokeSession, clearSessionCookie } from "../../../../lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await revokeSession(request);
  const response = NextResponse.json({ data: { signedOut: true } });
  clearSessionCookie(response);
  return response;
}
