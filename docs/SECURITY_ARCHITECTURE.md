# SECURITY_ARCHITECTURE.md

Summary lives in ARCHITECTURE §11; this file records what is **implemented** vs **designed**.

## Trust boundaries
Internet → CloudFront/WAF → ALB → Next.js (web) and Spring Boot (api, port 8080). Management/actuator on 8081, never routed by the ALB. PostgreSQL private, no public endpoint; locally bound to 127.0.0.1.

## Controls
| Area | Control | Status |
|---|---|---|
| AuthN (staff) | OIDC (Keycloak local, Cognito later); API is a stateless JWT resource server; invitation-only accounts | PASS locally with real Keycloak tokens (flow script) |
| AuthN (customers) | Continue with Google via BFF (PKCE, state, nonce); API verifies ID token; mock adapter locally | Mock PASS; real Google NOT RUN |
| Browser sessions (customers) | Opaque token, SHA-256 at rest, HttpOnly SameSite=Lax cookie (`__Host-` + Secure on HTTPS), 7 d idle / 30 d absolute, logout revokes | PASS (Playwright checks HttpOnly, not readable by JS) |
| Browser sessions (staff) | BFF + API Authorization Code + PKCE (verifier/nonce server-side), IdP tokens discarded, opaque session (SHA-256 at rest) in HttpOnly SameSite=Lax cookie (`__Host-` on HTTPS), 30 min idle / 12 h absolute (8 h MFA roles), revoked on logout, ended when user disabled | PASS (StaffSessionIT, Playwright) |
| BFF → API | `/internal/v1/**` separate filter chain, service credential (constant-time compare), bearer refused | PASS (CustomerIdentityIT) |
| CSRF (BFF) | Server actions: Next origin check; route handlers: Origin must equal site; SameSite=Lax | PASS (cross-origin logout → 403) |
| AuthZ | Roles/permissions in PostgreSQL, `@PreAuthorize("@access.has(..)")`, evaluated per request | PASS |
| Record-level | Employee queries filtered by assignment (leads, customers); foreign records → 404 | PASS |
| Public API | Only `/api/v1/public/**`; others require token; validation on all inputs; RFC 7807 errors without internals (framework 4xx keep status) | PASS (SecurityIT) |
| Abuse | Per-visitor in-memory limiter on enquiries (BFF forwards visitor IP) and Google login; OTP: 30 s resend, 5/hour, 5 attempts; WAF rate rules in AWS | PASS locally / designed |
| OTP secrecy | Code never stored or logged; HMAC-SHA256(secret, id:code) | PASS |
| Privacy | Consent recorded with notice version; outbox payloads carry ids only; IP stored as SHA-256 hash | Implemented (hash is unsalted, add a secret salt before production) |
| Audit | Append-only `audit_logs`; lead views and public lead creation logged | Partially implemented |
| Secrets | None in repo; local dev values only in `compose.yaml`/`.env.example`; prod config has no defaults | Implemented |
| Headers | nosniff, frame deny, referrer policy (API); web adds Permissions-Policy | Implemented; CSP pending |
| MFA | Director MFA mandatory, enforced by the API (`roles.requires_mfa` + `amr` contains `otp`) at sign-in and on every request, for website sessions and bearer tokens. Local: Keycloak TOTP (synthetic secret); staging: Cognito TOTP | PASS locally (StaffSessionIT, Playwright with real Keycloak TOTP) |
| Payments | Webhook signature check, idempotent events, no card data stored | Schema only |
| Files | Private bucket, short-lived signed URLs, malware scan on upload | Designed |
| Backups/DR | Aurora PITR, restore drill | Designed |

## Local-dev exceptions (never carry to staging/production)
Keycloak `dev-cli` direct-access grant; fixed passwords in the dev realm; fixed UUID users; no MFA; `start-dev` Keycloak.

Also local-only: mock Google sign-in and mock WhatsApp OTP (`mock` modes, `/internal/v1/dev/mock-whatsapp` endpoint), fixed internal service token and OTP secret in `application-local.yml`, `flyway.out-of-order`.

## Before staging
Trust only CloudFront/ALB-set `X-Forwarded-For` hops (configure trusted proxies); move `/internal/**` to the management port or keep ALB no-route + SG; rotate the service credential via Secrets Manager.

CSP with nonces; salted IP hash; RLS evaluation; dependency/vulnerability scan in CI; secrets in Secrets Manager; pen-test checklist; rate limits at WAF; DSR (export/erasure) workflow.
