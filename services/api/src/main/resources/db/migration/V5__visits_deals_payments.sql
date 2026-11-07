-- V5: site visits, deals/transactions and payments.
-- An enquiry (lead), a visit, a reservation, a token payment and a legally completed transaction
-- are DIFFERENT facts and live in different tables with different state machines.

CREATE TABLE site_visits (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_ref       varchar(20) NOT NULL UNIQUE,
    lead_id          uuid NOT NULL REFERENCES leads(id),
    customer_id      uuid NOT NULL REFERENCES customers(id),
    property_id      uuid REFERENCES properties(id),
    project_id       uuid REFERENCES projects(id),
    assigned_user_id uuid REFERENCES users(id),
    status           varchar(15) NOT NULL DEFAULT 'requested',
    scheduled_at     timestamptz,
    confirmed_at     timestamptz,
    completed_at     timestamptz,
    location_note    varchar(300),
    feedback         text,
    interest_after   varchar(10),
    next_action      varchar(500),
    version          bigint NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_site_visits_status CHECK (status IN ('requested','scheduled','confirmed','completed','cancelled','no_show')),
    CONSTRAINT ck_site_visits_target CHECK (property_id IS NOT NULL OR project_id IS NOT NULL),
    CONSTRAINT ck_site_visits_interest CHECK (interest_after IS NULL OR interest_after IN ('none','low','medium','high')),
    CONSTRAINT ck_site_visits_scheduled CHECK (status IN ('requested','cancelled') OR scheduled_at IS NOT NULL),
    CONSTRAINT ck_site_visits_completed CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);
CREATE INDEX idx_site_visits_assignee ON site_visits (assigned_user_id, scheduled_at) WHERE status IN ('scheduled','confirmed');
CREATE INDEX idx_site_visits_lead ON site_visits (lead_id);
CREATE INDEX idx_site_visits_customer ON site_visits (customer_id);
CREATE INDEX idx_site_visits_property ON site_visits (property_id) WHERE property_id IS NOT NULL;
CREATE TRIGGER trg_site_visits_updated_at BEFORE UPDATE ON site_visits FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Reschedule and status history (satisfies "reschedule history").
CREATE TABLE site_visit_history (
    id                bigserial PRIMARY KEY,
    site_visit_id     uuid NOT NULL REFERENCES site_visits(id) ON DELETE CASCADE,
    from_status       varchar(15),
    to_status         varchar(15) NOT NULL,
    from_scheduled_at timestamptz,
    to_scheduled_at   timestamptz,
    changed_by        uuid REFERENCES users(id),
    reason            text,
    changed_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_site_visit_history ON site_visit_history (site_visit_id, changed_at);

-- ---------- deals (separate lifecycle) ----------
CREATE TABLE deal_stages (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       varchar(40) NOT NULL UNIQUE,
    name       varchar(100) NOT NULL,
    sort_order smallint NOT NULL,
    outcome    varchar(10) NOT NULL DEFAULT 'open',
    -- Seeded INACTIVE: the director must confirm these against the real operating procedure first.
    is_active  boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_deal_stages_outcome CHECK (outcome IN ('open','completed','cancelled'))
);

CREATE TABLE deal_stage_transitions (
    from_stage_id uuid NOT NULL REFERENCES deal_stages(id) ON DELETE CASCADE,
    to_stage_id   uuid NOT NULL REFERENCES deal_stages(id) ON DELETE CASCADE,
    PRIMARY KEY (from_stage_id, to_stage_id),
    CONSTRAINT ck_deal_transition_distinct CHECK (from_stage_id <> to_stage_id)
);

CREATE TABLE deals (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_ref          varchar(20) NOT NULL UNIQUE,
    customer_id         uuid NOT NULL REFERENCES customers(id),
    lead_id             uuid NOT NULL REFERENCES leads(id),
    property_id         uuid REFERENCES properties(id),
    project_id          uuid REFERENCES projects(id),
    owner_user_id       uuid NOT NULL REFERENCES users(id),
    stage_id            uuid NOT NULL REFERENCES deal_stages(id),
    outcome             varchar(10) NOT NULL DEFAULT 'open',
    negotiated_price    numeric(14,2),                     -- sensitive: directors only
    booking_status      varchar(15) NOT NULL DEFAULT 'none',
    expected_closure_date date,
    booking_date        date,
    completed_at        timestamptz,
    cancellation_reason text,
    customer_requirements text,
    version             bigint NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_deals_outcome CHECK (outcome IN ('open','completed','cancelled')),
    CONSTRAINT ck_deals_booking CHECK (booking_status IN ('none','reserved','booked')),
    CONSTRAINT ck_deals_price CHECK (negotiated_price IS NULL OR negotiated_price > 0),
    CONSTRAINT ck_deals_target CHECK (property_id IS NOT NULL OR project_id IS NOT NULL),
    CONSTRAINT ck_deals_cancel_reason CHECK (outcome <> 'cancelled' OR nullif(btrim(cancellation_reason), '') IS NOT NULL),
    CONSTRAINT ck_deals_completed CHECK ((outcome = 'completed') = (completed_at IS NOT NULL))
);
-- At most one open deal per lead+property.
CREATE UNIQUE INDEX uq_deals_open_lead_property ON deals (lead_id, property_id) WHERE outcome = 'open' AND property_id IS NOT NULL;
CREATE INDEX idx_deals_owner ON deals (owner_user_id, stage_id);
CREATE INDEX idx_deals_customer ON deals (customer_id);
CREATE INDEX idx_deals_lead ON deals (lead_id);
CREATE TRIGGER trg_deals_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION deals_sync_outcome() RETURNS trigger AS $$
BEGIN
    SELECT outcome INTO NEW.outcome FROM deal_stages WHERE id = NEW.stage_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_deals_sync_outcome BEFORE INSERT OR UPDATE OF stage_id ON deals
    FOR EACH ROW EXECUTE FUNCTION deals_sync_outcome();

CREATE TABLE deal_stage_history (
    id            bigserial PRIMARY KEY,
    deal_id       uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    from_stage_id uuid REFERENCES deal_stages(id),
    to_stage_id   uuid NOT NULL REFERENCES deal_stages(id),
    changed_by    uuid NOT NULL REFERENCES users(id),
    reason        text,
    changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deal_stage_history ON deal_stage_history (deal_id, changed_at);

CREATE TABLE deal_documents (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id       uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    document_type varchar(50) NOT NULL,
    storage_key   varchar(500) NOT NULL,              -- private bucket only; short-lived signed URLs
    uploaded_by   uuid NOT NULL REFERENCES users(id),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deal_documents_deal ON deal_documents (deal_id);

-- ---------- payments ----------
CREATE TABLE payments (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_ref         varchar(20) NOT NULL UNIQUE,
    customer_id        uuid NOT NULL REFERENCES customers(id),
    lead_id            uuid REFERENCES leads(id),
    deal_id            uuid REFERENCES deals(id),
    purpose            varchar(25) NOT NULL,
    amount_paise       bigint NOT NULL,
    currency           char(3) NOT NULL DEFAULT 'INR',
    gateway            varchar(30) NOT NULL,           -- razorpay | cashfree | sandbox (decision pending)
    gateway_order_id   varchar(100),
    gateway_payment_id varchar(100),
    status             varchar(25) NOT NULL DEFAULT 'created',
    idempotency_key    uuid NOT NULL UNIQUE,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_payments_amount CHECK (amount_paise > 0),
    CONSTRAINT ck_payments_purpose CHECK (purpose IN ('site_visit_fee','booking_token','service_fee','other')),
    CONSTRAINT ck_payments_status CHECK (status IN ('created','pending','authorized','captured','failed','refunded','partially_refunded'))
);
CREATE UNIQUE INDEX uq_payments_gateway_order ON payments (gateway, gateway_order_id) WHERE gateway_order_id IS NOT NULL;
CREATE UNIQUE INDEX uq_payments_gateway_payment ON payments (gateway, gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
CREATE INDEX idx_payments_customer ON payments (customer_id);
CREATE INDEX idx_payments_deal ON payments (deal_id) WHERE deal_id IS NOT NULL;
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Raw gateway events; gateway_event_id uniqueness makes webhook processing idempotent. Never stores card data.
CREATE TABLE payment_events (
    id               bigserial PRIMARY KEY,
    payment_id       uuid REFERENCES payments(id),
    gateway          varchar(30) NOT NULL,
    gateway_event_id varchar(150) NOT NULL,
    event_type       varchar(80) NOT NULL,
    signature_valid  boolean NOT NULL,
    payload_json     text NOT NULL,
    received_at      timestamptz NOT NULL DEFAULT now(),
    processed_at     timestamptz,
    CONSTRAINT uq_payment_events UNIQUE (gateway, gateway_event_id)
);
CREATE INDEX idx_payment_events_payment ON payment_events (payment_id);

CREATE TABLE refunds (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id         uuid NOT NULL REFERENCES payments(id),
    amount_paise       bigint NOT NULL,
    status             varchar(15) NOT NULL DEFAULT 'requested',
    gateway_refund_id  varchar(100),
    reason             text,
    requested_by       uuid NOT NULL REFERENCES users(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_refunds_amount CHECK (amount_paise > 0),
    CONSTRAINT ck_refunds_status CHECK (status IN ('requested','processing','completed','failed'))
);
CREATE INDEX idx_refunds_payment ON refunds (payment_id);
