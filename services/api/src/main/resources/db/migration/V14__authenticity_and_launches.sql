-- V14: synthetic-data markers, new-launch fields and media authenticity metadata (website completion, 2026-11-09).
-- Additive only. No data is invented here: every new flag defaults to the safe value (not sample, not public).

-- ---------- 1. synthetic (sample) records ----------
-- is_sample = true marks local/test synthetic content. Public APIs exclude these rows unless the deployment
-- explicitly sets unavora.public.include-sample-content=true (allowed only in the local and test profiles, enforced
-- at startup by SyntheticDataGuard).
ALTER TABLE properties ADD COLUMN is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE projects   ADD COLUMN is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE articles   ADD COLUMN is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE reviews    ADD COLUMN is_sample boolean NOT NULL DEFAULT false;
CREATE INDEX idx_properties_sample ON properties (id) WHERE is_sample;
CREATE INDEX idx_projects_sample   ON projects (id) WHERE is_sample;
CREATE INDEX idx_articles_sample   ON articles (id) WHERE is_sample;

-- ---------- 2. new launches ----------
-- category / primary type: what the launch offers (filters on the New Launches page).
-- developer_verified: the developer name is shown publicly only after the business confirms the relationship.
-- price_public / possession_public: a starting price and a possession date are shown only when approved/documented.
ALTER TABLE projects ADD COLUMN category varchar(20);
ALTER TABLE projects ADD CONSTRAINT ck_projects_category CHECK (category IS NULL OR category IN ('residential','commercial','mixed_use','land'));
ALTER TABLE projects ADD COLUMN primary_type_id uuid REFERENCES property_types(id);
ALTER TABLE projects ADD COLUMN developer_verified boolean NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN price_public boolean NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN possession_public boolean NOT NULL DEFAULT false;
ALTER TABLE projects ADD CONSTRAINT ck_projects_developer_verified CHECK (NOT developer_verified OR developer_name IS NOT NULL);
ALTER TABLE projects ADD CONSTRAINT ck_projects_possession_public CHECK (NOT possession_public OR possession_date IS NOT NULL);
CREATE INDEX idx_projects_public_newest ON projects (published_at DESC, id DESC) WHERE status = 'published';

-- ---------- 3. media authenticity metadata ----------
-- kind: what the picture really is. A listing/project gallery may contain only actual_photo, render (project
-- renders supplied by the developer) and floor_plan; representative stock never belongs to a listing.
-- caption/credit/licence/approval are recorded for every image. is_primary: the cover image (at most one).
ALTER TABLE property_media ADD COLUMN kind varchar(20) NOT NULL DEFAULT 'actual_photo';
ALTER TABLE property_media ADD COLUMN caption_en varchar(250);
ALTER TABLE property_media ADD COLUMN caption_hi varchar(250);
ALTER TABLE property_media ADD COLUMN credit varchar(200);
ALTER TABLE property_media ADD COLUMN licence varchar(200);
ALTER TABLE property_media ADD COLUMN is_primary boolean NOT NULL DEFAULT false;
ALTER TABLE property_media ADD COLUMN approved_by uuid REFERENCES users(id);
ALTER TABLE property_media ADD COLUMN approved_at timestamptz;
ALTER TABLE property_media ADD CONSTRAINT ck_property_media_kind CHECK (kind IN ('actual_photo','render','floor_plan'));
CREATE UNIQUE INDEX uq_property_media_primary ON property_media (property_id) WHERE is_primary;

ALTER TABLE project_media ADD COLUMN kind varchar(20) NOT NULL DEFAULT 'actual_photo';
ALTER TABLE project_media ADD COLUMN caption_en varchar(250);
ALTER TABLE project_media ADD COLUMN caption_hi varchar(250);
ALTER TABLE project_media ADD COLUMN credit varchar(200);
ALTER TABLE project_media ADD COLUMN licence varchar(200);
ALTER TABLE project_media ADD COLUMN is_primary boolean NOT NULL DEFAULT false;
ALTER TABLE project_media ADD COLUMN processing_status varchar(20) NOT NULL DEFAULT 'pending';
ALTER TABLE project_media ADD COLUMN approved_by uuid REFERENCES users(id);
ALTER TABLE project_media ADD COLUMN approved_at timestamptz;
ALTER TABLE project_media ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE project_media ADD CONSTRAINT ck_project_media_kind CHECK (kind IN ('actual_photo','render','floor_plan'));
ALTER TABLE project_media ADD CONSTRAINT ck_project_media_status CHECK (processing_status IN ('pending','scanning','ready','rejected'));
CREATE UNIQUE INDEX uq_project_media_primary ON project_media (project_id) WHERE is_primary;

-- ---------- 4. testimonials ----------
-- A star rating is shown only when the customer actually gave one; text-only testimonials stay rating-less.
ALTER TABLE reviews ALTER COLUMN rating DROP NOT NULL;
