"""ARCHIVED 2026-11-13: superseded by assets/brand/make_brand_assets.py (UNAVORA ANANT REAL ESTATE logo).
Kept for history only; it refuses to run so the old UAI logo cannot reach the website again.

Derive website logo files from the official UNAVORA logo sheet WITHOUT altering the artwork.

Only three operations are applied: crop to each logo's measured bounding box (plus a small margin), removal of the
sheet's near-white background by colour-to-alpha (on a light background the result is pixel-identical to the
original), and proportional scaling for icon sizes. No redrawing, recolouring or re-typesetting.

    python -I assets/brand/make_logo_assets.py
Source: assets/brand/unavora-logo-sheet-original.jpg (official, final; supplied 2026-11-08).
"""
import sys
from pathlib import Path

sys.exit("ARCHIVED: the UAI logo is superseded; use assets/brand/make_brand_assets.py")

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets/brand/unavora-logo-sheet-original.jpg"
PUBLIC = ROOT / "apps/web/public/brand"
APP = ROOT / "apps/web/src/app"
BG = (254, 253, 249)          # measured sheet background (median of corners)
WARM_WHITE = (247, 245, 240)  # site palette #F7F5F0

# Bounding boxes measured on the 1280x853 sheet (pixels differing from BG by > 28 in any channel).
BOXES = {
    "stacked": (160, 37, 1120, 568),     # primary logo: mark + name + legal line + tagline
    "horizontal": (47, 633, 512, 744),   # horizontal lockup
    "mark": (438, 37, 808, 397),         # UAI monogram (large rendering on the sheet = sharpest source)
    "monochrome": (940, 595, 1234, 760), # monochrome version
}


def color_to_alpha(img: Image.Image, bg=BG) -> Image.Image:
    """GIMP-style colour-to-alpha against the sheet background; exact on light backgrounds.
    The source is a JPEG, so the cut-outs are for LIGHT surfaces only (header, warm-white plate in the footer)."""
    rgb = img.convert("RGB")
    out = Image.new("RGBA", rgb.size)
    src, dst = rgb.load(), out.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            c = src[x, y]
            a = 0.0
            for i in range(3):
                if c[i] < bg[i]:  # brighter-than-paper pixels are JPEG noise in the paper itself
                    a = max(a, (bg[i] - c[i]) / bg[i])
            if a < 0.05:  # JPEG noise in the paper colour
                dst[x, y] = (0, 0, 0, 0)
                continue
            a = min(a, 1.0)
            ch = tuple(max(0, min(255, round((c[i] - bg[i] * (1 - a)) / a))) for i in range(3))
            dst[x, y] = (*ch, round(a * 255))
    return out


def crop(sheet: Image.Image, key: str, margin: int) -> Image.Image:
    x0, y0, x1, y1 = BOXES[key]
    return sheet.crop((max(0, x0 - margin), max(0, y0 - margin), min(sheet.width, x1 + margin), min(sheet.height, y1 + margin)))


def square(img: Image.Image, pad_ratio: float, fill=None) -> Image.Image:
    side = round(max(img.size) * (1 + 2 * pad_ratio))
    canvas = Image.new("RGBA", (side, side), (*fill, 255) if fill else (0, 0, 0, 0))
    canvas.alpha_composite(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def main() -> None:
    sheet = Image.open(SRC).convert("RGB")
    assert sheet.size == (1280, 853), sheet.size
    PUBLIC.mkdir(parents=True, exist_ok=True)

    stacked = color_to_alpha(crop(sheet, "stacked", 8))
    horizontal = color_to_alpha(crop(sheet, "horizontal", 4))
    mark = color_to_alpha(crop(sheet, "mark", 6))
    mono = color_to_alpha(crop(sheet, "monochrome", 6))
    stacked.save(PUBLIC / "unavora-logo-stacked.png", optimize=True)
    horizontal.save(PUBLIC / "unavora-logo-horizontal.png", optimize=True)
    mark.save(PUBLIC / "unavora-mark.png", optimize=True)
    mono.save(PUBLIC / "unavora-logo-monochrome.png", optimize=True)

    # Favicon / app icons from the monogram (proportional scaling only).
    icon = square(mark, 0.06)
    icon.resize((512, 512), Image.LANCZOS).save(APP / "icon.png", optimize=True)
    square(mark, 0.12, WARM_WHITE).convert("RGB").resize((180, 180), Image.LANCZOS).save(APP / "apple-icon.png", optimize=True)
    square(mark, 0.04).save(APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # Social preview: the primary logo centred on the site's warm white, 1200x630.
    og = Image.new("RGBA", (1200, 630), (*WARM_WHITE, 255))
    scale = min(1000 / stacked.width, 470 / stacked.height)
    logo = stacked.resize((round(stacked.width * scale), round(stacked.height * scale)), Image.LANCZOS)
    og.alpha_composite(logo, ((1200 - logo.width) // 2, (630 - logo.height) // 2))
    og.convert("RGB").save(APP / "opengraph-image.png", optimize=True)

    for p in [*PUBLIC.glob("*.png"), APP / "icon.png", APP / "apple-icon.png", APP / "favicon.ico", APP / "opengraph-image.png"]:
        with Image.open(p) as im:
            print(f"{p.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
