import { spawnSync } from "node:child_process";
import { loadEnv } from "../lib/env.mjs";

await loadEnv();

const variables = [
  ["TYPESENSE_HOST", process.env.TYPESENSE_HOST, false],
  ["TYPESENSE_PORT", process.env.TYPESENSE_PORT || "443", false],
  ["TYPESENSE_PROTOCOL", process.env.TYPESENSE_PROTOCOL || "https", false],
  ["TYPESENSE_COLLECTION", process.env.TYPESENSE_COLLECTION || "dogs", false],
  ["TYPESENSE_SEARCH_KEY", process.env.TYPESENSE_SEARCH_KEY, true],
];

for (const [name, value, sensitive] of variables) {
  if (!value) throw new Error(`${name} is not configured locally.`);
  const result = spawnSync("npx", [
    "vercel@latest", "env", "add", name, "production", "--force", "--yes",
    sensitive ? "--sensitive" : "--no-sensitive",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: `${value}\n`,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  if (result.status !== 0) {
    const details = `${result.stdout || ""}\n${result.stderr || ""}`.replaceAll(value, "[REDACTED]").trim();
    throw new Error(`${name} could not be added. ${details}`);
  }
  console.log(`Configured ${name} for production.`);
}
