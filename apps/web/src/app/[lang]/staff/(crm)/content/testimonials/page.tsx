import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/staff/Flash";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";
import { addTestimonial, setTestimonialStatus } from "../../content-actions";

export const metadata: Metadata = { title: "Testimonials" };
type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Genuine testimonials only: publishing requires the customer's recorded permission (enforced by the API and DB). */
export default async function TestimonialsAdmin({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const rows = handle(lang, await staffApi.testimonials(session));
  if (isError(rows)) return <p role="alert" data-testid="not-permitted">{rows.status === 403 ? t.notPermitted : (t.errors[rows.error] ?? t.errors.generic)}</p>;
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  return (
    <div className="space-y-4">
      <Link href={`/${lang}/staff/content`} className="text-sm underline">← {x.staff.content}</Link>
      <Flash saved={sp.saved} error={sp.error} t={t} />
      <h1 className="text-2xl font-semibold">{x.staff.testimonials}</h1>
      <form action={addTestimonial} className="grid gap-3 rounded-xl border border-slate/20 bg-white p-4 sm:grid-cols-2" data-testid="testimonial-form">
        <input type="hidden" name="lang" value={lang} />
        <label className="block text-sm">{x.staff.tDisplayName}<input name="displayName" required maxLength={80} className={field} /></label>
        <label className="block text-sm">{x.staff.tRating}<input name="rating" type="number" min={1} max={5} className={field} /></label>
        <label className="block text-sm sm:col-span-2">{x.staff.tBody}<textarea name="body" required maxLength={2000} rows={3} className={field} /></label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="consentConfirmed" required className="mt-1 size-5" />{x.staff.tConsent}</label>
        <label className="block text-sm sm:col-span-2">{x.staff.tConsentNote}<input name="consentNote" required maxLength={300} className={field} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" className="size-5" />{x.staff.tPublishNow}</label>
        <button className="min-h-11 justify-self-start rounded-lg bg-navy px-5 font-semibold text-ivory sm:col-span-2">{x.staff.save}</button>
      </form>
      <ul className="grid gap-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate/20 bg-white p-4 text-sm">
            <p><span className="font-semibold">{r.displayName ?? "—"}</span> · {r.rating ?? "—"}/5 <span className="ml-2 rounded bg-gold/30 px-2 py-0.5 text-xs">{r.status}</span></p>
            <p className="mt-1">{r.body}</p>
            <p className="mt-1 text-xs text-slate">{r.consentAt ? `${x.staff.tConsent}: ${r.consentNote}` : "No recorded permission"}</p>
            <form action={setTestimonialStatus} className="mt-2 flex gap-2">
              <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={r.id} />
              {r.status !== "published" && r.consentAt && <button name="status" value="published" className="min-h-10 rounded-lg bg-gold px-3 font-semibold text-navy">{x.staff.publish}</button>}
              {r.status === "published" && <button name="status" value="pending" className="min-h-10 rounded-lg border border-navy px-3">{x.staff.unpublish}</button>}
              {r.status !== "rejected" && <button name="status" value="rejected" className="min-h-10 rounded-lg border border-slate/40 px-3">{x.staff.reject}</button>}
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
