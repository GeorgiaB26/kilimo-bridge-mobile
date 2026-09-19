#!/usr/bin/env python3
"""Generate Expo / iOS / Android app icons from assets/kilimo-logo.png."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ICON_DIR = ASSETS / "app-icon"
LOGO_PATH = ASSETS / "kilimo-logo.png"

WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def load_logo() -> Image.Image:
    return Image.open(LOGO_PATH).convert("RGBA")


def fit_on_canvas(
    logo: Image.Image,
    size: int,
    *,
    scale: float,
    background: tuple[int, int, int, int],
) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), background)
    mark = int(round(size * scale))
    resized = logo.resize((mark, mark), Image.Resampling.LANCZOS)
    offset = ((size - mark) // 2, (size - mark) // 2)
    canvas.alpha_composite(resized, offset)
    return canvas


def to_monochrome(logo: Image.Image) -> Image.Image:
    """Green KB shapes as opaque black; white cutouts and outside stay transparent."""
    src = logo.convert("RGBA")
    pixels = src.load()
    w, h = src.size
    out = Image.new("RGBA", (w, h), TRANSPARENT)
    dest = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 16:
                continue
            if g > r + 8 and g > b and r < 160:
                dest[x, y] = (0, 0, 0, 255)
    return out


def write_png(image: Image.Image, path: Path, *, flatten_white: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if flatten_white:
        bg = Image.new("RGBA", image.size, WHITE)
        bg.alpha_composite(image)
        bg.convert("RGB").save(path, "PNG")
    else:
        image.save(path, "PNG")
    print(f"  wrote {path.relative_to(ROOT)}")


def main() -> None:
    logo = load_logo()
    print("Generating Expo app icons from kilimo-logo.png…")

    full_1024 = fit_on_canvas(logo, 1024, scale=0.92, background=WHITE)
    write_png(full_1024, ASSETS / "icon.png", flatten_white=True)
    write_png(full_1024, ASSETS / "splash-icon.png", flatten_white=True)
    write_png(fit_on_canvas(logo, 512, scale=0.92, background=WHITE), ICON_DIR / "play-store-512.png", flatten_white=True)
    write_png(fit_on_canvas(logo, 256, scale=0.92, background=WHITE), ICON_DIR / "web-favicon-256.png", flatten_white=True)
    write_png(fit_on_canvas(logo, 180, scale=0.92, background=WHITE), ICON_DIR / "apple-touch-180.png", flatten_white=True)
    write_png(fit_on_canvas(logo, 128, scale=0.92, background=WHITE), ICON_DIR / "launcher-128.png", flatten_white=True)
    write_png(fit_on_canvas(logo, 48, scale=0.92, background=WHITE), ASSETS / "favicon.png", flatten_white=True)

    # Adaptive foreground: mark in the inner ~66% safe zone, transparent corners.
    fg_1024 = fit_on_canvas(logo, 1024, scale=0.66, background=TRANSPARENT)
    write_png(fg_1024, ASSETS / "android-icon-foreground.png")

    mono_src = to_monochrome(logo)
    mono_1024 = fit_on_canvas(mono_src, 1024, scale=0.66, background=TRANSPARENT)
    write_png(mono_1024, ASSETS / "android-icon-monochrome.png")

    bg_1024 = Image.new("RGB", (1024, 1024), (255, 255, 255))
    write_png(bg_1024.convert("RGBA"), ASSETS / "android-icon-background.png", flatten_white=True)

    ios_sizes = [
        ("Icon-App-1024x1024@1x.png", 1024),
        ("Icon-App-180x180@3x.png", 180),
        ("Icon-App-167x167@2x.png", 167),
        ("Icon-App-152x152@2x.png", 152),
        ("Icon-App-120x120@2x.png", 120),
        ("Icon-App-87x87@3x.png", 87),
        ("Icon-App-80x80@2x.png", 80),
        ("Icon-App-58x58@2x.png", 58),
    ]
    ios_dir = ICON_DIR / "AppIcon.appiconset"
    print("Generating iOS AppIcon set…")
    for name, size in ios_sizes:
        write_png(
            fit_on_canvas(logo, size, scale=0.92, background=WHITE),
            ios_dir / name,
            flatten_white=True,
        )

    ios_contents = {
        "images": [
            {"size": "20x20", "idiom": "iphone", "scale": "2x", "filename": "Icon-App-80x80@2x.png"},
            {"size": "20x20", "idiom": "iphone", "scale": "3x", "filename": "Icon-App-87x87@3x.png"},
            {"size": "29x29", "idiom": "iphone", "scale": "2x", "filename": "Icon-App-58x58@2x.png"},
            {"size": "29x29", "idiom": "iphone", "scale": "3x", "filename": "Icon-App-87x87@3x.png"},
            {"size": "40x40", "idiom": "iphone", "scale": "2x", "filename": "Icon-App-80x80@2x.png"},
            {"size": "40x40", "idiom": "iphone", "scale": "3x", "filename": "Icon-App-120x120@2x.png"},
            {"size": "60x60", "idiom": "iphone", "scale": "2x", "filename": "Icon-App-120x120@2x.png"},
            {"size": "60x60", "idiom": "iphone", "scale": "3x", "filename": "Icon-App-180x180@3x.png"},
            {"size": "20x20", "idiom": "ipad", "scale": "2x", "filename": "Icon-App-80x80@2x.png"},
            {"size": "29x29", "idiom": "ipad", "scale": "2x", "filename": "Icon-App-58x58@2x.png"},
            {"size": "40x40", "idiom": "ipad", "scale": "2x", "filename": "Icon-App-80x80@2x.png"},
            {"size": "76x76", "idiom": "ipad", "scale": "2x", "filename": "Icon-App-152x152@2x.png"},
            {"size": "83.5x83.5", "idiom": "ipad", "scale": "2x", "filename": "Icon-App-167x167@2x.png"},
            {"size": "1024x1024", "idiom": "ios-marketing", "scale": "1x", "filename": "Icon-App-1024x1024@1x.png"},
        ],
        "info": {"version": 1, "author": "xcode"},
    }
    (ios_dir / "Contents.json").write_text(json.dumps(ios_contents, indent=2) + "\n")

    android_sizes = [
        ("drawable-mdpi", 48),
        ("drawable-hdpi", 72),
        ("drawable-xhdpi", 96),
        ("drawable-xxhdpi", 144),
        ("drawable-xxxhdpi", 192),
    ]
    print("Generating Android drawable sets…")
    for folder, size in android_sizes:
        write_png(
            fit_on_canvas(logo, size, scale=0.92, background=WHITE),
            ICON_DIR / "android" / folder / "ic_launcher.png",
            flatten_white=True,
        )

    print("Done.")


if __name__ == "__main__":
    main()
