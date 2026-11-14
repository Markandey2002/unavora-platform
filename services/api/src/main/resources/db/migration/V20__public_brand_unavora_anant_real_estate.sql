-- V20: owner-approved public brand (2026-11-13): "UNAVORA ANANT REAL ESTATE", tagline "INVEST IN A BETTER LIVING",
-- primary domain uainfrarealestate.com. Only the V8 default values are replaced: a value the director has already
-- changed in CRM → Company facts is left alone. The REGISTERED LEGAL NAME (company.legal_name) is deliberately NOT
-- touched: it stays as recorded until the company confirms its legal name from official records.

UPDATE site_settings SET value = 'UNAVORA ANANT REAL ESTATE'
 WHERE key = 'company.display_name' AND value = 'UNAVORA ANANT INFRA';

UPDATE site_settings SET value = 'INVEST IN A BETTER LIVING'
 WHERE key = 'company.tagline' AND value = 'Building Trust. Creating Value.';

-- The new domain becomes the recorded website; it stays unverified (not shown publicly) until the site is live there.
UPDATE site_settings SET value = 'https://uainfrarealestate.com', verified = false
 WHERE key = 'company.website' AND value = 'https://anantinfrarealty.com';
