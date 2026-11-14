import Image from "next/image";
import { brand } from "@/lib/assets";
import { BRAND, brandName } from "@/lib/brand";

/**
 * Official UNAVORA ANANT REAL ESTATE logo (lib/brand.ts).
 *  - Full horizontal logo: footer, About, account and staff screens, and the site header from 640 px.
 *  - `compactOnPhone` (site header below 640 px): the UA monogram plus a readable text lockup ("UNAVORA ANANT /
 *    REAL ESTATE"), because the full wide logo would be too small to read at phone header height. The original
 *    artwork is never cropped, stretched or recoloured; the lockup is live text in the logo's own green.
 * The artwork is a raster on cream, so it is always shown on a light surface: `plate` puts it on a light panel in
 * dark sections (footer, staff header).
 */
export function Logo({ lang, plate = false, compactOnPhone = false, size = "md" }: {
  lang: string; plate?: boolean; compactOnPhone?: boolean; size?: "sm" | "md" | "lg";
}) {
  const logo = brand.logoOnLight;
  const mark = brand.mark;
  if (!logo) return <span className="font-display text-xl font-semibold tracking-[0.12em]">{brandName(lang)}</span>;
  const alt = lang === "hi" ? logo.alt.hi : logo.alt.en;
  const h = size === "lg" ? "h-16 sm:h-20" : size === "sm" ? "h-9" : "h-12 sm:h-14";
  const compact = compactOnPhone && mark;
  return (
    <span className={plate ? "inline-flex bg-[#FEFAF7] px-4 py-3" : "inline-flex items-center"}>
      <Image src={logo.src} width={logo.width} height={logo.height} alt={alt} preload={!plate} loading={plate ? "lazy" : "eager"}
        sizes="(min-width: 640px) 200px, 170px" className={`${h} w-auto max-w-none shrink-0 ${compact ? "hidden sm:block" : ""}`} />
      {compact && (
        <span className="flex items-center gap-2.5 sm:hidden" data-testid="logo-compact">
          <Image src={mark.src} width={mark.width} height={mark.height} alt={alt} preload sizes="80px" className="h-10 w-auto max-w-none shrink-0" />
          <span aria-hidden className="flex flex-col leading-none text-[#023A06]">
            <span className="text-[0.95rem] font-semibold tracking-[0.08em]">{BRAND.lockup.line1}</span>
            <span className="mt-1 text-[0.68rem] font-semibold tracking-[0.24em]">{BRAND.lockup.line2}</span>
          </span>
        </span>
      )}
    </span>
  );
}
