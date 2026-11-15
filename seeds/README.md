# Adding cities and places

A city is added by writing a short **seed** and letting the scripts do the rest.

```
seeds/<batch>.json  ->  node scripts/add-city.mjs  ->  data/cities/<id>.json (+ costs, seasons, city order)
push to a claude/** branch  ->  "Enrich new cities" workflow  ->  pins, photos, readership, galleries, report
pull request  ->  "Check" workflow (data check + build)  ->  merge  ->  site redeploys
```

## Steps

1. Pick cities from `seeds/backlog.md` and tick them off there.
2. Write a seed file in `seeds/` (one city, or a list of cities). Copy a city from an existing batch file as a template.
3. `node scripts/add-city.mjs && node scripts/check-data.mjs && npm run build`
4. Push to a `claude/**` branch. The enrich workflow commits pins, photos and a report to `seeds/reports/` back to the branch. Read the report and fix what it flags (wrong Wikipedia title, a venue the map could not find).
5. Open a pull request. Merge when the check passes.

To change a city later, edit `data/cities/<id>.json` directly, or edit its seed and run `node scripts/add-city.mjs --force <id>` (keeps readership numbers and confirmed pins). To add one place to an existing city, add it to that city's seed and rebuild with `--force`, or hand-write the item in the city file.

## Seed fields

City: `id`, `name`, `country`, `region` (Asia, Europe, Africa, South America, North America, Oceania), `at` [lat, lon], `wiki` (English Wikipedia title), `cover` (title of a landmark article whose lead photo becomes the cover), `official` (tourism site, optional), `tagline`, `summary`, `days`, `bestMonths`, `seasonNote`, `arrival`, `gettingAround`, `cashTip`, `dailyBudget` and `cashPerDay` (local currency, per person, without the hotel), `currency`, `foodTip`, `buyTip`, `baseArea`, `hotel` [low, high] in USD per night, `seasons` (12 letters Jan to Dec: L low, S shoulder, H high, P peak), optional `hop`, `via`, `fare`, `car`, `costNote`, `connections` (to cities that already exist), `items`.

Place (`items`): `name`, `kind` (see, eat, shop), `at` (best-guess pin), `wiki` (the place's own article if it has one; otherwise the dish, street or city), `area`, `summary`, `expect` (the catch), `tip`, `why`, `flow` (two steps), `hours`, `price` [low, high] in local currency, `best` (best time), `book` (optional), `p` (1 must-see, 2 worth it, 3 if time), `types` (History, Architecture, Art, Nature, Adventure, Food, Shopping, Viewpoint, Spiritual, Entertainment, Technology), optional `excursion`, `optional`, `id`, `url`.

Food places also need `cuisine`, `order` (what to order) and optionally `venue: "food-area"` (a market or street rather than one restaurant), `veg`, `halal`.

Each city needs at least 5 sights and 3 food places. Aim for 6 sights, 3 or 4 food places, and one market or food street.

## Rules

- Only places you are confident exist and are open. Prefer long-established venues. The enrich report lists venues the map could not find; check those by hand.
- Ratings are never typed in. Popularity comes from Wikipedia readership and (when the key is set) Google Maps, fetched by script.
- Photos come only from Wikimedia Commons with author and licence, and only from an article about that place. A place with no photo shows "No photo yet"; never borrow one.
- Don't run prettier on `data/cities`.
