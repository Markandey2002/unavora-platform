// Copies the static assets the Next.js standalone server needs next to it (Next does not copy them itself).
//   node scripts/prepare-standalone.mjs        (run from apps/web after `next build`)
// Then start the production-like server:  node .next/standalone/server.js   (PORT / HOSTNAME env vars)
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const out = join(root, ".next", "standalone");
if (!existsSync(join(out, "server.js"))) {
  console.error("No .next/standalone/server.js: run `next build` first (output: standalone).");
  process.exit(1);
}
for (const [from, to] of [[join(root, ".next", "static"), join(out, ".next", "static")], [join(root, "public"), join(out, "public")]]) {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log(`copied ${from} -> ${to}`);
}
