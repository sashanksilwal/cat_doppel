import { loadEnv, typesenseConfig } from "../lib/env.mjs";

await loadEnv(process.cwd());

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "s-maxage=30, stale-while-revalidate=120");
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });

  const { base, collection, searchKey } = typesenseConfig();
  if (!searchKey || !process.env.TYPESENSE_HOST) {
    return sendJson(response, 503, { error: "Typesense is not configured" });
  }

  const url = new URL(request.url, `https://${request.headers.host || "localhost"}`);
  const q = String(url.searchParams.get("q") || "*").slice(0, 120);
  const mode = url.searchParams.get("mode") || "all";
  const page = Math.max(1, Math.min(100, Number(url.searchParams.get("page")) || 1));
  const lat = Number(url.searchParams.get("lat") || 39.7684);
  const lng = Number(url.searchParams.get("lng") || -86.1581);
  const radius = Math.max(1, Math.min(100, Number(url.searchParams.get("radius")) || 10));
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
    const result = await fetch(`${base}/collections/${collection}/documents/search?${query}`, {
      headers: { "X-TYPESENSE-API-KEY": searchKey },
    });
    const payload = await result.json();
    if (!result.ok) return sendJson(response, result.status, { error: payload.message || "Dog search failed" });
    return sendJson(response, 200, { source: "typesense", radius, found: payload.found, page, hits: payload.hits });
  } catch {
    return sendJson(response, 502, { error: "Unable to reach Typesense" });
  }
}
