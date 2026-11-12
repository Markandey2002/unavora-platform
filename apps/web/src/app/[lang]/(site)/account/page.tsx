import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CustomerRequestForm } from "@/components/CustomerRequestForm";
import { WhatsAppVerify } from "@/components/WhatsAppVerify";
import { getDictionary, isLang } from "@/i18n/dictionaries";
import { currentCustomer, customerApi, customerAuthMode, sessionFrom } from "@/lib/customer";
import { getExtraDictionary } from "@/i18n/extra";
import Link from "next/link";

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
      <section className="mx-auto max-w-md bg-white p-6 shadow-[var(--shadow-card)]">
        <h1 className="font-display text-3xl font-semibold">{t.signInTitle}</h1>
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

  const x = getExtraDictionary(lang);
  const session = sessionFrom(await cookies());
  const [actRes, favRes] = session ? await Promise.all([customerApi.activity(session, lang), customerApi.favourites(session, lang)]) : [null, null];
  const activity = actRes?.ok ? actRes.data : { requests: [], visits: [] };
  const favourites = favRes?.ok ? favRes.data : [];

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="space-y-4">
        {sp.welcome && <p role="status" className="rounded-lg bg-gold/30 p-3">{t.welcome}</p>}
        <div className="bg-white p-6 shadow-[var(--shadow-card)]">
          <h1 className="font-display text-3xl font-semibold">{t.profile}</h1>
          <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">{t.name}</dt><dd data-testid="profile-name">{me.name}</dd>
            <dt className="text-muted">Gmail</dt><dd data-testid="profile-email" className="break-all">{me.email}</dd>
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
          <div className="bg-white p-6 shadow-[var(--shadow-card)]">
            <h2 className="text-lg font-semibold">{t.whatsappTitle}</h2>
            <p className="mb-4 mt-1 text-sm text-muted">{t.whatsappSub}</p>
            <WhatsAppVerify lang={lang} t={t} />
          </div>
        )}
      </section>
      <section>
        {me.whatsappVerified ? <CustomerRequestForm t={t} /> : <p className="text-muted">{t.verifyFirst}</p>}
      </section>

      <section aria-labelledby="saved" className="bg-white p-6 shadow-[var(--shadow-card)] lg:col-span-2">
        <h2 id="saved" className="font-display text-2xl font-semibold">{x.account.saved}</h2>
        {favourites.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{x.account.noSaved} <Link href={`/${lang}/properties`} className="underline underline-offset-4">{x.account.browse}</Link></p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="saved-properties">
            {favourites.map((f) => (
              <li key={f.propertyId} className="border border-navy/10 p-4">
                <Link href={`/${lang}/properties/${f.slug}`} className="font-semibold underline-offset-4 hover:underline">{f.title}</Link>
                <p className="mt-1 text-sm text-muted">{f.locality}, {f.city}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-enquiries" className="bg-white p-6 shadow-[var(--shadow-card)]">
        <h2 id="my-enquiries" className="font-display text-2xl font-semibold">{x.account.activity}</h2>
        {activity.requests.length === 0 ? <p className="mt-3 text-sm text-muted">{x.account.noActivity}</p> : (
          <ul className="mt-4 divide-y divide-navy/10" data-testid="my-enquiries">
            {activity.requests.map((r) => (
              <li key={r.reference} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                <span><span className="font-semibold">{x.account.types[r.type] ?? r.type}</span>{r.propertyTitle && <> · {r.propertySlug
                  ? <Link href={`/${lang}/properties/${r.propertySlug}`} className="underline underline-offset-4">{r.propertyTitle}</Link> : r.propertyTitle}</>}
                  <span className="block text-xs text-muted">{x.account.reference} {r.reference} · {fmt(r.createdAt, lang)}</span></span>
                <span className="bg-gold-100 px-2 py-0.5 text-xs font-semibold">{x.account.status[r.status] ?? r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-visits" className="bg-white p-6 shadow-[var(--shadow-card)]">
        <h2 id="my-visits" className="font-display text-2xl font-semibold">{x.account.visits}</h2>
        {activity.visits.length === 0 ? <p className="mt-3 text-sm text-muted">{x.account.noVisits}</p> : (
          <ul className="mt-4 divide-y divide-navy/10">
            {activity.visits.map((v) => (
              <li key={v.reference} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                <span><span className="font-semibold">{v.propertyTitle ?? v.reference}</span>
                  <span className="block text-xs text-muted">{x.account.reference} {v.reference} · {fmt(v.scheduledAt, lang)}</span></span>
                <span className="bg-sand px-2 py-0.5 text-xs font-semibold">{x.account.visitStatus[v.status] ?? v.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
