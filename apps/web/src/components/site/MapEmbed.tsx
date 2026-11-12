"use client";

import { useState } from "react";

export type MapPoint = { latitude: number; longitude: number; precision: "exact" | "approximate" };

/**
 * Click-to-load OpenStreetMap. Nothing is requested from openstreetmap.org until the visitor asks for the map.
 * "approximate" shows the surrounding area WITHOUT a pin (the locality, never the address); "exact" shows a pin and is
 * used only when the business approved showing the exact position (hide_exact_location = false).
 */
export function MapEmbed({ point, title, labels }: {
  point: MapPoint; title: string; labels: { show: string; approximate: string; exact: string; attribution: string };
}) {
  const [on, setOn] = useState(false);
  const d = point.precision === "exact" ? 0.006 : 0.02;   // ~0.6 km vs ~2 km around the point
  const bbox = [point.longitude - d, point.latitude - d, point.longitude + d, point.latitude + d].map((v) => v.toFixed(5)).join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik${point.precision === "exact" ? `&marker=${point.latitude},${point.longitude}` : ""}`;
  return (
    <div className="mt-4">
      <div className="relative aspect-[16/9] overflow-hidden border border-navy/10 bg-sand">
        {on ? (
          <iframe src={src} title={title} className="absolute inset-0 size-full" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <button type="button" onClick={() => setOn(true)} className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-navy hover:bg-white/40">
            <svg aria-hidden viewBox="0 0 24 24" className="size-10 text-gold-700" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14" /></svg>
            <span className="font-semibold">{labels.show}</span>
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">{point.precision === "exact" ? labels.exact : labels.approximate} · {labels.attribution}</p>
    </div>
  );
}
