import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnquiryForm } from "@/components/EnquiryForm";
import { PageHero } from "@/components/site/PageHero";
import { btn, Icon } from "@/components/site/ui";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { getCompany, getLocations } from "@/lib/api";
import { pageMeta } from "@/lib/seo";
import { cityLabel, contactFrom, groupByCity, whatsappHref } from "@/lib/site";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const s = getSiteDictionary(lang);
  return pageMeta(lang, "/contact", s.contact.title, s.contact.sub);
}

/** Contact: full enquiry form (-> CRM lead with the chosen enquiry type) and only verified contact channels. */
export default async function ContactPage({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDictionary(lang);
  const s = getSiteDictionary(lang);
  const [company, locations] = await Promise.all([getCompany(), getLocations(lang).catch(() => [])]);
  const c = contactFrom(company);
  const offices = company.offices.filter((o) => o.address);
  const cities = groupByCity(locations);
  return (
    <>
      <PageHero lang={lang} home={s.detail.home} breadcrumbLabel={s.detail.breadcrumb} crumbs={[{ label: s.contact.title }]}
        eyebrow={s.cta.eyebrow} title={s.contact.title} sub={s.contact.sub} />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:gap-20 lg:px-8 lg:py-20">
        <div id="enquiry" className="bg-white p-6 shadow-[var(--shadow-card)] sm:p-10">
          <EnquiryForm lang={lang} t={t} f={s.form} variant="full" title={s.form.title} id="contact-enquiry" />
        </div>
        <div className="space-y-10">
          <section aria-labelledby="channels">
            <h2 id="channels" className="font-display text-2xl font-semibold">{s.contact.channels}</h2>
            {c.phone || c.whatsapp || c.email ? (
              <ul className="mt-4 space-y-3">
                {c.phone && <li><a href={`tel:${c.phone}`} className={`${btn.outline} w-full justify-start`}><Icon name="phone" />{s.cta.call}: {c.phone}</a></li>}
                {c.whatsapp && <li><a href={whatsappHref(c.whatsapp, s.cta.whatsappText)} target="_blank" rel="noopener noreferrer" className={`${btn.outline} w-full justify-start`}><Icon name="whatsapp" />{s.cta.whatsapp}</a></li>}
                {c.email && <li><a href={`mailto:${c.email}`} className={`${btn.outline} w-full justify-start`}><Icon name="mail" />{c.email}</a></li>}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.footer.contactPending}</p>
            )}
          </section>
          <section aria-labelledby="cities">
            <h2 id="cities" className="font-display text-2xl font-semibold">{s.contact.offices}</h2>
            {offices.length > 0 ? (
              <ul className="mt-4 grid gap-4">
                {offices.map((o) => (
                  <li key={o.city + o.address} className="border-l-2 border-gold bg-white p-4 text-sm">
                    <p className="font-semibold">{cityLabel(o.city, lang)}</p><p className="mt-1 text-muted">{o.address}{o.pinCode ? ` – ${o.pinCode}` : ""}</p>
                    {o.phone && <a href={`tel:${o.phone}`} className="mt-1 inline-block underline">{o.phone}</a>}
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
