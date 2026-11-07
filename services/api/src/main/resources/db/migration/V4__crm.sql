-- V4: CRM. One customer table, one lead table, one activity timeline. The lead pipeline and
-- the deal/transaction lifecycle (V5) are deliberately separate state machines.

CREATE TABLE lead_sources (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code         varchar(50) NOT NULL UNIQUE,
    name         varchar(100) NOT NULL,
    channel_type varchar(30) NOT NULL,
    is_active    boolean NOT NULL DEFAULT true,
    CONSTRAINT ck_lead_sources_channel CHECK (channel_type IN
        ('website','phone','whatsapp','walk_in','channel_partner','referral','social','advertising','portal','other'))
);

-- Configurable pipeline (directors may edit names/order/activation; codes are stable identifiers).
CREATE TABLE pipeline_stages (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                     varchar(40) NOT NULL UNIQUE,
    name                     varchar(100) NOT NULL,
    sort_order               smallint NOT NULL,
    outcome                  varchar(10) NOT NULL DEFAULT 'open',
    requires_reason          boolean NOT NULL DEFAULT false,
    requires_completed_deal  boolean NOT NULL DEFAULT false,   -- 'won' can only be set by the deal workflow
    is_active                boolean NOT NULL DEFAULT true,
    CONSTRAINT ck_pipeline_stages_outcome CHECK (outcome IN ('open','won','lost','invalid'))
);

CREATE TABLE pipeline_stage_transitions (
    from_stage_id uuid NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
    to_stage_id   uuid NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
    PRIMARY KEY (from_stage_id, to_stage_id),
    CONSTRAINT ck_pipeline_transition_distinct CHECK (from_stage_id <> to_stage_id)
);

CREATE TABLE lost_reasons (
    code      varchar(40) PRIMARY KEY,
    name      varchar(100) NOT NULL,
    needs_note boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE customers (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_ref            varchar(20) NOT NULL UNIQUE,
    full_name             varchar(200) NOT NULL,
    phone_e164            varchar(20),
    email_normalized      varchar(254),
    preferred_language    char(2) NOT NULL DEFAULT 'en',
    city                  varchar(100),
    preferred_locality    varchar(150),
    category              varchar(30),
    assigned_user_id      uuid REFERENCES users(id),
    status                varchar(20) NOT NULL DEFAULT 'active',
    merged_into_customer_id uuid REFERENCES customers(id),
    last_interaction_at   timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_customers_language CHECK (preferred_language IN ('en','hi')),
    CONSTRAINT ck_customers_status CHECK (status IN ('active','merged','archived','erased')),
    CONSTRAINT ck_customers_category CHECK (category IS NULL OR category IN
        ('residential_buyer','commercial_buyer','investor','channel_partner','owner_seller','other')),
    CONSTRAINT ck_customers_phone CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
    CONSTRAINT ck_customers_contact CHECK (status = 'erased' OR phone_e164 IS NOT NULL OR email_normalized IS NOT NULL),
    CONSTRAINT ck_customers_merged CHECK (status <> 'merged' OR merged_into_customer_id IS NOT NULL),
    CONSTRAINT ck_customers_not_self_merged CHECK (merged_into_customer_id IS NULL OR merged_into_customer_id <> id)
);
-- NOT unique on purpose: family members and agents legitimately share phone numbers / emails.
CREATE INDEX idx_customers_phone ON customers (phone_e164) WHERE status = 'active';
CREATE INDEX idx_customers_email ON customers (email_normalized) WHERE status = 'active';
CREATE INDEX idx_customers_assigned ON customers (assigned_user_id) WHERE status = 'active';
CREATE INDEX idx_customers_last_interaction ON customers (last_interaction_at DESC);
CREATE INDEX idx_customers_name_trgm ON customers USING gin (full_name gin_trgm_ops);
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE customer_preferences (
    customer_id        uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
    purpose            varchar(10),
    property_category  varchar(20),
    preferred_property_types text[] NOT NULL DEFAULT '{}',
    preferred_locality_slugs text[] NOT NULL DEFAULT '{}',
    budget_min         numeric(14,2),
    budget_max         numeric(14,2),
    bedrooms_min       smallint,
    commercial_requirements text,
    purchase_timeline  varchar(20),
    buying_purpose     varchar(20),
    preferred_contact_method varchar(20),
    first_time_buyer   boolean,
    updated_by         uuid REFERENCES users(id),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_pref_purpose CHECK (purpose IS NULL OR purpose IN ('sale','rent')),
    CONSTRAINT ck_pref_category CHECK (property_category IS NULL OR property_category IN ('residential','commercial','land')),
    CONSTRAINT ck_pref_budget CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max),
    CONSTRAINT ck_pref_timeline CHECK (purchase_timeline IS NULL OR purchase_timeline IN ('immediate','within_3_months','within_6_months','within_12_months','exploring')),
    CONSTRAINT ck_pref_buying_purpose CHECK (buying_purpose IS NULL OR buying_purpose IN ('residential','investment')),
    CONSTRAINT ck_pref_contact CHECK (preferred_contact_method IS NULL OR preferred_contact_method IN ('phone','email','whatsapp'))
);

-- Append-only consent history. Current consent = latest row per (customer, purpose).
CREATE TABLE customer_consents (
    id             bigserial PRIMARY KEY,
    customer_id    uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    purpose        varchar(30) NOT NULL,
    granted        boolean NOT NULL,
    notice_version varchar(40) NOT NULL,
    source         varchar(40) NOT NULL,
    recorded_by    uuid REFERENCES users(id),
    recorded_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_consent_purpose CHECK (purpose IN ('service_contact','marketing_email','marketing_whatsapp','marketing_sms'))
);
CREATE INDEX idx_customer_consents ON customer_consents (customer_id, purpose, recorded_at DESC);

CREATE TABLE customer_duplicate_candidates (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_a_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    customer_b_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    reason        varchar(30) NOT NULL,
    status        varchar(20) NOT NULL DEFAULT 'pending',
    reviewed_by   uuid REFERENCES users(id),
    reviewed_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_dup_reason CHECK (reason IN ('shared_phone','shared_email','similar_name')),
    CONSTRAINT ck_dup_status CHECK (status IN ('pending','dismissed','merged')),
    CONSTRAINT ck_dup_distinct CHECK (customer_a_id <> customer_b_id),
    CONSTRAINT uq_dup_pair UNIQUE (customer_a_id, customer_b_id, reason)
);
CREATE INDEX idx_dup_pending ON customer_duplicate_candidates (status) WHERE status = 'pending';

-- Merges never delete history: the merged customer row stays (status 'merged') and keeps its leads re-pointed with an activity record.
CREATE TABLE customer_merges (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    survivor_customer_id  uuid NOT NULL REFERENCES customers(id),
    merged_customer_id    uuid NOT NULL REFERENCES customers(id),
    merged_by             uuid NOT NULL REFERENCES users(id),
    merged_at             timestamptz NOT NULL DEFAULT now(),
    snapshot              text NOT NULL,                 -- JSON snapshot of the merged profile for reversal/audit
    CONSTRAINT ck_merge_distinct CHECK (survivor_customer_id <> merged_customer_id)
);

CREATE TABLE channel_partners (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id   uuid REFERENCES customers(id),
    full_name     varchar(200) NOT NULL,
    company_name  varchar(200),
    phone_e164    varchar(20),
    email_normalized varchar(254),
    city          varchar(100),
    areas_of_interest text,
    rera_number_declared varchar(60),                    -- declared by applicant, not verified
    status        varchar(20) NOT NULL DEFAULT 'applied',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_channel_partner_status CHECK (status IN ('applied','under_review','approved','rejected','inactive'))
);
CREATE TRIGGER trg_channel_partners_updated_at BEFORE UPDATE ON channel_partners FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE leads (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_ref            varchar(20) NOT NULL UNIQUE,
    customer_id           uuid NOT NULL REFERENCES customers(id),
    source_id             uuid NOT NULL REFERENCES lead_sources(id),
    channel_partner_id    uuid REFERENCES channel_partners(id),
    campaign              varchar(120),
    interested_property_id uuid REFERENCES properties(id),
    interested_project_id uuid REFERENCES projects(id),
    enquiry_type          varchar(30) NOT NULL,
    message               text,
    budget_min            numeric(14,2),
    budget_max            numeric(14,2),
    preferred_location    varchar(200),
    stage_id              uuid NOT NULL REFERENCES pipeline_stages(id),
    outcome               varchar(10) NOT NULL DEFAULT 'open',   -- maintained by trigger from the stage
    assigned_user_id      uuid REFERENCES users(id),
    lost_reason_code      varchar(40) REFERENCES lost_reasons(code),
    lost_reason_note      text,
    qualification_status  varchar(20) NOT NULL DEFAULT 'unqualified',
    priority_score        smallint NOT NULL DEFAULT 0,
    first_contacted_at    timestamptz,
    last_contacted_at     timestamptz,
    next_action_at        timestamptz,
    next_action_note      varchar(500),
    idempotency_key       uuid UNIQUE,                           -- repeat form submissions return the same lead
    version               bigint NOT NULL DEFAULT 0,             -- optimistic locking
    closed_at             timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_leads_enquiry_type CHECK (enquiry_type IN
        ('residential','commercial','project','channel_partner','property','general','callback','site_visit')),
    CONSTRAINT ck_leads_outcome CHECK (outcome IN ('open','won','lost','invalid')),
    CONSTRAINT ck_leads_lost_reason CHECK (outcome <> 'lost' OR lost_reason_code IS NOT NULL),
    CONSTRAINT ck_leads_lost_note CHECK (lost_reason_code IS DISTINCT FROM 'other' OR nullif(btrim(lost_reason_note), '') IS NOT NULL),
    CONSTRAINT ck_leads_qualification CHECK (qualification_status IN ('unqualified','in_progress','qualified','disqualified')),
    CONSTRAINT ck_leads_budget CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max),
    CONSTRAINT ck_leads_priority CHECK (priority_score BETWEEN 0 AND 100)
);
CREATE INDEX idx_leads_customer ON leads (customer_id);
CREATE INDEX idx_leads_assigned_stage ON leads (assigned_user_id, stage_id);
CREATE INDEX idx_leads_created ON leads (created_at DESC, id DESC);
CREATE INDEX idx_leads_stage ON leads (stage_id);
CREATE INDEX idx_leads_source ON leads (source_id);
CREATE INDEX idx_leads_property ON leads (interested_property_id) WHERE interested_property_id IS NOT NULL;
CREATE INDEX idx_leads_next_action ON leads (next_action_at) WHERE outcome = 'open' AND next_action_at IS NOT NULL;
CREATE INDEX idx_leads_open_unassigned ON leads (created_at) WHERE outcome = 'open' AND assigned_user_id IS NULL;
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION leads_sync_outcome() RETURNS trigger AS $$
BEGIN
    SELECT outcome INTO NEW.outcome FROM pipeline_stages WHERE id = NEW.stage_id;
    IF NEW.outcome <> 'open' THEN
        NEW.closed_at := COALESCE(NEW.closed_at, now());
    ELSE
        NEW.closed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_leads_sync_outcome BEFORE INSERT OR UPDATE OF stage_id ON leads
    FOR EACH ROW EXECUTE FUNCTION leads_sync_outcome();

CREATE TABLE lead_qualifications (
    lead_id            uuid PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
    budget_confirmed   boolean NOT NULL DEFAULT false,
    purchase_timeline  varchar(20),
    buying_purpose     varchar(20),
    preferred_contact_method varchar(20),
    interest_level     varchar(10),
    site_visit_ready   boolean NOT NULL DEFAULT false,
    interaction_count  integer NOT NULL DEFAULT 0,
    updated_by         uuid REFERENCES users(id),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_lq_timeline CHECK (purchase_timeline IS NULL OR purchase_timeline IN ('immediate','within_3_months','within_6_months','within_12_months','exploring')),
    CONSTRAINT ck_lq_purpose CHECK (buying_purpose IS NULL OR buying_purpose IN ('residential','investment')),
    CONSTRAINT ck_lq_interest CHECK (interest_level IS NULL OR interest_level IN ('low','medium','high'))
);

-- Rule-based, explainable priority (no opaque scoring). Conditions are evaluated in application code.
CREATE TABLE priority_rules (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        varchar(50) NOT NULL UNIQUE,
    description varchar(300) NOT NULL,
    condition_json text NOT NULL,
    points      smallint NOT NULL,
    is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE lead_stage_history (
    id            bigserial PRIMARY KEY,
    lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    from_stage_id uuid REFERENCES pipeline_stages(id),
    to_stage_id   uuid NOT NULL REFERENCES pipeline_stages(id),
    changed_by    uuid REFERENCES users(id),               -- NULL = system / public form
    reason        text,
    changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_stage_history ON lead_stage_history (lead_id, changed_at);

CREATE TABLE lead_assignments (
    id            bigserial PRIMARY KEY,
    lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    assigned_to   uuid NOT NULL REFERENCES users(id),
    assigned_by   uuid REFERENCES users(id),
    method        varchar(30) NOT NULL,
    reason        text,
    assigned_at   timestamptz NOT NULL DEFAULT now(),
    unassigned_at timestamptz,
    CONSTRAINT ck_lead_assign_method CHECK (method IN ('manual','auto_property_owner','auto_rule','reassignment'))
);
CREATE UNIQUE INDEX uq_lead_assignment_current ON lead_assignments (lead_id) WHERE unassigned_at IS NULL;
CREATE INDEX idx_lead_assignments_user ON lead_assignments (assigned_to, assigned_at DESC);

-- Unified interaction timeline (every event about a customer/lead lands here exactly once).
CREATE TABLE lead_activities (
    id            bigserial PRIMARY KEY,
    customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    lead_id       uuid REFERENCES leads(id) ON DELETE CASCADE,
    activity_type varchar(40) NOT NULL,
    summary       varchar(500) NOT NULL,
    actor_user_id uuid REFERENCES users(id),               -- NULL = customer/system
    ref_type      varchar(40),
    ref_id        varchar(64),
    metadata_json text,
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_lead_activity_type CHECK (activity_type IN
        ('enquiry_received','call_recorded','email','whatsapp_event','note_added','site_visit',
         'property_recommended','stage_changed','assigned','task_created','task_completed',
         'customer_merged','consent_changed'))
);
CREATE INDEX idx_lead_activities_customer ON lead_activities (customer_id, occurred_at DESC);
CREATE INDEX idx_lead_activities_lead ON lead_activities (lead_id, occurred_at DESC);

-- Internal notes: never exposed to customers.
CREATE TABLE crm_notes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    lead_id     uuid REFERENCES leads(id) ON DELETE CASCADE,
    body        text NOT NULL,
    visibility  varchar(20) NOT NULL DEFAULT 'team',
    author_id   uuid NOT NULL REFERENCES users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_crm_notes_visibility CHECK (visibility IN ('author_only','team','directors'))
);
CREATE INDEX idx_crm_notes_customer ON crm_notes (customer_id, created_at DESC);

CREATE TABLE crm_tasks (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    lead_id       uuid REFERENCES leads(id) ON DELETE CASCADE,
    assigned_to   uuid NOT NULL REFERENCES users(id),
    created_by    uuid NOT NULL REFERENCES users(id),
    title         varchar(200) NOT NULL,
    description   text,
    due_at        timestamptz NOT NULL,
    status        varchar(15) NOT NULL DEFAULT 'open',
    completed_at  timestamptz,
    reschedule_count smallint NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_crm_tasks_status CHECK (status IN ('open','done','cancelled')),
    CONSTRAINT ck_crm_tasks_completed CHECK ((status = 'done') = (completed_at IS NOT NULL))
);
CREATE INDEX idx_crm_tasks_assignee_due ON crm_tasks (assigned_to, due_at) WHERE status = 'open';
CREATE INDEX idx_crm_tasks_customer ON crm_tasks (customer_id);
CREATE TRIGGER trg_crm_tasks_updated_at BEFORE UPDATE ON crm_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Channel messages. 'record_origin' separates provider-confirmed events from employee-entered records.
-- A click on a wa.me link is recorded as employee_recorded/'recorded_manual' and is NEVER 'delivered'.
CREATE TABLE communication_logs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    lead_id             uuid REFERENCES leads(id) ON DELETE SET NULL,
    channel             varchar(15) NOT NULL,
    direction           varchar(10) NOT NULL,
    record_origin       varchar(20) NOT NULL,
    delivery_status     varchar(20) NOT NULL,
    provider            varchar(30),
    provider_message_id varchar(200),
    subject             varchar(300),
    body_preview        varchar(500),
    actor_user_id       uuid REFERENCES users(id),
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_comm_channel CHECK (channel IN ('phone','email','whatsapp','sms')),
    CONSTRAINT ck_comm_direction CHECK (direction IN ('inbound','outbound')),
    CONSTRAINT ck_comm_origin CHECK (record_origin IN ('provider_event','employee_recorded','system')),
    CONSTRAINT ck_comm_status CHECK (delivery_status IN
        ('created','sent','provider_accepted','delivered','read','failed','recorded_manual')),
    CONSTRAINT ck_comm_provider_proof CHECK (
        delivery_status NOT IN ('provider_accepted','delivered','read')
        OR (record_origin = 'provider_event' AND provider_message_id IS NOT NULL))
);
CREATE INDEX idx_comm_customer ON communication_logs (customer_id, occurred_at DESC);
CREATE UNIQUE INDEX uq_comm_provider_msg ON communication_logs (provider, provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE customer_segments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name             varchar(150) NOT NULL,
    owner_user_id    uuid NOT NULL REFERENCES users(id),
    visibility       varchar(15) NOT NULL DEFAULT 'private',
    filter_json      text NOT NULL,                  -- whitelisted filter definition; never raw SQL
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_segments_visibility CHECK (visibility IN ('private','team')),
    CONSTRAINT uq_segments_owner_name UNIQUE (owner_user_id, name)
);

-- Campaign module is schema-only until consent, provider and business rules are approved.
CREATE TABLE campaign_templates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        varchar(60) NOT NULL UNIQUE,
    channel     varchar(15) NOT NULL,
    language    char(2) NOT NULL,
    subject     varchar(300),
    body        text NOT NULL,
    provider_template_id varchar(100),
    approval_status varchar(15) NOT NULL DEFAULT 'draft',
    created_by  uuid REFERENCES users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_campaign_tpl_channel CHECK (channel IN ('email','whatsapp','sms')),
    CONSTRAINT ck_campaign_tpl_status CHECK (approval_status IN ('draft','approved','rejected'))
);

CREATE TABLE campaigns (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(200) NOT NULL,
    template_id uuid NOT NULL REFERENCES campaign_templates(id),
    segment_id  uuid NOT NULL REFERENCES customer_segments(id),
    status      varchar(15) NOT NULL DEFAULT 'draft',
    scheduled_at timestamptz,
    approved_by uuid REFERENCES users(id),
    created_by  uuid NOT NULL REFERENCES users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_campaigns_status CHECK (status IN ('draft','approved','sending','completed','cancelled')),
    CONSTRAINT ck_campaigns_approval CHECK (status IN ('draft','cancelled') OR approved_by IS NOT NULL)
);

CREATE TABLE campaign_recipients (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    customer_id  uuid NOT NULL REFERENCES customers(id),
    consent_checked_at timestamptz NOT NULL,
    status       varchar(20) NOT NULL DEFAULT 'queued',
    communication_log_id uuid REFERENCES communication_logs(id),
    CONSTRAINT uq_campaign_recipient UNIQUE (campaign_id, customer_id),
    CONSTRAINT ck_campaign_recipient_status CHECK (status IN ('queued','sent','delivered','failed','opted_out','skipped_no_consent'))
);
