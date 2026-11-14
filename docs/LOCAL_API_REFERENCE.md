# LOCAL_API_REFERENCE.md — every API you can test on the local stack (2026-11-13)

Generated from the controllers in `services/api/src/main/java` (106 routes; each staff route also exists under
`/internal/v1/...` for the website's BFF — use the `/api/v1/...` form when testing by hand). Machine-readable contract
for Postman/Insomnia import: `contracts/openapi/unavora-api.v1.yaml`. Smoke-tested 2026-11-13: 28/28 checks as expected.

| | |
|---|---|
| API base | `http://localhost:8080` |
| Health (management port) | `http://localhost:8081/actuator/health` |
| Website | `http://localhost:3000/en` (calls the API through its BFF) |
| Data | synthetic local data only (`[SAMPLE]`, `@example.test`) |

## Swagger UI (local only)

Open **http://localhost:8080/swagger-ui.html** while the API runs with the `local` profile. Pick a group in
"Select a definition": 1. Public (no auth) · 2. Staff & director (Bearer) · 3. Customer (service token + session) ·
4. BFF staff routes. Click **Authorize** and fill in what the group needs:
- `staffBearer`: output of `python infra/local/scripts/staff_token.py employee1` (or `director`), without "Bearer ";
- `internalServiceToken`: `local-dev-internal-token-not-a-secret`;
- `customerSession`: the `sessionToken` returned by `POST /internal/v1/customer-auth/google`.
Raw OpenAPI JSON per group: `http://localhost:8080/v3/api-docs/1-public` (also `2-staff`, `3-customer`, `4-bff-staff`).
Swagger is **disabled in every other profile** (springdoc off in `application.yml`; `OpenApiConfig` is `@Profile("local")`;
`OpenApiExposureIT` fails if `/v3/api-docs` or `/swagger-ui.html` is ever served outside local).

## Authentication

| Group | How |
|---|---|
| **Public** `/api/v1/public/**` | none. Enquiry-type POSTs are rate-limited to 10 per hour per IP and accept an optional `Idempotency-Key` header (same key → same lead) |
| **Staff / director** `/api/v1/staff/**`, `/api/v1/director/**` | `Authorization: Bearer <token>` from the local Keycloak. Get one with `python infra/local/scripts/staff_token.py employee1` (or `employee2`, `director`; the director token waits up to 30 s for a fresh one-time code). Synthetic users are in `infra/local/keycloak/unavora-dev-realm.json`. What each user may call depends on its permissions (column "Permission") — e.g. an employee gets **403** on `/api/v1/director/overview` |
| **Customer (internal)** `/internal/v1/customer**` | `X-Internal-Service-Token: local-dev-internal-token-not-a-secret` (local value) and, after sign-in, `X-Customer-Session: <sessionToken>`. Local sign-in uses the **mock** Google credential `mock-google:<b64url(sub)>:<b64url(email)>:<b64url(name)>` where `sub = "mock-" + first 24 hex chars of sha256(email)` |

### Quick start — PowerShell 5.1 (one command per line)
```powershell
Invoke-RestMethod "http://localhost:8080/api/v1/public/properties?lang=en&limit=5"
$tok = python infra/local/scripts/staff_token.py employee1
Invoke-RestMethod "http://localhost:8080/api/v1/staff/leads" -Headers @{ Authorization = "Bearer $tok" }
```
### Quick start — bash
```bash
curl "http://localhost:8080/api/v1/public/properties?lang=en&limit=5"
TOK=$(python infra/local/scripts/staff_token.py employee1)
curl -H "Authorization: Bearer $TOK" http://localhost:8080/api/v1/staff/leads
curl -X POST http://localhost:8080/api/v1/public/enquiries -H "Content-Type: application/json" \
  -d '{"name":"Test Buyer","phone":"9876500001","consent":true,"enquiryType":"general","message":"Local test"}'
```

## 1. Public (no authentication)

| Method | Path | Notes / parameters |
|---|---|---|
| GET | `/api/v1/public/properties` | search: `lang`, `city`, `locality`, `category`, `type`, `minPrice`, `maxPrice`, `q`, `sort` (newest, price_asc, price_desc, featured), `limit`, `cursor` |
| GET | `/api/v1/public/properties/{slug}` | listing detail (`lang`) |
| GET | `/api/v1/public/properties/slugs/{slug}` | slugs of the same listing in en/hi |
| GET | `/api/v1/public/locations` | cities and localities with live listings (`lang`) |
| GET | `/api/v1/public/projects` | new launches: `lang`, `q`, `status`, `category`, `type`, `city`, `limit`, `offset` |
| GET | `/api/v1/public/projects/{slug}` · `/api/v1/public/projects/slugs/{slug}` | project detail · per-language slugs |
| GET | `/api/v1/public/showcase` | illustrative showcase cards (`lang`, `category`) |
| GET | `/api/v1/public/site-blocks` | published CMS blocks: hero, tiles, section order, SEO, careers (`lang`) |
| GET | `/api/v1/public/company` | verified company facts, offices, social links |
| GET | `/api/v1/public/articles` · `/{slug}` · `/slugs/{slug}` | Insights list (`lang`, `kind`, `category`, `q`, `limit`) · article · slugs |
| GET | `/api/v1/public/testimonials` | consented testimonials (`lang`) |
| GET | `/api/v1/public/associations` | confirmed partner associations |
| GET | `/api/v1/public/location-content/{citySlug}` | published city introduction (`lang`) |
| GET | `/api/v1/public/media/{key}` | approved public image (local disk adapter) |
| POST | `/api/v1/public/enquiries` | JSON `{name, phone, email?, message?, propertyId?, language?, consent:true, marketingConsent?, enquiryType?, showcaseId?, context?, preferredLocation?}` → `{reference:"LEAD-…"}` |
| POST | `/api/v1/public/channel-partners` | JSON `{name, phone, email?, companyName?, city, areasOfInterest?, reraNumber?, message?, language?, consent:true}` |
| POST | `/api/v1/public/property-submissions` | multipart: `name, phone, email?, city, locality?, propertyType, purpose (sale/rent), expectedPrice?, area?, areaUnit?, message?, language?, consent=true, photos[]` (JPEG/PNG/WebP, ≤ 5 × 5 MB) |

## 2. Staff and director (Bearer token)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/staff/dashboard` | lead.read_all / lead.read_own |
| GET | `/api/v1/director/overview` | report.director |
| GET | `/api/v1/staff/leads` · `/{id}` · `/{id}/activities` · `/{id}/history` | lead.read_all / lead.read_own |
| GET | `/api/v1/staff/pipeline` | lead.read_all / lead.read_own |
| POST | `/api/v1/staff/leads/{id}/stage` | lead.update |
| POST | `/api/v1/staff/leads/{id}/assign` | lead.assign |
| GET | `/api/v1/staff/assignees` | lead.assign / visit.manage_all / task.manage_all |
| GET | `/api/v1/staff/customers` · `/{id}` | customer.read_all / customer.read_own |
| POST | `/api/v1/staff/customers/{id}/communications` | lead.update |
| POST | `/api/v1/staff/customers/{id}/follow-ups` | task.manage_own / task.manage_all |
| GET · POST | `/api/v1/staff/follow-ups` | task.manage_own / task.manage_all |
| POST | `/api/v1/staff/follow-ups/{id}/complete` | task.manage_own / task.manage_all |
| GET · POST | `/api/v1/staff/site-visits` · GET `/{id}` | visit.read_all / visit.manage_own / visit.manage_all |
| POST | `/api/v1/staff/site-visits/{id}/reschedule` · `/cancel` · `/complete` · `/no-show` | visit.manage_own / visit.manage_all |
| GET | `/api/v1/staff/properties` · `/options` · `/{id}` | property.read_all / property.read_own |
| POST · PUT | `/api/v1/staff/properties` · `/{id}` | property.create |
| POST | `/api/v1/staff/properties/{id}/submit` | property.submit |
| POST | `/api/v1/staff/properties/{id}/review` | property.review |
| POST | `/api/v1/staff/properties/{id}/{action}` (publish, unpublish, mark-sold …) | property.publish |
| POST | `/api/v1/staff/properties/{id}/media` (multipart photo upload) | property.create |
| PUT · DELETE | `/api/v1/staff/properties/{id}/media/{mid}` | property.create / property.publish |
| GET | `/api/v1/staff/properties/{id}/media/{mid}/file` | property.read_all / property.read_own |
| POST | `/api/v1/staff/properties/{id}/media/{mid}/{action}` (approve, primary …) | property.publish |
| PUT | `/api/v1/staff/localities/{id}/position` | property.publish |
| GET | `/api/v1/staff/projects` · `/{id}` · `/{id}/media/{mid}/file` | property.read_all |
| POST · PUT | `/api/v1/staff/projects` · `/{id}` · `/{id}/{action}` · `/{id}/media` · `/{id}/media/{mid}` · `/{id}/media/{mid}/{action}` · DELETE `/{id}/media/{mid}` | property.publish |
| GET | `/api/v1/staff/submissions` · `/{id}` · `/{id}/files/{fileId}` | lead.read_all / lead.read_own |
| POST | `/api/v1/staff/submissions/{id}/review` | lead.read_all / lead.read_own |
| POST | `/api/v1/staff/submissions/{id}/decision` · `/{id}/create-listing` | property.publish |
| GET · PUT | `/api/v1/staff/cms/blocks` · `/{key}`; POST `/{key}/{action}` (submit, publish, unpublish) | cms.manage (publish: cms.publish) |
| GET | `/api/v1/staff/cms/preview` | cms.manage |
| GET · POST | `/api/v1/staff/cms/media` (multipart upload) · PUT/DELETE `/{id}` · GET `/{id}/file` | cms.manage |
| POST | `/api/v1/staff/cms/media/{id}/{action}` (approve, unapprove) | cms.publish |
| GET · POST | `/api/v1/staff/cms/associations` · PUT `/{id}` · POST `/{id}/{action}` | cms.manage |
| GET · POST | `/api/v1/staff/cms/showcase` · GET/PUT `/{id}` · POST `/{id}/{action}` (submit, publish, unpublish, archive) | cms.manage (publish/archive: cms.publish) |
| GET · POST | `/api/v1/staff/content/articles` · GET/PUT `/{id}` · POST `/{id}/status` | cms.manage |
| GET · POST | `/api/v1/staff/content/testimonials` · POST `/{id}/status` | cms.manage |
| GET · PUT | `/api/v1/staff/content/locations` · `/{citySlug}` | cms.manage |
| GET · PUT · DELETE | `/api/v1/staff/content/featured` · `/{propertyId}` | property.publish |
| GET | `/api/v1/staff/content/company` | settings.manage |
| PUT | `/api/v1/staff/content/company/settings/{key}` · `/offices/{id}` | settings.manage |

## 3. Customer account (internal headers; what the website's BFF calls)

| Method | Path | Notes |
|---|---|---|
| POST | `/internal/v1/customer-auth/google` | `{credential, language}` → `{sessionToken, expiresAt, newAccount, customer}` (mock credential locally) |
| POST | `/internal/v1/customer-auth/logout` | session header |
| GET | `/internal/v1/customer/me` | profile |
| GET | `/internal/v1/customer/activity` | the customer's own enquiries and site visits |
| GET · PUT · DELETE | `/internal/v1/customer/favourites` · `/{propertyId}` | saved properties |
| POST | `/internal/v1/customer/requests` | signed-in enquiry / callback / site-visit request |
| POST | `/internal/v1/customer/whatsapp/otp` · `/verify` | WhatsApp OTP (mock sender locally) |
| GET | `/internal/v1/dev/mock-whatsapp/latest` | **local only**: the last mock OTP message (to complete verification in tests) |

## 4. Staff sign-in for the website (internal; normally driven by the browser)

`POST /internal/v1/staff-auth/start` · `/complete` · `/logout`, `GET /internal/v1/staff/me` — the BFF's Authorization
Code + PKCE flow against Keycloak; test it through http://localhost:3000/en/staff/login rather than by hand.

## Notes
- Requests that change data create real rows in the **local** database (leads, customers, submissions). Use
  `@example.test` e-mails and test phone numbers.
- Rate limit: >10 public enquiries per hour from one IP returns 429 (`rate_limited`).
- Errors use RFC 7807 problem JSON with a stable `code` (e.g. `validation_failed`, `property_unavailable`).
