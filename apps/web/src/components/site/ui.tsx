import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Shared look for the public site: square-cornered gold primary, outlined secondary, tracked small caps labels. */
export const btn = {
  gold: "inline-flex min-h-12 items-center justify-center gap-2 bg-gold px-6 text-[0.8rem] font-semibold uppercase tracking-[0.16em] text-navy transition-colors hover:bg-gold-600 focus-visible:outline-offset-4 [:lang(hi)_&]:text-sm [:lang(hi)_&]:tracking-normal",
  navy: "inline-flex min-h-12 items-center justify-center gap-2 bg-navy px-6 text-[0.8rem] font-semibold uppercase tracking-[0.16em] text-ivory transition-colors hover:bg-navy-700 [:lang(hi)_&]:text-sm [:lang(hi)_&]:tracking-normal",
  outlineLight: "inline-flex min-h-12 items-center justify-center gap-2 border border-ivory/60 px-6 text-[0.8rem] font-semibold uppercase tracking-[0.16em] text-ivory transition-colors hover:border-gold hover:text-gold [:lang(hi)_&]:text-sm [:lang(hi)_&]:tracking-normal",
  outline: "inline-flex min-h-12 items-center justify-center gap-2 border border-navy/30 px-6 text-[0.8rem] font-semibold uppercase tracking-[0.16em] text-navy transition-colors hover:border-navy hover:bg-navy hover:text-ivory [:lang(hi)_&]:text-sm [:lang(hi)_&]:tracking-normal",
  text: "inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-navy underline-offset-4 hover:underline",
};

export const field =
  "mt-1.5 block min-h-12 w-full border border-navy/15 bg-white px-3.5 py-2.5 text-base text-navy placeholder:text-muted/70 transition-colors focus:border-gold-600 focus:outline-none focus:ring-2 focus:ring-gold/50";
export const label = "block text-sm font-medium text-navy";

export const container = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={`eyebrow flex items-center gap-3 ${light ? "text-gold" : "text-gold-700"}`}>
      <span aria-hidden className="h-px w-8 bg-current" />
      {children}
    </p>
  );
}

export function SectionHeading({ eyebrow, title, sub, light = false, id, center = false }: {
  eyebrow: string; title: string; sub?: string; light?: boolean; id?: string; center?: boolean;
}) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center [&_.eyebrow]:justify-center" : "max-w-2xl"}>
      <Eyebrow light={light}>{eyebrow}</Eyebrow>
      <h2 id={id} className={`font-display mt-4 text-3xl font-semibold leading-[1.1] sm:text-4xl lg:text-[2.75rem] ${light ? "text-ivory" : "text-navy"}`}>
        {title}
      </h2>
      {sub && <p className={`mt-4 text-base leading-relaxed ${light ? "text-ivory/75" : "text-muted"}`}>{sub}</p>}
    </div>
  );
}

export function Arrow({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

export function Icon({ name, className = "size-5" }: { name: "pin" | "bed" | "bath" | "area" | "phone" | "whatsapp" | "mail" | "check" | "home" | "building" | "plot" | "office" | "chevron" | "filter" | "close" | "menu" | "user" | "globe"; className?: string }) {
  const p: Record<string, ReactNode> = {
    pin: <path d="M10 18s6-5.2 6-10A6 6 0 1 0 4 8c0 4.8 6 10 6 10Zm0-7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
    bed: <path d="M2 15V5m0 6h16v4M2 11V8.5A1.5 1.5 0 0 1 3.5 7H8v4m10 0V9.5A2.5 2.5 0 0 0 15.5 7H8" />,
    bath: <path d="M3 10h14v2.5A3.5 3.5 0 0 1 13.5 16h-7A3.5 3.5 0 0 1 3 12.5V10Zm2 0V4.5A1.5 1.5 0 0 1 6.5 3 1.5 1.5 0 0 1 8 4.5M6 16l-1 2m10-2 1 2" />,
    area: <path d="M3 3h5M3 3v5m14 9h-5m5 0v-5M3 3l5 5m9 9-5-5M17 3h-5m5 0v5M3 17h5m-5 0v-5" />,
    phone: <path d="M6.5 2.5 8.6 7l-1.8 1.4a9.5 9.5 0 0 0 4.8 4.8L13 11.4l4.5 2.1-.7 3a1.7 1.7 0 0 1-1.8 1.3C8.3 17.2 2.8 11.7 2.2 5a1.7 1.7 0 0 1 1.3-1.8l3-.7Z" />,
    whatsapp: <path d="M3.5 16.5 4.6 13A7.5 7.5 0 1 1 7.2 15.6l-3.7.9Zm4-9.3c.2 2.3 2.4 4.6 4.8 4.9l1.2-1.2-1.6-.9-.7.7c-1-.4-1.8-1.2-2.2-2.2l.7-.7-.9-1.6-1.3 1Z" />,
    mail: <path d="M2.5 4.5h15v11h-15v-11Zm0 0L10 11l7.5-6.5" />,
    check: <path d="m4 10.5 4 4 8-9" />,
    home: <path d="M3 9.5 10 3.5l7 6V17H12.5v-4.5h-5V17H3V9.5Z" />,
    building: <path d="M4 17V3.5h8V17m0-9h4V17M2.5 17h15M7 6.5h2m-2 3h2m-2 3h2" />,
    plot: <path d="M2.5 15.5 6 4.5h8l3.5 11h-15Zm5-11-1 11m6.5-11 1 11M4 10h12" />,
    office: <path d="M3 17V6h14v11M7 6V3h6v3M3 17h14M6.5 9.5h1.5m4 0h1.5m-7 3h1.5m4 0h1.5" />,
    chevron: <path d="m5.5 8 4.5 4.5L14.5 8" />,
    filter: <path d="M3 5h14M6 10h8m-5 5h2" />,
    close: <path d="m5 5 10 10M15 5 5 15" />,
    menu: <path d="M3 6h14M3 10h14M3 14h14" />,
    user: <path d="M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6.5 7.5a6.5 6.5 0 0 1 13 0" />,
    globe: <path d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm0 0c2-2 3-4.5 3-7.5S12 4.5 10 2.5M10 17.5c-2-2-3-4.5-3-7.5s1-5.5 3-7.5M2.5 10h15" />,
  };
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {p[name]}
    </svg>
  );
}

export function CtaLink({ href, variant = "gold", children, ...rest }: { href: string; variant?: keyof typeof btn; children: ReactNode } & Omit<ComponentProps<typeof Link>, "href" | "className">) {
  return <Link href={href} className={btn[variant]} {...rest}>{children}</Link>;
}

/** Caption for licensed stock photography: makes clear the image is not a UNAVORA listing or project. */
export function RepresentativeTag({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span className={`pointer-events-none absolute bg-navy/55 px-2 py-0.5 text-[0.62rem] font-medium uppercase tracking-[0.16em] text-ivory/90 backdrop-blur-sm [:lang(hi)_&]:tracking-normal ${className}`}>
      {label}
    </span>
  );
}
