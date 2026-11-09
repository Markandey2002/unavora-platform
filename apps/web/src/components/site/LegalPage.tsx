import Link from "next/link";
import type { SiteDictionary } from "@/i18n/site";
import { PageHero } from "./PageHero";
import { btn } from "./ui";

/** Privacy / terms placeholder pages: honest interim text until the approved documents are published (PENDING #9). */
export function LegalPage({ lang, s, title, body }: { lang: string; s: SiteDictionary; title: string; body: string[] }) {
  return (
    <>
      <PageHero lang={lang} home={s.detail.home} breadcrumbLabel={s.detail.breadcrumb} crumbs={[{ label: title }]} eyebrow={s.footer.legal} title={title} />
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
        {body.map((p) => <p key={p} className="mt-5 text-lg leading-relaxed text-navy/85 first:mt-0">{p}</p>)}
        <p className="mt-8 text-sm text-muted">{s.legal.updated}</p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={`/${lang}/contact#enquiry`} className={btn.navy}>{s.nav.contact}</Link>
          <Link href={`/${lang}`} className={btn.outline}>{s.states.home}</Link>
        </div>
      </article>
    </>
  );
}
