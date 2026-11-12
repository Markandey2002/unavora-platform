import { photoAction, savePhoto, uploadPhoto } from "@/app/[lang]/staff/(crm)/listing-actions";
import type { ExtraDictionary } from "@/i18n/extra";
import type { MediaItem, MediaOwner } from "@/lib/staff";

/**
 * Photographs of one listing or project in the CRM. Previews come from the PRIVATE original (staff-only BFF route).
 * Upload -> scan -> (edit alt/caption/credit) -> director approves -> public copy. Works without JavaScript.
 */
export function MediaManager({ lang, owner, ownerId, items, canUpload, canApprove, x }: {
  lang: string; owner: MediaOwner; ownerId: string; items: MediaItem[]; canUpload: boolean; canApprove: boolean; x: ExtraDictionary;
}) {
  const c = x.crm;
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2 text-sm";
  const hidden = (mid?: string) => (
    <>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="owner" value={owner} /><input type="hidden" name="id" value={ownerId} />
      {mid && <input type="hidden" name="mid" value={mid} />}
    </>
  );
  const t = owner === "projects" ? "project" : "property";
  const scanTone = (s: string) => (s === "clean" ? "bg-green-100 text-green-900" : s === "not_scanned" ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900");
  return (
    <section aria-labelledby="media-h" className="rounded-xl border border-slate/20 bg-white p-4" data-testid="media-manager">
      <h2 id="media-h" className="font-semibold">{c.media} ({items.length})</h2>
      <p className="mt-1 text-xs text-slate">{c.mediaNote}</p>

      {canUpload && (
        <form action={uploadPhoto} className="mt-4 grid gap-3 rounded-lg bg-ivory p-3 sm:grid-cols-2" data-testid="media-upload">
          {hidden()}
          <label className="block text-sm sm:col-span-2">{c.file}<input type="file" name="file" required accept="image/jpeg,image/png,image/webp" className={field} /></label>
          <label className="block text-sm">{c.kind}
            <select name="kind" className={field}>{Object.entries(c.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="block text-sm">{c.alt}<input name="altEn" maxLength={250} className={field} /></label>
          <label className="block text-sm">{c.caption}<input name="captionEn" maxLength={250} className={field} /></label>
          <label className="block text-sm">{c.credit}<input name="credit" maxLength={200} className={field} /></label>
          <label className="block text-sm sm:col-span-2">{c.licence}<input name="licence" maxLength={200} className={field} /></label>
          <button className="min-h-11 justify-self-start rounded-lg bg-navy px-5 font-semibold text-ivory">{c.upload}</button>
        </form>
      )}

      {items.length === 0 ? <p className="mt-4 text-sm text-slate">{c.none}</p> : (
        <ul className="mt-4 grid gap-4 lg:grid-cols-2">
          {items.map((m) => (
            <li key={m.id} className="rounded-lg border border-slate/20 p-3" data-testid="media-item">
              <div className="flex gap-3">
                <a href={`/_bff/staff/media-file?t=${t}&o=${ownerId}&m=${m.id}`} target="_blank" rel="noopener" className="block size-24 shrink-0 overflow-hidden rounded bg-sand" aria-label={c.preview}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/_bff/staff/media-file?t=${t}&o=${ownerId}&m=${m.id}`} alt={m.altEn ?? ""} className="size-full object-cover" />
                </a>
                <div className="min-w-0 text-xs">
                  <p className="flex flex-wrap gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${scanTone(m.scanStatus)}`} data-testid="scan-status">{c.scan[m.scanStatus] ?? m.scanStatus}{m.scanner === "mock" ? " (local test scanner)" : ""}</span>
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${m.public ? "bg-navy text-ivory" : "bg-slate/15"}`} data-testid="media-visibility">{m.public ? c.live : c.private}</span>
                    {m.primary && <span className="rounded bg-gold/40 px-1.5 py-0.5 font-semibold">{c.primary}</span>}
                    <span className="rounded bg-slate/10 px-1.5 py-0.5">{c.kinds[m.kind] ?? m.kind}</span>
                  </p>
                  {m.sizeBytes != null && <p className="mt-1 text-slate">{Math.round(m.sizeBytes / 1024)} KB</p>}
                </div>
              </div>
              <form action={savePhoto} className="mt-3 grid gap-2 sm:grid-cols-2">
                {hidden(m.id)}
                <label className="block text-xs">{c.kind}
                  <select name="kind" defaultValue={m.kind} className={field}>{Object.entries(c.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </label>
                <label className="block text-xs">{c.order}<input name="sortOrder" type="number" min={0} max={999} defaultValue={m.sortOrder} className={field} /></label>
                <label className="block text-xs">{c.alt}<input name="altEn" defaultValue={m.altEn ?? ""} maxLength={250} className={field} /></label>
                <label className="block text-xs">{c.altHi}<input name="altHi" defaultValue={m.altHi ?? ""} maxLength={250} className={field} /></label>
                <label className="block text-xs">{c.caption}<input name="captionEn" defaultValue={m.captionEn ?? ""} maxLength={250} className={field} /></label>
                <label className="block text-xs">{c.captionHi}<input name="captionHi" defaultValue={m.captionHi ?? ""} maxLength={250} className={field} /></label>
                <label className="block text-xs">{c.credit}<input name="credit" defaultValue={m.credit ?? ""} maxLength={200} className={field} /></label>
                <label className="block text-xs">{c.licence}<input name="licence" defaultValue={m.licence ?? ""} maxLength={200} className={field} /></label>
                {canUpload && <button className="min-h-10 justify-self-start rounded-lg border border-navy px-4 text-sm font-semibold">{c.save}</button>}
              </form>
              <form action={photoAction} className="mt-2 flex flex-wrap gap-2">
                {hidden(m.id)}
                {canApprove && !m.public && <button name="action" value="approve" disabled={m.scanStatus !== "clean"} className="min-h-10 rounded-lg bg-navy px-3 text-sm font-semibold text-ivory disabled:opacity-40">{c.approvePhoto}</button>}
                {canApprove && m.public && <button name="action" value="unapprove" className="min-h-10 rounded-lg border border-navy px-3 text-sm">{c.unapprove}</button>}
                {canApprove && !m.primary && m.kind !== "floor_plan" && <button name="action" value="primary" className="min-h-10 rounded-lg border border-slate/40 px-3 text-sm">{c.makePrimary}</button>}
                {canUpload && <button name="action" value="delete" className="min-h-10 rounded-lg border border-red-700 px-3 text-sm text-red-800">{c.delete}</button>}
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
