import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { setFeatured } from "../../content-actions";

export const metadata: Metadata = { title: "Featured listings" };
type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Featured listings shown first on the homepage (property.publish). */
export default async function FeaturedAdmin({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const rows = handle(lang, await staffApi.featured(session));
  if (isError(rows)) return <p role="alert" data-testid="not-permitted">{rows.status === 403 ? t.notPermitted : (t.errors[rows.error] ?? t.errors.generic)}</p>;
  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/content`} className="text-sm underline">← {x.staff.content}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <h1 className="text-2xl font-semibold">{x.staff.featured}</h1>
      <ul className="grid gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate/20 bg-white p-4 text-sm">
            <span><span className="font-semibold">{r.title}</span> · {r.city}{r.featured && <span className="ml-2 rounded bg-gold/30 px-2 py-0.5 text-xs">★</span>}</span>
            <form action={setFeatured}>
              <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="on" value={r.featured ? "0" : "1"} />
              <button className={`min-h-10 rounded-lg px-4 font-semibold ${r.featured ? "border border-navy" : "bg-navy text-ivory"}`}>{r.featured ? x.staff.unfeature : x.staff.feature}</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
