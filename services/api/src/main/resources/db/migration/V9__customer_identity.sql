-- V9: customer self-registration (Continue with Google), WhatsApp number verification (OTP), customer sessions.
-- A registered customer is an ordinary row in `customers` (one CRM, no second customer table). An online account is
-- the link `customer_identities` (provider + provider subject, UNIQUE => repeat logins never create a new profile).

ALTER TABLE customers
    ADD COLUMN whatsapp_e164        varchar(20),
    ADD COLUMN whatsapp_verified_at timestamptz,
    ADD COLUMN registered_at        timestamptz,              -- NULL = never created an online account
    ADD COLUMN signup_source        varchar(30),
    ADD CONSTRAINT ck_customers_whatsapp CHECK (whatsapp_e164 IS NULL OR whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
    ADD CONSTRAINT ck_customers_whatsapp_verified CHECK (whatsapp_verified_at IS NULL OR whatsapp_e164 IS NOT NULL),
    ADD CONSTRAINT ck_customers_signup_source CHECK (signup_source IS NULL OR signup_source IN ('google','website_enquiry','staff'));

CREATE INDEX idx_customers_registered ON customers (registered_at DESC, id DESC) WHERE registered_at IS NOT NULL;
CREATE INDEX idx_customers_whatsapp ON customers (whatsapp_e164) WHERE whatsapp_e164 IS NOT NULL;

CREATE TABLE customer_identities (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id      uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    provider         varchar(20)  NOT NULL,
    provider_subject varchar(255) NOT NULL,                   -- Google "sub" (stable account id, never the email)
    email            varchar(254),
    email_verified   boolean      NOT NULL DEFAULT false,
    display_name     varchar(200),
    registered_at    timestamptz  NOT NULL DEFAULT now(),
    last_login_at    timestamptz  NOT NULL DEFAULT now(),
    login_count      integer      NOT NULL DEFAULT 1,
    CONSTRAINT ck_customer_identity_provider CHECK (provider IN ('google')),
    CONSTRAINT uq_customer_identity UNIQUE (provider, provider_subject)
);
CREATE INDEX idx_customer_identities_customer ON customer_identities (customer_id);

-- Opaque customer sessions (website). Only the SHA-256 of the token is stored.
CREATE TABLE customer_sessions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token_hash  bytea       NOT NULL UNIQUE,
    customer_id         uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now(),
    idle_expires_at     timestamptz NOT NULL,
    absolute_expires_at timestamptz NOT NULL,
    revoked_at          timestamptz
);
CREATE INDEX idx_customer_sessions_customer ON customer_sessions (customer_id) WHERE revoked_at IS NULL;

-- One row per OTP sent. The code itself is never stored, only HMAC-SHA256(code) bound to the row id.
CREATE TABLE phone_verifications (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel             varchar(15) NOT NULL DEFAULT 'whatsapp',
    phone_e164          varchar(20) NOT NULL,
    code_hash           bytea       NOT NULL,
    provider            varchar(30) NOT NULL,                 -- 'mock' locally; approved provider name later
    provider_message_id varchar(200),
    attempts            smallint    NOT NULL DEFAULT 0,
    max_attempts        smallint    NOT NULL DEFAULT 5,
    expires_at          timestamptz NOT NULL,
    verified_at         timestamptz,
    superseded_at       timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_phone_verif_channel CHECK (channel IN ('whatsapp')),
    CONSTRAINT ck_phone_verif_phone CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
    CONSTRAINT ck_phone_verif_attempts CHECK (attempts >= 0 AND attempts <= max_attempts)
);
CREATE INDEX idx_phone_verif_customer ON phone_verifications (customer_id, created_at DESC);

-- Signed-in customer requests are their own lead source.
INSERT INTO lead_sources (code, name, channel_type) VALUES
 ('website_account', 'Website - signed-in customer request', 'website');

-- Customer-level timeline events (lead_id NULL) for registration and number verification.
ALTER TABLE lead_activities DROP CONSTRAINT ck_lead_activity_type;
ALTER TABLE lead_activities ADD CONSTRAINT ck_lead_activity_type CHECK (activity_type IN
    ('enquiry_received','call_recorded','email','whatsapp_event','note_added','site_visit',
     'property_recommended','stage_changed','assigned','task_created','task_completed',
     'customer_merged','consent_changed','account_registered','phone_verified'));
