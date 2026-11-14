# CONTENT_READINESS_CHECKLIST.md — what the business must supply before launch (2026-11-10)

Nothing below can be invented by the developers. Each item has a place in the CRM where it is entered and approved;
until then the website shows an honest pending state or hides the section.

## 1. Company details (CRM → Website content → Company facts; mark "Verified")

| Item | Status |
|---|---|
| Public phone number (+91…) | **Verified 2026-11-14**: +91 91941 19150 (owner confirmed; replaces +91 83183 77108) |
| WhatsApp Business number | Missing |
| Active public e-mail | **Verified 2026-11-12**: info@anantinfrarealty.com (owner confirmed) |
| Registered office: full address, PIN, hours, Google Maps / OSM directions link | Missing |
| Other offices (Noida, Lucknow, Prayagraj) with the same details | Missing |
| Working hours | Missing |
| Legal name, CIN, RERA registration (company) | Missing (PENDING_BUSINESS_CONFIRMATIONS) |
| Official Instagram, Facebook, LinkedIn, YouTube, X profile URLs | Missing — only real accounts; unconfigured ones stay hidden |
| Logo variants: reversed/white version for dark backgrounds, vector master | Missing (current files cut from the official sheet) |

## 2. Listings and projects (CRM → Listings / Projects)

- Real listings with owner authority, prices, areas and **property-specific photographs** (with photographer/credit).
- New-launch projects: developer agreement (to mark the developer verified), approved price list, documented
  possession date, RERA registration verified on the RERA portal, official renders/photographs with permission.
- Approximate map position of each locality (centre point from a public map).

## 3. Website content (CRM → Website content)

- Approved homepage hero text (optional; defaults exist) and any hero/category photographs with licence.
- About text, vision/mission confirmation; Insights articles and videos (real YouTube ids).
- Testimonials: customer text, display name and written permission (rating only if the customer gave one).
- Associations: confirmed relationships and logo-display permission.
- Careers: openings (if any).
- Hindi review of all draft Hindi wording (native speaker).
- SEO titles/descriptions per page (optional overrides).

## 4. Integrations (owner approval needed; nothing enabled yet)

**Google sign-in (customers):** company Google Cloud project; OAuth consent screen (app name, logo, privacy policy
URL, support e-mail); a development OAuth client (web) with authorised origins/redirects for staging; list of
company-approved tester Gmail accounts; then production client after review. Secrets go to the secrets manager,
never into source code or chat.

**WhatsApp OTP:** Meta Business account verification; WhatsApp Business Platform (Cloud API) phone number;
approved *authentication* message template (en/hi); permanent access token and phone-number id (secrets manager);
webhook verify token; updated privacy notice covering WhatsApp messaging.

**Privacy:** final privacy notice and terms reviewed by the business/legal adviser (current pages are drafts).

## 5. Staging blockers (must be done before any public launch)

1. Malware scanning service in staging (ClamAV `clamd` or S3 scanning pipeline) configured and tested with the
   EICAR file; `MALWARE_SCANNER=clamd`. Without it uploads stay "not scanned" and cannot be approved.
2. Private S3 bucket for originals/owner uploads and a public-media bucket behind the CDN; `MEDIA_PUBLIC_URL` and
   `unavora.media.public-base-url` set; local disk adapters replaced.
3. Approved business content from sections 1–3.
4. Privacy notice/terms approved; Google and WhatsApp set up as in section 4 (or kept disabled).
5. robots.txt switched to allow indexing only on the production domain.

## Status 2026-11-12

Still needed from the business: WhatsApp Business number, office addresses/PIN/hours/directions, working hours,
official social-media URLs (Instagram, Facebook, LinkedIn, YouTube, X), legal name/CIN/RERA confirmation, director
name confirmation, real listings and projects with photographs. Sample records currently use labelled representative
photos (Unsplash licence) until real photographs are supplied.

## 6. Replacing illustrative content with genuine assets (no code changes needed)

| Content | Where it is replaced | What is needed from the company |
|---|---|---|
| Showcase cards ("Explore property styles") | CRM → Website content → Showcase: edit text, replace the image, link a published real record, or archive | Approved wording (en/hi); own or licensed photographs |
| Property photographs | CRM → Listings → photos (upload → scan → approve; replace representative ones) | Photographs of each real property, photographer/credit |
| Project photographs / renders | CRM → Projects → photos | Official photos or renders with permission |
| Verified new launches | CRM → Projects (create → review → publish); the "Discover upcoming opportunities" panel disappears automatically | Developer agreement, project facts |
| Prices | Listing/project price + "approved" flag | Approved price list or "price on request" |
| Availability | Listing availability (available / under offer / sold) | Owner confirmation |
| Project details (possession, specifications) | Project form; possession shown only when documented | Documents |
| RERA details | Project/company RERA fields, shown only when verified | Registration numbers verified on the RERA portal |
| Office addresses, hours, map links | Company facts → offices | Full address, PIN, hours, directions link |
| Social links | Company facts → social.* (hidden until set and verified) | Official profile URLs |
| WhatsApp number | Company facts → whatsapp | WhatsApp Business number |
| Leadership content | About page text (CMS) | Director names, photos, approved bios |
| Testimonials | CRM → Testimonials (needs recorded consent) | Real customer text and written permission |
| Articles / videos | CRM → Insights | Original articles, approved YouTube links |
| Partner associations | CRM → Associations (relationship + logo permission) | Confirmation letters / permission |
| Legal details | Terms, privacy, company legal name/CIN | Lawyer-reviewed text, registration documents |
| Hero / category images | CMS → Home hero, Category tiles, Image library | Brand photography (optional; licensed stock is labelled) |

Local demo showcase items come from `infra/local/showcase/load_showcase_demo.py` (local only; generic wording, Unsplash
images); production showcase content is written and approved by the director in the CMS.

## 7. New brand, domain and business email (owner, 2026-11-13)

Confirmed by the owner (recorded, not yet implemented; plan in MASTER_PLAN_2026-11-13.md and DOMAIN_MIGRATION_PLAN.md):

| Item | Status |
|---|---|
| Public brand: UNAVORA ANANT REAL ESTATE, new horizontal green-and-gold UA logo, tagline "INVEST IN A BETTER LIVING" | **Approved by owner**; website still shows the UAI logo until the brand phase is implemented and approved. Raster PNG 1200 × 411 only |
| Logo vector master (SVG/AI/PDF) and reversed version for dark backgrounds | Missing — designer to supply (not fabricated) |
| Original logo file (as exported by the designer) | Requested (the chat copy may be re-encoded) |
| New domain `uainfrarealestate.com` (Hostinger) as the canonical site | **Approved by owner**; DNS not changed; cut-over needs separate approval |
| Primary business email `Rahul.Shukla@uainfrarealestate.com`, sender name "UNAVORA ANANT REAL ESTATE" | **Confirmed by owner — pending configuration**: domain mail is Hostinger Mail (MX, SPF, DKIM, DMARC `p=none` published); mailbox activation, plan/daily limit and SMTP sign-in to be confirmed by the owner in hPanel; TLS on `smtp.hostinger.com` 465/587 verified without login |
| `info@anantinfrarealty.com` | Verified 2026-11-12 (unchanged); stays operational during the migration (old host) |
| Phone +91 91941 19150 | **Verified 2026-11-14** (owner; replaces +91 83183 77108, migration V21) |
| Exact registered legal name for legal pages | To confirm (kept separate from the public brand) |
