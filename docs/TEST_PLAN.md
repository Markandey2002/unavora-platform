# TEST_PLAN.md

Result vocabulary: **PASS / FAIL / BLOCKED / NOT RUN**. A test is PASS only if it was executed and its output recorded in TEST_RESULTS.md.

| Layer | Tool | Where | Covers |
|---|---|---|---|
| Migrations & constraints | Testcontainers PostgreSQL 17 | `DatabaseConstraintsIT` | pricing rules, lost reason, append-only audit, shared phones, one open deal |
| Public API | MockMvc + Testcontainers | `PublicPropertyIT` | visibility rule, private-field leakage, filters, pagination, Hindi, 404s |
| CRM flow | MockMvc + Testcontainers | `EnquiryAndLeadFlowIT` | enquiry → lead, idempotency, shared customer, validation, rate limit, auth, employee isolation, director access |
| Security baseline | MockMvc + Testcontainers | `SecurityIT` | forged/alg=none JWT, headers, CORS, injection strings, no internals in errors |
| Customer accounts | MockMvc + Testcontainers | `CustomerIdentityIT` | mock Google login, no duplicates, sessions, OTP limits, separate leads/consents, CRM visibility, contact actions, communications, follow-ups |
| Architecture | ArchUnit | `ArchitectureTest` | module `internal` packages private (properties, crm, customers) |
| Web unit | Vitest | `apps/web/src/**/*.test.ts` | formatting helpers |
| End-to-end | Playwright (mobile + desktop) | `apps/web/e2e` | search → detail → enquiry; Hindi route; Google (mock) signup → WhatsApp OTP (mock) → site visit → re-login same profile; cookie flags; BFF CSRF |
| Business flow | Python stdlib script vs running stack + Keycloak | `infra/local/scripts/validate_*.py` | 19 + 25 checks incl. real staff tokens and DB assertions |
| Real providers | manual + contract | staging | Google OAuth client and WhatsApp provider: BLOCKED until approved accounts exist |
| Later | k6/Gatling, ZAP, axe, Lighthouse | staging | load, security, accessibility, CWV |

Staging gate and production gate: see ARCHITECTURE §14.4. Production needs explicit human approval.
