import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnquiryForm } from "@/components/EnquiryForm";
import { PropertyCard } from "@/components/PropertyCard";
import { PageHero } from "@/components/site/PageHero";
import { btn, Icon, SectionHeading } from "@/components/site/ui";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getSiteDictionary } from "@/i18n/site";
import { getLocationContent, getLocations, searchProperties } from "@/lib/api";
import { pageMeta } from "@/lib/seo";
import { cityLabel, citySlug, groupByCity } from "@/lib/site";

type Props = { params: Promise<{ lang: string; city: string }> };

/** Resolves a city slug to a city that currently has public listings (no page is generated for empty cities). */
async function resolve(lang: string, slug: string) {
  const cities = groupByCity(await getLocations(lang).catch(() => []));
  return cities.find((c) => citySlug(c.city) === slug) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, city } = await params;
  if (!isLang(lang)) return {};
  const c = await resolve(lang, city);
  if (!c) return {};
  const content = await getLocationContent(lang, city);
  const s = getSiteDictionary(lang);
  const name = cityLabel(c.city, lang);
  return pageMeta(lang, `/locations/${city}`, content?.title ?? `${s.nav.properties} · ${name}`,
    (content?.intro ?? `${s.locations.count(c.total)} · ${c.localities.map((l) => l.name).join(", ")}`).slice(0, 300));
}

export default async function LocationPage({ params }: Props) {
  const { lang, city } = await params;
  if (!isLang(lang)) notFound();
  const c = await resolve(lang, city);
  if (!c) notFound();
  const t = getDictionary(lang);
  const s = getSiteDictionary(lang);
  const x = getExtraDictionary(lang);
  const name = cityLabel(c.city, lang);
  const [content, listings] = await Promise.all([
    getLocationContent(lang, city),
    searchProperties(lang, { city: c.city, limit: "50" }).catch(() => ({ items: [], nextCursor: null })),
  ]);
  const byCategory = (["residential", "commercial", "land"] as const)
    .map((k) => ({ k, n: listings.items.filter((p) => p.category === k).length })).filter((x) => x.n > 0);
  return (
    <>
      <PageHero lang={lang} home={s.detail.home} breadcrumbLabel={s.detail.breadcrumb} crumbs={[{ label: s.nav.locations, href: `/${lang}/#locations` }, { label: name }]}
        eyebrow={x.locationPage.eyebrow} title={content?.title ?? name} sub={s.locations.count(c.total)} />

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16 lg:px-8 lg:py-16">
        <div>
          {content?.intro && content.intro.split(/\n{2,}|\n/).map((para, i) => <p key={i} className="mb-4 text-lg leading-relaxed text-navy/85">{para}</p>)}
          <h2 className="font-display mt-6 text-2xl font-semibold">{x.locationPage.localities}</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {c.localities.map((l) => (
              <li key={l.name}><Link href={`/${lang}/properties?city=${encodeURIComponent(c.city)}&q=${encodeURIComponent(l.name)}`}
                className="inline-flex min-h-10 items-center gap-2 border border-navy/15 bg-white px-4 text-sm hover:border-navy">
                <Icon name="pin" className="size-4 text-gold-700" />{l.name}<span className="text-muted">· {l.count}</span></Link></li>
            ))}
          </ul>
          {byCategory.length > 0 && (
            <>
              <h2 className="font-display mt-8 text-2xl font-semibold">{x.locationPage.categories}</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {byCategory.map(({ k, n }) => (
                  <li key={k}><Link href={`/${lang}/properties?city=${encodeURIComponent(c.city)}&category=${k}`}
                    className="inline-flex min-h-10 items-center gap-2 border border-navy/15 bg-white px-4 text-sm hover:border-navy">{s.category[k].title}<span className="text-muted">· {n}</span></Link></li>
                ))}
              </ul>
            </>
          )}
        </div>
        <aside className="bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
          <EnquiryForm lang={lang} t={t} f={s.form} variant="callback" enquiryType="general" message={`Location: ${c.city}`} title={x.locationPage.enquire} id="location-enquiry" />
        </aside>
      </section>

      <section aria-labelledby="city-listings" className="border-t border-navy/10 bg-sand/40">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading id="city-listings" eyebrow={name} title={x.locationPage.listings} />
            <Link href={`/${lang}/properties?city=${encodeURIComponent(c.city)}`} className={btn.outline}>{x.locationPage.all}</Link>
          </div>
          {listings.items.length === 0 ? <p className="mt-8 text-muted">{x.locationPage.empty}</p> : (
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {listings.items.slice(0, 6).map((p) => <PropertyCard key={p.id} p={p} lang={lang} t={t} s={s} />)}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
