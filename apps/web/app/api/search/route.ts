import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireProjectMembership } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { jsonError } from "../../../lib/http";

export const runtime = "nodejs";

const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  const projectCode = (searchParams.get("project") ?? "P001").trim().toUpperCase();
  const cdeState = searchParams.get("cdeState")?.trim() || null;
  const tagSlugs = searchParams
    .getAll("tag")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "25", 10);
  const parsedOffset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT) : 25;
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

  if (!projectCode || projectCode.length > 32) {
    return jsonError("project must be a valid project code");
  }
  if (cdeState && !["WIP", "Shared", "Published", "Archive"].includes(cdeState)) {
    return jsonError("cdeState must be WIP, Shared, Published, or Archive");
  }
  if (tagSlugs.some((slug) => slug.length > 64)) {
    return jsonError("tag values must be 64 characters or fewer");
  }

  try {
    const { membership } = await requireProjectMembership(request, projectCode, undefined, "documents.read");
    const result = await db.query(
      `
        WITH search_query AS (
          SELECT websearch_to_tsquery('simple'::regconfig, NULLIF($1, '')) AS tsquery
        )
        SELECT
          c.id,
          p.code AS "projectCode",
          COALESCE(c.document_number, c.container_number) AS "containerNumber",
          c.document_number AS "documentNumber",
          c.internal_number AS "internalNumber",
          c.title,
          c.updated_at AS "updatedAt",
          c.library_folder AS "libraryFolder",
          c.document_type_code AS "documentType",
          c.is_drawing AS "isDrawing",
          c.is_internal AS "isInternal",
          c.iso_originator_code AS "originatorCode",
          c.lifecycle_status AS "lifecycleStatus",
          r.revision_code AS "revisionCode",
          r.suitability_code AS "suitabilityCode",
          r.client_response_code AS "clientResponseCode",
          r.cde_state AS "cdeState",
          r.workflow_status AS "workflowStatus",
          r.id AS "revisionId",
          (
            SELECT ti.id
            FROM transmittal_items ti
            JOIN transmittals t ON t.id = ti.transmittal_id
            WHERE ti.revision_id = r.id
              AND ($8::text = 'document_controller' OR t.sender_party_id = $7::uuid OR t.recipient_party_id = $7::uuid)
            ORDER BY t.created_at DESC LIMIT 1
          ) AS "transmittalItemId",
          ts_headline(
            'simple'::regconfig,
            s.searchable_text,
            sq.tsquery,
            'MaxFragments=2,MaxWords=24,MinWords=8'
          ) AS snippet,
          CASE
            WHEN $1 = '' THEN 0::real
            ELSE ts_rank_cd(s.search_vector, sq.tsquery)
          END AS rank,
          count(*) OVER ()::integer AS "totalCount"
        FROM container_search_documents AS s
        JOIN containers AS c ON c.id = s.container_id
        JOIN projects AS p ON p.id = s.project_id
        LEFT JOIN document_revisions AS r ON r.id = c.latest_revision_id
        CROSS JOIN search_query AS sq
        WHERE p.code = $2
          AND (
            $1 = '' OR s.search_vector @@ sq.tsquery
            OR strpos(lower(concat_ws(' ', c.title, c.container_number, c.document_number, c.internal_number)), lower($1)) > 0
            OR EXISTS (
              SELECT 1 FROM revision_files rf
              JOIN file_assets fa ON fa.id = rf.file_id
              WHERE rf.revision_id = r.id
                AND strpos(lower(fa.original_filename), lower($1)) > 0
            )
          )
          AND ($3::text IS NULL OR r.cde_state = $3)
          AND (
            cardinality($4::text[]) = 0
            OR EXISTS (
              SELECT 1
              FROM container_tags AS ct
              JOIN tags AS t ON t.id = ct.tag_id
              WHERE ct.container_id = c.id
                AND t.slug = ANY($4::text[])
                AND t.active
            )
          )
          AND (
            $8::text = 'document_controller'
            OR c.is_internal = false
            OR c.originator_party_id = $7::uuid
          )
        ORDER BY rank DESC, c.updated_at DESC, c.id
        LIMIT $5 OFFSET $6
      `,
      [query, projectCode, cdeState, tagSlugs, limit, offset, membership.partyId, membership.roleSlug],
    );

    const total = result.rows[0]?.totalCount ?? 0;
    return NextResponse.json({
      data: result.rows,
      query,
      project: projectCode,
      limit,
      offset,
      total,
    });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error("SDM search failed", error);
    return NextResponse.json({ error: "Search is unavailable" }, { status: 503 });
  }
}
