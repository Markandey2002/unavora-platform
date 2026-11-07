import type { StaffDictionary } from "@/i18n/staff";

/** Call (tel:) and WhatsApp (wa.me) buttons. Opening WhatsApp is not a delivered message; staff log outcomes separately. */
export function ContactActions({ phone, whatsapp, t }: { phone: string | null; whatsapp: string | null; t: StaffDictionary }) {
  const callNumber = phone ?? whatsapp;
  const waNumber = whatsapp ?? phone;
  if (!callNumber && !waNumber) return <p className="text-sm text-slate">{t.noNumber}</p>;
  const btn = "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 font-semibold";
  return (
    <div className="flex flex-wrap gap-3">
      {callNumber && (
        <a data-testid="call-action" href={`tel:${callNumber}`} className={`${btn} bg-navy text-ivory`}>
          <span aria-hidden>📞</span>{t.call} <span className="font-normal">{callNumber}</span>
        </a>
      )}
      {waNumber && (
        <a data-testid="whatsapp-action" href={`https://wa.me/${waNumber.replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer"
          className={`${btn} border border-green-700 text-green-800`}>
          <span aria-hidden>💬</span>{t.whatsapp}
        </a>
      )}
    </div>
  );
}
