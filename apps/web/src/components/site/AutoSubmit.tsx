"use client";

import type { ReactNode } from "react";

/** A <select> that submits its GET form on change; the visible button keeps it working without JavaScript. */
export function AutoSubmitSelect({ name, defaultValue, label, options, className }: {
  name: string; defaultValue: string; label: string; options: [string, string][]; className?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="whitespace-nowrap">{label}</span>
      <select name={name} defaultValue={defaultValue} onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={className ?? "min-h-10 border border-navy/15 bg-white px-2 text-sm text-navy focus:border-gold-600 focus:outline-none"}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function NoJsSubmit({ children }: { children: ReactNode }) {
  return <noscript><button className="min-h-10 border border-navy/20 px-3 text-sm">{children}</button></noscript>;
}
