# PENDING_BUSINESS_CONFIRMATIONS.md

Nothing below is guessed. Until confirmed, the platform shows the item as unverified or hides it. Owner of all items: Director (Rahul Shukla) unless noted.

| # | Item | Why it matters | Current handling |
|---|---|---|---|
| 1 | Final logo (green/gold UAI mark vs gold IA mark) and vector/PNG files | Brand consistency; only a raster sheet exists | Text wordmark placeholder |
| 2 | Registered legal name, CIN, GST, PAN | Footer, contracts, invoices | `site_settings.company.cin` NULL; legal name `verified=false` |
| 3 | Full addresses + PIN for Noida (registered), Lucknow, Prayagraj; map pins | Contact page, schema.org | `company_offices.full_address` NULL; cities only |
| 4 | RERA applicability and number(s) | Legal claim; never shown without evidence | Not displayed; `rera_verified_at` required by schema |
| 5 | Business email mailbox (`info@anantinfrarealty.com`) exists and is monitored; the older, obsolete address must not be used | Enquiry notifications | New address stored `verified=false` |
| 6 | Phone/WhatsApp number ownership, WhatsApp Business account | WhatsApp is disabled until an approved test provider exists | `features.whatsapp-automation=false` |
| 7 | Real property inventory, photos, prices, ownership proofs | No fake listings allowed | Synthetic `[SAMPLE]` data, local/test only |
| 8 | Hindi copy review by a native speaker | Quality/trust | All Hindi strings are DRAFT; `review_status='draft'` |
| 9 | Privacy notice, terms, consent wording, retention periods | DPDP Act obligations; enquiry consent | Placeholder `privacy-notice-DRAFT-0` |
| 10 | Deal workflow (stages, who approves, documents) | Deal module is seeded inactive | `deal_stages.is_active=false` |
| 11 | Payment use cases (site-visit fee? booking token?) and gateway (Razorpay vs Cashfree) | Scope, compliance, fees | Sandbox only; no live payments |
| 12 | Monthly AWS budget; availability target (one vs two NAT) | Cost and resilience decisions | Defaults in ARCHITECTURE §7 |
| 13 | Lead assignment policy beyond "property owner" (round-robin? by city?) | Fairness, first-response KPI | Property owner only; others unassigned |
| 14 | Lead SLA targets (first response time) | KPI thresholds | Reported, not alerted |
| 15 | Director MFA method (TOTP/SMS) | Staging with Cognito | Not enforced locally |
| 16 | Domain/DNS ownership and cutover plan for the existing WordPress site | No DNS change without approval | Untouched |
| 17 | Testimonials/reviews: real, with permission only | No fabricated reviews | `reviews` table empty; moderation required |
| 18 | Director portrait file and permission to publish | Mock-up shows one only inside an image | Not used |
| 19 | Google Cloud project + OAuth consent screen + web client id/secret (owner: company account), authorised redirect `https://<domain>/_bff/auth/google/callback` | Real "Continue with Google" | Mock adapter only; `mode=google` code path never run |
| 20 | WhatsApp provider (Meta Cloud API directly or a BSP), business verification, approved **authentication** template (en/hi), sender number | Real WhatsApp OTP | Mock sender only; no provider adapter written |
| 21 | Privacy notice text covering Google sign-in data, WhatsApp number, marketing consent wording, retention of OTP/session records | DPDP Act | Placeholder `privacy-notice-DRAFT-0` |
