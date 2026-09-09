import { dogs } from "../data.js";
import { readFile } from "node:fs/promises";
import { loadEnv, typesenseConfig } from "../lib/env.mjs";

await loadEnv();
const { base, collection, adminKey } = typesenseConfig();
if (!adminKey || !process.env.TYPESENSE_HOST) {
  throw new Error("Add a Typesense Cloud credential export to the project before running this setup.");
}

const headers = { "X-TYPESENSE-API-KEY": adminKey, "content-type": "application/json" };
const schema = {
  name: collection,
  enable_nested_fields: false,
  fields: [
    { name: "id", type: "string" },
    { name: "name", type: "string" },
    { name: "age", type: "string" },
    { name: "breed", type: "string", facet: true },
    { name: "shelter", type: "string", facet: true },
    { name: "neighborhood", type: "string", facet: true },
    { name: "type", type: "string", facet: true },
    { name: "vibe", type: "int32" },
    { name: "photo", type: "string" },
    { name: "tags", type: "string[]", facet: true },
    { name: "bio", type: "string" },
    { name: "fee", type: "string" },
    { name: "distance", type: "float" },
    { name: "location", type: "geopoint" },
    { name: "lat", type: "float", optional: true },
    { name: "lng", type: "float", optional: true },
    { name: "image", type: "string", optional: true },
    { name: "source_url", type: "string", optional: true },
    { name: "source", type: "string", optional: true, facet: true },
    { name: "demo", type: "bool", optional: true, facet: true },
    { name: "api_breed_key", type: "string", optional: true, facet: true },
  ],
  default_sorting_field: "vibe",
};

const existing = await fetch(`${base}/collections/${collection}`, { headers });
if (existing.status === 404) {
  const created = await fetch(`${base}/collections`, {
    method: "POST",
    headers,
    body: JSON.stringify(schema),
  });
  if (!created.ok) throw new Error(`Collection creation failed (${created.status}).`);
} else if (!existing.ok) {
  throw new Error(`Typesense connection failed (${existing.status}).`);
} else {
  const currentSchema = await existing.json();
  const currentFields = new Set(currentSchema.fields?.map(field => field.name));
  const missingFields = schema.fields
    .filter(field => field.name !== "id" && !currentFields.has(field.name))
    .map(field => ({ ...field, optional: true }));
  if (missingFields.length) {
    const updated = await fetch(`${base}/collections/${collection}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: missingFields }),
    });
    if (!updated.ok) throw new Error(`Collection schema update failed (${updated.status}): ${await updated.text()}`);
  }
}

let generatedDogs = [];
try {
  const payload = JSON.parse(await readFile(new URL("../data/generated-dogs.json", import.meta.url), "utf8"));
  generatedDogs = Array.isArray(payload.dogs) ? payload.dogs : [];
} catch {}
const documents = [...dogs, ...generatedDogs].map(dog => ({ ...dog, location: [dog.lat, dog.lng] }));
const imported = await fetch(`${base}/collections/${collection}/documents/import?action=upsert`, {
  method: "POST",
  headers: { ...headers, "content-type": "text/plain" },
  body: documents.map(document => JSON.stringify(document)).join("\n"),
});
if (!imported.ok) throw new Error(`Dog import failed (${imported.status}).`);

const results = (await imported.text()).trim().split("\n").filter(Boolean).map(JSON.parse);
const failures = results.filter(result => !result.success);
if (failures.length) throw new Error(`${failures.length} dog records failed to import.`);

console.log(`Typesense is ready: ${documents.length} dogs imported into ${collection}.`);
