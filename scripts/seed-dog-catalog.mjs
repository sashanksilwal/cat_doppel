import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const targetCount = Math.max(2048, Number(process.env.DOG_CATALOG_SIZE) || 2048);
const imageDirectory = join(process.cwd(), "assets", "dogs", "generated");
const dataDirectory = join(process.cwd(), "data");
const outputFile = join(dataDirectory, "generated-dogs.json");
const origin = [39.7684, -86.1581];

const names = [
  "Ace", "Alfie", "Amos", "Annie", "Archie", "Aspen", "Bailey", "Basil", "Bean", "Bella", "Benny", "Birdie",
  "Blue", "Bowie", "Bruno", "Buddy", "Callie", "Cash", "Charlie", "Chester", "Chloe", "Cleo", "Clover", "Coco",
  "Cooper", "Daisy", "Dexter", "Dolly", "Duke", "Eddie", "Ellie", "Finn", "Frankie", "Freya", "George", "Gigi",
  "Ginger", "Goose", "Gracie", "Gus", "Hazel", "Henry", "Honey", "Indie", "Ivy", "Jack", "Jasper", "Joey",
  "Josie", "June", "Koda", "Leo", "Lily", "Louie", "Lucky", "Lucy", "Luna", "Mabel", "Maggie", "Maisie",
  "Maple", "Marley", "Max", "Milo", "Minnie", "Mochi", "Molly", "Murphy", "Nala", "Nellie", "Nico", "Nova",
  "Olive", "Ollie", "Oscar", "Otis", "Penny", "Pepper", "Piper", "Poppy", "Remi", "Riley", "Rosie", "Ruby",
  "Scout", "Simba", "Sunny", "Teddy", "Theo", "Tilly", "Toby", "Wally", "Winnie", "Ziggy", "Zoe", "Zuko",
];
const traits = ["Affectionate", "Adventure buddy", "Ball chaser", "Bright", "Calm", "Clever", "Cuddly", "Curious", "Easygoing", "Foodie", "Friendly", "Gentle", "Goofy", "Good listener", "Lap dog", "Loyal", "Mellow", "Playful", "Polite", "Quick learner", "Quiet", "Social", "Sniff expert", "Sweet", "Trail buddy"];
const shelters = ["Doppel Foster Network", "Circle City Dog Collective", "Northside Rescue Partners", "Indy Second Chance", "Hoosier Homebound Dogs", "Paws Around Town", "Happy Tails Foster Team", "Central Indiana Dog Friends"];
const neighborhoods = [
  { name: "Downtown", lat: 39.7684, lng: -86.1581 },
  { name: "Broad Ripple", lat: 39.8696, lng: -86.1411 },
  { name: "Irvington", lat: 39.7681, lng: -86.0918 },
  { name: "Fountain Square", lat: 39.7526, lng: -86.1401 },
  { name: "Speedway", lat: 39.7711, lng: -86.2147 },
  { name: "Meridian–Kessler", lat: 39.8540, lng: -86.1520 },
  { name: "Garfield Park", lat: 39.7350, lng: -86.1740 },
  { name: "Beech Grove", lat: 39.7212, lng: -86.0886 },
  { name: "Castleton", lat: 39.8845, lng: -86.0563 },
  { name: "Carmel", lat: 39.9784, lng: -86.1180 },
  { name: "Fishers", lat: 39.9568, lng: -86.0134 },
  { name: "Greenwood", lat: 39.6137, lng: -86.1067 },
  { name: "Zionsville", lat: 39.9509, lng: -86.2619 },
  { name: "Plainfield", lat: 39.7042, lng: -86.3994 },
  { name: "Lawrence", lat: 39.8387, lng: -86.0253 },
  { name: "Nora", lat: 39.9125, lng: -86.1380 },
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

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  const payload = await response.json();
  if (payload.status !== "success") throw new Error(`Dog API rejected ${url}`);
  return payload.message;
}

function breedFromUrl(url) {
  const key = new URL(url).pathname.match(/\/breeds\/([^/]+)\//)?.[1] || "mixed";
  const [family, ...specific] = key.split("-");
  const words = specific.length ? [...specific, family] : [family];
  return { key, label: words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") };
}

function milesBetween(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b[0] - a[0]) * radians;
  const dLng = (b[1] - a[1]) * radians;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin(dLng / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(value));
}

function buildProfile(sourceUrl) {
  const digest = hash(sourceUrl);
  const random = randomFor(sourceUrl);
  const breed = breedFromUrl(sourceUrl);
  const neighborhood = neighborhoods[Math.floor(random() * neighborhoods.length)];
  const lat = Number((neighborhood.lat + (random() - .5) * .035).toFixed(6));
  const lng = Number((neighborhood.lng + (random() - .5) * .042).toFixed(6));
  const type = random() < .72 ? "adopt" : "pet";
  const age = 1 + Math.floor(random() * 11);
  const name = names[Math.floor(random() * names.length)];
  const selectedTraits = [];
  while (selectedTraits.length < 3) {
    const trait = traits[Math.floor(random() * traits.length)];
    if (!selectedTraits.includes(trait)) selectedTraits.push(trait);
  }
  const image = `assets/dogs/generated/${digest.slice(0, 16)}.webp`;
  return {
    id: `api-${digest.slice(0, 16)}`,
    name,
    age: `${age} yr${age === 1 ? "" : "s"}`,
    breed: breed.label,
    distance: Number(milesBetween(origin, [lat, lng]).toFixed(1)),
    lat,
    lng,
    shelter: shelters[Math.floor(random() * shelters.length)],
    neighborhood: neighborhood.name,
    type,
    vibe: 72 + Math.floor(random() * 28),
    photo: "0 0",
    image,
    tags: selectedTraits,
    bio: `${name} is a ${selectedTraits[0].toLowerCase()} ${breed.label.toLowerCase()} who enjoys good company, neighborhood walks, and finding the perfect nap spot.`,
    fee: type === "adopt" ? `$${125 + Math.floor(random() * 6) * 25} adoption fee` : "Free supervised visit",
    source_url: sourceUrl,
    source: "Dog CEO API",
    demo: true,
    api_breed_key: breed.key,
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
      if (bytes.length < 4_000) throw new Error("image was unexpectedly small");
      await sharp(bytes).rotate().resize(640, 520, { fit: "cover", position: "attention" }).webp({ quality: 68 }).toFile(outputPath);
      return profile;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError;
}

await mkdir(imageDirectory, { recursive: true });
await mkdir(dataDirectory, { recursive: true });

if (process.env.DOG_REFRESH !== "1") {
  try {
    const existing = JSON.parse(await readFile(outputFile, "utf8"));
    if (Array.isArray(existing.dogs) && existing.dogs.length >= targetCount) {
      const retainedDogs = existing.dogs.slice(0, targetCount);
      const usedImages = new Set(retainedDogs.map(dog => dog.image.split("/").pop()));
      for (const filename of await readdir(imageDirectory)) {
        if (filename.endsWith(".webp") && !usedImages.has(filename)) await unlink(join(imageDirectory, filename));
      }
      console.log(`Existing catalog already contains ${retainedDogs.length} dogs; no API refresh needed.`);
      process.exit(0);
    }
  } catch {}
}

console.log("Fetching the Dog CEO breed catalog…");
const breedMap = await fetchJson("https://dog.ceo/api/breeds/list/all");
const breedNames = Object.keys(breedMap).sort();
const imageLists = await mapLimit(breedNames, 10, async breed => fetchJson(`https://dog.ceo/api/breed/${breed}/images/random/50`));
const uniqueUrls = [...new Set(imageLists.flatMap(result => Array.isArray(result) ? result : []))]
  .sort((a, b) => hash(a).localeCompare(hash(b)));
if (uniqueUrls.length < targetCount) throw new Error(`Dog API returned only ${uniqueUrls.length} unique images; ${targetCount} are required.`);
console.log(`Found ${uniqueUrls.length} unique candidates across ${breedNames.length} breeds.`);

const profiles = uniqueUrls.map(buildProfile);
const successful = [];
let cursor = 0;
while (successful.length < targetCount && cursor < profiles.length) {
  const remaining = targetCount - successful.length;
  const batch = profiles.slice(cursor, cursor + Math.max(remaining + 40, 120));
  cursor += batch.length;
  const downloaded = await mapLimit(batch, 10, downloadProfile);
  successful.push(...downloaded.filter(result => result && !result.error));
  console.log(`Prepared ${Math.min(successful.length, targetCount)} of ${targetCount} dog photos…`);
}

if (successful.length < targetCount) throw new Error(`Only ${successful.length} dog photos downloaded successfully.`);
const dogs = successful.slice(0, targetCount);
const usedImages = new Set(dogs.map(dog => dog.image.split("/").pop()));
for (const filename of await readdir(imageDirectory)) {
  if (filename.endsWith(".webp") && !usedImages.has(filename)) await unlink(join(imageDirectory, filename));
}
await writeFile(outputFile, `${JSON.stringify({
  provider: "Dog CEO API",
  generated_at: new Date().toISOString(),
  count: dogs.length,
  note: "Generated profiles and Indianapolis-area geotags are fictional demo data; source_url identifies each photo.",
  dogs,
}, null, 2)}\n`);

console.log(`Saved ${dogs.length} generated dog profiles to data/generated-dogs.json.`);
console.log(`Cached ${dogs.length} normalized photos in assets/dogs/generated/.`);
