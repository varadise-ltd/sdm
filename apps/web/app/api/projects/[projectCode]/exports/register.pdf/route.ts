import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { authErrorResponse, requireProjectMembership } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
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
              to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS updated
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
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([842, 595]);
    const margin = 32;
    let y = 560;
    const write = (text: string, x: number, size = 8, font = regular) => page.drawText(text.slice(0, 90), { x, y, size, font, color: rgb(0.1, 0.15, 0.18) });
    write(`COSMOS SDM · ${projectCode} · Document Register`, margin, 14, bold); y -= 24;
    const cols = ["Document number", "Title", "Type", "Rev", "Suitability", "Response", "CDE", "Updated"];
    const xs = [margin, 175, 405, 470, 515, 585, 645, 695];
    cols.forEach((heading, index) => page.drawText(heading, { x: xs[index], y, size: 7, font: bold, color: rgb(0.04, 0.3, 0.37) })); y -= 14;
    for (const row of result.rows) {
      if (y < 35) { page = pdf.addPage([842, 595]); y = 560; }
      const values = [row.containerId ?? "—", row.title ?? "", row.type ?? "", row.revision ?? "—", row.suitability ?? "—", row.clientResponse ?? "—", row.cde ?? "—", row.updated ?? "—"];
      values.forEach((value, index) => page.drawText(String(value).slice(0, index === 1 ? 34 : 16), { x: xs[index], y, size: 7, font: regular, color: rgb(0.1, 0.15, 0.18) }));
      y -= 13;
    }
    const bytes = await pdf.save();
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new NextResponse(body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="sdm-document-register-${projectCode}.pdf"`, "Cache-Control": "no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
