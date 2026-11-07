-- LOCAL / TEST ONLY. Loaded via spring.flyway.locations in application-local.yml and application-test.yml.
-- NEVER referenced by staging or production configuration.
-- Everything here is SYNTHETIC. Property titles carry the [SAMPLE] marker, prices are invented,
-- users use @example.test addresses. Locality names are real place names used only as geography.

-- Users: fixed ids so the Keycloak dev realm (infra/local/keycloak) matches by external_subject.
INSERT INTO users (id, external_subject, email, full_name, status, preferred_language, mfa_enrolled) VALUES
 ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'director.local@example.test',  'Local Director (synthetic)',  'active', 'en', false),
 ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000102', 'employee1.local@example.test', 'Local Employee One (synthetic)', 'active', 'en', false),
 ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000103', 'employee2.local@example.test', 'Local Employee Two (synthetic)', 'active', 'hi', false);

INSERT INTO user_roles (user_id, role_id)
SELECT '00000000-0000-0000-0000-000000000101', id FROM roles WHERE code = 'director';
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM (VALUES ('00000000-0000-0000-0000-000000000102'::uuid), ('00000000-0000-0000-0000-000000000103'::uuid)) u(id)
CROSS JOIN roles r WHERE r.code = 'employee';

INSERT INTO localities (id, city, state, name_en, name_hi, slug) VALUES
 ('10000000-0000-0000-0000-000000000001', 'Noida',     'Uttar Pradesh', 'Sector 37',   'सेक्टर 37',    'noida-sector-37'),
 ('10000000-0000-0000-0000-000000000002', 'Lucknow',   'Uttar Pradesh', 'Gomti Nagar', 'गोमती नगर',    'lucknow-gomti-nagar'),
 ('10000000-0000-0000-0000-000000000003', 'Prayagraj', 'Uttar Pradesh', 'Civil Lines', 'सिविल लाइन्स', 'prayagraj-civil-lines');

-- Properties. area_unit sq_ft unless stated. owner_user_id = assigned employee.
INSERT INTO properties (id, property_type_id, locality_id, purpose, status, availability, price_amount, price_negotiable,
                        area_unit, built_up_area, plot_area, bedrooms, bathrooms, parking_spaces, furnishing,
                        owner_user_id, created_by, published_at, availability_confirmed_at)
SELECT v.id::uuid, pt.id, v.loc::uuid, 'sale', v.status, v.avail, v.price, true,
       v.unit, v.built, v.plot, v.beds, v.baths, v.parking, v.furn,
       '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000102',
       CASE WHEN v.status IN ('published','sold') THEN now() END,
       CASE WHEN v.status = 'published' THEN now() END
FROM (VALUES
 ('20000000-0000-0000-0000-000000000001','apartment','10000000-0000-0000-0000-000000000001','published','available', 8500000,'sq_ft',1250,NULL::numeric,3,2,1,'semi_furnished'),
 ('20000000-0000-0000-0000-000000000002','apartment','10000000-0000-0000-0000-000000000002','published','available', 6200000,'sq_ft',980, NULL,2,2,1,'unfurnished'),
 ('20000000-0000-0000-0000-000000000003','villa',    '10000000-0000-0000-0000-000000000002','published','under_offer',21000000,'sq_ft',2800,2400,4,4,2,'furnished'),
 ('20000000-0000-0000-0000-000000000004','plot',     '10000000-0000-0000-0000-000000000003','published','available', 4500000,'sq_yd',NULL,200,NULL::int,NULL::int,NULL::int,NULL),
 ('20000000-0000-0000-0000-000000000005','office',   '10000000-0000-0000-0000-000000000001','draft',    'available', 12000000,'sq_ft',1800,NULL,NULL,2,3,'unfurnished'),
 ('20000000-0000-0000-0000-000000000006','apartment','10000000-0000-0000-0000-000000000003','sold',     'sold',      5100000,'sq_ft',900, NULL,2,1,1,'unfurnished')
) AS v(id, type_code, loc, status, avail, price, unit, built, plot, beds, baths, parking, furn)
JOIN property_types pt ON pt.code = v.type_code;

-- Translations. Hindi text is a DRAFT (review_status='draft') pending native-speaker review.
INSERT INTO property_translations (property_id, language, title, slug, description, review_status) VALUES
 ('20000000-0000-0000-0000-000000000001','en','[SAMPLE] 3 BHK apartment, Sector 37 Noida','sample-3bhk-apartment-sector-37-noida','Synthetic listing for local development only. Not a real property.','approved'),
 ('20000000-0000-0000-0000-000000000001','hi','[नमूना] 3 BHK अपार्टमेंट, सेक्टर 37 नोएडा','namuna-3bhk-apartment-sector-37-noida','केवल स्थानीय विकास के लिए कृत्रिम सूची। यह कोई वास्तविक संपत्ति नहीं है।','draft'),
 ('20000000-0000-0000-0000-000000000002','en','[SAMPLE] 2 BHK apartment, Gomti Nagar Lucknow','sample-2bhk-apartment-gomti-nagar-lucknow','Synthetic listing for local development only. Not a real property.','approved'),
 ('20000000-0000-0000-0000-000000000002','hi','[नमूना] 2 BHK अपार्टमेंट, गोमती नगर लखनऊ','namuna-2bhk-apartment-gomti-nagar-lucknow','केवल स्थानीय विकास के लिए कृत्रिम सूची।','draft'),
 ('20000000-0000-0000-0000-000000000003','en','[SAMPLE] 4 BHK villa, Gomti Nagar Lucknow','sample-4bhk-villa-gomti-nagar-lucknow','Synthetic listing for local development only. Not a real property.','approved'),
 ('20000000-0000-0000-0000-000000000003','hi','[नमूना] 4 BHK विला, गोमती नगर लखनऊ','namuna-4bhk-villa-gomti-nagar-lucknow','केवल स्थानीय विकास के लिए कृत्रिम सूची।','draft'),
 ('20000000-0000-0000-0000-000000000004','en','[SAMPLE] 200 sq yd plot, Civil Lines Prayagraj','sample-200-sq-yd-plot-civil-lines-prayagraj','Synthetic listing for local development only. Not a real property.','approved'),
 ('20000000-0000-0000-0000-000000000004','hi','[नमूना] 200 वर्ग गज प्लॉट, सिविल लाइन्स प्रयागराज','namuna-200-varg-gaz-plot-civil-lines-prayagraj','केवल स्थानीय विकास के लिए कृत्रिम सूची।','draft'),
 ('20000000-0000-0000-0000-000000000005','en','[SAMPLE] Draft office space, Sector 37 Noida','sample-draft-office-sector-37-noida','Draft: must NEVER appear in public search (visibility test).','draft'),
 ('20000000-0000-0000-0000-000000000006','en','[SAMPLE] Sold 2 BHK, Civil Lines Prayagraj','sample-sold-2bhk-civil-lines-prayagraj','Sold: must NEVER appear in public search (visibility test).','approved');

INSERT INTO property_amenities (property_id, amenity_id)
SELECT p.id, a.id FROM (VALUES
  ('20000000-0000-0000-0000-000000000001'::uuid,'parking'),('20000000-0000-0000-0000-000000000001','lift'),
  ('20000000-0000-0000-0000-000000000001','security'),('20000000-0000-0000-0000-000000000002','parking'),
  ('20000000-0000-0000-0000-000000000003','park'),('20000000-0000-0000-0000-000000000003','security')
) p(id, code) JOIN amenities a ON a.code = p.code;

-- Two synthetic customers + leads (one per employee) for record-level access-control tests.
INSERT INTO customers (id, public_ref, full_name, phone_e164, email_normalized, preferred_language) VALUES
 ('30000000-0000-0000-0000-000000000001','CUS-LOCAL-1','Synthetic Customer A','+919999900001','a@example.test','en'),
 ('30000000-0000-0000-0000-000000000002','CUS-LOCAL-2','Synthetic Customer B','+919999900002','b@example.test','hi');

INSERT INTO leads (id, public_ref, customer_id, source_id, stage_id, assigned_user_id, interested_property_id, enquiry_type, message)
SELECT v.id::uuid, v.ref, v.cust::uuid, ls.id, ps.id, v.assignee::uuid, v.prop::uuid, 'property', 'Synthetic lead for isolation tests'
FROM (VALUES
 ('40000000-0000-0000-0000-000000000001','LEAD-LOCAL-1','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000102','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002','LEAD-LOCAL-2','30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000103','20000000-0000-0000-0000-000000000002')
) v(id, ref, cust, assignee, prop)
JOIN lead_sources ls ON ls.code = 'website_property'
JOIN pipeline_stages ps ON ps.code = 'assigned';

INSERT INTO lead_assignments (lead_id, assigned_to, method, reason) VALUES
 ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000102','manual','synthetic seed'),
 ('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000103','manual','synthetic seed');
