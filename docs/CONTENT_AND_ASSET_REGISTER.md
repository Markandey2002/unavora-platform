# CONTENT_AND_ASSET_REGISTER.md

Sources read: *Website Blueprint (Updated)* PDF, *Cursor master prompt* PDF, supplied logo sheet, homepage mock-up and palette image. 2026-11-08: official final logo sheet (owner) and a video design reference (style only; no content, images or text reused).

## Conflicts resolved
| Topic | Conflict | Decision |
|---|---|---|
| Palette | PDF: #061B35 / #D7A84B / #F8F5EE. Palette image: #101D35 / #E3C58A / #F7F5F0 / #64748B | Image wins (later, explicit asset). Tokens in `apps/web/src/app/globals.css` |
| Framework | Blueprint mentions Angular | Next.js (approved in ARCHITECTURE v2.0) |
| Email | An older, obsolete address vs `info@anantinfrarealty.com` | `info@anantinfrarealty.com` is the intended company email, flagged unverified until business confirmation; the obsolete address is not stored anywhere |
| Mock-up data | Prices, counts, "RERA verified" badges in mock-up | Treated as placeholders; never seeded as real |
| Copyright year | Hard-coded year | Dynamic |
| Logo | Two marks (green-and-gold UAI vs gold IA monogram from the old mock-up) | **Decided 2026-11-08 (owner): the green-and-gold UAI logo is the official, final and permanent brand identity.** The IA monogram is not used |

## Asset status
| Asset | Status |
|---|---|
| Logo: official sheet | **APPROVED, FINAL** (owner, 2026-11-08). Original kept unchanged: `assets/brand/unavora-logo-sheet-original.jpg` (JPEG, 1280×853). Contains primary stacked logo, horizontal lockup, UAI monogram, monochrome version |
| Logo: website files | DONE, derived without altering the artwork by `assets/brand/make_logo_assets.py` (crop to measured bounds, colour-to-alpha of the sheet's paper colour, proportional scaling only): `apps/web/public/brand/unavora-logo-horizontal.png` (473×119, header and footer), `unavora-mark.png` (382×372, compact mobile header), `unavora-logo-stacked.png` (976×547), `unavora-logo-monochrome.png` (306×177, for one-colour uses only); `apps/web/src/app/icon.png` (512×512), `apple-icon.png` (180×180, on #F7F5F0), `favicon.ico` (16/32/48), `opengraph-image.png` (1200×630, stacked logo on #F7F5F0) |
| Logo: usage rules | Horizontal lockup in the website header and footer; UAI monogram for favicon/app icons and phones narrower than 360 px; monochrome only where a single colour is required. Proportions, colours, typography and tagline unchanged. Cut-outs come from a JPEG, so they are shown on light surfaces only (header on #F7F5F0; footer places the lockup on a warm-white plate on navy) |
| Logo: vector master (SVG/AI/PDF) and reversed (on-dark) version | MISSING. Needed for print, large formats and a logo directly on navy; until then the PNG cut-outs above are used |
| Director portrait | MISSING as standalone file |
| Property photographs | MISSING (none supplied; none invented). The website shows original code-drawn architectural illustrations (`apps/web/src/components/site/Art.tsx`), always labelled "Illustration", never presented as a real UNAVORA property. Photo slots for hero, about and channel-partner sections: `apps/web/src/lib/assets.ts` (company photos and licensed stock kept apart) |
| Project details (names, RERA, floor plans) | MISSING |
| Office addresses / PIN | MISSING |
| Hindi translations | DRAFT, needs native review |
| Fonts | System font stack (Noto Sans Devanagari fallback); brand fonts not specified |
| Privacy policy / terms | MISSING |

## Representative (licensed stock) photographs

Approved by the owner on 2026-11-09 ("use clearly labelled representative stock imagery"; download list approved).
Licence: Unsplash License (free for commercial use, no permission needed, credit appreciated but not required;
Unsplash+ images excluded). Stored in `apps/web/public/images/representative/`, registered in
`apps/web/src/lib/assets.ts` as `kind: "licensed-stock"`. Every use carries the caption "Representative image";
none is used on a listing or project page, and none depicts a UNAVORA property.

| File | Used for | Source | Photographer |
|---|---|---|---|
| hero.jpg (2400×1347) | homepage hero | unsplash.com/photos/ANDcLjlFL9Q | Tabreez |
| residential.jpg (1600×988) | Residential category card | unsplash.com/photos/3I8Jv3-TNro | Alexandre Lallemand |
| commercial.jpg (1600×1049) | Commercial category card | unsplash.com/photos/gKMxcHB3U3E | Joakim Honkasalo |
| plots.jpg (1600×1200) | Plots & land category card | unsplash.com/photos/nsevmnDU7FM | Iain |
| offices.jpg (1600×1067) | Office spaces category card | unsplash.com/photos/PG8NyM_Mcts | Adolfo Félix |
| about.jpg (1600×1067) | About section (home, About page) | unsplash.com/photos/WG68nmCtdqM | Timur Seyfelmlyukov |
| partner.jpg (1600×1066) | Channel-partner banner | unsplash.com/photos/qFSQFSmfZkA | Mina Rad |

Replace with company photography as it becomes available (same slots, `kind: "company"`, caption removed).
Still illustrated (no photos may be used): property and project cards and detail galleries (need real listing photos).

## Website content managed in the CRM (2026-11-09)

| Content | Where it is managed | Public rule | Local sample data |
|---|---|---|---|
| Insights (articles, videos) | CRM → Website content → Insights (`cms.manage`) | published only; Hindi optional; videos are YouTube ids, click-to-load | one `[SAMPLE]` article (en/hi) in `infra/local/manual-test-data.sql` |
| Testimonials | CRM → Website content → Testimonials (`cms.manage`) | published **and** display consent recorded (DB constraint) | **none** (no invented reviews) |
| Featured listings | CRM → Website content → Featured listings (`property.publish`) | only published, available listings | one sample listing featured |
| City introductions | CRM → Website content → City introductions (`cms.manage`) | published; city page exists only while the city has public listings | `[SAMPLE]` Lucknow intro |
| Company facts and offices | CRM → Website content → Company facts (`settings.manage`) | only values marked verified | unchanged: nothing verified yet |
| Owner submission photos | uploaded by owners on "List your property" | **never public**; staff only | created by tests only |

Not managed yet (code changes needed): homepage banners and hero text, category tiles, SEO title/description
overrides, partner/developer logos, careers, media gallery for listings (needs the public media store).
