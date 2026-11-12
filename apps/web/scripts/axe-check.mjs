// axe-core accessibility audit (WCAG 2.0/2.1/2.2 A + AA rules) in a real browser.
//   node scripts/axe-check.mjs <baseUrl> <width> <path> [<path> ...]
// Prints violations per page (rule, impact, count, first target). Exit code 1 when any serious/critical violation.
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const [base, width, ...paths] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: Number(width), height: 900 } });
const page = await context.newPage();
let serious = 0;
for (const p of paths) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const v = r.violations;
  serious += v.filter((x) => x.impact === "serious" || x.impact === "critical").length;
  console.log(`${v.length === 0 ? "PASS" : "FAIL"}  ${width}px ${p}  (${r.passes.length} rules passed)`);
  for (const x of v) console.log(`   - [${x.impact}] ${x.id}: ${x.nodes.length} node(s), e.g. ${x.nodes[0]?.target?.join(" ")}  — ${x.help}`);
}
await browser.close();
process.exit(serious > 0 ? 1 : 0);
