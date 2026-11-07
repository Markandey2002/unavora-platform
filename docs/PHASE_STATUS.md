# PHASE_STATUS.md

Updated 2026-11-07. Evidence: TEST_RESULTS.md.

| Phase | Status |
|---|---|
| 0 Architecture & docs | ARCHITECTURE v2.0 approved; customer-signup amendment added (§5.1). Mock-up claims treated as placeholders |
| 1 Local scaffold | **Built and running locally**: Compose (Postgres 17, Keycloak 26, Mailpit), API, web. MinIO BLOCKED (images unavailable), opt-in |
| 2 Database & seed | **V1–V9 + synthetic seed applied** on clean and existing local DBs and in Testcontainers |
| 3 Vertical slice 1 (search → enquiry → CRM → employee → director) | **Done locally**: tests PASS (MockMvc ITs, Playwright, 19-check flow script with real Keycloak tokens) |
| 3b Vertical slice 2 (customer Google sign-in + WhatsApp OTP) | **Done locally with MOCK adapters**: tests PASS. Real Google and real WhatsApp: **not configured, not tested** |
| 4 CRM breadth | **Slice 4 committed (`71803d8`, test fixes `a31a742`, `c744cdf`, `f888bba`), CI green**: complete lead workflow — validated stage changes with history and reasons, director assignment/reassignment with history, site visits (schedule, reschedule, cancel, complete, no-show), follow-ups with priority and visit links, employee dashboard and extended director overview; staff sign-out now also ends the Keycloak session. **Slice 3 committed `5624342`, CI green**: staff/director web sign-in (BFF, Authorization Code + PKCE, director TOTP enforced by the API), Leads, Customers, My follow-ups, Director overview (en/hi, mobile), call/WhatsApp actions, communication log, follow-ups. Out of scope by decision: stage changes, site-visit scheduling, deals, reassignment, exports |
| 5 Staging / 6 Production | Not started. Production needs separate human approval |
| CI | **Green on GitHub** (private repo `Markandey2002/unavora-platform`): latest run on `f888bba` (Slice 4 + test fixes), all jobs passed (secret scan, API, web, end-to-end); earlier runs on `71803d8`, `a31a742`, `c744cdf` failed on test-only bugs, recorded in TEST_RESULTS §11. Superseded `infra/ci/github-actions-ci.yml` removed |

## Done (verified locally)
Public property search/detail (en/hi), enquiry → customer + consent + lead + assignment + timeline + audit + outbox (idempotent, rate-limited per visitor), staff lead list/detail with record isolation, director overview, "Continue with Google" (mock) with one profile per Google account, customer sessions (HttpOnly cookie via BFF, hashed in DB), WhatsApp OTP (mock) with expiry/attempt/resend limits, signed-in enquiry/callback/site-visit requests as separate leads, separate enquiry vs marketing consent, CRM customer list including registered-only customers, contact actions (tel:, wa.me), communication history, follow-ups, internal BFF API protected by service credential, security baseline tests.

## Not done
Cognito configuration for staging (director TOTP there), MFA step-up for future high-risk actions, deals and payments workflow (Won is reachable only through a completed deal, D-008), exports, real notifications (outbox relay; events are written but not sent), real Google OAuth client, real WhatsApp provider adapter and template, outbox relay + email/WhatsApp notifications, payments sandbox, CMS UI, SEO files, file uploads (MinIO blocked), Terraform (none by design), container image builds, real assets and content.

## Safety posture
No AWS resources, no Terraform apply, no DNS or WordPress changes, no live payments, no purchases, no production credentials. Only synthetic data (`@example.test`, `mock-` subjects, `[SAMPLE]` listings). Mock adapters cannot be enabled by default outside `local`/`test`.
