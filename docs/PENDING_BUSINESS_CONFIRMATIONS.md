# PENDING_BUSINESS_CONFIRMATIONS.md

Nothing below is guessed. Until confirmed, the platform shows the item as unverified or hides it. Owner of all items: the Director unless noted (director-name confirmation pending, CONTENT_READINESS_CHECKLIST). Source of truth for confirmed facts: CONTENT_READINESS_CHECKLIST.md.

| # | Item | Why it matters | Current handling |
|---|---|---|---|
| 1 | ~~Final logo choice~~ **Resolved 2026-11-08: green-and-gold UAI logo is final.** Still open: vector master (SVG/AI/PDF) and a reversed version for dark backgrounds | Print/large formats; logo directly on navy | Website uses PNG cut-outs from the official sheet on light surfaces (CONTENT_AND_ASSET_REGISTER) |
| 2 | Registered legal name, CIN, GST, PAN | Footer, contracts, invoices | `site_settings.company.cin` NULL; legal name `verified=false` |
| 3 | Full addresses + PIN for Noida (registered), Lucknow, Prayagraj; map pins | Contact page, schema.org | `company_offices.full_address` NULL; cities only |
| 4 | RERA applicability and number(s) | Legal claim; never shown without evidence | Not displayed; `rera_verified_at` required by schema |
| 5 | ~~Business email~~ **Resolved 2026-11-12: `info@anantinfrarealty.com` verified** (owner confirmed) | Enquiry notifications | Stored verified; shown on the site |
| 6 | Phone **verified 2026-11-12: +91 83183 77108** (displayed "+91 83183 77108", `tel:+918318377108`). Still open: WhatsApp Business number and account | WhatsApp is disabled until an approved test provider exists | `features.whatsapp-automation=false`; no WhatsApp link until a number is verified |
| 7 | Real property inventory, photos, prices, ownership proofs | No fake listings allowed | Synthetic `[SAMPLE]` data, local/test only. Approved interim: illustrative showcase (type B, labelled, director-approved) |
| 8 | Hindi copy review by a native speaker | Quality/trust | All Hindi strings are DRAFT; `review_status='draft'` |
| 9 | Privacy notice, terms, consent wording, retention periods | DPDP Act obligations; enquiry consent | Placeholder `privacy-notice-DRAFT-0` |
| 10 | Deal workflow (stages, who approves, documents) | Deal module is seeded inactive | `deal_stages.is_active=false` |
| 11 | Payment use cases (site-visit fee? booking token?) and gateway (Razorpay vs Cashfree) | Scope, compliance, fees | Sandbox only; no live payments |
| 12 | Monthly AWS budget; availability target (one vs two NAT) | Cost and resilience decisions | Defaults in ARCHITECTURE §7 |
| 13 | Lead assignment policy beyond "property owner" (round-robin? by city?) | Fairness, first-response KPI | Property owner only; others unassigned |
| 14 | Lead SLA targets (first response time) | KPI thresholds | Reported, not alerted |
| 15 | Director MFA method (TOTP/SMS) | Staging with Cognito | Enforced by the API since Slice 3 (local: Keycloak TOTP); staging method still to confirm |
| 16 | Domain/DNS ownership and cutover plan for the existing WordPress site | No DNS change without approval | Untouched |
| 17 | Testimonials/reviews: real, with permission only | No fabricated reviews | `reviews` table empty; moderation required |
| 18 | Director portrait file and permission to publish | Mock-up shows one only inside an image | Not used |
| 19 | Google Cloud project + OAuth consent screen + web client id/secret (owner: company account), authorised redirect `https://<domain>/_bff/auth/google/callback` | Real "Continue with Google" | Mock adapter only; `mode=google` code path never run |
| 20 | WhatsApp provider (Meta Cloud API directly or a BSP), business verification, approved **authentication** template (en/hi), sender number | Real WhatsApp OTP | Mock sender only; no provider adapter written |
| 21 | Privacy notice text covering Google sign-in data, WhatsApp number, marketing consent wording, retention of OTP/session records | DPDP Act | Placeholder `privacy-notice-DRAFT-0` |
| 22 | Official Instagram, Facebook, LinkedIn, YouTube, X profile URLs | Footer/contact icons | Hidden until supplied and marked verified |
| 23 | Office addresses with PIN, working hours, directions links | Contact page, footer | Not shown |
| 24 | Partner associations: confirmation and logo permission | Associations section | Hidden (none published) |
| 25 | Original articles and approved videos | Insights / video tours | None public (local samples only) |
| 26 | Production showcase wording and images (director approval) | Homepage "Explore property styles" | Local demo items only (`is_sample`) |
