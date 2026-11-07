# CONTENT_AND_ASSET_REGISTER.md

Sources read: *Website Blueprint (Updated)* PDF, *Cursor master prompt* PDF, supplied logo sheet, homepage mock-up and palette image.

## Conflicts resolved
| Topic | Conflict | Decision |
|---|---|---|
| Palette | PDF: #061B35 / #D7A84B / #F8F5EE. Palette image: #101D35 / #E3C58A / #F7F5F0 / #64748B | Image wins (later, explicit asset). Tokens in `apps/web/src/app/globals.css` |
| Framework | Blueprint mentions Angular | Next.js (approved in ARCHITECTURE v2.0) |
| Email | An older, obsolete address vs `info@anantinfrarealty.com` | `info@anantinfrarealty.com` is the intended company email, flagged unverified until business confirmation; the obsolete address is not stored anywhere |
| Mock-up data | Prices, counts, "RERA verified" badges in mock-up | Treated as placeholders; never seeded as real |
| Copyright year | Hard-coded year | Dynamic |
| Logo | Two marks on the sheet | Pending decision (confirmation #1) |

## Asset status
| Asset | Status |
|---|---|
| Logo (SVG/PNG, light/dark, favicon) | MISSING (raster sheet only) |
| Director portrait | MISSING as standalone file |
| Property photographs | MISSING (none supplied; none invented) |
| Project details (names, RERA, floor plans) | MISSING |
| Office addresses / PIN | MISSING |
| Hindi translations | DRAFT, needs native review |
| Fonts | System font stack (Noto Sans Devanagari fallback); brand fonts not specified |
| Privacy policy / terms | MISSING |
