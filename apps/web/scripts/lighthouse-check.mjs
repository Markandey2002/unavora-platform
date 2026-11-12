// Lighthouse lab audit (mobile and desktop presets) using Playwright's Chromium.
//   node scripts/lighthouse-check.mjs <baseUrl> <path> [<path> ...]
// Prints Performance / Accessibility / Best practices / SEO scores and LCP, CLS, TBT per page and form factor.
// Lab data only (simulated throttling on this machine); real-user Core Web Vitals need production traffic.
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const [base, ...paths] = process.argv.slice(2);
// Chromium is started by Playwright with a DevTools port that Lighthouse connects to (chrome-launcher cannot spawn here).
const PORT = 9333;
const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
const chrome = { port: PORT, kill: () => browser.close() };
const pct = (c) => (c?.score == null ? "  -" : String(Math.round(c.score * 100)).padStart(3));
console.log("form     path                                           perf a11y best  seo   LCP(ms)  CLS    TBT(ms)");
try {
  for (const form of ["mobile", "desktop"]) {
    for (const p of paths) {
      const r = await lighthouse(base + p, { port: chrome.port, output: "json", logLevel: "error",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"] }, form === "desktop" ? desktopConfig : undefined);
      const c = r.lhr.categories, a = r.lhr.audits;
      console.log(`${form.padEnd(8)} ${p.padEnd(46)} ${pct(c.performance)}  ${pct(c.accessibility)}  ${pct(c["best-practices"])}  ${pct(c.seo)}  `
        + `${String(Math.round(a["largest-contentful-paint"].numericValue)).padStart(7)}  ${a["cumulative-layout-shift"].numericValue.toFixed(3)}  ${String(Math.round(a["total-blocking-time"].numericValue)).padStart(7)}`);
      const failing = Object.values(a).filter((x) => x.score !== null && x.score < 0.9 && ["accessibility", "seo", "best-practices"].some((cat) =>
        r.lhr.categories[cat].auditRefs.some((ref) => ref.id === x.id && ref.weight > 0)));
      for (const f of failing.slice(0, 6)) console.log(`         - ${f.id}: ${f.title}`);
    }
  }
} finally {
  await chrome.kill();
}
