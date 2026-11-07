import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactActions } from "@/components/staff/ContactActions";
import { isLang } from "@/i18n/dictionaries";
import { fmtDateTime, getStaffDictionary } from "@/i18n/staff";
import { can, staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead" };

export default async function LeadDetail({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params;
  if (!isLang(lang)) notFound();
  const { session, me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const lead = handle(lang, await staffApi.lead(session, id));
  if (isError(lead)) {
    return <p role="alert" data-testid="not-found">{lead.status === 404 ? t.notFound : (t.errors[lead.error] ?? t.errors.generic)}</p>;
  }
  const activities = handle(lang, await staffApi.leadActivities(session, id));
  const customer = handle(lang, await staffApi.customer(session, lead.customerId));
  const c = isError(customer) ? null : customer;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4">
        <Link href={`/${lang}/staff/leads`} className="text-sm underline">← {t.back}</Link>
        <h1 data-testid="lead-reference" className="text-2xl font-semibold">{lead.reference}</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-slate/20 bg-white p-4 text-sm">
          <dt className="text-slate">{t.stage}</dt><dd>{t.stages[lead.stage] ?? lead.stageName}</dd>
          <dt className="text-slate">{t.type}</dt><dd>{lead.enquiryType}</dd>
          <dt className="text-slate">{t.property}</dt><dd>{lead.propertyTitle ?? "—"}</dd>
          <dt className="text-slate">{t.priority}</dt><dd>{lead.priority}</dd>
          <dt className="text-slate">{t.created}</dt><dd>{fmtDateTime(lead.createdAt, lang)}</dd>
          <dt className="text-slate">{t.nextAction}</dt><dd>{lead.nextActionAt ? `${fmtDateTime(lead.nextActionAt, lang)} ${lead.nextActionNote ?? ""}` : "—"}</dd>
          {can(me, "lead.read_all") && <><dt className="text-slate">{t.assignee}</dt><dd>{lead.assignedUserName ?? t.unassigned}</dd></>}
        </dl>
        <section className="rounded-xl border border-slate/20 bg-white p-4">
          <h2 className="font-semibold">{t.timeline}</h2>
          {isError(activities) || activities.length === 0 ? <p className="mt-2 text-sm">{t.noActivity}</p> : (
            <ol data-testid="lead-timeline" className="mt-3 space-y-3 border-l-2 border-gold pl-4">
              {activities.map((a, i) => (
                <li key={i} className="text-sm">
                  <p>{a.summary}</p>
                  <p className="text-xs text-slate">{fmtDateTime(a.occurredAt, lang)}{a.actorName ? ` · ${a.actorName}` : ""}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </section>
      <aside className="space-y-4 rounded-xl border border-slate/20 bg-white p-4">
        <h2 className="font-semibold">{t.customer}: {lead.customerName}</h2>
        <ContactActions phone={c?.customer.phone ?? lead.phone} whatsapp={c?.customer.whatsappVerified ? c.customer.whatsapp : null} t={t} />
        <Link href={`/${lang}/staff/customers/${lead.customerId}`} className="inline-flex min-h-11 items-center underline">{t.openCustomer}</Link>
      </aside>
    </div>
  );
}
