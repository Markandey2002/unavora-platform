import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PropertyArt, seedOf } from "@/components/site/Art";
import { PageHero } from "@/components/site/PageHero";
import { Arrow, btn, Eyebrow, Icon, RepresentativeTag, SectionHeading } from "@/components/site/ui";
import { isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { getLocations } from "@/lib/api";
import { brand, photos } from "@/lib/assets";
import { seoMeta } from "@/lib/seo";
import { cityLabel, groupByCity } from "@/lib/site";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const s = getSiteDictionary(lang);
  return seoMeta(lang, "/about", s.nav.about, s.about.p1);
}

export default async function AboutPage({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const s = getSiteDictionary(lang);
  const cities = groupByCity(await getLocations(lang).catch(() => []));
  const alt = brand.logoOnLight ? (lang === "hi" ? brand.logoOnLight.alt.hi : brand.logoOnLight.alt.en) : "UNAVORA ANANT INFRA";
  return (
    <>
      <PageHero lang={lang} home={s.detail.home} breadcrumbLabel={s.detail.breadcrumb} crumbs={[{ label: s.nav.about }]}
        eyebrow={s.about.eyebrow} title={s.about.title} sub={s.about.p1} />

      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8 lg:py-24">
        <div>
          <p className="font-display text-2xl leading-snug text-navy sm:text-3xl">{s.about.p2}</p>
          <div className="mt-10 inline-flex bg-white p-6 shadow-[var(--shadow-card)]">
            <Image src="/brand/unavora-logo-stacked.png" width={976} height={547} sizes="320px" alt={alt} className="h-auto w-64 sm:w-80" />
          </div>
        </div>
        <div className="relative min-h-[320px] overflow-hidden bg-navy">
          {photos.about ? (
            <Image src={photos.about.src} alt={lang === "hi" ? photos.about.alt.hi : photos.about.alt.en} fill sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />
          ) : (
            <div className="absolute inset-0"><PropertyArt kind="villa" seed={seedOf("about-page")} label={`${s.card.illustration}: ${s.about.title}`} /></div>
          )}
          {photos.about
            ? <RepresentativeTag label={s.photo.representative} className="bottom-3 left-3" />
            : <span className="absolute bottom-3 left-4 text-[0.65rem] uppercase tracking-[0.2em] text-ivory/60">{s.card.illustration}</span>}
        </div>
      </section>

      <section aria-label={`${s.about.visionTitle} · ${s.about.missionTitle}`} className="bg-navy text-ivory">
        <div className="mx-auto grid max-w-7xl gap-px bg-ivory/10 sm:grid-cols-2">
          {[[s.about.visionTitle, s.about.vision], [s.about.missionTitle, s.about.mission]].map(([k, v]) => (
            <div key={k} className="bg-navy px-4 py-14 sm:px-10 lg:px-14 lg:py-20">
              <Eyebrow light>{k}</Eyebrow>
              <p className="font-display mt-5 text-2xl leading-snug sm:text-3xl">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="values" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading id="values" eyebrow={s.about.eyebrow} title={s.about.valuesTitle} />
        <ul className="mt-12 grid gap-px bg-navy/10 sm:grid-cols-2 lg:grid-cols-4">
          {s.about.values.map((v, i) => (
            <li key={v.title} className="bg-ivory p-8">
              <span className="font-display text-sm font-semibold text-gold-700">0{i + 1}</span>
              <h3 className="font-display mt-3 text-2xl font-semibold">{v.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{v.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="approach" className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
          <SectionHeading id="approach" eyebrow={s.why.eyebrow} title={s.about.approachTitle} />
          <ol className="space-y-6">
            {s.about.approach.map((a, i) => (
              <li key={a} className="flex gap-5 border-b border-navy/10 pb-6">
                <span className="font-display text-3xl font-semibold text-gold-700">{i + 1}</span>
                <p className="pt-2 text-lg text-navy">{a}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {cities.length > 0 && (
        <section aria-labelledby="where" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <SectionHeading id="where" eyebrow={s.locations.eyebrow} title={s.locations.title} sub={s.locations.sub} />
          <ul className="mt-10 flex flex-wrap gap-3">
            {cities.map((c) => (
              <li key={c.city}>
                <Link href={`/${lang}/properties?city=${encodeURIComponent(c.city)}`} className="inline-flex min-h-12 items-center gap-2 border border-navy/15 bg-white px-5 hover:border-navy">
                  <Icon name="pin" className="size-4 text-gold-700" />{cityLabel(c.city, lang)}<span className="text-sm text-muted">· {s.locations.count(c.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-gold-100">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center lg:px-8">
          <p className="font-display text-3xl font-semibold">{s.cta.title}</p>
          <Link href={`/${lang}/contact`} className={btn.navy}>{s.nav.contact}<Arrow /></Link>
        </div>
      </section>
    </>
  );
}
