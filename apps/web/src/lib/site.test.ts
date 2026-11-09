import { describe, expect, it } from "vitest";
import { isCategory } from "./api";
import { cityLabel, cleanFilters, contactFrom, filterQuery, groupByCity, whatsappHref } from "./site";

describe("contactFrom: only verified, well-formed channels are shown", () => {
  it("returns nothing when the API returns no verified contact", () => {
    expect(contactFrom({ settings: { display_name: "UNAVORA ANANT INFRA" }, social: {}, offices: [] }))
      .toEqual({ phone: undefined, whatsapp: undefined, email: undefined, social: [] });
  });
  it("keeps valid values and hides malformed ones instead of fixing them", () => {
    const c = contactFrom({
      settings: { phone: "+919999900001", whatsapp: "98765 43210", email: "info@example.test" },
      social: { instagram: "https://instagram.com/example", bad: "http://insecure.example", js: "javascript:alert(1)" },
      offices: [],
    });
    expect(c.phone).toBe("+919999900001");
    expect(c.whatsapp).toBeUndefined();
    expect(c.email).toBe("info@example.test");
    expect(c.social).toEqual([{ label: "Instagram", href: "https://instagram.com/example" }]);
  });
  it("builds wa.me links without the plus sign and with an encoded message", () => {
    expect(whatsappHref("+919999900001", "Hello & welcome")).toBe("https://wa.me/919999900001?text=Hello%20%26%20welcome");
  });
});

describe("cleanFilters: only well-formed filters reach the API", () => {
  it("drops unknown categories, odd types and non-numeric budgets; swaps reversed budgets", () => {
    const f = cleanFilters({ city: "Lucknow", category: "farmhouse", type: "DROP TABLE", minPrice: "9000000", maxPrice: "3000000", bedrooms: "12" }, isCategory);
    expect(f).toEqual({ city: "Lucknow", category: undefined, type: undefined, minPrice: "3000000", maxPrice: "9000000", bedrooms: undefined, q: undefined });
  });
  it("accepts valid values and trims the keyword", () => {
    const f = cleanFilters({ category: "residential", type: "apartment", q: "  2 BHK  " }, isCategory);
    expect(f.category).toBe("residential");
    expect(f.type).toBe("apartment");
    expect(f.q).toBe("2 BHK");
  });
});

describe("filterQuery", () => {
  it("serialises filters, optionally without one (remove-filter chips) and with extras (paging)", () => {
    const f = { city: "Noida", category: "residential" as const, maxPrice: "5000000" };
    expect(filterQuery(f)).toBe("?city=Noida&category=residential&maxPrice=5000000");
    expect(filterQuery(f, "city")).toBe("?category=residential&maxPrice=5000000");
    expect(filterQuery({}, undefined, { cursor: "abc" })).toBe("?cursor=abc");
    expect(filterQuery({})).toBe("");
  });
});

describe("locations", () => {
  it("groups API rows by city with totals, keeping API order", () => {
    const g = groupByCity([
      { city: "Lucknow", locality: "Gomti Nagar", publishedCount: 3 },
      { city: "Lucknow", locality: "Hazratganj", publishedCount: 1 },
      { city: "Noida", locality: "Sector 37", publishedCount: 2 },
    ]);
    expect(g.map((c) => [c.city, c.total, c.localities.length])).toEqual([["Lucknow", 4, 2], ["Noida", 2, 1]]);
  });
  it("labels known cities in Hindi and leaves unknown ones unchanged", () => {
    expect(cityLabel("Prayagraj", "hi")).toBe("प्रयागराज");
    expect(cityLabel("Prayagraj", "en")).toBe("Prayagraj");
    expect(cityLabel("Varanasi", "hi")).toBe("Varanasi");
  });
});
