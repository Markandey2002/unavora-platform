# DEVELOPER_ONBOARDING.md — first day on the UNAVORA ANANT REAL ESTATE platform

Start here, then use README.md for the full local setup and test commands. (The wider documentation set planned in
MASTER_PLAN_2026-11-13.md §11, phase 1, will expand this guide.)

## What it is
One monorepo: `apps/web` (Next.js 16 public website + CRM screens + BFF under `/_bff`), `services/api` (Spring Boot 4
modular monolith, Flyway migrations V1–V20), PostgreSQL 17, local Keycloak for staff sign-in. Public brand
**UNAVORA ANANT REAL ESTATE**, tagline *INVEST IN A BETTER LIVING*, proposed domain `uainfrarealestate.com`.

## Prerequisites
Docker Desktop, JDK 21 + Maven 3.9, **Node 24** (use the project's Node directly; run npm only inside `apps/web` —
the root `package.json` blocks npm elsewhere), Python 3 (helper scripts), Git.

## Run it locally (PowerShell 5.1; bash equivalents in README.md)
1. `docker compose up -d postgres keycloak`
2. API: in `services\api` → `mvn -B -DskipTests package`, then
   `java -Xmx448m -jar target\unavora-api-0.1.0-SNAPSHOT.jar --spring.profiles.active=local`
3. Web: in `apps\web` → `npm ci`, `npm run build`, then
   `$env:CUSTOMER_AUTH_MODE='mock'; $env:INTERNAL_SERVICE_TOKEN='local-dev-internal-token-not-a-secret'; node .next\standalone\server.js`
   (after `node scripts/prepare-standalone.mjs`).
4. Open http://localhost:3000/en. Staff sign-in: http://localhost:3000/en/staff (synthetic users in README.md).

## Tests
API `mvn verify` (unit + Testcontainers ITs) · web `npm run lint`, `npm test` (Vitest), `npm run build`,
`npm run e2e` (Playwright, needs the local stack running).

## Rules that matter
- Never commit secrets, `.env` files (except `.env.example`), production data, backups or uploaded documents.
- Migrations are append-only: add `V<n>__description.sql`, never edit an applied one.
- Synthetic data is marked `is_sample` and never public outside local/test.
- Brand: change names/tagline/logo only in `apps/web/src/lib/brand.ts` and via `assets/brand/make_brand_assets.py`;
  the registered legal name lives in CRM → Company facts (`company.legal_name`), never in code
  (docs/BRAND_GUIDELINES.md).
- Do not change DNS, mail records, OAuth or WhatsApp configuration from the codebase; see DOMAIN_MIGRATION_PLAN.md.

## Where to read next
ARCHITECTURE.md · DATABASE_DESIGN.md · CRM_SPECIFICATION.md · SECURITY_ARCHITECTURE.md · DECISION_LOG.md ·
MASTER_PLAN_2026-11-13.md · LAUNCH_READINESS_REPORT.md.
