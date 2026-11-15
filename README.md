# Tandem Roads

A travel guide and multi-city trip planner: 95 cities and 1178 places with prices, tips, best times and
sources, popularity rankings, food and dietary filters, a Leaflet map, and a trip planner that splits
places into days, estimates budgets and exports to JSON or CSV. Plain HTML, CSS and JavaScript, with
no framework and no backend. Your saved places and trips stay in the browser (`localStorage` key
`roam-atlas-v1`, kept from the app's earlier name, Roam Atlas, so existing trips carry over).

## Project layout

| Path | What it holds |
| --- | --- |
| `src/index.html` | Page shell (header, nav, `#app` mount point) |
| `src/styles.css` | App styles |
| `src/app.js` | All app logic: routing, rendering, trip planner, map, import/export |
| `data/cities/<id>.json` | One file per city, including its places (`items`) |
| `data/meta.json` | Data version, retrieval date and city order |
| `data/photos.json`, `data/art.json` | Image metadata and credits; `data` points to a file in `images/` |
| `data/gallery.json` | Extra Wikimedia Commons photos per city/place (hotlinked thumbnails, author and licence); rebuilt by `node scripts/refresh-gallery.mjs` |
| `data/popularity.json` | Sources behind the popularity ranking |
| `data/stories.json`, `src/story.js`, `src/story.css` | Trip stories (`#/story/<id>`): a logged trip as a route map and timeline. The only one so far is a made-up sample |
| `data/world.geojson` | Country outlines (Natural Earth 1:110m) |
| `images/` | Photos (Pexels) and illustrations, as WebP |
| `vendor/leaflet/` | Leaflet 1.9.4 |

## Build

Requires Node 18+.

```sh
npm install
npm run build          # dist/index.html + dist/images/ for hosting (about 3 MB of HTML; images load on demand)
npm run build:single   # dist/tandem-roads.html, one self-contained file with every image inlined (about 49 MB)
npm run dev            # build and serve dist/ locally
```

### Adding cities

New cities come in through short seed files rather than hand-written city files: see
[`seeds/README.md`](seeds/README.md). `node scripts/add-city.mjs` expands seeds into full city files,
the **Enrich new cities** workflow adds pins, photos and readership from Wikipedia and OpenStreetMap,
and `node scripts/check-data.mjs` (run on every pull request) checks the result. The list of cities
still to add is in [`seeds/backlog.md`](seeds/backlog.md).

The build inlines the CSS, Leaflet, the assembled `DATA` object and `app.js` into one HTML file. To add
or change a city, edit its JSON file in `data/cities/` (add new cities to `cityOrder` in
`data/meta.json` too) and rebuild.

## Deploy

Every push to `main` builds the hosted version and publishes it to GitHub Pages
(`.github/workflows/pages.yml`). One-time setup: in the repo's **Settings → Pages**, set **Source** to
**GitHub Actions**. The site is then at `https://mindfulmod.github.io/roam/`.

## Popularity rankings

A place's rank is computed in `src/app.js` (see `SIGNALS` and `poolStats`). Each source becomes a
percentile among the same kind of place in the same city, and the rank is the weighted average of
those percentiles. Cards show the one-line reason, and the place popup shows each source with its number,
position and link.

| Source | Where it lives | How it is refreshed |
| --- | --- | --- |
| Tripadvisor reviews | `review` on each place | By hand (snapshot from 2026-11-04) |
| Wikipedia readers, last 12 months | `signals.wikipedia` | `node scripts/refresh-signals.mjs` |
| Google Maps reviews | `signals.google` | Same script, when `GOOGLE_MAPS_API_KEY` is set |

`.github/workflows/refresh-signals.yml` runs the script every Monday, commits any changes to `main` and
redeploys. To include Google, add a `GOOGLE_MAPS_API_KEY` repository secret (Places API (New) enabled).

### MICHELIN Guide

Restaurants in the MICHELIN Guide carry a `michelin` object (`distinction`, `stars`, `label`, `url`,
`checked`). It is a quality award from inspectors, not a popularity count, so it is shown next to the
rank (card pill, a row in "Why it ranks here", a MICHELIN Guide food filter) and never mixed into the
percentiles. Unranked MICHELIN places sort after ranked places and before other editorial picks. Prices
for these restaurants are per-person planning estimates from the guide's price band, and each city lists
its MICHELIN selection page under Sources. Distinctions change every year, so re-check them against the
guide when the new selections come out.

## Origin

This was first built as a single HTML file in ChatGPT. The original file was split into this
layout without changing behaviour; both builds render the same as the original.

## Checks

`npm test` builds the app and runs the checks in `tests/`. The same checks run on every pull request (`.github/workflows/check.yml`).

- `tests/data.test.mjs`: the guide data is sound (ids unique and link-safe, coordinates near their city, links are http(s) only).
- `tests/app.test.mjs`: every screen opens on a phone and a desktop with no errors and no sideways scrolling; saving a place and adding a city to the trip works and survives a reload; text that was typed, or that arrives in a link or a backup file, is shown as text and never runs as code.

New screens go in the `SCREENS` list. Anything that shows text written by a person gets a case in the hostile-text tests before it merges.
