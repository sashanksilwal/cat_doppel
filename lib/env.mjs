import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

async function loadTypesenseCloudExport(root) {
  try {
    const files = (await readdir(root))
      .map(name => ({ name, stamp: Number(name.match(/-api-keys-(\d+)\.txt$/)?.[1] || 0) }))
      .filter(file => file.stamp)
      .sort((a, b) => b.stamp - a.stamp);
    if (!files.length) return;

    const source = await readFile(join(root, files[0].name), "utf8");
    const lines = source.split(/\r?\n/).map(line => line.trim());
    const valueAfter = label => {
      const index = lines.findIndex(line => line.toLowerCase() === label.toLowerCase());
      return index < 0 ? "" : lines.slice(index + 1).find(Boolean) || "";
    };
    const nodeLine = valueAfter("Nodes:");
    const node = nodeLine.match(/^([^\s]+)\s+\[(https?):(\d+)\]$/i);
    if (!node) return;

    process.env.TYPESENSE_HOST ||= node[1];
    process.env.TYPESENSE_PROTOCOL ||= node[2].toLowerCase();
    process.env.TYPESENSE_PORT ||= node[3];
    process.env.TYPESENSE_ADMIN_KEY ||= valueAfter("Admin API Key:");
    process.env.TYPESENSE_SEARCH_KEY ||= valueAfter("Search Only API Key:");
    process.env.TYPESENSE_COLLECTION ||= "dogs";
  } catch {}
}

export async function loadEnv(root = process.cwd()) {
  await loadTypesenseCloudExport(root);
  try {
    const source = await readFile(join(root, ".env"), "utf8");
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}

export function typesenseConfig() {
  return {
    base: `${process.env.TYPESENSE_PROTOCOL || "https"}://${process.env.TYPESENSE_HOST}:${process.env.TYPESENSE_PORT || "443"}`,
    collection: process.env.TYPESENSE_COLLECTION || "parks",
    adminKey: process.env.TYPESENSE_ADMIN_KEY,
    searchKey: process.env.TYPESENSE_SEARCH_KEY,
  };
}
