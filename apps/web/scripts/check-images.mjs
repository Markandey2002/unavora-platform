// Broken-image checker (local or any SITE): visits public pages, scrolls the page and every horizontal carousel so
// lazy images really load, then verifies each <img>: HTTP status of its request, that it DECODES, its natural size,
// its rendered size, and alt text. Also reports image requests that failed (status >= 400 / network error).
//   node scripts/check-images.mjs [baseUrl] [widths comma-separated]
// Exit code 1 when a real problem is found. "Tiny" images (natural size <= 4 px) are reported separately: they are
// test fixtures (1x1 PNGs uploaded by the end-to-end tests), not broken files.
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";
const WIDTHS = (process.argv[3] ?? "390,1440").split(",").map(Number);
const api = process.env.API_URL ?? "http://localhost:8080";
const j = (u) => fetch(u).then((r) => r.json()).catch(() => ({ items: [] }));
const prop = (await j(`${api}/api/v1/public/properties?lang=en&limit=1`)).items?.[0];
const proj = (await j(`${api}/api/v1/public/projects?lang=en&limit=1`)).items?.[0];
const city = (await j(`${api}/api/v1/public/locations?lang=en`))?.[0]?.city;
const PAGES = ["/en", "/en/projects", "/en/properties", "/en/residential", "/en/about", "/en/list-your-property", "/en/channel-partner",
  "/en/contact", "/en/insights", "/en/account", "/hi",
  ...(prop ? [`/en/properties/${prop.slug}`] : []), ...(proj ? [`/en/projects/${proj.slug}`] : []),
  ...(city ? [`/en/locations/${city.toLowerCase()}`] : [])];

const b = await chromium.launch();
const problems = [], tiny = [], summary = [];
for (const w of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 896 : 900 }, isMobile: w < 768, hasTouch: w < 768, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const failed = [];
  page.on("response", (r) => { if (r.request().resourceType() === "image" && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  page.on("requestfailed", (r) => { if (r.resourceType() === "image") failed.push(`ERR ${r.failure()?.errorText} ${r.url()}`); });
  for (const path of PAGES) {
    failed.length = 0;
    const res = await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => null);
    if (!res || res.status() >= 400) { problems.push({ w, path, issue: `page status ${res?.status()}` }); continue; }
    // scroll the page and every horizontal scroller to the end so lazy images load
    await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let y = 0; y < document.body.scrollHeight; y += Math.round(innerHeight * 0.8)) { scrollTo(0, y); await wait(120); }
      for (const el of document.querySelectorAll("*")) {
        if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) {
          el.scrollIntoView({ block: "center" });
          for (let x = 0; x <= el.scrollWidth; x += Math.max(200, el.clientWidth / 2)) { el.scrollLeft = x; await wait(120); }
          el.scrollLeft = 0;
        }
      }
      scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle").catch(() => {});
    const imgs = await page.evaluate(async () => Promise.all([...document.images].map(async (i) => {
      let decodes = true;
      try { if (i.complete && i.naturalWidth > 0) await i.decode(); else decodes = i.naturalWidth > 0; } catch { decodes = false; }
      const r = i.getBoundingClientRect();
      const hiddenByDesign = getComputedStyle(i).display === "none" || !!i.closest("[aria-hidden=true],[hidden],dialog:not([open])") || r.width === 0;
      return { src: (i.currentSrc || i.src).slice(0, 160), alt: i.alt, nw: i.naturalWidth, nh: i.naturalHeight, rw: Math.round(r.width), rh: Math.round(r.height), decodes, hiddenByDesign, complete: i.complete };
    })));
    let ok = 0;
    for (const im of imgs) {
      if (im.hiddenByDesign) continue;
      if (!im.decodes || !im.complete) problems.push({ w, path, issue: "not loaded/decoded", ...im });
      else if (im.nw <= 4 || im.nh <= 4) tiny.push({ w, path, alt: im.alt, src: im.src, natural: `${im.nw}x${im.nh}` });
      else if (im.rh === 0) problems.push({ w, path, issue: "zero rendered height", ...im });
      else if (!im.alt && !/\/_next\/static\//.test(im.src)) problems.push({ w, path, issue: "missing alt", ...im });
      else ok++;
    }
    for (const f of failed) problems.push({ w, path, issue: `request ${f}` });
    summary.push({ w, path, images: imgs.length, ok, failedRequests: failed.length });
  }
  await ctx.close();
}
await b.close();
console.table(summary);
console.log("TINY (test fixtures):", JSON.stringify([...new Map(tiny.map((t) => [t.src, t])).values()], null, 1));
console.log("PROBLEMS:", JSON.stringify(problems, null, 1));
process.exit(problems.length ? 1 : 0);
