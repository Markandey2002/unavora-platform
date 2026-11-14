# LAUNCH_READINESS_REPORT.md — where every launch requirement stands (2026-11-12)

Source of truth for company facts: CONTENT_READINESS_CHECKLIST.md (not overridden here). Branch `website-completion`
(PR #1). Everything in "Code implemented" since `33fe153` is **uncommitted** until the owner approves a commit.
"Locally tested" means automated tests against the local stack (Testcontainers PostgreSQL for the API, the standalone
Next.js server + local API/Keycloak/PostgreSQL for the browser tests). Nothing has been deployed anywhere.

## 1. Code implemented

| Area | What exists |
|---|---|
| Three content types | A real properties/projects (CRM draft → review → publish; price, possession, RERA, developer shown only when approved/verified) · B illustrative showcase (`showcase_items`, V18) · C synthetic data (`is_sample` on properties, projects, articles, reviews and — V19 — showcase items; hidden unless local/test; startup guard) |
| Showcase CMS | CRM → Website content → Showcase: create, edit English/Hindi, category, homepage position, button, image from the approved library (replace any time), link a published real property/project, desktop + phone preview, submit / publish (director) / unpublish / archive, audit history. Content replacement needs no code change |
| Homepage | hero + finder → New launches (real approved projects; otherwise "Discover upcoming opportunities" with Register your interest) → Featured properties (real listings only; hidden when none) → Explore property styles (illustrative, labelled, disclosure) → categories → locations → … Director can reorder/hide sections |
| Enquiries | real listing enquiries keep the property id; showcase and register-interest enquiries create a general lead (source `website_showcase`, campaign, preferred location, consent; no property/project id) in the CRM "new" queue; marketing consent recorded only when asked |
| Contact details | verified phone shown as "+91 91941 19150" with `tel:+919194119150` (updated 2026-11-14); verified e-mail; unverified items (WhatsApp, offices, hours, social) hidden; WhatsApp links use digits only once a number is verified |
| Media security | private originals, quarantine (`pending` / `not_scanned`), scanner port with `clamd` (INSTREAM, fails closed), `mock` (EICAR, refused outside local/test) and `none` (uploads stay `not_scanned`); approval refused unless the scan is `clean`; approved files copied to a separate public store under a new key; owner documents never public |
| SEO | en/hi metadata, canonical, hreflang, sitemap (real records only), robots `Disallow: /` outside production, JSON-LD only for real records (none for showcase) |

## 2. Locally tested (2026-11-12)

| Test | Result |
|---|---|
| API `mvn verify` (all integration tests, after V19) | **104/104 pass**, incl. ShowcaseIT 4/4 and ProductionVisibilityIT 4/4 (new: sample showcase items never public, enquiry with one refused) |
| Malware scanner tests | MalwareScannerTest (clamd reply parsing, simulated clamd with EICAR, unreachable daemon → `scan_failed`, mock refused outside local/test); ListingWorkflowIT (EICAR upload refused, unscanned file cannot be approved) |
| Web type-check / unit tests / build | tsc clean; Vitest 14/14; `next build` OK |
| Playwright (final run, desktop + mobile) | **80 pass / 12 skipped by design / 0 failed**, incl. `showcase.spec` and `showcase-cms.spec` (create → publish → Hindi edit → replace image → link real listing → archive); `showcase.spec` also passed 7/7 in production-visibility mode |
| Production-visibility run | API with `include-sample-content=false`: no public properties/projects, Discover panel and showcase render, Featured hidden, register-interest lead created without project id |

Not tested: a real ClamAV daemon, S3/CDN, real Google sign-in, real WhatsApp, screen reader (owner task), field Web
Vitals, the full 320–1920 px viewport sweep for the new sections (planned).

## 3. Waiting for company information

WhatsApp Business number · office addresses, PIN codes, directions · working hours · official Instagram, Facebook,
LinkedIn, YouTube, X URLs · legal name, CIN, RERA confirmations · director-name confirmation · genuine properties and
project details · property/project photographs · approved company copy · production showcase wording and images ·
testimonials with consent · partner associations and logo permissions · original articles and videos · native-speaker
Hindi review · logo vector master and reversed version.

## 4. Waiting for external provider credentials

Google Cloud OAuth client (consent screen, test accounts) for "Continue with Google" · Meta WhatsApp Business Platform
(verified business, number, approved authentication template, access token) for WhatsApp OTP · both stay mock /
disabled until then.

## 5. Waiting for staging infrastructure (needs explicit approval; no AWS resources created)

Private S3 bucket for originals and owner uploads · public media bucket behind a CDN (`MEDIA_PUBLIC_URL`) · real malware
scanning (ClamAV `clamd` service or S3 scanning pipeline) tested with the EICAR file · Cognito for staff (director MFA) ·
secrets manager · production-only indexing (robots) on the final domain · DNS cutover plan (no DNS change made).

## 6. Waiting for legal approval

Privacy notice and terms (current pages are drafts) · consent wording and retention periods (DPDP Act) · privacy text
covering Google sign-in data and WhatsApp messaging · RERA wording for any project or company registration.

## Known limitation

After a CMS change, a page pre-rendered at build time may show its previous version until its 60-second refresh
(observed on `/hi`). The change itself is saved and live in the API immediately.

## Update 2026-11-13 — brand, domain, hosting and communication planning

Read-only investigation completed: MASTER_PLAN_2026-11-13.md, DOMAIN_MIGRATION_PLAN.md, COMMUNICATION_SYSTEM_DESIGN.md.
Nothing was changed in DNS, mail, hosting or code for this update.

| Category | New items |
|---|---|
| Code implemented | — (planning only). Pending commit: homepage first-screen + New launches carousel (round 4) |
| Locally tested | Load test of the production builds: ~50 req/s at 25 concurrent users, 0 errors; Next.js 422 MB peak (bottleneck ~1 core), API 255 MB, PostgreSQL 86 MB, Keycloak 800 MB |
| Waiting for company information | Original logo file, vector master and reversed logo; exact legal name; confirmation that `Rahul.Shukla@uainfrarealestate.com` is active (plan, daily limit, SMTP sign-in) and the choice of automated sender; internal alert recipients |
| Waiting for external provider credentials | Google OAuth clients (dev/prod) — redirect `https://uainfrarealestate.com/_bff/auth/google/callback`; Meta WhatsApp Business (verification, number, token, templates); Cloudflare R2 |
| Waiting for staging infrastructure | Hosting choice (4 GB is not safe with ClamAV + Keycloak; 8 GB recommended — see MASTER_PLAN §6), deployment packaging, real ClamAV, encrypted offsite backups with restore tests, DNS cut-over (approval) |
| Waiting for legal approval | Privacy notice/terms covering Google sign-in, WhatsApp and marketing consent; legal-name usage |

Email status: **pending configuration** — the new domain's mail runs on Hostinger Mail with SPF, DKIM and DMARC
(`p=none`) published; SMTP TLS verified on ports 465/587; mailbox and sending ability not yet verified.
