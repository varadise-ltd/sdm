import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";

export const runtime = "nodejs";
const writeRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant"];

export async function GET(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { membership } = await requireProjectMembership(request, projectCode, undefined, "documents.read");
    const result = await db.query(
      `SELECT fs.id, fs.form_number AS "formNumber", fs.module_code AS "moduleCode", fs.form_year AS "formYear",
              fs.source_record_id AS "sourceRecordId", fs.status, fs.metadata, fs.created_at AS "createdAt",
              u.display_name AS "createdBy"
       FROM form_submissions fs JOIN users u ON u.id = fs.created_by_user_id
       WHERE fs.project_id = $1 ORDER BY fs.created_at DESC LIMIT 200`,
      [membership.projectId],
    );
    return NextResponse.json({ data: result.rows, project: membership.projectCode });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, writeRoles, "documents.create");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const moduleCode = typeof body.moduleCode === "string" ? body.moduleCode.trim().toUpperCase() : "";
    const formYear = typeof body.formYear === "number" ? body.formYear : Number(body.formYear ?? new Date().getUTCFullYear());
    const sourceRecordId = typeof body.sourceRecordId === "string" ? body.sourceRecordId.trim().slice(0, 255) : null;
    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};
    if (!/^[A-Z0-9_-]{2,32}$/.test(moduleCode) || !Number.isInteger(formYear) || formYear < 2000 || formYear > 2200) {
      return NextResponse.json({ error: { code: "INVALID_FORM", message: "moduleCode and a formYear from 2000 to 2200 are required" } }, { status: 400 });
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const sequence = await client.query<{ value: string }>("SELECT sdm_next_sequence($1, $2)::text AS value", [membership.projectId, `form_${moduleCode.toLowerCase()}`]);
      const result = await client.query(
        `INSERT INTO form_submissions (project_id, project_code_snapshot, module_code, form_year, sequence_no, source_record_id, metadata, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
         RETURNING id, form_number AS "formNumber", module_code AS "moduleCode", form_year AS "formYear", status, metadata, created_at AS "createdAt"`,
        [membership.projectId, membership.projectCode, moduleCode, formYear, Number(sequence.rows[0].value), sourceRecordId, JSON.stringify(metadata), user.id],
      );
      await client.query(
        `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id) VALUES ($1, $2, 'form.recorded', 'form_submission', $3, $4::jsonb, $5)`,
        [membership.projectId, user.id, result.rows[0].id, JSON.stringify({ formNumber: result.rows[0].formNumber, moduleCode }), request.headers.get("x-request-id")],
      );
      await client.query("COMMIT");
      return NextResponse.json({ data: result.rows[0] }, { status: 201 });
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  } catch (error) { return authErrorResponse(error); }
}
