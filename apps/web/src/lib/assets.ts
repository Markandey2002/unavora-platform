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

const stock = (file: string, width: number, height: number, en: string, hi: string, credit: string): PhotoSlot => ({
  src: `/images/representative/${file}`, width, height, alt: { en, hi }, kind: "licensed-stock", credit,
});

/**
 * Licensed REPRESENTATIVE images (Unsplash License, free; downloaded 2026-11-09 with owner approval; source and credit
 * in CONTENT_AND_ASSET_REGISTER.md). Captioned "Representative image"; never used for a listing or a project.
 * Replace with company photography (kind "company") as it becomes available.
 */
export const photos: {
  hero: PhotoSlot; about: PhotoSlot; partner: PhotoSlot;
  residential: PhotoSlot; commercial: PhotoSlot; land: PhotoSlot; office: PhotoSlot;
} = {
  hero: stock("hero.jpg", 2400, 1347, "Modern residential tower with cantilevered balconies at dusk", "शाम के समय कैंटिलीवर बालकनी वाला आधुनिक आवासीय टावर", "Tabreez / Unsplash"),
  about: stock("about.jpg", 1600, 1067, "Curved corner of a residential building in warm light", "गर्म रोशनी में आवासीय इमारत का घुमावदार कोना", "Timur Seyfelmlyukov / Unsplash"),
  partner: stock("partner.jpg", 1600, 1066, "Two professionals shaking hands across a desk", "मेज़ पर हाथ मिलाते दो पेशेवर", "Mina Rad / Unsplash"),
  residential: stock("residential.jpg", 1600, 988, "Apartment building with lit windows against an evening sky", "शाम के आसमान के सामने रोशन खिड़कियों वाली अपार्टमेंट इमारत", "Alexandre Lallemand / Unsplash"),
  commercial: stock("commercial.jpg", 1600, 1049, "Glass office facade reflecting the dusk sky", "शाम का आसमान दर्शाता कांच का ऑफिस मुखौटा", "Joakim Honkasalo / Unsplash"),
  land: stock("plots.jpg", 1600, 1200, "Aerial view of a new plotted development with laid-out roads", "बनी हुई सड़कों के साथ नए प्लॉट विकास का हवाई दृश्य", "Iain / Unsplash"),
  office: stock("offices.jpg", 1600, 1067, "Bright open-plan office workspace", "रोशन ओपन-प्लान ऑफिस", "Adolfo Félix / Unsplash"),
};
