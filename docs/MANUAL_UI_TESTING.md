# MANUAL_UI_TESTING.md

Step-by-step browser testing of the CRM lead workflow (Slices 3–4) on the **local** stack, using synthetic data.
Each test lists the exact URL, what to do, and what you should see. Mark each one PASS / FAIL as you go.

Everything here is fictional and local. No real customer data, no real Google, WhatsApp, e-mail or SMS: notifications
are written to the local `outbox_events` table and never sent.

---

## 1. Start the local stack (PowerShell)

Follow README "Windows (PowerShell 5.1)" steps 1–3 (PostgreSQL, API, web). For staff sign-in also start Keycloak:

```powershell
Set-Location C:\Users\Dell\UnnaVora
```
```powershell
docker compose up -d postgres keycloak
```
Wait until http://localhost:8180/realms/unavora-dev/.well-known/openid-configuration opens (30–60 s), then start the
API (terminal 1) and the web (terminal 2) as in the README. Only these three containers are needed:
`unavora-postgres`, `unavora-keycloak`, and nothing else.

## 2. Load (or reset) the manual-test data

Run from `C:\Users\Dell\UnnaVora` with PostgreSQL running and the API started at least once (so the tables exist):

```powershell
docker cp infra/local/manual-test-data.sql unavora-postgres:/tmp/manual-test-data.sql
```
```powershell
docker exec unavora-postgres psql -U unavora_local -d unavora -v ON_ERROR_STOP=1 -f /tmp/manual-test-data.sql
```

Expected last lines: `manual test data loaded | 8 | 17 | 9 | 9` (customers, leads, visits, follow-ups).

- **Run it again at any time to reset**: it deletes only its own records (references `CUS-MAN-…`, `LEAD-MAN-…`,
  `VIS-MAN-…`, including anything you changed on them) and recreates them with dates relative to now.
- **Run it during the day** (India time). "Today" and "overdue" are calculated when you run it; after about 22:00 IST
  the "today, in two hours" visit falls after midnight. Re-run it each morning you test.
- The script refuses to run on any database that is not the local UNAVORA one (it checks for the synthetic seed users).
- Leads created through the website (`LEAD-0000…`) are not touched.

## 3. Sign-in accounts (local Keycloak, synthetic)

| Role | Username | Password | Second step |
|---|---|---|---|
| Director | `director.local` | in `infra/local/keycloak/unavora-dev-realm.json` | 6-digit code, see below |
| Employee One | `employee1.local` | in the realm file | none |
| Employee Two | `employee2.local` | in the realm file | none |
| Not invited | `outsider.local` | in the realm file | (must be refused by the CRM) |

**Director code:** in a third terminal run

```powershell
python infra\local\scripts\director_totp.py
```

It prints the current code and how many seconds it stays valid. Each code works only once per 30-second window; if
sign-in fails, wait for the next code. To use a phone authenticator app instead, run it with `--setup` and add the
printed key as a time-based, 6-digit, 30-second key. (Synthetic local secret only. Never reuse it anywhere.)

**Switching user:** use **Sign out** (top right). It also ends the Keycloak session, so the next person must type their
password. Use a private window if you want two users signed in at once.

**Language:** replace `/en/` with `/hi/` in any URL (Hindi labels are drafts awaiting review).

**Lists show the newest first, 20 per page.** Leads created by the automated tests and validation scripts
("E2E Workflow Buyer", "Validation Customer", "Guide Check Buyer") are newer than the manual-test leads, so the
`LEAD-MAN-…` leads may be on a later page. Use **Next page**, the stage filter, or the direct URLs in section 4.

**Phone numbers in the data are fictional** (+91 99999 100xx). Do not tap Call/WhatsApp on a phone that could
really dial; the links are tested by checking their target only.

## 4. The data you will see

All `[SAMPLE]` properties, customers and leads are invented. Lead URLs are
`http://localhost:3000/en/staff/leads/40000000-0000-0000-0001-0000000000NN` where `NN` is the lead number.
Visit URLs are `http://localhost:3000/en/staff/visits/50000000-0000-0000-0001-0000000000NN`.

| Lead | Customer | Assigned to | Stage | What it is for |
|---|---|---|---|---|
| LEAD-MAN-01 | Rohan Mehta | nobody | New | director assigns it |
| LEAD-MAN-02 | Priya Verma | Employee One | Assigned | follow-up overdue by 2 h; move to Contacted |
| LEAD-MAN-03 | Arjun Nair | Employee One | Contacted | high-priority follow-up overdue by 1 day; recorded call |
| LEAD-MAN-04 | Rohan Mehta | Employee One | Qualified | schedule a new visit; follow-up due today |
| LEAD-MAN-05 | Priya Verma | Employee One | Site Visit Scheduled | VIS-MAN-01 tomorrow 11:00 |
| LEAD-MAN-06 | Arjun Nair | Employee One | Site Visit Scheduled | VIS-MAN-02 today, in 2 hours |
| LEAD-MAN-07 | Rohan Mehta | Employee One | Site Visit Scheduled | VIS-MAN-03 3 hours ago: complete or no-show |
| LEAD-MAN-08 | Priya Verma | Employee One | Site Visit Completed | VIS-MAN-04 completed yesterday; follow-up linked to the visit |
| LEAD-MAN-09 | Arjun Nair | Employee One | Negotiation | channel-partner lead; low-priority follow-up |
| LEAD-MAN-10 | Rohan Mehta | Employee One | Lost (No response) | VIS-MAN-08 was a no-show |
| LEAD-MAN-11 | Kavita Singh | Employee Two | Assigned | Hindi-speaking customer; Hindi follow-up |
| LEAD-MAN-12 | Imran Qureshi | Employee Two | Qualified | reassigned from Employee One by the director; VIS-MAN-07 cancelled |
| LEAD-MAN-13 | Meera Iyer | Employee Two | Site Visit Scheduled | VIS-MAN-06 in 3 days, 16:00 |
| LEAD-MAN-14 | Suresh Yadav | Employee Two | Booking in Progress | VIS-MAN-09 completed |
| LEAD-MAN-15 | Neha Gupta | Employee Two | Invalid | vendor test submission |
| LEAD-MAN-16 | Neha Gupta | Employee Two | Lost (Other + note) | director can reopen it |
| LEAD-MAN-17 | Suresh Yadav | nobody | New | second unassigned lead |

Properties: the 4 original `[SAMPLE]` listings plus 4 more (Lucknow 2 BHK, Noida furnished 2 BHK, Prayagraj office,
Lucknow plot). Employee Two owns the Lucknow listings and the Prayagraj office, so website enquiries on those go to
Employee Two automatically.

---

## 5. Test cases

Base URL: **http://localhost:3000**. "Lead 07" means
http://localhost:3000/en/staff/leads/40000000-0000-0000-0001-000000000007 (see section 4).

### A. Sign-in and access control

| # | Steps | Expected |
|---|---|---|
| A1 | Open `/en/staff/dashboard` without signing in | Redirected to the staff sign-in page |
| A2 | `/en/staff/login` → **Sign in with company account** → `employee1.local` + password | Lands on **Leads**; name shown at top; no "Director overview" link |
| A3 | As Employee One open `/en/staff/overview` | "You do not have permission to view this page." |
| A4 | As Employee One open Lead 11 (Employee Two's) | "Not found or not assigned to you." |
| A5 | As Employee One open http://localhost:3000/en/staff/visits/50000000-0000-0000-0001-000000000006 (Employee Two's visit) | "Not found or not assigned to you." |
| A6 | Sign out, then sign in as `director.local` + password; enter a **wrong** code `000000` | Keycloak asks for the code again |
| A7 | Enter the code from `director_totp.py` | Lands on Leads with the **2-step verified** badge |
| A8 | Sign out; sign in as `outsider.local` | Refused: "This account has not been invited to the CRM…" |
| A9 | Sign out and press the browser Back button | You are not signed in again (sign-in page or "signed out") |

### B. Stage changes and history (Employee One)

| # | Steps | Expected |
|---|---|---|
| B1 | Lead 02 → **Change stage**: Move to **Contacted** → **Change stage** | "Saved."; stage Contacted; Stage history gains "Assigned → Contacted" with your name and time; Timeline updated |
| B2 | Lead 02: open the **Move to** list | Only allowed next stages (Qualified, Lost, Invalid). **Won is never offered** |
| B3 | Lead 03: Move to **Lost** without choosing a reason → Change stage | Error "Choose why the lead was lost."; stage stays Contacted |
| B4 | Lead 03: Move to **Lost**, reason **Other**, empty note | Error "Add a note for this lost reason." |
| B5 | Lead 03: Move to **Lost**, reason **Price too high** | Saved; stage Lost; history shows the reason |
| B6 | Lead 03 (now Lost) as Employee One | No **Change stage** form: employees cannot reopen a closed lead (the API also refuses it). Only the director can (E8) |
| B7 | Lead 02 (Contacted): Move to **Invalid** without a note | Error "A reason is required."; stage unchanged |
| B8 | Open Lead 04 in two tabs. Change the stage in tab 1, then try a change in tab 2 | Tab 2: "Someone else changed this lead…" (no silent overwrite) |
| B9 | Lead 10 (Lost) and Lead 08: read **Stage history** | Full path from New, with reasons on the Lost step |

### C. Site visits (Employee One)

| # | Steps | Expected |
|---|---|---|
| C1 | `/en/staff/visits` | VIS-MAN-01, 02, 03 (and older ones under Past); none of Employee Two's (VIS-MAN-06) |
| C2 | Lead 04 (Qualified) → **Schedule site visit**: tomorrow 15:00, meeting point "Site office" → **Schedule** | "Saved."; new VIS-… under Site visits; lead moves to **Site Visit Scheduled** automatically |
| C3 | Lead 04: schedule another visit tomorrow 15:30 | Error "This employee already has a visit within an hour of that time." |
| C4 | Schedule a visit 2 days in the past, or 200 days ahead | Error "Choose a time from the last 24 hours up to 180 days ahead." |
| C5 | Open VIS-MAN-01 (tomorrow); fill Customer feedback → **Mark completed** | Page notes "Completion and no-show are available after the visit time."; submitting gives "A visit can be completed or marked no-show only after its scheduled time." |
| C6 | VIS-MAN-01 → **Reschedule** to the day after tomorrow 12:00 with a reason | Saved; new time shown; Visit history shows old → new time and the reason |
| C7 | VIS-MAN-02 → **Cancel visit** with a reason | Status Cancelled; reason in Visit history |
| C8 | VIS-MAN-03 (3 h ago) → **Mark completed**: feedback, Interest **High**, internal notes, next action | Status Completed; Lead 07 moves to **Site Visit Completed** |
| C9 | Reload VIS-MAN-03 after completing it | Complete / Reschedule / Cancel / No-show forms are gone: a closed visit cannot be changed |
| C10 | Re-run the data script, then VIS-MAN-03 → **Mark no-show** with a note | Status No-show; lead stage does **not** change automatically |
| C11 | Visit pages show times in India time (IST) | Times match what you entered |

### D. Follow-ups

| # | Steps | Expected |
|---|---|---|
| D1 | Employee One → **My follow-ups** (empty sections are hidden; late in the evening "Today" items fall into Upcoming) | Sections **Overdue** ("Call back about loan eligibility" – High, "First call to introduce the project"), **Today** ("Send floor plan and price sheet"), **Upcoming**; nothing of Employee Two's |
| D2 | Lead 04 → **Add follow-up**: title, due tomorrow 10:00, priority High | "Saved."; appears on the lead and in My follow-ups |
| D3 | Add exactly the same follow-up again (same title, due time) | "This follow-up already exists." |
| D4 | Add a follow-up due yesterday | "Choose a due time from now up to one year ahead." |
| D5 | VIS-MAN-04 page → add a follow-up | Shown on the visit and the lead (linked to the visit) |
| D6 | My follow-ups → **Mark done** on one item; then Back and Mark done again | First: Saved and it disappears; second: "This follow-up is already done." |
| D7 | Customer page (Lead 03 → **Open customer profile**) → **Log a call or WhatsApp contact** | Saved; listed under Communication history with "Recorded by staff" |

### E. Director: assignment and reassignment

| # | Steps | Expected |
|---|---|---|
| E1 | Director → Leads: filter **Assigned to: Unassigned** | LEAD-MAN-01 and LEAD-MAN-17 listed |
| E2 | Lead 01 → **Assign to** Employee One, reason "Noida buyer" → **Assign / reassign** | Saved; Assigned to Employee One; Assignment history row (from nobody → Employee One, by Director, reason) |
| E3 | Lead 05 → reassign to **Employee Two** with a reason | Saved; history "Local Employee One (synthetic) → Local Employee Two (synthetic)"; its open follow-ups and upcoming visit VIS-MAN-01 now belong to Employee Two; stage history unchanged |
| E4 | Sign in as Employee One, open Lead 05 by its URL; then as Employee Two | Employee One: "Not found or not assigned to you."; Employee Two can open it (and VIS-MAN-01 shows Employee Two) |
| E5 | Reassign to the same employee | "The lead is already assigned to this employee." |
| E6 | Reassign without a reason | "A reason is required." |
| E7 | Lead 12: **Assignment history** | Seeded reassignment Employee One → Employee Two with reason |
| E8 | Lead 16 (Lost) → Move to **Contacted** with a note | Director can reopen: stage Contacted, history keeps the Lost step |
| E9 | Employee One: no **Assign to** form on any lead | Assignment is director-only (the API also refuses it) |

### F. Dashboards

| # | Steps | Expected |
|---|---|---|
| F1 | Employee One → **Dashboard** | My leads by stage (Employee One's leads only), Today's site visits, Upcoming visits (7 days), follow-up counts (overdue / due today / pending), Recently updated leads |
| F2 | Do C2 or D2, then reload the dashboard | Counts/lists reflect the change |
| F3 | Director → **Director overview** | Totals, unassigned open leads, published properties (8), leads by stage, leads by employee and stage, site visits (completed / cancelled / no-show, 30 d), conversion, employee workload (open / overdue follow-ups, upcoming visits) |
| F4 | After E2/E3, reload the overview | Unassigned count and per-employee numbers change accordingly |

### G. Hindi and mobile

| # | Steps | Expected |
|---|---|---|
| G1 | Repeat B1, C2, D2 at `/hi/staff/...` URLs | All labels, buttons, errors and success messages in Hindi; data text (names, notes) as entered |
| G2 | Chrome/Edge: F12 → device toolbar (Ctrl+Shift+M) → 375 × 812 (phone) | Every page usable without sideways scrolling; buttons large enough to tap; forms stack in one column |
| G3 | Same at tablet width 768 px and desktop | Layout adapts; nothing overlaps |

### H. Website enquiry → CRM (end to end)

| # | Steps | Expected |
|---|---|---|
| H1 | http://localhost:3000/en/properties → open "[SAMPLE] 2 BHK family apartment, Gomti Nagar Lucknow" → send an enquiry (fictional name, phone like 9876500123, tick consent) | Confirmation with a LEAD-… reference |
| H2 | Sign in as Employee Two | The new lead is in Leads (Lucknow listing owner), stage Assigned |
| H3 | Employee One | Does **not** see that lead |

## 6. Optional: check the local "notifications"

Stage changes, assignments, visits and follow-ups write events to the local outbox (never sent anywhere):

```powershell
docker exec unavora-postgres psql -U unavora_local -d unavora -c "SELECT event_type, created_at FROM outbox_events ORDER BY created_at DESC LIMIT 10"
```

## 7. Finish

Sign out, stop the API and web with `Ctrl+C`, then free memory:

```powershell
docker compose stop keycloak postgres
```

Report failures with: test number, URL, user, what you did, what you saw (a screenshot helps).
