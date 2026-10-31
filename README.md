# Dale's Auto Body: daleskc.com

The website for Dale's Auto Body, 1310 State Avenue, Kansas City, KS. Family owned since 1975.

It's a plain static site: no build step, no framework and no dependencies. GitHub Pages serves it from the `main` branch, and the `CNAME` file points it at daleskc.com.

## Layout

```
index.html        The page: hero + photo slider, services, visit + map, footer
404.html          Shown by GitHub Pages for unknown URLs
css/style.css     All styles (colors live in the :root variables at the top)
js/script.js      Slider, open/closed status, scroll fade-ins, mobile call bar
images/work/      Slider photos (WebP, 640px wide or smaller)
images/brand/     Logo source files (not used on the page)
images/og.jpg     Preview image for links shared in texts and social posts
favicon.svg       Browser tab icon
robots.txt, sitemap.xml
```

## Common edits

**Hours.** Update three places:
1. The `SHOP` object at the top of `js/script.js`. It drives the Open/Closed badge.
2. The hours line in the Visit section of `index.html`.
3. `openingHoursSpecification` in the JSON-LD block in the `<head>` of `index.html`. Google reads this one.

**Slider photos.**
1. Export the photo as WebP, about 640px wide, and save it in `images/work/`.
2. Add a `[src, alt]` line to the `PHOTOS` list in `js/script.js`.
3. Keep the first entry in sync with the `<img>` in `index.html`.

**Phone or email.** Search `index.html` for `9133716654` and `dalesautobody@gmail.com`. Both also appear in the JSON-LD.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Notes

- The page sets a Content Security Policy in a `<meta>` tag. If you add a script, font or embed from another site, add its domain there or the browser will block it.
- Animations respect the visitor's "reduce motion" setting. In that case the slider doesn't autoplay and the scroll fade-ins are off.
- The open/closed badge always uses Kansas City time, wherever the visitor is.
