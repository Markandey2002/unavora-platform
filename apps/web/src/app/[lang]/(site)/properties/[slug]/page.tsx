import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CustomerRequestForm } from "@/components/CustomerRequestForm";
import { EnquiryForm } from "@/components/EnquiryForm";
import { areaText, PropertyCard, priceText } from "@/components/PropertyCard";
import { PhotoPending } from "@/components/site/PhotoPending";
import { SampleBadge } from "@/components/site/SampleBadge";
import { MapEmbed } from "@/components/site/MapEmbed";
import { btn, Eyebrow, Icon } from "@/components/site/ui";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { findSlugs, getCompany, getProperty, searchProperties, type PropertySummary } from "@/lib/api";
import { currentCustomer, customerApi, customerAuthMode, sessionFrom } from "@/lib/customer";
import { jsonLd, pageMeta, siteUrl } from "@/lib/seo";
import { cityLabel, citySlug, contactFrom, whatsappHref } from "@/lib/site";
import { galleryLabels, getExtraDictionary } from "@/i18n/extra";
import { FavouriteButton } from "@/components/site/FavouriteButton";
import { FloorPlans, Gallery } from "@/components/site/Gallery";

type Props = { params: Promise<{ lang: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang)) return {};
  const d = await getProperty(lang, slug);
  if (!d) return {};
  const p = d.summary;
  const desc = d.description ?? `${p.propertyType} · ${p.locality}, ${p.city}`;
  return pageMeta(lang, `/properties/${slug}`, p.title, desc.slice(0, 300), { paths: { en: d.slugs.en && `/properties/${d.slugs.en}`, hi: d.slugs.hi && `/properties/${d.slugs.hi}` } });
}

async function related(lang: string, p: PropertySummary): Promise<PropertySummary[]> {
  const sameCity = await searchProperties(lang, { city: p.city, limit: "4" }).catch(() => ({ items: [] as PropertySummary[] }));
  let items = sameCity.items.filter((x) => x.id !== p.id);
  if (items.length < 3) {
    const sameCat = await searchProperties(lang, { category: p.category, limit: "4" }).catch(() => ({ items: [] as PropertySummary[] }));
    items = [...items, ...sameCat.items.filter((x) => x.id !== p.id && !items.some((y) => y.id === x.id))];
  }
  return items.slice(0, 3);
}

export default async function PropertyPage({ params }: Props) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const d = await getProperty(lang, slug);
  if (!d) {
    // A slug from the other language (language switch, shared link): go to this language's page, or to the language the
    // item exists in. Unknown or unpublished items stay 404.
    const other = await findSlugs("properties", slug);
    if (!other) notFound();
    redirect(other[lang] ? `/${lang}/properties/${other[lang]}` : other.en ? `/en/properties/${other.en}` : `/hi/properties/${other.hi}`);
  }
  const t = getDictionary(lang);
  const s = getSiteDictionary(lang);
  const p = d.summary;
  const store = await cookies();
  const [me, more, company] = await Promise.all([currentCustomer(store), related(lang, p), getCompany()]);
  const x = getExtraDictionary(lang);
  const session = me ? sessionFrom(store) : undefined;
  const favs = session ? await customerApi.favourites(session, lang) : null;
  const saved = !!(favs?.ok && favs.data.some((f) => f.propertyId === p.id));
  const contact = contactFrom(company);
  const area = areaText(p, s);
  const facts: [string, string][] = [
    [s.detail.type, p.propertyType],
    ...(p.builtUpArea != null ? [[s.detail.builtUp, `${Number(p.builtUpArea).toLocaleString("en-IN")} ${s.areaUnit[p.areaUnit] ?? p.areaUnit}`] as [string, string]] : []),
    ...(p.plotArea != null ? [[s.detail.plot, `${Number(p.plotArea).toLocaleString("en-IN")} ${s.areaUnit[p.areaUnit] ?? p.areaUnit}`] as [string, string]] : []),
    ...(p.bedrooms != null ? [[s.detail.bedrooms, String(p.bedrooms)] as [string, string]] : []),
    ...(p.bathrooms != null ? [[s.detail.bathrooms, String(p.bathrooms)] as [string, string]] : []),
    [s.detail.availability, p.availability === "under_offer" ? s.card.underOffer : s.card.available],
    [s.detail.listing, `#${p.number}`],
  ];
  const url = `${siteUrl()}/${lang}/properties/${slug}`;
  const ld = {
    "@context": "https://schema.org", "@type": "RealEstateListing", name: p.title, url, inLanguage: lang,
    ...(d.description ? { description: d.description } : {}),
    contentLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: `${p.locality}, ${p.city}`, addressCountry: "IN" } },
    ...(p.price != null && !p.priceOnRequest ? { offers: { "@type": "Offer", price: p.price, priceCurrency: "INR", availability: "https://schema.org/InStock" } } : {}),
  };

  return (
    <div className="pb-24 lg:pb-0">
      <script {...jsonLd(ld)} />
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <nav aria-label={s.detail.breadcrumb} className="text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href={`/${lang}`} className="inline-flex min-h-6 min-w-6 items-center hover:text-navy">{s.detail.home}</Link></li>
            <li aria-hidden>/</li>
            <li><Link href={`/${lang}/properties`} className="inline-flex min-h-6 min-w-6 items-center hover:text-navy">{s.nav.properties}</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="line-clamp-1 text-navy">{p.title}</li>
          </ol>
        </nav>
      </div>

      <section className="mx-auto mt-5 max-w-7xl sm:px-6 lg:px-8">
        {d.images.length > 0 ? <Gallery images={d.images} title={p.title} labels={galleryLabels(x)} /> : (
          <figure className="relative aspect-[4/3] overflow-hidden sm:aspect-[16/6]">
            <PhotoPending label={x.photo.pending} note={x.photo.pendingNote} />
          </figure>
        )}
      </section>

      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14 lg:px-8 lg:py-14">
        <article>
          <p className="flex items-center gap-1.5 text-sm text-muted"><Icon name="pin" className="size-4 text-gold-700" />{p.locality}, {cityLabel(p.city, lang)}</p>
          <h1 className="font-display mt-2 text-4xl font-semibold leading-tight sm:text-5xl">{p.title}</h1>
          {p.sample && <p className="mt-3"><SampleBadge label={x.sample.badge} note={x.sample.note} /> <span className="text-sm text-red-800">{x.sample.note}</span></p>}
          <div className="mt-4">
            {me ? <FavouriteButton propertyId={p.id} initial={saved} labels={x.favourite} />
              : customerAuthMode() !== "disabled" && <Link href={`/${lang}/account`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{x.favourite.signIn}</Link>}
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-2 border-y border-navy/10 py-5">
            <div>
              <p className="eyebrow text-muted">{s.detail.price}</p>
              <p className="font-display mt-1 text-4xl font-semibold text-navy">{priceText(p, t)}</p>
            </div>
            {p.priceNegotiable && !p.priceOnRequest && p.price != null && <p className="pb-1 text-sm text-muted">{t.negotiable}</p>}
            <div className="flex flex-wrap gap-x-5 gap-y-2 pb-1 text-sm text-navy/80">
              {p.bedrooms != null && <span className="flex items-center gap-1.5"><Icon name="bed" className="size-4" />{p.bedrooms} {t.beds}</span>}
              {p.bathrooms != null && <span className="flex items-center gap-1.5"><Icon name="bath" className="size-4" />{p.bathrooms} {t.baths}</span>}
              {area && <span className="flex items-center gap-1.5"><Icon name="area" className="size-4" />{area}</span>}
            </div>
          </div>

          <section aria-labelledby="facts" className="mt-10">
            <h2 id="facts" className="font-display text-2xl font-semibold">{s.detail.facts}</h2>
            <dl className="mt-5 grid grid-cols-2 border-l border-t border-navy/10 sm:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k} className="border-b border-r border-navy/10 p-4">
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted [:lang(hi)_&]:tracking-normal">{k}</dt>
                  <dd className="mt-1 font-semibold text-navy">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {d.description && (
            <section aria-labelledby="about-prop" className="mt-10">
              <h2 id="about-prop" className="font-display text-2xl font-semibold">{s.detail.about}</h2>
              <p className="mt-4 max-w-3xl leading-relaxed text-navy/85">{d.description}</p>
            </section>
          )}

          {d.amenities.length > 0 && (
            <section aria-labelledby="amenities" className="mt-10">
              <h2 id="amenities" className="font-display text-2xl font-semibold">{t.amenities}</h2>
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {d.amenities.map((a) => (
                  <li key={a} className="flex items-center gap-2 text-sm"><Icon name="check" className="size-4 text-gold-700" />{a}</li>
                ))}
              </ul>
            </section>
          )}

          {d.floorPlans.length > 0 && <FloorPlans plans={d.floorPlans} title={p.title} heading={x.gallery.floorPlans} labels={galleryLabels(x)} />}

          <section aria-labelledby="loc" className="mt-10 bg-sand/60 p-6">
            <h2 id="loc" className="font-display text-2xl font-semibold">{s.detail.location}</h2>
            <p className="mt-3 flex items-center gap-2 font-semibold"><Icon name="pin" className="size-5 text-gold-700" />{p.locality}, {cityLabel(p.city, lang)}</p>
            <p className="mt-2 text-sm text-muted">{d.map?.precision === "exact" ? x.map.exactNote : s.detail.locationNote}</p>
            {d.map && <MapEmbed point={d.map} title={`${s.detail.location}: ${p.locality}, ${p.city}`} labels={{ show: x.map.show, approximate: x.map.approximate, exact: x.map.exact, attribution: x.map.attribution }} />}
            <div className="mt-2 flex flex-wrap gap-x-6">
              <Link href={`/${lang}/locations/${citySlug(p.city)}`} className={btn.text}>{s.locations.view(cityLabel(p.city, lang))} →</Link>
              <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${p.locality}, ${p.city}, India`)}`} target="_blank" rel="noopener noreferrer"
                className={btn.text} title={x.map.note}>{x.map.view} ↗</a>
            </div>
          </section>
        </article>

        <aside id="enquire" className="lg:sticky lg:top-24 lg:self-start">
          <div className="bg-white p-6 shadow-[var(--shadow-card)]">
            {me?.whatsappVerified ? (
              <CustomerRequestForm propertyId={p.id} t={t} />
            ) : (
              <>
                <EnquiryForm propertyId={p.id} lang={lang} t={t} f={s.form} id="property-enquiry" />
                {customerAuthMode() !== "disabled" && (
                  <Link href={`/${lang}/account`} className="mt-3 block min-h-11 content-center text-center text-sm underline underline-offset-4">
                    {me ? t.verifyFirst : t.signInForFaster}
                  </Link>
                )}
              </>
            )}
          </div>
          {(contact.phone || contact.whatsapp) && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {contact.phone && <a href={`tel:${contact.phone}`} className={btn.outline}><Icon name="phone" />{s.detail.call}</a>}
              {contact.whatsapp && (
                <a href={whatsappHref(contact.whatsapp, s.detail.whatsappText(p.title))} target="_blank" rel="noopener noreferrer" className={btn.outline}>
                  <Icon name="whatsapp" />{s.detail.whatsapp}
                </a>
              )}
            </div>
          )}
        </aside>
      </div>

      {more.length > 0 && (
        <section aria-labelledby="related" className="border-t border-navy/10 bg-sand/40">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <Eyebrow>{s.featured.eyebrow}</Eyebrow>
            <h2 id="related" className="font-display mt-3 text-3xl font-semibold">{s.detail.related}</h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((x) => <PropertyCard key={x.id} p={x} lang={lang} t={t} s={s} />)}
            </ul>
          </div>
        </section>
      )}

      {/* Phones: contact actions stay within reach; the page has bottom padding so nothing is hidden behind the bar. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-navy/10 bg-ivory/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display truncate text-xl font-semibold leading-tight">{priceText(p, t)}</p>
            <p className="truncate text-xs text-muted">{p.locality}, {cityLabel(p.city, lang)}</p>
          </div>
          {contact.phone && <a href={`tel:${contact.phone}`} aria-label={s.detail.call} className="flex size-12 items-center justify-center border border-navy/20"><Icon name="phone" /></a>}
          {contact.whatsapp && (
            <a href={whatsappHref(contact.whatsapp, s.detail.whatsappText(p.title))} target="_blank" rel="noopener noreferrer" aria-label={s.detail.whatsapp}
              className="flex size-12 items-center justify-center border border-navy/20"><Icon name="whatsapp" /></a>
          )}
          <a href="#enquire" className={`${btn.gold} !min-h-12 !px-5`}>{s.detail.enquire}</a>
        </div>
      </div>
    </div>
  );
}
