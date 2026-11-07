import { redirect } from "next/navigation";

export default async function StaffHome({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  redirect(`/${lang === "hi" ? "hi" : "en"}/staff/leads`);
}
