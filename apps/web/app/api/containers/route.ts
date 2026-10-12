import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../lib/auth";
import { db } from "../../../lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectCode = searchParams.get("project") ?? "P001";
    const { membership } = await requireProjectMembership(request, projectCode, undefined, "documents.read");

    const result = await db.query(
    `
      SELECT
        c.id,
        p.code AS "projectCode",
        COALESCE(c.document_number, c.container_number) AS "containerNumber",
        c.document_number AS "documentNumber",
        c.internal_number AS "internalNumber",
        c.title,
        c.library_folder AS "libraryFolder",
        c.document_type_code AS "documentType",
        c.is_drawing AS "isDrawing",
        c.is_internal AS "isInternal",
        c.iso_originator_code AS "originatorCode",
        c.lifecycle_status AS "lifecycleStatus",
        r.id AS "revisionId",
        r.revision_code AS "revisionCode",
        r.suitability_code AS "suitabilityCode",
        r.client_response_code AS "clientResponseCode",
        r.cde_state AS "cdeState",
        r.workflow_status AS "workflowStatus",
        (
          SELECT ti.id
          FROM transmittal_items ti
          JOIN transmittals t ON t.id = ti.transmittal_id
          WHERE ti.revision_id = r.id
            AND ($3::text = 'document_controller' OR t.sender_party_id = $2::uuid OR t.recipient_party_id = $2::uuid)
          ORDER BY t.created_at DESC
          LIMIT 1
        ) AS "transmittalItemId",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt"
      FROM containers c
      JOIN projects p ON p.id = c.project_id
      LEFT JOIN document_revisions r ON r.id = c.latest_revision_id
      WHERE p.id = $1
        AND (
          $3::text = 'document_controller'
          OR c.is_internal = false
          OR c.originator_party_id = $2::uuid
        )
      ORDER BY c.updated_at DESC
    `,
      [membership.projectId, membership.partyId, membership.roleSlug],
    );

    return NextResponse.json({ data: result.rows, project: membership.projectCode });
  } catch (error) {
    return authErrorResponse(error);
  }
}
