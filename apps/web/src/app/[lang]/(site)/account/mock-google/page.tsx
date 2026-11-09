// LOCAL DEVELOPMENT ONLY: stands in for Google's account chooser when CUSTOMER_AUTH_MODE=mock. 404 otherwise.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { customerAuthMode } from "@/lib/customer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mock Google sign-in", robots: { index: false } };

export default async function MockGoogle({
  params, searchParams,
}: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang } = await params;
  if (!isLang(lang) || customerAuthMode() !== "mock") notFound();
  const { state } = await searchParams;
  const t = getDictionary(lang);
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  return (
    <section className="mx-auto max-w-md rounded-xl border-2 border-dashed border-gold bg-white p-6">
      <p className="rounded bg-gold/30 p-2 text-xs font-semibold">{t.mockNotice}</p>
      <h1 className="mt-4 text-xl font-semibold">{t.mockTitle}</h1>
      <form action="/_bff/auth/google/callback" method="post" className="mt-4 space-y-4">
        <input type="hidden" name="state" value={state ?? ""} />
        <label className="block text-sm">{t.mockName}
          <input name="name" required maxLength={200} defaultValue="Synthetic Customer" className={field} />
        </label>
        <label className="block text-sm">{t.mockEmail}
          <input name="email" type="email" required maxLength={254} defaultValue="synthetic.customer@example.test" className={field} />
        </label>
        <button className="min-h-12 w-full rounded-lg bg-navy px-6 font-semibold text-ivory">{t.mockContinue}</button>
      </form>
    </section>
  );
}
