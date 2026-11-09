import Link from "next/link";
import type { CompanyInfo } from "@/lib/api";
import { contactFrom, whatsappHref } from "@/lib/site";
import type { SiteDictionary } from "@/i18n/site";
import { Logo } from "./Logo";
import { Icon } from "./ui";

/** Contact details and social links appear only when verified in the database (GET /api/v1/public/company). */
export function Footer({ lang, t, company }: { lang: string; t: SiteDictionary; company: CompanyInfo }) {
  const L = (p: string) => `/${lang}${p}`;
  const c = contactFrom(company);
  const offices = company.offices.filter((o) => o.address);
  const year = new Date().getFullYear();
  const name = company.settings.display_name ?? "UNAVORA ANANT INFRA";
  const col = "space-y-1 text-sm";
  const link = "inline-flex min-h-10 items-center text-ivory/70 transition-colors hover:text-gold";
  const head = "eyebrow mb-3 text-gold";
  return (
    <footer className="bg-navy text-ivory">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8 lg:py-20">
        <div className="max-w-sm">
          <Logo lang={lang} plate />
          <p className="mt-5 text-sm leading-relaxed text-ivory/70">{t.footer.about}</p>
          {company.settings.tagline && <p className="font-display mt-5 text-lg italic text-gold">{company.settings.tagline}</p>}
          {c.social.length > 0 && (
            <div className="mt-6">
              <p className={head}>{t.footer.follow}</p>
              <ul className="flex flex-wrap gap-3">
                {c.social.map((s) => <li key={s.href}><a href={s.href} rel="noopener noreferrer me" target="_blank" className={link}>{s.label}</a></li>)}
              </ul>
            </div>
          )}
        </div>
        <div>
          <p className={head}>{t.footer.explore}</p>
          <ul className={col}>
            <li><Link className={link} href={L("/properties")}>{t.nav.allProperties}</Link></li>
            <li><Link className={link} href={L("/residential")}>{t.nav.residential}</Link></li>
            <li><Link className={link} href={L("/commercial")}>{t.nav.commercial}</Link></li>
            <li><Link className={link} href={L("/plots")}>{t.nav.plots}</Link></li>
            <li><Link className={link} href={L("/projects")}>{t.nav.newLaunches}</Link></li>
          </ul>
        </div>
        <div>
          <p className={head}>{t.footer.company}</p>
          <ul className={col}>
            <li><Link className={link} href={L("/about")}>{t.nav.about}</Link></li>
            <li><Link className={link} href={L("/channel-partner")}>{t.nav.partner}</Link></li>
            <li><Link className={link} href={L("/contact")}>{t.nav.contact}</Link></li>
            <li><Link className={link} href={L("/account")}>{t.nav.account}</Link></li>
            <li><Link className={link} href={L("/staff")}>{t.footer.staff}</Link></li>
          </ul>
        </div>
        <div>
          <p className={head}>{t.footer.contact}</p>
          {c.phone || c.email || c.whatsapp || offices.length ? (
            <ul className={col}>
              {c.phone && <li><a className={link} href={`tel:${c.phone}`}><Icon name="phone" className="mr-2 size-4" />{c.phone}</a></li>}
              {c.whatsapp && <li><a className={link} href={whatsappHref(c.whatsapp)} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" className="mr-2 size-4" />WhatsApp</a></li>}
              {c.email && <li><a className={link} href={`mailto:${c.email}`}><Icon name="mail" className="mr-2 size-4" />{c.email}</a></li>}
              {offices.map((o) => (
                <li key={o.city + o.address} className="pt-2 text-ivory/70">
                  <span className="block font-semibold text-ivory">{o.city}</span>{o.address}{o.pinCode ? ` – ${o.pinCode}` : ""}
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
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-ivory/70 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>© {year} {name}. {t.footer.rights}</p>
          <ul className="flex flex-wrap gap-x-5">
            <li><Link className="inline-flex min-h-10 items-center hover:text-gold" href={L("/privacy")}>{t.footer.privacy}</Link></li>
            <li><Link className="inline-flex min-h-10 items-center hover:text-gold" href={L("/terms")}>{t.footer.terms}</Link></li>
          </ul>
          <p>{t.footer.sample}</p>
        </div>
      </div>
    </footer>
  );
}
