# MOBILE_UX_REVIEW.md — mobile audit from the 2026-11-13 recording and corrections (uncommitted)

Source: `C:\Users\Dell\Videos\Screen Recordings\Screen Recording 2026-11-13 190755.mp4` (49.3 s, 452 × 896 px; read only).
16 frames extracted at even intervals: `docs/ui-review/mobile/before/video-frames-00-23s.jpg`, `video-frames-26-48s.jpg`.

**Important context:** the recording was made in a *desktop* Chrome window narrowed to 452 px (Windows taskbar and
mouse pointer visible). With Windows display scaling (≈ 125 %), the page's CSS viewport was ≈ 346 px — below the 360 px
breakpoint where the old header switched to the small monogram — and desktop Chrome draws classic scrollbars inside
horizontal scrollers, which phones do not. Both effects are fixed for real phones *and* narrow desktop windows.

## 1. Observations (timestamps from the recording)

| Time | Observation | Severity |
|---|---|---|
| 1.5 s, 29.3 s | Header shows only the small UA monogram — brand unreadable | High |
| 1.5–4.6 s | New launches row: clipped next card, `[SAMPLE]` project (local data) | Medium (sample = local only) |
| 7.7–10.8 s | Featured row: visible scrollbar track + arrows, clipped cards | High |
| 13.9–23.1 s | Property detail: price/Call/Enquire bar stays over the enquiry form while typing and near "Send enquiry" | High |
| 26.2 s | The same bar stays visible over the footer | Medium |
| 32.4–35.4 s | Category chips and showcase cards show scrollbar tracks | Medium |
| 38.5 s | "Why UNAVORA": very tall cards, large gaps | Low |
| 41.6 s | Insights shows a `[SAMPLE]` article | Info — local synthetic data, hidden in production (`is_sample`); no E2E article is public |
| 44.7 s | Contact form readable, labels visible | OK |
| 47.8 s | Footer: accordions fine, brand correct, phone `+91 83183 77108`, verified e-mail `info@anantinfrarealty.com` | OK (new mailbox stays pending until verified) |

## 2. Fixes

| Issue | Fix | Where |
|---|---|---|
| Sticky action bar overlaps | New `StickyActionBar`: hidden (slid away + `inert`) while the enquiry form or the footer is on screen, while any input/select/textarea has focus, and while the on-screen keyboard is open (visual viewport shorter by > 150 px); bottom padding includes `env(safe-area-inset-bottom)`; shown only on property detail pages, below 1024 px | `components/site/StickyActionBar.tsx`, `properties/[slug]/page.tsx` |
| Sample price in the bar | Sample listings (local/test only) show "Sample data" instead of a price; production has no samples | same |
| Scrollbars / clipped rows | One `Carousel` for New launches, Featured and Explore property styles: track owns its overflow, `scrollbar-width: none`, scroll snap, `touch-action: pan-x pan-y`, `overscroll-behavior-x: contain`, ~15 % peek of the next card, **dots on phones** (tap to jump, `aria-current`), arrows from 640 px, focusable track (arrow keys), mouse drag; category chips hide their scrollbar | `components/site/Carousel.tsx`, `HomeView.tsx`, `ShowcaseSection.tsx` |
| Unreadable phone header | Below 640 px: UA monogram + live-text lockup "UNAVORA ANANT / REAL ESTATE" in the logo's green; full logo from 640 px; menu button 44 × 44 px | `components/site/Logo.tsx`, `lib/brand.ts` |
| Badge clutter on project cards | Status (+ local sample flag) on the photo; category moved into the card text; location wraps instead of clipping | `components/site/ProjectCard.tsx` |
| Tall "Why" cards | Phones: number beside the title, 20 px vertical padding, no decorative rule; body text size unchanged | `HomeView.tsx` |
| Duplicate tagline in hero | Eyebrow = brand name, headline = tagline | `HomeView.tsx` |
| **Phone menu drawer clipped to 72 px** (found in the browser review after the recording: the sticky header's `backdrop-filter` makes it the containing block for the drawer's `position: fixed`, so the menu opened with its links invisible) | Drawer rendered through a portal to `<body>`; `keyboard.spec.ts` now asserts the drawer fills the screen and its links are in view | `components/site/HeaderClient.tsx`, `e2e/keyboard.spec.ts` |
| Contact page 36 px overflow at 320 px | Grid column made shrinkable (`grid-cols-1`, `min-w-0`) | `contact/page.tsx` |
| Staff header logo squeezed at ≤ 390 px | Logo never shrinks; header wraps | `Logo.tsx`, `staff/layout.tsx` |
| Showcase CMS list overflow on phones | Row wraps | `staff/(crm)/content/showcase/page.tsx` |

Already correct (verified, unchanged): form inputs 16 px (`text-base`, no iOS zoom), labels always visible, checkbox
labels clickable, enquiry and marketing consent separate, footer accordion rows ≥ 44 px, phone display/`tel:` format,
only verified contacts and configured social links shown, New launches / search use approved records only in
production (samples local), showcase cards link only to *published* real records.

## 3. Verification (local standalone build, Playwright Chromium; `mobile-check.mjs`)

Routes: home, listing, property detail, New launches, About, Contact, List your property, Channel partner, Insights,
account. Widths: 320, 360, 375, 390, 430, 452 (phone emulation, touch) and 768, 1024, 1280, 1440, 1920.

| Check | Result |
|---|---|
| Page horizontal overflow (`scrollWidth - innerWidth`) | **0 on all 110 route × width combinations** |
| Horizontal scrollers without `scrollbar-width: none` (tables excepted) | **0** |
| Header overflow | **0**; phone lockup visible below 640 px |
| Sticky bar at 320–452 px | visible at top → hidden over the form → hidden while a field is focused → back after blur → hidden at the footer (**all 6 phone widths**) |
| Carousel dots on phones | present (3 carousels on the home page) |
| Browser back / forward (home ↔ listing) | OK at every phone width |
| Brand check (`brand-shots.mjs`, 6 widths, 12 screens incl. account + director CMS) | 0 old brand strings/files, 0 distorted logos, 0 overflow |
| Unit tests (Vitest) | 17/17 (incl. `brand.test.ts`) |
| Playwright full suite (desktop + mobile) | first run 77 passed / 3 failed: two failures were a real carousel bug (render loop blocking clicks) — **fixed**; one was the logo assertion on phones — **updated**; re-run of the affected specs: all passed except one timing failure in the new-launch journey under parallel load, which **passed 7/7** when its file was re-run |
| API (`mvn verify`, incl. V20) | 104/104 |

Screenshots (390 px): `docs/ui-review/mobile/1-home-initial-390.jpg` … `9-account-390.jpg` — home first screen, New
launches carousel, property detail with the bar, enquiry form with the bar hidden, detail footer, category carousel,
contact form, footer, customer account.

## 4. Limitations / not done
- Tested with Chromium device emulation only; **no physical Android/iPhone** test was possible from this machine (keyboard
  detection uses the Visual Viewport API, supported by iOS Safari and Chrome Android — please check on a real phone).
- The user-supplied mock-up headline ("Find a place that feels like home.") was not adopted: it is new marketing copy that
  needs owner approval; the hero uses the approved tagline.
- Two locally published "E2E Launch …" test projects (left by failed test runs) are still visible in the local New
  launches row; the local cleanup script (archives, never deletes) needs your go-ahead to run. Not present in production.
- The sample-data badges and `[SAMPLE]` titles appear only locally by design.

_Note 2026-11-14: the public phone is now **+91 91941 19150** (`tel:+919194119150`); mentions of +91 83183 77108 above describe the state at the time._
