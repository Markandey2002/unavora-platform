# DOMAIN_MIGRATION_PLAN.md — anantinfrarealty.com → uainfrarealestate.com (plan only, 2026-11-13)

**Nothing in this document has been changed.** No DNS, nameserver, MX or mailbox change is made without the owner's
written approval for that specific step. The old domain and its mail stay fully operational throughout.

Proposed canonical production URL: **https://uainfrarealestate.com** (root; `www` redirects to it).

## 1. What exists today (read-only public DNS lookups, 2026-11-13, resolver 1.1.1.1)

| | uainfrarealestate.com (new) | anantinfrarealty.com (old) |
|---|---|---|
| Registrar / DNS | Hostinger; nameservers `cosmos.dns-parking.com`, `nova.dns-parking.com` (Hostinger DNS) | nameservers `ns1/ns2.bmctech.in` (separate hosting company) |
| Website A record | `2.57.91.91` (Hostinger); `www` is an alias of the root | `103.53.40.62` (current site); `www` alias of the root |
| MX | `mx1.hostinger.com` (5), `mx2.hostinger.com` (10) → **Hostinger Mail** | `mail.anantinfrarealty.com` (0) → mail on the old host |
| SPF | `v=spf1 include:_spf.mail.hostinger.com ~all` | `v=spf1 a mx include:websitewelcome.com ~all` |
| DKIM | `hostingermail-a/-b/-c._domainkey` → CNAMEs to `*.dkim.mail.hostinger.com` (present) | `default._domainkey` TXT `v=DKIM1` (present) |
| DMARC | `v=DMARC1; p=none` | **none found** |

So the new domain's mail service and its sender authentication (SPF, DKIM, DMARC monitor mode) are already configured
at Hostinger. Whether the mailbox `Rahul.Shukla@uainfrarealestate.com` exists and is active **cannot be verified from
outside without signing in** — the owner confirms it in hPanel (§6).

## 2. Records for the new website (prepare now, apply only after approval)

| Record | Value | When |
|---|---|---|
| `A @` | the VPS public IPv4 (static) | at cut-over, replaces `2.57.91.91` |
| `AAAA @` | VPS IPv6, only if the VPS has a stable one | optional |
| `CNAME www` | `uainfrarealestate.com.` | at cut-over (today `www` already aliases the root) |
| `A media` / `CNAME media` | R2 custom domain (Cloudflare instructions) — or serve `/media` from the VPS | when R2 is adopted |
| `CAA @` (optional) | `0 issue "letsencrypt.org"` | before the first certificate |
| TTL | lower to 300 s **48 h before** cut-over, raise to 3600 s after | — |

**Keep untouched:** both MX records, the SPF TXT, the three DKIM CNAMEs, `_dmarc`, and any other mail/verification
record that exists in hPanel. If application email is ever sent through another provider (e.g. Amazon SES), its SPF
`include:` and DKIM CNAMEs are **added** to the existing ones — never replacing them. Do not move nameservers to another
DNS provider (e.g. Cloudflare) unless separately approved; it is not required for R2.

HTTPS: Caddy (or Nginx + certbot) on the VPS obtains Let's Encrypt certificates for `uainfrarealestate.com` and
`www.uainfrarealestate.com` automatically after the A/CNAME records point to the VPS; HSTS added after a week of stable
HTTPS (short max-age first). `www` → root: permanent redirect (308/301) in the reverse proxy, path and query preserved.

## 3. Application configuration for the new domain

| Setting | Value |
|---|---|
| `SITE_URL`, `NEXT_PUBLIC_SITE_URL` | `https://uainfrarealestate.com` (canonical, hreflang, sitemap, OG, BFF redirect URIs all derive from it) |
| `SITE_INDEXABLE` | `true` on production only (robots stays `Disallow: /` elsewhere) |
| `CORS_ALLOWED_ORIGINS` (API) | `https://uainfrarealestate.com` |
| `MEDIA_PUBLIC_URL` / `UNAVORA_MEDIA_PUBLIC_BASE_URL` | e.g. `https://media.uainfrarealestate.com` (R2) or `https://uainfrarealestate.com/media` |
| `STAFF_OIDC_REDIRECT_URI` | `https://uainfrarealestate.com/_bff/staff/callback` |
| `STAFF_OIDC_POST_LOGOUT_REDIRECT_URI` | `https://uainfrarealestate.com/_bff/staff/signed-out` |
| Google OAuth (customers) | origin `https://uainfrarealestate.com`, redirect `https://uainfrarealestate.com/_bff/auth/google/callback` (path taken from `apps/web/src/app/_bff/auth/google/*/route.ts`) |
| WhatsApp webhook | **not implemented yet**; proposed `https://uainfrarealestate.com/api/webhooks/whatsapp` (to be confirmed when built) |
| Company facts (CRM) | `company.website` → `https://uainfrarealestate.com`; public e-mail per §6 after verification |

Hreflang/canonical: `/en/...` and `/hi/...` alternates already generated from `SITE_URL`; `x-default` → `/en`.
Sitemap: `https://uainfrarealestate.com/sitemap.xml` (real public records only). Open Graph image regenerated with the new
logo (brand phase).

## 4. Old domain: redirects without touching mail

1. Keep `anantinfrarealty.com` hosting, DNS and **mail** (`mail.anantinfrarealty.com`) exactly as they are.
2. After the new site is verified in production, add **page-to-page 301 redirects on the old web host only** (e.g.
   `.htaccess` on the existing cPanel site): build a map of every indexed old URL (from the old sitemap / Search Console)
   to its best new equivalent (`/` → `/en`, about → `/en/about`, contact → `/en/contact`, listings → matching new pages
   or `/en/properties`); unknown paths → `/en`. Never redirect `mail.`, `webmail.`, `cpanel.`, `autodiscover.` or
   `/.well-known/`.
3. Keep the redirects for at least 12 months (preferably permanently) and keep the old domain registered.

## 5. Search engines

Google Search Console: verify both domains (DNS TXT — an *added* record), submit the new sitemap, use the **Change of
Address** tool from the old property after the 301s are live; Bing Webmaster Tools import. Watch coverage and 404s for
8–12 weeks.

## 6. Business email (confirmed by the owner 2026-11-13; configuration pending)

Primary business email: **Rahul.Shukla@uainfrarealestate.com** — proposed as website enquiry recipient, business
notification recipient, customer communication sender, CRM administrator/business contact and Reply-To for customer
enquiries. Sender display name: **UNAVORA ANANT REAL ESTATE**. Status: **pending configuration** until the steps below
are complete. `info@anantinfrarealty.com` stays operational during the migration (it is on the old host; nothing changes
there).

| Step | Status (2026-11-13) |
|---|---|
| 1. Mailbox created and active in Hostinger | **Not verifiable externally** — owner to confirm in hPanel → Emails (mailbox listed, not suspended, plan and daily sending limit under "View limits") |
| 2. Email hosting provider | **Hostinger Mail** (MX `mx1/mx2.hostinger.com`, SPF include `_spf.mail.hostinger.com`, DKIM `hostingermail-a/b/c`) |
| 3. SMTP and TLS | `smtp.hostinger.com`: TLS 1.3 with a valid certificate on **465 (implicit TLS)** and **587 (STARTTLS)** — handshake checked without logging in. SMTP AUTH with the mailbox address as user is Hostinger's documented method; to be confirmed with a mock-first test and then one owner-approved real test message |
| 4. SPF / DKIM / DMARC | Already published (see §1). Recommended later: add a report address to DMARC (`rua=mailto:...`), then move from `p=none` to `p=quarantine` after 2–4 weeks of clean reports |
| 5. DNS records to prepare | None required for Hostinger SMTP sending. Only if another sending provider is added: its SPF include + DKIM CNAMEs |
| 6. Local test | Through Mailpit (local) — no real message is sent |

Credentials: the mailbox password is never requested, printed or committed; the owner enters it into the production
secret store (server environment file readable only by the service account). Recommendation for review: automated
messages from a personal mailbox share its daily limit (1,000/day on Business Starter) and stop if its password changes;
a role mailbox (e.g. `info@` or `noreply@uainfrarealestate.com`) as sender, with Reply-To and notifications to Rahul
Shukla, is more robust. Old address options after cut-over: keep `info@anantinfrarealty.com` as a working mailbox or set
forwarding on the old host to the new address — decision and change only with approval.

## 7. Cut-over sequence (each step needs approval)
1. New site deployed on the VPS and tested via a temporary hostname / hosts-file entry. 2. Lower TTL. 3. Change `A @` and
`www` at Hostinger (mail records untouched). 4. Certificates issued, smoke tests, Google sign-in test. 5. Enable old-domain
301 map. 6. Search Console change of address. 7. Raise TTL, enable HSTS. Rollback: point `A @` back to `2.57.91.91`.

## 8. Brand on the new domain (2026-11-13)
The website already uses the approved public brand **UNAVORA ANANT REAL ESTATE** and tagline **INVEST IN A BETTER LIVING**
locally (logo, favicon, app icons, web manifest, Open Graph/Twitter images, titles, structured data — see
BRAND_GUIDELINES.md). The canonical origin, sitemap, hreflang and OG URLs switch to `https://uainfrarealestate.com` purely
by setting `SITE_URL` at cut-over; no code change. `company.website` was recorded as `https://uainfrarealestate.com`
(unverified, not shown) by migration V20. The registered legal name is not changed by the domain or brand migration.
