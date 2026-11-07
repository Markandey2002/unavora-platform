# MOBILE_AND_SEO_STRATEGY.md

## Mobile-first web
- Design at 360–430 px first; ≥44 px touch targets (`min-h-11/12` used); single-column forms; sticky enquiry action planned.
- Performance budget (targets, unmeasured): LCP < 2.5 s on mid-range Android over 4G, CLS < 0.1, INP < 200 ms; server components by default; images via CDN with responsive sizes (no images exist yet).
- Public pages cacheable (`Cache-Control: public, max-age=60` on API; Next revalidate 60 s).
- Offline/PWA: not planned for v1.

## Future React Native app
Same REST API under `/api/v1/**`, OAuth2 Authorization Code + PKCE, no cookies. Shared OpenAPI contract (`contracts/openapi/unavora-api.v1.yaml`) is the source for a generated client. Deep links `unavora://auth/callback` already registered in the dev realm. Folder `apps/mobile` reserved.

## Languages
`/en/**` and `/hi/**`. Hindi segment slugs per property come from `property_translations.slug`. A property without a Hindi translation must not be indexed under `/hi`; fallback pages carry `noindex`. Hindi copy is DRAFT until native review.

## SEO plan
| Item | Status |
|---|---|
| Per-property `<title>`/description (from translations) | Implemented (`generateMetadata`) |
| `hreflang` + canonical via route-key map | NOT IMPLEMENTED |
| `sitemap.xml`, `robots.txt` (only published listings; exclude draft/sold) | NOT IMPLEMENTED |
| JSON-LD (Organization, RealEstateListing) – only verified facts, no fake ratings/RERA | NOT IMPLEMENTED |
| Locality landing pages (Noida / Lucknow / Prayagraj) | NOT IMPLEMENTED |
| Redirect plan from existing WordPress URLs | Needs URL inventory (pending confirmation #16) |
| Core Web Vitals monitoring (RUM) | Planned for staging |
