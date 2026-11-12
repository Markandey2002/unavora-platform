# WEBSITE_FUNCTIONALITY_MATRIX.md — every visible feature and how it is verified (2026-11-10)

Status key: **Works** = implemented and covered by an automated test; **Pending input** = built, shows an honest
empty/pending state until the business supplies real content; **Not built** = documented gap.

## Customer journeys (brief §9)

| Journey | Steps | Status | Evidence |
|---|---|---|---|
| A. New launch | Home → New Launches section → project detail → enquiry → CRM lead | Works | `completion-journeys.spec.ts` A; `NewLaunchesIT` |
| B. Property | Search → filter → listing → detail (approved photo gallery, full-size viewer) → enquiry; favourite | Works | journey B; `site.spec.ts` hero search; `site-journeys.spec.ts` favourites |
| C. Property owner | List your property → upload → private CRM submission → employee review → director decision → Create Draft Listing | Works | director journey; `ListingWorkflowIT` (one draft per submission, only clean photos) |
| D. Channel partner | Application → reference → lead visible in CRM | Works | `site.spec.ts`; director journey (lead in CRM list) |
| E. Content | Director creates Insight → preview (draft) → publish → public page → share links → archive | Works | director journey; `site-journeys.spec.ts` |
| F. Customer account | Mock Google sign-in → save property → enquiries → site visits → sign out | Works (mock sign-in only) | journey F |
| G. Contact | Validation (consent required) → CRM enquiry → reference | Works | journey G; `site.spec.ts` contact |

## Public website

| Feature | Status | Notes |
|---|---|---|
| Homepage order (hero → search → New Launches → Featured → Categories → Locations → Why → About → List property → Partners → Insights → Videos → Testimonials → Associations → Enquiry → Footer) | Works | Director can reorder/hide sections (CMS); enquiry cannot be hidden |
| New Launches section + page (search by name/verified developer/location, category, type, city, status, newest first, 12/page, empty state) | Works / Pending input | No real project published yet; sample project shown locally only, badged |
| Project facts gated: developer (verified), price (approved), possession (documented), RERA (verified), photos (approved) | Works | `NewLaunchesIT`, `PublicSiteIT`, `PublicSiteContentIT` |
| Listing & project galleries (primary, order, captions, kind labels, full-size viewer, keyboard, swipe) | Works | journey B; real photos pending |
| Honest "photographs awaiting approval" placeholder (no reused illustrations) | Works | `site.spec.ts` detail |
| Sample-data protection (badge locally; never public outside local/test; startup guard) | Works | `ProductionVisibilityIT` |
| Maps: click-to-load OSM; exact only when approved, else approximate area, else none | Works / Pending input | `ListingWorkflowIT` map test; locality positions not entered yet |
| Insights: featured, categories, search, covers, author/date, related, share, JSON-LD | Works / Pending input | No real articles yet |
| Videos: click-to-load, server-proxied thumbnail, description, no autoplay | Works / Pending input | No approved video ids yet |
| Testimonials: consent + moderation, rating only if given | Works / Pending input | none collected |
| Associations: confirmed relationship + logo permission | Works / Pending input | none confirmed |
| Careers page (only when published) | Works / Pending input | not published |
| Footer: logo, tagline, nav, categories, projects, insights, verified phone/email/address/hours/directions, official social icons, privacy, terms, dynamic year; phone accordion | Works / Pending input | no verified contacts or accounts yet → honest pending text |
| Language switch on detail pages (correct per-language slug; fallback) | Works | fixed this round (was 404) |
| SEO: canonical, hreflang per real slug, OG, sitemap (published only), robots, JSON-LD, CMS overrides | Works | seo-check; sitemap no longer caches a partial list |

## CRM / Director

| Feature | Permission | Status |
|---|---|---|
| Listings: create/edit draft (en/hi), submit, review approve/reject with reason, publish/unpublish/sold, history | property.create/submit/review/publish | Works |
| Projects: create/edit, approval switches, units, publish/unpublish/archive | property.publish | Works |
| Photos (listings, projects, site library): upload → scan → alt/caption/credit/licence → approve → public copy; cover; delete | property.* / cms.* | Works (mock scanner locally) |
| Owner submissions: review, decision, Create Draft Listing | lead.* / property.publish | Works |
| Website CMS: hero, category tiles, section order, SEO overrides, careers — draft → submit → publish/unpublish, preview, history | cms.manage / cms.publish | Works |
| Image library, associations | cms.manage / cms.publish | Works |
| Company facts: phone, WhatsApp, email, hours, offices (address, hours, directions), social links (official-profile check) | settings.manage | Works / Pending input |
| Locality map positions | property.publish | Works / Pending input |

## Not built (documented)

Real Google/WhatsApp providers (mock only); S3/CDN storage and a real ClamAV service (adapters exist: `clamd`
client tested against a fake daemon); company logo variants managed in the CMS (files are fixed assets);
partner portal; payments; real-user (field) Core Web Vitals.
