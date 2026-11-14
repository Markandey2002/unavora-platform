/**
 * Single source of the PUBLIC brand identity (approved by the owner 2026-11-13, final).
 * Components, metadata, structured data and message templates read the brand from here; nothing else hard-codes it.
 *
 * Kept deliberately separate:
 *  - public brand name (this file) vs the REGISTERED LEGAL entity name, which comes only from CRM → Company facts
 *    (`company.legal_name`, shown publicly only when marked verified) and is never derived from the brand;
 *  - public e-mail / phone, which also come from verified Company facts (contactFrom in lib/site.ts).
 * Logo files are generated from assets/brand/source/unavora-anant-real-estate-primary.png by
 * assets/brand/make_brand_assets.py (crop, background removal, scaling only — the artwork is never altered).
 */
export const BRAND = {
  name: { en: "UNAVORA ANANT REAL ESTATE", hi: "यूनावोरा अनंत रियल एस्टेट" },
  /** Approved tagline, used verbatim in every language (no translation has been approved). */
  tagline: "INVEST IN A BETTER LIVING",
  domain: "uainfrarealestate.com",
  /** Proposed canonical production origin; the running site always uses SITE_URL (lib/seo.ts). */
  productionOrigin: "https://uainfrarealestate.com",
  /** Sender display name for customer e-mail and WhatsApp (templates are not implemented yet). */
  senderName: "UNAVORA ANANT REAL ESTATE",
  logo: {
    /** Full horizontal logo, transparent background (header, footer plate, account and staff screens). */
    primary: { src: "/brand/unavora-anant-real-estate-logo.png", width: 957, height: 278 },
    /** Same artwork on its original cream background (e-mails, documents, structured data). */
    onCream: { src: "/brand/unavora-anant-real-estate-logo-on-cream.png", width: 957, height: 278 },
    /** UA monogram (phone header with the text lockup, icons). Keeps the thin divider rather than cut the "A". */
    mark: { src: "/brand/unavora-anant-real-estate-mark.png", width: 406, height: 228 },
  },
  icons: { pwa192: "/brand/icon-192.png", pwa512: "/brand/icon-512.png" },
  /** Text lockup next to the monogram in the phone header (the brand name, split as in the logo). */
  lockup: { line1: "UNAVORA ANANT", line2: "REAL ESTATE" },
  /** cream = logo background; green = the logo's emerald, sampled from the artwork (lockup text only). */
  colours: { cream: "#FEFAF7", green: "#023A06" },
} as const;

export type BrandLang = "en" | "hi";
export const brandName = (lang: string): string => BRAND.name[lang === "hi" ? "hi" : "en"];
export const logoAlt = (lang: string): string => `${brandName(lang)} — ${BRAND.tagline}`;
