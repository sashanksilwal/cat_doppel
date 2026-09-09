import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const output = join(root, "dist");
const files = ["index.html", "app.js", "data.js", "data", "config.js", "styles.css", "assets"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of files) {
  await cp(join(root, file), join(output, file), { recursive: true });
}

await cp(
  join(root, "node_modules", "leaflet", "dist"),
  join(output, "node_modules", "leaflet", "dist"),
  { recursive: true },
);

console.log("Static site built in dist/");
