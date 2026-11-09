// Lists elements wider than the viewport (causes of sideways scrolling on phones).
//   node scripts/find-overflow.mjs <url> [width]
import { chromium } from "@playwright/test";

const [url, w = "390"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: 844 } });
await page.goto(url, { waitUntil: "networkidle" });
const found = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && r.width > 0) {
      const inScroller = el.closest("[class*='overflow-x-auto'],[class*='overflow-hidden']");
      if (!inScroller || inScroller === el) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 90)} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
    }
  }
  return out.slice(0, 15);
});
console.log(found.join("\n") || "no overflow");
await browser.close();
