/**
 * Honest placeholder where a listing or project has no approved photograph yet. It never depicts a building (so it
 * cannot be mistaken for the property) and is identical for every listing: it shows a state, not an image.
 */
export function PhotoPending({ label, note, compact = false }: { label: string; note?: string; compact?: boolean }) {
  return (
    <div role="img" aria-label={label}
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[linear-gradient(135deg,#f4f0e8_0%,var(--color-sand)_100%)] px-6 text-center">
      <svg aria-hidden viewBox="0 0 48 48" className={compact ? "size-9 text-navy/30" : "size-12 text-navy/30"} fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="6" y="12" width="36" height="26" rx="2" />
        <path d="M17 12l3-5h8l3 5" />
        <circle cx="24" cy="25" r="7" />
        <path d="M6 6l36 36" className="text-gold-700" stroke="currentColor" />
      </svg>
      <p className={`font-semibold uppercase tracking-[0.16em] text-navy/60 [:lang(hi)_&]:tracking-normal ${compact ? "text-[0.65rem]" : "text-xs"}`}>{label}</p>
      {note && !compact && <p className="max-w-sm text-sm text-muted">{note}</p>}
    </div>
  );
}
