#!/usr/bin/env python3
"""Build step for daleskc.com.

Reads tools/work.json, writes responsive WebP renditions of every photo in
images/source/ to images/work/, then renders the portfolio
markup straight into index.html between marker comments. The site stays plain
static HTML (no JS needed to see the work, good for SEO), and adding a photo is
one line in work.json plus:

    python3 tools/build.py

Requires Pillow (pip install pillow).
"""
from __future__ import annotations

import glob
import html
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "images" / "source"
OUT = ROOT / "images" / "work"
INDEX = ROOT / "index.html"
WIDTHS = (480, 960)


def source_for(n: int) -> Path:
    matches = glob.glob(str(SRC / f"daleskc.com - {n:05d}.*"))
    if not matches:
        raise SystemExit(f"No source photo for #{n}")
    return Path(matches[0])


def load(path: Path) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(path)).convert("RGB")


def placeholder_color(im: Image.Image) -> str:
    r, g, b = im.resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return f"#{r:02x}{g:02x}{b:02x}"


def render(im: Image.Image, stem: str) -> dict:
    """Write WebP renditions; never upscale past the source width."""
    OUT.mkdir(parents=True, exist_ok=True)
    srcset = []
    for w in WIDTHS:
        w = min(w, im.width)
        target = OUT / f"{stem}-{w}.webp"
        if not target.exists():
            h = round(im.height * w / im.width)
            im.resize((w, h), Image.Resampling.LANCZOS).save(target, "WEBP", quality=80, method=6)
        srcset.append((w, f"images/work/{target.name}"))
    srcset = sorted(set(srcset))
    return {"w": im.width, "h": im.height, "srcset": srcset, "ph": placeholder_color(im)}


def srcset_attr(r: dict) -> str:
    return ", ".join(f"{url} {w}w" for w, url in r["srcset"])


def figure(item: dict, r: dict, cats: dict) -> str:
    alt = html.escape(item["alt"], quote=True)
    small, large = r["srcset"][0][1], r["srcset"][-1][1]
    return (
        f'<li class="tile" data-cat="{item["cat"]}" style="--ph:{r["ph"]};--ar:{r["w"]}/{r["h"]}">'
        f'<a href="{large}" data-lightbox data-caption="{alt}" data-label="{cats[item["cat"]]}">'
        f'<img src="{small}" srcset="{srcset_attr(r)}" sizes="(min-width: 1200px) 300px, (min-width: 700px) 33vw, 50vw" '
        f'width="{r["w"]}" height="{r["h"]}" alt="{alt}" loading="lazy" decoding="async">'
        f"</a></li>"
    )


def splice(doc: str, name: str, body: str) -> str:
    pattern = re.compile(rf"(<!-- {name}:start -->)(.*?)(\s*<!-- {name}:end -->)", re.S)
    if not pattern.search(doc):
        raise SystemExit(f"Marker '{name}' not found in index.html")
    return pattern.sub(lambda m: f"{m.group(1)}\n{body}{m.group(3)}", doc)


def spray_mask() -> None:
    """The mask that makes headings and photos look sprayed on.

    Three equal bands, left to right: solid, a speckled spray edge, empty.
    CSS slides it across an element (mask-size: 300%) to reveal it.
    """
    import random

    random.seed(1975)
    W, H = 1800, 360
    a = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(a)
    d.rectangle((0, 0, W // 3, H), fill=255)
    # Droplets thin out across the middle band; bigger ones lead the edge.
    for _ in range(26000):
        f = random.random() ** 1.6
        x = W // 3 + f * (W // 3) + random.gauss(0, 14)
        y = random.random() * H
        r = 0.8 + random.random() * (2.2 + 4.0 * f)
        d.ellipse((x - r, y - r, x + r, y + r), fill=255)
    a = a.filter(ImageFilter.GaussianBlur(0.7))
    out = Image.merge("RGBA", (Image.new("L", (W, H), 255),) * 3 + (a,))
    (ROOT / "images" / "brand").mkdir(parents=True, exist_ok=True)
    out.save(ROOT / "images" / "brand" / "spray-mask.png", optimize=True)


def og_image(shop: Image.Image, hero: Image.Image) -> None:
    """1200x630 social card: hero bike, lacquer gradient, wordmark."""
    W, H = 1200, 630
    card = Image.new("RGB", (W, H), "#0b0a0c")
    bike = ImageOps.fit(hero, (760, H), Image.Resampling.LANCZOS, centering=(0.55, 0.6))
    card.paste(bike, (W - 760, 0))
    fade = Image.linear_gradient("L").rotate(90).resize((760, H))
    shade = Image.new("RGB", (760, H), "#0b0a0c")
    card.paste(shade, (W - 760, 0), ImageOps.invert(fade).point(lambda v: int(v * 0.95)))
    d = ImageDraw.Draw(card)

    def font(names, size):
        for n in names:
            for p in glob.glob(f"/usr/share/fonts/**/{n}", recursive=True):
                return ImageFont.truetype(p, size)
        return ImageFont.load_default()

    serif = font(["DejaVuSerif-BoldItalic.ttf", "LiberationSerif-BoldItalic.ttf"], 132)
    sans = font(["DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"], 30)
    d.text((70, 150), "DALE'S", font=serif, fill="#e3401f")
    d.text((76, 320), "A U T O   B O D Y", font=sans, fill="#f1e9dc")
    d.line((76, 380, 420, 380), fill="#e8bf57", width=3)
    d.text((76, 405), "Kansas City, KS  ·  Since 1975", font=sans, fill="#c9ced6")
    d.text((76, 455), "Collision · Custom Paint · Upholstery", font=sans, fill="#8e8a93")
    card.save(ROOT / "images" / "og.jpg", quality=86)


def main() -> None:
    data = json.loads((ROOT / "tools" / "work.json").read_text())
    cats, items = data["categories"], data["items"]

    tiles = []
    rendered = {}
    for item in items:
        im = load(source_for(item["n"]))
        r = render(im, f"{item['n']:02d}")
        rendered[item["n"]] = (im, r)
        tiles.append(figure(item, r, cats))

    shop = load(SRC / "shop-exterior.png")
    render(shop, "shop")
    og_image(shop, rendered[items[0]["n"]][0])

    counts = {c: sum(1 for it in items if it["cat"] == c) for c in cats}
    filters = [f'<button type="button" class="chip" aria-pressed="true" data-filter="all">All <span>{len(items)}</span></button>']
    filters += [
        f'<button type="button" class="chip" aria-pressed="false" data-filter="{c}">{label} <span>{counts[c]}</span></button>'
        for c, label in cats.items()
    ]

    doc = INDEX.read_text()
    indent = "                    "
    doc = splice(doc, "filters", "\n".join(indent + f for f in filters))
    doc = splice(doc, "gallery", "\n".join(indent + t for t in tiles))
    INDEX.write_text(doc)
    spray_mask()
    print(f"Built {len(items)} photos -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
