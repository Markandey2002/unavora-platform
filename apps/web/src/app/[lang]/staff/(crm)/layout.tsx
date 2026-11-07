import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isLang } from "@/i18n/dictionaries";
import { getStaffDictionary } from "@/i18n/staff";
import { can } from "@/lib/staff";
import { requireStaff } from "@/lib/staffPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "CRM", template: "%s | CRM" }, robots: { index: false, follow: false } };

export default async function CrmLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const { me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const link = "min-h-11 content-center whitespace-nowrap rounded-lg px-3 text-sm font-medium hover:bg-navy/10";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate/20 bg-white p-3">
        <nav aria-label={t.crm} className="-mx-1 flex flex-wrap gap-1">
          <Link href={`/${lang}/staff/dashboard`} className={link}>{t.nav.dashboard}</Link>
          <Link href={`/${lang}/staff/leads`} className={link}>{t.nav.leads}</Link>
          <Link href={`/${lang}/staff/visits`} className={link}>{t.nav.visits}</Link>
          <Link href={`/${lang}/staff/customers`} className={link}>{t.nav.customers}</Link>
          <Link href={`/${lang}/staff/follow-ups`} className={link}>{t.nav.followUps}</Link>
          {can(me, "report.director") && <Link href={`/${lang}/staff/overview`} className={link}>{t.nav.overview}</Link>}
        </nav>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span data-testid="staff-name" className="font-medium">{me.name}</span>
          {me.mfaVerified && <span data-testid="mfa-badge" className="rounded bg-gold/40 px-2 py-0.5 text-xs">{t.mfaBadge}</span>}
          <form action="/_bff/staff/logout" method="post">
            <input type="hidden" name="lang" value={lang} />
            <button className="min-h-11 rounded-lg border border-navy px-4 font-semibold">{t.signOut}</button>
          </form>
        </div>
      </div>
      {children}
    </div>
  );
}
