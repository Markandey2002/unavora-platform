-- UNAVORA: LOCAL-ONLY cleanup of content left public by automated tests. Deletes nothing.
-- What it does:
--   * archives Insights and projects, and withdraws listings, whose slug starts with "e2e-" (created by the Playwright
--     journeys), so they leave the public website. They stay in the CRM.
--   * flags any record titled "[SAMPLE]" that is not yet flagged as is_sample (V14), so production-like settings
--     hide it.
-- It never touches real records (no [SAMPLE] title, no e2e- slug), customers, leads or files.
-- Run test-data-report.sql first and look at the numbers.
--   docker cp infra/local/cleanup-test-data.sql unavora-postgres:/tmp/cleanup-test-data.sql
--   docker exec unavora-postgres psql -U unavora_local -d unavora -v ON_ERROR_STOP=1 -f /tmp/cleanup-test-data.sql

\set QUIET on
BEGIN;

-- Guard: only a local UNAVORA database has the synthetic seed director (V1000, local/test profiles only).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = '00000000-0000-0000-0000-000000000101'
                 AND email = 'director.local@example.test') THEN
    RAISE EXCEPTION 'Not a local UNAVORA database (synthetic seed users missing). Nothing was changed.';
  END IF;
END $$;

\set QUIET off
UPDATE articles a SET status = 'archived', updated_at = now()
 WHERE a.status <> 'archived'
   AND EXISTS (SELECT 1 FROM article_translations t WHERE t.article_id = a.id AND t.slug LIKE 'e2e-%');
UPDATE projects p SET status = 'archived'
 WHERE p.status = 'published' AND EXISTS (SELECT 1 FROM project_translations t WHERE t.project_id = p.id AND t.slug LIKE 'e2e-%');
UPDATE properties p SET status = 'withdrawn'
 WHERE p.status = 'published' AND EXISTS (SELECT 1 FROM property_translations t WHERE t.property_id = p.id AND t.slug LIKE 'e2e-%');
UPDATE properties p SET is_sample = true
 WHERE NOT is_sample AND EXISTS (SELECT 1 FROM property_translations t WHERE t.property_id = p.id AND t.title LIKE '[SAMPLE]%');
UPDATE projects p SET is_sample = true
 WHERE NOT is_sample AND EXISTS (SELECT 1 FROM project_translations t WHERE t.project_id = p.id AND t.name LIKE '[SAMPLE]%');
UPDATE articles a SET is_sample = true
 WHERE NOT is_sample AND EXISTS (SELECT 1 FROM article_translations t WHERE t.article_id = a.id AND t.title LIKE '[SAMPLE]%');
COMMIT;
