import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const targets = [
  { id: "luna", endpoint: "https://dog.ceo/api/breed/husky/images/random" },
  { id: "ollie", endpoint: "https://dog.ceo/api/breed/beagle/images/random" },
  { id: "winnie", endpoint: "https://dog.ceo/api/breed/dalmatian/images/random" },
  { id: "theo", endpoint: "https://dog.ceo/api/breed/pug/images/random" },
  { id: "nova", endpoint: "https://dog.ceo/api/breed/samoyed/images/random" },
  { id: "teddy", endpoint: "https://dog.ceo/api/breed/shiba/images/random" },
  { id: "rosie", endpoint: "https://dog.ceo/api/breed/chihuahua/images/random" },
  { id: "jasper", endpoint: "https://dog.ceo/api/breed/poodle/images/random" },
  { id: "scout", endpoint: "https://dog.ceo/api/breed/pembroke/images/random" },
  { id: "sasha", endpoint: "https://dog.ceo/api/breed/malinois/images/random" },
  { id: "noodle", endpoint: "https://dog.ceo/api/breed/pomeranian/images/random" },
  { id: "louie", endpoint: "https://dog.ceo/api/breed/hound/basset/images/random" },
];

const outputDirectory = join(process.cwd(), "assets", "dogs");
await mkdir(outputDirectory, { recursive: true });

const manifest = [];
for (const target of targets) {
  const metadataResponse = await fetch(target.endpoint);
  if (!metadataResponse.ok) throw new Error(`${target.id}: API request failed (${metadataResponse.status}).`);
  const metadata = await metadataResponse.json();
  if (metadata.status !== "success" || !metadata.message) throw new Error(`${target.id}: Dog API returned no image.`);

  const imageResponse = await fetch(metadata.message);
  if (!imageResponse.ok) throw new Error(`${target.id}: image download failed (${imageResponse.status}).`);
  const type = imageResponse.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error(`${target.id}: downloaded resource was not an image.`);

  const sourceExtension = extname(new URL(metadata.message).pathname).toLowerCase();
  const extension = [".jpg", ".jpeg", ".png", ".webp"].includes(sourceExtension) ? sourceExtension : ".jpg";
  const filename = `${target.id}${extension}`;
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (bytes.length < 8_000) throw new Error(`${target.id}: downloaded image was unexpectedly small.`);
  await writeFile(join(outputDirectory, filename), bytes);
  manifest.push({ id: target.id, file: `assets/dogs/${filename}`, source_url: metadata.message, api_endpoint: target.endpoint });
  console.log(`Downloaded ${target.id} (${Math.round(bytes.length / 1024)} KB).`);
}

await writeFile(join(outputDirectory, "sources.json"), `${JSON.stringify({ provider: "Dog CEO API", downloaded_at: new Date().toISOString(), images: manifest }, null, 2)}\n`);
console.log(`Saved ${manifest.length} dog photos and source metadata.`);
