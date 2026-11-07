# CRM_SPECIFICATION.md

One CRM inside the same backend and database as the website and the future mobile app. No duplicate customer, lead or visit tables.

## 1. Entities and relationships
`customers` 1—N `leads` · `leads` 1—N `site_visits` · `leads` 1—N `deals` (one *open* deal per lead+property) · `customers` 1—N `payments` · `customers` 1—N `customer_consents` (append-only) · every interaction → `lead_activities` (single timeline). Schema: DATABASE_DESIGN.md.

## 2. Lead pipeline (configurable stages; codes stable)
`new → assigned → contacted → qualified → site_visit_scheduled → site_visit_completed → negotiation → booking_in_progress → won`; any open stage → `lost` (reason mandatory; `other` needs a note); early stages → `invalid`; `lost → contacted` and `invalid → new` are reopen transitions requiring `lead.reopen`. `won` can only be set when the linked deal is `completed`.

## 3. Deal lifecycle (separate; seeded inactive pending business approval)
`deal_created → qualification_complete → negotiation → booking_pending → payment_pending → booked → documentation → completed`; `cancelled` from any open stage with reason. Negotiated price and payments need `deal.financial.read`.

## 4. Roles (see V8 seed)
Director (everything, MFA mandatory in staging/prod) · Employee (own leads/customers/visits/deals, own tasks) · Listing reviewer · Content manager · Marketing manager (no PII by default) · System admin (no automatic customer-data access).

## 5. Rules enforced
- Record-level access in SQL: employee queries add `assigned_user_id = me`; foreign records return 404.
- Public enquiry creates customer (reuse by phone), consent, lead, assignment (property owner), stage history, timeline entry, audit row and outbox event in one transaction; idempotent via `Idempotency-Key`.
- Shared phone numbers/emails are allowed; potential duplicates go to `customer_duplicate_candidates`; merges keep history.
- Communication logs separate *provider-confirmed* from *employee-recorded*; a `wa.me` click is never "delivered".
- Priority = explainable rules (`priority_rules`), no opaque scoring.

## 6. KPI definitions (director dashboard)
| KPI | Formula |
|---|---|
| New leads (7 d) | `count(leads where created_at >= now()-7d)` |
| Unassigned | `count(leads where assigned_user_id is null and outcome='open')` |
| First response time | `avg(first_contacted_at - created_at)` over contacted leads (`v_lead_first_response`) |
| Stage funnel | `count(leads) per pipeline stage` (`v_leads_by_stage`) |
| Visit conversion | `leads with completed visit / leads qualified` |
| Win rate | `won / (won + lost)` in period |
| Lost-reason mix | `count by lost_reason_code` |
| Source quality | `won / total` per `lead_sources` |
Only the first four are implemented (`/api/v1/director/overview`, tested PASS); the rest are specified, NOT IMPLEMENTED.

## 7. Customer accounts (approved 2026-11-07)
- **Signup/login:** "Continue with Google" only. On first login we store the Google account id (`sub`), name, Gmail, registration date and last login (`customer_identities`) and create the customer profile automatically. Later logins update `last_login_at` and never create a second profile.
- **WhatsApp:** the customer enters a WhatsApp number and verifies it with a one-time code sent through an approved WhatsApp provider. A verified number is required before signed-in requests. Shared numbers are allowed but flagged as duplicate candidates.
- **Registered ≠ lead:** a registered customer appears in the CRM customer list even with no enquiry (`registered=true`, `openLeads=0`). Directors and anyone with `customer.read_all` see them. Employees see a customer only once one of the customer's leads is assigned to them.
- **One lead per request:** each enquiry, callback request or site-visit request creates a new lead (source `website_account`). A site visit stores the preferred date in `next_action_at`; scheduling a `site_visits` row is a staff action (not built yet).
- **Consent:** enquiry consent (`service_contact`, mandatory) and marketing consent (`marketing_whatsapp`, optional yes/no) are separate, append-only rows with the notice version. Staff see the latest state per purpose.
- **Sales actions:** authorised staff get phone and WhatsApp number plus `tel:` and `wa.me` links, log calls/WhatsApp contacts (`communication_logs`, `employee_recorded`), and create follow-ups (`crm_tasks`, which also set the lead's next action).
- **Endpoints:** `GET /api/v1/staff/customers`, `GET /api/v1/staff/customers/{id}`, `POST …/{id}/communications`, `POST …/{id}/follow-ups`; BFF-only `/internal/v1/customer-auth/*`, `/internal/v1/customer/*` (OpenAPI 0.2.0).

## 8. Implementation status
| Capability | Status |
|---|---|
| Schema for all of the above (V4–V9) | Applied locally and in Testcontainers: PASS |
| Public enquiry → lead (idempotent, consent, optional marketing consent) | PASS |
| Staff lead list/detail with isolation | PASS |
| Director overview | PASS |
| Customer Google signup (mock), no duplicates | PASS (real Google NOT RUN) |
| WhatsApp OTP verification (mock) | PASS (real provider BLOCKED) |
| Signed-in enquiry/callback/site-visit → separate leads | PASS |
| CRM customer list/detail, contact actions, communication log, follow-ups (API) | PASS |
| Staff/director web UI (Leads, Customers, My follow-ups, Director overview; en/hi) | PASS locally (Playwright 16 staff tests), uncommitted |
| Stage change API, notes, visits scheduling, deals, segments, campaigns, merges | NOT IMPLEMENTED (schema only) |
| Notification/outbox relay, WhatsApp/email notifications | NOT IMPLEMENTED |
