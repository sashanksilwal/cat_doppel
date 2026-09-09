import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { loadEnv, typesenseConfig } from "./lib/env.mjs";
import { VECTOR_FIELD } from "./lib/catalog.mjs";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

await loadEnv(root);

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function searchDogs(req, res) {
  const { base, collection: configuredCollection, searchKey } = typesenseConfig();
  if (!searchKey) return json(res, 503, { error: "Typesense is not configured" });

  const input = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const species = input.get("species") === "dog" || (req.url || "").startsWith("/api/dogs") ? "dog" : "cat";
  const collection = species === "cat"
    ? process.env.CAT_TYPESENSE_COLLECTION || "cats"
    : process.env.DOG_TYPESENSE_COLLECTION || configuredCollection || "dogs";
  const q = String(input.get("q") || "*").slice(0, 120);
  const mode = input.get("mode") || "all";
  const page = Math.max(1, Math.min(100, Number(input.get("page")) || 1));
  const lat = Number(input.get("lat") || 39.7684);
  const lng = Number(input.get("lng") || -86.1581);
  const radius = Math.max(1, Math.min(100, Number(input.get("radius")) || 10));
  const filters = [`location:(${lat}, ${lng}, ${radius} mi)`];
  const query = new URLSearchParams({
    q,
    query_by: "name,breed,tags,shelter,neighborhood,bio",
    sort_by: `_text_match:desc,vibe:desc,location(${lat},${lng}):asc`,
    per_page: "24",
    page: String(page),
  });
  if (["adopt", "pet"].includes(mode)) filters.push(`type:=${mode}`);
  query.set("filter_by", filters.join(" && "));

  try {
    const response = await fetch(`${base}/collections/${collection}/documents/search?${query}`, {
      headers: { "X-TYPESENSE-API-KEY": searchKey },
    });
    const payload = await response.json();
    if (!response.ok) return json(res, response.status, { error: payload.message || "Pet search failed" });
    return json(res, 200, { source: "typesense", species, radius, found: payload.found, page, hits: payload.hits });
  } catch {
    return json(res, 502, { error: "Unable to reach Typesense" });
  }
}

function searchFilters(input) {
  const lat = Number(input.lat), lng = Number(input.lng);
  const radius = Math.min(3000, Math.max(1, Number(input.radius) || 500));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Invalid coordinates");
  const filters = [`location:(${lat}, ${lng}, ${radius} mi)`];
  if (input.category === "Accessible") filters.push("accessible:=true");
  else if (["Mountains", "Water", "Forest", "Desert", "Birds", "Mammals", "Reptiles", "Amphibians", "Insects", "Other wildlife"].includes(input.category)) filters.push(`category:=${input.category}`);
  return { lat, lng, filters: filters.join(" && ") };
}

async function searchTypesense(req, res) {
  const { TYPESENSE_HOST: host, TYPESENSE_SEARCH_KEY: key } = process.env;
  if (!host || !key) {
    res.writeHead(503, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "Typesense is not configured" }));
  }
  const input = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const lat = Number(input.get("lat"));
  const lng = Number(input.get("lng"));
  const radius = Math.min(3000, Math.max(1, Number(input.get("radius")) || 500));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.writeHead(400, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "Invalid coordinates" }));
  }
  const filters = [`location:(${lat}, ${lng}, ${radius} mi)`];
  const category = input.get("category") || "all";
  if (category === "Accessible") filters.push("accessible:=true");
  else if (["Mountains", "Water", "Forest", "Desert", "Birds", "Mammals", "Reptiles", "Amphibians", "Insects", "Other wildlife"].includes(category)) filters.push(`category:=${category}`);
  const page = Math.max(1, Number(input.get("page")) || 1);
  const query = new URLSearchParams({ q: input.get("q") || "*", query_by: "name,description,tags", filter_by: filters.join(" && "), sort_by: `_text_match:desc,location(${lat},${lng}):asc`, exclude_fields:VECTOR_FIELD, per_page: "24", page:String(page) });
  const protocol = process.env.TYPESENSE_PROTOCOL || "https";
  const remotePort = process.env.TYPESENSE_PORT || "443";
  const collection = process.env.TYPESENSE_COLLECTION || "parks";
  try {
    const response = await fetch(`${protocol}://${host}:${remotePort}/collections/${collection}/documents/search?${query}`, { headers: { "X-TYPESENSE-API-KEY": key } });
    const body = await response.text();
    res.writeHead(response.status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Unable to reach Typesense" }));
  }
}

async function readJson(req, maxBytes = 8_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Image is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function imageSearch(req, res) {
  try {
    const input = await readJson(req);
    const species = input.species === "dog" ? "dog" : "cat";
    const { base, collection: configuredCollection, searchKey } = typesenseConfig();
    const collection = species === "cat"
      ? process.env.CAT_TYPESENSE_COLLECTION || "cats"
      : process.env.DOG_TYPESENSE_COLLECTION || configuredCollection || "dogs";
    const lat = Number(input.lat || 39.7684);
    const lng = Number(input.lng || -86.1581);
    const radius = Math.max(1, Math.min(100, Number(input.radius) || 10));
    const match = String(input.image || "").match(/^data:(image\/(?:jpeg|png));base64,(.+)$/);
    if (!match) return json(res, 400, { error: "Send a JPEG or PNG image" });
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > 5_000_000) return json(res, 413, { error: "Image must be smaller than 5 MB" });
    if (!searchKey) return json(res, 503, { error: "Typesense is not configured" });
    const filters = [`location:(${lat}, ${lng}, ${radius} mi)`];
    if (["adopt", "pet"].includes(input.mode)) filters.push(`type:=${input.mode}`);
    const search = {
      collection,
      q: "*",
      filter_by: filters.join(" && "),
      vector_query: `${VECTOR_FIELD}:([], image:${match[2]}, k:24)`,
      exclude_fields: `${VECTOR_FIELD},image_data`,
      per_page: 24,
    };
    const response = await fetch(`${base}/multi_search`, {
      method: "POST",
      headers: { "X-TYPESENSE-API-KEY": searchKey, "content-type": "application/json" },
      body: JSON.stringify({ searches: [search] }),
    });
    const payload = await response.json();
    if (!response.ok || payload.results?.[0]?.error) return json(res, response.status || 502, { error: payload.results?.[0]?.error || "Image search failed" });
    const result = payload.results[0];
    result.hits = result.hits.map(hit => ({
      ...hit,
      document: { ...hit.document, lat: hit.document.location?.[0], lng: hit.document.location?.[1] },
      image_match: Math.max(0, Math.min(100, Math.round((1 - Number(hit.vector_distance || 0) / 2) * 100))),
    }));
    return json(res, 200, result);
  } catch (error) {
    return json(res, /too large/i.test(error.message) ? 413 : 500, { error: error.message || "Image search failed" });
  }
}

createServer(async (req, res) => {
  if ((req.url || "").startsWith("/api/pets")) return searchDogs(req, res);
  if ((req.url || "").startsWith("/api/dogs")) return searchDogs(req, res);
  if ((req.url || "").startsWith("/api/search")) return searchTypesense(req, res);
  if (req.method === "POST" && req.url === "/api/image-search") return imageSearch(req, res);
  const requested = decodeURIComponent((req.url || "/").split("?")[0]);
  const relative = normalize(requested === "/" ? "index.html" : requested).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, relative);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": `${types[extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}).listen(port, () => console.log(`Doppel is running at http://localhost:${port}`));
