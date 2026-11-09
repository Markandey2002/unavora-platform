// Captures UI review screenshots of the public site from a running local stack.
//   node scripts/ui-screens.mjs <output-folder> [baseUrl]
// Pages: home, listing, one property detail; widths: 320, 375, 390, 430 (phones), 768 (tablet), 1440 (desktop).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const out = process.argv[2];
const base = process.argv[3] ?? "http://localhost:3000";
if (!out) { console.error("usage: node scripts/ui-screens.mjs <output-folder> [baseUrl]"); process.exit(1); }
mkdirSync(out, { recursive: true });

const widths = [320, 375, 390, 430, 768, 1440];
const pages = [
  ["home", "/en"],
  ["home-hi", "/hi"],
  ["listing", "/en/properties"],
  ["detail", "/en/properties/sample-3bhk-apartment-sector-37-noida"],
  ...(process.env.UI_ALL ? [
    ["about", "/en/about"], ["residential", "/en/residential"], ["plots", "/en/plots"],
    ["projects", "/en/projects"], ["project-detail", "/en/projects/sample-gomti-greens-residences"],
    ["channel-partner", "/en/channel-partner"], ["contact", "/en/contact"], ["privacy", "/en/privacy"],
    ["not-found", "/en/no-such-page"], ["contact-hi", "/hi/contact"],
  ] : []),
];
const only = (process.env.UI_WIDTHS ?? "").split(",").filter(Boolean).map(Number);

const browser = await chromium.launch();
try {
  for (const w of only.length ? only : widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    for (const [name, path] of pages) {
      if (!["home", "listing", "detail"].includes(name) && w !== 390 && w !== 1440) continue;
      await page.goto(base + path, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: join(out, `${name}-${w}.png`), fullPage: true });
      console.log(`${name}-${w}.png${overflow > 0 ? `  HORIZONTAL OVERFLOW ${overflow}px` : ""}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
