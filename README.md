# ParkLens

Visual and geographic discovery for national parks. The MVP includes image upload, text search, radius filtering, landscape facets, a result map, saved places, and a Typesense REST adapter. It falls back to a curated dataset when Typesense is not configured.

## Run

```bash
npm run dev
```

Open `http://localhost:4173`.

## Connect Typesense

Copy `.env.example` to `.env`, then add your Typesense host, search-only key, and admin key. Credentials stay server-side and `.env` is ignored by Git.

Create the collection and import the demo parks:

```bash
npm run typesense:setup
```

Import the full National Park Service catalog, including coordinates, activities, topics, descriptions, and available images:

```bash
npm run typesense:import-nps
```

Start the app with `npm run dev`. Browser searches go through the local `/api/search` proxy, so neither Typesense key appears in frontend code.

The collection is named `parks` by default and uses these core fields:

```json
{
  "name": "parks",
  "fields": [
    { "name": "id", "type": "string" },
    { "name": "name", "type": "string" },
    { "name": "description", "type": "string" },
    { "name": "tags", "type": "string[]", "facet": true },
    { "name": "category", "type": "string[]", "facet": true },
    { "name": "accessible", "type": "bool", "facet": true },
    { "name": "location", "type": "geopoint" },
    { "name": "image", "type": "string" },
    { "name": "state", "type": "string", "facet": true }
  ]
}
```

For production image search, compute CLIP embeddings for NPS images during ingestion, add a `float[]` vector field, compute the uploaded image embedding in a small backend, and send it to Typesense using `vector_query`. The current offline demo marks uploaded images as a visual-search signal while keeping all interaction functional without secrets or external services.
