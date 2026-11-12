import Image from "next/image";
import { brand } from "@/lib/assets";

/**
 * Official UNAVORA ANANT INFRA logo (green-and-gold UAI). Horizontal lockup in header/footer; the UAI monogram on
 * very narrow phones. The cut-outs come from a JPEG sheet, so they are always shown on a light surface: `plate`
 * puts the lockup on a warm-white panel for dark sections (footer).
 */
export function Logo({ lang, plate = false, compactOnTiny = false, size = "md" }: {
  lang: string; plate?: boolean; compactOnTiny?: boolean; size?: "md" | "lg";
}) {
  const logo = brand.logoOnLight;
  const mark = brand.mark;
  if (!logo) return <span className="font-display text-xl font-semibold tracking-[0.18em]">UNAVORA</span>;
  const alt = lang === "hi" ? logo.alt.hi : logo.alt.en;
  const h = size === "lg" ? "h-14 sm:h-16" : "h-11 sm:h-12 xl:h-14";
  const img = (
    <Image src={logo.src} width={logo.width} height={logo.height} alt={alt} preload={!plate} loading={plate ? "lazy" : "eager"} sizes="300px"
      className={`${h} w-auto ${compactOnTiny && mark ? "hidden min-[360px]:block" : ""}`} />
  );
  return (
    <span className={plate ? "inline-flex bg-ivory px-4 py-3" : "inline-flex items-center"}>
      {img}
      {compactOnTiny && mark && (
        <Image src={mark.src} width={mark.width} height={mark.height} alt={alt} sizes="128px" className="h-11 w-auto min-[360px]:hidden" />
      )}
    </span>
  );
}
