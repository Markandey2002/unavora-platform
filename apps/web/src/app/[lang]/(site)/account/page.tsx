import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CustomerRequestForm } from "@/components/CustomerRequestForm";
import { WhatsAppVerify } from "@/components/WhatsAppVerify";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { currentCustomer, customerAuthMode } from "@/lib/customer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account", robots: { index: false } };

function fmt(iso: string | null, lang: string) {
  return iso ? new Date(iso).toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—";
}

export default async function AccountPage({
  params, searchParams,
}: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const t = getDictionary(lang);
  const mode = customerAuthMode();
  const me = await currentCustomer(await cookies());

  if (!me) {
    return (
      <section className="mx-auto max-w-md rounded-xl border border-slate/20 bg-white p-6">
        <h1 className="text-2xl font-semibold">{t.signInTitle}</h1>
        <p className="mt-2 text-muted">{t.signInSub}</p>
        {sp.error && <p role="alert" className="mt-4 text-sm font-medium text-red-700">{sp.error === "unavailable" ? t.authUnavailable : t.authError}</p>}
        {mode === "disabled" ? (
          <p className="mt-6">{t.authUnavailable}</p>
        ) : (
          <a href={`/_bff/auth/google/start?lang=${lang}`}
            className="mt-6 flex min-h-12 items-center justify-center gap-3 rounded-lg border border-slate/40 bg-white px-6 font-semibold hover:bg-ivory">
            <span aria-hidden className="text-lg font-bold">G</span>{t.continueGoogle}
          </a>
        )}
        {mode === "mock" && <p className="mt-4 text-xs text-muted">{t.mockNotice}</p>}
      </section>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="space-y-4">
        {sp.welcome && <p role="status" className="rounded-lg bg-gold/30 p-3">{t.welcome}</p>}
        <div className="rounded-xl border border-slate/20 bg-white p-6">
          <h1 className="text-2xl font-semibold">{t.profile}</h1>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">{t.name}</dt><dd data-testid="profile-name">{me.name}</dd>
            <dt className="text-muted">Gmail</dt><dd data-testid="profile-email">{me.email}</dd>
            <dt className="text-muted">#</dt><dd data-testid="profile-reference">{me.reference}</dd>
            <dt className="text-muted">{t.registeredOn}</dt><dd>{fmt(me.registeredAt, lang)}</dd>
            <dt className="text-muted">{t.lastLogin}</dt><dd>{fmt(me.lastLoginAt, lang)}</dd>
            <dt className="text-muted">WhatsApp</dt>
            <dd data-testid="profile-whatsapp">{me.whatsappVerified ? `${me.whatsappNumber} · ${t.numberVerified}` : "—"}</dd>
          </dl>
          <form action="/_bff/auth/logout" method="post" className="mt-6">
            <input type="hidden" name="lang" value={lang} />
            <button className="min-h-11 rounded-lg border border-navy px-5 text-sm font-semibold">{t.signOut}</button>
          </form>
        </div>
        {!me.whatsappVerified && (
          <div className="rounded-xl border border-slate/20 bg-white p-6">
            <h2 className="text-lg font-semibold">{t.whatsappTitle}</h2>
            <p className="mb-4 mt-1 text-sm text-muted">{t.whatsappSub}</p>
            <WhatsAppVerify lang={lang} t={t} />
          </div>
        )}
      </section>
      <section>
        {me.whatsappVerified ? <CustomerRequestForm t={t} /> : <p className="text-muted">{t.verifyFirst}</p>}
      </section>
    </div>
  );
}
