import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root=process.cwd();
try{const source=await readFile(join(root,".env"),"utf8");for(const line of source.split(/\r?\n/)){const match=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,"");}}catch{}

const host=process.env.TYPESENSE_HOST,key=process.env.TYPESENSE_ADMIN_KEY;
if(!host||!key)throw new Error("Set TYPESENSE_HOST and TYPESENSE_ADMIN_KEY in .env first.");
const npsKey=process.env.NPS_API_KEY||"DEMO_KEY";
const response=await fetch("https://developer.nps.gov/api/v1/parks?limit=500&fields=images",{headers:{"X-Api-Key":npsKey}});
if(!response.ok)throw new Error(`NPS request failed: ${response.status}`);
const payload=await response.json();
const cleanText=value=>String(value||"").replace(new RegExp(`\\s*${String.fromCharCode(8212)}\\s*`,"g"),", ");

function categories(park,text){
  const values=[];const activityNames=park.activities.map(a=>a.name.toLowerCase());
  if(/mountain|climb|alpine|summit|canyon|volcano/.test(text)||activityNames.some(x=>/climb|mountain/.test(x)))values.push("Mountains");
  if(/lake|river|ocean|coast|waterfall|beach|island|wetland/.test(text)||activityNames.some(x=>/boat|canoe|kayak|fish|swim|paddl/.test(x)))values.push("Water");
  if(/forest|woodland|tree|rainforest/.test(text)||activityNames.some(x=>/hiking|wildlife/.test(x)))values.push("Forest");
  if(/desert|dune|arid|badland|sandstone/.test(text))values.push("Desert");
  return values.length?values:["Outdoors"];
}

const documents=payload.data.flatMap((park,index)=>{
  const lat=Number(park.latitude),lng=Number(park.longitude),image=park.images?.[0]?.url;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||!image)return [];
  const tags=[...park.activities.map(a=>cleanText(a.name)),...park.topics.map(t=>cleanText(t.name))].filter(Boolean);
  const text=`${park.fullName} ${park.description} ${tags.join(" ")}`.toLowerCase();
  const category=categories(park,text);
  return [{id:park.id,name:cleanText(park.fullName),state:park.states||"United States",lat,lng,description:cleanText(park.description||"Explore this National Park Service place."),tags,category,accessible:/accessible|accessibility/.test(text),location:[lat,lng],image,match:Math.max(70,96-(index%22)),color:"#315c43"}];
});

const cachePath=join(root,"nps-parks.json");
await writeFile(cachePath,JSON.stringify({source:"National Park Service API",updatedAt:new Date().toISOString(),count:documents.length,parks:documents},null,2));
const base=`${process.env.TYPESENSE_PROTOCOL||"https"}://${host}:${process.env.TYPESENSE_PORT||"443"}`;
const collection=process.env.TYPESENSE_COLLECTION||"parks";
for(const seedId of ["smokies","mammoth","newriver","sleepingbear","shenandoah","isleroyale","badlands","acadia"]){
  await fetch(`${base}/collections/${collection}/documents/${seedId}`,{method:"DELETE",headers:{"X-TYPESENSE-API-KEY":key}});
}
const imported=await fetch(`${base}/collections/${collection}/documents/import?action=upsert`,{method:"POST",headers:{"X-TYPESENSE-API-KEY":key,"content-type":"text/plain"},body:documents.map(x=>JSON.stringify(x)).join("\n")});
if(!imported.ok)throw new Error(`Typesense import failed: ${await imported.text()}`);
const results=(await imported.text()).trim().split("\n").map(JSON.parse);const failures=results.filter(result=>!result.success);
if(failures.length)throw new Error(`${failures.length} NPS records failed to import.`);
console.log(`Imported ${documents.length} NPS places into Typesense and nps-parks.json.`);
