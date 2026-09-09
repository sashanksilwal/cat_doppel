# Doppel

A camera-first cat and dog discovery concept. Take or upload a selfie to reveal a playful pet doppelgänger, then browse adoptable animals and supervised pet/playdate hosts nearby.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:4173](http://localhost:4173). Favorites and personalized match taglines persist in `localStorage`. The camera uses the browser’s `getUserMedia` API; the sample selfie and image uploader keep the matching flow usable when camera access is unavailable.

## Typesense

Typesense Cloud credential exports matching `*-api-keys-*.txt` are ignored by Git. When an export is in the project root, the server loads it privately and keeps both API keys out of frontend code.

Create or update both search collections:

```bash
npm run typesense:dogs
npm run typesense:cats
```

The browser searches `/api/pets` with a fixed `dog` or `cat` species value. Dogs and cats stay in separate Typesense collections, and the endpoint applies adoption/playdate and map-radius filters server-side.

## Photo catalogs and demo locations

Build the local 2,048-entry catalogs:

```bash
npm run dogs:seed
npm run cats:seed
```

Dog photos come from Dog CEO. Cat photos come from [Cataas](https://cataas.com/) and [The Cat API](https://thecatapi.com/). The generators cache normalized WebP images in `assets/dogs/generated/` and `assets/cats/generated/`, record attribution URLs in `data/generated-dogs.json` and `data/generated-cats.json`, and assign stable Indianapolis-area locations.

Normal app usage serves these cached files rather than hotlinking the image APIs. Generated names, breeds, shelter details, availability, and geotags are fictional demo content—not verified animal listings. A production service should connect to real shelter inventory before accepting introductions.

## Main interactions

- Switch between cats and dogs without leaving the camera-first experience.
- Take a selfie or upload a photo to reveal a species-aware doppelgänger.
- Enlarge the matched photo and zoom from 1× to 4× by controls, scroll, double-click, or pinch.
- Browse 2K+ profiles per species and request a fresh randomized page.
- Toggle adopt versus supervised pet/play, search profiles, and save favorites.
- Explore photo markers on a Leaflet/OpenStreetMap view with 3, 5, 10, and 25 mile filters.
