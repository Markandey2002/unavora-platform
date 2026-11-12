import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OwnerForm } from "@/components/site/OwnerForm";
import { PageHero } from "@/components/site/PageHero";
import { Icon } from "@/components/site/ui";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getSiteDictionary } from "@/i18n/site";
import { getLocations } from "@/lib/api";
import { seoMeta } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const x = getExtraDictionary(lang);
  return seoMeta(lang, "/list-your-property", x.owner.title, x.owner.sub);
}

/** Owner submission -> CRM lead (property_owner) for employee review and director decision. Never auto-published. */
export default async function ListYourPropertyPage({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDictionary(lang);
  const s = getSiteDictionary(lang);
  const x = getExtraDictionary(lang);
  const cities = [...new Set((await getLocations(lang).catch(() => [])).map((l) => l.city))];
  return (
    <>
      <PageHero lang={lang} home={s.detail.home} breadcrumbLabel={s.detail.breadcrumb} crumbs={[{ label: x.owner.nav }]}
        eyebrow={x.owner.eyebrow} title={x.owner.title} sub={x.owner.sub} />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.3fr] lg:gap-20 lg:px-8 lg:py-20">
        <ol className="space-y-8">
          {x.owner.steps.map((st, i) => (
            <li key={st} className="flex gap-5">
              <span className="font-display flex size-12 shrink-0 items-center justify-center border border-gold text-xl font-semibold text-gold-700">{i + 1}</span>
              <p className="pt-3 font-semibold">{st}</p>
            </li>
          ))}
          <li className="flex gap-3 border-l-2 border-gold bg-white p-4 text-sm text-muted"><Icon name="check" className="mt-0.5 size-4 shrink-0 text-gold-700" />{x.owner.form.photosNote}</li>
        </ol>
        <div className="bg-white p-6 shadow-[var(--shadow-card)] sm:p-10">
          <OwnerForm lang={lang} t={t} f={x.owner.form} typeLabels={s.types} cities={cities} />
        </div>
      </div>
    </>
  );
}
