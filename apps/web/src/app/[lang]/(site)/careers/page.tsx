import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/site/PageHero";
import { btn } from "@/components/site/ui";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getSiteDictionary } from "@/i18n/site";
import { getCompany, getSiteBlocks } from "@/lib/api";
import { seoMeta } from "@/lib/seo";
import { contactFrom } from "@/lib/site";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const careers = (await getSiteBlocks(lang)).careers;
  const x = getExtraDictionary(lang);
  return careers ? seoMeta(lang, "/careers", careers.title ?? x.careers.nav, (careers.intro ?? x.careers.nav).slice(0, 160)) : {};
}

/** Careers: exists only while the director has published the careers block (404 otherwise; never an empty page). */
export default async function CareersPage({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const [blocks, company] = await Promise.all([getSiteBlocks(lang), getCompany()]);
  const careers = blocks.careers;
  if (!careers) notFound();
  const s = getSiteDictionary(lang);
  const x = getExtraDictionary(lang);
  const email = contactFrom(company).email;
  return (
    <>
      <PageHero lang={lang} home={s.detail.home} breadcrumbLabel={s.detail.breadcrumb} crumbs={[{ label: x.careers.nav }]}
        eyebrow={x.careers.eyebrow} title={careers.title ?? x.careers.nav} />
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        {careers.intro && <p className="whitespace-pre-line text-lg leading-relaxed text-navy/85">{careers.intro}</p>}
        {careers.openings.length === 0 ? <p className="mt-10 text-muted">{x.careers.empty}</p> : (
          <ul className="mt-10 grid gap-4" data-testid="openings">
            {careers.openings.map((j) => (
              <li key={j.id} className="border-l-2 border-gold bg-white p-6 shadow-[var(--shadow-card)]">
                <h2 className="font-display text-2xl font-semibold">{j.title}</h2>
                <p className="mt-1 text-sm text-muted">{j.location} · {x.careers.types[j.type] ?? j.type}</p>
                {j.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{j.description}</p>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-12 bg-sand/60 p-6">
          <h2 className="font-display text-2xl font-semibold">{x.careers.apply}</h2>
          {email
            ? <p className="mt-2">{x.careers.applyEmail} <a className="underline" href={`mailto:${email}`}>{email}</a></p>
            : <><p className="mt-2">{x.careers.applyForm}</p><Link href={`/${lang}/contact#enquiry`} className={`${btn.navy} mt-4`}>{s.nav.enquire}</Link></>}
        </div>
      </section>
    </>
  );
}
