import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow } from "./ui";

/** Header band for inner pages: breadcrumb, eyebrow, single h1, intro. */
export function PageHero({ lang, home, crumbs, eyebrow, title, sub, children, breadcrumbLabel }: {
  lang: string; home: string; crumbs: { label: string; href?: string }[]; eyebrow: string; title: string; sub?: string;
  children?: ReactNode; breadcrumbLabel: string;
}) {
  return (
    <section className="border-b border-navy/10 bg-sand/60">
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pb-16 lg:pt-12">
        <nav aria-label={breadcrumbLabel} className="text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href={`/${lang}`} className="inline-flex min-h-6 min-w-6 items-center hover:text-navy">{home}</Link></li>
            {crumbs.map((c) => (
              <li key={c.label} className="flex items-center gap-1.5">
                <span aria-hidden>/</span>
                {c.href ? <Link href={c.href} className="inline-flex min-h-6 min-w-6 items-center hover:text-navy">{c.label}</Link> : <span aria-current="page" className="text-navy">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
        <div className="mt-6"><Eyebrow>{eyebrow}</Eyebrow></div>
        <h1 className="font-display mt-3 max-w-3xl text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">{title}</h1>
        {sub && <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{sub}</p>}
        {children}
      </div>
    </section>
  );
}
