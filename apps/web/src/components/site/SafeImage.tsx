"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

/**
 * next/image with an honest loading state and failure state:
 *  - while loading: the container keeps its size (callers give width/height or `fill` in a sized box) and shows a
 *    soft animated background, so there is no blank area and no layout shift;
 *  - if the file genuinely fails (HTTP error, undecodable file): a labelled "Photo unavailable" panel replaces the
 *    broken-image icon, so a missing photo never silently disappears. It never substitutes another photograph.
 */
export function SafeImage({ unavailableLabel = "Photo unavailable", className = "", onLoad, onError, ...props }: ImageProps & { unavailableLabel?: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  if (state === "failed") {
    return (
      <span role="img" aria-label={`${props.alt} — ${unavailableLabel}`} data-testid="image-fallback"
        className={`flex size-full flex-col items-center justify-center gap-2 bg-sand text-center text-xs font-medium uppercase tracking-[0.14em] text-muted ${props.fill ? "absolute inset-0" : ""}`}>
        <svg aria-hidden viewBox="0 0 24 24" className="size-6 text-navy/40" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6M3 3l18 18" /></svg>
        {unavailableLabel}
      </span>
    );
  }
  return (
    <>
      {state === "loading" && props.fill && <span aria-hidden className="absolute inset-0 animate-pulse bg-sand motion-reduce:animate-none" />}
      <Image {...props} className={`${className} transition-opacity duration-300 motion-reduce:transition-none ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
        onLoad={(e) => { setState("loaded"); onLoad?.(e); }} onError={(e) => { setState("failed"); onError?.(e); }} />
    </>
  );
}
