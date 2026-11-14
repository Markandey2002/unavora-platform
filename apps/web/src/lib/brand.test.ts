import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND, brandName, logoAlt } from "./brand";

/** Superseded public identity (UAI logo, "UNAVORA ANANT INFRA", "Building Trust. Creating Value."). */
const OLD = [/ANANT INFRA(?! REAL ESTATE PVT)/i, /अनंत इन्फ्रा/, /Building Trust/i, /Creating Value/i, /Building Better Spaces/i,
  /unavora-logo-(horizontal|stacked|monochrome)/, /unavora-mark\.png/, /make_logo_assets/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|css|json)$/.test(n) && !n.endsWith("brand.test.ts") ? [p] : [];
  });
}

describe("public brand", () => {
  it("is the approved identity", () => {
    expect(BRAND.name.en).toBe("UNAVORA ANANT REAL ESTATE");
    expect(BRAND.tagline).toBe("INVEST IN A BETTER LIVING");
    expect(BRAND.domain).toBe("uainfrarealestate.com");
    expect(brandName("hi")).toBe(BRAND.name.hi);
    expect(logoAlt("en")).toContain("UNAVORA ANANT REAL ESTATE");
  });

  it("old logo files, brand name and tagline appear nowhere in the website source", () => {
    const hits: string[] = [];
    for (const f of files(join(__dirname, ".."))) {
      const text = readFileSync(f, "utf8");
      for (const re of OLD) if (re.test(text)) hits.push(`${f}: ${re}`);
    }
    expect(hits).toEqual([]);
  });

  it("the old logo files are not served from public/", () => {
    const pub = readdirSync(join(__dirname, "..", "..", "public", "brand"));
    expect(pub.filter((n) => /^unavora-(logo|mark)/.test(n))).toEqual([]);
    expect(pub).toContain("unavora-anant-real-estate-logo.png");
  });
});
