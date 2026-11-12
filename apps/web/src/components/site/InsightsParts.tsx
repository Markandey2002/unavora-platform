"use client";

import Image from "next/image";
import { useState } from "react";

/** Click-to-play YouTube (privacy-enhanced domain). Nothing is requested from YouTube until the visitor presses play. */
export function LiteYouTube({ id, title, labels }: { id: string; title: string; labels: { play: string; note: string } }) {
  const [on, setOn] = useState(false);
  return (
    <div className="relative aspect-video overflow-hidden bg-navy">
      {on ? (
        <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`} title={title} className="absolute inset-0 size-full" loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <button type="button" onClick={() => setOn(true)} aria-label={`${labels.play}: ${title}`}
          className="group absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_70%_30%,#1f3357,#101d35)] text-ivory">
          {/* thumbnail fetched through the Next.js image proxy: no request to Google until the visitor presses play */}
          <Image src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" fill sizes="(min-width:768px) 50vw, 100vw" className="object-cover opacity-60" />
          <span className="relative flex size-20 items-center justify-center rounded-full bg-gold text-navy transition-transform group-hover:scale-105">
            <svg viewBox="0 0 20 20" className="ml-1 size-8" fill="currentColor" aria-hidden><path d="M6 4l10 6-10 6V4Z" /></svg>
          </span>
          <span className="font-display relative max-w-md px-6 text-center text-xl">{title}</span>
          <span className="relative text-xs text-ivory/85">{labels.note}</span>
        </button>
      )}
    </div>
  );
}

export function CopyLink({ url, labels }: { url: string; labels: { copy: string; copied: string } }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* ignore */ } }}
      className="inline-flex min-h-10 items-center border border-navy/20 px-3 text-sm hover:border-navy" aria-live="polite">
      {done ? labels.copied : labels.copy}
    </button>
  );
}
