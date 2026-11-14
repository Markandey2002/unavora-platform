# COMMUNICATION_SYSTEM_DESIGN.md — email, WhatsApp and CRM notifications (design only, 2026-11-13)

**Not implemented.** Nothing is sent to real people until the owner approves each provider and the first live test.
Local development keeps mock adapters (Mailpit for email, the existing mock WhatsApp inbox).

## 1. What already exists (reused, no duplicate tables)

| Existing | Use |
|---|---|
| `outbox_events` (written in the same transaction as the business change; `dedupe_key` unique; `pending/published/failed`, `attempts`, `next_attempt_at`, `locked_until`) | Source of every notification. Today only `lead.created` is written (`LeadWriter`, `LeadWorkflowService`) |
| `processed_events (consumer_name, event_id)` | Consumer idempotency |
| `notification_jobs (event_id, channel, recipient, template_code)` unique; channels email / whatsapp / sms / in_app | One row per message to one recipient |
| `notification_logs` | State history per job |
| `notification_preferences (user_id, event_type, channel, enabled)` | Staff alert preferences |
| `customer_consents` (append-only; purposes `service_contact`, `marketing_email`, `marketing_whatsapp`, `marketing_sms`) | Customer permission checks |
| `users` (email, `phone_e164`, roles) | Internal recipients — no invented numbers |
| `audit_logs` | Configuration changes, manual retries, campaign approvals |

## 2. Additions (one additive migration; names provisional)

- `notification_jobs.status` extended to **`queued, sending, sent, delivered, read, failed, cancelled, suppressed`**
  (`provider_accepted` → renamed meaning `sent`; existing rows mapped). "Delivered"/"read" are set **only** from provider
  delivery webhooks, never from an API "accepted" response.
- `notification_templates` (code, channel, language en/hi, category **authentication / utility / marketing**, subject,
  HTML + plain text for email, WhatsApp template name + variables, provider approval status, version, active).
- `notification_rules` (event type → channel → recipient group: customer / assigned salesperson / director /
  authorised employees by permission; enabled; quiet hours for non-urgent internal alerts).
- `communication_settings` (sender display name, From, Reply-To, enquiry recipient, provider mode per channel) —
  secrets stay in the server environment, never in the database.
- `suppression_list` (channel, address, reason: unsubscribed / bounced / complained / blocked, source, at).
- `webhook_events` (provider, provider event id unique, raw JSON, processed_at) — replay-safe webhook handling.
- `marketing_campaigns` (draft → approved by the director → scheduled → sent; audience filter; counts).

## 3. Worker (inside the existing Spring Boot jar — no extra service)

Profile `worker` (same jar, separate process or the same process on a small VPS):
1. **Relay**: `SELECT … FROM outbox_events WHERE status='pending' AND next_attempt_at <= now() FOR UPDATE SKIP LOCKED`
   → expand by `notification_rules` into `notification_jobs` (unique key prevents duplicates) → mark published.
2. **Dispatcher**: due `queued` jobs → consent/suppression check (marketing needs an explicit opt-in that matches the
   channel; transactional messages need `service_contact`) → provider adapter → `sent` + provider message id, or retry
   with exponential back-off (1 min, 5 min, 30 min, 2 h, 12 h; then `failed`).
3. **Webhooks**: WhatsApp status (`sent/delivered/read/failed`) and email bounces update jobs; signatures verified
   (Meta `X-Hub-Signature-256` with the app secret; GET verify-token handshake).
4. In-app: CRM notification bell reads `notification_jobs` of channel `in_app` for the logged-in user.

## 4. Events → recipients → channels (initial rules; editable in the Communication Centre)

| Event (outbox `event_type`) | Customer | Internal |
|---|---|---|
| `customer.registered` | Welcome (email; WhatsApp after phone verified) — utility | — |
| `customer.phone_otp` | OTP (WhatsApp **authentication** template) | — |
| `lead.created` (property / general / callback / showcase / launch interest) | Enquiry received (email + WhatsApp if verified) — utility | Assigned salesperson (in-app + WhatsApp/email); unassigned → director + authorised employees |
| `owner_submission.created` | Received confirmation — utility | Listing reviewers + director |
| `channel_partner.applied` | Received confirmation — utility | Director |
| `visit.requested` / `visit.confirmed` / `visit.rescheduled` / `visit.cancelled` | Confirmation / change — utility | Assigned salesperson |
| `visit.reminder` (scheduled job: 24 h and 2 h before) | Reminder — utility | Assigned salesperson |
| `lead.assigned` | — | New assignee |
| `followup.overdue` (scheduled daily) | — | Owner of the follow-up; daily digest to director |
| `property.published` / `project.published` | Announcement **only to opted-in customers whose preferences match** (city/category) — marketing, director-approved campaign | — |

Rules: never send internal alerts to the WhatsApp **sender** number; recipients come from CRM users (no hard-coded
numbers); customers' language preference picks en/hi; quiet hours for marketing (no sends 21:00–09:00 IST).

## 5. Email

Proposed (owner-confirmed 2026-11-13, **pending verification**): From `UNAVORA ANANT REAL ESTATE
<Rahul.Shukla@uainfrarealestate.com>`, Reply-To the same address, enquiry/business notifications to the same address,
CRM administrator/business contact. Provider: Hostinger Mail SMTP (`smtp.hostinger.com`, 465 implicit TLS or 587
STARTTLS — TLS 1.3 handshake verified, authentication not yet tested). Adapter: Spring `JavaMailSender`, TLS required,
credentials from env (`MAIL_USERNAME`, `MAIL_PASSWORD` — names provisional, never in Git), HTML + plain-text multipart,
`List-Unsubscribe` header on marketing, bounce/failure logging to `notification_logs`. Limits: 1,000 messages/day per
mailbox on Hostinger Business Starter (3,000 on higher plans) — the worker enforces a configurable daily cap and queues
the rest. SPF/DKIM/DMARC already published for the domain (DOMAIN_MIGRATION_PLAN §1). Local: Mailpit. Google Sign-In,
a Gmail inbox and application email delivery are three separate things; this design uses none of Gmail.

Recommendation for review: a role mailbox as the automated sender keeps automation independent of one person's
mailbox (shared daily limit, password changes). The confirmed address can stay as Reply-To and recipient.

## 6. WhatsApp (Meta Cloud API directly; BSP only if the owner prefers a dashboard)

Configuration (env): phone-number id, WABA id, permanent system-user token, app secret, webhook verify token. Templates
(en + hi) submitted for approval: `otp_login` (authentication, copy-code), `welcome`, `enquiry_received`,
`callback_confirmed`, `visit_confirmed`, `visit_reminder`, `visit_changed` (utility), `new_property`, `new_project`
(marketing). Opt-in recorded in `customer_consents` (`marketing_whatsapp`) with wording and timestamp; "STOP" replies
and webhook opt-outs go to `suppression_list`. Costs: see MASTER_PLAN §5 (≈ ₹0.115 authentication/utility, ≈ ₹0.863
marketing per message before GST). No real message without approval.

## 7. CRM → Settings → Communication Centre (director; `settings.manage`)

Tabs: Email settings (non-secret fields + "send test to me"), WhatsApp settings (status of the connection, template
approval states), Alert recipients, Event rules, Templates (en/hi editor + preview), Customer preferences (read-only
view of consents), Delivery log (filter by state/channel/event), Failed + Retry (audited), Campaigns (draft → director
approval → send), Suppression list (add/remove with reason, audited). Every change and manual action is written to
`audit_logs`.

## 8. Tests (to write with the implementation)
Mock adapters only: idempotent relay (same event twice → one job), retries and back-off, consent and suppression gates,
marketing preference matching, recipient resolution (assigned / unassigned / disabled user), webhook signature and
replay protection, state machine (no `delivered` without webhook), daily email cap, en/hi template selection, no OTP or
token in logs.
