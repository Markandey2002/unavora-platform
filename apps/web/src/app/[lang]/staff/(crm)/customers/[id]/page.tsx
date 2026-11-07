import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactActions } from "@/components/staff/ContactActions";
import { isLang } from "@/i18n/dictionaries";
import { fmtDateTime, getStaffDictionary } from "@/i18n/staff";
import { can, staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { addFollowUp, logCommunication } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer" };

export default async function CustomerDetailPage({
  params, searchParams,
}: { params: Promise<{ lang: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang, id } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const d = handle(lang, await staffApi.customer(session, id));
  if (isError(d)) {
    return <p role="alert" data-testid="not-found">{d.status === 404 ? t.notFound : (t.errors[d.error] ?? t.errors.generic)}</p>;
  }
  const c = d.customer;
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  const card = "rounded-xl border border-slate/20 bg-white p-4";
  const canLog = can(me, "lead.update");
  const canTask = can(me, "task.manage_own") || can(me, "task.manage_all");
  const leadOptions = d.leads.map((l) => <option key={l.id} value={l.id}>{l.reference} ({t.stages[l.stage] ?? l.stage})</option>);
  const soon = new Date(Date.now() + 24 * 3600_000 + 5.5 * 3600_000).toISOString().slice(0, 16); // tomorrow, India time

  return (
    <div className="space-y-6">
      <Link href={`/${lang}/staff/customers`} className="text-sm underline">← {t.back}</Link>
      {sp.saved && <p role="status" className="rounded-lg bg-gold/30 p-3">{t.saved}</p>}
      {sp.error && <p role="alert" className="text-sm font-medium text-red-700">{t.errors[sp.error] ?? t.errors.generic}</p>}

      <section className={`${card} grid gap-4 md:grid-cols-[1fr_auto]`}>
        <div>
          <h1 data-testid="customer-name" className="text-2xl font-semibold">{c.name}</h1>
          <p className="text-sm text-slate">{c.reference} · {c.email ?? "—"}</p>
          <p className="mt-1 text-sm">
            {c.registeredAt ? `${t.registered} ${fmtDateTime(c.registeredAt, lang)} · ${t.lastLogin} ${fmtDateTime(c.lastLoginAt, lang)}` : t.enquiryOnly}
          </p>
        </div>
        <div>
          <h2 className="sr-only">{t.contact}</h2>
          <ContactActions phone={c.phone} whatsapp={c.whatsappVerified ? c.whatsapp : null} t={t} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">{t.customerLeads}</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {d.leads.map((l) => (
              <li key={l.id}><Link className="underline" href={`/${lang}/staff/leads/${l.id}`}>{l.reference}</Link> · {l.enquiryType} · {t.stages[l.stage] ?? l.stage} · {fmtDateTime(l.createdAt, lang)}</li>
            ))}
            {d.leads.length === 0 && <li>—</li>}
          </ul>
          <h2 className="mt-4 font-semibold">{t.consents}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {d.consents.map((k) => <li key={k.purpose}>{t.purposes[k.purpose] ?? k.purpose}: <b>{k.granted ? t.granted : t.declined}</b> <span className="text-slate">({fmtDateTime(k.recordedAt, lang)})</span></li>)}
            {d.consents.length === 0 && <li>—</li>}
          </ul>
        </section>

        <section className={card}>
          <h2 className="font-semibold">{t.followUps}</h2>
          <ul data-testid="customer-follow-ups" className="mt-2 space-y-1 text-sm">
            {d.followUps.map((f) => <li key={f.id}>{f.title} · {fmtDateTime(f.dueAt, lang)} · {f.status}</li>)}
            {d.followUps.length === 0 && <li>{t.noFollowUps}</li>}
          </ul>
          {canTask && (
            <form action={addFollowUp} className="mt-4 space-y-3 border-t border-slate/20 pt-4">
              <h3 className="font-semibold">{t.addFollowUp}</h3>
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="customerId" value={c.id} />
              <label className="block text-sm">{t.title}<input name="title" required maxLength={200} className={field} /></label>
              <label className="block text-sm">{t.due}<input name="dueAt" type="datetime-local" required defaultValue={soon} className={field} /></label>
              <label className="block text-sm">{t.relatedLead}
                <select name="leadId" className={field}><option value="">{t.none}</option>{leadOptions}</select>
              </label>
              <label className="block text-sm">{t.description}<textarea name="description" maxLength={2000} rows={2} className={field} /></label>
              <button className="min-h-12 w-full rounded-lg bg-navy px-5 font-semibold text-ivory">{t.addFollowUp}</button>
            </form>
          )}
        </section>
      </div>

      <section className={card}>
        <h2 className="font-semibold">{t.communications}</h2>
        <ul data-testid="communications" className="mt-2 space-y-2 text-sm">
          {d.communications.map((m) => (
            <li key={m.id}>
              <b>{m.channel === "phone" ? t.phone : t.whatsapp}</b> · {m.direction === "outbound" ? t.outbound : t.inbound} · {fmtDateTime(m.occurredAt, lang)}
              <br />{m.summary}
            </li>
          ))}
          {d.communications.length === 0 && <li>{t.noCommunications}</li>}
        </ul>
        {canLog && (
          <form action={logCommunication} className="mt-4 grid gap-3 border-t border-slate/20 pt-4 md:grid-cols-2">
            <h3 className="font-semibold md:col-span-2">{t.logTitle}</h3>
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="customerId" value={c.id} />
            <label className="block text-sm">{t.channel}
              <select name="channel" className={field}><option value="phone">{t.phone}</option><option value="whatsapp">{t.whatsapp}</option></select>
            </label>
            <label className="block text-sm">{t.direction}
              <select name="direction" className={field}><option value="outbound">{t.outbound}</option><option value="inbound">{t.inbound}</option></select>
            </label>
            <label className="block text-sm">{t.relatedLead}
              <select name="leadId" className={field}><option value="">{t.none}</option>{leadOptions}</select>
            </label>
            <label className="block text-sm md:col-span-2">{t.summary}<textarea name="summary" required maxLength={500} rows={2} className={field} /></label>
            <p className="text-xs text-slate md:col-span-2">{t.recordedNote}</p>
            <button className="min-h-12 rounded-lg bg-navy px-5 font-semibold text-ivory md:col-span-2">{t.save}</button>
          </form>
        )}
      </section>
    </div>
  );
}
