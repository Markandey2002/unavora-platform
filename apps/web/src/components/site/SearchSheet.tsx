"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Phone-sized filter bottom sheet built on <dialog> (native focus trap, Esc to close, backdrop). */
export function FilterSheet({ labels, activeCount, children }: {
  labels: { open: string; close: string; title: string }; activeCount: number; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClick = (e: MouseEvent) => { if (e.target === d) d.close(); };
    d.addEventListener("click", onClick);
    return () => d.removeEventListener("click", onClick);
  }, []);
  return (
    <div className="md:hidden">
      <button type="button" onClick={() => ref.current?.showModal()}
        className="flex min-h-12 w-full items-center justify-center gap-2 border border-navy/20 bg-white text-sm font-semibold uppercase tracking-[0.14em] text-navy [:lang(hi)_&]:tracking-normal">
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M3 5h14M6 10h8m-5 5h2" /></svg>
        {labels.open}{activeCount > 0 && <span className="ml-1 bg-gold px-2 py-0.5 text-xs text-navy">{activeCount}</span>}
      </button>
      <dialog ref={ref} aria-label={labels.title}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto bg-ivory p-0 backdrop:bg-navy/50 open:animate-[rise_0.3s_ease-out]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-navy/10 bg-ivory px-5 py-3">
          <span className="eyebrow text-gold-700">{labels.title}</span>
          <button type="button" onClick={() => ref.current?.close()} aria-label={labels.close} className="flex size-11 items-center justify-center">
            <svg viewBox="0 0 20 20" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>
        <div className="px-5 pb-6 pt-4">{children}</div>
      </dialog>
    </div>
  );
}

/** Phone property finder: a search-field-like trigger in the hero that opens the full finder as a bottom sheet. */
export function FinderSheet({ labels, children }: { labels: { prompt: string; open: string; close: string; title: string; submit: string }; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClick = (e: MouseEvent) => { if (e.target === d) d.close(); };
    d.addEventListener("click", onClick);
    return () => d.removeEventListener("click", onClick);
  }, []);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} aria-label={labels.open}
        className="flex min-h-14 w-full items-center gap-3 bg-ivory px-4 text-left text-navy shadow-[var(--shadow-lift)]">
        <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-gold-700" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3.5 3.5" /></svg>
        <span className="flex-1 text-[0.95rem] text-muted">{labels.prompt}</span>
        <span className="bg-gold px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-navy [:lang(hi)_&]:tracking-normal">{labels.submit}</span>
      </button>
      <dialog ref={ref} aria-label={labels.title}
        className="m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto bg-ivory p-0 text-navy backdrop:bg-navy/60 open:animate-[rise_0.3s_ease-out]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-navy/10 bg-ivory px-5 py-3">
          <span className="eyebrow text-gold-700">{labels.title}</span>
          <button type="button" onClick={() => ref.current?.close()} aria-label={labels.close} className="flex size-11 items-center justify-center">
            <svg viewBox="0 0 20 20" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>
        <div className="px-5 pb-6 pt-4">{children}</div>
      </dialog>
    </>
  );
}
