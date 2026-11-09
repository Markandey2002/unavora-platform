"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavItem = { label: string; href: string; children?: { label: string; href: string; note?: string }[] };

/** Same page in the other language (keeps the path and query), e.g. /en/properties?city=Noida -> /hi/properties?city=Noida. */
export function LangSwitch({ lang, labels }: { lang: string; labels: { en: string; hi: string; aria: string } }) {
  const path = usePathname() ?? `/${lang}`;
  const qs = useSearchParams()?.toString();
  const to = (l: string) => `${path.replace(/^\/(en|hi)(?=\/|$)/, `/${l}`)}${qs ? `?${qs}` : ""}`;
  return (
    <div role="group" aria-label={labels.aria} className="flex items-center border border-navy/15 text-xs font-semibold">
      {(["en", "hi"] as const).map((l) => (
        <Link key={l} href={to(l)} lang={l} hrefLang={l} aria-current={l === lang ? "true" : undefined}
          className={`flex min-h-9 min-w-10 items-center justify-center px-2.5 ${l === lang ? "bg-navy text-ivory" : "text-navy hover:bg-sand"}`}>
          {l === "en" ? labels.en : labels.hi}
        </Link>
      ))}
    </div>
  );
}

/** Mobile navigation drawer: full-height panel, Esc / backdrop close, focus moves in and back, page scroll locked. */
export function MobileNav({ items, labels, extra }: {
  items: NavItem[]; labels: { open: string; close: string; title: string }; extra: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const btn = button.current;
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); btn?.focus(); };
  }, [open]);

  return (
    <>
      <button ref={button} type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-nav"
        className="flex size-11 items-center justify-center text-navy lg:hidden" aria-label={labels.open}>
        <svg viewBox="0 0 20 20" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M3 6h14M3 10h14M7 14h10" /></svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label={labels.close} tabIndex={-1} onClick={() => setOpen(false)} className="absolute inset-0 bg-navy/50 backdrop-blur-sm" />
          <div ref={panel} id="mobile-nav" role="dialog" aria-modal="true" aria-label={labels.title}
            className="rise absolute inset-y-0 right-0 flex w-[min(22rem,100%)] flex-col overflow-y-auto bg-ivory shadow-2xl">
            <div className="flex items-center justify-between border-b border-navy/10 px-5 py-3">
              <span className="eyebrow text-gold-700">{labels.title}</span>
              <button type="button" onClick={() => setOpen(false)} className="flex size-11 items-center justify-center" aria-label={labels.close}>
                <svg viewBox="0 0 20 20" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="m5 5 10 10M15 5 5 15" /></svg>
              </button>
            </div>
            <nav aria-label={labels.title} className="flex-1 px-5 py-4">
              <ul className="divide-y divide-navy/10">
                {items.map((item) => (
                  <li key={item.href} className="py-1">
                    <Link href={item.href} className="font-display flex min-h-12 items-center text-xl font-semibold text-navy">{item.label}</Link>
                    {item.children && (
                      <ul className="mb-2 grid grid-cols-2 gap-x-3">
                        {item.children.map((c) => (
                          <li key={c.href}><Link href={c.href} className="flex min-h-11 items-center text-sm text-muted hover:text-navy">{c.label}</Link></li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
            <div className="space-y-3 border-t border-navy/10 px-5 py-5">{extra}</div>
          </div>
        </div>
      )}
    </>
  );
}
