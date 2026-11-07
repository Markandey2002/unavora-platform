import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLang } from "@/i18n/dictionaries";
import { getStaffDictionary } from "@/i18n/staff";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false, follow: false } };

export default async function StaffLogin({
  params, searchParams,
}: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const t = getStaffDictionary(lang);
  const error = sp.error ? (t.errors[sp.error] ?? t.errors.generic) : null;
  return (
    <section className="mx-auto max-w-md rounded-xl border border-slate/20 bg-white p-6">
      <h1 className="text-2xl font-semibold">{t.signInTitle}</h1>
      <p className="mt-2 text-sm text-slate">{t.signInSub}</p>
      {sp.signedOut && <p role="status" className="mt-4 rounded-lg bg-gold/30 p-3 text-sm">{t.signedOut}</p>}
      {error && <p role="alert" className="mt-4 text-sm font-medium text-red-700">{error}</p>}
      <a href={`/_bff/staff/login?lang=${lang}`}
        className="mt-6 flex min-h-12 items-center justify-center rounded-lg bg-navy px-6 font-semibold text-ivory hover:brightness-110">
        {t.signInButton}
      </a>
    </section>
  );
}
