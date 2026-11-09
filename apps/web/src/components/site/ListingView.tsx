import Link from "next/link";
import { PropertyCard } from "@/components/PropertyCard";
import type { Lang } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { formatPrice, getLocations, isCategory, searchProperties, type Category } from "@/lib/api";
import { cityLabel, cleanFilters, filterQuery, type SearchFilters } from "@/lib/site";
import { ListingFilters } from "./SearchPanel";
import { btn, Eyebrow } from "./ui";

/** Shared by /properties and the category pages (/residential, /commercial, /plots). */
export async function ListingView({ lang, sp, lockCategory, title, sub, base }: {
  lang: Lang; sp: Record<string, string | undefined>; lockCategory?: Category; title: string; sub: string; base: string;
}) {
  const t = getDictionary(lang);
  const s = getSiteDictionary(lang);
  const f: SearchFilters = { ...cleanFilters(sp, isCategory), ...(lockCategory ? { category: lockCategory } : {}) };
  const cursor = sp.cursor && /^[A-Za-z0-9_-]{1,200}$/.test(sp.cursor) ? sp.cursor : undefined;
  const [page, locations] = await Promise.all([
    searchProperties(lang, { ...f, cursor, limit: "12" }),
    getLocations(lang).catch(() => []),
  ]);
  const cities = [...new Set(locations.map((l) => l.city))];
  const action = `/${lang}${base}`;

  const chips: { key: keyof SearchFilters; label: string }[] = [];
  if (f.city) chips.push({ key: "city", label: cityLabel(f.city, lang) });
  if (f.category && !lockCategory) chips.push({ key: "category", label: s.category[f.category].title });
  if (f.type) chips.push({ key: "type", label: s.types[f.type] ?? f.type });
  if (f.minPrice) chips.push({ key: "minPrice", label: `≥ ${formatPrice(Number(f.minPrice))}` });
  if (f.maxPrice) chips.push({ key: "maxPrice", label: `≤ ${formatPrice(Number(f.maxPrice))}` });
  if (f.q) chips.push({ key: "q", label: `“${f.q}”` });
  const own = lockCategory ? { ...f, category: undefined } : f;

  return (
    <>
      <section className="border-b border-navy/10 bg-sand/60">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-10 sm:px-6 lg:px-8 lg:pt-14">
          <nav aria-label={s.detail.breadcrumb} className="text-xs text-muted">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li><Link href={`/${lang}`} className="inline-flex min-h-6 min-w-6 items-center hover:text-navy">{s.detail.home}</Link></li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-navy">{title}</li>
            </ol>
          </nav>
          <div className="mt-5"><Eyebrow>{s.nav.properties}</Eyebrow></div>
          <h1 className="font-display mt-3 text-4xl font-semibold leading-tight sm:text-5xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-muted">{sub}</p>
          <div className="mt-8">
            <ListingFilters lang={lang} s={s} cities={cities} f={f} action={action} lockCategory={lockCategory} activeCount={chips.length} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14" aria-labelledby="results-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="results-heading" className="text-sm font-semibold text-navy" aria-live="polite">
            {s.listing.results(page.items.length, page.nextCursor != null)}
          </h2>
          {chips.length > 0 && (
            <ul className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <li key={c.key}>
                  <Link href={`${action}${filterQuery(own, c.key)}`} aria-label={s.listing.remove(c.label)}
                    className="inline-flex min-h-9 items-center gap-2 border border-navy/15 bg-white px-3 text-sm hover:border-navy">
                    {c.label}<span aria-hidden>×</span>
                  </Link>
                </li>
              ))}
              <li><Link href={action} className="inline-flex min-h-9 items-center px-2 text-sm font-semibold underline underline-offset-4">{s.listing.clear}</Link></li>
            </ul>
          )}
        </div>

        {page.items.length === 0 ? (
          <div className="mt-10 border border-dashed border-navy/20 bg-white px-6 py-14 text-center">
            <p className="font-display text-2xl font-semibold">{s.listing.emptyTitle}</p>
            <p className="mx-auto mt-3 max-w-md text-muted">{s.listing.emptySub}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {chips.length > 0 && <Link href={action} className={btn.outline}>{s.listing.clear}</Link>}
              <Link href={`/${lang}/contact#enquiry`} className={btn.gold}>{s.listing.askUs}</Link>
            </div>
          </div>
        ) : (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {page.items.map((p) => <PropertyCard key={p.id} p={p} lang={lang} t={t} s={s} headingLevel="h3" />)}
          </ul>
        )}

        {page.nextCursor && (
          <div className="mt-10 text-center">
            <Link href={`${action}${filterQuery(own, undefined, { cursor: page.nextCursor })}`} className={btn.outline}>{s.listing.more}</Link>
          </div>
        )}
      </section>
    </>
  );
}
