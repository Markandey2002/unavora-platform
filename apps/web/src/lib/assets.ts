// Approved brand files and photographs. Each slot is null until an APPROVED file exists in apps/web/public;
// components fall back to the typographic lockup / labelled illustrations while a slot is null.
// Never point a slot at a remote URL or at a stock photo presented as a real UNAVORA property.
//
// Logo files: regenerate with `python -I assets/brand/make_logo_assets.py` (from the official sheet). When a vector
// master is supplied, replace the PNGs with SVGs and update width/height here.
export type ImageSlot = { src: string; width: number; height: number; alt: { en: string; hi: string } } | null;

const logoAlt = { en: "UNAVORA ANANT INFRA Real Estate Private Limited - Building Trust. Creating Value.", hi: "यूनावोरा अनंत इन्फ्रा रियल एस्टेट प्राइवेट लिमिटेड - भरोसा बनाना। मूल्य रचना।" };

/**
 * Official logo (final, supplied 2026-11-08): files cut from the logo sheet by assets/brand/make_logo_assets.py
 * without altering the artwork. The source is a JPEG, so the cut-outs are used on LIGHT surfaces only; on navy the
 * footer places the lockup on a warm-white plate. logoOnDark stays null until a vector/reversed master exists.
 */
export const brand: { logoOnLight: ImageSlot; logoOnDark: ImageSlot; mark: ImageSlot } = {
  logoOnLight: { src: "/brand/unavora-logo-horizontal.png", width: 473, height: 119, alt: logoAlt },
  logoOnDark: null,
  mark: { src: "/brand/unavora-mark.png", width: 382, height: 372, alt: { en: "UNAVORA ANANT INFRA", hi: "यूनावोरा अनंत इन्फ्रा" } },
};

/**
 * Site photography. `kind` keeps company photos and licensed stock apart: stock images are captioned
 * "Representative image" wherever they appear and are never used on a listing or project page.
 */
export type PhotoSlot = (NonNullable<ImageSlot> & { kind: "company" | "licensed-stock"; credit?: string }) | null;

export const photos: { hero: PhotoSlot; about: PhotoSlot; partner: PhotoSlot } = {
  hero: null,
  about: null,
  partner: null,
};
