import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, isLang } from "@/i18n/dictionaries";

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDictionary(lang);
  return (
    <section className="rounded-2xl bg-navy px-6 py-14 text-ivory sm:px-12">
      <h1 className="max-w-2xl text-3xl font-semibold leading-tight sm:text-5xl">{t.heroTitle}</h1>
      <p className="mt-4 max-w-xl text-ivory/80">{t.heroSub}</p>
      <Link href={`/${lang}/properties`}
        className="mt-8 inline-flex min-h-12 items-center rounded-lg bg-gold px-6 font-semibold text-navy hover:brightness-95">
        {t.browse}
      </Link>
    </section>
  );
}
