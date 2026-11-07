-- V6: notifications (transactional outbox), CMS/content, reviews, audit, data-subject requests.

-- ---------- notifications ----------
CREATE TABLE outbox_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type  varchar(60) NOT NULL,
    aggregate_id    varchar(64) NOT NULL,
    event_type      varchar(80) NOT NULL,
    schema_version  smallint NOT NULL DEFAULT 1,
    payload_json    text NOT NULL,
    dedupe_key      varchar(200) UNIQUE,
    status          varchar(15) NOT NULL DEFAULT 'pending',
    attempts        integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    locked_until    timestamptz,
    sqs_message_id  varchar(100),
    created_at      timestamptz NOT NULL DEFAULT now(),
    published_at    timestamptz,
    CONSTRAINT ck_outbox_status CHECK (status IN ('pending','published','failed'))
);
-- Relay scan: pending rows that are due.
CREATE INDEX idx_outbox_due ON outbox_events (next_attempt_at, created_at) WHERE status = 'pending';
CREATE INDEX idx_outbox_published ON outbox_events (published_at) WHERE status = 'published';

-- Consumer-side idempotency: first INSERT wins, duplicates are acknowledged and skipped.
CREATE TABLE processed_events (
    consumer_name varchar(80) NOT NULL,
    event_id      uuid NOT NULL,
    processed_at  timestamptz NOT NULL DEFAULT now(),
    outcome       varchar(20) NOT NULL DEFAULT 'ok',
    PRIMARY KEY (consumer_name, event_id)
);

CREATE TABLE notification_jobs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            uuid NOT NULL,
    channel             varchar(15) NOT NULL,
    recipient           varchar(254) NOT NULL,
    template_code       varchar(80) NOT NULL,
    status              varchar(20) NOT NULL DEFAULT 'queued',
    provider            varchar(30),
    provider_message_id varchar(200),
    attempts            integer NOT NULL DEFAULT 0,
    last_error          varchar(500),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_notification_job UNIQUE (event_id, channel, recipient, template_code),
    CONSTRAINT ck_notification_jobs_channel CHECK (channel IN ('email','whatsapp','sms','in_app')),
    CONSTRAINT ck_notification_jobs_status CHECK (status IN ('queued','sending','provider_accepted','delivered','failed','suppressed'))
);
CREATE INDEX idx_notification_jobs_status ON notification_jobs (status, created_at);
CREATE TRIGGER trg_notification_jobs_updated_at BEFORE UPDATE ON notification_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE notification_logs (
    id         bigserial PRIMARY KEY,
    job_id     uuid NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
    status     varchar(20) NOT NULL,
    detail     varchar(500),
    logged_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_logs_job ON notification_logs (job_id, logged_at);

CREATE TABLE notification_preferences (
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type varchar(80) NOT NULL,
    channel    varchar(15) NOT NULL,
    enabled    boolean NOT NULL DEFAULT true,
    PRIMARY KEY (user_id, event_type, channel)
);

-- ---------- content / company ----------
CREATE TABLE site_settings (
    key         varchar(100) PRIMARY KEY,
    value       text,
    verified    boolean NOT NULL DEFAULT false,      -- false = supplied but not yet confirmed by the business
    updated_by  uuid REFERENCES users(id),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE company_offices (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind         varchar(15) NOT NULL,
    city         varchar(100) NOT NULL,
    locality     varchar(150),
    state        varchar(100),
    full_address text,                               -- NULL until confirmed; never invented
    pin_code     varchar(10),
    phone        varchar(20),
    verified     boolean NOT NULL DEFAULT false,
    sort_order   smallint NOT NULL DEFAULT 0,
    CONSTRAINT ck_company_offices_kind CHECK (kind IN ('registered','branch'))
);

CREATE TABLE cms_pages (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    page_key   varchar(60) NOT NULL UNIQUE,
    status     varchar(15) NOT NULL DEFAULT 'draft',
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_cms_pages_status CHECK (status IN ('draft','published'))
);

CREATE TABLE cms_page_translations (
    page_id          uuid NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
    language         char(2) NOT NULL,
    slug             varchar(150) NOT NULL,
    title            varchar(200) NOT NULL,
    body_json        text NOT NULL,
    meta_title       varchar(160),
    meta_description varchar(320),
    review_status    varchar(15) NOT NULL DEFAULT 'draft',
    reviewed_by      uuid REFERENCES users(id),
    reviewed_at      timestamptz,
    PRIMARY KEY (page_id, language),
    CONSTRAINT uq_cms_slug UNIQUE (language, slug),
    CONSTRAINT ck_cms_tr_lang CHECK (language IN ('en','hi')),
    CONSTRAINT ck_cms_tr_review CHECK (review_status IN ('draft','in_review','approved'))
);

CREATE TABLE banners (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    banner_key  varchar(60) NOT NULL UNIQUE,
    image_key   varchar(500),
    link_url    varchar(500),
    sort_order  smallint NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT false
);
CREATE TABLE banner_translations (
    banner_id uuid NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
    language  char(2) NOT NULL,
    headline  varchar(200) NOT NULL,
    subtext   varchar(400),
    PRIMARY KEY (banner_id, language),
    CONSTRAINT ck_banner_tr_lang CHECK (language IN ('en','hi'))
);

CREATE TABLE faqs (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sort_order smallint NOT NULL DEFAULT 0,
    is_active  boolean NOT NULL DEFAULT false
);
CREATE TABLE faq_translations (
    faq_id   uuid NOT NULL REFERENCES faqs(id) ON DELETE CASCADE,
    language char(2) NOT NULL,
    question varchar(400) NOT NULL,
    answer   text NOT NULL,
    PRIMARY KEY (faq_id, language),
    CONSTRAINT ck_faq_tr_lang CHECK (language IN ('en','hi'))
);

-- Reviews are genuine, moderated and optional; none are ever fabricated.
CREATE TABLE reviews (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  uuid REFERENCES customers(id),
    property_id  uuid REFERENCES properties(id),
    site_visit_id uuid REFERENCES site_visits(id),
    rating       smallint NOT NULL,
    body         text,
    status       varchar(15) NOT NULL DEFAULT 'pending',
    moderated_by uuid REFERENCES users(id),
    moderation_reason text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT ck_reviews_status CHECK (status IN ('pending','published','rejected','reported'))
);
CREATE INDEX idx_reviews_property_status ON reviews (property_id, status);

-- ---------- audit ----------
CREATE TABLE audit_logs (
    id             bigserial PRIMARY KEY,
    occurred_at    timestamptz NOT NULL DEFAULT now(),
    actor_user_id  uuid,                              -- no FK: audit must survive user deletion
    actor_label    varchar(100),                      -- 'public', 'system' or a role code
    action         varchar(80) NOT NULL,
    entity_type    varchar(60) NOT NULL,
    entity_id      varchar(64),
    outcome        varchar(10) NOT NULL DEFAULT 'success',
    request_id     varchar(64),
    ip_hash        varchar(64),
    metadata_json  text,                              -- safe metadata only: never secrets, tokens or full payment data
    CONSTRAINT ck_audit_outcome CHECK (outcome IN ('success','denied','failure'))
);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_audit_actor ON audit_logs (actor_user_id, occurred_at DESC);
CREATE INDEX idx_audit_action_time ON audit_logs (action, occurred_at DESC);

CREATE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

CREATE TABLE data_subject_requests (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  uuid REFERENCES customers(id),
    request_type varchar(15) NOT NULL,
    status       varchar(15) NOT NULL DEFAULT 'received',
    received_at  timestamptz NOT NULL DEFAULT now(),
    due_at       timestamptz,
    handled_by   uuid REFERENCES users(id),
    closed_at    timestamptz,
    notes        text,
    CONSTRAINT ck_dsr_type CHECK (request_type IN ('access','correction','erasure','consent_withdrawal')),
    CONSTRAINT ck_dsr_status CHECK (status IN ('received','in_progress','completed','rejected'))
);
