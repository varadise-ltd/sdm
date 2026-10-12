import { NextResponse } from "next/server";
import { authErrorResponse, getCurrentUser } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { jsonError, parseObjectBody } from "../../../lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const result = await db.query(
      `SELECT o.id, o.code, o.name, o.timezone, o.status, om.role_slug AS "roleSlug",
              COUNT(DISTINCT p.id)::integer AS "projectCount",
              COALESCE(json_agg(DISTINCT jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'status', p.status)) FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS projects
         FROM organization_memberships om
         JOIN organizations o ON o.id = om.organization_id
         LEFT JOIN projects p ON p.organization_id = o.id AND p.status <> 'closed'
        WHERE om.user_id = $1 AND om.active AND o.status <> 'closed'
        GROUP BY o.id, om.role_slug ORDER BY o.name`,
      [user.id],
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "Asia/Hong_Kong";
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) return jsonError("code must contain 2-32 uppercase letters, numbers, hyphens, or underscores");
  if (name.length < 2 || name.length > 160) return jsonError("name must be 2-160 characters");
  try {
    const user = await getCurrentUser(request);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO organizations (code, name, timezone) VALUES ($1, $2, $3)
         RETURNING id, code, name, timezone, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [code, name, timezone],
      );
      await client.query(`INSERT INTO organization_memberships (organization_id, user_id, role_slug) VALUES ($1, $2, 'org_owner')`, [result.rows[0].id, user.id]);
      await client.query(`INSERT INTO audit_events (actor_user_id, event_type, entity_type, entity_id, payload, request_id) VALUES ($1, 'organization.created', 'organization', $2, $3::jsonb, $4)`, [user.id, result.rows[0].id, JSON.stringify({ code, name }), request.headers.get("x-request-id")]);
      await client.query("COMMIT");
      return NextResponse.json({ data: { ...result.rows[0], roleSlug: "org_owner", projects: [] } }, { status: 201 });
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return jsonError("An organization with this code already exists", 409);
    return authErrorResponse(error);
  }
}
