"use client";

import { useActionState, useState } from "react";
import { applyPartner, type EnquiryState } from "@/app/[lang]/(site)/properties/[slug]/actions";
import type { Dictionary } from "@/i18n/dictionaries";
import type { SiteDictionary } from "@/i18n/site";
import { btn, field, label } from "./ui";

export function PartnerForm({ lang, t, f, cities }: { lang: string; t: Dictionary; f: SiteDictionary["partner"]["form"]; cities: string[] }) {
  const [state, action, pending] = useActionState<EnquiryState, FormData>(applyPartner, { status: "idle" });
  const [key] = useState(() => crypto.randomUUID());
  if (state.status === "ok") {
    return (
      <div role="status" className="border border-gold/60 bg-gold-100 p-6">
        <p className="font-display text-2xl font-semibold text-navy">{f.thanks} {state.reference}</p>
        <p className="mt-2 text-sm text-navy/80">{f.thanksSub}</p>
      </div>
    );
  }
  const error =
    state.code === "invalid_phone" ? t.errorPhone
    : state.code === "rate_limited" ? t.errorRate
    : state.code === "validation_failed" ? t.errorConsent
    : state.status === "error" ? t.errorGeneric : null;
  return (
    <form action={action} className="space-y-4">
      <h2 className="font-display text-2xl font-semibold text-navy">{f.title}</h2>
      <input type="hidden" name="language" value={lang} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>{f.name}<input name="name" required maxLength={200} autoComplete="name" className={field} /></label>
        <label className={label}>{f.phone}<input name="phone" required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} className={field} /></label>
        <label className={label}>{f.email}<input name="email" type="email" maxLength={254} autoComplete="email" className={field} /></label>
        <label className={label}>{f.company}<input name="companyName" maxLength={200} autoComplete="organization" className={field} /></label>
        <label className={label}>{f.city}
          <input name="city" required maxLength={100} list="partner-cities" autoComplete="address-level2" className={field} />
          <datalist id="partner-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className={label}>{f.areas}<input name="areas" maxLength={500} className={field} /></label>
      </div>
      <label className={label}>{f.rera}
        <input name="rera" maxLength={60} className={field} aria-describedby="rera-note" />
        <span id="rera-note" className="mt-1 block text-xs text-muted">{f.reraNote}</span>
      </label>
      <label className={label}>{f.message}<textarea name="message" rows={3} maxLength={2000} className={field} /></label>
      <label className="flex items-start gap-3 text-sm text-navy/85">
        <input name="consent" type="checkbox" required className="mt-0.5 size-5 shrink-0 accent-navy" /><span>{f.consent}</span>
      </label>
      {error && <p role="alert" className="border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{error}</p>}
      <button disabled={pending} className={`${btn.navy} w-full disabled:opacity-60`}>{pending ? f.sending : f.submit}</button>
    </form>
  );
}
