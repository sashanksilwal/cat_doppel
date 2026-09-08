import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadEnv(root = process.cwd()) {
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
