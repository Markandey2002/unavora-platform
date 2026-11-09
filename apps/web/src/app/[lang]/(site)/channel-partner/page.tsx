import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/site/PageHero";
import { PartnerForm } from "@/components/site/PartnerForm";
import { Icon } from "@/components/site/ui";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { getLocations } from "@/lib/api";
import { pageMeta } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const s = getSiteDictionary(lang);
  return pageMeta(lang, "/channel-partner", s.partner.pageTitle, s.partner.sub);
}

/** Channel-partner registration -> channel_partners (status applied) + CRM lead (POST /api/v1/public/channel-partners). */
export default async function ChannelPartnerPage({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDictionary(lang);
  const s = getSiteDictionary(lang);
  const cities = [...new Set((await getLocations(lang).catch(() => [])).map((l) => l.city))];
  return (
    <>
      <PageHero lang={lang} home={s.detail.home} breadcrumbLabel={s.detail.breadcrumb} crumbs={[{ label: s.nav.partner }]}
        eyebrow={s.partner.eyebrow} title={s.partner.title} sub={s.partner.sub} />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-20 lg:px-8 lg:py-20">
        <div>
          <h2 className="font-display text-3xl font-semibold">{s.partner.pageTitle}</h2>
          <p className="mt-3 text-muted">{s.partner.pageSub}</p>
          <ol className="mt-10 space-y-8">
            {s.partner.steps.map((st, i) => (
              <li key={st.title} className="flex gap-5">
                <span className="font-display flex size-12 shrink-0 items-center justify-center border border-gold text-xl font-semibold text-gold-700">{i + 1}</span>
                <div><p className="font-semibold">{st.title}</p><p className="mt-1 text-sm text-muted">{st.body}</p></div>
              </li>
            ))}
          </ol>
          <p className="mt-10 flex gap-3 border-l-2 border-gold bg-white p-4 text-sm text-muted"><Icon name="check" className="mt-0.5 size-4 shrink-0 text-gold-700" />{s.partner.termsNote}</p>
        </div>
        <div className="bg-white p-6 shadow-[var(--shadow-card)] sm:p-10">
          <PartnerForm lang={lang} t={t} f={s.partner.form} cities={cities} />
        </div>
      </div>
    </>
  );
}
