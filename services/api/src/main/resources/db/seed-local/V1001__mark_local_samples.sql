-- LOCAL/TEST ONLY (db/seed-local). Marks the synthetic seed records as samples so that production-like settings
-- (unavora.public.include-sample-content=false) never show them. Matches only records whose titles carry [SAMPLE].
UPDATE properties p SET is_sample = true
 WHERE EXISTS (SELECT 1 FROM property_translations t WHERE t.property_id = p.id AND t.title LIKE '[SAMPLE]%');
UPDATE projects p SET is_sample = true
 WHERE EXISTS (SELECT 1 FROM project_translations t WHERE t.project_id = p.id AND t.name LIKE '[SAMPLE]%');
UPDATE articles a SET is_sample = true
 WHERE EXISTS (SELECT 1 FROM article_translations t WHERE t.article_id = a.id AND t.title LIKE '[SAMPLE]%');
