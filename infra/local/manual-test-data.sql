-- UNAVORA: synthetic data for MANUAL browser testing (docs/MANUAL_UI_TESTING.md).
--
-- LOCAL ONLY. Not a Flyway migration: never loaded by the API, the automated tests, staging or production.
-- Re-runnable: each run deletes the records it created earlier (everything tagged MAN) and recreates them with
-- dates relative to NOW, so "today's visits" and "overdue follow-ups" are always current. Anything you add while
-- testing to a MAN lead or customer is removed too. Data created through the website (LEAD-0000xx) is not touched.
--
-- Everything is fictional: names are invented, phone numbers are in the +91 99999 1xxxx test range, emails use the
-- reserved example.test domain, property titles carry [SAMPLE], prices are invented. Hindi text is a draft.
--
-- Run (PowerShell or Git Bash, from the repository root, with the unavora-postgres container running):
--   docker cp infra/local/manual-test-data.sql unavora-postgres:/tmp/manual-test-data.sql
--   docker exec unavora-postgres psql -U unavora_local -d unavora -v ON_ERROR_STOP=1 -f /tmp/manual-test-data.sql

\set QUIET on
BEGIN;

-- Guard: only a local UNAVORA database has the synthetic seed director (V1000, local/test profiles only).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = '00000000-0000-0000-0000-000000000101'
                 AND email = 'director.local@example.test') THEN
    RAISE EXCEPTION 'Not a local UNAVORA database (synthetic seed users missing). Nothing was changed.';
  END IF;
END $$;

-- ---------- 1. remove the previous run (MAN records only) ----------
CREATE TEMP TABLE mtd_old_customers ON COMMIT DROP AS
  SELECT id FROM customers WHERE public_ref LIKE 'CUS-MAN-%';
CREATE TEMP TABLE mtd_old_leads ON COMMIT DROP AS
  SELECT id FROM leads WHERE public_ref LIKE 'LEAD-MAN-%' OR customer_id IN (SELECT id FROM mtd_old_customers);
DELETE FROM site_visits WHERE lead_id IN (SELECT id FROM mtd_old_leads) OR customer_id IN (SELECT id FROM mtd_old_customers);
DELETE FROM leads WHERE id IN (SELECT id FROM mtd_old_leads);            -- cascades: history, assignments, activities, tasks, notes
DELETE FROM customers WHERE id IN (SELECT id FROM mtd_old_customers);    -- cascades: consents, communications, tasks

-- ---------- 2. extra published properties (kept between runs; inserted once) ----------
INSERT INTO properties (id, property_type_id, locality_id, purpose, status, availability, price_amount, price_negotiable,
                        area_unit, built_up_area, plot_area, bedrooms, bathrooms, parking_spaces, furnishing,
                        owner_user_id, created_by, published_at, availability_confirmed_at)
SELECT v.id::uuid, pt.id, v.loc::uuid, 'sale', 'published', 'available', v.price, true,
       v.unit, v.built, v.plot, v.beds, v.baths, v.parking, v.furn, v.owner::uuid, v.owner::uuid, now(), now()
FROM (VALUES
 ('20000000-0000-0000-0001-000000000001','apartment','10000000-0000-0000-0000-000000000002', 5800000,'sq_ft',1050,NULL::numeric,2,2,1,'semi_furnished','00000000-0000-0000-0000-000000000103'),
 ('20000000-0000-0000-0001-000000000002','apartment','10000000-0000-0000-0000-000000000001', 7400000,'sq_ft',1100,NULL,2,2,1,'furnished',     '00000000-0000-0000-0000-000000000102'),
 ('20000000-0000-0000-0001-000000000003','office',   '10000000-0000-0000-0000-000000000003', 7500000,'sq_ft',1400,NULL,NULL::int,2,2,'unfurnished','00000000-0000-0000-0000-000000000103'),
 ('20000000-0000-0000-0001-000000000004','plot',     '10000000-0000-0000-0000-000000000002', 3900000,'sq_yd',NULL,150,NULL,NULL::int,NULL::int,NULL,'00000000-0000-0000-0000-000000000103')
) AS v(id, type_code, loc, price, unit, built, plot, beds, baths, parking, furn, owner)
JOIN property_types pt ON pt.code = v.type_code
ON CONFLICT (id) DO NOTHING;

INSERT INTO property_translations (property_id, language, title, slug, description, review_status) VALUES
 ('20000000-0000-0000-0001-000000000001','en','[SAMPLE] 2 BHK family apartment, Gomti Nagar Lucknow','sample-2bhk-family-apartment-gomti-nagar','Synthetic listing for manual testing only. Not a real property.','approved'),
 ('20000000-0000-0000-0001-000000000001','hi','[नमूना] 2 BHK फैमिली अपार्टमेंट, गोमती नगर लखनऊ','namuna-2bhk-family-apartment-gomti-nagar','केवल मैनुअल परीक्षण के लिए कृत्रिम सूची।','draft'),
 ('20000000-0000-0000-0001-000000000002','en','[SAMPLE] Furnished 2 BHK, Sector 37 Noida','sample-furnished-2bhk-sector-37-noida','Synthetic listing for manual testing only. Not a real property.','approved'),
 ('20000000-0000-0000-0001-000000000002','hi','[नमूना] फर्निश्ड 2 BHK, सेक्टर 37 नोएडा','namuna-furnished-2bhk-sector-37-noida','केवल मैनुअल परीक्षण के लिए कृत्रिम सूची।','draft'),
 ('20000000-0000-0000-0001-000000000003','en','[SAMPLE] Office space, Civil Lines Prayagraj','sample-office-space-civil-lines-prayagraj','Synthetic listing for manual testing only. Not a real property.','approved'),
 ('20000000-0000-0000-0001-000000000003','hi','[नमूना] ऑफिस स्पेस, सिविल लाइन्स प्रयागराज','namuna-office-space-civil-lines-prayagraj','केवल मैनुअल परीक्षण के लिए कृत्रिम सूची।','draft'),
 ('20000000-0000-0000-0001-000000000004','en','[SAMPLE] 150 sq yd plot, Gomti Nagar Lucknow','sample-150-sq-yd-plot-gomti-nagar','Synthetic listing for manual testing only. Not a real property.','approved'),
 ('20000000-0000-0000-0001-000000000004','hi','[नमूना] 150 वर्ग गज प्लॉट, गोमती नगर लखनऊ','namuna-150-varg-gaz-plot-gomti-nagar','केवल मैनुअल परीक्षण के लिए कृत्रिम सूची।','draft')
ON CONFLICT DO NOTHING;

-- ---------- 3. customers ----------
INSERT INTO customers (id, public_ref, full_name, phone_e164, email_normalized, preferred_language, city, preferred_locality, category, last_interaction_at, created_at)
SELECT ('30000000-0000-0000-0001-0000000000' || v.n)::uuid, 'CUS-MAN-' || v.n, v.name, '+9199999100' || v.n,
       v.email, v.lang, v.city, v.loc, v.cat, now() - (v.days || ' days')::interval, now() - (v.days || ' days')::interval
FROM (VALUES
 ('01','Rohan Mehta',     'rohan.mehta@example.test',  'en','Noida',    'Sector 37',   'residential_buyer', 1),
 ('02','Priya Verma',     'priya.verma@example.test',  'hi','Noida',    'Sector 37',   'residential_buyer', 2),
 ('03','Arjun Nair',      'arjun.nair@example.test',   'en','Noida',    'Sector 37',   'investor',          4),
 ('04','Kavita Singh',    'kavita.singh@example.test', 'hi','Lucknow',  'Gomti Nagar', 'residential_buyer', 6),
 ('05','Imran Qureshi',   'imran.q@example.test',      'en','Lucknow',  'Gomti Nagar', 'residential_buyer', 9),
 ('06','Neha Gupta',      'neha.gupta@example.test',   'en','Prayagraj','Civil Lines', 'commercial_buyer', 12),
 ('07','Suresh Yadav',    'suresh.yadav@example.test', 'hi','Prayagraj','Civil Lines', 'investor',         15),
 ('08','Meera Iyer',      'meera.iyer@example.test',   'en','Lucknow',  'Gomti Nagar', 'residential_buyer',20)
) AS v(n, name, email, lang, city, loc, cat, days);
-- phones: +91 99999 100NN (NN = 01..08), the same synthetic range as the V1000 seed

INSERT INTO customer_consents (customer_id, purpose, granted, notice_version, source)
SELECT id, 'service_contact', true, 'synthetic-manual-test', 'staff_entry' FROM customers WHERE public_ref LIKE 'CUS-MAN-%';

-- ---------- 4. leads: one per pipeline situation ----------
-- path = the stages the lead went through, oldest first; the last one is its current stage.
CREATE TEMP TABLE mtd_leads ON COMMIT DROP AS
SELECT ('40000000-0000-0000-0001-0000000000' || n)::uuid AS id, 'LEAD-MAN-' || n AS ref,
       ('30000000-0000-0000-0001-0000000000' || cust)::uuid AS customer_id,
       CASE who WHEN 'e1' THEN '00000000-0000-0000-0000-000000000102'::uuid
                WHEN 'e2' THEN '00000000-0000-0000-0000-000000000103'::uuid END AS assignee,
       prop::uuid AS property_id, source, etype, path, days, lost_code, note, bmin, bmax, msg
FROM (VALUES
 ('01','01',NULL,'20000000-0000-0000-0001-000000000002','website_property','property', ARRAY['new'], 1, NULL, NULL, 6000000, 8000000,'Is the furnished flat still available? Can I visit this weekend?'),
 ('02','02','e1','20000000-0000-0000-0000-000000000001','website_property','property', ARRAY['new','assigned'], 2, NULL, NULL, 8000000, 9000000,'Please share the floor plan and maintenance charges.'),
 ('03','03','e1','20000000-0000-0000-0001-000000000002','phone_call','residential',     ARRAY['new','assigned','contacted'], 4, NULL, NULL, 7000000, 7500000,'Called the office, looking for a ready-to-move 2 BHK.'),
 ('04','01','e1','20000000-0000-0000-0000-000000000001','walk_in','residential',        ARRAY['new','assigned','contacted','qualified'], 6, NULL, NULL, 8000000, 9000000,'Visited the office; home loan pre-approved.'),
 ('05','02','e1','20000000-0000-0000-0000-000000000001','website_property','property', ARRAY['new','assigned','contacted','qualified','site_visit_scheduled'], 8, NULL, NULL, 8000000, 8800000,'Wants to see the 3 BHK with family.'),
 ('06','03','e1','20000000-0000-0000-0001-000000000002','whatsapp','residential',       ARRAY['new','assigned','contacted','qualified','site_visit_scheduled'], 7, NULL, NULL, 7000000, 7600000,'Asked on WhatsApp for a visit today.'),
 ('07','01','e1','20000000-0000-0000-0001-000000000002','referral','residential',       ARRAY['new','assigned','contacted','qualified','site_visit_scheduled'], 9, NULL, NULL, 7000000, 8000000,'Referred by an existing customer.'),
 ('08','02','e1','20000000-0000-0000-0000-000000000001','website_property','property', ARRAY['new','assigned','contacted','qualified','site_visit_scheduled','site_visit_completed'], 12, NULL, NULL, 8000000, 9000000,'Interested in east-facing units.'),
 ('09','03','e1','20000000-0000-0000-0000-000000000001','channel_partner','residential',ARRAY['new','assigned','contacted','qualified','site_visit_scheduled','site_visit_completed','negotiation'], 18, NULL, NULL, 8200000, 8500000,'Negotiating on price and parking.'),
 ('10','01','e1','20000000-0000-0000-0001-000000000002','social_media','residential',   ARRAY['new','assigned','contacted','qualified','site_visit_scheduled','lost'], 25, 'no_response', NULL, 6500000, 7000000,'Campaign lead.'),
 ('11','04','e2','20000000-0000-0000-0001-000000000001','website_property','property', ARRAY['new','assigned'], 1, NULL, NULL, 5500000, 6000000,'कृपया कीमत और लोन विकल्प बताएं।'),
 ('12','05','e2','20000000-0000-0000-0000-000000000002','website_property','property', ARRAY['new','assigned','contacted','qualified'], 9, NULL, NULL, 6000000, 6500000,'Looking for a 2 BHK near schools.'),
 ('13','08','e2','20000000-0000-0000-0001-000000000001','phone_call','residential',     ARRAY['new','assigned','contacted','qualified','site_visit_scheduled'], 10, NULL, NULL, 5500000, 6000000,'Wants to visit with parents.'),
 ('14','07','e2','20000000-0000-0000-0001-000000000004','walk_in','residential',        ARRAY['new','assigned','contacted','qualified','site_visit_scheduled','site_visit_completed','negotiation','booking_in_progress'], 30, NULL, NULL, 3800000, 4000000,'Plot for a family home; documents being checked.'),
 ('15','06','e2','20000000-0000-0000-0001-000000000003','website_contact','general',    ARRAY['new','assigned','invalid'], 5, NULL, 'Test submission by a vendor, not a buyer', NULL, NULL,'test test'),
 ('16','06','e2','20000000-0000-0000-0001-000000000003','website_property','property', ARRAY['new','assigned','contacted','lost'], 14, 'other', 'Chose to lease instead of buying', 7000000, 7500000,'Need an office for a clinic.'),
 ('17','07',NULL,NULL,                                  'website_contact','general',    ARRAY['new'], 0, NULL, NULL, 3000000, 5000000,'Looking for plots in Prayagraj under 50 lakh.')
) AS v(n, cust, who, prop, source, etype, path, days, lost_code, note, bmin, bmax, msg);

INSERT INTO leads (id, public_ref, customer_id, source_id, stage_id, assigned_user_id, interested_property_id, enquiry_type, message,
                   budget_min, budget_max, preferred_location, lost_reason_code, lost_reason_note,
                   first_contacted_at, last_contacted_at, closed_at, created_at)
SELECT m.id, m.ref, m.customer_id, ls.id, ps.id, m.assignee, m.property_id, m.etype, m.msg,
       m.bmin, m.bmax, c.preferred_locality, m.lost_code, CASE WHEN m.lost_code IS NOT NULL THEN m.note END,
       CASE WHEN 'contacted' = ANY (m.path) THEN now() - (m.days * 0.8 || ' days')::interval END,
       CASE WHEN 'contacted' = ANY (m.path) THEN now() - (m.days * 0.3 || ' days')::interval END,
       CASE WHEN ps.outcome IN ('lost','invalid') THEN now() - interval '1 day' END,
       now() - (m.days || ' days')::interval - interval '2 hours'
FROM mtd_leads m
JOIN customers c ON c.id = m.customer_id
JOIN lead_sources ls ON ls.code = m.source
JOIN pipeline_stages ps ON ps.code = m.path[array_length(m.path, 1)];

-- stage history: each step evenly spaced between creation and one day ago; first row is the enquiry itself
INSERT INTO lead_stage_history (lead_id, from_stage_id, to_stage_id, changed_by, reason, reason_code, changed_at)
SELECT m.id, fs.id, ts.id,
       CASE WHEN i = 1 OR m.path[i] = 'assigned' THEN NULL ELSE m.assignee END,
       CASE WHEN m.path[i] = 'invalid' THEN m.note
            WHEN m.path[i] = 'lost' THEN coalesce(m.note, 'No response after three follow-ups')
            WHEN m.path[i] = 'assigned' THEN 'Assigned to the property owner' END,
       CASE WHEN m.path[i] = 'lost' THEN m.lost_code END,
       now() - (m.days || ' days')::interval - interval '2 hours'
             + (i - 1) * ((m.days || ' days')::interval / greatest(array_length(m.path, 1), 1))
FROM mtd_leads m
CROSS JOIN LATERAL generate_subscripts(m.path, 1) AS i
LEFT JOIN pipeline_stages fs ON fs.code = m.path[i - 1]
JOIN pipeline_stages ts ON ts.code = m.path[i];

-- assignments (lead 12 was reassigned by the director from Employee One to Employee Two)
INSERT INTO lead_assignments (lead_id, assigned_to, assigned_by, method, reason, previous_assigned_to, assigned_at, unassigned_at)
SELECT m.id, CASE WHEN m.ref = 'LEAD-MAN-12' THEN '00000000-0000-0000-0000-000000000102'::uuid ELSE m.assignee END,
       NULL, 'auto_property_owner', 'Property owner', NULL,
       now() - (m.days || ' days')::interval,
       CASE WHEN m.ref = 'LEAD-MAN-12' THEN now() - interval '5 days' END
FROM mtd_leads m WHERE m.assignee IS NOT NULL;
INSERT INTO lead_assignments (lead_id, assigned_to, assigned_by, method, reason, previous_assigned_to, assigned_at)
VALUES ('40000000-0000-0000-0001-000000000012', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000101',
        'reassignment', 'Lucknow buyer; Employee Two covers Gomti Nagar', '00000000-0000-0000-0000-000000000102', now() - interval '5 days');

-- timeline
INSERT INTO lead_activities (customer_id, lead_id, activity_type, summary, actor_user_id, occurred_at)
SELECT m.customer_id, m.id, 'enquiry_received', 'Enquiry received: ' || left(m.msg, 200), NULL, now() - (m.days || ' days')::interval - interval '2 hours'
FROM mtd_leads m;
INSERT INTO lead_activities (customer_id, lead_id, activity_type, summary, actor_user_id, occurred_at)
SELECT l.customer_id, h.lead_id, 'stage_changed', 'Stage: ' || fs.name || ' → ' || ts.name, h.changed_by, h.changed_at
FROM lead_stage_history h JOIN leads l ON l.id = h.lead_id
JOIN pipeline_stages fs ON fs.id = h.from_stage_id JOIN pipeline_stages ts ON ts.id = h.to_stage_id
WHERE l.public_ref LIKE 'LEAD-MAN-%';
INSERT INTO lead_activities (customer_id, lead_id, activity_type, summary, actor_user_id, occurred_at) VALUES
 ('30000000-0000-0000-0001-000000000005','40000000-0000-0000-0001-000000000012','assigned',
  'Reassigned: Local Employee One (synthetic) → Local Employee Two (synthetic). Reason: Lucknow buyer; Employee Two covers Gomti Nagar',
  '00000000-0000-0000-0000-000000000101', now() - interval '5 days');

-- ---------- 5. site visits ----------
CREATE TEMP TABLE mtd_visits ON COMMIT DROP AS
SELECT ('50000000-0000-0000-0001-0000000000' || n)::uuid AS id, 'VIS-MAN-' || n AS ref,
       ('40000000-0000-0000-0001-0000000000' || lead)::uuid AS lead_id, status, at, done_at, note, feedback, interest, emp_notes, next_action, reason
FROM (VALUES
 -- upcoming: tomorrow 11:00 India time
 ('01','05','scheduled', (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 day 11 hours') AT TIME ZONE 'Asia/Kolkata', NULL::timestamptz,
  'Site office, Tower B lobby', NULL, NULL, NULL, NULL, NULL),
 -- "today": two hours from now (after about 22:00 India time this falls after midnight; reset during the day).
 -- Kept at least 2.5 hours from "now - 30 min", the slot the automated e2e test books for Employee One (60-min rule).
 ('02','06','scheduled', now() + interval '2 hours', NULL, 'Meet at the main gate', NULL, NULL, NULL, NULL, NULL),
 -- time has passed: ready to be marked completed or no-show
 ('03','07','scheduled', now() - interval '3 hours', NULL, 'Sample flat, 4th floor', NULL, NULL, NULL, NULL, NULL),
 -- completed yesterday
 ('04','08','completed', now() - interval '1 day 4 hours', now() - interval '1 day 3 hours', 'Site office, Tower B lobby',
  'Liked the layout; wants an east-facing unit on a higher floor', 'high', 'Loan pre-approval pending; call after salary credit', 'Share east-facing availability', NULL),
 -- completed last week (lead now in negotiation)
 ('05','09','completed', now() - interval '6 days', now() - interval '6 days' + interval '1 hour', 'Sample flat',
  'Happy with the unit, asking for a discount', 'medium', 'Partner deal; check commission terms', 'Send revised price', NULL),
 -- Employee Two: in three days
 ('06','13','scheduled', (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + interval '3 days 16 hours') AT TIME ZONE 'Asia/Kolkata', NULL,
  'Gomti Nagar site, gate 1', NULL, NULL, NULL, NULL, NULL),
 -- Employee Two: cancelled
 ('07','12','cancelled', now() - interval '2 days', NULL, 'Gomti Nagar site', NULL, NULL, NULL, NULL, 'Customer travelling; will call back to reschedule'),
 -- Employee One: no-show (lead later lost)
 ('08','10','no_show', now() - interval '12 days', NULL, 'Main gate', NULL, NULL, NULL, NULL, 'Customer did not arrive and did not answer calls'),
 -- Employee Two: completed (lead in booking)
 ('09','14','completed', now() - interval '20 days', now() - interval '20 days' + interval '45 minutes', 'Plot 14, Gomti Nagar',
  'Wants the corner plot', 'high', 'Ask for registry papers', 'Start booking paperwork', NULL)
) AS v(n, lead, status, at, done_at, note, feedback, interest, emp_notes, next_action, reason);

INSERT INTO site_visits (id, public_ref, lead_id, customer_id, property_id, assigned_user_id, status, scheduled_at, completed_at,
                         location_note, feedback, interest_after, employee_notes, next_action, created_at)
SELECT v.id, v.ref, v.lead_id, l.customer_id, coalesce(l.interested_property_id, '20000000-0000-0000-0000-000000000001'),
       l.assigned_user_id, v.status, v.at, v.done_at, v.note, v.feedback, v.interest, v.emp_notes, v.next_action,
       least(v.at, now()) - interval '2 days'
FROM mtd_visits v JOIN leads l ON l.id = v.lead_id;

INSERT INTO site_visit_history (site_visit_id, from_status, to_status, from_scheduled_at, to_scheduled_at, changed_by, reason, changed_at)
SELECT v.id, NULL, 'scheduled', NULL, v.at, l.assigned_user_id, NULL, least(v.at, now()) - interval '2 days'
FROM mtd_visits v JOIN leads l ON l.id = v.lead_id;
INSERT INTO site_visit_history (site_visit_id, from_status, to_status, from_scheduled_at, to_scheduled_at, changed_by, reason, changed_at)
SELECT v.id, 'scheduled', v.status, v.at, v.at, l.assigned_user_id, v.reason, coalesce(v.done_at, least(v.at + interval '1 hour', now()))
FROM mtd_visits v JOIN leads l ON l.id = v.lead_id WHERE v.status <> 'scheduled';

INSERT INTO lead_activities (customer_id, lead_id, activity_type, summary, actor_user_id, ref_type, ref_id, occurred_at)
SELECT l.customer_id, v.lead_id, 'site_visit', 'Site visit ' || v.ref || ': ' || replace(v.status, '_', '-'), l.assigned_user_id,
       'site_visit', v.id::text, coalesce(v.done_at, least(v.at, now()) - interval '2 days')
FROM mtd_visits v JOIN leads l ON l.id = v.lead_id;

-- ---------- 6. follow-ups ----------
INSERT INTO crm_tasks (id, customer_id, lead_id, site_visit_id, assigned_to, created_by, title, description, due_at, priority, status, completed_at, created_at)
SELECT ('60000000-0000-0000-0001-0000000000' || v.n)::uuid, l.customer_id, l.id, v.visit::uuid, l.assigned_user_id, l.assigned_user_id,
       v.title, v.descr, now() + v.due, v.prio, v.status, CASE WHEN v.status = 'done' THEN now() - interval '1 day' END,
       now() - interval '3 days'
FROM (VALUES
 -- Employee One
 ('01','03',NULL,'Call back about loan eligibility', 'Customer asked for a call after 6 pm', interval '-1 day', 'high', 'open'),
 ('02','04',NULL,'Send floor plan and price sheet', NULL, interval '3 hours', 'normal', 'open'),
 ('03','08','50000000-0000-0000-0001-000000000004','Share east-facing availability', 'From yesterday''s site visit', interval '1 day', 'high', 'open'),
 ('04','09',NULL,'Send revised price to channel partner', NULL, interval '4 days', 'low', 'open'),
 ('05','02',NULL,'First call to introduce the project', NULL, interval '-2 hours', 'normal', 'open'),
 ('06','08',NULL,'Confirm visit timing with customer', NULL, interval '-2 days', 'normal', 'done'),
 -- Employee Two
 ('07','11',NULL,'ग्राहक को लोन विकल्प भेजें', 'Hindi-speaking customer', interval '-3 hours', 'normal', 'open'),
 ('08','14','50000000-0000-0000-0001-000000000009','Collect booking documents', 'ID proof and address proof', interval '2 days', 'high', 'open'),
 ('09','12',NULL,'Reschedule the cancelled visit', NULL, interval '5 hours', 'normal', 'open')
) AS v(n, lead, visit, title, descr, due, prio, status)
JOIN leads l ON l.id = ('40000000-0000-0000-0001-0000000000' || v.lead)::uuid;

INSERT INTO lead_activities (customer_id, lead_id, activity_type, summary, actor_user_id, ref_type, ref_id, occurred_at)
SELECT t.customer_id, t.lead_id, 'task_created', 'Follow-up: ' || t.title, t.created_by, 'task', t.id::text, t.created_at
FROM crm_tasks t WHERE t.id::text LIKE '60000000-0000-0000-0001-%';

UPDATE leads l SET next_action_at = t.due_at, next_action_note = t.title
FROM (SELECT DISTINCT ON (lead_id) lead_id, due_at, title FROM crm_tasks
      WHERE status = 'open' AND id::text LIKE '60000000-0000-0000-0001-%' ORDER BY lead_id, due_at) t
WHERE l.id = t.lead_id;

-- ---------- 7. recorded calls / WhatsApp contacts (employee-recorded; nothing was sent) ----------
INSERT INTO communication_logs (customer_id, lead_id, channel, direction, record_origin, delivery_status, body_preview, actor_user_id, occurred_at)
SELECT l.customer_id, l.id, v.ch, v.dir, 'employee_recorded', 'recorded_manual', v.txt, l.assigned_user_id, now() - v.ago
FROM (VALUES
 ('03','phone','outbound','Introduced the project; customer wants a ready-to-move 2 BHK', interval '3 days'),
 ('04','phone','inbound', 'Customer confirmed loan pre-approval', interval '2 days'),
 ('09','whatsapp','outbound','Sent price comparison of two units', interval '1 day'),
 ('12','phone','outbound','Customer travelling, asked to call next week', interval '2 days')
) AS v(lead, ch, dir, txt, ago)
JOIN leads l ON l.id = ('40000000-0000-0000-0001-0000000000' || v.lead)::uuid;

COMMIT;

\set QUIET off
SELECT 'manual test data loaded' AS result,
       (SELECT count(*) FROM customers WHERE public_ref LIKE 'CUS-MAN-%')  AS customers,
       (SELECT count(*) FROM leads WHERE public_ref LIKE 'LEAD-MAN-%')     AS leads,
       (SELECT count(*) FROM site_visits WHERE public_ref LIKE 'VIS-MAN-%') AS visits,
       (SELECT count(*) FROM crm_tasks WHERE id::text LIKE '60000000-0000-0000-0001-%') AS follow_ups;
