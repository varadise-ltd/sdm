import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../../lib/auth";
import { db } from "../../../../../../../lib/db";

export const runtime = "nodejs";

const projectRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant", "client_re_er"];
const endorsementTypes = new Set(["IDC", "ICE", "Client"]);

export async function GET(request: Request, context: { params: Promise<{ projectCode: string; revisionId: string }> }) {
  try {
    const { projectCode, revisionId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, projectRoles, "documents.approve");
    const result = await db.query(
      `SELECT DISTINCT ON (de.endorsement_type)
              de.id, de.endorsement_type AS "endorsementType", de.status,
              de.endorsed_at AS "endorsedAt", u.display_name AS "endorsedBy", de.notes,
              ($3::text = 'document_controller' OR de.endorsed_by_user_id = $5::uuid) AS "canWithdraw"
       FROM drawing_endorsements de
       JOIN document_revisions r ON r.id = de.revision_id
       JOIN containers c ON c.id = r.container_id AND c.project_id = $2
       LEFT JOIN users u ON u.id = de.endorsed_by_user_id
       WHERE de.revision_id = $1
         AND ($3::text = 'document_controller' OR c.is_internal = false OR c.originator_party_id = $4::uuid)
       ORDER BY de.endorsement_type, de.created_at DESC, de.updated_at DESC`,
      [revisionId, membership.projectId, membership.roleSlug, membership.partyId, user.id],
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectCode: string; revisionId: string }> }) {
  try {
    const { projectCode, revisionId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, projectRoles, "documents.approve");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const endorsementType = typeof body.endorsementType === "string" ? body.endorsementType : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null;
    if (!/^[0-9a-f-]{36}$/i.test(revisionId) || !endorsementTypes.has(endorsementType)) {
      return NextResponse.json({ error: { code: "INVALID_ENDORSEMENT", message: "revisionId and endorsement type Independent Design Checker (IDC), Independent Checking Engineer (ICE), or Client are required" } }, { status: 400 });
    }
    if (endorsementType === "Client" && membership.roleSlug !== "client_re_er") {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Only the client representative can record a Client endorsement" } }, { status: 403 });
    }
    if (endorsementType !== "Client" && membership.roleSlug === "client_re_er") {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Client representatives record Client endorsements only" } }, { status: 403 });
    }

    const revision = await db.query<{ id: string }>(
      `SELECT r.id FROM document_revisions r
       JOIN containers c ON c.id = r.container_id AND c.project_id = $2 AND c.is_drawing = true
       WHERE r.id = $1
         AND ($3::text = 'document_controller' OR c.is_internal = false OR c.originator_party_id = $4::uuid)`,
      [revisionId, membership.projectId, membership.roleSlug, membership.partyId],
    );
    if (!revision.rows[0]) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Drawing revision not found" } }, { status: 404 });

    const result = await db.query(
      `INSERT INTO drawing_endorsements (revision_id, endorsement_type, status, endorsed_by_user_id, endorsed_at, notes)
       VALUES ($1, $2, 'endorsed', $3, now(), $4)
       ON CONFLICT (revision_id, endorsement_type) WHERE status IN ('pending', 'endorsed')
       DO UPDATE SET status = 'endorsed', endorsed_by_user_id = EXCLUDED.endorsed_by_user_id,
                     endorsed_at = EXCLUDED.endorsed_at, notes = EXCLUDED.notes, updated_at = now()
       RETURNING id, endorsement_type AS "endorsementType", status, endorsed_at AS "endorsedAt"`,
      [revisionId, endorsementType, user.id, notes],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload)
       VALUES ($1, $2, 'drawing.endorsement.recorded', 'revision', $3, $4::jsonb)`,
      [membership.projectId, user.id, revisionId, JSON.stringify({ endorsementType })],
    );
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ projectCode: string; revisionId: string }> }) {
  try {
    const { projectCode, revisionId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, projectRoles, "documents.approve");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const endorsementType = typeof body.endorsementType === "string" ? body.endorsementType : "";
    if (!/^[0-9a-f-]{36}$/i.test(revisionId) || !endorsementTypes.has(endorsementType)) {
      return NextResponse.json({ error: { code: "INVALID_ENDORSEMENT", message: "revisionId and endorsement type Independent Design Checker (IDC), Independent Checking Engineer (ICE), or Client are required" } }, { status: 400 });
    }
    if (endorsementType === "Client" && membership.roleSlug !== "client_re_er" && membership.roleSlug !== "document_controller") {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Only the client representative or document controller can withdraw a Client endorsement" } }, { status: 403 });
    }
    if (endorsementType !== "Client" && membership.roleSlug === "client_re_er") {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Client representatives withdraw Client endorsements only" } }, { status: 403 });
    }

    const target = await db.query<{ id: string; endorsedByUserId: string | null }>(
      `SELECT de.id, de.endorsed_by_user_id AS "endorsedByUserId"
       FROM drawing_endorsements de
       JOIN document_revisions r ON r.id = de.revision_id
       JOIN containers c ON c.id = r.container_id AND c.project_id = $2 AND c.is_drawing = true
       WHERE de.revision_id = $1
         AND de.endorsement_type = $3
         AND de.status = 'endorsed'
         AND ($4::text = 'document_controller' OR c.is_internal = false OR c.originator_party_id = $5::uuid)
       ORDER BY de.created_at DESC
       LIMIT 1`,
      [revisionId, membership.projectId, endorsementType, membership.roleSlug, membership.partyId],
    );
    if (!target.rows[0]) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Recorded endorsement not found" } }, { status: 404 });
    if (membership.roleSlug !== "document_controller" && target.rows[0].endorsedByUserId !== user.id) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Only the recorded endorser or document controller can withdraw this endorsement" } }, { status: 403 });
    }

    const result = await db.query(
      `UPDATE drawing_endorsements
       SET status = 'withdrawn', updated_at = now()
       WHERE id = $1
       RETURNING id, endorsement_type AS "endorsementType", status,
                 endorsed_at AS "endorsedAt"`,
      [target.rows[0].id],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload)
       VALUES ($1, $2, 'drawing.endorsement.withdrawn', 'revision', $3, $4::jsonb)`,
      [membership.projectId, user.id, revisionId, JSON.stringify({ endorsementType, endorsementId: target.rows[0].id })],
    );
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    return authErrorResponse(error);
  }
}
