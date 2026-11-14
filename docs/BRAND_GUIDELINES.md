# BRAND_GUIDELINES.md — UNAVORA ANANT REAL ESTATE (approved 2026-11-13, final)

| | |
|---|---|
| Public brand name | **UNAVORA ANANT REAL ESTATE** (Hindi UI: यूनावोरा अनंत रियल एस्टेट — draft transliteration, native review pending) |
| Tagline | **INVEST IN A BETTER LIVING** — used verbatim in every language; not rewritten or translated without approval |
| Primary domain | **https://uainfrarealestate.com** (DNS not changed yet; see DOMAIN_MIGRATION_PLAN.md) |
| Sender display name (email/WhatsApp) | UNAVORA ANANT REAL ESTATE |
| Registered legal name | **Separate field** — CRM → Company facts `company.legal_name`, shown only when verified from official company records. Today it holds the earlier unverified value and is not displayed. Never derived from the public brand |

## Logo
- **Source (do not edit):** `assets/brand/source/unavora-anant-real-estate-primary.png` — PNG 1200 × 411, RGB, cream
  background `#FEFAF7`, SHA-256 prefix `8ca3de078c7df91d58b1`. Saved from the owner's message on 2026-11-13; replace with
  the designer's original export if it differs (no code change needed — re-run the generator).
- **Generator:** `python -I assets/brand/make_brand_assets.py` — crop, background removal, padding, scaling only.
- **Vector master and reversed (dark-background) artwork:** not supplied yet — requested from the designer. Do not
  trace, redraw or recolour the logo; do not apply CSS filters.

| Variant | Path | Use |
|---|---|---|
| Primary horizontal, transparent | `apps/web/public/brand/unavora-anant-real-estate-logo.png` (+ `.webp`), 957 × 278 | Header, footer (on a light plate), About, staff header |
| Primary on cream | `apps/web/public/brand/unavora-anant-real-estate-logo-on-cream.png` | E-mails, documents, structured data (`Organization.logo`) |
| UA monogram, transparent | `apps/web/public/brand/unavora-anant-real-estate-mark.png`, 406 × 228 | Phones narrower than 360 px. Keeps the thin divider (it overlaps the A's foot; cropping would cut the letter) |
| Favicon | `apps/web/src/app/favicon.ico` (16/32/48), monogram on cream | Browser tabs |
| App icons | `apps/web/src/app/icon.png` (512), `apple-icon.png` (180), `public/brand/icon-192.png`, `icon-512.png` | Bookmarks, home screen, web manifest |
| Social sharing | `apps/web/src/app/opengraph-image.png`, `twitter-image.png` (1200 × 630, full logo on cream) | Link previews |

Rules: the logo is always shown on a light surface (it is raster on cream); on navy sections use the `Logo` component
with `plate`. Minimum display height 36 px for the full logo (`size="sm"`), header 48–56 px. Keep clear space of at least
the height of the "R" of REAL around the logo. Never stretch (always `w-auto`/fixed aspect ratio).

## In code
- `apps/web/src/lib/brand.ts` — the only place with the public name, tagline, domain, sender name and logo paths.
- `apps/web/src/lib/assets.ts` — logo slots read from `brand.ts`; `components/site/Logo.tsx` renders them.
- Company facts in the CRM (`company.display_name`, `company.tagline`, verified) override the defaults on the site;
  migration V20 moved their seeded values to the new brand without touching edited values or the legal name.
- `apps/web/src/lib/brand.test.ts` fails if the old brand, old tagline or old logo filenames return to the website source.

## Colours
Logo colours are part of the artwork (gold gradient, emerald green) and are not re-specified as CSS. The website
palette keeps navy `#101D35`, champagne gold `#E3C58A`, warm white `#F7F5F0`, slate `#64748B`; the logo's cream
`#FEFAF7` is used behind the logo where it has no transparency. A palette review around the emerald may follow with
the designer's vector files.

## Superseded identity (archived, not served)
`assets/brand/archive/uai-2026-11-08/` — the UAI logo sheet, its web exports and the previous app icons, with the old
generator disabled. Nothing in `apps/web` references these files (enforced by `brand.test.ts`).
