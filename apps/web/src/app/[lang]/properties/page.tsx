import { notFound } from "next/navigation";
import { PropertyCard } from "@/components/PropertyCard";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { searchProperties } from "@/lib/api";

export default async function PropertiesPage({
  params, searchParams,
}: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const t = getDictionary(lang);
  const page = await searchProperties(lang, { city: sp.city, type: sp.type, q: sp.q, cursor: sp.cursor });
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t.properties}</h1>
      {page.items.length === 0 ? (
        <p>{t.noResults}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.items.map((p) => <PropertyCard key={p.id} p={p} lang={lang} t={t} />)}
        </ul>
      )}
    </>
  );
}
