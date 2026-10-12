/**
 * SQL predicate for files visible to a project member.
 *
 * Parameters are intentionally fixed so download endpoints can share the
 * same authorization boundary:
 *   $3 = membership party id
 *   $4 = authenticated user id
 *   $5 = membership role slug
 *
 * Document Controllers can inspect all project files. Other members can see
 * files attached to external revisions, files attached to an internal
 * revision owned by their party, and their own unattached upload. Draft files
 * remain private to their creator (or a Document Controller).
 */
export const fileVisibilityPredicate = `
  AND (
    $5::text = 'document_controller'
    OR (
      fa.created_by_user_id = $4::uuid
      AND NOT EXISTS (
        SELECT 1 FROM revision_files own_rf WHERE own_rf.file_id = fa.id
        UNION ALL
        SELECT 1 FROM draft_files own_df WHERE own_df.file_id = fa.id
        UNION ALL
        SELECT 1 FROM drawing_endorsements own_de WHERE own_de.evidence_file_id = fa.id
      )
    )
    OR EXISTS (
      SELECT 1
      FROM revision_files rf
      JOIN document_revisions dr ON dr.id = rf.revision_id
      JOIN containers rc ON rc.id = dr.container_id
      WHERE rf.file_id = fa.id
        AND (rc.is_internal = false OR rc.originator_party_id = $3::uuid)
    )
    OR EXISTS (
      SELECT 1
      FROM draft_files df
      JOIN drafts d ON d.id = df.draft_id
      WHERE df.file_id = fa.id
        AND d.creator_user_id = $4::uuid
        AND (d.is_internal = false OR d.owning_party_id = $3::uuid)
    )
    OR EXISTS (
      SELECT 1
      FROM drawing_endorsements de
      JOIN document_revisions er ON er.id = de.revision_id
      JOIN containers ec ON ec.id = er.container_id
      WHERE de.evidence_file_id = fa.id
        AND (ec.is_internal = false OR ec.originator_party_id = $3::uuid)
    )
  )
`;
