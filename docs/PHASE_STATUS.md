# PHASE_STATUS.md

Updated 2026-11-07. Evidence: TEST_RESULTS.md.

| Phase | Status |
|---|---|
| 0 Architecture & docs | ARCHITECTURE v2.0 approved; customer-signup amendment added (§5.1). Mock-up claims treated as placeholders |
| 1 Local scaffold | **Built and running locally**: Compose (Postgres 17, Keycloak 26, Mailpit), API, web. MinIO BLOCKED (images unavailable), opt-in |
| 2 Database & seed | **V1–V9 + synthetic seed applied** on clean and existing local DBs and in Testcontainers |
| 3 Vertical slice 1 (search → enquiry → CRM → employee → director) | **Done locally**: tests PASS (MockMvc ITs, Playwright, 19-check flow script with real Keycloak tokens) |
| 3b Vertical slice 2 (customer Google sign-in + WhatsApp OTP) | **Done locally with MOCK adapters**: tests PASS. Real Google and real WhatsApp: **not configured, not tested** |
| 4 CRM breadth | Partly: customer list/detail, communication log, follow-ups (API). Stage changes, notes UI, visits, deals: schema only |
| 5 Staging / 6 Production | Not started. Production needs separate human approval |
| CI | **Green on GitHub** (private repo `Markandey2002/unavora-platform`): run #2 on `2814c52`, 4/4 jobs passed (secret scan, API, web, end-to-end). Superseded `infra/ci/github-actions-ci.yml` removed |

## Done (verified locally)
Public property search/detail (en/hi), enquiry → customer + consent + lead + assignment + timeline + audit + outbox (idempotent, rate-limited per visitor), staff lead list/detail with record isolation, director overview, "Continue with Google" (mock) with one profile per Google account, customer sessions (HttpOnly cookie via BFF, hashed in DB), WhatsApp OTP (mock) with expiry/attempt/resend limits, signed-in enquiry/callback/site-visit requests as separate leads, separate enquiry vs marketing consent, CRM customer list including registered-only customers, contact actions (tel:, wa.me), communication history, follow-ups, internal BFF API protected by service credential, security baseline tests.

## Not done
Staff/director web UI and staff BFF login (staff use API + Keycloak tokens today), director MFA enforcement (Keycloak dev realm has none; designed for Cognito), real Google OAuth client, real WhatsApp provider adapter and template, outbox relay + email/WhatsApp notifications, payments sandbox, CMS UI, SEO files, file uploads (MinIO blocked), Terraform (none by design), container image builds, real assets and content.

## Safety posture
No AWS resources, no Terraform apply, no DNS or WordPress changes, no live payments, no purchases, no production credentials. Only synthetic data (`@example.test`, `mock-` subjects, `[SAMPLE]` listings). Mock adapters cannot be enabled by default outside `local`/`test`.
