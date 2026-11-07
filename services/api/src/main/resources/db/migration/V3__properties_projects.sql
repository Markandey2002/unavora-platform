-- V3: reference data, projects and properties (one set of tables for website + CRM + mobile).

CREATE TABLE localities (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    city     varchar(100) NOT NULL,
    state    varchar(100) NOT NULL,
    name_en  varchar(150) NOT NULL,
    name_hi  varchar(150),
    pincode  varchar(10),
    slug     varchar(150) NOT NULL UNIQUE,
    is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_localities_city ON localities (lower(city));
CREATE INDEX idx_localities_name_trgm ON localities USING gin (name_en gin_trgm_ops);

CREATE TABLE property_types (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code     varchar(50) NOT NULL UNIQUE,
    category varchar(20) NOT NULL,
    name_en  varchar(100) NOT NULL,
    name_hi  varchar(100),
    sort_order smallint NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    CONSTRAINT ck_property_types_category CHECK (category IN ('residential','commercial','land'))
);

CREATE TABLE amenities (
    id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code    varchar(50) NOT NULL UNIQUE,
    name_en varchar(100) NOT NULL,
    name_hi varchar(100),
    is_active boolean NOT NULL DEFAULT true
);

-- ---------- projects ----------
CREATE TABLE projects (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_number     bigint NOT NULL UNIQUE DEFAULT nextval('project_number_seq'),
    locality_id       uuid REFERENCES localities(id),
    status            varchar(20) NOT NULL DEFAULT 'draft',
    construction_status varchar(30),
    possession_date   date,
    rera_registration_number varchar(60),           -- NEVER shown unless rera_verified_at is set
    rera_verified_at  timestamptz,
    published_at      timestamptz,
    created_by        uuid REFERENCES users(id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_projects_status CHECK (status IN ('draft','pending_review','published','archived')),
    CONSTRAINT ck_projects_published CHECK (status <> 'published' OR published_at IS NOT NULL)
);
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE project_translations (
    project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    language    char(2) NOT NULL,
    name        varchar(200) NOT NULL,
    slug        varchar(200) NOT NULL,
    description text,
    meta_title  varchar(160),
    meta_description varchar(320),
    review_status varchar(20) NOT NULL DEFAULT 'draft',
    reviewed_at timestamptz,
    PRIMARY KEY (project_id, language),
    CONSTRAINT uq_project_slug UNIQUE (language, slug),
    CONSTRAINT ck_project_tr_lang CHECK (language IN ('en','hi')),
    CONSTRAINT ck_project_tr_review CHECK (review_status IN ('draft','in_review','approved'))
);

CREATE TABLE project_media (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    storage_key    varchar(500) NOT NULL,
    media_type     varchar(20) NOT NULL,
    sort_order     smallint NOT NULL DEFAULT 0,
    alt_en         varchar(250),
    alt_hi         varchar(250),
    is_public      boolean NOT NULL DEFAULT true,
    CONSTRAINT ck_project_media_type CHECK (media_type IN ('image','video','floorplan','brochure'))
);
CREATE INDEX idx_project_media_project ON project_media (project_id, sort_order);

CREATE TABLE project_units (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label        varchar(100) NOT NULL,
    bedrooms     smallint,
    area_value   numeric(12,2),
    area_unit    varchar(10),
    base_price   numeric(14,2),
    CONSTRAINT ck_project_units_price CHECK (base_price IS NULL OR base_price > 0),
    CONSTRAINT ck_project_units_area CHECK (area_unit IS NULL OR area_unit IN ('sq_ft','sq_yd','sq_m','acre'))
);
CREATE INDEX idx_project_units_project ON project_units (project_id);

-- ---------- properties ----------
CREATE TABLE properties (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_number       bigint NOT NULL UNIQUE DEFAULT nextval('property_number_seq'),
    project_id          uuid REFERENCES projects(id),
    property_type_id    uuid NOT NULL REFERENCES property_types(id),
    locality_id         uuid NOT NULL REFERENCES localities(id),
    purpose             varchar(10) NOT NULL DEFAULT 'sale',
    status              varchar(20) NOT NULL DEFAULT 'draft',
    availability        varchar(20) NOT NULL DEFAULT 'available',
    verification_status varchar(20) NOT NULL DEFAULT 'not_verified',
    address_line        varchar(300),                    -- private: never returned by public APIs
    latitude            numeric(9,6),
    longitude           numeric(9,6),
    hide_exact_location boolean NOT NULL DEFAULT true,
    price_amount        numeric(14,2),
    price_on_request    boolean NOT NULL DEFAULT false,
    price_negotiable    boolean NOT NULL DEFAULT false,
    currency            char(3) NOT NULL DEFAULT 'INR',
    area_unit           varchar(10) NOT NULL DEFAULT 'sq_ft',
    built_up_area       numeric(12,2),
    carpet_area         numeric(12,2),
    plot_area           numeric(12,2),
    bedrooms            smallint,
    bathrooms           smallint,
    parking_spaces      smallint,
    furnishing          varchar(20),
    possession_status   varchar(20),
    possession_date     date,
    floor_number        smallint,
    total_floors        smallint,
    owner_user_id       uuid REFERENCES users(id),       -- assigned employee
    created_by          uuid REFERENCES users(id),
    submitted_at        timestamptz,
    reviewed_by         uuid REFERENCES users(id),
    reviewed_at         timestamptz,
    rejection_reason    text,
    published_at        timestamptz,
    availability_confirmed_at timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_properties_purpose CHECK (purpose IN ('sale','rent')),
    CONSTRAINT ck_properties_status CHECK (status IN ('draft','validation','pending_review','rejected','approved','published','withdrawn','sold')),
    CONSTRAINT ck_properties_availability CHECK (availability IN ('available','on_hold','under_offer','sold','withdrawn')),
    CONSTRAINT ck_properties_verification CHECK (verification_status IN ('not_verified','in_review','verified')),
    CONSTRAINT ck_properties_area_unit CHECK (area_unit IN ('sq_ft','sq_yd','sq_m','acre')),
    CONSTRAINT ck_properties_furnishing CHECK (furnishing IS NULL OR furnishing IN ('unfurnished','semi_furnished','furnished')),
    CONSTRAINT ck_properties_possession CHECK (possession_status IS NULL OR possession_status IN ('ready_to_move','under_construction','upcoming')),
    CONSTRAINT ck_properties_price_positive CHECK (price_amount IS NULL OR price_amount > 0),
    CONSTRAINT ck_properties_price_or_request CHECK (status <> 'published' OR price_on_request OR price_amount IS NOT NULL),
    CONSTRAINT ck_properties_published_at CHECK (status <> 'published' OR published_at IS NOT NULL),
    CONSTRAINT ck_properties_areas CHECK (coalesce(built_up_area,1) > 0 AND coalesce(carpet_area,1) > 0 AND coalesce(plot_area,1) > 0),
    CONSTRAINT ck_properties_counts CHECK (coalesce(bedrooms,0) BETWEEN 0 AND 50 AND coalesce(bathrooms,0) BETWEEN 0 AND 50),
    CONSTRAINT ck_properties_lat CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT ck_properties_lon CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Public search predicate: status = 'published' AND availability IN ('available','under_offer').
CREATE INDEX idx_properties_public_newest ON properties (published_at DESC, id DESC)
    WHERE status = 'published' AND availability IN ('available','under_offer');
CREATE INDEX idx_properties_public_price ON properties (price_amount, id)
    WHERE status = 'published' AND availability IN ('available','under_offer');
CREATE INDEX idx_properties_public_locality ON properties (locality_id)
    WHERE status = 'published' AND availability IN ('available','under_offer');
CREATE INDEX idx_properties_type ON properties (property_type_id);
CREATE INDEX idx_properties_owner ON properties (owner_user_id, status);
CREATE INDEX idx_properties_status ON properties (status);
CREATE INDEX idx_properties_project ON properties (project_id);

CREATE TABLE property_translations (
    property_id      uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    language         char(2) NOT NULL,
    title            varchar(200) NOT NULL,
    slug             varchar(200) NOT NULL,
    description      text,
    meta_title       varchar(160),
    meta_description varchar(320),
    review_status    varchar(20) NOT NULL DEFAULT 'draft',
    reviewed_at      timestamptz,
    search_vector    tsvector GENERATED ALWAYS AS (
        to_tsvector('simple'::regconfig, coalesce(title,'') || ' ' || coalesce(description,''))
    ) STORED,
    PRIMARY KEY (property_id, language),
    CONSTRAINT uq_property_slug UNIQUE (language, slug),
    CONSTRAINT ck_property_tr_lang CHECK (language IN ('en','hi')),
    CONSTRAINT ck_property_tr_review CHECK (review_status IN ('draft','in_review','approved'))
);
CREATE INDEX idx_property_tr_search ON property_translations USING gin (search_vector);

CREATE TABLE property_amenities (
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    amenity_id  uuid NOT NULL REFERENCES amenities(id),
    PRIMARY KEY (property_id, amenity_id)
);

CREATE TABLE property_media (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id       uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    storage_key       varchar(500) NOT NULL,
    media_type        varchar(20) NOT NULL,
    sort_order        smallint NOT NULL DEFAULT 0,
    alt_en            varchar(250),
    alt_hi            varchar(250),
    is_public         boolean NOT NULL DEFAULT true,
    processing_status varchar(20) NOT NULL DEFAULT 'pending',
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_property_media_type CHECK (media_type IN ('image','video','floorplan')),
    CONSTRAINT ck_property_media_status CHECK (processing_status IN ('pending','scanning','ready','rejected'))
);
CREATE INDEX idx_property_media_property ON property_media (property_id, sort_order);

CREATE TABLE property_documents (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id         uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    document_type       varchar(50) NOT NULL,
    storage_key         varchar(500) NOT NULL,        -- private bucket only
    verification_status varchar(20) NOT NULL DEFAULT 'unreviewed',
    reviewed_by         uuid REFERENCES users(id),
    reviewed_at         timestamptz,
    uploaded_by         uuid REFERENCES users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_property_docs_status CHECK (verification_status IN ('unreviewed','verified','rejected'))
);
CREATE INDEX idx_property_documents_property ON property_documents (property_id);

CREATE TABLE property_status_history (
    id                bigserial PRIMARY KEY,
    property_id       uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    from_status       varchar(20),
    to_status         varchar(20) NOT NULL,
    from_availability varchar(20),
    to_availability   varchar(20),
    changed_by        uuid REFERENCES users(id),
    reason            text,
    changed_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_property_status_history ON property_status_history (property_id, changed_at DESC);

CREATE TABLE property_price_history (
    id          bigserial PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    old_price   numeric(14,2),
    new_price   numeric(14,2),
    changed_by  uuid REFERENCES users(id),
    changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_property_price_history ON property_price_history (property_id, changed_at DESC);
