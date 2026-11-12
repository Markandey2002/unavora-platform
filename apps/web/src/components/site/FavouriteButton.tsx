"use client";

import { useState, useTransition } from "react";
import { toggleFavourite } from "@/app/[lang]/(site)/properties/[slug]/actions";

/** Save / unsave a listing for the signed-in customer (server action -> CRM favourites API). */
export function FavouriteButton({ propertyId, initial, labels }: { propertyId: string; initial: boolean; labels: { save: string; saved: string; remove: string } }) {
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <button type="button" aria-pressed={saved} disabled={pending} title={saved ? labels.remove : labels.save}
      onClick={() => start(async () => {
        const next = !saved;
        setSaved(next);
        const ok = await toggleFavourite(propertyId, next);
        if (!ok) { setSaved(!next); setFailed(true); } else setFailed(false);
      })}
      className={`inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${saved ? "border-gold-600 bg-gold-100 text-navy" : "border-navy/20 bg-white text-navy hover:border-navy"} ${failed ? "ring-2 ring-red-700" : ""}`}>
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
        <path d="M10 17s-6.5-3.9-6.5-8.6A3.6 3.6 0 0 1 10 6a3.6 3.6 0 0 1 6.5 2.4C16.5 13.1 10 17 10 17Z" />
      </svg>
      {saved ? labels.saved : labels.save}
    </button>
  );
}
