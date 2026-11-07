import type { StaffDictionary } from "@/i18n/staff";

/** Result banner for staff forms (they redirect back with ?saved=… or ?error=code). */
export function Flash({ saved, error, t }: { saved?: string; error?: string; t: StaffDictionary }) {
  if (saved) return <p role="status" className="rounded-lg bg-gold/30 p-3">{t.saved}</p>;
  if (error) return <p role="alert" data-testid="form-error" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">{t.errors[error] ?? t.errors.generic}</p>;
  return null;
}

/** "YYYY-MM-DDTHH:mm" in India time for <input type="datetime-local">. */
export function istInput(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16);
}
