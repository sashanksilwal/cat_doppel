import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parks } from "../data.js";

const root = process.cwd();
try {
  const source = await readFile(join(root, ".env"), "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
} catch {}

const host = process.env.TYPESENSE_HOST;
const key = process.env.TYPESENSE_ADMIN_KEY;
if (!host || !key) throw new Error("Set TYPESENSE_HOST and TYPESENSE_ADMIN_KEY in .env first.");
const base = `${process.env.TYPESENSE_PROTOCOL || "https"}://${host}:${process.env.TYPESENSE_PORT || "443"}`;
const collection = process.env.TYPESENSE_COLLECTION || "parks";
const headers = { "X-TYPESENSE-API-KEY": key, "content-type": "application/json" };
const schema = { name: collection, fields: [
  { name:"id", type:"string" }, { name:"name", type:"string" }, { name:"description", type:"string" },
  { name:"tags", type:"string[]", facet:true }, { name:"category", type:"string[]", facet:true },
  { name:"accessible", type:"bool", facet:true }, { name:"location", type:"geopoint" },
  { name:"image", type:"string" }, { name:"state", type:"string", facet:true },
  { name:"match", type:"int32" }, { name:"color", type:"string" },
  { name:"image_embedding", type:"float[]", num_dim:512, optional:true }
] };

const existing = await fetch(`${base}/collections/${collection}`, { headers });
if (existing.status === 404) {
  const created = await fetch(`${base}/collections`, { method:"POST", headers, body:JSON.stringify(schema) });
  if (!created.ok) throw new Error(`Collection creation failed: ${await created.text()}`);
} else if (!existing.ok) throw new Error(`Typesense connection failed: ${await existing.text()}`);

const documents = parks.map(p => ({ ...p, location:[p.lat,p.lng], accessible:p.category.includes("Accessible") }));
const imported = await fetch(`${base}/collections/${collection}/documents/import?action=upsert`, { method:"POST", headers:{ ...headers, "content-type":"text/plain" }, body:documents.map(x=>JSON.stringify(x)).join("\n") });
if (!imported.ok) throw new Error(`Import failed: ${await imported.text()}`);
const results = (await imported.text()).trim().split("\n").map(JSON.parse);
const failures = results.filter(result => !result.success);
if (failures.length) throw new Error(`${failures.length} documents failed to import.`);
console.log(`Typesense is ready: ${documents.length} parks imported into ${collection}.`);
