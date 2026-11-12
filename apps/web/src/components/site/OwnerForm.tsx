"use client";

import { useActionState, useState } from "react";
import { submitOwner, type EnquiryState } from "@/app/[lang]/(site)/properties/[slug]/actions";
import type { Dictionary } from "@/i18n/dictionaries";
import type { ExtraDictionary } from "@/i18n/extra";
import { btn, field, label } from "./ui";

const TYPES: [string, string][] = [["apartment", "Apartment / flat"], ["villa", "Villa"], ["independent_house", "Independent house"], ["plot", "Plot / land"],
  ["office", "Office space"], ["retail", "Retail / shop"], ["warehouse", "Warehouse"]];

export function OwnerForm({ lang, t, f, typeLabels, cities }: {
  lang: string; t: Dictionary; f: ExtraDictionary["owner"]["form"]; typeLabels: Record<string, string>; cities: string[];
}) {
  const [state, action, pending] = useActionState<EnquiryState, FormData>(submitOwner, { status: "idle" });
  const [key] = useState(() => crypto.randomUUID());
  const [fileError, setFileError] = useState(false);
  if (state.status === "ok") {
    return (
      <div role="status" className="border border-gold/60 bg-gold-100 p-6">
        <p className="font-display text-2xl font-semibold text-navy">{f.thanks} {state.reference}</p>
        <p className="mt-2 text-sm text-navy/80">{f.thanksSub}</p>
      </div>
    );
  }
  const error =
    state.code === "file_type" || state.code === "file_too_large" || state.code === "too_many_files" || state.code === "file_empty" ? f.errFile
    : state.code === "invalid_phone" ? t.errorPhone
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
        <label className={label}>{f.phone}<input name="phone" required type="tel" inputMode="tel" maxLength={20} autoComplete="tel" className={field} /></label>
        <label className={label}>{f.email}<input name="email" type="email" maxLength={254} autoComplete="email" className={field} /></label>
        <label className={label}>{f.city}
          <input name="city" required maxLength={100} list="owner-cities" autoComplete="address-level2" className={field} />
          <datalist id="owner-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className={label}>{f.locality}<input name="locality" maxLength={150} className={field} /></label>
        <label className={label}>{f.type}
          <select name="propertyType" required defaultValue="apartment" className={field}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{typeLabels[v] ?? l}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="border-0 p-0">
        <legend className={label}>{f.purpose}</legend>
        <div className="mt-2 flex gap-6">
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="purpose" value="sale" defaultChecked className="size-5 accent-navy" />{f.sale}</label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="purpose" value="rent" className="size-5 accent-navy" />{f.rent}</label>
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>{f.price}<input name="expectedPrice" type="number" min={1} step={1} inputMode="numeric" className={field} /></label>
        <label className={label}>{f.area}<input name="area" type="number" min={1} step="any" inputMode="decimal" className={field} /></label>
        <label className={label}>{f.unit}
          <select name="areaUnit" defaultValue="sq_ft" className={field}>
            <option value="sq_ft">sq ft</option><option value="sq_yd">sq yd</option><option value="sq_m">sq m</option><option value="acre">acre</option>
          </select>
        </label>
      </div>
      <label className={label}>{f.message}<textarea name="message" rows={3} maxLength={2000} className={field} /></label>
      <label className={label}>{f.photos}
        <input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" aria-describedby="photos-note"
          onChange={(e) => {
            const files = [...(e.currentTarget.files ?? [])];
            const bad = files.length > 5 || files.some((x) => x.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(x.type));
            setFileError(bad);
            e.currentTarget.setCustomValidity(bad ? f.errFile : "");
          }}
          className="mt-1.5 block w-full text-sm file:mr-3 file:min-h-11 file:border-0 file:bg-navy file:px-4 file:text-sm file:font-semibold file:text-ivory" />
        <span id="photos-note" className="mt-1 block text-xs text-muted">{f.photosNote}</span>
      </label>
      {fileError && <p role="alert" className="text-sm font-medium text-red-800">{f.errFile}</p>}
      <label className="flex items-start gap-3 text-sm text-navy/85">
        <input name="consent" type="checkbox" required className="mt-0.5 size-5 shrink-0 accent-navy" /><span>{f.consent}</span>
      </label>
      {error && <p role="alert" className="border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{error}</p>}
      <button disabled={pending} className={`${btn.navy} w-full disabled:opacity-60`}>{pending ? f.sending : f.submit}</button>
    </form>
  );
}
