export const VECTOR_FIELD = "image_embedding";
export const VECTOR_DIMENSIONS = 512;

export function normalizeCatalogItem(item) {
  const lat = Number(item.lat ?? item.location?.[0]);
  const lng = Number(item.lng ?? item.location?.[1]);
  if (!item.id || !item.name || !item.image || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Catalog items need id, name, image, lat, and lng fields.");
  }
  return {
    ...item,
    id: String(item.id),
    name: String(item.name),
    description: String(item.description || ""),
    state: String(item.state || ""),
    image: String(item.image),
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    category: Array.isArray(item.category) ? item.category.map(String) : [String(item.category || "Outdoors")],
    accessible: Boolean(item.accessible),
    lat,
    lng,
    location: [lat, lng],
    match: Number(item.match || 0),
    color: String(item.color || "#315c43"),
  };
}

export function readCatalogPayload(payload) {
  const items = Array.isArray(payload) ? payload : payload.parks || payload.items;
  if (!Array.isArray(items)) throw new Error("Catalog JSON must be an array or contain a parks/items array.");
  return items.map(normalizeCatalogItem);
}
