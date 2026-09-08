-- Handy queries for inspecting the approval data.
-- Point SQLTools at the "document_approval (dev)" connection, put the cursor inside a
-- query, and use the "Run on active connection" link above it.

-- ---------------------------------------------------------------------------
-- 1. Document overview — the one to start with.
--    What exists, where each document is, and who it is waiting on.
-- ---------------------------------------------------------------------------
SELECT
  substr(d.id::text, 1, 8)                    AS id,
  d.title,
  to_char(d.created_at, 'YYYY-MM-DD HH24:MI') AS created,
  d.status,
  COALESCE(cur.name, '—')                     AS current_stage,
  COALESCE(string_agg(u.name, ', ' ORDER BY u.name), '—') AS waiting_on
FROM documents d
-- LEFT JOIN, not JOIN: a finished document has no current stage, and an inner join
-- would drop it from the report entirely.
LEFT JOIN approval_stages cur
       ON cur.document_id = d.id
      AND d.status = 'IN_PROGRESS'
      -- Legacy mapping. Once documents.current_stage_id exists this whole CASE
      -- collapses to: ON cur.id = d.current_stage_id
      AND cur.position = CASE d.current_stage
            WHEN 'DRAFT_REVIEW'   THEN 0
            WHEN 'LEGAL_REVIEW'   THEN 1
            WHEN 'FINAL_APPROVAL' THEN 2
          END
LEFT JOIN stage_approvers sa ON sa.stage_id = cur.id
LEFT JOIN users u            ON u.id = sa.user_id
GROUP BY d.id, d.title, d.created_at, d.status, cur.name
ORDER BY d.created_at DESC;


-- ---------------------------------------------------------------------------
-- 2. Every document's full workflow, in order.
--    One row per stage. A document appears once per stage it has.
-- ---------------------------------------------------------------------------
SELECT
  substr(d.id::text, 1, 8) AS doc_id,
  d.title,
  d.status,
  s.position,
  s.name                   AS stage,
  s.policy,
  s.reject_behavior,
  COALESCE(string_agg(u.name, ', ' ORDER BY u.name), '(none)') AS approvers
FROM documents d
JOIN approval_stages s   ON s.document_id = d.id
LEFT JOIN stage_approvers sa ON sa.stage_id = s.id
LEFT JOIN users u            ON u.id = sa.user_id
GROUP BY d.id, d.title, d.status, d.created_at, s.position, s.name, s.policy, s.reject_behavior
-- d.id is the tiebreaker. Without it, documents sharing a created_at (the seed inserts
-- them in one transaction) interleave, because position then sorts across all of them.
ORDER BY d.created_at DESC, d.id, s.position;


-- ---------------------------------------------------------------------------
-- 3. One document, with the current stage marked.
--    Paste a doc_id prefix from query 1 or 2 into the WHERE clause below.
--    Filtering on id rather than title because titles are not unique — ten yearly
--    renewals of the same contract all share one.
-- ---------------------------------------------------------------------------
SELECT
  s.position,
  s.name        AS stage,
  s.policy,
  u.name        AS approver,
  CASE
    WHEN d.status <> 'IN_PROGRESS' THEN ''
    WHEN s.position = CASE d.current_stage
           WHEN 'DRAFT_REVIEW'   THEN 0
           WHEN 'LEGAL_REVIEW'   THEN 1
           WHEN 'FINAL_APPROVAL' THEN 2
         END
    THEN '<<< current'
    ELSE ''
  END AS marker
FROM documents d
JOIN approval_stages s   ON s.document_id = d.id
JOIN stage_approvers sa  ON sa.stage_id = s.id
JOIN users u             ON u.id = sa.user_id
WHERE d.id::text LIKE '5431234c%'   -- <<< change this
ORDER BY s.position;


-- ---------------------------------------------------------------------------
-- 4. Approval history — who did what, when.
--    Empty until the service starts writing events.
-- ---------------------------------------------------------------------------
SELECT
  to_char(e.created_at, 'YYYY-MM-DD HH24:MI:SS') AS at,
  d.title,
  COALESCE(s.name, '(document level)') AS stage,
  u.name   AS actor,
  e.action,
  COALESCE(e.comment, '') AS comment
FROM approval_events e
JOIN documents d      ON d.id = e.document_id
JOIN users u          ON u.id = e.actor_id
LEFT JOIN approval_stages s ON s.id = e.stage_id
ORDER BY e.created_at DESC;


-- ---------------------------------------------------------------------------
-- 5. Migration check — old columns vs new tables.
--    The two halves must match exactly. This is the proof the data migration
--    lost nothing. Delete this query once the old columns are dropped.
-- ---------------------------------------------------------------------------
SELECT
  d.title,
  a.name AS old_draft, b.name AS old_legal, c.name AS old_final,
  max(CASE WHEN s.position = 0 THEN u.name END) AS new_pos0,
  max(CASE WHEN s.position = 1 THEN u.name END) AS new_pos1,
  max(CASE WHEN s.position = 2 THEN u.name END) AS new_pos2
FROM documents d
JOIN users a ON a.id = d.draft_review_approver_id
JOIN users b ON b.id = d.legal_review_approver_id
JOIN users c ON c.id = d.final_approval_approver_id
JOIN approval_stages s   ON s.document_id = d.id
JOIN stage_approvers sa  ON sa.stage_id = s.id
JOIN users u             ON u.id = sa.user_id
GROUP BY d.title, a.name, b.name, c.name
ORDER BY d.title;


-- ---------------------------------------------------------------------------
-- 6. Row counts, for a quick sanity check.
-- ---------------------------------------------------------------------------
SELECT 'users' AS "table", count(*) FROM users
UNION ALL SELECT 'documents',       count(*) FROM documents
UNION ALL SELECT 'approval_stages', count(*) FROM approval_stages
UNION ALL SELECT 'stage_approvers', count(*) FROM stage_approvers
UNION ALL SELECT 'approval_events', count(*) FROM approval_events;
