import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { authErrorResponse, requireProjectMembership } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";

export const runtime = "nodejs";

async function registerRows(request: Request, projectCode: string) {
  const { membership } = await requireProjectMembership(request, projectCode);
  const { searchParams } = new URL(request.url);
  const cdeState = searchParams.get("cdeState");
  const documentType = searchParams.get("type");
  const q = (searchParams.get("q") ?? "").trim();
  const result = await db.query(
    `SELECT COALESCE(c.document_number, c.container_number, c.internal_number) AS "containerId", c.title,
            CASE WHEN c.is_drawing THEN 'Drawing' WHEN c.document_type_code IN ('FM', 'FORM') THEN 'Form' WHEN c.document_type_code IN ('PK', 'PACKAGE') THEN 'Package' WHEN c.document_type_code IN ('TX', 'TRN', 'TRANSMITTAL') THEN 'Transmittal' ELSE 'Document' END AS type,
            r.revision_code AS revision, r.suitability_code AS suitability,
            r.client_response_code AS "clientResponse", r.cde_state AS cde,
            to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS UTC') AS updated
       FROM containers c JOIN projects p ON p.id = c.project_id
       LEFT JOIN document_revisions r ON r.id = c.latest_revision_id
      WHERE p.code = $1
        AND ($2::text = '' OR c.title ILIKE '%' || $2 || '%' OR c.document_number ILIKE '%' || $2 || '%' OR c.container_number ILIKE '%' || $2 || '%' OR c.internal_number ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR r.cde_state = $3)
        AND ($4::text IS NULL OR (CASE WHEN c.is_drawing THEN 'Drawing' WHEN c.document_type_code IN ('FM', 'FORM') THEN 'Form' WHEN c.document_type_code IN ('PK', 'PACKAGE') THEN 'Package' WHEN c.document_type_code IN ('TX', 'TRN', 'TRANSMITTAL') THEN 'Transmittal' ELSE 'Document' END) = $4)
        AND ($5::text = 'document_controller' OR c.is_internal = false OR c.originator_party_id = $6::uuid)
      ORDER BY c.updated_at DESC, c.id`,
    [projectCode, q, cdeState || null, documentType || null, membership.roleSlug, membership.partyId],
  );
  return { rows: result.rows, membership };
}

export async function GET(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { rows } = await registerRows(request, projectCode);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "COSMOS SDM";
    const sheet = workbook.addWorksheet("Document Register");
    sheet.columns = [
      { header: "Document number", key: "containerId", width: 32 }, { header: "Title", key: "title", width: 42 },
      { header: "Type", key: "type", width: 16 }, { header: "Revision", key: "revision", width: 12 },
      { header: "Suitability", key: "suitability", width: 14 }, { header: "Client response", key: "clientResponse", width: 18 },
      { header: "CDE", key: "cde", width: 14 }, { header: "Updated", key: "updated", width: 28 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F4C5C" } };
    rows.forEach((row: Record<string, unknown>) => sheet.addRow(row));
    sheet.autoFilter = { from: "A1", to: "H1" };
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="sdm-document-register-${projectCode}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
