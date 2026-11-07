"use client";

import { useActionState, useState } from "react";
import { enquire, type EnquiryState } from "@/app/[lang]/properties/[slug]/actions";
import type { Dictionary } from "@/i18n/dictionaries";

const initial: EnquiryState = { status: "idle" };

export function EnquiryForm({ propertyId, lang, t }: { propertyId: string; lang: string; t: Dictionary }) {
  const [state, action, pending] = useActionState(enquire, initial);
  const [key] = useState(() => crypto.randomUUID()); // same key on retry => no duplicate lead

  if (state.status === "ok") {
    return (
      <div role="status" className="rounded-xl bg-gold/30 p-4">
        <p className="font-semibold">{t.thanks} {state.reference}</p>
        <p className="mt-1 text-sm">{t.thanksSub}</p>
      </div>
    );
  }

  const message =
    state.code === "invalid_phone" ? t.errorPhone
    : state.code === "rate_limited" ? t.errorRate
    : state.code === "property_unavailable" ? t.errorUnavailable
    : state.code === "validation_failed" ? t.errorConsent
    : state.status === "error" ? t.errorGeneric : null;

  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate/20 bg-white p-4">
      <h2 className="text-lg font-semibold">{t.enquireTitle}</h2>
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="language" value={lang} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <label className="block text-sm">{t.name}
        <input name="name" required maxLength={200} autoComplete="name" className={field} />
      </label>
      <label className="block text-sm">{t.phone}
        <input name="phone" required inputMode="tel" autoComplete="tel" maxLength={20} className={field} />
      </label>
      <label className="block text-sm">{t.email}
        <input name="email" type="email" maxLength={254} autoComplete="email" className={field} />
      </label>
      <label className="block text-sm">{t.message}
        <textarea name="message" maxLength={2000} rows={3} className={field} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input name="consent" type="checkbox" required className="mt-1 size-5" />
        <span>{t.consent}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input name="marketingConsent" type="checkbox" className="mt-1 size-5" />
        <span>{t.marketingConsent}</span>
      </label>
      {message && <p role="alert" className="text-sm font-medium text-red-700">{message}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-lg bg-navy px-6 font-semibold text-ivory disabled:opacity-60">
        {pending ? t.sending : t.send}
      </button>
    </form>
  );
}
