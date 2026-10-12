import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { isUuid, parseObjectBody } from "../../../../../lib/http";

export const runtime = "nodejs";

const workflowAdminRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];
const slugPattern = /^[a-z][a-z0-9_-]{1,63}$/;
const rolePattern = /^[a-z][a-z0-9_]{1,63}$/;

function error(message: string, code = "INVALID_REQUEST", status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function stringValue(value: unknown, field: string, max: number) {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const result = value.trim();
  if (!result || result.length > max) throw new Error(`${field} must be between 1 and ${max} characters`);
  return result;
}

async function readWorkflow(projectId: string) {
  const templates = await db.query<{
    id: string; slug: string; name: string; active: boolean; createdAt: string; updatedAt: string;
  }>(
    `SELECT id, slug, name, active, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM workflow_templates WHERE project_id = $1 ORDER BY active DESC, name ASC`,
    [projectId],
  );
  const steps = await db.query<{
    id: string; templateId: string; sequenceNo: number; stepKey: string; displayName: string; required: boolean; requiredRoleSlug: string | null;
  }>(
    `SELECT id, template_id AS "templateId", sequence_no AS "sequenceNo", step_key AS "stepKey",
            display_name AS "displayName", required, required_role_slug AS "requiredRoleSlug"
       FROM workflow_template_steps WHERE template_id = ANY($1::uuid[]) ORDER BY template_id, sequence_no`,
    [templates.rows.map((template) => template.id)],
  );
  return templates.rows.map((template) => ({ ...template, steps: steps.rows.filter((step) => step.templateId === template.id) }));
}

export async function GET(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { membership } = await requireProjectMembership(request, projectCode, workflowAdminRoles);
    return NextResponse.json({ data: await readWorkflow(membership.projectId) });
  } catch (caught) {
    return authErrorResponse(caught);
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  const client = await db.connect();
  try {
    const { projectCode } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, workflowAdminRoles);
    const body = parseObjectBody(await request.json().catch(() => null));
    if (!body) return error("A JSON object is required");
    let slug: string;
    let name: string;
    try {
      slug = stringValue(body.slug, "slug", 64).toLowerCase();
      name = stringValue(body.name, "name", 120);
    } catch (caught) {
      return error(caught instanceof Error ? caught.message : "Invalid workflow template");
    }
    if (!slugPattern.test(slug)) return error("slug must start with a letter and contain only lowercase letters, numbers, underscores, or hyphens");
    if (body.active === true) return error("Create the template first, add its steps, then activate it from the workflow setup screen", "WORKFLOW_EMPTY", 409);

    await client.query("BEGIN");
    const duplicate = await client.query("SELECT 1 FROM workflow_templates WHERE project_id = $1 AND slug = $2", [membership.projectId, slug]);
    if (duplicate.rowCount) {
      await client.query("ROLLBACK");
      return error("A workflow template with this slug already exists", "CONFLICT", 409);
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO workflow_templates (project_id, slug, name, active) VALUES ($1, $2, $3, false) RETURNING id`,
      [membership.projectId, slug, name],
    );
    const templateId = inserted.rows[0].id;
    await client.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'workflow.template.created', 'workflow_template', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, templateId, JSON.stringify({ slug, name, active: false }), request.headers.get("x-request-id")],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: { id: templateId, slug, name, active: false } }, { status: 201 });
  } catch (caught) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(caught);
  } finally {
    client.release();
  }
}
