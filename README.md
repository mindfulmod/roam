# Roam Atlas

A travel guide and multi-city trip planner: 60 cities and 794 places with prices, tips, best times and
sources, popularity rankings, food and dietary filters, a Leaflet map, and a trip planner that splits
places into days, estimates budgets and exports to JSON or CSV. Plain HTML, CSS and JavaScript, with
no framework and no backend. Your saved places and trips stay in the browser (`localStorage` key
`roam-atlas-v1`).

## Project layout

| Path | What it holds |
| --- | --- |
| `src/index.html` | Page shell (header, nav, `#app` mount point) |
| `src/styles.css` | App styles |
| `src/app.js` | All app logic: routing, rendering, trip planner, map, import/export |
| `data/cities/<id>.json` | One file per city, including its places (`items`) |
| `data/meta.json` | Data version, retrieval date and city order |
| `data/photos.json`, `data/art.json` | Image metadata and credits; `data` points to a file in `images/` |
| `data/popularity.json` | Sources behind the popularity ranking |
| `data/world.geojson` | Country outlines (Natural Earth 1:110m) |
| `images/` | Photos (Pexels) and illustrations, as WebP |
| `vendor/leaflet/` | Leaflet 1.9.4 |

## Build

Requires Node 18+.

```sh
npm install
npm run build          # dist/index.html + dist/images/ for hosting (about 3 MB of HTML; images load on demand)
npm run build:single   # dist/roam-atlas.html, one self-contained file with every image inlined (about 49 MB)
npm run dev            # build and serve dist/ locally
```

The build inlines the CSS, Leaflet, the assembled `DATA` object and `app.js` into one HTML file. To add
or change a city, edit its JSON file in `data/cities/` (add new cities to `cityOrder` in
`data/meta.json` too) and rebuild.

## Deploy

Every push to `main` builds the hosted version and publishes it to GitHub Pages
(`.github/workflows/pages.yml`). One-time setup: in the repo's **Settings → Pages**, set **Source** to
**GitHub Actions**. The site is then at `https://mindfulmod.github.io/roam/`.

## Origin

This was first built as a single HTML file in ChatGPT. The original file was split into this
layout without changing behaviour; both builds render the same as the original.
