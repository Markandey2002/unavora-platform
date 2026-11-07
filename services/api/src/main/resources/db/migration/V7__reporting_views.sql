-- V7: read-only reporting views. KPI formulas are documented in docs/CRM_SPECIFICATION.md.
-- Views read other modules' tables on purpose: reporting is the only cross-module read path.

-- First-response time = first contact minus lead creation, only for leads that have been contacted.
CREATE VIEW v_lead_first_response AS
SELECT l.id AS lead_id,
       l.assigned_user_id,
       l.created_at,
       l.first_contacted_at,
       EXTRACT(EPOCH FROM (l.first_contacted_at - l.created_at)) AS response_seconds
FROM leads l
WHERE l.first_contacted_at IS NOT NULL;

CREATE VIEW v_leads_by_stage AS
SELECT ps.code AS stage_code, ps.name AS stage_name, ps.sort_order, count(l.id) AS lead_count
FROM pipeline_stages ps
LEFT JOIN leads l ON l.stage_id = ps.id
GROUP BY ps.code, ps.name, ps.sort_order;

CREATE VIEW v_active_public_properties AS
SELECT p.id, p.locality_id, p.property_type_id
FROM properties p
WHERE p.status = 'published' AND p.availability IN ('available','under_offer');
