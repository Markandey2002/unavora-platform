// Homepage body. Rendered by the public page (published CMS blocks) and by the staff preview (draft blocks).
import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { EnquiryForm } from "@/components/EnquiryForm";
import { PropertyCard } from "@/components/PropertyCard";
import { HeroArt, PropertyArt, seedOf } from "@/components/site/Art";
import { ProjectCard } from "@/components/site/ProjectCard";
import { ShowcaseSection } from "@/components/site/ShowcaseSection";
import { HeroSearch, SearchFields } from "@/components/site/SearchPanel";
import { FinderSheet } from "@/components/site/SearchSheet";
import { Arrow, btn, Eyebrow, Icon, RepresentativeTag, SectionHeading } from "@/components/site/ui";
import { getDictionary, type Lang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { getArticles, getAssociations, getCompany, getLocations, getProjects, getShowcase, getTestimonials, searchProperties, type PropertyPage, type SiteBlocks } from "@/lib/api";
import { getExtraDictionary } from "@/i18n/extra";
import { ArticleCard } from "@/components/site/ArticleCard";
import { LiteYouTube } from "@/components/site/InsightsParts";
import { photos } from "@/lib/assets";
import { jsonLd, siteUrl } from "@/lib/seo";
import { cityLabel, citySlug, contactFrom, groupByCity, whatsappHref, formatPhone } from "@/lib/site";

export { SECTION_ORDER, withNewSections } from "@/lib/sections";
import { withNewSections } from "@/lib/sections";

const empty: PropertyPage = { items: [], nextCursor: null };
const countOf = (p: PropertyPage) => p.items.length + (p.nextCursor ? 1 : 0);

export async function HomeView({ lang, blocks, preview = false }: { lang: Lang; blocks: SiteBlocks; preview?: boolean }) {
  const t = getDictionary(lang);
  const s = getSiteDictionary(lang);
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [featured, locations, launches, residential, commercial, land, offices, company] = await Promise.all([
    safe(searchProperties(lang, { limit: "6", sort: "featured" }), empty),
    safe(getLocations(lang), []),
    safe(getProjects(lang, { limit: 6 }), { items: [], total: 0 }),
    safe(searchProperties(lang, { category: "residential", limit: "50" }), empty),
    safe(searchProperties(lang, { category: "commercial", limit: "50" }), empty),
    safe(searchProperties(lang, { category: "land", limit: "50" }), empty),
    safe(searchProperties(lang, { type: "office", limit: "50" }), empty),
    getCompany(),
  ]);
  const [associations, showcase] = await Promise.all([getAssociations(), getShowcase(lang)]);
  const x = getExtraDictionary(lang);
  const [insights, videos, testimonials] = await Promise.all([
    getArticles(lang, { kind: "article", limit: 3 }), getArticles(lang, { kind: "video", limit: 2 }), getTestimonials(lang),
  ]);
  const cities = groupByCity(locations);
  const projectStyle = showcase.find((i) => i.category === "project_style");
  const discoverPhoto = projectStyle ? { src: projectStyle.image.url, alt: projectStyle.image.alt }
    : photos.commercial ? { src: photos.commercial.src, alt: lang === "hi" ? photos.commercial.alt.hi : photos.commercial.alt.en } : null;
  const contact = contactFrom(company);

  const categoryCards: { key: "residential" | "commercial" | "land" | "office"; title: string; body: string; href: string; count: number }[] = [
    { key: "residential", ...s.category.residential, href: `/${lang}/residential`, count: countOf(residential) },
    { key: "commercial", ...s.category.commercial, href: `/${lang}/commercial`, count: countOf(commercial) },
    { key: "land", ...s.category.land, href: `/${lang}/plots`, count: countOf(land) },
    { key: "office", ...s.category.office, href: `/${lang}/properties?type=office`, count: countOf(offices) },
  ];

  // CMS blocks (published, or drafts in the staff preview). Anything not set falls back to the built-in defaults.
  const hero = blocks.hero;
  const heroImage = hero?.image
    ? { src: hero.image.url, alt: hero.image.alt ?? "", representative: hero.image.kind === "representative" }
    : photos.hero ? { src: photos.hero.src, alt: lang === "hi" ? photos.hero.alt.hi : photos.hero.alt.en, representative: true } : null;
  const tileOverrides = new Map((blocks.tiles ?? []).map((tile) => [tile.key, tile]));
  const tiles = categoryCards
    .map((c) => ({ ...c, override: tileOverrides.get(c.key) }))
    .filter((c) => c.override?.visible !== false)
    .sort((a, b) => (blocks.tiles ? blocks.tiles.findIndex((tile) => tile.key === a.key) - blocks.tiles.findIndex((tile) => tile.key === b.key) : 0));
  const order = withNewSections(blocks.sections?.order);
  const hidden = new Set(blocks.sections?.hidden ?? []);

  const org = {
    "@context": "https://schema.org", "@type": "RealEstateAgent",
    name: company.settings.display_name ?? "UNAVORA ANANT INFRA", url: `${siteUrl()}/${lang}`,
    logo: `${siteUrl()}/brand/unavora-logo-stacked.png`,
    ...(company.settings.tagline ? { slogan: company.settings.tagline } : {}),
    ...(contact.phone ? { telephone: contact.phone } : {}), ...(contact.email ? { email: contact.email } : {}),
    areaServed: cities.map((c) => ({ "@type": "City", name: c.city })),
  };

  const sections: Record<string, React.ReactNode> = {
    launches: (
      <>
      {/* 4. Newly launched projects: directly under the search. Approved projects only; honest empty state otherwise. */}
      <section aria-labelledby="launch-title" className="py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading id="launch-title" eyebrow={x.launch.eyebrow} title={x.launch.title} sub={x.launch.sub} />
            {launches.total > 0 && <span className="hidden sm:inline-flex"><Link href={`/${lang}/projects`} className={btn.outline}>{s.launches.viewAll}</Link></span>}
          </div>
          {launches.items.length > 0 ? (
            <>
              <ul aria-label={x.launch.title} className="-mx-4 mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&>li]:w-[85%] [&>li]:shrink-0 [&>li]:snap-start sm:[&>li]:w-auto">
                {launches.items.map((p, i) => <ProjectCard key={p.id} p={p} lang={lang} s={s} x={x} eager={i === 0} />)}
                {launches.items.length < 3 && (
                  <li className="hidden flex-col justify-between border border-dashed border-navy/20 p-8 sm:flex">
                    <div>
                      <p className="font-display text-2xl font-semibold">{x.launch.moreTitle}</p>
                      <p className="mt-3 text-sm leading-relaxed text-muted">{x.launch.moreNote}</p>
                    </div>
                    <Link href={`/${lang}/projects#project-interest`} className={`${btn.outline} mt-8 self-start`}>{x.launch.emptyCta}</Link>
                  </li>
                )}
              </ul>
              <div className="mt-6 sm:hidden"><Link href={`/${lang}/projects`} className={`${btn.outline} w-full`}>{s.launches.viewAll}</Link></div>
            </>
          ) : (
            // No approved real launch: no fictional project, a premium "Discover upcoming opportunities" panel with a
            // representative image and Register Your Interest (general project-interest lead, no project id).
            <div className="mt-10 grid overflow-hidden bg-navy text-ivory lg:grid-cols-[1.1fr_1fr]" data-testid="launch-discover">
              <div className="relative min-h-64 lg:min-h-full">
                {discoverPhoto && <Image src={discoverPhoto.src} alt={discoverPhoto.alt} fill sizes="(min-width:1024px) 55vw, 100vw" className="object-cover" />}
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy/80 via-navy/20 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-navy/40" />
                <RepresentativeTag label={x.showcase.imageNote} className="bottom-3 left-3" />
              </div>
              <div className="p-6 sm:p-10">
                <p className="eyebrow text-gold">{x.showcase.discoverEyebrow}</p>
                <p className="font-display mt-3 text-3xl font-semibold leading-tight">{x.showcase.discoverTitle}</p>
                <p className="mt-3 text-sm leading-relaxed text-ivory/75">{x.showcase.discoverNote}</p>
                <div className="mt-6 bg-white p-5 text-navy sm:p-6">
                  <EnquiryForm lang={lang} t={t} f={s.form} variant="callback" title={x.launch.emptyCta} id="launch-interest"
                    context="new_launches" locationLabel={x.showcase.location} />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
      </>
    ),
    featured: featured.items.length === 0 ? null : (
      <>
      {/* 5. Featured properties (director-chosen first, then newest) */}
      <section aria-labelledby="featured-title" className="bg-sand/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading id="featured-title" eyebrow={s.featured.eyebrow} title={s.featured.title} sub={s.featured.sub} />
            <span className="hidden sm:inline-flex"><Link href={`/${lang}/properties`} className={btn.outline}>{s.featured.viewAll}</Link></span>
          </div>
          {(
            <ul className="-mx-4 mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&>li]:w-[85%] [&>li]:shrink-0 [&>li]:snap-start sm:[&>li]:w-auto">
              {featured.items.map((p) => <PropertyCard key={p.id} p={p} lang={lang} t={t} s={s} />)}
            </ul>
          )}
          <div className="mt-6 sm:hidden"><Link href={`/${lang}/properties`} className={`${btn.outline} w-full`}>{s.featured.viewAll}</Link></div>
        </div>
      </section>
      </>
    ),
    showcase: showcase.length === 0 ? null : <ShowcaseSection lang={lang} items={showcase} x={x} />,
    categories: (
      <>
      {/* 6. Categories */}
      <section aria-labelledby="cat-title" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading id="cat-title" eyebrow={s.categories.eyebrow} title={s.categories.title} />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((c) => {
            const photo = c.override?.image
              ? { src: c.override.image.url, alt: { en: c.override.image.alt ?? c.title, hi: c.override.image.alt ?? c.title }, representative: c.override.image.kind === "representative" }
              : photos[c.key] ? { ...photos[c.key]!, representative: true } : null;
            return (
            <li key={c.key} className="group relative overflow-hidden bg-navy">
              <div className="relative aspect-[16/11] sm:aspect-[3/4]">
                {photo && (
                  <Image src={photo.src} alt={lang === "hi" ? photo.alt.hi : photo.alt.en} fill sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-105" />
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/45 to-navy/5" />
              {photo?.representative && <RepresentativeTag label={s.photo.representative} className="right-2 top-2" />}
              <div className="absolute inset-x-0 bottom-0 p-6 text-ivory">
                <p className="eyebrow !text-[0.65rem] text-gold">{s.categories.count(c.count)}</p>
                <h3 className="font-display mt-2 text-3xl font-semibold">
                  <Link href={c.href} className="after:absolute after:inset-0 after:content-['']">{c.override?.title ?? c.title}</Link>
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ivory/75">{c.override?.body ?? c.body}</p>
                <span className="mt-5 inline-flex items-center gap-2 border-b border-gold pb-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold [:lang(hi)_&]:tracking-normal">
                  {s.categories.explore}<Arrow className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </li>
            );
          })}
        </ul>
      </section>
      </>
    ),
    locations: (
      <>
      {/* H. Locations (from live listings) */}
      <section id="locations" aria-labelledby="loc-title" className="bg-navy py-20 text-ivory lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading id="loc-title" eyebrow={s.locations.eyebrow} title={s.locations.title} sub={s.locations.sub} light />
          {cities.length === 0 ? (
            <p className="mt-10 text-ivory/70">{s.locations.none}</p>
          ) : (
            <ul className="mt-12 grid gap-px bg-ivory/10 sm:grid-cols-2 lg:grid-cols-3">
              {cities.map((c, i) => (
                <li key={c.city} className="group relative bg-navy p-7 transition-colors hover:bg-navy-800 sm:p-9">
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-display text-sm font-semibold text-gold">0{i + 1}</span>
                    <span className="font-display text-5xl font-semibold leading-none text-gold sm:text-6xl">{c.total}</span>
                  </div>
                  <h3 className="font-display mt-8 text-3xl font-semibold sm:text-4xl">
                    <Link href={`/${lang}/locations/${citySlug(c.city)}`} className="after:absolute after:inset-0 after:content-['']">
                      {cityLabel(c.city, lang)}
                    </Link>
                  </h3>
                  <p className="mt-2 text-sm text-ivory/70">{s.locations.count(c.total)} · {c.localities.map((l) => l.name).join(" · ")}</p>
                  <span className="mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold [:lang(hi)_&]:tracking-normal">
                    {s.locations.view(cityLabel(c.city, lang))}<Arrow className="size-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      </>
    ),
    why: (
      <>
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
      </>
    ),
    about: (
      <>
      {/* F. About */}
      <section aria-labelledby="about-title" className="bg-white">
        <div className="mx-auto grid max-w-7xl lg:grid-cols-2">
          <div className="relative min-h-[320px] overflow-hidden bg-navy lg:min-h-[640px]">
            {photos.about ? (
              <Image src={photos.about.src} alt={lang === "hi" ? photos.about.alt.hi : photos.about.alt.en} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
            ) : (
              <div className="absolute inset-0"><PropertyArt kind="tower" seed={seedOf("about")} wide label={`${s.card.illustration}: ${s.about.title}`} /></div>
            )}
            {photos.about
              ? <RepresentativeTag label={s.photo.representative} className="bottom-3 left-3" />
              : <span className="absolute bottom-3 left-4 text-[0.65rem] uppercase tracking-[0.2em] text-ivory/60">{s.card.illustration}</span>}
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
      </>
    ),
    owner: (
      <>
      {/* List your property (owner submissions -> CRM review; never auto-published) */}
      <section aria-labelledby="owner-title" className="bg-navy text-ivory">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center lg:px-8">
          <div>
            <Eyebrow light>{x.owner.eyebrow}</Eyebrow>
            <p id="owner-title" className="font-display mt-3 text-3xl font-semibold">{x.owner.banner}</p>
          </div>
          <Link href={`/${lang}/list-your-property`} className={btn.gold}>{x.owner.bannerCta}<Arrow /></Link>
        </div>
      </section>
      </>
    ),
    partner: (
      <>
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
            {photos.partner && <RepresentativeTag label={s.photo.representative} className="bottom-3 right-3" />}
          </div>
        </div>
      </section>
      </>
    ),
    insights: (
      <>
      {/* J. Insights and videos: rendered only when published CMS content exists (never placeholders) */}
      {insights.items.length > 0 && (
        <section aria-labelledby="insights-title" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading id="insights-title" eyebrow={x.insights.eyebrow} title={x.insights.latest} />
            <Link href={`/${lang}/insights`} className={btn.outline}>{x.insights.viewAll}</Link>
          </div>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{insights.items.map((a) => <ArticleCard key={a.id} a={a} lang={lang} x={x} />)}</ul>
        </section>
      )}
      </>
    ),
    videos: (
      <>
      {videos.items.length > 0 && (
        <section aria-labelledby="videos-title" className="bg-sand/60 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading id="videos-title" eyebrow={x.videos.eyebrow} title={x.videos.title} />
            <ul className="mt-10 grid gap-6 md:grid-cols-2">
              {videos.items.map((v) => v.youtubeId && (
                <li key={v.id}>
                  <LiteYouTube id={v.youtubeId} title={v.title} labels={{ play: x.insights.play, note: x.insights.videoNote }} />
                  <Link href={`/${lang}/insights/${v.slug}`} className="font-display mt-3 block text-xl font-semibold hover:underline">{v.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      </>
    ),
    testimonials: (
      <>
      {/* K. Testimonials: only published reviews with the customer's recorded permission. Associations: none confirmed. */}
      {testimonials.length > 0 && (
        <section aria-labelledby="testimonials-title" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <SectionHeading id="testimonials-title" eyebrow={x.testimonials.eyebrow} title={x.testimonials.title} sub={x.testimonials.note} />
          <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {testimonials.slice(0, 6).map((tm, i) => (
              <li key={i} className="flex flex-col border-t-2 border-gold bg-white p-7 shadow-[var(--shadow-card)]">
                {tm.rating != null && <p aria-label={`${tm.rating} / 5`} className="text-gold-700">{"★".repeat(tm.rating)}<span className="text-navy/20">{"★".repeat(5 - tm.rating)}</span></p>}
                <blockquote className="font-display mt-3 text-xl leading-snug">“{tm.body}”</blockquote>
                <p className="mt-auto pt-5 text-sm font-semibold">{tm.displayName}{tm.propertyTitle && <span className="block text-xs font-normal text-muted">{tm.propertyTitle}</span>}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      </>
    ),
    associations: (
      <>
      {/* 15. Approved associations: only confirmed relationships; logos only with recorded permission */}
      {associations.length > 0 && (
        <section aria-labelledby="assoc-title" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionHeading id="assoc-title" eyebrow={x.associations.eyebrow} title={x.associations.title} sub={x.associations.sub} />
          <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {associations.map((a) => {
              const inner = a.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.logo.url} alt={a.logo.alt} loading="lazy" className="mx-auto max-h-14 w-auto object-contain" />
              ) : <span className="font-display text-lg font-semibold">{a.name}</span>;
              return (
                <li key={a.name} className="flex min-h-28 flex-col items-center justify-center gap-2 border border-navy/10 bg-white p-4 text-center">
                  {a.websiteUrl ? <a href={a.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={a.name}>{inner}</a> : inner}
                  <span className="text-xs text-muted">{x.associations.kinds[a.relationship] ?? a.relationship}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      </>
    ),
    enquiry: (
      <>
      {/* L. Final enquiry */}
      <section id="enquiry" aria-labelledby="cta-title" className="border-t border-navy/10 bg-sand/60">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-20 lg:px-8 lg:py-28">
          <div>
            <SectionHeading id="cta-title" eyebrow={s.cta.eyebrow} title={s.cta.title} sub={s.cta.sub} />
            <ul className="mt-8 space-y-3">
              {contact.phone && <li><a href={`tel:${contact.phone}`} className={btn.text}><Icon name="phone" />{s.cta.call}: {formatPhone(contact.phone)}</a></li>}
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
    ),
  };

  return (
    <>
      <script {...jsonLd(org)} />

      {/* B. Hero: licensed representative photo (captioned), compact on phones so the finder is above the fold */}
      <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-navy text-ivory">
        <div className="absolute inset-0 -z-10">
          {heroImage ? (
            <Image src={heroImage.src} alt={heroImage.alt} fill preload fetchPriority="high"
              sizes="100vw" className="object-cover object-[78%_50%] md:object-[70%_50%]" />
          ) : (
            <HeroArt title={s.hero.art} />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-navy/90 via-navy/60 to-navy/20 md:from-navy md:via-navy/60 md:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-navy/90 via-navy/40 to-transparent" />
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-7 pt-9 sm:px-6 sm:pb-40 sm:pt-20 lg:px-8 lg:pb-44 lg:pt-24">
          <div className="max-w-xl lg:max-w-2xl">
            <div className="rise"><Eyebrow light>{hero?.eyebrow ?? company.settings.tagline ?? s.hero.eyebrow}</Eyebrow></div>
            <h1 id="hero-title" className="rise rise-2 font-display mt-4 text-[2.1rem] font-semibold leading-[1.04] min-[400px]:text-[2.4rem] sm:mt-6 sm:text-6xl lg:text-[4.5rem]">
              {hero?.title ?? s.hero.title}
            </h1>
            <p className="rise rise-3 mt-4 max-w-md text-[0.95rem] leading-relaxed text-ivory/85 sm:mt-6 sm:max-w-lg sm:text-lg">{hero?.sub ?? s.hero.sub}</p>
            <div className="rise rise-3 mt-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:mt-9 sm:flex">
              <Link href={`/${lang}/properties`} className={`${btn.gold} !px-3 !text-[0.72rem] !tracking-[0.1em] sm:!px-6 sm:!text-[0.8rem] sm:!tracking-[0.16em]`}>{hero?.primaryLabel ?? s.hero.explore}<Arrow className="hidden size-4 sm:block" /></Link>
              <Link href={`/${lang}/contact`} className={`${btn.outlineLight} !px-3 !text-[0.72rem] !tracking-[0.1em] sm:!px-6 sm:!text-[0.8rem] sm:!tracking-[0.16em]`}>{hero?.secondaryLabel ?? s.hero.contact}</Link>
            </div>
            <div className="mt-6 sm:hidden">
              <FinderSheet labels={{ prompt: s.search.finderPrompt, open: s.search.finderOpen, close: s.search.closeFilters, title: s.search.title, submit: s.search.submit }}>
                <form action={`/${lang}/properties`} method="get" role="search" aria-label={s.search.title} className="grid gap-5">
                  <SearchFields lang={lang} s={s} cities={cities.map((c) => c.city)} />
                  <button className={`${btn.gold} w-full`}>{s.search.apply}</button>
                  <p className="text-xs text-muted">{s.search.saleNote}</p>
                </form>
              </FinderSheet>
            </div>
          </div>
        </div>
        {heroImage
          ? (heroImage.representative && <RepresentativeTag label={s.photo.representative} className="bottom-2 right-2 sm:bottom-auto sm:right-4 sm:top-4" />)
          : <span className="absolute right-4 top-4 text-[0.65rem] uppercase tracking-[0.2em] text-ivory/70 sm:right-6">{s.hero.illustration}</span>}
      </section>

      {/* C. Property finder (tablet/desktop), overlapping the hero */}
      <div className="relative z-10 mx-auto hidden max-w-7xl px-4 sm:-mt-28 sm:block sm:px-6 lg:-mt-32 lg:px-8">
        <HeroSearch lang={lang} s={s} cities={cities.map((c) => c.city)} />
      </div>

      {preview && <p role="status" className="sticky bottom-0 z-40 bg-red-800 px-4 py-2 text-center text-sm font-semibold text-white">{x.preview.banner}</p>}
      {order.filter((k) => !hidden.has(k) && sections[k]).map((k) => <Fragment key={k}>{sections[k]}</Fragment>)}
    </>
  );
}
