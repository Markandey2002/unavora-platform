"""Website brand files for UNAVORA ANANT REAL ESTATE, derived from the approved logo WITHOUT altering the artwork.

Source (approved by the owner 2026-11-13, final): assets/brand/source/unavora-anant-real-estate-primary.png
(raster PNG 1200x411, RGB, cream background #FEFAF7; a vector master has been requested from the designer).

Only these operations are applied: crop to the measured artwork bounds (plus margin), colour-to-alpha of the cream
background (on a light surface the result matches the original), padding onto a square canvas, and proportional
scaling. No redrawing, recolouring, re-typesetting or filters.

    python -I assets/brand/make_brand_assets.py

Measured on the source (pixels differing from the background by > 40 in any channel):
  artwork bounds x 134-1066, y 81-334 (tagline band y 313-334)
  UA monogram x 154-547, y 81-296. The thin gold divider (x 538-542) overlaps the right foot of the "A" (to x 547),
  so the monogram export keeps the divider rather than cut the letter.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets/brand/source/unavora-anant-real-estate-primary.png"
PUBLIC = ROOT / "apps/web/public/brand"
APP = ROOT / "apps/web/src/app"
BG = (254, 250, 247)   # measured background (all four corners)
FULL = (134, 81, 1066, 334)
MARK = (154, 81, 547, 296)


def color_to_alpha(img: Image.Image, bg=BG) -> Image.Image:
    rgb = img.convert("RGB")
    out = Image.new("RGBA", rgb.size)
    src, dst = rgb.load(), out.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            c = src[x, y]
            a = 0.0
            for i in range(3):
                if c[i] < bg[i]:
                    a = max(a, (bg[i] - c[i]) / bg[i])
            if a < 0.04:
                dst[x, y] = (0, 0, 0, 0)
                continue
            a = min(a, 1.0)
            ch = tuple(max(0, min(255, round((c[i] - bg[i] * (1 - a)) / a))) for i in range(3))
            dst[x, y] = (*ch, round(a * 255))
    return out


def crop(img: Image.Image, box, margin: int) -> Image.Image:
    x0, y0, x1, y1 = box
    return img.crop((max(0, x0 - margin), max(0, y0 - margin), min(img.width, x1 + 1 + margin), min(img.height, y1 + 1 + margin)))


def square(img: Image.Image, pad_ratio: float, fill=None) -> Image.Image:
    side = round(max(img.size) * (1 + 2 * pad_ratio))
    canvas = Image.new("RGBA", (side, side), (*fill, 255) if fill else (0, 0, 0, 0))
    canvas.alpha_composite(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def main() -> None:
    src = Image.open(SRC)
    assert src.size == (1200, 411), "unexpected source size: re-measure the bounds before exporting"
    PUBLIC.mkdir(parents=True, exist_ok=True)

    # 1. primary horizontal logo, transparent (header, footer plate, account pages, CRM)
    full_rgb = crop(src, FULL, 12)
    full = color_to_alpha(full_rgb)
    full.save(PUBLIC / "unavora-anant-real-estate-logo.png", optimize=True)
    full.save(PUBLIC / "unavora-anant-real-estate-logo.webp", quality=92, method=6)
    # 2. same artwork on its original cream background (emails, documents, places without transparency)
    full_rgb.convert("RGB").save(PUBLIC / "unavora-anant-real-estate-logo-on-cream.png", optimize=True)

    # 3. compact monogram (phones narrower than 360 px, icons)
    mark = color_to_alpha(crop(src, MARK, 6))
    mark.save(PUBLIC / "unavora-anant-real-estate-mark.png", optimize=True)

    # 4. icons from the monogram, on the logo's own cream background (readable in light and dark browser themes)
    icon = square(mark, 0.10, BG)
    icon.resize((512, 512), Image.LANCZOS).save(APP / "icon.png", optimize=True)
    icon.resize((512, 512), Image.LANCZOS).save(PUBLIC / "icon-512.png", optimize=True)
    icon.resize((192, 192), Image.LANCZOS).save(PUBLIC / "icon-192.png", optimize=True)
    icon.resize((180, 180), Image.LANCZOS).convert("RGB").save(APP / "apple-icon.png", optimize=True)
    ico = square(mark, 0.04, BG)
    ico.save(APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # 5. social sharing image 1200x630: the full logo centred on its original cream background
    og = Image.new("RGB", (1200, 630), BG)
    scale = min(1040 / full_rgb.width, 400 / full_rgb.height)
    logo = full_rgb.resize((round(full_rgb.width * scale), round(full_rgb.height * scale)), Image.LANCZOS)
    og.paste(logo, ((1200 - logo.width) // 2, (630 - logo.height) // 2))
    og.save(APP / "opengraph-image.png", optimize=True)
    og.save(APP / "twitter-image.png", optimize=True)

    for f in sorted(list(PUBLIC.glob("unavora-anant-*")) + list(PUBLIC.glob("icon-*")) + [APP / n for n in ("icon.png", "apple-icon.png", "favicon.ico", "opengraph-image.png", "twitter-image.png")]):
        with Image.open(f) as im:
            print(f.relative_to(ROOT), im.size)


if __name__ == "__main__":
    main()
