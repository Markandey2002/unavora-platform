import Link from "next/link";
import { notFound } from "next/navigation";
import { isLang } from "@/i18n/dictionaries";
import { fmtDateTime, getStaffDictionary } from "@/i18n/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

export default async function CustomersPage({
  params, searchParams,
}: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const registered = sp.registered === "true" || sp.registered === "false" ? sp.registered : undefined;
  const page = handle(lang, await staffApi.customers(session, { registered, cursor: sp.cursor }));
  const tab = (value: string | undefined, label: string) => (
    <Link href={`/${lang}/staff/customers${value ? `?registered=${value}` : ""}`} aria-current={registered === value ? "page" : undefined}
      className={`min-h-11 content-center rounded-lg px-3 text-sm ${registered === value ? "bg-navy text-ivory" : "border border-slate/40"}`}>
      {label}
    </Link>
  );
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t.customers}</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {tab(undefined, t.allCustomers)}{tab("true", t.registeredOnly)}{tab("false", t.enquiryOnly)}
      </div>
      {isError(page) ? (
        <p role="alert" className="mt-6 text-red-700">{t.errors[page.error] ?? t.errors.generic}</p>
      ) : page.items.length === 0 ? (
        <p className="mt-6">{t.noCustomers}</p>
      ) : (
        <>
          <ul data-testid="customer-list" className="mt-6 grid gap-3 md:grid-cols-2">
            {page.items.map((c) => (
              <li key={c.id} className="rounded-xl border border-slate/20 bg-white p-4">
                <Link href={`/${lang}/staff/customers/${c.id}`} className="block min-h-11">
                  <p className="font-semibold">{c.name} <span className="font-normal text-slate">· {c.reference}</span></p>
                  <p className="mt-1 text-sm text-slate">{c.whatsapp ?? c.phone ?? c.email ?? "—"}{c.whatsappVerified ? ` (WhatsApp ${t.verified})` : ""}</p>
                  <p className="mt-1 text-sm">
                    {c.registeredAt ? `${t.registered} ${fmtDateTime(c.registeredAt, lang)}` : t.enquiryOnly} · {t.openLeads}: {c.openLeads}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {page.nextCursor && (
            <Link className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-navy px-4"
              href={`/${lang}/staff/customers?${new URLSearchParams({ ...(registered ? { registered } : {}), cursor: page.nextCursor })}`}>
              {t.next}
            </Link>
          )}
        </>
      )}
    </section>
  );
}
