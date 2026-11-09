// Checks page metadata from the server-rendered HTML: status, <title>, description, canonical, hreflang en/hi/x-default,
// Open Graph, JSON-LD validity. Also sitemap.xml / robots.txt.  node scripts/seo-check.mjs <baseUrl> <path> [...]
const [base, ...paths] = process.argv.slice(2);
let bad = 0;
const pick = (html, re) => (html.match(re)?.[1] ?? "").trim();
for (const p of paths) {
  const res = await fetch(base + p);
  const html = await res.text();
  const issues = [];
  const title = pick(html, /<title>([^<]*)<\/title>/);
  const desc = pick(html, /<meta name="description" content="([^"]*)"/);
  const canonical = pick(html, /<link rel="canonical" href="([^"]*)"/);
  const alt = [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)].map((m) => m[1]);
  const og = pick(html, /<meta property="og:title" content="([^"]*)"/);
  const lds = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => m[1]);
  if (res.status !== 200) issues.push(`status ${res.status}`);
  if (!title || title.length > 70) issues.push(`title "${title}" (${title.length})`);
  if (!desc || desc.length < 50 || desc.length > 320) issues.push(`description length ${desc.length}`);
  if (!canonical.endsWith(p.split("?")[0])) issues.push(`canonical ${canonical}`);
  for (const l of ["en", "hi", "x-default"]) if (!alt.includes(l)) issues.push(`hreflang ${l} missing`);
  if (!og) issues.push("og:title missing");
  for (const j of lds) { try { JSON.parse(j); } catch { issues.push("invalid JSON-LD"); } }
  bad += issues.length;
  console.log(`${issues.length ? "FAIL" : "PASS"}  ${p}  "${title}"${lds.length ? `  [JSON-LD x${lds.length}]` : ""}${issues.length ? "\n   - " + issues.join("\n   - ") : ""}`);
}
for (const f of ["/sitemap.xml", "/robots.txt"]) {
  const r = await fetch(base + f);
  const t = await r.text();
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${f}  ${r.status}  ${f.endsWith("xml") ? (t.match(/<url>/g) ?? []).length + " urls" : t.split("\n")[0] + " / " + t.split("\n")[1]}`);
  if (!r.ok) bad++;
}
const nf = await fetch(base + "/en/properties/does-not-exist");
console.log(`${nf.status === 404 ? "PASS" : "FAIL"}  missing listing -> HTTP ${nf.status}`);
process.exit(bad || nf.status !== 404 ? 1 : 0);
