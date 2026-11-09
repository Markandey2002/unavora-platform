import Link from "next/link";
import { Suspense } from "react";
import type { SiteDictionary } from "@/i18n/site";
import { LangSwitch, MobileNav, type NavItem } from "./HeaderClient";
import { Logo } from "./Logo";
import { btn, Icon } from "./ui";

export function navItems(lang: string, t: SiteDictionary): NavItem[] {
  const L = (p: string) => `/${lang}${p}`;
  return [
    { label: t.nav.home, href: L("") },
    { label: t.nav.about, href: L("/about") },
    {
      label: t.nav.properties, href: L("/properties"),
      children: [
        { label: t.nav.allProperties, href: L("/properties") },
        { label: t.nav.residential, href: L("/residential"), note: t.category.residential.body },
        { label: t.nav.commercial, href: L("/commercial"), note: t.category.commercial.body },
        { label: t.nav.plots, href: L("/plots"), note: t.category.land.body },
        { label: t.nav.offices, href: L("/properties?type=office"), note: t.category.office.body },
      ],
    },
    {
      label: t.nav.projects, href: L("/projects"),
      children: [
        { label: t.nav.newLaunches, href: L("/projects") },
        { label: t.nav.locations, href: L("/#locations") },
      ],
    },
    { label: t.nav.partner, href: L("/channel-partner") },
    { label: t.nav.contact, href: L("/contact") },
  ];
}

export function Header({ lang, t }: { lang: string; t: SiteDictionary }) {
  const items = navItems(lang, t);
  const langLabels = { en: "EN", hi: "हिन्दी", aria: t.nav.language };
  return (
    <header className="sticky top-0 z-40 border-b border-navy/10 bg-ivory/90 backdrop-blur-md supports-[backdrop-filter]:bg-ivory/80">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href={`/${lang}`} className="flex min-h-11 shrink-0 items-center">
          <Logo lang={lang} compactOnTiny />
        </Link>

        <nav aria-label={t.nav.main} className="hidden lg:block">
          <ul className="flex items-center xl:gap-1">
            {items.slice(1).map((item) => (
              <li key={item.href} className="group relative">
                <Link href={item.href} aria-haspopup={item.children ? "true" : undefined}
                  className="flex min-h-11 items-center gap-1 whitespace-nowrap px-2 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-navy/80 transition-colors hover:text-navy [:lang(hi)_&]:text-sm [:lang(hi)_&]:tracking-normal xl:px-3 xl:text-[0.78rem]">
                  {item.label}
                  {item.children && <Icon name="chevron" className="size-3.5 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" />}
                </Link>
                {item.children && (
                  <div className="invisible absolute left-1/2 top-full w-72 -translate-x-1/2 pt-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                    <ul className="border border-navy/10 bg-ivory p-2 shadow-[var(--shadow-lift)]">
                      {item.children.map((c) => (
                        <li key={c.href}>
                          <Link href={c.href} className="block px-3 py-2.5 hover:bg-sand focus-visible:bg-sand">
                            <span className="block text-sm font-semibold text-navy">{c.label}</span>
                            {c.note && <span className="mt-0.5 block text-xs leading-snug text-muted">{c.note}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block"><Suspense><LangSwitch lang={lang} labels={langLabels} /></Suspense></div>
          <Link href={`/${lang}/account`} aria-label={t.nav.account} title={t.nav.account} className="hidden min-h-11 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap text-sm font-medium text-navy hover:text-gold-700 md:flex">
            <Icon name="user" className="size-5" /><span className="hidden 2xl:inline">{t.nav.account}</span>
          </Link>
          <span className="hidden sm:inline-flex"><Link href={`/${lang}/contact#enquiry`} className={`${btn.gold} !min-h-11 whitespace-nowrap !px-4`}>{t.nav.enquire}</Link></span>
          <Suspense>
            <MobileNav items={items} labels={{ open: t.nav.menu, close: t.nav.close, title: t.nav.main }}
              extra={
                <>
                  <LangSwitch lang={lang} labels={langLabels} />
                  <Link href={`/${lang}/account`} className={`${btn.outline} w-full`}><Icon name="user" />{t.nav.account}</Link>
                  <Link href={`/${lang}/contact#enquiry`} className={`${btn.gold} w-full`}>{t.nav.enquire}</Link>
                </>
              } />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
