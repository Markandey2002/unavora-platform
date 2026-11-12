# COMPETITOR_UI_UX_ANALYSIS.md

Date: 2026-11-09. Reference: https://teamamanchawla.com/ (Lucknow real-estate channel partner), inspected live in a
browser (rendered JavaScript, desktop and 375 px phone). UNAVORA state: commit `7f8f9e2` (public site redesign).

**Inputs not available:** the owner's screenshots of the current UNAVORA design, including the 443 px mobile screenshot,
are not in the workspace. Please save them under `docs/design-references/`. The 443 px findings below come from
UNAVORA's own page measured at 443 px, not from the owner's image.

Purpose: feature inspiration only. No code, text, images, logos, names or design of the reference are reused.

## 1. Reference website: what it offers

| # | Feature | How the reference does it | Fit for UNAVORA | Needs real company data |
|---|---|---|---|---|
| 1 | Homepage lead capture | Photo of the founder + three value bullets + "Rated 5.0 on Google" + inline Name/Email/Phone form in the hero | Yes (short form); founder photo only if approved; rating only if real and linked | Director photo + permission; real rating source |
| 2 | New launches | 6 project cards: name, **developer**, category, "ON REQUEST*" price, locality; "View all"; status filter | Yes, as Projects / New launches | Approved projects, developer relationships, RERA numbers |
| 3 | Category discovery | Apartments, Villas, Commercial, Plots tiles; Apartments and Villas both open the same residential filter | Yes; ours filters correctly by category/type | Photography |
| 4 | City discovery | "Popular Cities" dropdown (Varanasi, Gurugram) + many SEO landing pages (locality, BHK, villas, builder pages) of ~500 words each | Yes, but only for cities/localities with real inventory and real local content; no thin auto-generated pages | Locality write-ups |
| 5 | Owner / seller enquiry | "Get genuine buyers for your property" banner with four promises | Yes, as "List your property" -> CRM review -> director approval | Owner process, document checklist |
| 6 | News & trends | Press-mention logos linking to external articles | Only with real press coverage | Real coverage links |
| 7 | Videos & podcasts | YouTube embeds of property tours and a podcast | Yes when approved videos exist (no empty players) | Video URLs, permissions |
| 8 | Why choose us | 3 text blocks + counters (clients, properties sold, years); counters rendered **"0+"** on load | Yes, without counters unless real and maintained | Verified figures, if any |
| 9 | Reviews | Google review snippets with names + "View all Google reviews" | Yes, only genuine reviews with consent (moderated in CRM) | Reviews + consent |
| 10 | Developer associations | Grid of developer logos | Only with confirmed relationships and logo permission | Agreements, permissions |
| 11 | Careers | "Join us" form incl. resume **link** | Optional; only if the company is hiring | Decision, roles |
| 12 | Contact & enquiry | Contact page (email, phone, address, hours) + short forms on every project | Yes; ours already creates CRM leads with references | Verified contact details |
| 13 | Project detail | Description, amenities, configuration/price table, location map, developer profile, **project RERA no. + QR, agent RERA no., collection-account details**, enquiry form, brochure download, similar properties | Yes; RERA/legal block only from verified data; brochure only from approved files | RERA, approvals, brochures |
| 14 | Blog | ~600-word posts, related posts, contact CTA; no author or share links | Yes, as Insights with author, date, categories, search, share | Articles written for UNAVORA |
| 15 | Social | Facebook/Instagram/YouTube/LinkedIn rail + floating WhatsApp | Social links once verified; WhatsApp once number verified | Accounts, number |

Weaknesses observed in the reference (where UNAVORA can be better): counters show "0+" until JavaScript runs; mobile
hero overlaps the founder photo and text, with the form fading in late; listing pages show "Loading..." until
client-side fetch (weak SEO); several categories link to the same filter; blog has no author, date filtering or
sharing; price shown as "ON REQUEST*" almost everywhere; many near-duplicate SEO landing pages.

## 2. UNAVORA today (`7f8f9e2`)

Working: official logo; home (hero + search, live figures, categories with live counts, featured listings, about,
approach, locations, partner banner, enquiry); About; listing with filters + mobile filter sheet; Residential /
Commercial / Plots; property detail (facts, amenities, location note, related, sticky mobile bar); Projects + project
detail (published only, RERA only when verified); Channel-partner form -> CRM; Contact form with enquiry type -> CRM;
Privacy/Terms interim pages; branded 404; customer account (mock Google + mock WhatsApp OTP, requests -> CRM);
SEO basics (canonical, hreflang, OG, sitemap, robots, JSON-LD); verified-only company facts.

Weak: **no photography** (code-drawn illustrations everywhere, repeated skyline look); hero too tall on phones (443 px:
headline at 193 px, search card starts at 526 px); no Insights, videos, testimonials, associations, owner listing,
locality pages, favourites or enquiry tracking; no listing sort; property detail has no gallery/floor plan/map.

## 3. Gap matrix and decisions

| Feature | Reference | UNAVORA now | Action | Data / backend dependency | Phase |
|---|---|---|---|---|---|
| Photographic hero, categories, about, partner | photos | illustrations | Licensed representative photos, labelled; real photos replace them later | **Owner approval to download licensed stock**; company photos later | A |
| Hero layout on phones | weak | too tall | Compact hero: shorter copy, CTAs side by side, search as one-tap expandable panel | — | A |
| Header with Insights + active state | partial | no Insights, no active state | Insights menu shown once content exists; active item marked (`aria-current`) | Insights CMS (C/D) | A/C |
| Property finder | name + type + status | city, category, type, budget | Keep; add sort; sale/rent only when rent data exists | Listing purpose = sale only today | A/B |
| Category cards with counts | static tiles | live counts, illustrations | Distinct photo per category | Photos | A |
| New launches | yes | page exists, no data | Status filter (new launch / ongoing / completed when real), developer when verified | Projects + developer fields (schema has projects; developer name field missing) | B |
| Property cards with photos | yes | illustration | Use `property_media` (public, ready) when present; labelled illustration fallback | **Public media API + upload pipeline** (MinIO blocked locally) | B |
| Listing sort + numbered pages | pages | "show more" | Sort (newest, price low/high), keep cursor paging | API sort parameter | B |
| Property detail gallery, floor plan, map | partial | facts only | Gallery from media; floor plan when uploaded; approximate map by locality (no exact address) | Media API; map provider decision (static image or OpenStreetMap embed) | B |
| Locality / city pages | many thin pages | none | `/locations/{city}` only for cities with listings, with editorial copy from CMS | Locality content model | B/C |
| List your property (owner) | banner | none | Form -> CRM "owner submission" for employee review and director approval; photos stored privately | **New CRM entity** (owner submissions) + secure uploads | C |
| Insights (articles) | blog | none | Articles, categories, search, author, date, related, share | **CMS content model + director management screens** | C/D |
| Videos | YouTube | none | Approved YouTube embeds (privacy-enhanced, click to load) | Video entries in CMS | C/D |
| Testimonials | Google snippets | none | Moderated `reviews` + display consent; optional rating | Consent field on reviews; moderation UI | C/D |
| Developer associations | logos | none | Logo grid from CMS with permission flag | Partner-logo model + uploads | C/D |
| Favourites | — | none | Save for signed-in customers | Favourites table + API | C |
| Enquiry and visit tracking in account | — | requests only | List own enquiries and site visits with status | Customer-facing read API | C |
| Careers | yes | none | Only if the company wants recruitment | Decision | optional |
| RERA / legal block on projects | yes | RERA only when verified | Add agent RERA + project RERA QR only from verified data | Verified numbers | B |
| Director-managed CMS (banners, featured, categories, localities, blogs, videos, testimonials, logos, FAQs, SEO, contact) | — | tables partly exist, **no management screens** | Build director CMS screens in the CRM | Large backend + UI | D |

## 4. Proposed sitemap

```
/{en|hi}
├── /                         Home
├── /about                    About (story, vision, mission, values, leadership once confirmed)
├── /properties               All properties (search, filters, sort, pages)
│   ├── /residential  /commercial  /plots  /offices*
│   └── /properties/{slug}    Property detail
├── /projects                 New launches (+ ongoing / completed filters when data exists)
│   └── /projects/{slug}      Project detail
├── /locations/{city}*        City pages, only for cities with published listings
├── /insights*                Articles + videos (filters, search)
│   └── /insights/{slug}*     Article
├── /channel-partner          Partner registration
├── /list-your-property*      Owner submission
├── /contact                  Contact + enquiry
├── /account                  Sign in, profile, requests, favourites*, enquiries and visits*
├── /privacy  /terms          Approved documents (interim text until supplied)
└── /careers**                Only if the company decides to recruit online
*  new in this programme   ** optional
```

## 5. Page-by-page plan (summary)

| Page | Sections | States |
|---|---|---|
| Home | header; compact photo hero + finder; categories (photos, counts); new launches (when projects exist); featured listings; locations; about; why UNAVORA; channel partner; list your property; insights + videos (when published); testimonials (when consented); associations (when permitted); enquiry; footer | each data section hides when empty |
| Properties / category | breadcrumb, title, filters (desktop bar, phone bottom sheet), chips, sort, results count, cards, paging | skeleton, empty (ask our team), error |
| Property detail | gallery (photos or labelled illustration), title/price/location, key facts, description, amenities, floor plan, approximate location, contact advisor (call/WhatsApp when verified), enquiry / callback / site visit, similar | 404, sticky phone bar |
| Projects / detail | status filter, cards with developer + status; detail with units table, RERA block (verified only), location, enquiry | empty interest form |
| Locations | city intro (CMS), localities, listings, categories, enquiry | only generated for cities with listings |
| About | story, vision, mission, values, approach, leadership (confirmed), presence | — |
| Channel partner / List your property | intro, steps, form with consent, confirmation with reference | rate-limited, errors |
| Insights / article | categories, search, cards; article with author, date, related, share | empty: section hidden from navigation |
| Contact | form with enquiry type + property/project selection, verified channels, cities | — |
| Account | profile, verification, requests, favourites, enquiries/visits | signed out |

## 6. Priorities and dependencies

| Phase | Scope | Blocked by |
|---|---|---|
| **A** | Design-system refinements, header (Insights entry when content exists, active state), compact photo hero + phone finder panel, photographic category cards, homepage polish | **Owner approval of licensed representative photos** (downloads) |
| **B** | Listing sort, project status filters + developer field, public media API + gallery, approximate map, city pages | Map decision; media upload pipeline for real photos |
| **C** | About story/leadership (when confirmed), List your property (CRM entity + private uploads), Insights/articles + videos, favourites, account enquiry/visit tracking | Content, consent fields, upload storage |
| **D** | Director CMS screens (banners, featured, localities, articles, videos, testimonials, logos, FAQs, SEO, contact facts), performance and accessibility audit, QA | — |

## 7. Business inputs needed

Company photos (projects, office, team); approval to use labelled licensed stock meanwhile; director photo and
permission; verified phone, WhatsApp, email, addresses, social links; projects with developer agreements and RERA
numbers; brochures and floor plans; genuine reviews with consent; partner-logo permissions; articles and videos (or an
author/editorial process); careers decision; privacy policy and terms.
