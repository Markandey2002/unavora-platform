import { createFollowUp } from "@/app/[lang]/staff/(crm)/actions";
import type { StaffDictionary } from "@/i18n/staff";
import type { Assignee } from "@/lib/staff";
import { istInput } from "./Flash";

/** Follow-up against a lead and/or a site visit. Assignee choice only for staff who may assign others' tasks. */
export function FollowUpForm({ lang, t, returnTo, leadId, siteVisitId, assignees }: {
  lang: string; t: StaffDictionary; returnTo: string; leadId?: string; siteVisitId?: string; assignees?: Assignee[];
}) {
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";
  return (
    <form action={createFollowUp} data-testid="follow-up-form" className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {leadId && <input type="hidden" name="leadId" value={leadId} />}
      {siteVisitId && <input type="hidden" name="siteVisitId" value={siteVisitId} />}
      <label className="block text-sm sm:col-span-2">{t.title}<input name="title" required maxLength={200} className={field} /></label>
      <label className="block text-sm">{t.due}
        <input name="dueAt" type="datetime-local" required defaultValue={istInput(new Date(Date.now() + 24 * 3600_000))} className={field} />
      </label>
      <label className="block text-sm">{t.priority}
        <select name="priority" defaultValue="normal" className={field}>
          {(["low", "normal", "high"] as const).map((p) => <option key={p} value={p}>{t.priorities[p]}</option>)}
        </select>
      </label>
      {assignees && assignees.length > 0 && (
        <label className="block text-sm sm:col-span-2">{t.assignee}
          <select name="assignedTo" defaultValue="" className={field}>
            <option value="">{t.mine}</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}
      <label className="block text-sm sm:col-span-2">{t.description}<textarea name="description" maxLength={2000} rows={2} className={field} /></label>
      <button className="min-h-12 rounded-lg bg-navy px-5 font-semibold text-ivory sm:col-span-2">{t.addFollowUp}</button>
    </form>
  );
}
