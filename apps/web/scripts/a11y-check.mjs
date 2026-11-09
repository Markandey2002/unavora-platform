// Structural accessibility checks in a real browser (no extra dependencies). Not a replacement for axe/manual audits.
//   node scripts/a11y-check.mjs <baseUrl> <width> <path> [<path> ...]
// Checks: html[lang], one <h1>, no skipped heading levels, <main> + skip link, images have alt, form controls have an
// accessible name, links/buttons have a name, no duplicate ids, interactive targets >= 24x24 CSS px (WCAG 2.2 AA 2.5.8).
import { chromium } from "@playwright/test";

const [base, width, ...paths] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
let failures = 0;
for (const p of paths) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  const r = await page.evaluate(() => {
    const out = [];
    const visible = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && b.width > 0 && b.height > 0; };
    const name = (el) => (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent || el.labels?.[0]?.textContent || el.closest("label")?.textContent || el.getAttribute("title") || el.getAttribute("alt") || el.textContent || el.querySelector("img")?.getAttribute("alt") || "").trim();
    if (!document.documentElement.lang) out.push("html lang missing");
    const h1 = [...document.querySelectorAll("h1")].filter(visible);
    if (h1.length !== 1) out.push(`expected 1 visible h1, found ${h1.length}`);
    let prev = 0;
    for (const h of [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible)) {
      const lvl = Number(h.tagName[1]);
      if (prev && lvl > prev + 1) out.push(`heading jump h${prev} -> h${lvl}: "${h.textContent.trim().slice(0, 40)}"`);
      prev = lvl;
    }
    if (!document.querySelector("main")) out.push("no <main>");
    if (!document.querySelector("a[href='#main']")) out.push("no skip link");
    for (const img of document.querySelectorAll("img")) if (!img.hasAttribute("alt")) out.push(`img without alt: ${img.src.slice(-50)}`);
    for (const svg of document.querySelectorAll("svg[role=img]")) if (!svg.getAttribute("aria-label")) out.push("svg role=img without label");
    for (const el of document.querySelectorAll("input:not([type=hidden]),select,textarea")) if (visible(el) && !name(el)) out.push(`unlabelled ${el.tagName.toLowerCase()} name=${el.name}`);
    for (const el of document.querySelectorAll("a[href],button")) {
      if (!visible(el) || el.getAttribute("aria-hidden") === "true") continue;
      if (!name(el)) out.push(`${el.tagName.toLowerCase()} without accessible name: ${el.outerHTML.slice(0, 80)}`);
      const b = el.getBoundingClientRect();
      const inline = getComputedStyle(el).display === "inline" && el.closest("p,li,dd,figcaption");
      if (!inline && (b.width < 24 || b.height < 24)) out.push(`small target ${Math.round(b.width)}x${Math.round(b.height)}: "${name(el).slice(0, 30)}"`);
    }
    const ids = {};
    for (const el of document.querySelectorAll("[id]")) ids[el.id] = (ids[el.id] ?? 0) + 1;
    for (const [id, n] of Object.entries(ids)) if (n > 1) out.push(`duplicate id "${id}" x${n}`);
    return out;
  });
  failures += r.length;
  console.log(`${r.length ? "FAIL" : "PASS"}  ${width}px ${p}${r.length ? "\n   - " + [...new Set(r)].slice(0, 12).join("\n   - ") : ""}`);
}
await browser.close();
process.exit(failures ? 1 : 0);
