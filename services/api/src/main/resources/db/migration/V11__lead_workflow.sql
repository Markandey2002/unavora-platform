-- V11: complete lead workflow (Slice 4): stage reasons, explicit reassignment history, site-visit notes and rules,
-- follow-up priority / visit link / duplicate guard, director permission to manage any visit.

-- ---------- stages: Invalid also needs a reason (Lost already does) ----------
UPDATE pipeline_stages SET requires_reason = true WHERE code = 'invalid';

ALTER TABLE lead_stage_history ADD COLUMN reason_code varchar(40);

-- Second line of defence behind the API: a move into a stage that requires a reason must carry one.
CREATE FUNCTION lead_stage_history_reason_required() RETURNS trigger AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM pipeline_stages s WHERE s.id = NEW.to_stage_id AND s.requires_reason)
       AND NEW.from_stage_id IS NOT NULL
       AND nullif(btrim(coalesce(NEW.reason, '')), '') IS NULL THEN
        RAISE EXCEPTION 'A reason is required for this stage change';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_lead_stage_history_reason BEFORE INSERT ON lead_stage_history
    FOR EACH ROW EXECUTE FUNCTION lead_stage_history_reason_required();

CREATE INDEX idx_lead_stage_history_lead ON lead_stage_history (lead_id, changed_at DESC);

-- ---------- assignment history: who had the lead before ----------
ALTER TABLE lead_assignments ADD COLUMN previous_assigned_to uuid REFERENCES users(id);
CREATE INDEX idx_lead_assignments_lead ON lead_assignments (lead_id, assigned_at DESC);

-- ---------- site visits ----------
-- feedback = what the customer said; employee_notes = internal only (never returned to customers).
ALTER TABLE site_visits ADD COLUMN employee_notes text;
ALTER TABLE site_visits ADD CONSTRAINT ck_site_visits_completed_after_schedule
    CHECK (completed_at IS NULL OR scheduled_at IS NULL OR completed_at >= scheduled_at);
ALTER TABLE site_visits ADD CONSTRAINT ck_site_visits_assignee_when_scheduled
    CHECK (status IN ('requested','cancelled') OR assigned_user_id IS NOT NULL);
CREATE INDEX idx_site_visits_schedule ON site_visits (scheduled_at) WHERE status IN ('scheduled','confirmed');

-- ---------- follow-ups ----------
ALTER TABLE crm_tasks
    ADD COLUMN priority      varchar(10) NOT NULL DEFAULT 'normal',
    ADD COLUMN site_visit_id uuid REFERENCES site_visits(id) ON DELETE SET NULL,
    ADD CONSTRAINT ck_crm_tasks_priority CHECK (priority IN ('low','normal','high'));
-- The same open follow-up (same person, same lead/visit, same title, same due time) cannot exist twice.
CREATE UNIQUE INDEX uq_crm_tasks_open_duplicate ON crm_tasks
    (assigned_to, coalesce(lead_id, '00000000-0000-0000-0000-000000000000'::uuid),
     coalesce(site_visit_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(title), due_at)
    WHERE status = 'open';
CREATE INDEX idx_crm_tasks_visit ON crm_tasks (site_visit_id) WHERE site_visit_id IS NOT NULL;

-- ---------- permissions ----------
INSERT INTO permissions (code, description) VALUES
 ('visit.manage_all', 'Schedule and update any site visit, for any employee');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'visit.manage_all' WHERE r.code = 'director';
