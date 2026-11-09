"use client";

import { useActionState } from "react";
import { whatsappAction, type OtpState } from "@/app/[lang]/(site)/account/actions";
import type { Dictionary } from "@/i18n/dictionaries";

export function WhatsAppVerify({ lang, t }: { lang: string; t: Dictionary }) {
  const [state, action, pending] = useActionState<OtpState, FormData>(whatsappAction, { step: "phone" });
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate/40 bg-white px-3 py-2";

  if (state.step === "done") {
    return <p role="status" className="rounded-lg bg-gold/30 p-3 font-medium">{t.whatsappVerified}: {state.phone}</p>;
  }
  const error =
    state.error === "otp_invalid" ? t.otpInvalid
    : state.error === "otp_expired" || state.error === "otp_not_requested" ? t.otpExpired
    : state.error === "otp_locked" ? t.otpLocked
    : state.error === "otp_resend_too_soon" || state.error === "otp_rate_limited" ? t.otpTooSoon
    : state.error === "invalid_phone" ? t.errorPhone
    : state.error === "whatsapp_unavailable" ? t.otpUnavailable
    : state.error ? t.errorGeneric : null;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="lang" value={lang} />
      <label className="block text-sm">{t.whatsappNumber}
        <input name="phone" required inputMode="tel" autoComplete="tel" maxLength={20} defaultValue={state.phone}
          readOnly={state.step === "code"} className={field} />
      </label>
      {state.step === "code" && (
        <>
          {state.message === "sent" && <p role="status" className="text-sm">{t.codeSent}</p>}
          <label className="block text-sm">{t.codeLabel}
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} className={field} />
          </label>
        </>
      )}
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {state.step === "code" && (
          <button name="intent" value="verify" disabled={pending}
            className="min-h-12 rounded-lg bg-navy px-6 font-semibold text-ivory disabled:opacity-60">{t.verify}</button>
        )}
        <button name="intent" value="send" disabled={pending} formNoValidate={state.step === "code"}
          className={state.step === "code"
            ? "min-h-12 rounded-lg border border-navy px-6 font-semibold disabled:opacity-60"
            : "min-h-12 rounded-lg bg-navy px-6 font-semibold text-ivory disabled:opacity-60"}>
          {state.step === "code" ? t.resendCode : t.sendCode}
        </button>
      </div>
    </form>
  );
}
