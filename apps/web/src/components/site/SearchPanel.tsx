import type { SiteDictionary } from "@/i18n/site";
import { categories, formatPrice } from "@/lib/api";
import { budgetSteps, cityLabel, type SearchFilters } from "@/lib/site";
import { FilterSheet } from "./SearchSheet";
import { btn } from "./ui";

/** Property types by category (codes match property_types in the database). */
export const typesByCategory = {
  residential: ["apartment", "villa", "independent_house"],
  commercial: ["office", "retail", "warehouse"],
  land: ["plot"],
} as const;

const sel = "mt-1 block min-h-12 w-full appearance-none normal-case tracking-normal text-base font-normal border-0 border-b border-navy/20 bg-transparent px-0 pr-6 text-base text-navy focus:border-gold-600 focus:outline-none focus:ring-0 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22><path d=%22m5.5 8 4.5 4.5L14.5 8%22 fill=%22none%22 stroke=%22%23101d35%22 stroke-width=%221.4%22/></svg>')] bg-[length:1rem] bg-[right_0.1rem_center] bg-no-repeat";
const lab = "block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted [:lang(hi)_&]:text-xs [:lang(hi)_&]:tracking-normal";

/**
 * Property search -> /{lang}/properties with only filters the public API supports (city, category, type, budget,
 * keyword). Plain GET form: works without JavaScript. Sale/rent is not offered: every current listing is for sale.
 */
export function SearchFields({ lang, s, cities, f = {}, keyword = false, lockCategory }: {
  lang: string; s: SiteDictionary; cities: string[]; f?: SearchFilters; keyword?: boolean; lockCategory?: string;
}) {
  const typeCodes = lockCategory ? typesByCategory[lockCategory as keyof typeof typesByCategory] ?? [] : Object.values(typesByCategory).flat();
  return (
    <>
      <label className={lab}>{s.search.location}
        <select name="city" defaultValue={f.city ?? ""} className={sel}>
          <option value="">{s.search.anyLocation}</option>
          {cities.map((c) => <option key={c} value={c}>{cityLabel(c, lang)}</option>)}
        </select>
      </label>
      {lockCategory ? <input type="hidden" name="category" value={lockCategory} /> : (
        <label className={lab}>{s.search.category}
          <select name="category" defaultValue={f.category ?? ""} className={sel}>
            <option value="">{s.search.anyCategory}</option>
            {categories.map((c) => <option key={c} value={c}>{s.category[c].title}</option>)}
          </select>
        </label>
      )}
      <label className={lab}>{s.search.type}
        <select name="type" defaultValue={f.type ?? ""} className={sel}>
          <option value="">{s.search.anyType}</option>
          {typeCodes.map((c) => <option key={c} value={c}>{s.types[c]}</option>)}
        </select>
      </label>
      <label className={lab}>{s.search.minBudget}
        <select name="minPrice" defaultValue={f.minPrice ?? ""} className={sel}>
          <option value="">{s.search.noMin}</option>
          {budgetSteps.map((b) => <option key={b} value={b}>{formatPrice(b)}</option>)}
        </select>
      </label>
      <label className={lab}>{s.search.maxBudget}
        <select name="maxPrice" defaultValue={f.maxPrice ?? ""} className={sel}>
          <option value="">{s.search.noMax}</option>
          {budgetSteps.map((b) => <option key={b} value={b}>{formatPrice(b)}</option>)}
        </select>
      </label>
      {keyword && (
        <label className={lab}>{s.search.keyword}
          <input name="q" defaultValue={f.q ?? ""} maxLength={80} placeholder={s.search.keywordHint}
            className="mt-1 block min-h-12 w-full border-0 border-b border-navy/20 bg-transparent px-0 text-base normal-case tracking-normal font-normal text-navy placeholder:text-muted/60 focus:border-gold-600 focus:outline-none focus:ring-0" />
        </label>
      )}
    </>
  );
}

/** Hero search card (home). */
export function HeroSearch({ lang, s, cities }: { lang: string; s: SiteDictionary; cities: string[] }) {
  return (
    <form action={`/${lang}/properties`} method="get" role="search" aria-label={s.search.title}
      className="bg-ivory px-5 py-4 shadow-[var(--shadow-lift)] sm:px-6">
      {/* compact: title and the sale note share one line; fields and the button in one row on desktop */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="eyebrow text-gold-700">{s.search.title}</p>
        <p className="text-xs text-muted">{s.search.saleNote}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end [&>label:first-child]:col-span-2 md:[&>label:first-child]:col-span-1">
        <SearchFields lang={lang} s={s} cities={cities} />
        <button className={`${btn.gold} col-span-2 w-full md:col-span-1`}>{s.search.submit}</button>
      </div>
    </form>
  );
}

/** Listing filters: inline bar on tablet/desktop, bottom sheet on phones. */
export function ListingFilters({ lang, s, cities, f, action, lockCategory, activeCount }: {
  lang: string; s: SiteDictionary; cities: string[]; f: SearchFilters; action: string; lockCategory?: string; activeCount: number;
}) {
  const fields = <SearchFields lang={lang} s={s} cities={cities} f={f} keyword lockCategory={lockCategory} />;
  return (
    <>
      <form action={action} method="get" role="search" aria-label={s.search.title}
        className="hidden gap-x-6 gap-y-4 bg-white p-6 shadow-[var(--shadow-card)] md:grid md:grid-cols-3 lg:grid-cols-[repeat(6,minmax(0,1fr))] lg:items-end">
        {fields}
        <button className={`${btn.navy} md:col-span-3 lg:col-span-6`}>{s.search.submit}</button>
      </form>
      <FilterSheet labels={{ open: s.search.openFilters, close: s.search.closeFilters, title: s.search.title }} activeCount={activeCount}>
        <form action={action} method="get" role="search" aria-label={s.search.title} className="grid gap-5">
          {fields}
          <button className={`${btn.gold} sticky bottom-0 w-full`}>{s.search.apply}</button>
        </form>
      </FilterSheet>
    </>
  );
}
