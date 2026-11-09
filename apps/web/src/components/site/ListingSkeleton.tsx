/**
 * Loading state for LIST pages only (listing, categories, projects): a calm skeleton, no spinner. Detail pages have no
 * loading boundary on purpose, so a missing listing or project still returns a real HTTP 404 (no streamed soft 404).
 */
export function ListingSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="mx-auto max-w-7xl animate-pulse px-4 py-16 sm:px-6 lg:px-8">
      <span className="sr-only">Loading…</span>
      <div className="h-3 w-32 bg-gold/40" />
      <div className="mt-5 h-10 w-2/3 max-w-xl bg-navy/10" />
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white">
            <div className="aspect-[4/3] bg-navy/10" />
            <div className="space-y-3 p-5"><div className="h-4 w-3/4 bg-navy/10" /><div className="h-3 w-1/2 bg-navy/10" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
