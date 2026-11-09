import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/site/LegalPage";
import { isLang } from "@/i18n/dictionaries";
import { getSiteDictionary } from "@/i18n/site";
import { pageMeta } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const s = getSiteDictionary(lang);
  return pageMeta(lang, "/privacy", s.legal.privacyTitle, s.legal.privacyBody[0]);
}

export default async function PrivacyPage({ params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const s = getSiteDictionary(lang);
  return <LegalPage lang={lang} s={s} title={s.legal.privacyTitle} body={s.legal.privacyBody} />;
}
