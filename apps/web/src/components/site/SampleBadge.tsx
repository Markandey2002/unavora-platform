/** Marks a synthetic local/test record so it can never be mistaken for a real listing or project. */
export function SampleBadge({ label, note, className = "" }: { label: string; note: string; className?: string }) {
  return (
    <span title={note} className={`inline-flex items-center gap-1.5 border border-dashed border-red-700 bg-[repeating-linear-gradient(135deg,#fff7f5_0_6px,#fde8e4_6px_12px)] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-red-800 [:lang(hi)_&]:tracking-normal ${className}`}>
      {label}<span className="sr-only">: {note}</span>
    </span>
  );
}
