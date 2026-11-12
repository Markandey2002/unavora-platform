// Broken link / image crawl of the public website (same origin only; staff and BFF routes are skipped).
//   node scripts/link-check.mjs <baseUrl> [maxPages=150]
// Follows <a href> from /en and /hi, records every page status, checks every <img> loaded, and HEAD/GETs
// external link targets once (reported, not followed). Exit code 1 when an internal link or image is broken.
import { chromium } from "@playwright/test";

const [base, max = "150"] = process.argv.slice(2);
const origin = new URL(base).origin;
const queue = [`${origin}/en`, `${origin}/hi`];
const seen = new Set(queue);
const broken = [];
const external = new Set();
let pages = 0;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
while (queue.length && pages < Number(max)) {
  const url = queue.shift();
  const res = await page.goto(url, { waitUntil: "networkidle" }).catch((e) => ({ status: () => `error ${e.message.slice(0, 40)}` }));
  pages++;
  const status = res?.status?.();
  if (status !== 200) { broken.push(`${status} page ${url}`); continue; }
  const info = await page.evaluate(() => ({
    links: [...document.querySelectorAll("a[href]")].map((a) => a.href),
    images: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && !i.loading?.includes("lazy")).map((i) => i.currentSrc || i.src),
  }));
  for (const img of info.images) broken.push(`image ${img} on ${url}`);
  for (const href of info.links) {
    const u = new URL(href);
    if (u.origin !== origin) { if (u.protocol.startsWith("http")) external.add(u.origin + u.pathname); continue; }
    if (/^\/(_bff|_next|api)\//.test(u.pathname) || /\/staff(\/|$)/.test(u.pathname)) continue;
    u.hash = "";
    const key = u.toString();
    if (!seen.has(key) && !/[?&](page|cursor)=/.test(u.search)) { seen.add(key); queue.push(key); }
  }
}
// external targets: report status only (some sites refuse automated requests; these are informational)
const ext = [];
for (const e of external) {
  try {
    const r = await fetch(e, { method: "HEAD", redirect: "follow" });
    if (r.status >= 400) ext.push(`${r.status} ${e}`);
  } catch (err) { ext.push(`unreachable ${e}`); }
}
await browser.close();
console.log(`crawled ${pages} pages, ${seen.size} internal URLs seen, ${external.size} external targets`);
console.log(broken.length ? `BROKEN (internal):\n  ${broken.join("\n  ")}` : "internal links and images: all OK");
if (ext.length) console.log(`external (informational):\n  ${ext.join("\n  ")}`);
process.exit(broken.length ? 1 : 0);
