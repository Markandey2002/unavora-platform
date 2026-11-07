import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerRequestForm } from "@/components/CustomerRequestForm";
import { EnquiryForm } from "@/components/EnquiryForm";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { formatPrice, getProperty } from "@/lib/api";
import { currentCustomer, customerAuthMode } from "@/lib/customer";

type Props = { params: Promise<{ lang: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang)) return {};
  const d = await getProperty(lang, slug);
  return d ? { title: d.summary.title, description: d.description ?? undefined } : {};
}

export default async function PropertyPage({ params }: Props) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const d = await getProperty(lang, slug);
  if (!d) notFound();
  const t = getDictionary(lang);
  const p = d.summary;
  const me = await currentCustomer(await cookies());
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <article>
        <h1 className="text-3xl font-semibold">{p.title}</h1>
        <p className="mt-1 text-slate">{p.propertyType} · {p.locality}, {p.city}</p>
        <p className="mt-4 text-2xl font-semibold">{p.priceOnRequest || p.price == null ? t.priceOnRequest : formatPrice(p.price)}</p>
        {d.description && <p className="mt-6 leading-relaxed">{d.description}</p>}
        {d.amenities.length > 0 && (
          <section className="mt-6">
            <h2 className="font-semibold">{t.amenities}</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {d.amenities.map((a) => <li key={a} className="rounded-full border border-slate/30 px-3 py-1 text-sm">{a}</li>)}
            </ul>
          </section>
        )}
      </article>
      <aside className="space-y-3">
        {me?.whatsappVerified ? (
          <CustomerRequestForm propertyId={p.id} t={t} />
        ) : (
          <>
            <EnquiryForm propertyId={p.id} lang={lang} t={t} />
            {customerAuthMode() !== "disabled" && (
              <Link href={`/${lang}/account`} className="block min-h-11 content-center text-center text-sm underline">
                {me ? t.verifyFirst : t.signInForFaster}
              </Link>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
