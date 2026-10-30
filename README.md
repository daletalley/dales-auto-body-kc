# Dale's Auto Body · daleskc.com

The website for Dale's Auto Body, a family-owned body, paint and upholstery shop at
1310 State Avenue, Kansas City, KS — in business since 1975.

Plain static HTML/CSS/JS, hosted on GitHub Pages (see `CNAME`). No framework, no bundler,
nothing to install to view it.

## What's in here

| Path | What it is |
| --- | --- |
| `index.html` | The whole site. Showroom, portfolio and filter markup are generated (see below). |
| `css/style.css` | All styles. Design tokens live at the top in `:root`. |
| `js/paint.js` | The hero: a WebGL shader that renders candy paint with metal flake. The cursor is the light. |
| `js/script.js` | Live shop hours, nav, reveal-on-scroll, the paint-stack scroller, gallery filters, lightbox, estimate form. |
| `tools/work.json` | **The portfolio.** One entry per photo: number, category, alt text, optional showroom title. |
| `tools/build.py` | Makes WebP renditions in `images/work/` and writes the gallery into `index.html`. |
| `images/source/` | Original photos, untouched. |

## Adding photos

1. Drop the photo into `images/source/` named like the others: `daleskc.com - 00078.JPG`.
2. Add a line to `tools/work.json`:
   ```json
   { "n": 78, "cat": "paint", "alt": "Describe what's in the photo for screen readers" }
   ```
   Add `"feature": "Short title"` to also put it in the Showroom carousel. Order in the file = order on the page.
3. Rebuild:
   ```bash
   pip install pillow
   python3 tools/build.py
   ```

## Run it locally

```bash
python3 -m http.server 5501
```

Then open http://localhost:5501.

## Changing hours

Hours live in two places: the `HOURS` table at the top of `js/script.js` (drives the live
Open/Closed badge) and the hours table plus JSON-LD in `index.html` (what search engines and
no-JS visitors see). Keep them in sync.

## Things worth knowing

- Respects `prefers-reduced-motion`: the shader renders one still frame and animations are off.
- Without WebGL the hero falls back to a CSS gradient; without JavaScript the whole page still reads.
- The estimate form opens a prefilled email (no server needed). Swap in Formspree/Netlify Forms later
  if you want submissions to land somewhere else.
- The Google Map only loads when someone clicks it, which keeps the page fast.
