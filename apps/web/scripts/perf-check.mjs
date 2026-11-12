// Lab Core Web Vitals in a real browser (no extra dependencies). Lab numbers only: field data needs real users.
//   node scripts/perf-check.mjs <baseUrl> <path> [<path> ...]
// Each page is loaded cold twice: "mobile" (390x844, 4x CPU slowdown, ~Fast 4G network) and "desktop" (1440x900,
// no throttling). LCP and CLS come from PerformanceObserver; INP is approximated by the slowest event duration
// for a real click + keypress on the page (Event Timing API).
import { chromium } from "@playwright/test";

const [base, ...paths] = process.argv.slice(2);
const profiles = [
  { name: "mobile", viewport: { width: 390, height: 844 }, cpu: 4, net: { latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 } },
  { name: "desktop", viewport: { width: 1440, height: 900 }, cpu: 1, net: null },
];
const browser = await chromium.launch();
console.log("profile  path                           LCP(ms)  CLS     INP~(ms)  transfer(KB)");
for (const prof of profiles) {
  for (const p of paths) {
    const ctx = await browser.newContext({ viewport: prof.viewport });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    if (prof.net) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...prof.net });
    if (prof.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: prof.cpu });
    await page.addInitScript(() => {
      window.__v = { lcp: 0, cls: 0, inp: 0 };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) window.__v.inp = Math.max(window.__v.inp, e.duration); }).observe({ type: "event", durationThreshold: 16, buffered: true });
    });
    let bytes = 0;
    cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength; });
    await page.goto(base + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const load = await page.evaluate(() => ({ ...window.__v }));
    // One real interaction on a neutral element (the page heading), then a key press, so Event Timing has entries.
    await page.locator("h1").first().click();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(600);
    const v = { ...load, inp: await page.evaluate(() => window.__v.inp) };
    console.log(`${prof.name.padEnd(8)} ${p.padEnd(30)} ${String(Math.round(v.lcp)).padStart(7)}  ${v.cls.toFixed(3)}  ${String(Math.round(v.inp)).padStart(8)}  ${String(Math.round(bytes / 1024)).padStart(11)}`);
    await ctx.close();
  }
}
await browser.close();
