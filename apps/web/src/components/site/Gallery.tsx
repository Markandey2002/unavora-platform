"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Media } from "@/lib/api";

export type GalleryLabels = {
  title: string; open: string; close: string; prev: string; next: string; of: string; swipe: string; kinds: Record<string, string>;
};

const counter = (tpl: string, i: number, n: number) => tpl.replace("{i}", String(i)).replace("{n}", String(n));

/**
 * Approved photographs of ONE listing or project (the API returns only public, scanned, approved media, primary first).
 * Phones: swipeable strip with a counter. Larger screens: primary image plus two thumbnails. Any image opens a
 * full-size viewer (native modal dialog: focus is trapped, Esc closes, arrow keys and swipe move between photos).
 * Captions and the kind of picture (photograph / artist's impression / floor plan) are always shown.
 */
export function Gallery({ images, title, labels }: { images: Media[]; title: string; labels: GalleryLabels }) {
  const [open, setOpen] = useState<number | null>(null);
  const [shown, setShown] = useState(0);
  const strip = useRef<HTMLUListElement>(null);
  const alt = (m: Media, i: number) => m.alt ?? `${title} — ${counter(labels.of, i + 1, images.length)}`;

  const onScroll = () => {
    const el = strip.current;
    if (el) setShown(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  return (
    <section aria-label={labels.title}>
      {/* phones: swipe strip */}
      <div className="relative sm:hidden">
        <ul ref={strip} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]" aria-label={labels.swipe}>
          {images.map((m, i) => (
            <li key={m.url} className="relative aspect-[4/3] w-full shrink-0 snap-center bg-sand">
              <button type="button" onClick={() => setOpen(i)} className="block size-full" aria-label={`${labels.open}: ${alt(m, i)}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={alt(m, i)} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"} className="size-full object-cover" />
              </button>
              <KindTag m={m} labels={labels} />
            </li>
          ))}
        </ul>
        {images.length > 1 && (
          <p aria-live="polite" className="absolute bottom-2 right-2 bg-navy/80 px-2 py-0.5 text-xs font-semibold text-ivory">
            {counter(labels.of, shown + 1, images.length)}
          </p>
        )}
      </div>

      {/* tablet/desktop: primary + thumbnails */}
      <div className="hidden gap-2 sm:grid sm:grid-cols-4 sm:grid-rows-2">
        {images.slice(0, 3).map((m, i) => (
          <div key={m.url} className={`relative overflow-hidden bg-sand ${i === 0 ? "sm:col-span-3 sm:row-span-2 sm:min-h-[420px]" : "aspect-[4/3]"}`}>
            <button type="button" onClick={() => setOpen(i)} className="absolute inset-0 block" aria-label={`${labels.open}: ${alt(m, i)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={alt(m, i)} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"}
                className="size-full object-cover transition-transform duration-500 hover:scale-[1.02]" />
            </button>
            <KindTag m={m} labels={labels} />
            {i === 2 && images.length > 3 && (
              <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center bg-navy/55 text-lg font-semibold text-ivory">+{images.length - 3}</span>
            )}
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <button type="button" onClick={() => setOpen(0)} className="mt-3 inline-flex min-h-11 items-center border border-navy/20 px-4 text-sm font-semibold hover:border-navy">
          {labels.open} ({images.length})
        </button>
      )}
      {images[0]?.caption && <p className="mt-2 text-sm text-muted">{images[0].caption}</p>}

      {open !== null && <Viewer images={images} start={open} title={title} labels={labels} onClose={() => setOpen(null)} alt={alt} />}
    </section>
  );
}

function KindTag({ m, labels }: { m: Media; labels: GalleryLabels }) {
  if (m.kind === "actual_photo") return null; // a photograph needs no qualifier; renders and plans are always labelled
  return <span className="pointer-events-none absolute left-2 top-2 bg-ivory/95 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-navy">{labels.kinds[m.kind] ?? m.kind}</span>;
}

function Viewer({ images, start, title, labels, onClose, alt }: {
  images: Media[]; start: number; title: string; labels: GalleryLabels; onClose: () => void; alt: (m: Media, i: number) => string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(start);
  const touch = useRef<number | null>(null);
  const go = useCallback((d: number) => setI((v) => (v + d + images.length) % images.length), [images.length]);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const trigger = document.activeElement as HTMLElement | null;
    return () => trigger?.focus?.();
  }, []);

  const m = images[i];
  return (
    <dialog ref={ref} onClose={onClose} aria-label={`${labels.title}: ${title}`}
      onKeyDown={(e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-navy/95 p-0 text-ivory backdrop:bg-navy/80">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <p aria-live="polite" className="text-sm">{counter(labels.of, i + 1, images.length)}{m.kind !== "actual_photo" && ` · ${labels.kinds[m.kind] ?? m.kind}`}</p>
          <button type="button" onClick={() => ref.current?.close()} autoFocus className="inline-flex min-h-11 min-w-11 items-center justify-center border border-ivory/30 px-3 text-sm font-semibold hover:border-ivory">
            {labels.close}
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2"
          onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); touch.current = null; }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.url} alt={alt(m, i)} className="max-h-full max-w-full object-contain" />
          {images.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label={labels.prev} className="absolute left-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center bg-navy/70 text-2xl hover:bg-navy">‹</button>
              <button type="button" onClick={() => go(1)} aria-label={labels.next} className="absolute right-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center bg-navy/70 text-2xl hover:bg-navy">›</button>
            </>
          )}
        </div>
        <p className="min-h-12 px-4 py-3 text-center text-sm text-ivory/85">{m.caption ?? ""}</p>
      </div>
    </dialog>
  );
}

/** Floor plans open in the same full-size viewer. */
export function FloorPlans({ plans, title, heading, labels }: { plans: Media[]; title: string; heading: string; labels: GalleryLabels }) {
  const [open, setOpen] = useState<number | null>(null);
  const alt = (m: Media, i: number) => m.alt ?? `${heading} ${i + 1}: ${title}`;
  return (
    <section aria-labelledby="floorplans" className="mt-10">
      <h2 id="floorplans" className="font-display text-2xl font-semibold">{heading}</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {plans.map((p, i) => (
          <li key={p.url} className="relative aspect-[4/3] overflow-hidden border border-navy/10 bg-white">
            <button type="button" onClick={() => setOpen(i)} className="block size-full" aria-label={`${labels.open}: ${alt(p, i)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={alt(p, i)} loading="lazy" className="size-full object-contain" />
            </button>
            {p.caption && <p className="absolute inset-x-0 bottom-0 bg-white/90 px-3 py-1.5 text-xs">{p.caption}</p>}
          </li>
        ))}
      </ul>
      {open !== null && <Viewer images={plans} start={open} title={title} labels={labels} onClose={() => setOpen(null)} alt={alt} />}
    </section>
  );
}
