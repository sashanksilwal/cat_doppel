import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const targetCount = Math.max(2048, Number(process.env.CAT_CATALOG_SIZE) || 2048);
const imageDirectory = join(process.cwd(), "assets", "cats", "generated");
const dataDirectory = join(process.cwd(), "data");
const outputFile = join(dataDirectory, "generated-cats.json");
const origin = [39.7684, -86.1581];

const names = [
  "Alfie", "Apollo", "Archie", "Ash", "Bean", "Bella", "Benny", "Biscuit", "Blue", "Boots", "Bowie", "Callie",
  "Casper", "Charlie", "Chester", "Chloe", "Cleo", "Clover", "Coco", "Cosmo", "Daisy", "Dolly", "Echo", "Ellie",
  "Felix", "Fig", "Finn", "Frankie", "Freya", "Gigi", "Ginger", "Goose", "Hazel", "Honey", "Iris", "Ivy",
  "Jasper", "Juniper", "Kiki", "Leo", "Lily", "Louie", "Lucky", "Lucy", "Luna", "Mabel", "Mango", "Maple",
  "Marbles", "Milo", "Minnie", "Miso", "Mochi", "Molly", "Murphy", "Nala", "Nico", "Nova", "Olive", "Ollie",
  "Oscar", "Otis", "Peaches", "Pepper", "Pickle", "Piper", "Poppy", "Remi", "Riley", "Rosie", "Ruby", "Sage",
  "Salem", "Simba", "Smudge", "Socks", "Sunny", "Teddy", "Theo", "Tilly", "Toast", "Toby", "Waffles", "Winnie", "Ziggy",
];
const breeds = [
  "Abyssinian", "American Bobtail", "American Shorthair", "Balinese", "Bengal", "Birman", "Bombay", "British Shorthair",
  "Burmese", "Calico", "Chartreux", "Colorpoint Shorthair", "Cornish Rex", "Domestic Longhair", "Domestic Shorthair",
  "Egyptian Mau", "European Shorthair", "Exotic Shorthair", "Havana Brown", "Himalayan", "Japanese Bobtail", "Korat",
  "LaPerm", "Maine Coon", "Manx", "Mixed breed", "Munchkin", "Neblung", "Norwegian Forest Cat", "Ocicat", "Oriental Shorthair",
  "Persian", "Ragdoll", "Russian Blue", "Savannah", "Scottish Fold", "Selkirk Rex", "Siamese", "Siberian", "Singapura",
  "Snowshoe", "Somali", "Sphynx", "Tabby", "Tonkinese", "Tortoiseshell", "Turkish Angora", "Turkish Van",
];
const traits = ["Affectionate", "Blanket burrower", "Bright", "Calm", "Chatty", "Clever", "Cuddly", "Curious", "Easygoing", "Foodie", "Friendly", "Gentle", "Goofy", "Independent", "Lap cat", "Loyal", "Mellow", "Playful", "Polite", "Purr machine", "Quiet", "Social", "Sunbeam seeker", "Sweet", "Toy hunter", "Window watcher"];
const shelters = ["Doppel Foster Network", "Circle City Cat Collective", "Indy Second Chance Cats", "Hoosier Homebound Felines", "Paws Around Town", "Happy Tails Foster Team", "Central Indiana Cat Friends", "Nine Lives Indy"];
const neighborhoods = [
  { name: "Downtown", lat: 39.7684, lng: -86.1581 }, { name: "Broad Ripple", lat: 39.8696, lng: -86.1411 },
  { name: "Irvington", lat: 39.7681, lng: -86.0918 }, { name: "Fountain Square", lat: 39.7526, lng: -86.1401 },
  { name: "Speedway", lat: 39.7711, lng: -86.2147 }, { name: "Meridian–Kessler", lat: 39.8540, lng: -86.1520 },
  { name: "Garfield Park", lat: 39.7350, lng: -86.1740 }, { name: "Beech Grove", lat: 39.7212, lng: -86.0886 },
  { name: "Castleton", lat: 39.8845, lng: -86.0563 }, { name: "Carmel", lat: 39.9784, lng: -86.1180 },
  { name: "Fishers", lat: 39.9568, lng: -86.0134 }, { name: "Greenwood", lat: 39.6137, lng: -86.1067 },
  { name: "Zionsville", lat: 39.9509, lng: -86.2619 }, { name: "Plainfield", lat: 39.7042, lng: -86.3994 },
  { name: "Lawrence", lat: 39.8387, lng: -86.0253 }, { name: "Nora", lat: 39.9125, lng: -86.1380 },
];

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function randomFor(value) {
  let seed = Number.parseInt(hash(value).slice(0, 8), 16) >>> 0;
  return () => {
    seed += 0x6D2B79F5;
    let next = seed;
    next = Math.imul(next ^ next >>> 15, next | 1);
    next ^= next + Math.imul(next ^ next >>> 7, next | 61);
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await task(items[index], index); }
      catch (error) { results[index] = { error: error.message, item: items[index] }; }
    }
  }));
  return results;
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json();
}

function milesBetween(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b[0] - a[0]) * radians;
  const dLng = (b[1] - a[1]) * radians;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin(dLng / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(value));
}

function buildProfile(candidate) {
  const stableKey = `${candidate.provider}:${candidate.id}`;
  const digest = hash(stableKey);
  const random = randomFor(stableKey);
  const neighborhood = neighborhoods[Math.floor(random() * neighborhoods.length)];
  const lat = Number((neighborhood.lat + (random() - .5) * .035).toFixed(6));
  const lng = Number((neighborhood.lng + (random() - .5) * .042).toFixed(6));
  const type = random() < .72 ? "adopt" : "pet";
  const age = 1 + Math.floor(random() * 14);
  const name = names[Math.floor(random() * names.length)];
  const selectedTraits = [];
  while (selectedTraits.length < 3) {
    const trait = traits[Math.floor(random() * traits.length)];
    if (!selectedTraits.includes(trait)) selectedTraits.push(trait);
  }
  const breed = breeds[Math.floor(random() * breeds.length)];
  return {
    id: `cat-${digest.slice(0, 16)}`,
    name,
    age: `${age} yr${age === 1 ? "" : "s"}`,
    breed,
    distance: Number(milesBetween(origin, [lat, lng]).toFixed(1)),
    lat,
    lng,
    shelter: shelters[Math.floor(random() * shelters.length)],
    neighborhood: neighborhood.name,
    type,
    vibe: 72 + Math.floor(random() * 28),
    image: `assets/cats/generated/${digest.slice(0, 16)}.webp`,
    tags: selectedTraits,
    bio: `${name} is a ${breed.toLowerCase()} with a big personality and a love of cozy company, sunny windows, and slow introductions.`,
    fee: type === "adopt" ? `$${100 + Math.floor(random() * 7) * 25} adoption fee` : "Free supervised visit",
    source_url: candidate.sourceUrl,
    source: candidate.provider,
    demo: true,
    origin_api_id: candidate.id,
  };
}

async function downloadProfile(profile) {
  const outputPath = join(process.cwd(), profile.image);
  try {
    await access(outputPath);
    return profile;
  } catch {}

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(profile.source_url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`image status ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 3_000) throw new Error("image was unexpectedly small");
      await sharp(bytes, { animated: false }).rotate().resize(720, 600, { fit: "cover", position: "attention" }).webp({ quality: 70 }).toFile(outputPath);
      return profile;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, attempt * 300));
    }
  }
  throw lastError;
}

await mkdir(imageDirectory, { recursive: true });
await mkdir(dataDirectory, { recursive: true });

if (process.env.CAT_REFRESH !== "1") {
  try {
    const existing = JSON.parse(await readFile(outputFile, "utf8"));
    if (Array.isArray(existing.cats) && existing.cats.length >= targetCount) {
      const retainedCats = existing.cats.slice(0, targetCount);
      const usedImages = new Set(retainedCats.map(cat => cat.image.split("/").pop()));
      for (const filename of await readdir(imageDirectory)) {
        if (filename.endsWith(".webp") && !usedImages.has(filename)) await unlink(join(imageDirectory, filename));
      }
      console.log(`Existing catalog already contains ${retainedCats.length} cats; no API refresh needed.`);
      process.exit(0);
    }
  } catch {}
}

console.log("Fetching the public cat catalogs…");
const cataas = await fetchJson("https://cataas.com/api/cats?limit=2500&skip=0");
const catApiPages = await Promise.all([0, 1, 2].map(page => fetchJson(
  `https://api.thecatapi.com/v1/images/search?limit=100&page=${page}&order=ASC&mime_types=jpg,png`,
  { "x-api-key": "DEMO-API-KEY" },
)));
const candidates = [
  ...cataas.map(cat => ({ id: cat.id, tags: cat.tags, provider: "Cataas", sourceUrl: `https://cataas.com/cat/${cat.id}` })),
  ...catApiPages.flat().map(cat => ({ id: cat.id, tags: cat.breeds?.map(breed => breed.name) || [], provider: "The Cat API", sourceUrl: cat.url })),
].filter(candidate => candidate.id && candidate.sourceUrl)
  .filter((candidate, index, all) => all.findIndex(item => `${item.provider}:${item.id}` === `${candidate.provider}:${candidate.id}`) === index)
  .sort((a, b) => hash(`${a.provider}:${a.id}`).localeCompare(hash(`${b.provider}:${b.id}`)));

if (candidates.length < targetCount) throw new Error(`Cat APIs returned only ${candidates.length} unique images; ${targetCount} are required.`);
console.log(`Found ${candidates.length} unique cat-photo candidates.`);

const profiles = candidates.map(buildProfile);
const successful = [];
let cursor = 0;
while (successful.length < targetCount && cursor < profiles.length) {
  const remaining = targetCount - successful.length;
  const batch = profiles.slice(cursor, cursor + Math.max(remaining + 80, 140));
  cursor += batch.length;
  const downloaded = await mapLimit(batch, 10, downloadProfile);
  successful.push(...downloaded.filter(result => result && !result.error));
  console.log(`Prepared ${Math.min(successful.length, targetCount)} of ${targetCount} cat photos…`);
}

if (successful.length < targetCount) throw new Error(`Only ${successful.length} cat photos downloaded successfully.`);
const cats = successful.slice(0, targetCount);
const usedImages = new Set(cats.map(cat => cat.image.split("/").pop()));
for (const filename of await readdir(imageDirectory)) {
  if (filename.endsWith(".webp") && !usedImages.has(filename)) await unlink(join(imageDirectory, filename));
}
await writeFile(outputFile, `${JSON.stringify({
  providers: ["Cataas", "The Cat API"],
  generated_at: new Date().toISOString(),
  count: cats.length,
  note: "Generated profiles and Indianapolis-area geotags are fictional demo data; source_url identifies each photo.",
  cats,
}, null, 2)}\n`);

console.log(`Saved ${cats.length} generated cat profiles to data/generated-cats.json.`);
console.log(`Cached ${cats.length} normalized photos in assets/cats/generated/.`);
