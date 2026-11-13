# SHOWCASE_GAP_REPORT.md — "Final website design, showcase content and platform plan" (2026-11-12)

Inspected before any change: branch `website-completion` (PR #1, HEAD `33fe153`), uncommitted phone-format/footer
fixes and dated doc updates (kept), migrations V1–V17 plus local seeds V1000/V1001, the public site pages, the Director
CMS (`SiteCmsController`, `SiteBlocks`), the enquiry → lead path (`EnquiryService`, `LeadWriter`) and the staff CMS screens.

## 1. The three content types — where each stands

| Type | Today | Gap |
|---|---|---|
| **A. Actual inventory** (properties, projects) | Full CRM workflow: draft → review → publish; developer-verified flag; price/possession shown only when approved; RERA only when verified; media pipeline (scan → approve → public). Real search returns published, non-sample rows only. | None structural. No real inventory has been entered yet (business input). |
| **B. Illustrative showcase** | **Does not exist as its own type.** The nearest pieces: `home.tiles` (four category tiles, no CTA/disclosure/link) and sample listings with "Representative image" photos, which are *local-only* and hidden in production. | New content type needed (§3). |
| **C. Local synthetic test data** | `is_sample` on properties/projects/articles/reviews; `PublicVisibility` + `SyntheticDataGuard` (refuses samples outside local/test); seeds only in `seed-local`; e2e tests archive what they publish; read-only report + local-only cleanup scripts; MANUAL_UI_TESTING guide. | None. Local leftovers (18 unpublished e2e listings, 9 archived e2e projects) kept — not deleted without approval. |

## 2. Brief items already done (reused, not rebuilt)

Pages: home, about, all properties, residential, commercial, plots, new launches + project detail, property detail,
city pages, list your property, channel partner, Insights + article (videos are Insights of kind video), contact,
account (saved, enquiries, visits, profile, preferences), privacy, terms, careers. Property search: city, locality,
category, type, budget, keyword, sort, cursor pagination, reset, URL filters. Project search/filter. CMS: hero, category
tiles, section order/visibility, SEO overrides, careers, image library with source/licence/credit/alt/kind/approval,
associations (relationship + logo permission), Insights (featured, cover), testimonials (consent), featured listings,
city intros, company facts/contacts/social/offices/hours/directions — all audited, director publishes. Owner uploads:
private, type/size checks, quarantine, malware scan, review, director approval. Phone display `+91 83183 77108` /
`tel:+918318377108`; WhatsApp link digits-only. SEO: metadata en/hi, canonical, hreflang, sitemap, robots, OG,
breadcrumbs, JSON-LD (only for real records). Thin city pages are `noindex`.

## 3. Gaps to build (in stages)

| # | Gap | Plan |
|---|---|---|
| G1 | Showcase content type | `showcase_items` table (V18): category (residential, villa, commercial, office, land, project_style), en/hi title + description, CTA (enquire / register interest / browse category / link to a real record), approved library image (licence + alt required by the library), sort order, status draft → in_review → published / unpublished / archived, optional link to a **published real** property or project. **No price, area, possession, RERA, developer, address or ID columns exist**, so none can be shown. Audited. |
| G2 | Showcase on the homepage | New "Explore property styles" section with the disclosure sentence at the top and a subtle navy/gold "Illustrative example" label on every card; category chips (Residential, Villas, Commercial, Offices, Plots & Land). Never titled "Featured" or "Available now". Featured Properties shows real listings only and hides itself when there are none. |
| G3 | New launches with no real projects | Existing honest empty panel becomes the premium "Discover upcoming opportunities" panel with representative architecture imagery and Register Your Interest (general project-interest lead, no project id). |
| G4 | Showcase enquiries | `showcaseId` + preferred location on the public enquiry: new lead source `website_showcase`, `campaign = showcase:<category>`, enquiry type from the category, **no property/project id**, the showcase must be published. Real listing enquiries unchanged (real id). Consent rules unchanged (service consent required, marketing separate). New leads enter the existing "new" queue where managers assign them (no invented auto-assignment rule). |
| G5 | CMS screen for showcase items | Staff page: create, edit en/hi, pick a library image, category, CTA, desktop/mobile preview, submit, publish, replace image, link a real record, archive. No automatic conversion to a property. |
| G6 | Offices page and Video Tours page | `/offices` (real office listings; showcase fallback) and `/videos` (published video Insights, click-to-play, no autoplay). |
| G7 | Explore sections per category | Homepage Residential / Commercial / Plots / Offices rows: real listings first, showcase items of that category when inventory is short. |
| G8 | Tests and docs | ITs for G1/G4 (no price fields, not in search, lead without property id, drafts hidden), Playwright for the homepage and enquiry, viewport sweep 320–1920, updated UI review, CONTENT_READINESS replacement checklist. |

## 4. Blocked on the business (unchanged)

Real listings/projects/photos/prices, office addresses, WhatsApp number, social URLs, leadership text, testimonials
with permission, partner confirmations, legal name/CIN/RERA. See CONTENT_READINESS_CHECKLIST.md.

## 5. Order

Stage 1 (this round): G1, G2, G3, G4 + API tests → show the homepage and New Launches.
Stage 2: G5 → show showcase replacement through the CMS. Stage 3: G6, G7. Stage 4: G8 sweep and reports.
Note: the Claude-in-Chrome extension is not connected in this session, so reviews use the desktop app's browser pane
and Playwright screenshots of the same local site.

## 6. Stage 1 results (2026-11-12, local)

Built: V18 `showcase_items` + `website_showcase` lead source; `ShowcaseController` (staff CRUD/submit/publish/
unpublish/archive, audited; public `GET /api/v1/public/showcase`); enquiries accept `showcaseId`, `context=new_launches`
and `preferredLocation` (lead without property/project id, campaign recorded); staff lead page shows source/campaign/
location; homepage "Explore property styles" section (CMS section key `showcase`), "Discover upcoming opportunities"
panel with inline Register your interest, Featured Properties hidden without real listings; contact page accepts
`?showcase=<id>`; marketing consent recorded only when the question was shown. Local demo loader
`infra/local/showcase/load_showcase_demo.py`.

Tests: API `mvn verify` 103 integration tests pass (new ShowcaseIT 4); Vitest 14; tsc clean; Next.js build OK;
Playwright full suite 78 passed / 11 skipped / 1 failed once (`site.spec` sitemap check, mobile; passed on re-run;
existing test, unrelated); new `showcase.spec` 7 passed / 1 skipped in production-visibility mode.
Not done yet: CMS screen for showcase items (stage 2), /offices and /videos pages, per-category Explore rows,
viewport sweep and UI review update.
