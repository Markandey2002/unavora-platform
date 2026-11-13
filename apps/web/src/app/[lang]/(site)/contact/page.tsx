import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnquiryForm } from "@/components/EnquiryForm";
import { PageHero } from "@/components/site/PageHero";
import { btn, Icon } from "@/components/site/ui";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { getCompany, getLocations, getShowcase, searchProperties } from "@/lib/api";
import { getExtraDictionary } from "@/i18n/extra";
import { seoMeta } from "@/lib/seo";
import { cityLabel, contactFrom, groupByCity, whatsappHref, formatPhone } from "@/lib/site";
import { SocialIcon, socialNames } from "@/components/site/SocialIcon";

type Props = { params: Promise<{ lang: string }>; searchParams?: Promise<{ showcase?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const s = getSiteDictionary(lang);
  return seoMeta(lang, "/contact", s.contact.title, s.contact.sub);
}

/** Contact: full enquiry form (-> CRM lead with the chosen enquiry type) and only verified contact channels. */
export default async function ContactPage({ params, searchParams }: Props) {
  const { lang } = await params;
  const showcaseParam = (await searchParams)?.showcase;
  if (!isLang(lang)) notFound();
  const t = getDictionary(lang);
  const s = getSiteDictionary(lang);
  const [company, locations, listing] = await Promise.all([getCompany(), getLocations(lang).catch(() => []),
    searchProperties(lang, { limit: "50" }).catch(() => ({ items: [], nextCursor: null }))]);
  const x = getExtraDictionary(lang);
  // Enquiry from an illustrative showcase card: only a PUBLISHED item is accepted (the API checks again).
  const showcase = showcaseParam && /^[0-9a-f-]{36}$/.test(showcaseParam)
    ? (await getShowcase(lang)).find((i) => i.id === showcaseParam) : undefined;
  const c = contactFrom(company);
  const offices = company.offices.filter((o) => o.address);
  const cities = groupByCity(locations);
  return (
    <>
      <PageHero lang={lang} home={s.detail.home} breadcrumbLabel={s.detail.breadcrumb} crumbs={[{ label: s.contact.title }]}
        eyebrow={s.cta.eyebrow} title={s.contact.title} sub={s.contact.sub} />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:gap-20 lg:px-8 lg:py-20">
        <div id="enquiry" className="bg-white p-6 shadow-[var(--shadow-card)] sm:p-10">
          <EnquiryForm lang={lang} t={t} f={s.form} variant="full" title={s.form.title} id="contact-enquiry"
            {...(showcase ? { showcaseId: showcase.id, locationLabel: x.showcase.location, about: x.showcase.about.replace("{t}", showcase.title) } : {})}
            properties={listing.items.map((p) => ({ id: p.id, title: p.title }))} propertyLabels={{ label: x.contact.property, none: x.contact.none }} />
        </div>
        <div className="space-y-10">
          <section aria-labelledby="channels">
            <h2 id="channels" className="font-display text-2xl font-semibold">{s.contact.channels}</h2>
            {c.phone || c.whatsapp || c.email ? (
              <ul className="mt-4 space-y-3">
                {c.phone && <li><a href={`tel:${c.phone}`} className={`${btn.outline} w-full justify-start`}><Icon name="phone" />{s.cta.call}: {formatPhone(c.phone)}</a></li>}
                {c.whatsapp && <li><a href={whatsappHref(c.whatsapp, s.cta.whatsappText)} target="_blank" rel="noopener noreferrer" className={`${btn.outline} w-full justify-start`}><Icon name="whatsapp" />{s.cta.whatsapp}</a></li>}
                {c.email && <li><a href={`mailto:${c.email}`} className={`${btn.outline} w-full justify-start`}><Icon name="mail" />{c.email}</a></li>}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.footer.contactPending}</p>
            )}
            {company.settings.hours && <p className="mt-4 text-sm"><span className="font-semibold">{x.contactExtra.hours}: </span>{company.settings.hours}</p>}
            {Object.keys(company.social).length > 0 && (
              <div className="mt-6">
                <p className="eyebrow text-gold-700">{x.contactExtra.follow}</p>
                <ul className="mt-3 flex flex-wrap gap-2" data-testid="contact-social">
                  {Object.entries(company.social).filter(([, href]) => /^https:\/\/\S+$/.test(href)).map(([k, href]) => (
                    <li key={k}>
                      <a href={href} target="_blank" rel="noopener noreferrer me" aria-label={socialNames[k] ?? k}
                        className="inline-flex size-11 items-center justify-center border border-navy/20 text-navy hover:border-navy"><SocialIcon name={k} /></a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <section aria-labelledby="cities">
            <h2 id="cities" className="font-display text-2xl font-semibold">{s.contact.offices}</h2>
            {offices.length > 0 ? (
              <ul className="mt-4 grid gap-4">
                {offices.map((o) => (
                  <li key={o.city + o.address} className="border-l-2 border-gold bg-white p-4 text-sm">
                    <p className="font-semibold">{o.kind === "registered" ? x.contactExtra.registered : x.contactExtra.branch} · {cityLabel(o.city, lang)}</p>
                    <p className="mt-1 text-muted">{o.address}{o.pinCode ? ` – ${o.pinCode}` : ""}</p>
                    {o.hours && <p className="mt-1 text-muted">{x.contactExtra.hours}: {o.hours}</p>}
                    <p className="mt-1 flex flex-wrap gap-4">
                      {o.phone && <a href={`tel:${o.phone}`} className="inline-flex min-h-10 items-center underline">{formatPhone(o.phone)}</a>}
                      {o.directionsUrl && <a href={o.directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center underline">{x.contactExtra.directions} ↗</a>}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-4 flex flex-wrap gap-3">
                {cities.map((x) => (
                  <li key={x.city}>
                    <Link href={`/${lang}/properties?city=${encodeURIComponent(x.city)}`} className="inline-flex min-h-11 items-center gap-2 border border-navy/15 bg-white px-4 text-sm hover:border-navy">
                      <Icon name="pin" className="size-4 text-gold-700" />{cityLabel(x.city, lang)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Link href={`/${lang}/channel-partner`} className={btn.text}>{s.partner.cta} →</Link>
        </div>
      </div>
    </>
  );
}
