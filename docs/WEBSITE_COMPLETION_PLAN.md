# WEBSITE_COMPLETION_PLAN.md — closing the gaps found in FINAL_VIDEO_AUDIT.md

Scope: owner brief "UNAVORA final website completion" (2026-11-09).

Rules for this plan:

- Build on the Phases A–D work; nothing that already works is rebuilt.
- No new customer or lead tables. The CRM stays the single source of truth.
- No AWS resources, no DNS changes, no live-site changes, no real Google or WhatsApp. Nothing is committed without
  owner approval.

## Order of work (owner priority first)

| Step | Work | Reuses | Adds |
|---|---|---|---|
| 1 | **Synthetic-data protection** | seed-local profile split | `is_sample` flag on properties, projects, articles and reviews; public queries exclude samples unless `unavora.public.include-sample-content=true` (local/test only); startup guard refuses non-local profiles that enable samples, load `seed-local`, or contain sample rows; ITs that fail if samples become public; e2e tests archive what they publish; `infra/local/test-data-report.sql` (read-only counts) and `infra/local/cleanup-test-data.sql` (local-only guard, unpublishes or archives marked test rows, deletes nothing) |
| 2 | **New launches first** | `projects`, `PublicProjectController`, `/projects` page | homepage in the required order (§3 of the brief), the New Launches section directly under hero + search (mobile swipe carousel), project category/primary type, developer verified flag, price/possession shown only when marked approved, search by name/developer/location, type filter, newest-launch sort, pagination, elegant empty state |
| 3 | **Image authenticity + gallery** | `Gallery.tsx`, `property_media`, `project_media` | honest "Photographs awaiting approval" placeholder instead of the repeated illustrations; media metadata (kind: actual photo / render / representative / floor plan, caption, credit, licence, approval); gallery with primary image, order, captions, full-size accessible viewer, swipe. **→ show the homepage in Chrome** |
| 4 | **Media pipeline** | `PrivateFileStore` | provider-neutral `PrivateObjectStore` / `PublicMediaStore` / `MalwareScanner` ports. Local adapters: filesystem stores; `clamd` scanner (INSTREAM protocol); `mock` scanner allowed only in local/test (detects the EICAR test string). Quarantine → clean/infected/failed; only clean **and** staff-approved files are copied to the public store (random key). Owner uploads are never made public automatically. S3 + CDN design documented, not deployed |
| 5 | **Property & project management in the CRM** (missing today) | existing statuses/permissions (`property.create/submit/review/publish`), audit log | staff list/create/edit drafts (en/hi), submit → review (approve/reject with reason) → publish/unpublish/sold; project create/edit/publish with units; listing photo upload and approval |
| 6 | **Create Draft Listing** | owner submissions | director action on an approved submission: one draft property per submission (unique link), copies approved data and only approved clean photos (still unpublished), keeps the submission reference, then follows step 5 review |
| 7 | **Social links + company details + footer** | `site_settings`, `company_offices`, Company facts screen | Instagram, Facebook, LinkedIn, YouTube, WhatsApp, X and other `social.*` keys; working hours and directions links; icons shown only when configured and verified; footer redesign (mobile accordion) and contact page details |
| 8 | **Director CMS additions** | `cms_pages`, `banners`, audit log | draft → submit for approval → publish/unpublish with separate draft and live content, staff-only preview, history. Covers: hero text and image, category tiles, homepage section order, SEO title/description overrides, associations (with logo-permission record), careers page and openings. Site image library through the media pipeline |
| 9 | **Maps, Insights, videos, testimonials** | location fields, content CMS | click-to-load OpenStreetMap embed: exact pin only when coordinates are approved and `hide_exact_location = false`, otherwise an approximate locality area or no map; featured Insight; cover images; video thumbnails proxied server-side (no Google request before a click); testimonial rating optional (never invented) |
| 10 | **QA** | existing scripts | standalone server (`.next/standalone/server.js`), Lighthouse mobile/desktop, axe-core, scripted keyboard checks, accessibility-tree spot checks (a real screen reader is not available to the agent; marked as an owner/manual check), broken-link/image crawl, viewports 320→1920, journeys A–G as Playwright tests |
| 11 | **Reports** | — | WEBSITE_FUNCTIONALITY_MATRIX, CONTENT_READINESS_CHECKLIST, updated WEBSITE_UI_UX_REVIEW, TEST_RESULTS, PHASE_STATUS, DECISION_LOG, SECURITY_ARCHITECTURE, OpenAPI |

## Permissions (existing roles, no new role)

| Action | Permission | Roles today |
|---|---|---|
| Create/edit draft listing, submit | `property.create`, `property.submit` | employee, director |
| Approve/reject listing | `property.review` | listing_reviewer, director |
| Publish/unpublish/sold, projects, media approval, Create Draft Listing | `property.publish` | director |
| Edit website content, submit for approval | `cms.manage` | content_manager, marketing_manager, director |
| Publish website content | `cms.publish` (**new permission**, director only) | director |
| Company facts and social links | `settings.manage` | director |

## Remains blocked on the business (cannot be built or invented)

- Real photographs, project details, prices and possession dates.
- Verified phone, WhatsApp, email and addresses; official social accounts.
- Approved copy, testimonials with consent, and association logos with permission.
- Google Cloud OAuth client and test accounts; Meta/WhatsApp Business setup.
- A malware-scanning service in staging; AWS buckets and CDN.

See CONTENT_READINESS_CHECKLIST.md.

## Definition of done for this round

- Every visible control works, shows an honest pending state, or is hidden.
- Samples and test content can never reach a production public page (automated tests).
- All existing tests plus the new ones pass.
- Reports state clearly that the site is **not** production-ready until the blocked items are resolved.
