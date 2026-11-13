-- V18: illustrative showcase items (owner brief 2026-11-12). Representative examples that make the website visually
-- rich while real inventory is small. They are NOT listings: the table deliberately has no price, area, possession,
-- RERA, developer, address or availability columns, so none of those can ever be shown for a showcase item. Every
-- card is labelled "Illustrative example" on the website. A showcase item may point to a PUBLISHED real property or
-- project (the CTA then opens that record), but it is never converted into one. Additive only; nothing is published.

CREATE TABLE showcase_items (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category           varchar(20) NOT NULL,
    title_en           varchar(90) NOT NULL,
    title_hi           varchar(90),
    description_en     varchar(300) NOT NULL,
    description_hi     varchar(300),
    image_media_id     uuid REFERENCES site_media(id) ON DELETE RESTRICT,
    cta                varchar(20) NOT NULL DEFAULT 'enquire',
    linked_property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
    linked_project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
    sort_order         smallint NOT NULL DEFAULT 0,
    status             varchar(15) NOT NULL DEFAULT 'draft',
    submitted_by       uuid REFERENCES users(id),
    submitted_at       timestamptz,
    published_by       uuid REFERENCES users(id),
    published_at       timestamptz,
    created_by         uuid REFERENCES users(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_by         uuid REFERENCES users(id),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_showcase_category CHECK (category IN ('residential','villa','commercial','office','land','project_style')),
    CONSTRAINT ck_showcase_cta CHECK (cta IN ('enquire','register_interest','browse','view_record')),
    CONSTRAINT ck_showcase_status CHECK (status IN ('draft','in_review','published','unpublished','archived')),
    CONSTRAINT ck_showcase_one_link CHECK (linked_property_id IS NULL OR linked_project_id IS NULL),
    CONSTRAINT ck_showcase_record_link CHECK (cta <> 'view_record' OR linked_property_id IS NOT NULL OR linked_project_id IS NOT NULL),
    CONSTRAINT ck_showcase_published_image CHECK (status <> 'published' OR image_media_id IS NOT NULL)
);
CREATE INDEX idx_showcase_public ON showcase_items (category, sort_order) WHERE status = 'published';

-- Leads from showcase cards: their own source so the CRM can report on them; never linked to a property/project.
INSERT INTO lead_sources (code, name, channel_type) VALUES ('website_showcase', 'Website - showcase / register interest', 'website');
