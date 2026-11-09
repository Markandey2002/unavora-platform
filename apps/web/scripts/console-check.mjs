// Prints browser console errors/warnings and failed requests for the given pages.
//   node scripts/console-check.mjs <baseUrl> <path> [<path> ...]
import { chromium } from "@playwright/test";

const [base, ...paths] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const issues = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") issues.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
page.on("pageerror", (e) => issues.push(`[pageerror] ${e.message.slice(0, 400)}`));
page.on("response", (r) => { if (r.status() >= 400) issues.push(`[http ${r.status()}] ${r.url()}`); });
for (const p of paths) {
  issues.push(`== ${p}`);
  await page.goto(base + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
}
console.log(issues.join("\n"));
await browser.close();
