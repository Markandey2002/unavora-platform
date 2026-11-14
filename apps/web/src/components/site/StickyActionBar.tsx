"use client";

import { useEffect, useState } from "react";

/**
 * Phone-only bottom action bar (price / Call / Enquire) for a property detail page.
 * It gets out of the way whenever it could cover something the visitor needs:
 *  - the enquiry form (`watch` selector) or the site footer is on screen;
 *  - any input, select or textarea has focus (typing, pickers);
 *  - the on-screen keyboard is open (visual viewport noticeably shorter than the layout viewport).
 * Hidden = slid out of view and `inert` (not focusable, not announced). Respects the iOS/Android safe area.
 */
export function StickyActionBar({ children, watch = "#enquire" }: { children: React.ReactNode; watch?: string }) {
  const [blockedBy, setBlockedBy] = useState({ form: false, footer: false, focus: false, keyboard: false });
  const hidden = blockedBy.form || blockedBy.footer || blockedBy.focus || blockedBy.keyboard;

  useEffect(() => {
    const set = (k: keyof typeof blockedBy, v: boolean) => setBlockedBy((b) => (b[k] === v ? b : { ...b, [k]: v }));
    const observers: IntersectionObserver[] = [];
    const observe = (sel: string, k: "form" | "footer") => {
      const el = document.querySelector(sel);
      if (!el) return;
      const io = new IntersectionObserver(([e]) => set(k, e.isIntersecting), { threshold: 0 });
      io.observe(el);
      observers.push(io);
    };
    observe(watch, "form");
    observe("footer", "footer");

    const isField = (el: Element | null) => !!el && (el.matches("input, select, textarea, [contenteditable='true']"));
    const onFocusIn = (e: FocusEvent) => set("focus", isField(e.target as Element));
    const onFocusOut = () => setTimeout(() => set("focus", isField(document.activeElement)), 0);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    const vv = window.visualViewport;
    const onResize = () => set("keyboard", !!vv && window.innerHeight - vv.height > 150);
    vv?.addEventListener("resize", onResize);
    onResize();
    return () => {
      observers.forEach((o) => o.disconnect());
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", onResize);
    };
  }, [watch]);

  return (
    <div data-testid="sticky-action-bar" data-hidden={hidden ? "true" : "false"} aria-hidden={hidden || undefined} inert={hidden}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-navy/10 bg-ivory/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-200 motion-reduce:transition-none lg:hidden ${hidden ? "pointer-events-none translate-y-full" : "translate-y-0"}`}>
      {children}
    </div>
  );
}
