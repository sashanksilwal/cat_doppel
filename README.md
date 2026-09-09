# Doppel

A camera-first dog discovery concept. Take or upload a selfie to reveal a playful dog doppelgänger, then browse adoptable dogs and friendly playdates nearby.

## Run locally

```bash
npm run dev
```

Open [http://localhost:4173](http://localhost:4173).

The app is intentionally self-contained: dog data and imagery are local, favorites persist in `localStorage`, and the live-camera flow uses the browser’s `getUserMedia` API. If camera permission is unavailable, the sample selfie and photo uploader keep the full matching flow usable.

## Typesense

Typesense Cloud credential exports matching `*-api-keys-*.txt` are ignored by Git. When one or more exports are in the project root, the server securely loads the newest export before `.env` and keeps both API keys server-side.

Create the `dogs` collection and upsert the local listings:

```bash
npm run typesense:dogs
```

The browser searches through the local `/api/dogs` proxy. The search-only key is never included in frontend code, and the app falls back to the local dog catalog if Typesense is unavailable.

## Dog photos and map data

Build a varied local catalog of 2,048 demo dog profiles from public Dog CEO photos:

```bash
npm run dogs:seed
```

The generator caches resized WebP images in `assets/dogs/generated/`, records source URLs in `data/generated-dogs.json`, and assigns stable Indianapolis-area demo locations. Rerunning it uses the cache; set `DOG_REFRESH=1` to fetch a new photo set. Use `DOG_CATALOG_SIZE` to request a larger catalog (the minimum is 2,048).

For the smaller hand-curated photo set, run:

```bash
npm run dogs:download
```

The setup command combines both sets and currently indexes 2,066 searchable dogs in Typesense. Normal app usage does not depend on the image API, because all images are cached locally. The generated names, shelter details, availability, and geotags are fictional demo content rather than live adoption listings.

The list/map switch uses a locally installed Leaflet client with OpenStreetMap tiles. Photo markers open a compact dog summary and link directly into the existing profile sheet.

## Main interactions

- Enable the live camera, take a picture, or upload an existing selfie.
- Reveal a dog-vibe match and jump into nearby matches.
- Switch between adoptable dogs and supervised pet/playdate listings.
- Search, save, inspect details, and prepare an introduction to a shelter or foster.
- Switch between list and map views to explore dog locations.

The current matching result and listings are demo content designed to communicate the product experience; a production version should connect to a verified shelter inventory and a real matching service.
