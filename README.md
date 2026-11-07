# UNAVORA ANANT INFRA platform

Next.js 16 (web + BFF) · Spring Boot 4 modular monolith (API) · PostgreSQL 17. Local-first: nothing here touches AWS,
DNS, the existing WordPress site, live payments, real Google accounts or a real WhatsApp provider.

> **Status (2026-11-07):** both vertical slices build and pass their tests locally. See `docs/TEST_RESULTS.md` for
> every command run and its result. Google sign-in and WhatsApp OTP run on **mock adapters only**. Real Google login
> and real WhatsApp OTP have not been configured or tested.

| Slice | What works locally (verified) |
|---|---|
| 1. Property search → enquiry → CRM | search/filter/detail (en, hi), enquiry with idempotency + consent, customer reuse by phone, lead auto-assigned to property owner, employee sees only own leads (others → 404), director overview |
| 2. Customer signup | "Continue with Google" (mock), one customer profile per Google account (no duplicates on re-login), WhatsApp OTP (mock), callback / site-visit / enquiry requests as separate leads, separate enquiry and marketing consent, CRM customer list incl. registered-only customers, contact actions (tel:, wa.me), communication log, follow-ups |

## Prerequisites
Docker Desktop, JDK 21, Maven 3.9+ (3.10.0 used), Node 22+ (24.12 used), Python 3 (validation scripts only).

## Which Docker services are needed (keep RAM low)
| Task | Start | RAM (measured) |
|---|---|---|
| Run the website + API | `postgres` only | ~45 MB |
| Staff/director CRM sign-in at `/en/staff` and the validation scripts | `postgres` + `keycloak` | +~560 MB |
| Backend tests (`mvn verify`) | none; Testcontainers starts and removes its own temporary PostgreSQL | temporary |
| Not needed today | `mailpit` (no email sending yet), `minio` (opt-in profile, images unavailable) | — |

UNAVORA containers are all named `unavora-*`, use the Compose project `unavora-local`, publish only on 127.0.0.1 (ports 15432, 8180, 8025), and use `restart: "no"`. They never start by themselves and don't share ports or volumes with other projects.

---

## Windows (PowerShell 5.1) — run the project
Windows PowerShell 5.1 does not support `&&`, so run each command on its own, in order. Paths assume the project is at `C:\Users\Dell\UnnaVora`.

### 1. Database (one time per session)
```powershell
Set-Location C:\Users\Dell\UnnaVora
```
Run this only if `.env` does not exist yet:
```powershell
Copy-Item .env.example .env
```
```powershell
docker compose up -d postgres
```
```powershell
docker compose ps
```
`unavora-postgres` should show `healthy`.

### 2. API (terminal 1)
Maven is not on PATH on this PC, so point a variable at the cached Maven 3.10.0:
```powershell
$mvn = "$env:USERPROFILE\.m2\wrapper\dists\apache-maven-3.10.0\2aaba761688b1a6ea5a46e7e5f4d5406ed7a75ee8da95e5e3079863a23461c9b\bin\mvn.cmd"
```
```powershell
Set-Location C:\Users\Dell\UnnaVora\services\api
```
```powershell
& $mvn -B -DskipTests package
```
```powershell
java -Xmx448m -jar target\unavora-api-0.1.0-SNAPSHOT.jar --spring.profiles.active=local
```
Ready when the log shows `Started UnavoraApplication`. Flyway applies V1–V12 and the synthetic seed. The `local` profile uses the **mock** Google and **mock** WhatsApp adapters.

### 3. Web (terminal 2)
Run Next directly with `node`. On this PC, `npm run …` picks up an old Node 18 from `C:\Users\Dell\node_modules\.bin` (see Troubleshooting).
```powershell
Set-Location C:\Users\Dell\UnnaVora\apps\web
```
```powershell
npm ci
```
```powershell
$env:NEXT_BUILD_CPUS = "2"
```
```powershell
node node_modules\next\dist\bin\next build
```
```powershell
$env:CUSTOMER_AUTH_MODE = "mock"
```
```powershell
$env:INTERNAL_SERVICE_TOKEN = "local-dev-internal-token-not-a-secret"
```
```powershell
node node_modules\next\dist\bin\next start -p 3000
```
Open http://localhost:3000/en/properties (site), http://localhost:3000/en/account (customer signup, mock Google), and http://localhost:8080/api/v1/public/properties (API).

**Mock WhatsApp code:** after "Send code" on the account page, read the code (terminal 3):
```powershell
Invoke-RestMethod "http://localhost:8080/internal/v1/dev/mock-whatsapp/latest?phone=9876543210" -Headers @{ "X-Internal-Service-Token" = "local-dev-internal-token-not-a-secret" }
```
Replace the number with the one you entered. This endpoint only exists in mock mode.

### 4. Stop everything (free RAM)
Press `Ctrl+C` in terminals 1 and 2, then:
```powershell
Set-Location C:\Users\Dell\UnnaVora
```
```powershell
docker compose stop
```
`stop` keeps the database volume. Do not use `docker compose down -v` unless you want to wipe the local data.

---

## Windows (PowerShell 5.1) — tests
**Backend** (needs Docker; stop the API first, because Windows locks the running jar):
```powershell
Set-Location C:\Users\Dell\UnnaVora\services\api
```
```powershell
$env:MAVEN_OPTS = "-Xmx384m"
```
```powershell
& $mvn -B verify
```
Expected: 5 architecture tests + 74 integration tests, `BUILD SUCCESS`.

**Web** type-check and unit tests:
```powershell
Set-Location C:\Users\Dell\UnnaVora\apps\web
```
```powershell
node node_modules\typescript\bin\tsc --noEmit
```
```powershell
node node_modules\vitest\vitest.mjs run
```
**End-to-end** (API and web running as above):
```powershell
node node_modules\@playwright\test\cli.js install chromium
```
```powershell
node node_modules\@playwright\test\cli.js test --workers=1
```
**Business-flow scripts** (need Keycloak for staff tokens; start it only for this, then stop it):
```powershell
Set-Location C:\Users\Dell\UnnaVora
```
```powershell
docker compose up -d keycloak
```
Wait about 30–60 s until http://localhost:8180/realms/unavora-dev/.well-known/openid-configuration responds, then:
```powershell
python infra\local\scripts\validate_business_flow.py
```
```powershell
python infra\local\scripts\validate_customer_signup.py
```
```powershell
docker compose stop keycloak
```

Local staff users (Keycloak dev realm, synthetic): `director.local`, `employee1.local`, `employee2.local`, plus `outsider.local` (exists in Keycloak but is NOT invited to the CRM, for testing). The passwords are in `infra/local/keycloak/unavora-dev-realm.json` and must never be reused.

**Manual browser testing:** realistic synthetic CRM data and step-by-step test cases are in [docs/MANUAL_UI_TESTING.md](docs/MANUAL_UI_TESTING.md) (load/reset the data with `infra/local/manual-test-data.sql`).

**Staff CRM** (start `keycloak` first): open http://localhost:3000/en/staff and sign in. The director also needs an authenticator code: run `python infra\local\scripts\director_totp.py` (prints the current code; `--setup` prints a key for an authenticator app), or let the tests/scripts generate it (RFC 6238, HMAC-SHA1, 30 s, key = the secret's UTF-8 bytes). Keycloak accepts each code only once per 30 s window.

---

## Linux / macOS / Git Bash
Same steps, using the bash forms: `cp .env.example .env`, `docker compose up -d postgres`, `cd services/api`, `mvn -B -DskipTests package`, `java -Xmx448m -jar target/unavora-api-0.1.0-SNAPSHOT.jar --spring.profiles.active=local`, then in `apps/web`: `npm ci`, `npm run build`, `CUSTOMER_AUTH_MODE=mock INTERNAL_SERVICE_TOKEN=local-dev-internal-token-not-a-secret npm run start`. Tests: `mvn verify`, `npm run lint`, `npm test`, `npm run e2e`.

## Troubleshooting (found on the development PC)
- **`npm run …` says "Node.js >=20.9.0 is required" / uses Node 18.** npm adds every parent folder's `node_modules\.bin` to PATH, and `C:\Users\Dell\node_modules` (an unrelated project) contains the `node@18` npm package. Run the tools with `node node_modules\…` as shown above. Nothing in that home project was changed to fix this.
- **Never run `npm install` outside `apps\web`.** A guard `package.json` at the UNAVORA root makes such a command fail with "UNAVORA: run npm inside apps/web", so npm can no longer climb up to `C:\Users\Dell`.
- **Out of memory / Docker Desktop restarts.** Start only `postgres`, keep `NEXT_BUILD_CPUS=2`, and stop Keycloak when you don't need staff tokens.
- **"Detected resolved migration not applied to database: 9"** cannot happen in the `local` profile (out-of-order is allowed there; DECISION_LOG D-015).

## Layout
`apps/web` Next.js (pages, `/_bff` auth routes, server actions) · `apps/mobile` (reserved) · `services/api` Spring Boot + Flyway (modules `properties`, `crm`, `customers`, `identity`, `reporting`, `platform`) · `contracts/openapi` · `infra/local` (Keycloak realm, validation scripts) · `.github/workflows/ci.yml` · `docs`. CI runs on every push and pull request to `main` in the private GitHub repository `Markandey2002/unavora-platform` (secret scan, API, web, end-to-end).

## Rules
Synthetic data only outside production. Secrets never go in git; the local values are throw-away. No AWS deployment, real Google OAuth or real WhatsApp provider until explicitly approved. Mock modes must never be enabled in staging or production; those profiles have no defaults, so startup fails if a mode is not set explicitly.
