-- V8: reference data required in EVERY environment (no customer data, no listings).

-- ---------- roles & permissions ----------
INSERT INTO roles (code, name, description) VALUES
 ('director',           'Director',            'Business-wide control; MFA mandatory'),
 ('employee',           'Employee',            'Listing executive / sales; sees only assigned records'),
 ('listing_reviewer',   'Listing reviewer',    'Reviews and approves listings'),
 ('content_manager',    'Content manager',     'Manages CMS, banners, FAQs, SEO'),
 ('marketing_manager',  'Marketing manager',   'Reviews and campaign content; no customer PII by default'),
 ('system_admin',       'System administrator','Technical configuration; NO automatic customer data access');

INSERT INTO permissions (code, description) VALUES
 ('property.read_own',   'View properties assigned to me'),
 ('property.read_all',   'View all properties'),
 ('property.create',     'Create and edit own draft properties'),
 ('property.submit',     'Submit properties for review'),
 ('property.review',     'Approve or reject submitted properties'),
 ('property.publish',    'Publish / unpublish / mark sold'),
 ('lead.read_own',       'View leads assigned to me'),
 ('lead.read_all',       'View all leads'),
 ('lead.update',         'Change stage, notes and next action on accessible leads'),
 ('lead.assign',         'Assign and reassign leads'),
 ('lead.reopen',         'Reopen lost or invalid leads'),
 ('customer.read_own',   'View customers I am assigned to'),
 ('customer.read_all',   'View all customers'),
 ('customer.merge',      'Merge duplicate customers'),
 ('task.manage_own',     'Manage my follow-up tasks'),
 ('task.manage_all',     'Manage anyone''s tasks'),
 ('visit.manage_own',    'Schedule and update my site visits'),
 ('visit.read_all',      'View all site visits'),
 ('deal.read_own',       'View deals I own'),
 ('deal.read_all',       'View all deals'),
 ('deal.financial.read', 'View negotiated price and payment details'),
 ('deal.manage',         'Create and progress deals'),
 ('payment.read',        'View payments and refunds'),
 ('report.director',     'View company-wide dashboards and KPIs'),
 ('export.leads',        'Export lead / customer data (always audited)'),
 ('segment.manage',      'Create customer segments'),
 ('campaign.manage',     'Create and approve campaigns'),
 ('cms.manage',          'Manage website content'),
 ('user.manage',         'Invite, disable users and assign roles'),
 ('audit.read',          'View audit history'),
 ('settings.manage',     'Manage company profile, pipeline and integrations');

-- employee
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
 ('property.read_own','property.create','property.submit','lead.read_own','lead.update','customer.read_own',
  'task.manage_own','visit.manage_own','deal.read_own','segment.manage')
WHERE r.code = 'employee';

-- director: everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'director';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('property.read_all','property.review')
WHERE r.code = 'listing_reviewer';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('cms.manage')
WHERE r.code IN ('content_manager','marketing_manager');

-- ---------- lead sources ----------
INSERT INTO lead_sources (code, name, channel_type) VALUES
 ('website_property',        'Website - property enquiry',   'website'),
 ('website_contact',         'Website - contact form',       'website'),
 ('website_channel_partner', 'Website - channel partner',    'website'),
 ('phone_call',              'Phone call',                   'phone'),
 ('whatsapp',                'WhatsApp',                     'whatsapp'),
 ('walk_in',                 'Walk-in',                      'walk_in'),
 ('channel_partner',         'Channel partner',              'channel_partner'),
 ('referral',                'Referral',                     'referral'),
 ('social_media',            'Social media campaign',        'social'),
 ('advertising',             'Advertising campaign',         'advertising'),
 ('property_portal',         'Property portal (future)',     'portal');

-- ---------- lead pipeline (spec: 11 stages) ----------
INSERT INTO pipeline_stages (code, name, sort_order, outcome, requires_reason, requires_completed_deal) VALUES
 ('new',                   'New',                               10, 'open',    false, false),
 ('assigned',              'Assigned',                          20, 'open',    false, false),
 ('contacted',             'Contacted',                         30, 'open',    false, false),
 ('qualified',             'Qualified',                         40, 'open',    false, false),
 ('site_visit_scheduled',  'Site Visit Scheduled',              50, 'open',    false, false),
 ('site_visit_completed',  'Site Visit Completed',              60, 'open',    false, false),
 ('negotiation',           'Negotiation',                       70, 'open',    false, false),
 ('booking_in_progress',   'Booking / Transaction in Progress', 80, 'open',    false, false),
 ('won',                   'Won',                               90, 'won',     false, true),
 ('lost',                  'Lost',                             100, 'lost',    true,  false),
 ('invalid',               'Invalid',                          110, 'invalid', false, false);

INSERT INTO pipeline_stage_transitions (from_stage_id, to_stage_id)
SELECT f.id, t.id
FROM (VALUES
  ('new','assigned'),('new','contacted'),('new','lost'),('new','invalid'),
  ('assigned','contacted'),('assigned','lost'),('assigned','invalid'),
  ('contacted','qualified'),('contacted','lost'),('contacted','invalid'),
  ('qualified','site_visit_scheduled'),('qualified','negotiation'),('qualified','lost'),
  ('site_visit_scheduled','site_visit_completed'),('site_visit_scheduled','qualified'),('site_visit_scheduled','lost'),
  ('site_visit_completed','negotiation'),('site_visit_completed','site_visit_scheduled'),('site_visit_completed','lost'),
  ('negotiation','booking_in_progress'),('negotiation','site_visit_scheduled'),('negotiation','lost'),
  ('booking_in_progress','won'),('booking_in_progress','negotiation'),('booking_in_progress','lost'),
  ('lost','contacted'),('invalid','new')
) AS m(from_code, to_code)
JOIN pipeline_stages f ON f.code = m.from_code
JOIN pipeline_stages t ON t.code = m.to_code;

INSERT INTO lost_reasons (code, name, needs_note) VALUES
 ('price_too_high',     'Price too high',              false),
 ('budget_mismatch',    'Budget mismatch',             false),
 ('location_mismatch',  'Location does not match',     false),
 ('bought_elsewhere',   'Bought elsewhere',            false),
 ('not_interested',     'No longer interested',        false),
 ('no_response',        'No response after follow-ups',false),
 ('other',              'Other (note required)',       true);

-- ---------- deal lifecycle (seeded INACTIVE until the director approves the real procedure) ----------
INSERT INTO deal_stages (code, name, sort_order, outcome, is_active) VALUES
 ('deal_created',            'Deal Created',            10, 'open',      false),
 ('qualification_complete',  'Qualification Complete',  20, 'open',      false),
 ('negotiation',             'Negotiation',             30, 'open',      false),
 ('booking_pending',         'Booking Pending',         40, 'open',      false),
 ('payment_pending',         'Payment Pending',         50, 'open',      false),
 ('booked',                  'Booked',                  60, 'open',      false),
 ('documentation',           'Documentation',           70, 'open',      false),
 ('completed',               'Completed',               80, 'completed', false),
 ('cancelled',               'Cancelled',               90, 'cancelled', false);

INSERT INTO deal_stage_transitions (from_stage_id, to_stage_id)
SELECT f.id, t.id
FROM (VALUES
  ('deal_created','qualification_complete'),('deal_created','cancelled'),
  ('qualification_complete','negotiation'),('qualification_complete','cancelled'),
  ('negotiation','booking_pending'),('negotiation','cancelled'),
  ('booking_pending','payment_pending'),('booking_pending','negotiation'),('booking_pending','cancelled'),
  ('payment_pending','booked'),('payment_pending','booking_pending'),('payment_pending','cancelled'),
  ('booked','documentation'),('booked','cancelled'),
  ('documentation','completed'),('documentation','cancelled')
) AS m(from_code, to_code)
JOIN deal_stages f ON f.code = m.from_code
JOIN deal_stages t ON t.code = m.to_code;

-- ---------- property types & amenities ----------
INSERT INTO property_types (code, category, name_en, name_hi, sort_order) VALUES
 ('apartment',      'residential', 'Apartment / Flat',       'अपार्टमेंट / फ्लैट', 10),
 ('independent_house','residential','Independent House',     'इंडिपेंडेंट हाउस',   20),
 ('villa',          'residential', 'Villa',                  'विला',               30),
 ('plot',           'land',        'Plot / Land',            'प्लॉट / ज़मीन',       40),
 ('office',         'commercial',  'Office Space',           'ऑफिस स्पेस',         50),
 ('retail',         'commercial',  'Retail Space / Shop',    'रिटेल स्पेस / दुकान', 60),
 ('warehouse',      'commercial',  'Warehouse',              'गोदाम',               70);

INSERT INTO amenities (code, name_en, name_hi) VALUES
 ('parking',        'Parking',            'पार्किंग'),
 ('lift',           'Lift',               'लिफ्ट'),
 ('power_backup',   'Power backup',       'पावर बैकअप'),
 ('security',       '24x7 security',      '24x7 सुरक्षा'),
 ('gym',            'Gymnasium',          'जिम'),
 ('park',           'Park / green area',  'पार्क / हरित क्षेत्र'),
 ('club_house',     'Club house',         'क्लब हाउस'),
 ('swimming_pool',  'Swimming pool',      'स्विमिंग पूल');

-- ---------- company profile: SUPPLIED values, all flagged unverified ----------
-- Source: Website Blueprint (Updated), page "Get in Touch". The legal name, CIN, full addresses and
-- RERA applicability still need written confirmation (see docs/PENDING_BUSINESS_CONFIRMATIONS.md).
-- Intended company email: info@anantinfrarealty.com (subject to business confirmation). An older, obsolete address is deliberately NOT stored.
INSERT INTO site_settings (key, value, verified) VALUES
 ('company.display_name',  'UNAVORA ANANT INFRA',                          true),
 ('company.legal_name',    'UNAVORA ANANT INFRA REAL ESTATE PVT. LTD.',    false),
 ('company.director_name', 'Rahul Shukla',                                 false),
 ('company.phone',         '+918318377108',                                false),
 ('company.email',         'info@anantinfrarealty.com',                    false),
 ('company.website',       'https://anantinfrarealty.com',                 false),
 ('company.cin',           NULL,                                           false),
 ('company.rera_number',   NULL,                                           false),
 ('company.tagline',       'Building Trust. Creating Value.',              true);

INSERT INTO company_offices (kind, city, locality, state, verified, sort_order) VALUES
 ('registered', 'Noida',     'Sector 37',   'Uttar Pradesh', false, 10),
 ('branch',     'Lucknow',   'Gomti Nagar', 'Uttar Pradesh', false, 20),
 ('branch',     'Prayagraj', 'Civil Lines', 'Uttar Pradesh', false, 30);

INSERT INTO priority_rules (code, description, condition_json, points) VALUES
 ('budget_stated',     'Customer stated a budget range',            '{"field":"budget_max","op":"present"}', 15),
 ('property_specific', 'Enquiry is about a specific property',      '{"field":"interested_property_id","op":"present"}', 20),
 ('visit_requested',   'Customer asked for a site visit',           '{"field":"enquiry_type","op":"eq","value":"site_visit"}', 25),
 ('timeline_immediate','Purchase timeline is immediate',            '{"field":"purchase_timeline","op":"eq","value":"immediate"}', 25);
