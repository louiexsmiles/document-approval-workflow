-- Reference queries for inspecting the approval data.
--
-- While the stack is running:
--   psql postgresql://postgres:postgres@localhost:5432/document_approval -f docs/queries.sql
-- or paste individual queries into any client pointed at that connection.


-- ---------------------------------------------------------------------------
-- 1. Document overview — the one to start with.
--    What exists, where each document is, and who it is waiting on.
-- ---------------------------------------------------------------------------
SELECT
  substr(d.id::text, 1, 8)                    AS id,
  d.title,
  to_char(d.created_at, 'YYYY-MM-DD HH24:MI') AS created,
  d.status,
  d.approval_round                            AS round,
  COALESCE(cur.name, '—')                     AS current_stage,
  COALESCE(string_agg(u.name, ', ' ORDER BY u.name), '—') AS waiting_on
FROM documents d
-- LEFT JOIN, not JOIN: a finished document has no current stage, and an inner join
-- would drop it from the report entirely.
LEFT JOIN approval_stages cur ON cur.id = d.current_stage_id
LEFT JOIN stage_approvers sa  ON sa.stage_id = cur.id
LEFT JOIN users u             ON u.id = sa.user_id
GROUP BY d.id, d.title, d.created_at, d.status, d.approval_round, cur.name
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
  COALESCE(tgt.name, '—')  AS rejects_to,
  COALESCE(string_agg(u.name, ', ' ORDER BY u.name), '(none)') AS approvers
FROM documents d
JOIN approval_stages s        ON s.document_id = d.id
LEFT JOIN approval_stages tgt ON tgt.id = s.reject_target_stage_id
LEFT JOIN stage_approvers sa  ON sa.stage_id = s.id
LEFT JOIN users u             ON u.id = sa.user_id
GROUP BY d.id, d.title, d.status, d.created_at, s.position, s.name, s.policy,
         s.reject_behavior, tgt.name
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
  s.name  AS stage,
  s.policy,
  u.name  AS approver,
  CASE WHEN s.id = d.current_stage_id THEN '<<< current' ELSE '' END AS marker
FROM documents d
JOIN approval_stages s   ON s.document_id = d.id
JOIN stage_approvers sa  ON sa.stage_id = s.id
JOIN users u             ON u.id = sa.user_id
WHERE d.id::text LIKE '%'   -- <<< change this to a doc_id prefix
ORDER BY d.created_at DESC, d.id, s.position;


-- ---------------------------------------------------------------------------
-- 4. Approval history — who did what, when, and in which round.
--    Rounds are the reset mechanism: rejecting increments the round, and approvals
--    only count within the current one. Nothing is ever deleted.
-- ---------------------------------------------------------------------------
SELECT
  to_char(e.created_at, 'YYYY-MM-DD HH24:MI:SS') AS at,
  d.title,
  e.round,
  COALESCE(e.stage_snapshot->>'name', '(document level)') AS stage_at_the_time,
  u.name   AS actor,
  e.action,
  COALESCE(e.comment, '') AS comment
FROM approval_events e
JOIN documents d ON d.id = e.document_id
JOIN users u     ON u.id = e.actor_id
ORDER BY d.created_at DESC, e.created_at;


-- ---------------------------------------------------------------------------
-- 5. Proof the history does not rewrite itself.
--    Each event stores the stage as it was at the moment someone acted. Rename a
--    stage that already has events and the two columns below diverge: the record
--    keeps the old name while the workflow shows the new one.
--    Returns nothing until such a rename has happened.
-- ---------------------------------------------------------------------------
SELECT
  d.title,
  e.round,
  u.name                    AS actor,
  e.action,
  e.stage_snapshot->>'name' AS recorded_as,
  s.name                    AS called_now
FROM approval_events e
JOIN documents d       ON d.id = e.document_id
JOIN users u           ON u.id = e.actor_id
JOIN approval_stages s ON s.id = e.stage_id
WHERE e.stage_snapshot->>'name' IS DISTINCT FROM s.name
ORDER BY e.created_at;


-- ---------------------------------------------------------------------------
-- 6. Row counts, for a quick sanity check.
-- ---------------------------------------------------------------------------
SELECT 'users' AS "table", count(*) FROM users
UNION ALL SELECT 'documents',       count(*) FROM documents
UNION ALL SELECT 'approval_stages', count(*) FROM approval_stages
UNION ALL SELECT 'stage_approvers', count(*) FROM stage_approvers
UNION ALL SELECT 'approval_events', count(*) FROM approval_events;
