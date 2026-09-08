import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv, typesenseConfig } from "../lib/env.mjs";
import { readCatalogPayload, VECTOR_DIMENSIONS, VECTOR_FIELD } from "../lib/catalog.mjs";
import { embedImage } from "../lib/embeddings.mjs";

await loadEnv();
const { base, collection, adminKey } = typesenseConfig();
if (!adminKey || !process.env.TYPESENSE_HOST) throw new Error("Set TYPESENSE_HOST and TYPESENSE_ADMIN_KEY in .env first.");
const catalogPath = resolve(process.env.CATALOG_FILE || process.argv[2] || "nps-parks.json");
const documents = readCatalogPayload(JSON.parse(await readFile(catalogPath, "utf8")));
const headers = { "X-TYPESENSE-API-KEY": adminKey, "content-type": "application/json" };

const schemaResponse = await fetch(`${base}/collections/${collection}`, { method: "PATCH", headers, body: JSON.stringify({ fields: [{ name: VECTOR_FIELD, type: "float[]", num_dim: VECTOR_DIMENSIONS, optional: true }] }) });
if (!schemaResponse.ok) {
  const message = await schemaResponse.text();
  if (!/already exists|duplicate|no change/i.test(message)) throw new Error(`Vector schema update failed: ${message}`);
}

let completed = 0;
for (const document of documents) {
  try {
    document[VECTOR_FIELD] = await embedImage(document.image);
    const response = await fetch(`${base}/collections/${collection}/documents?action=upsert`, { method: "POST", headers, body: JSON.stringify(document) });
    if (!response.ok) throw new Error(await response.text());
    completed += 1;
    console.log(`[${completed}/${documents.length}] ${document.name}`);
  } catch (error) {
    console.error(`[skip] ${document.name}: ${error.message}`);
  }
}
console.log(`Embedded and indexed ${completed} of ${documents.length} items from ${catalogPath}.`);
