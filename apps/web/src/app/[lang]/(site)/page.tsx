import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnquiryForm } from "@/components/EnquiryForm";
import { PropertyCard } from "@/components/PropertyCard";
import { HeroArt, PropertyArt, seedOf, type ArtKind } from "@/components/site/Art";
import { ProjectCard } from "@/components/site/ProjectCard";
import { HeroSearch } from "@/components/site/SearchPanel";
import { Arrow, btn, Eyebrow, Icon, SectionHeading } from "@/components/site/ui";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { getCompany, getLocations, getProjects, searchProperties, type PropertyPage } from "@/lib/api";
import { photos } from "@/lib/assets";
import { jsonLd, pageMeta, siteUrl } from "@/lib/seo";
import { cityLabel, contactFrom, groupByCity, whatsappHref } from "@/lib/site";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const s = getSiteDictionary(lang);
  return pageMeta(lang, "", s.hero.eyebrow, s.hero.sub);
}

const empty: PropertyPage = { items: [], nextCursor: null };
const countOf = (p: PropertyPage) => p.items.length + (p.nextCursor ? 1 : 0);

export default async function Home({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDictionary(lang);
  const s = getSiteDictionary(lang);
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [featured, locations, projects, residential, commercial, land, offices, company] = await Promise.all([
    safe(searchProperties(lang, { limit: "6" }), empty),
    safe(getLocations(lang), []),
    safe(getProjects(lang), []),
    safe(searchProperties(lang, { category: "residential", limit: "50" }), empty),
    safe(searchProperties(lang, { category: "commercial", limit: "50" }), empty),
    safe(searchProperties(lang, { category: "land", limit: "50" }), empty),
    safe(searchProperties(lang, { type: "office", limit: "50" }), empty),
    getCompany(),
  ]);
  const cities = groupByCity(locations);
  const contact = contactFrom(company);
  const totalListings = cities.reduce((n, c) => n + c.total, 0);
  const localityCount = locations.length;

  const categoryCards: { key: string; title: string; body: string; href: string; count: number; kind: ArtKind }[] = [
    { key: "residential", ...s.category.residential, href: `/${lang}/residential`, count: countOf(residential), kind: "tower" },
    { key: "commercial", ...s.category.commercial, href: `/${lang}/commercial`, count: countOf(commercial), kind: "office" },
    { key: "land", ...s.category.land, href: `/${lang}/plots`, count: countOf(land), kind: "plot" },
    ...(countOf(offices) > 0 ? [{ key: "office", ...s.category.office, href: `/${lang}/properties?type=office`, count: countOf(offices), kind: "office" as ArtKind }] : []),
  ];

  const org = {
    "@context": "https://schema.org", "@type": "RealEstateAgent",
    name: company.settings.display_name ?? "UNAVORA ANANT INFRA", url: `${siteUrl()}/${lang}`,
    logo: `${siteUrl()}/brand/unavora-logo-stacked.png`,
    ...(company.settings.tagline ? { slogan: company.settings.tagline } : {}),
    ...(contact.phone ? { telephone: contact.phone } : {}), ...(contact.email ? { email: contact.email } : {}),
    areaServed: cities.map((c) => ({ "@type": "City", name: c.city })),
  };

  return (
    <>
      <script {...jsonLd(org)} />

      {/* B. Hero */}
      <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-navy text-ivory">
        <div className="absolute inset-0 -z-10">
          {photos.hero ? (
            <Image src={photos.hero.src} alt={lang === "hi" ? photos.hero.alt.hi : photos.hero.alt.en} fill priority sizes="100vw" className="object-cover" />
          ) : (
            <HeroArt title={s.hero.art} />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-navy/95 via-navy/70 to-navy/0" />
          <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-transparent to-navy/40" />
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-40 pt-16 sm:px-6 sm:pt-24 lg:px-8 lg:pb-48 lg:pt-32">
          <div className="max-w-2xl">
            <div className="rise"><Eyebrow light>{company.settings.tagline ?? s.hero.eyebrow}</Eyebrow></div>
            <h1 id="hero-title" className="rise rise-2 font-display mt-6 text-[2.6rem] font-semibold leading-[1.04] sm:text-6xl lg:text-7xl">
              {s.hero.title}
            </h1>
            <p className="rise rise-3 mt-6 max-w-xl text-base leading-relaxed text-ivory/80 sm:text-lg">{s.hero.sub}</p>
            <div className="rise rise-3 mt-9 flex flex-col gap-3 min-[420px]:flex-row">
              <Link href={`/${lang}/properties`} className={btn.gold}>{s.hero.explore}<Arrow /></Link>
              <Link href={`/${lang}/contact`} className={btn.outlineLight}>{s.hero.contact}</Link>
            </div>
          </div>
        </div>
        {!photos.hero && (
          <span className="absolute right-4 top-4 text-[0.65rem] uppercase tracking-[0.2em] text-ivory/70 sm:right-6">{s.hero.illustration}</span>
        )}
      </section>

      {/* C. Search, overlapping the hero */}
      <div className="relative z-10 mx-auto -mt-28 max-w-7xl px-4 sm:px-6 lg:-mt-32 lg:px-8">
        <HeroSearch lang={lang} s={s} cities={cities.map((c) => c.city)} />
      </div>

      {/* Live figures strip (data, not marketing claims) */}
      <section aria-label={s.stats.note} className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 lg:px-8">
        <dl className="grid grid-cols-2 divide-navy/10 border-y border-navy/10 sm:grid-cols-4 sm:divide-x">
          {[
            [String(totalListings), s.stats.listings],
            [String(cities.length), s.stats.cities],
            [String(localityCount), s.stats.localities],
            ["2", s.stats.languages],
          ].map(([v, k]) => (
            <div key={k} className="px-2 py-6 text-center">
              <dd className="font-display text-4xl font-semibold text-gold-700 sm:text-5xl">{v}</dd>
              <dt className="eyebrow mt-2 !text-[0.65rem] text-muted">{k}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-right text-[0.7rem] text-muted">{s.stats.note}</p>
      </section>

      {/* D. Categories */}
      <section aria-labelledby="cat-title" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading id="cat-title" eyebrow={s.categories.eyebrow} title={s.categories.title} />
        <ul className={`mt-12 grid gap-5 sm:grid-cols-2 ${categoryCards.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {categoryCards.map((c) => (
            <li key={c.key} className="group relative overflow-hidden bg-navy">
              <div className="zoom-on-hover aspect-[16/11] sm:aspect-[3/4]">
                <PropertyArt kind={c.kind} seed={seedOf(c.key + "cat")} label={`${s.card.illustration}: ${c.title}`} />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-ivory">
                <p className="eyebrow !text-[0.65rem] text-gold">{s.categories.count(c.count)}</p>
                <h3 className="font-display mt-2 text-3xl font-semibold">
                  <Link href={c.href} className="after:absolute after:inset-0 after:content-['']">{c.title}</Link>
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ivory/75">{c.body}</p>
                <span className="mt-5 inline-flex items-center gap-2 border-b border-gold pb-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold [:lang(hi)_&]:tracking-normal">
                  {s.categories.explore}<Arrow className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* E. New launches (projects) + featured properties */}
      <section aria-labelledby="featured-title" className="bg-sand/60 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {projects.length > 0 && (
            <div className="mb-20">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <SectionHeading eyebrow={s.launches.eyebrow} title={s.launches.title} sub={s.launches.sub} />
                <Link href={`/${lang}/projects`} className={btn.outline}>{s.launches.viewAll}</Link>
              </div>
              <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {projects.slice(0, 3).map((p) => <ProjectCard key={p.id} p={p} lang={lang} s={s} />)}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading id="featured-title" eyebrow={s.featured.eyebrow} title={s.featured.title} sub={s.featured.sub} />
            <span className="hidden sm:inline-flex"><Link href={`/${lang}/properties`} className={btn.outline}>{s.featured.viewAll}</Link></span>
          </div>
          {featured.items.length === 0 ? (
            <p className="mt-10 text-muted">{s.featured.empty}</p>
          ) : (
            <ul className="-mx-4 mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&>li]:w-[85%] [&>li]:shrink-0 [&>li]:snap-start sm:[&>li]:w-auto">
              {featured.items.map((p) => <PropertyCard key={p.id} p={p} lang={lang} t={t} s={s} />)}
            </ul>
          )}
          <div className="mt-6 sm:hidden"><Link href={`/${lang}/properties`} className={`${btn.outline} w-full`}>{s.featured.viewAll}</Link></div>
        </div>
      </section>

      {/* Statement: words brighten as the line scrolls into view (CSS scroll timeline; static where unsupported) */}
      <section aria-label={s.quote} className="mx-auto max-w-5xl px-4 py-24 text-center sm:px-6 lg:py-32">
        <p className="reveal-words font-display text-3xl font-medium leading-snug text-navy sm:text-4xl lg:text-5xl">
          {s.quote.split(" ").map((w, i) => <span key={i}>{w} </span>)}
        </p>
      </section>

      {/* F. About */}
      <section aria-labelledby="about-title" className="bg-white">
        <div className="mx-auto grid max-w-7xl lg:grid-cols-2">
          <div className="relative min-h-[320px] overflow-hidden bg-navy lg:min-h-[640px]">
            {photos.about ? (
              <Image src={photos.about.src} alt={lang === "hi" ? photos.about.alt.hi : photos.about.alt.en} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
            ) : (
              <div className="absolute inset-0"><PropertyArt kind="tower" seed={seedOf("about")} wide label={`${s.card.illustration}: ${s.about.title}`} /></div>
            )}
            <span className="absolute bottom-3 left-4 text-[0.65rem] uppercase tracking-[0.2em] text-ivory/60">{s.card.illustration}</span>
          </div>
          <div className="px-4 py-16 sm:px-10 lg:px-16 lg:py-24">
            <SectionHeading id="about-title" eyebrow={s.about.eyebrow} title={s.about.title} />
            <p className="mt-6 leading-relaxed text-navy/85">{s.about.p1}</p>
            <p className="mt-4 leading-relaxed text-muted">{s.about.p2}</p>
            <dl className="mt-10 grid gap-8 sm:grid-cols-2">
              <div className="border-l-2 border-gold pl-5">
                <dt className="eyebrow text-gold-700">{s.about.visionTitle}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-navy/85">{s.about.vision}</dd>
              </div>
              <div className="border-l-2 border-gold pl-5">
                <dt className="eyebrow text-gold-700">{s.about.missionTitle}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-navy/85">{s.about.mission}</dd>
              </div>
            </dl>
            <Link href={`/${lang}/about`} className={`${btn.navy} mt-10`}>{s.about.more}<Arrow /></Link>
          </div>
        </div>
      </section>

      {/* G. Why UNAVORA */}
      <section aria-labelledby="why-title" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading id="why-title" eyebrow={s.why.eyebrow} title={s.why.title} center />
        <ul className="mt-14 grid gap-px bg-navy/10 sm:grid-cols-2 lg:grid-cols-3">
          {s.why.items.map((w, i) => (
            <li key={w.title} className="group bg-ivory p-8 transition-colors hover:bg-white">
              <span className="font-display text-sm font-semibold text-gold-700">0{i + 1}</span>
              <h3 className="font-display mt-4 text-2xl font-semibold">{w.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{w.body}</p>
              <span aria-hidden className="mt-6 block h-px w-10 bg-gold transition-all duration-300 group-hover:w-20" />
            </li>
          ))}
        </ul>
      </section>

      {/* H. Locations (from live listings) */}
      <section id="locations" aria-labelledby="loc-title" className="bg-navy py-20 text-ivory lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading id="loc-title" eyebrow={s.locations.eyebrow} title={s.locations.title} sub={s.locations.sub} light />
          {cities.length === 0 ? (
            <p className="mt-10 text-ivory/70">{s.locations.none}</p>
          ) : (
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {cities.map((c) => (
                <li key={c.city} className="group relative overflow-hidden border border-ivory/10">
                  <div className="zoom-on-hover aspect-[16/10] opacity-80">
                    <PropertyArt kind="tower" seed={seedOf(c.city)} wide label={`${s.card.illustration}: ${cityLabel(c.city, lang)}`} />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/50 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-6">
                    <p className="eyebrow !text-[0.65rem] text-gold">{s.locations.count(c.total)}</p>
                    <h3 className="font-display mt-1 text-3xl font-semibold">
                      <Link href={`/${lang}/properties?city=${encodeURIComponent(c.city)}`} className="after:absolute after:inset-0 after:content-['']">
                        {cityLabel(c.city, lang)}
                      </Link>
                    </h3>
                    <p className="mt-1 text-sm text-ivory/70">{c.localities.map((l) => l.name).join(" · ")}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* I. Channel partners */}
      <section aria-labelledby="partner-title" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid items-center gap-10 overflow-hidden bg-gold-100 lg:grid-cols-[1.1fr_1fr]">
          <div className="p-8 sm:p-12 lg:p-16">
            <SectionHeading id="partner-title" eyebrow={s.partner.eyebrow} title={s.partner.title} sub={s.partner.sub} />
            <ol className="mt-8 grid gap-4 sm:grid-cols-3">
              {s.partner.steps.map((st, i) => (
                <li key={st.title}>
                  <span className="font-display text-2xl font-semibold text-gold-700">{i + 1}</span>
                  <p className="mt-1 text-sm font-semibold">{st.title}</p>
                </li>
              ))}
            </ol>
            <Link href={`/${lang}/channel-partner`} className={`${btn.navy} mt-9`}>{s.partner.cta}<Arrow /></Link>
          </div>
          <div className="relative hidden h-full min-h-[420px] lg:block">
            {photos.partner ? (
              <Image src={photos.partner.src} alt={lang === "hi" ? photos.partner.alt.hi : photos.partner.alt.en} fill sizes="45vw" className="object-cover" />
            ) : (
              <div className="absolute inset-0"><PropertyArt kind="office" seed={seedOf("partner")} label={`${s.card.illustration}: ${s.partner.title}`} /></div>
            )}
          </div>
        </div>
      </section>

      {/* J/K: news, videos, testimonials and associations are published only from approved CMS content and real,
          permitted reviews; none exist yet, so these sections are intentionally not rendered (docs/UI_REVIEW.md). */}

      {/* L. Final enquiry */}
      <section id="enquiry" aria-labelledby="cta-title" className="border-t border-navy/10 bg-sand/60">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-20 lg:px-8 lg:py-28">
          <div>
            <SectionHeading id="cta-title" eyebrow={s.cta.eyebrow} title={s.cta.title} sub={s.cta.sub} />
            <ul className="mt-8 space-y-3">
              {contact.phone && <li><a href={`tel:${contact.phone}`} className={btn.text}><Icon name="phone" />{s.cta.call}: {contact.phone}</a></li>}
              {contact.whatsapp && <li><a href={whatsappHref(contact.whatsapp, s.cta.whatsappText)} target="_blank" rel="noopener noreferrer" className={btn.text}><Icon name="whatsapp" />{s.cta.whatsapp}</a></li>}
              {contact.email && <li><a href={`mailto:${contact.email}`} className={btn.text}><Icon name="mail" />{contact.email}</a></li>}
              <li><Link href={`/${lang}/properties`} className={btn.text}><Icon name="building" />{s.cta.browse} →</Link></li>
            </ul>
          </div>
          <div className="bg-white p-6 shadow-[var(--shadow-card)] sm:p-10">
            <EnquiryForm lang={lang} t={t} f={s.form} variant="full" title={s.form.title} id="home-enquiry" />
          </div>
        </div>
      </section>
    </>
  );
}
