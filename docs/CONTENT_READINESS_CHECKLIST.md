# CONTENT_READINESS_CHECKLIST.md — what the business must supply before launch (2026-11-10)

Nothing below can be invented by the developers. Each item has a place in the CRM where it is entered and approved;
until then the website shows an honest pending state or hides the section.

## 1. Company details (CRM → Website content → Company facts; mark "Verified")

| Item | Status |
|---|---|
| Public phone number (+91…) | Missing |
| WhatsApp Business number | Missing |
| Active public e-mail | Missing |
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
