-- UNAVORA: READ-ONLY report of synthetic and automated-test records in a database. Changes nothing.
-- Run this first, look at the numbers, and only then decide whether to run cleanup-test-data.sql.
--   docker cp infra/local/test-data-report.sql unavora-postgres:/tmp/test-data-report.sql
--   docker exec unavora-postgres psql -U unavora_local -d unavora -f /tmp/test-data-report.sql
-- Markers: is_sample flag (V14), "[SAMPLE]" titles, slugs starting "e2e-", @example.test e-mails, mock- Google subjects.

\pset footer off
SELECT 'properties: sample (is_sample)' AS what, count(*) FILTER (WHERE status = 'published') AS published, count(*) AS total FROM properties WHERE is_sample
UNION ALL SELECT 'properties: NOT sample (real)', count(*) FILTER (WHERE status = 'published'), count(*) FROM properties WHERE NOT is_sample
UNION ALL SELECT 'projects: sample', count(*) FILTER (WHERE status = 'published'), count(*) FROM projects WHERE is_sample
UNION ALL SELECT 'projects: NOT sample (real)', count(*) FILTER (WHERE status = 'published'), count(*) FROM projects WHERE NOT is_sample
UNION ALL SELECT 'articles: sample', count(*) FILTER (WHERE status = 'published'), count(*) FROM articles WHERE is_sample
UNION ALL SELECT 'articles: automated test (slug e2e-*)', count(*) FILTER (WHERE a.status = 'published'), count(*)
  FROM articles a WHERE EXISTS (SELECT 1 FROM article_translations t WHERE t.article_id = a.id AND t.slug LIKE 'e2e-%')
UNION ALL SELECT 'articles: other (real)', count(*) FILTER (WHERE a.status = 'published'), count(*)
  FROM articles a WHERE NOT a.is_sample AND NOT EXISTS (SELECT 1 FROM article_translations t WHERE t.article_id = a.id AND t.slug LIKE 'e2e-%')
UNION ALL SELECT 'testimonials: sample', count(*) FILTER (WHERE status = 'published'), count(*) FROM reviews WHERE is_sample
UNION ALL SELECT 'customers: test e-mail @example.test', NULL, count(*) FROM customers WHERE email_normalized ILIKE '%@example.test'
UNION ALL SELECT 'customers: other', NULL, count(*) FROM customers WHERE email_normalized IS NULL OR email_normalized NOT ILIKE '%@example.test';

-- Published records that look synthetic but are NOT flagged (should be 0; flag them before any production use).
SELECT 'UNFLAGGED [SAMPLE] property' AS warning, t.title FROM properties p JOIN property_translations t ON t.property_id = p.id
 WHERE NOT p.is_sample AND t.title LIKE '[SAMPLE]%'
UNION ALL SELECT 'UNFLAGGED [SAMPLE] project', t.name FROM projects p JOIN project_translations t ON t.project_id = p.id
 WHERE NOT p.is_sample AND t.name LIKE '[SAMPLE]%';
