# FINAL_VIDEO_AUDIT.md — audit of the 2026-11-09 recording against the review and the code

Inputs inspected (read-only, 2026-11-09):

- Screen recording `C:\Users\Dell\Videos\Screen Recordings\Screen Recording 2026-11-09 215639.mp4` (104 s,
  1920×1140, 30 frames extracted and reviewed).
- Four screenshots `C:\Users\Dell\Pictures\Screenshots\Screenshot 2026-11-09 2052*–2053*.png`. They show an
  **older build** (illustrated hero, before the photographic hero), so they confirm the earlier state only.
- docs/WEBSITE_UI_UX_REVIEW.md, docs/COMPETITOR_UI_UX_ANALYSIS.md, and the frontend (`apps/web/src`) and API
  (`services/api/src/main`) source.
- teamamanchawla.com, studied earlier in COMPETITOR_UI_UX_ANALYSIS §1. Its structure and ideas were used; no
  code, text or images were copied.

Repository state at audit time:

- Branch `main`; HEAD `7f8f9e2` equals `origin/main`.
- 68 uncommitted paths (the Phases A–D work), preserved as they are.

## 1. What the recording shows

| # | Time | Screen | Observation | Severity |
|---|---|---|---|---|
| 1 | 0–10 s | Home: live figures, categories | "8 listings available now / 3 cities" are counts of **[SAMPLE]** listings shown as live business figures | High (authenticity) |
| 2 | 10–20 s | Residential listing | 5 cards, all illustrations; the same tower illustration repeats on unrelated listings | High |
| 3 | 20–30 s | Property detail | "[SAMPLE] Furnished 2 BHK…" reads like a real listing apart from the prefix; full-width illustration | High |
| 4 | 30–40 s | Home hero → categories → **Projects** | New launches sit **below** categories, roughly 2 screens down; the brief wants them directly under the search | High (owner priority) |
| 5 | 40–50 s | Project detail "[SAMPLE] Gomti Greens Residences" | illustration, prices and possession of a synthetic project shown like real ones | High |
| 6 | 50–60 s | Projects list with "Ongoing" chip | works; a single synthetic card | Medium |
| 7 | 60–70 s | Featured, About, How we work, Channel partner | fine; stock photos labelled "Representative image" | — |
| 8 | 70–80 s | Channel-partner form, home enquiry form | forms present and labelled | — |
| 9 | 80–90 s | Account sign-in card | mock Google text visible ("Local development…") as intended locally | Low |
| 10 | 90–100 s | Insights | **"E2E guide 144223", "E2E guide 902222"** (left by automated tests) beside a [SAMPLE] article | High |
| 11 | all | Footer | no social icons, no phone/email/address ("will appear once confirmed") | High (owner priority) |

## 2. Report claims checked against the source

| Claim in WEBSITE_UI_UX_REVIEW.md | Source check | Verdict |
|---|---|---|
| Sorting newest/price/featured, director chooses featured | `PublicPropertyController` sorts; `StaffContentController /featured` | True |
| Project status filter, developer name | `PublicProjectController` `status`, `developer_name` | True |
| "Photo gallery and floor plans when media exist" | `Gallery.tsx` + `images`/`floorPlans` in the API, **but nothing can create `property_media`/`project_media`**: there is no upload or media API, and the public media base URL is empty | **True in code, unreachable in practice** |
| City pages, favourites, account tracking | `locations/[city]`, `CustomerActivityController` | True |
| Owner submission → review → decision | `OwnerSubmissionController` | True; the conversion to a listing does not exist (as documented) |
| Insights, testimonials, content CRM | `PublicContentController`, `StaffContentController`, staff pages | True |
| "Listing preparation stays a manual CRM step" | **There is no CRM screen or API to create, edit, review or publish a property or project at all.** Listings and projects exist only through SQL seeds | **Gap the report does not state clearly** |
| Synthetic data "separated" | seed `db/seed-local` loads only in `local`/`test` profiles (`application.yml` uses `db/migration` only) | Partly: nothing at runtime stops synthetic rows from becoming public, there is no row marker, and `infra/local/manual-test-data.sql` can run against any database |
| E2E content | `site-journeys.spec.ts` publishes an article and never archives it | **Leaks into local public Insights** (seen at 90 s) |
| Social links | settings keys `social.*` are accepted by the API; the footer renders none | **Not displayed** |
| Homepage order | `(site)/page.tsx`: hero → figures → categories → projects → featured → … | **Differs from the required order** |

## 3. Root causes

1. There is no marker for synthetic records, so public queries cannot exclude them, and the local and production
   rules are the same SQL.
2. There is no property/project management in the CRM, so real listings, real photographs and conversion of owner
   submissions all have nowhere to go.
3. There is no media pipeline: no storage abstraction, no scanning, and no public media store.
4. The CMS covers only Insights, testimonials, featured listings, city intros and company facts. It has no hero,
   tiles, section order, SEO, associations or careers.
5. The footer and contact areas only render verified facts. Nothing is verified yet, so they are empty. This is
   correct, but no social link rendering exists either.

The plan to close these is in WEBSITE_COMPLETION_PLAN.md.

## 4. Re-check 2026-11-12 (brief re-issued; nothing rebuilt)

Verified against the running local stack (branch `website-completion`, PR #1, commits ba9071b, 644655a, 33fe153):

| Video finding | Status now | Evidence |
|---|---|---|
| Sample listings/projects shown as real; figures from samples | Fixed: samples hidden outside local/test; red "Sample data" badge locally; figures strip removed | ProductionVisibilityIT; test-data report |
| "E2E guide" articles public | Fixed: 0 public `e2e-` articles (17 archived) | public articles API; cleanup script |
| New launches below categories | Fixed: first section under hero + search | homepage HTML order |
| Repeated illustrations | Fixed: approved photos only; sample records carry licensed photos labelled "Representative image" (owner decision 2026-11-12) | V17; gallery/cards |
| Footer without social/contacts | Partly: verified e-mail and phone now shown; **no social accounts supplied**, so no icons | company API |

Open item found today: the local database keeps 18 unpublished listings and 9 archived projects created by the
end-to-end tests (not public; visible in the CRM lists). Not deleted (local data, kept for inspection).
