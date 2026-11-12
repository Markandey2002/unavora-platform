/** Default order of the homepage sections under the hero and search (the director can reorder or hide them). */
export const SECTION_ORDER = ["launches", "featured", "showcase", "categories", "locations", "why", "about", "owner", "partner", "insights", "videos", "testimonials", "associations", "enquiry"];

/** A saved order keeps working when a new section is added later: missing keys go in at their default position. */
export function withNewSections(saved?: string[]): string[] {
  if (!saved) return SECTION_ORDER;
  const out = saved.filter((k) => SECTION_ORDER.includes(k));
  SECTION_ORDER.forEach((k, i) => {
    if (out.includes(k)) return;
    const prev = SECTION_ORDER.slice(0, i).reverse().find((p) => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, k);
  });
  return out;
}
