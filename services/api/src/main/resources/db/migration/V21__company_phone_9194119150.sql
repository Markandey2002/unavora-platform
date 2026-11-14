-- V21: new public business phone confirmed by the owner on 2026-11-14: +91 91941 19150 (E.164 +919194119150).
-- Replaces the previous number +918318377108 (seeded in V8, verified 2026-11-12) wherever it is still the stored
-- value, and marks it verified so it is shown on the website (header/footer, contact page, Call buttons,
-- structured data). A value the director has since changed in CRM -> Company facts is left untouched.
-- WhatsApp is NOT changed here: no WhatsApp Business number has been confirmed.

UPDATE site_settings SET value = '+919194119150', verified = true, updated_at = now()
 WHERE key = 'company.phone' AND value = '+918318377108';

UPDATE company_offices SET phone = '+919194119150'
 WHERE phone = '+918318377108';
