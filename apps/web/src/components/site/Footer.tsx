import Link from "next/link";
import type { ExtraDictionary } from "@/i18n/extra";
import type { SiteDictionary } from "@/i18n/site";
import type { CompanyInfo } from "@/lib/api";
import { cityLabel, contactFrom, whatsappHref, formatPhone } from "@/lib/site";
import { BRAND, brandName } from "@/lib/brand";
import { Logo } from "./Logo";
import { SocialIcon, socialNames } from "./SocialIcon";
import { Icon } from "./ui";

export type FooterExtra = { insights: string; listProperty: string; hasInsights: boolean; careers: string; hasCareers: boolean };

/**
 * Site footer. Contact details, offices, working hours and social accounts appear ONLY when verified in the CRM
 * (GET /api/v1/public/company); unconfigured accounts are simply absent. On phones the link lists collapse.
 */
export function Footer({ lang, t, company, extra, x }: { lang: string; t: SiteDictionary; company: CompanyInfo; extra: FooterExtra; x: ExtraDictionary }) {
  const L = (p: string) => `/${lang}${p}`;
  const c = contactFrom(company);
  const offices = company.offices.filter((o) => o.address);
  const year = new Date().getFullYear();
  const name = company.settings.display_name ?? brandName(lang);
  const link = "inline-flex min-h-10 items-center text-ivory/75 transition-colors hover:text-gold";
  const head = "eyebrow text-gold";
  const social = [
    ...Object.entries(company.social).filter(([, href]) => /^https:\/\/\S+$/.test(href)).map(([k, href]) => ({ key: k, href })),
    ...(c.whatsapp ? [{ key: "whatsapp", href: whatsappHref(c.whatsapp) }] : []),
  ];
  const columns: { title: string; links: [string, string][] }[] = [
    { title: t.footer.explore, links: [
      [L("/properties"), t.nav.allProperties], [L("/residential"), t.nav.residential], [L("/commercial"), t.nav.commercial],
      [L("/plots"), t.nav.plots], [L("/projects"), t.nav.newLaunches], [L("/list-your-property"), extra.listProperty],
    ] },
    { title: t.footer.company, links: [
      [L("/about"), t.nav.about], ...(extra.hasInsights ? [[L("/insights"), extra.insights] as [string, string]] : []),
      ...(extra.hasCareers ? [[L("/careers"), extra.careers] as [string, string]] : []),
      [L("/channel-partner"), t.nav.partner], [L("/contact"), t.nav.contact], [L("/account"), t.nav.account],
    ] },
  ];
  const list = (links: [string, string][]) => (
    <ul className="space-y-0.5 text-sm">{links.map(([href, label]) => <li key={href}><Link className={link} href={href}>{label}</Link></li>)}</ul>
  );

  return (
    <footer className="bg-navy text-ivory">
      <div className="mx-auto grid max-w-7xl gap-x-10 gap-y-0 px-4 py-14 md:gap-y-10 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] lg:px-8 lg:py-20">
        <div className="max-w-sm pb-8 md:pb-0">
          <Logo lang={lang} plate />
          <p className="font-display mt-5 text-lg italic text-gold">{company.settings.tagline ?? BRAND.tagline}</p>
          <p className="mt-3 text-sm leading-relaxed text-ivory/70">{t.footer.about}</p>
          {social.length > 0 && (
            <div className="mt-6">
              <p className={`${head} mb-3`}>{x.contactExtra.follow}</p>
              <ul className="flex flex-wrap gap-2" data-testid="footer-social">
                {social.map((s) => (
                  <li key={s.key}>
                    <a href={s.href} target="_blank" rel="noopener noreferrer me" aria-label={`${socialNames[s.key] ?? s.key} (${name})`}
                      className="inline-flex size-11 items-center justify-center border border-ivory/20 text-ivory/85 transition-colors hover:border-gold hover:text-gold">
                      <SocialIcon name={s.key} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            {/* phones: collapsed; tablet/desktop: open list */}
            <details className="group border-t border-ivory/10 md:hidden">
              <summary className={`${head} flex min-h-12 cursor-pointer list-none items-center justify-between`}>
                {col.title}<span aria-hidden className="text-ivory/60 transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="pb-3">{list(col.links)}</div>
            </details>
            <div className="hidden md:block">
              <p className={`${head} mb-3`}>{col.title}</p>
              {list(col.links)}
            </div>
          </div>
        ))}

        <div className="border-t border-ivory/10 pt-8 md:border-t-0 md:pt-0">
          <p className={`${head} mb-3`}>{t.footer.contact}</p>
          {c.phone || c.email || c.whatsapp || offices.length || company.settings.hours ? (
            <ul className="space-y-1 text-sm" data-testid="footer-contact">
              {c.phone && <li><a className={link} href={`tel:${c.phone}`}><Icon name="phone" className="mr-2 size-4" />{formatPhone(c.phone)}</a></li>}
              {c.whatsapp && <li><a className={link} href={whatsappHref(c.whatsapp)} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" className="mr-2 size-4" />WhatsApp</a></li>}
              {c.email && <li><a className={link} href={`mailto:${c.email}`}><Icon name="mail" className="mr-2 size-4" />{c.email}</a></li>}
              {company.settings.hours && <li className="pt-1 text-ivory/70"><span className="font-semibold text-ivory">{x.contactExtra.hours}: </span>{company.settings.hours}</li>}
              {offices.map((o) => (
                <li key={o.city + o.address} className="pt-3 text-ivory/70">
                  <span className="block font-semibold text-ivory">{o.kind === "registered" ? x.contactExtra.registered : x.contactExtra.branch} · {cityLabel(o.city, lang)}</span>
                  {o.address}{o.pinCode ? ` – ${o.pinCode}` : ""}
                  {o.hours && <span className="block">{o.hours}</span>}
                  {o.directionsUrl && <a className={`${link} text-gold`} href={o.directionsUrl} target="_blank" rel="noopener noreferrer">{x.contactExtra.directions} ↗</a>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-relaxed text-ivory/60">{t.footer.contactPending}</p>
          )}
          <Link href={L("/contact#enquiry")} className="mt-4 inline-flex min-h-11 items-center gap-2 border-b border-gold pb-1 text-sm font-semibold text-gold">
            {t.nav.enquire}
          </Link>
        </div>
      </div>
      <div className="border-t border-ivory/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-ivory/70 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>© {year} {name}. {t.footer.rights}</p>
          <ul className="flex flex-wrap gap-x-5">
            <li><Link className="inline-flex min-h-10 items-center hover:text-gold" href={L("/privacy")}>{t.footer.privacy}</Link></li>
            <li><Link className="inline-flex min-h-10 items-center hover:text-gold" href={L("/terms")}>{t.footer.terms}</Link></li>
            <li><Link className="inline-flex min-h-10 items-center hover:text-gold" href={L("/staff")}>{t.footer.staff}</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
