import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLang } from "@/i18n/dictionaries";
import { getExtraDictionary } from "@/i18n/extra";
import { getStaffDictionary } from "@/i18n/staff";
import { can } from "@/lib/staff";
import { requireStaff } from "@/lib/staffPage";

export const metadata: Metadata = { title: "Website content" };

/** Director website-content hub (permissions: cms.manage, property.publish, settings.manage). */
export default async function ContentHub({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const { me } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const x = getExtraDictionary(lang);
  const items = [
    can(me, "cms.manage") && ["site", x.cms.site],
    can(me, "cms.manage") && ["showcase", x.cms.showcase],
    can(me, "cms.manage") && ["library", x.cms.library],
    can(me, "cms.manage") && ["associations", x.cms.associations],
    can(me, "cms.manage") && ["articles", x.staff.articles],
    can(me, "cms.manage") && ["testimonials", x.staff.testimonials],
    can(me, "property.publish") && ["featured", x.staff.featured],
    can(me, "cms.manage") && ["locations", x.staff.locations],
    can(me, "settings.manage") && ["company", x.staff.company],
  ].filter(Boolean) as [string, string][];
  if (items.length === 0) return <p role="alert" data-testid="not-permitted">{t.notPermitted}</p>;
  return (
    <section>
      <h1 className="text-2xl font-semibold">{x.staff.content}</h1>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([k, label]) => (
          <li key={k}><Link href={`/${lang}/staff/content/${k}`} className="block rounded-xl border border-slate/20 bg-white p-5 font-semibold hover:border-navy">{label} →</Link></li>
        ))}
      </ul>
    </section>
  );
}
