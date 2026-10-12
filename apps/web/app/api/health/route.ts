import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await db.query<{ now: string }>("SELECT now()::text AS now");

    return NextResponse.json({
      service: "sdm-web",
      status: "ok",
      database: "ok",
      checkedAt: result.rows[0]?.now,
    });
  } catch (error) {
    console.error("SDM health check failed", error);
    return NextResponse.json(
      { service: "sdm-web", status: "degraded", database: "unavailable" },
      { status: 503 },
    );
  }
}
