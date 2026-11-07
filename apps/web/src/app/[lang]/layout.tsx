import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "../globals.css";
import { getDictionary, isLang, languages } from "@/i18n/dictionaries";

export const metadata: Metadata = {
  title: { default: "UNAVORA ANANT INFRA", template: "%s | UNAVORA ANANT INFRA" },
  description: "Residential, commercial and plot listings in Noida, Lucknow and Prayagraj.",
};

export function generateStaticParams() {
  return languages.map((lang) => ({ lang }));
}

export default async function LangLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDictionary(lang);
  const other = lang === "en" ? "hi" : "en";
  return (
    <html lang={lang}>
      <body className="min-h-dvh bg-ivory text-navy antialiased">
        <header className="bg-navy text-ivory">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href={`/${lang}`} className="text-lg font-semibold tracking-wide text-gold">{t.brand}</Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href={`/${lang}/properties`} className="min-h-11 content-center hover:text-gold">{t.properties}</Link>
              <Link href={`/${lang}/account`} className="min-h-11 content-center hover:text-gold">{t.account}</Link>
              <Link href={`/${other}`} lang={other} className="min-h-11 content-center rounded border border-gold/60 px-3 hover:bg-gold hover:text-navy">{t.switchLang}</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mt-12 bg-navy px-4 py-6 text-center text-sm text-ivory/80">
          <p>{t.tagline}</p>
          <p className="mt-1 text-xs text-ivory/60">{t.sampleNotice}</p>
        </footer>
      </body>
    </html>
  );
}
