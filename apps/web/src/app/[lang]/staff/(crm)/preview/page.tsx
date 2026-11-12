import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeView } from "@/components/site/HomeView";
import { isLang } from "@/i18n/dictionaries";
import { getStaffDictionary } from "@/i18n/staff";
import { staffApi } from "@/lib/staff";
import { handle, isError, requireStaff } from "@/lib/staffPage";

export const metadata: Metadata = { title: "Homepage preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Staff-only preview of the homepage with DRAFT CMS blocks (never cached, never indexed, never public). */
export default async function PreviewPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const { session } = await requireStaff(lang);
  const t = getStaffDictionary(lang);
  const blocks = handle(lang, await staffApi.cmsPreview(session, lang));
  if (isError(blocks)) return <p role="alert" data-testid="not-permitted">{blocks.status === 403 ? t.notPermitted : (t.errors[blocks.error] ?? t.errors.generic)}</p>;
  return <div className="site -mx-4 sm:-mx-6 lg:-mx-8"><HomeView lang={lang} blocks={blocks} preview /></div>;
}
