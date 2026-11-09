"use client";

import { useActionState, useState } from "react";
import { customerRequestAction, type RequestState } from "@/app/[lang]/(site)/account/actions";
import type { Dictionary } from "@/i18n/dictionaries";

/** Signed-in, WhatsApp-verified customers. Each submission becomes its own CRM lead. */
export function CustomerRequestForm({ propertyId, t }: { propertyId?: string; t: Dictionary }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(customerRequestAction, { status: "idle" });
  const [type, setType] = useState(propertyId ? "enquiry" : "callback");
  const [key] = useState(() => crypto.randomUUID());
  const today = new Date().toISOString().slice(0, 10);
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";

  if (state.status === "ok") {
    return (
      <div role="status" className="rounded-xl bg-gold/30 p-4">
        <p className="font-semibold">{t.requestSent} {state.reference}</p>
        <p className="mt-1 text-sm">{t.thanksSub}</p>
      </div>
    );
  }
  const options = propertyId
    ? [["enquiry", t.requestEnquiry], ["site_visit", t.requestVisit], ["callback", t.requestCallback]]
    : [["callback", t.requestCallback]];
  const error =
    state.code === "validation_failed" ? t.errorConsent
    : state.code === "property_unavailable" ? t.errorUnavailable
    : state.code === "whatsapp_not_verified" ? t.verifyFirst
    : state.status === "error" ? t.errorGeneric : null;

  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate/20 bg-white p-4">
      <h2 className="text-lg font-semibold">{t.requestTitle}</h2>
      {propertyId && <input type="hidden" name="propertyId" value={propertyId} />}
      <input type="hidden" name="idempotencyKey" value={key} />
      <fieldset className="space-y-2">
        {options.map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} className="size-5" />
            {label}
          </label>
        ))}
      </fieldset>
      {type === "site_visit" && (
        <label className="block text-sm">{t.preferredDate}
          <input type="date" name="preferredDate" required min={today} className={field} />
        </label>
      )}
      <label className="block text-sm">{t.message}
        <textarea name="message" maxLength={2000} rows={3} className={field} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input name="enquiryConsent" type="checkbox" required className="mt-1 size-5" />
        <span>{t.enquiryConsent}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input name="marketingConsent" type="checkbox" className="mt-1 size-5" />
        <span>{t.marketingConsent}</span>
      </label>
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-lg bg-navy px-6 font-semibold text-ivory disabled:opacity-60">
        {pending ? t.sending : t.submitRequest}
      </button>
    </form>
  );
}
