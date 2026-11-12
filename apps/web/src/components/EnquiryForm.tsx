"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { enquire, type EnquiryState } from "@/app/[lang]/(site)/properties/[slug]/actions";
import { btn, field, label } from "@/components/site/ui";
import type { Dictionary } from "@/i18n/dictionaries";
import type { SiteDictionary } from "@/i18n/site";

const initial: EnquiryState = { status: "idle" };
const TYPES = ["general", "callback", "site_visit", "residential", "commercial", "project"] as const;

/**
 * Public enquiry -> CRM lead (POST /api/v1/public/enquiries via a server action). Variants:
 *  property  - on a listing (labels unchanged: existing browser tests rely on them)
 *  callback  - compact: name, mobile, consent
 *  full      - contact page: adds email, enquiry type and message
 */
export function EnquiryForm({ propertyId, lang, t, f, variant = "property", title, enquiryType, message, id, properties, propertyLabels }: {
  propertyId?: string; lang: string; t: Dictionary; f?: SiteDictionary["form"]; variant?: "property" | "callback" | "full";
  title?: string; enquiryType?: (typeof TYPES)[number]; message?: string; id?: string;
  /** Full variant: optional list of published listings the visitor can pick (sent as propertyId). */
  properties?: { id: string; title: string }[]; propertyLabels?: { label: string; none: string };
}) {
  const [state, action, pending] = useActionState(enquire, initial);
  const [key] = useState(() => crypto.randomUUID()); // same key on retry => no duplicate lead

  if (state.status === "ok") {
    return (
      <div role="status" className="border border-gold/60 bg-gold-100 p-6">
        <p className="eyebrow text-gold-700">✓</p>
        <p className="font-display mt-2 text-2xl font-semibold text-navy">{t.thanks} {state.reference}</p>
        <p className="mt-2 text-sm text-navy/80">{t.thanksSub}</p>
      </div>
    );
  }

  const error =
    state.code === "invalid_phone" ? t.errorPhone
    : state.code === "rate_limited" ? t.errorRate
    : state.code === "property_unavailable" ? t.errorUnavailable
    : state.code === "validation_failed" ? t.errorConsent
    : state.status === "error" ? t.errorGeneric : null;

  const compact = variant === "callback";
  return (
    <form action={action} id={id} className="space-y-4" aria-describedby={error ? `${id ?? "enq"}-err` : undefined}>
      <h2 className="font-display text-2xl font-semibold text-navy">{title ?? t.enquireTitle}</h2>
      {propertyId && <input type="hidden" name="propertyId" value={propertyId} />}
      <input type="hidden" name="language" value={lang} />
      <input type="hidden" name="idempotencyKey" value={key} />
      {enquiryType && <input type="hidden" name="enquiryType" value={enquiryType} />}
      {message && variant !== "full" && <input type="hidden" name="message" value={message} />}
      <div className={compact ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
        <label className={label}>{t.name}
          <input name="name" required maxLength={200} autoComplete="name" className={field} />
        </label>
        <label className={label}>{t.phone}
          <input name="phone" required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} className={field}
            aria-describedby={f && variant === "full" ? "phone-hint" : undefined} />
          {f && variant === "full" && <span id="phone-hint" className="mt-1 block text-xs text-muted">{f.phoneHint}</span>}
        </label>
      </div>
      {!compact && (
        <label className={label}>{t.email}
          <input name="email" type="email" maxLength={254} autoComplete="email" className={field} />
        </label>
      )}
      {variant === "full" && f && !enquiryType && (
        <label className={label}>{f.type}
          <select name="enquiryType" defaultValue="general" className={field}>
            {TYPES.map((v) => <option key={v} value={v}>{f.types[v]}</option>)}
          </select>
        </label>
      )}
      {variant === "full" && properties && properties.length > 0 && propertyLabels && (
        <label className={label}>{propertyLabels.label}
          <select name="propertyId" defaultValue="" className={field}>
            <option value="">{propertyLabels.none}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
      )}
      {!compact && (
        <label className={label}>{t.message}
          <textarea name="message" maxLength={2000} rows={variant === "full" ? 4 : 3} defaultValue={variant === "full" ? message : undefined} className={field} />
        </label>
      )}
      <label className="flex items-start gap-3 text-sm text-navy/85">
        <input name="consent" type="checkbox" required className="mt-0.5 size-5 shrink-0 accent-navy" />
        <span>{t.consent}</span>
      </label>
      {!compact && (
        <label className="flex items-start gap-3 text-sm text-navy/85">
          <input name="marketingConsent" type="checkbox" className="mt-0.5 size-5 shrink-0 accent-navy" />
          <span>{t.marketingConsent}</span>
        </label>
      )}
      {error && <p id={`${id ?? "enq"}-err`} role="alert" className="border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{error}</p>}
      <button disabled={pending} className={`${btn.navy} w-full disabled:opacity-60`}>
        {pending ? t.sending : t.send}
      </button>
      {f && (
        <p className="text-xs text-muted">
          <Link href={`/${lang}/privacy`} className="underline underline-offset-2 hover:text-navy">{f.privacy}</Link>
        </p>
      )}
    </form>
  );
}
