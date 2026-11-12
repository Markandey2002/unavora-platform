-- V13: public website programme (Phases B-D). Additive only; the CRM stays the single source of truth for customers
-- and leads (owner submissions are CRM leads with a detail row; no parallel customer or lead tables).

-- ---------- projects / properties ----------
ALTER TABLE projects ADD COLUMN developer_name varchar(200);            -- shown only when entered by staff
ALTER TABLE properties ADD COLUMN featured_at timestamptz;              -- director-chosen featured listings (NULL = not featured)
CREATE INDEX idx_properties_featured ON properties (featured_at DESC) WHERE featured_at IS NOT NULL;

-- ---------- owner property submissions ("List your property") ----------
INSERT INTO lead_sources (code, name, channel_type) VALUES ('website_owner', 'Website - property owner', 'website');

ALTER TABLE leads DROP CONSTRAINT ck_leads_enquiry_type;
ALTER TABLE leads ADD CONSTRAINT ck_leads_enquiry_type CHECK (enquiry_type IN
    ('residential','commercial','project','channel_partner','property','general','callback','site_visit','property_owner'));

CREATE TABLE property_submissions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id            uuid NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
    city               varchar(100) NOT NULL,
    locality           varchar(150),
    property_type_code varchar(30) NOT NULL REFERENCES property_types(code),
    purpose            varchar(10) NOT NULL,
    expected_price     numeric(14,2),
    area_value         numeric(12,2),
    area_unit          varchar(10),
    message            text,
    status             varchar(20) NOT NULL DEFAULT 'submitted',
    reviewed_by        uuid REFERENCES users(id),
    reviewed_at        timestamptz,
    review_note        text,
    decided_by         uuid REFERENCES users(id),
    decided_at         timestamptz,
    decision_note      text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_submission_purpose CHECK (purpose IN ('sale','rent')),
    CONSTRAINT ck_submission_status CHECK (status IN ('submitted','reviewed','approved','rejected')),
    CONSTRAINT ck_submission_price CHECK (expected_price IS NULL OR expected_price > 0),
    CONSTRAINT ck_submission_area CHECK (area_value IS NULL OR area_value > 0),
    CONSTRAINT ck_submission_area_unit CHECK (area_unit IS NULL OR area_unit IN ('sq_ft','sq_yd','sq_m','acre')),
    -- approval is a director decision recorded on a reviewed submission; it never publishes a listing by itself
    CONSTRAINT ck_submission_decision CHECK (status NOT IN ('approved','rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX idx_property_submissions_status ON property_submissions (status, created_at DESC);

-- Private files: stored outside any public path, never served to the public; staff download only with lead access.
CREATE TABLE property_submission_files (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id  uuid NOT NULL REFERENCES property_submissions(id) ON DELETE CASCADE,
    storage_key    varchar(200) NOT NULL UNIQUE,
    original_name  varchar(200) NOT NULL,
    content_type   varchar(50) NOT NULL,
    size_bytes     integer NOT NULL,
    sha256         char(64) NOT NULL,
    scan_status    varchar(15) NOT NULL DEFAULT 'not_scanned',
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_submission_file_type CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
    CONSTRAINT ck_submission_file_size CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    CONSTRAINT ck_submission_file_scan CHECK (scan_status IN ('not_scanned','clean','infected'))
);

-- ---------- customer favourites ----------
CREATE TABLE customer_favourites (
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (customer_id, property_id)
);

-- ---------- Insights: articles and videos (director-managed, cms.manage) ----------
CREATE TABLE articles (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind          varchar(10) NOT NULL DEFAULT 'article',
    category      varchar(20) NOT NULL,
    author_name   varchar(120) NOT NULL,
    youtube_id    varchar(11),
    status        varchar(15) NOT NULL DEFAULT 'draft',
    published_at  timestamptz,
    created_by    uuid REFERENCES users(id),
    updated_by    uuid REFERENCES users(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_articles_kind CHECK (kind IN ('article','video')),
    CONSTRAINT ck_articles_category CHECK (category IN ('market','guide','education','investment','location','company')),
    CONSTRAINT ck_articles_status CHECK (status IN ('draft','published','archived')),
    CONSTRAINT ck_articles_published CHECK (status <> 'published' OR published_at IS NOT NULL),
    CONSTRAINT ck_articles_video CHECK (kind <> 'video' OR youtube_id IS NOT NULL),
    CONSTRAINT ck_articles_youtube CHECK (youtube_id IS NULL OR youtube_id ~ '^[A-Za-z0-9_-]{11}$')
);
CREATE TRIGGER trg_articles_updated_at BEFORE UPDATE ON articles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_articles_published ON articles (status, published_at DESC);

CREATE TABLE article_translations (
    article_id  uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    language    char(2) NOT NULL,
    title       varchar(200) NOT NULL,
    slug        varchar(200) NOT NULL,
    excerpt     varchar(400),
    body        text NOT NULL,
    PRIMARY KEY (article_id, language),
    CONSTRAINT uq_article_slug UNIQUE (language, slug),
    CONSTRAINT ck_article_tr_lang CHECK (language IN ('en','hi')),
    CONSTRAINT ck_article_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- ---------- testimonials: only with the customer's documented permission to display ----------
ALTER TABLE reviews
    ADD COLUMN display_name varchar(80),
    ADD COLUMN display_consent_at timestamptz,
    ADD COLUMN display_consent_note varchar(300),
    ADD CONSTRAINT ck_reviews_published_consent CHECK (status <> 'published' OR (display_consent_at IS NOT NULL AND display_name IS NOT NULL));
