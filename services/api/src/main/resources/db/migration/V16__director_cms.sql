-- V16: Director CMS (draft -> submit -> publish with separate draft/live content), site image library, associations,
-- company contact extras, featured Insights with cover images. Additive only; nothing is published by this migration.

-- ---------- 1. permission: publishing website content ----------
-- cms.manage (content/marketing managers, director): create, edit, submit for approval.
-- cms.publish (director only): publish / unpublish. Directors received every permission in V8 by CROSS JOIN, so the
-- new permission is granted to the director role explicitly here.
INSERT INTO permissions (code, description) VALUES ('cms.publish', 'Publish or unpublish website content');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'cms.publish' WHERE r.code = 'director';

-- ---------- 2. site blocks ----------
-- One row per editable website block: home.hero, home.tiles, home.sections, careers.page, seo.<page> (e.g. seo.about).
-- draft_json is what editors change; published_json is what the website shows (NULL = never published -> built-in
-- defaults). Unpublishing clears published_json. Content is validated by the API (no HTML is stored or rendered).
CREATE TABLE site_blocks (
    block_key      varchar(80) PRIMARY KEY,
    draft_json     text,
    published_json text,
    status         varchar(15) NOT NULL DEFAULT 'draft',
    submitted_by   uuid REFERENCES users(id),
    submitted_at   timestamptz,
    published_by   uuid REFERENCES users(id),
    published_at   timestamptz,
    updated_by     uuid REFERENCES users(id),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_site_blocks_status CHECK (status IN ('draft','in_review','published','unpublished')),
    CONSTRAINT ck_site_blocks_key CHECK (block_key ~ '^(home\.(hero|tiles|sections)|careers\.page|seo\.[a-z-]{2,40})$'),
    CONSTRAINT ck_site_blocks_published CHECK (status <> 'published' OR published_json IS NOT NULL)
);

-- ---------- 3. site image library (hero, tiles, association logos, Insight covers) ----------
-- Same pipeline as listing photos: private original -> malware scan -> approval -> public copy. kind records what the
-- picture IS; "representative" stock is always labelled on the website. library_id is a constant (one library).
CREATE TABLE site_media (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-0000000000c0',
    storage_key       varchar(500) NOT NULL,
    original_key      varchar(200),
    media_type        varchar(20) NOT NULL DEFAULT 'image',
    kind              varchar(20) NOT NULL,
    caption_en        varchar(250),
    caption_hi        varchar(250),
    alt_en            varchar(250),
    alt_hi            varchar(250),
    credit            varchar(200),
    licence           varchar(200),
    sort_order        smallint NOT NULL DEFAULT 0,
    is_primary        boolean NOT NULL DEFAULT false,
    is_public         boolean NOT NULL DEFAULT false,
    processing_status varchar(20) NOT NULL DEFAULT 'pending',
    content_type      varchar(50),
    size_bytes        integer,
    sha256            char(64),
    scan_status       varchar(15) NOT NULL DEFAULT 'not_scanned',
    scanned_at        timestamptz,
    scanner           varchar(30),
    uploaded_by       uuid REFERENCES users(id),
    approved_by       uuid REFERENCES users(id),
    approved_at       timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_site_media_kind CHECK (kind IN ('representative','brand','editorial','logo','actual_photo','render')),
    CONSTRAINT ck_site_media_scan CHECK (scan_status IN ('not_scanned','clean','infected','scan_failed')),
    CONSTRAINT ck_site_media_status CHECK (processing_status IN ('pending','scanning','ready','rejected')),
    CONSTRAINT ck_site_media_approved_clean CHECK (approved_at IS NULL OR scan_status = 'clean'),
    CONSTRAINT ck_site_media_licence CHECK (approved_at IS NULL OR kind NOT IN ('representative','editorial') OR licence IS NOT NULL)
);
CREATE UNIQUE INDEX uq_site_media_primary ON site_media (library_id) WHERE is_primary;

-- ---------- 4. associations (developer / partner relationships) ----------
-- Shown publicly only when published AND the business recorded that the relationship is confirmed AND that the
-- logo may be displayed. No logo without permission; no relationship is ever invented.
CREATE TABLE associations (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     varchar(150) NOT NULL,
    relationship             varchar(30) NOT NULL,
    website_url              varchar(300),
    logo_media_id            uuid REFERENCES site_media(id) ON DELETE SET NULL,
    relationship_confirmed_at timestamptz,
    relationship_note        varchar(300),
    logo_permission_at       timestamptz,
    logo_permission_note     varchar(300),
    status                   varchar(15) NOT NULL DEFAULT 'draft',
    sort_order               smallint NOT NULL DEFAULT 0,
    updated_by               uuid REFERENCES users(id),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_associations_relationship CHECK (relationship IN ('developer_partner','channel_partner','banking_partner','industry_body','other')),
    CONSTRAINT ck_associations_status CHECK (status IN ('draft','in_review','published','unpublished')),
    CONSTRAINT ck_associations_confirmed CHECK (status <> 'published' OR relationship_confirmed_at IS NOT NULL),
    CONSTRAINT ck_associations_logo CHECK (logo_media_id IS NULL OR status <> 'published' OR logo_permission_at IS NOT NULL),
    CONSTRAINT ck_associations_url CHECK (website_url IS NULL OR website_url ~ '^https://[^\s]+$')
);

-- ---------- 5. Insights: featured article and cover image ----------
ALTER TABLE articles ADD COLUMN is_featured boolean NOT NULL DEFAULT false;
ALTER TABLE articles ADD COLUMN cover_media_id uuid REFERENCES site_media(id) ON DELETE SET NULL;
ALTER TABLE articles ADD COLUMN video_description text;
CREATE UNIQUE INDEX uq_articles_featured ON articles (is_featured) WHERE is_featured;

-- ---------- 6. company contact extras ----------
-- Working hours and a directions link per office; only verified offices are public (unchanged rule).
ALTER TABLE company_offices ADD COLUMN hours varchar(200);
ALTER TABLE company_offices ADD COLUMN directions_url varchar(500);
ALTER TABLE company_offices ADD CONSTRAINT ck_company_offices_directions
    CHECK (directions_url IS NULL OR directions_url ~ '^https://(www\.)?(google\.[a-z.]+/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl/maps|www\.openstreetmap\.org)/');

-- ---------- 7. approximate locality position (for honest "area" maps) ----------
-- Set by staff from a known public reference; NULL = no map. Never derived from a listing's private coordinates.
ALTER TABLE localities ADD COLUMN latitude numeric(9,6);
ALTER TABLE localities ADD COLUMN longitude numeric(9,6);
ALTER TABLE localities ADD CONSTRAINT ck_localities_position CHECK ((latitude IS NULL) = (longitude IS NULL)
    AND (latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)));
