# TEST_RESULTS.md

Last updated: **2026-11-07**, local Windows 11 PC (16 GB RAM). Vocabulary: **PASS / FAIL / BLOCKED / NOT RUN**. A test is PASS only if it was executed here and its output was seen. Every row below that says PASS was executed on 2026-11-07.

## 1. Environment (verified)
| Item | Value |
|---|---|
| Working dir | `C:\Users\Dell\UnnaVora` (Git Bash + PowerShell available, commands executed) |
| Java | Temurin 21.0.12.1 |
| Maven | 3.10.0. Not on PATH; used the cached wrapper distribution at `%USERPROFILE%\.m2\wrapper\dists\apache-maven-3.10.0\…\bin\mvn` |
| Node / npm | 24.12.0 / 11.6.2 (see §6: an ancestor `node_modules/.bin/node` v18 shadows it inside `npm run`) |
| Docker | Engine 29.1.2, Compose v2.40.3. Daemon running. Docker Desktop crashed once under memory pressure and was restarted |
| Resolved versions | Spring Boot 4.0.0, Tomcat 11.0.14, Flyway (Boot-managed), Testcontainers 2.0.2, PostgreSQL 17.11, Next 16.4.5, React 19.3.1, Tailwind 4.3.5, Vitest 3.2.7, Playwright 1.65.0, TypeScript 5.9.3, Keycloak 26.0 |

## 2. Results
### Slice 1: property search → enquiry → CRM
| Suite | Status | Command / evidence |
|---|---|---|
| Docker Compose: postgres, keycloak, mailpit | PASS | `docker compose up -d`; `pg_isready` → accepting connections; Keycloak OIDC discovery reachable |
| Docker Compose: minio, minio-init | BLOCKED | `pull access denied for minio/mc` (Docker Hub); quay.io returns 401. Moved to opt-in profile `storage` (D-016). Nothing uses storage yet |
| Flyway V1–V8 + seed V1000 on a **clean** local DB (new volume) | PASS | `java -jar target/unavora-api-0.1.0-SNAPSHOT.jar --spring.profiles.active=local` → "Successfully applied 9 migrations … now at version v1000" |
| Flyway V9 on the existing local DB | PASS | after the D-015 fix: "Migrating schema "public" to version "9 - customer identity" [out of order]" |
| `mvn package` (compile) | PASS | after fixes F1, F2 |
| ArchitectureTest (4 rules) | PASS | `mvn verify`: Tests run: 4, Failures: 0 |
| DatabaseConstraintsIT (6) | PASS | Testcontainers postgres:17 |
| PublicPropertyIT (8) | PASS | |
| EnquiryAndLeadFlowIT (12) | PASS | incl. idempotency, consent row, shared phone, rate limit, per-visitor rate limit (new), 401/403/404 isolation |
| SecurityIT (5, new) | PASS | forged/alg=none JWT → 401, security headers, CORS allow-list, injection strings, no internals in errors, non-UUID Idempotency-Key → 400 |
| `npm install` (generated the first `package-lock.json`) | PASS | no lockfile existed before; `npm ci` is now possible |
| `npm audit --omit=dev` | PASS | 0 vulnerabilities in production deps |
| `npm audit` (dev deps) | FAIL (accepted, tracked) | 1 critical, 1 moderate, 1 more in vitest 3 → tinypool / @vitest/mocker. Fix requires the vitest 4 major; not done blindly (D-019) |
| `tsc --noEmit` | PASS | `node node_modules/typescript/bin/tsc --noEmit` |
| Vitest (`api.test.ts`, 3) | PASS | after fix F5 |
| `next build` | PASS | `NEXT_BUILD_CPUS=2 node node_modules/next/dist/bin/next build` (all 11 routes) |
| Playwright `enquiry.spec.ts` (mobile + desktop, 4) | PASS | against the running API (local) + `next start` |
| Business-flow script (19 checks) | PASS | `python infra/local/scripts/validate_business_flow.py` → 19/19 (real Keycloak tokens for employee1/employee2/director) |
| Keycloak realm import + token → API user mapping | PASS | after fix F7 (ids aligned with seed) |
| Actuator health on 8081 (and not on 8080) | PASS | `curl :8081/actuator/health` → UP; `:8080/actuator/health` → 404 |

### Slice 2: customer Google sign-in (mock) + WhatsApp OTP (mock)
| Suite | Status | Command / evidence |
|---|---|---|
| CustomerIdentityIT (8) | PASS | service credential required (bearer refused on /internal), first login creates profile, re-login no duplicate + last_login updated, non-`mock-` subjects refused, OTP verify, wrong-code counting, 5-attempt lock, resend cooldown, requests need verified WhatsApp, separate leads + consents, CRM visibility, contact actions, communication + follow-up |
| ArchitectureTest rule `customers.internal` private | PASS | |
| Playwright `customer-signup.spec.ts` (mobile + desktop, 6) | PASS | full journey in a browser: Continue with Google → mock chooser → profile → WhatsApp OTP → site visit request → sign out → sign in → same CUS- ref; HttpOnly + SameSite=Lax cookie not readable by JS; cross-origin logout → 403 |
| Signup validation script (25 checks) | PASS | `python infra/local/scripts/validate_customer_signup.py` → 25/25 |
| Real Google sign-in (`mode=google`) | NOT RUN / BLOCKED | needs an approved Google OAuth client (project, consent screen, redirect URI). Code path exists (`GoogleIdTokenVerifier`, BFF code exchange with PKCE + nonce) but **has never run** |
| Real WhatsApp OTP | BLOCKED | no provider adapter exists; needs the WhatsApp Business account, a BSP and an approved authentication template (PENDING #6, #19) |

### Totals of executed automated tests (final run)
`mvn verify`: **43 tests, 0 failures** (4 ArchUnit + 39 integration). Vitest: **3/3**. Playwright: **10/10**. Scripts: **19/19** and **25/25**.

### Not run
| Item | Status | Reason |
|---|---|---|
| `docker compose --profile apps up --build` (API/web images) | NOT RUN | host memory exhausted during the session; the web Dockerfile was fixed statically (missing `public/`, `npm ci`) but the images were never built |
| `.github/workflows/ci.yml` on GitHub | NOT RUN | folder is not a git repository / no remote. Workflow validated with `actionlint 1.7.7` (0 findings); its steps were run locally as listed above |
| Visitor IP forwarding web → API, end to end | NOT RUN (partially verified) | API side verified by `rateLimitIsPerVisitorWhenForwardedByTheWebServer`; locally browser and Next share 127.0.0.1, so the browser→Next→API hop cannot be distinguished |
| Load, ZAP, accessibility (axe), Lighthouse, SEO | NOT RUN | staging-phase work |
| OpenAPI contract tests | NOT RUN | spec linted (`redocly lint` → valid) but not checked against responses automatically |

## 3. Failures found and fixed
| # | Failure (actual output) | Fix |
|---|---|---|
| F1 | `PublicPropertyController.java:[101,17] local variables referenced from a lambda expression must be final` | collect the query result into a new list instead of mutating a captured variable |
| F2 | `package org.springframework.boot.test.autoconfigure.web.servlet does not exist` | Boot 4 moved it: `org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc`; Testcontainers 2: `org.testcontainers.postgresql.PostgreSQLContainer` |
| F3 | `FATAL: invalid value for parameter "TimeZone": "Asia/Calcutta"` (Windows JVM default zone rejected by PG 17) | server runs in UTC (`main()`), `-Duser.timezone=UTC` for surefire/failsafe/spring-boot:run |
| F4 | `*IT` tests silently skipped by `mvn verify` | bound `maven-failsafe-plugin` |
| F5 | 16 IT failures, 500 `Could not open JDBC Connection` | `@Container` in abstract base stopped after first class while Spring's cached context kept its URL → singleton container |
| F6 | `expected: <1> but was: <12>` audit count | test counted global rows; scoped to the created lead |
| F7 | Keycloak realm user ids `11111111-…` ≠ seed `external_subject` `00000000-…0101` → staff tokens map to no user | realm ids aligned with seed |
| F8 | malformed JSON / non-UUID `Idempotency-Key` → **500** | `ProblemHandler` extends `ResponseEntityExceptionHandler` (framework 4xx keep their status, generic body) |
| F9 | site-wide enquiry throttling: all website enquiries reach the API from the Next server IP (10/hour shared) | server action forwards visitor IP (`X-Forwarded-For`); API test proves separate buckets |
| F10 | `vitest` `ERR_REQUIRE_ESM` loading `vitest.config.ts` | renamed to `vitest.config.mts` (the package is not ESM) |
| F11 | `next build`: "You are using Node.js 18.20.8" | environment: ancestor `C:\Users\Dell\node_modules\.bin\node`; tools invoked with the system Node (README) |
| F12 | Docker Desktop crash / `insufficient memory for the Java Runtime` / Node `heap out of memory` / `paging file is too small` | Keycloak heap 512 MB, API `-Xmx448m`, test forks `-Xmx768m`, `NEXT_BUILD_CPUS=2`; Keycloak stopped during the web build |
| F13 | `Detected resolved migration not applied to database: 9` (seed is V1000) | `spring.flyway.out-of-order: true` in `local` only (D-015) |
| F14 | `director sees all leads` failed once more leads existed (page-1 assumption) | assert by id + per-assignee presence |
| F15 | `dictionaries.ts` duplicate key `verified` (TS1117) | renamed to `numberVerified` |
| F16 | `redocly lint`: 10 errors (`nullable` invalid in 3.1, public ops without `security: []`) | `type: [x, "null"]`, `security: []` |

## 4. Side effect to report (investigated in the follow-up)
While running two shell commands in parallel early in the session, `npm install` executed from `UnnaVora\services\api`, which has no `package.json`. npm walked up to **`C:\Users\Dell`** (an unrelated `first_node_project`). All later commands were run sequentially with absolute paths.

Investigation (read-only, from npm's own debug log `2026-11-07T06_45_23_556Z-debug-0.log`):
- **Removed:** `node_modules/node/node_modules/node-win-x64@18.20.8` and `node_modules/node/node_modules/node-bin-setup@1.1.4`. These are install-time helper copies placed by the `node@18` package's preinstall script, and are not part of the project's lockfile.
- **Rewritten:** `C:\Users\Dell\package-lock.json` (12:15:32 IST). No earlier copy exists, so byte-identity cannot be proven. Its dependency entries match the unchanged `package.json`.
- **Unchanged:** `package.json` (Dec 2025). `node_modules/node/bin/node.exe` still runs v18.20.8.
- **Read-only check:** `npm ls --prefix C:\Users\Dell --depth=0` → exit 0 (dotenv 16.4.5, jest 29.7.0, mongoose 8.5.0, node 18.20.8, pg 8.16.3). No missing or invalid packages.
- **Backup** (made before anything else, outside both projects): `C:\Users\Dell\Backups\first_node_project-2026-11-07\`, with package.json, package-lock.json, the nested lock, the npm debug log, SHA256SUMS.txt and README.txt.
- **Verdict:** no functional restoration is needed. For an exact restore of the two helper copies, the owner can run `npm rebuild node` in `C:\Users\Dell`. **Not done**, because it modifies that project.
- **Re-check before any rebuild (read-only):** backup checksums OK; current `package.json`, `package-lock.json` and the nested lock are byte-identical to the backup. Both helpers are confirmed missing. Manifest and lockfile are consistent (`npm ls --all` exit 0). `npm rebuild node` would re-download `node-win-x64` and the newest `node-bin-setup` 1.x and rewrite files inside `node_modules\node`, and the next `npm install` there would prune them again.
- **Owner decision (2026-11-07):** leave `C:\Users\Dell` unchanged, do not run `npm rebuild node`, keep the verified backup. UNAVORA work uses the documented Node 24 commands (`node node_modules\…`) and never runs npm in `C:\Users\Dell` (DECISION_LOG D-023).

## 7. Follow-up session (2026-11-07, isolation and Windows commands)
| Check | Status | Evidence |
|---|---|---|
| Container status | done | at check time: `unavora-postgres`, `unavora-keycloak`, `unavora-mailpit` up (restarted outside this session); `dharmstay-postgres-local/-dev`, `redis`, `office-link-*` exited except `office-link-frontend` (restart policy unless-stopped). None of the other projects' containers were started, stopped, modified or deleted |
| Minimum services | done | stopped `unavora-keycloak` (559 MB) and `unavora-mailpit`; only `unavora-postgres` (43 MB) left running |
| Isolation guard: `npm install` from `services\api` | PASS | fails with "UNAVORA: run npm inside apps/web"; SHA-256 of `C:\Users\Dell\package-lock.json` unchanged before and after. The stray empty root lockfile it left was deleted, and the path is now git-ignored |
| `turbopack.root` pinned to `apps/web` | PASS | `next build` passes; the "ignored package-lock.json in C:\Users\Dell" warning no longer appears |
| PowerShell 5.1.22621 command forms | PASS (spot-checked) | `& $mvn -v`, `docker compose ps`, `node node_modules\typescript\bin\tsc --noEmit` (exit 0), `node node_modules\vitest\vitest.mjs run` (3/3). Server-start and `Invoke-RestMethod` lines were not re-run in this follow-up (same commands as the Git Bash runs above) |
| Earlier results (§2) | preserved (see also §8) | no application or test code changed in the follow-up except `next.config.ts` (`turbopack.root`), re-verified by `next build` |

## 5. How to reproduce
See README "Tests". The logs from this session are in the session scratchpad and are not committed.

## 6. Known environment issues on this PC
- Node shadowing by `C:\Users\Dell\node_modules\.bin\node` (v18) inside `npm run`.
- About 8 GB is held by two VMs (`vmmem`, `vmmemWSL`). The commit limit is reached with the full stack, a JVM and a Next build running together.

## 8. GitHub preparation (2026-11-07)
| Check | Status | Evidence |
|---|---|---|
| Git repository | done | `git init -b main` (local only). **Nothing committed or pushed** — awaiting owner approval |
| Generated files removed | done | 4 JVM out-of-memory dumps `hs_err_pid*.log` (one was inside `src/main/resources` and would have been packaged into the jar), `infra/local/scripts/__pycache__/` |
| `.gitignore` hardened | done | adds crash/log files, `__pycache__`, `next-env.d.ts`, keys/certs (`*.pem`, `*.key`, `*.p12`, `*.jks`…), Google/OAuth credential JSON (`client_secret*.json`, `credentials*.json`, `service-account*.json`), DB dumps/backups, `/exports/`, `/backups/`. `.env` / `.env.*` were already excluded. `.gitattributes` normalises to LF |
| Staged content | 113 files, ~575 KB | excluded on disk: `node_modules`, `.next`, `target`, `test-results`, `tsconfig.tsbuildinfo`, `next-env.d.ts` |
| Secret scan, staged content | PASS | `gitleaks v8.21.2 dir` on an exact export of the index: first run 1 finding (the intentional unsigned `alg=none` test JWT in `SecurityIT.java`, now marked `// gitleaks:allow`), re-run **no leaks found** |
| Credential patterns (AWS, private keys, Google `GOCSPX-`/`AIza`, Razorpay, Stripe, GitHub, Slack, Meta) | PASS | none found |
| Remaining credential-like values | reviewed, accepted | throw-away local values only: `*_local_dev_only` (compose/.env.example), Keycloak dev realm passwords + `web-bff-local-dev-secret`, `local-dev-…-not-a-secret`, `test-…` in the test profile. Staging/production profiles have no defaults |
| Personal data | reviewed | customers are synthetic (`@example.test`, `+9199999000xx`). Company public contact data from the mock-up (director name, `+918318377108`, `info@anantinfrarealty.com`, stale address in docs) is in V8/docs, `verified=false` — owner to confirm it may live in a private repo |
| CI workflow fixes | done | e2e job now sets `CUSTOMER_AUTH_MODE=mock` + local `INTERNAL_SERVICE_TOKEN` (without them `customer-signup.spec.ts` would fail on GitHub); dropped unused `mailpit`; new `secrets` job (gitleaks over full history). `actionlint 1.7.7`: 0 findings |
| Lockfile has Linux native packages | PASS | `@next/swc-linux-x64-gnu`, `lightningcss-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-gnu`, rollup, esbuild, sharp all present |
| Linux rehearsal of the web job (`node:22` container) | BLOCKED | Docker Desktop restarted under memory pressure during `npm ci` (`error waiting for container: unexpected EOF`, exit 125). Not retried; the first GitHub run will be the first Linux run |
| Test sources after `SecurityIT` comment edit | PASS | `mvn test-compile` |

### 8.1 Final pre-commit checks (owner request, 2026-11-07)
| Check | Status | Evidence |
|---|---|---|
| Obsolete personal email removed | done | removed from `V8__reference_data.sql` (comment), `CONTENT_AND_ASSET_REGISTER.md`, `PENDING_BUSINESS_CONFIRMATIONS.md`; 0 occurrences in the staged files. Intended company email `info@anantinfrarealty.com`, `verified=false` until business confirmation |
| Local DB after the V8 comment change | PASS | Flyway CLI 11.14.1 (same version as the app): `repair` updated the V8 checksum only (2137036268 → 1336322144, no SQL re-run); `validate` → "Successfully validated 10 migrations". Fresh databases (tests, CI) are unaffected |
| Director name / company phone | NOT VERIFIED | from the owner-supplied *Website Blueprint (Updated)* PDF, "Get in Touch" page; stored `verified=false`; no independent approval on record (PENDING #2/#3/#6). Awaiting owner confirmation |
| Local credentials | reviewed | all throw-away and local-only: `unavora_local_dev_only`, `admin_local_dev_only`, `minio_local_dev_only`, Keycloak dev users `*-local-1`, `web-bff-local-dev-secret`, `local-dev-…-not-a-secret`, `test-…` (test profile). Staging/production YAML: every secret is `${VAR}` with **no default**. Keycloak realm file is mounted only by the local compose file; staging/production use Cognito |
| Real API keys / OAuth secrets / private keys / live payment keys / remote JDBC URLs | PASS (none) | pattern search over the exact staged export; the only match was this document's own list of searched prefixes |
| Personal data | PASS | emails only `@example.test` plus the company address; phone numbers are the company number and dummy test fixtures |
| gitleaks v8.21.2 on final staged export | PASS | "no leaks found", exit 0 |

## 9. First GitHub CI run and fix (2026-11-07)
Baseline `b8d4fdd` pushed to the private repository `Markandey2002/unavora-platform` (owner-approved). CI run #1:

| Job | Result |
|---|---|
| Secret scan (gitleaks, full history) | PASS (9 s) |
| Web (typecheck, unit, build, prod audit) on Linux | PASS (32 s), the first Linux run of the web job |
| API (`mvn verify`) on Linux | **FAIL**: 35/39 ITs passed; 4 errors in `CustomerIdentityIT`: `StringIndexOutOfBoundsException: Range [5, 13) out of bounds for length 11` |
| End-to-end | skipped (needs API) |

**Cause:** a test-only bug. Unique test phone numbers were built with `String.valueOf(System.nanoTime()).substring(5, 13)`. `nanoTime()` is an arbitrary timer whose length differs by OS and uptime (long on the Windows PC, 11 digits on the fresh Linux runner). **Fix:** `uniquePhone(prefix)` = prefix + 8 random digits (`%08d`), so the length is independent of platform. Also made the Playwright test phone unique per parallel project (mobile/desktop) to avoid a cross-project OTP mix-up. GitHub Actions bumped off the deprecated Node 20 majors (checkout v7, setup-java v6, setup-node v7, upload-artifact v7, download-artifact v8; tags checked with `git ls-remote`). Re-check: `mvn verify` 43/43 PASS (Windows), `tsc` PASS, `actionlint` 0 findings. Linux confirmation = CI run #2.

**CI run #2 on `2814c52`: all 4 checks passed on GitHub (Linux)** (screenshot from the owner): Secret scan 6 s, Web 35 s, API (unit + Testcontainers, 43 tests) 1 min, End-to-end (Docker Postgres + Keycloak, API, web, Playwright mobile+desktop, both business-flow scripts) 2 min. This is the first successful Linux run of every job. Afterwards the superseded `infra/ci/github-actions-ci.yml` was removed.

## 10. Slice 3: Staff and Director CRM dashboards (2026-11-07, commit `5624342`, CI green)
Precondition: CI run #3 on `7a2ea1a` green (owner screenshot) before coding started.

| Suite | Status | Evidence |
|---|---|---|
| Keycloak spike: director TOTP + proof in token | PASS | `dev-cli` grant: director without/with wrong code → 401; with TOTP → `amr: ["pwd","otp"]`; employee → `amr: ["pwd"]`. Needed custom browser/direct-grant flows with AMR references (`maxAge` 43200; `0` made references expire immediately, found by disassembling Keycloak 26.0.8 `AmrUtils`). Same code twice in one 30 s window → rejected (Keycloak replay protection, expected) |
| Flyway V10 (requires_mfa, staff_auth_requests, auth_methods) | PASS | applied out-of-order on the existing local DB; fresh in Testcontainers |
| `mvn clean verify` | **PASS 60/60** | 5 ArchUnit (new: identity.internal private) + 55 ITs, incl. **StaffSessionIT 16/16**: PKCE S256 challenge = SHA-256 of server-held verifier, verifier never in URL; service credential required; employee password-only session (12 h); **director without OTP → 403 `mfa_required`, no session row, audit `staff.login_denied`**; director with OTP → 8 h session, company-wide data; director session whose MFA flag is missing → 401 on every request; **director bearer JWT without `otp` → 403**; not-invited / `invited`-status users → `not_invited`; state single-use, nonce must match, expired request rejected; logout revokes; idle + absolute timeouts; disabled user's sessions end immediately; sessions vs bearer tokens not interchangeable; employee isolation (leads, timeline, customers, overview 403); follow-ups owner-only |
| Web `tsc`, Vitest 3/3, `next build` | PASS | 9 new staff routes (+3 `/_bff/staff/*`) |
| **Playwright 26/26** (real Keycloak in the browser) | PASS | existing 10 + **staff.spec.ts 16** (8 × mobile/desktop): unauthenticated redirect; employee sign-in/own leads only/no director link/foreign lead "not found"/overview not permitted/sign-out; **cookie HttpOnly + SameSite=Lax + Path=/, not in `document.cookie`, no IdP tokens in browser, replayed cookie after sign-out → `session_expired`**; cross-origin logout → 403; outsider (Keycloak user, not invited) refused, no cookie; **director: OTP demanded, wrong code rejected, fresh TOTP accepted → MFA badge, company-wide leads, overview KPIs**; full CRM workflow (lead → tel:/wa.me actions → customer → log call linked to lead → follow-up → My follow-ups → mark done → lead timeline); Hindi staff page |
| Business-flow script | PASS 19/19 | director token now obtained with TOTP |
| Customer-signup script | PASS 25/25 | |
| `actionlint` on updated `ci.yml` | PASS | step names only; e2e already waits for Keycloak before Playwright |
| GitHub CI on the Slice 3 commit | **PASS** | commit `5624342` pushed with owner approval; CI run #4 all 4 jobs green (owner confirmation): secret scan, API 60 tests, web build, end-to-end incl. Playwright 26 with real Keycloak TOTP and both flow scripts |

Fixed during Slice 3: text-block concatenation `:meRETURNING` in follow-up completion (500 for employees); test asserted a mock-only URL parameter (now checks S256 against the stored verifier); **API failed to start in the `local` profile because the staff issuer defaulted only to an unset `OIDC_ISSUER_URI`** (now defaults to the resource-server issuer); Playwright locator ambiguous with Next's hidden route announcer; Playwright pinned to 1 worker so mobile/desktop director logins never reuse a TOTP window; repeated shell cwd race when starting two background servers in parallel (started sequentially).

## 11. Slice 4: complete real-estate lead workflow (2026-11-07, uncommitted)
Precondition: working tree clean at `7a43f9e`; CI for `7a43f9e` green (owner confirmation) before coding.

| Suite | Status | Evidence |
|---|---|---|
| Flyway V11 (lead workflow) + V12 (IdP logout hint) | PASS | applied out-of-order on the existing local DB; fresh in Testcontainers |
| `mvn clean verify` | **PASS 79/79** | 5 ArchUnit + 74 ITs, incl. **LeadWorkflowIT 19/19** (below) and the updated StaffSessionIT 16/16 |
| LeadWorkflowIT: migration / DB rules | PASS | trigger refuses Lost/Invalid history without reason; duplicate open follow-up refused by unique index (case-insensitive title); completion before scheduled time refused by CHECK; `visit.manage_all` granted to director only |
| LeadWorkflowIT: stage transitions | PASS | assigned→contacted→qualified with history (from, to, actor, time), audit, timeline, outbox, `first_contacted_at`; disallowed jump → 422; same stage → 409; unknown → 422; Won → 422 `won_requires_deal`; Lost needs reason code, `other` needs note; Invalid needs note; stale `expectedVersion` → 409; reopen needs `lead.reopen` (employee 403, director OK) |
| LeadWorkflowIT: permissions | PASS | employee 2 on employee 1's lead → 404 (stage, history); director company-wide; director bearer without OTP → 403; employees cannot assign or list assignees (403) |
| LeadWorkflowIT: reassignment + audit | PASS | reason required; invalid assignee 422; same assignee 409; row records previous, new, actor, reason, method; old row closed; `lead.reassigned` audit; open follow-up and upcoming visit moved; stage history unchanged; previous employee 404, new employee sees full history; new unassigned lead → manual assignment moves it to Assigned |
| LeadWorkflowIT: site visits | PASS | past >24 h / >180 days → 422; unavailable property → 422; employee scheduling for someone else → 403; conflict within 60 min → 409; lead auto → Site Visit Scheduled; director may assign to another employee; closed lead → 409; **complete/no-show before scheduled time → 409; time passing alone changes nothing**; completion stores feedback, interest, internal notes, next action, lead auto → Site Visit Completed; double completion → 409; reschedule/cancel need reasons; stale version → 409; other employee → 404; no-show after time |
| LeadWorkflowIT: follow-ups | PASS | on a visit with priority; duplicate 409; past due 422; for another employee 403 (director allowed); no target 422; other employee's lead 404; complete twice → 409 `already_completed` |
| LeadWorkflowIT: dashboards | PASS | employee dashboard (own stages, today's and upcoming visits, recent leads; other employee sees none of them); director overview (11 stages, leads by employee and stage, visit stats, conversion, workload); employee → 403 |
| Web `tsc`, Vitest 3/3, `next build` | PASS | new routes: `/staff/dashboard`, `/staff/visits`, `/staff/visits/[id]`, `/_bff/staff/signed-out` |
| **Playwright 34/34** (real Keycloak, director TOTP) | PASS | existing 26 + **lead-workflow.spec.ts 8** (4 × mobile/desktop): employee moves a fresh lead through Contacted/Qualified, Lost without reason refused in UI, Won not offered, schedules a same-day visit (lead auto-advances), completes it with feedback and internal notes (lead auto-advances), adds a high-priority follow-up, duplicate refused, sees it in My follow-ups and the dashboard; other employee gets "not found"; director (TOTP) reassigns with a reason, sees assignment and stage history and the overview (workload, conversion, visits, pipeline by employee); new employee has the lead and its follow-up, previous one does not |
| Business-flow script / customer-signup script | PASS 19/19, 25/25 | re-run against the Slice 4 build |
| OpenAPI 0.4.0 (`redocly lint`) | PASS | Slice 3 + Slice 4 staff endpoints documented |
| `actionlint` on `ci.yml` | PASS | step name only |
| GitHub CI on the Slice 4 commit `71803d8` | **FAIL** (API job; 78/79) | owner-supplied log: `EnquiryAndLeadFlowIT.employeeSeesOnlyOwnLeads` expected LEAD-LOCAL-1 on page 1 of employee 1's leads; on Linux the test classes ran in a different order, LeadWorkflowIT ran first and filled page 1 with ~20 new leads (isolation itself held: every listed lead belonged to employee 1). End-to-end job skipped as a consequence |
| Fix: paging-independent assertions | PASS locally | new `allLeads()` helper walks every page; the tests assert the actual rule (all listed leads belong to the caller / the filtered employee, LEAD-LOCAL-1 present, LEAD-LOCAL-2 absent) in EnquiryAndLeadFlowIT and StaffSessionIT (2 places). `mvn verify` 79/79 with `runOrder=alphabetical` and `runOrder=reversealphabetical` (the latter reproduces the CI order) |
| GitHub CI on `a31a742` | **FAIL** (end-to-end; API, web, secret scan PASS) | owner-supplied log: API 79/79 green on Linux; Playwright 30 passed, 1 failed, 3 not run (serial): desktop `lead-workflow` duplicate follow-up check. Cause: test bug, the second submission re-read the form's default due time ("now + 24 h" at render) after the redirect, which crossed a minute boundary on desktop, so it was not a duplicate and was correctly accepted. The duplicate rule itself worked (mobile run passed it) |
| Fix: fixed due time in the e2e test | PASS locally | due time chosen once and used for both submissions; full Playwright 34/34, then `lead-workflow.spec.ts` 8/8 again |
| GitHub CI on the e2e fix commit | NOT RUN | awaiting approval to commit/push |

Found and fixed during Slice 4:
- **Sign-out did not end the Keycloak single sign-on session**, so the next person on the same browser saw a re-authentication page locked to the previous user (Playwright caught it). Now OIDC RP-initiated logout: the API keeps the ID token server-side only as `id_token_hint` (V12), erases it on logout and returns the end-session URL; the BFF sends the browser through Keycloak and back via `/_bff/staff/signed-out`.
- **Staff sign-in rate limit (30 / 10 min / IP) was too low for an office behind one NAT** and was hit by repeated local test runs: now configurable, default 60, local profile 200.
- Slice 3 browser tests assumed the seeded lead is on page 1 of the paged list; they now open seeded leads by id (data grows with every local run; CI starts empty).
- A duplicate `updated_at` trigger in my first V11 draft (already present in V5) was removed before it ever ran; the `id_token_hint` column went to V12 because V11 had already been applied locally.
