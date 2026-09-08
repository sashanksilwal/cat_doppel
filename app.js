import { parks, locations } from "./data.js";

const $ = (s) => document.querySelector(s);
const storedGroups=JSON.parse(localStorage.getItem("parklens-search-groups") || "null");
const state = { query:"", category:"all", radius:500, center:locations["indianapolis, in"], imageDataUrl:null, saved:new Set(JSON.parse(localStorage.getItem("parklens-saved") || "[]")), searchGroups:storedGroups||{"Weekend ideas":[],"Photo inspiration":[]}, results:[] };
const cards = $("#cards"), layout = $("#resultsLayout"), toast = $("#toast");
let leafletMap,leafletLayer;

function miles(a,b){ const r=3959,p=Math.PI/180,dLat=(b[0]-a[0])*p,dLon=(b[1]-a[1])*p; const x=Math.sin(dLat/2)**2+Math.cos(a[0]*p)*Math.cos(b[0]*p)*Math.sin(dLon/2)**2; return 2*r*Math.asin(Math.sqrt(x)); }
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function tokenize(s){ return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }

async function typesenseSearch(){
  const endpoint=window.PARKLENS_CONFIG?.searchEndpoint;
  if(!endpoint || location.protocol==="file:") return null;
  const params=new URLSearchParams({q:state.query||"*",lat:String(state.center[0]),lng:String(state.center[1]),radius:String(state.radius),category:state.category});
  const res=state.imageDataUrl
    ?await fetch("/api/image-search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({image:state.imageDataUrl,q:state.query||"*",lat:state.center[0],lng:state.center[1],radius:state.radius,category:state.category})})
    :await fetch(`${endpoint}?${params}`);
  if(res.status===503)return null;
  if(!res.ok)throw new Error("Typesense search unavailable");
  const payload=await res.json();
  setSearchStatus(true);
  return payload.hits.map(h=>({...h.document,match:h.image_match??h.document.match,distance:Math.round(miles(state.center,[h.document.lat,h.document.lng]))}));
}

function setSearchStatus(live){
  const title=$("#sourceTitle"),detail=$("#sourceDetail"); if(!title||!detail)return;
  title.textContent=live?"Typesense connected":"Local demo mode";
  detail.textContent=live?"Live geo + text search":"8 cached park records";
  $("#sourceNote")?.classList.toggle("offline",!live);
}

function demoSearch(){
  const terms=tokenize(state.query);
  return parks.map(p=>{
    const distance=Math.round(miles(state.center,[p.lat,p.lng]));
    const hay=tokenize([p.name,p.description,...p.tags].join(" "));
    const textScore=terms.length ? terms.filter(t=>hay.some(w=>w.includes(t)||t.includes(w))).length/terms.length : .55;
    let score=Math.round(55+textScore*30+Math.max(0,1-distance/1400)*12);
    return {...p,distance,match:score};
  }).filter(p=>p.distance<=state.radius && (state.category==="all"||p.category.includes(state.category)))
    .sort((a,b)=>b.match-a.match);
}

async function runSearch(scroll=false){
  state.query=$("#queryInput").value.trim(); state.radius=Number($("#radiusSelect").value);
  const loc=$("#locationInput").value.trim().toLowerCase(); if(locations[loc]) state.center=locations[loc];
  $("#searchButton").classList.add("loading");
  try { const liveResults=await typesenseSearch();state.results=liveResults||demoSearch();if(!liveResults)setSearchStatus(false); }
  catch(e){ state.results=demoSearch();setSearchStatus(false);showToast("Using local data. Typesense is unavailable"); }
  render(); $("#searchButton").classList.remove("loading"); if(scroll) $("#results").scrollIntoView({behavior:"smooth"});
}

function render(){
  cards.innerHTML=state.results.length?state.results.map((p,i)=>`<article class="park-card" style="--delay:${i*45}ms" data-id="${p.id}">
    <div class="card-image"><img src="${esc(p.image)}" alt="${esc(p.name)} landscape"><span class="match">${p.match}% match</span><button class="save ${state.saved.has(p.id)?"saved":""}" aria-label="Save ${esc(p.name)}">${state.saved.has(p.id)?"♥":"♡"}</button></div>
    <div class="card-body"><div class="card-meta"><span>${esc(p.state)}</span><span>•</span><span>${p.distance.toLocaleString()} mi away</span></div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="card-actions"><div class="tags">${p.category.slice(0,2).map(x=>`<span>${esc(x)}</span>`).join("")}</div><button class="details-button" type="button">Details →</button></div></div>
  </article>`).join(""):`<div class="empty-state"><b>No trails lead here yet.</b><span>Try a larger radius or a different landscape.</span></div>`;
  $("#savedCount").textContent=state.saved.size; $("#mapCount").textContent=`${state.results.length} place${state.results.length===1?"":"s"}`;
  $("#resultSummary").textContent=`${state.results.length} result${state.results.length===1?"":"s"} inside ${state.radius===3000?"any distance":state.radius.toLocaleString()+" miles"}`;
  const rawLocation=$("#locationInput").value.trim();
  $("#resultsTitle").textContent=`Parks near ${rawLocation==="Current location"?"you":rawLocation.split(",")[0]||"you"}`;
  renderMap();
  renderSavedGroups();
}

function renderMap(){
  if(!window.L||!$("#leafletMap"))return;
  if(!leafletMap){leafletMap=L.map("leafletMap",{zoomControl:true,attributionControl:true}).setView(state.center,5);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(leafletMap);leafletLayer=L.layerGroup().addTo(leafletMap);}
  leafletLayer.clearLayers();
  const locationName=$("#locationInput").value.trim()||"Search location";
  L.circle(state.center,{radius:state.radius*1609.344,color:"#c83f5d",weight:1,dashArray:"5 6",fillColor:"#c83f5d",fillOpacity:.035,interactive:false}).addTo(leafletLayer);
  const originIcon=L.divIcon({className:"origin-marker",html:`<span></span><b>${esc(locationName)}</b>`,iconSize:[180,36],iconAnchor:[12,18]});
  L.marker(state.center,{icon:originIcon,zIndexOffset:1000}).bindPopup(`<b>Starting near</b><br>${esc(locationName)}`).addTo(leafletLayer);
  const points=[state.center,...state.results.map(p=>{const marker=L.circleMarker([p.lat,p.lng],{radius:8,color:"#fff",weight:3,fillColor:"#174a30",fillOpacity:1}).bindPopup(`<b>${esc(p.name)}</b><br>${p.distance.toLocaleString()} miles away`);marker.on("click",()=>document.querySelector(`.park-card[data-id="${p.id}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}));marker.addTo(leafletLayer);return [p.lat,p.lng];})];
  if(points.length)leafletMap.fitBounds(points,{padding:[45,45],maxZoom:7});else leafletMap.setView(state.center,5);
  setTimeout(()=>leafletMap.invalidateSize(),0);
}

function persistGroups(){localStorage.setItem("parklens-search-groups",JSON.stringify(state.searchGroups));}
function renderSavedGroups(){
  const host=$("#savedGroups");if(!host)return;
  const entries=Object.entries(state.searchGroups);
  host.innerHTML=entries.map(([group,searches])=>`<section class="search-group"><div class="group-heading"><h3>${esc(group)}</h3><span>${searches.length} saved</span></div>${searches.length?`<div class="saved-search-row">${searches.map(search=>{const park=parks.find(p=>p.id===search.resultIds?.[0])||parks[0];return `<article class="saved-search-card" data-search-id="${search.id}" data-group="${esc(group)}"><img src="${esc(park.image)}" alt=""><button class="remove-saved-search" aria-label="Remove ${esc(search.name)}">×</button><div><b>${esc(search.name)}</b><span>${esc(search.location)} · ${search.radius.toLocaleString()} mi</span><small>${search.resultIds?.length||0} matching parks</small></div></article>`}).join("")}</div>`:`<button class="empty-group" data-empty-group="${esc(group)}">Save the current search here <span>→</span></button>`}</section>`).join("");
}

function openSaveDialog(preselected){
  const select=$("#savedSearchGroup");select.innerHTML=Object.keys(state.searchGroups).map(name=>`<option value="${esc(name)}" ${name===preselected?"selected":""}>${esc(name)}</option>`).join("")+`<option value="__new__">＋ New collection</option>`;
  $("#savedSearchName").value=state.query||`Parks near ${$("#locationInput").value.split(",")[0]}`;
  $("#newGroupField").hidden=true;$("#newGroupName").required=false;$("#saveSearchDialog").showModal();
}

function saveCurrentSearch(){
  let group=$("#savedSearchGroup").value;
  if(group==="__new__"){group=$("#newGroupName").value.trim();if(!group)return;state.searchGroups[group]??=[];}
  state.searchGroups[group].unshift({id:String(Date.now()),name:$("#savedSearchName").value.trim(),query:state.query,location:$("#locationInput").value,radius:state.radius,category:state.category,resultIds:state.results.map(p=>p.id),savedAt:new Date().toISOString()});
  state.searchGroups[group]=state.searchGroups[group].slice(0,12);persistGroups();renderSavedGroups();showToast(`Saved to ${group}`);
}

function runSavedSearch(search){
  $("#queryInput").value=search.query;$("#locationInput").value=search.location;$("#radiusSelect").value=String(search.radius);state.category=search.category;
  document.querySelectorAll(".filter").forEach(button=>{const active=button.dataset.filter===search.category;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));});runSearch(true);
}

function showToast(msg){ toast.textContent=msg;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2600); }
function save(id){ state.saved.has(id)?state.saved.delete(id):state.saved.add(id);localStorage.setItem("parklens-saved",JSON.stringify([...state.saved]));render(); }

function openDetails(id){
  const p=state.results.find(item=>item.id===id) || parks.find(item=>item.id===id); if(!p)return;
  $("#dialogContent").innerHTML=`<img class="dialog-hero" src="${esc(p.image)}" alt="${esc(p.name)} landscape"><div class="dialog-copy"><div class="card-meta"><span>${esc(p.state)}</span><span>•</span><span>${p.distance.toLocaleString()} mi away</span></div><h2>${esc(p.name)}</h2><p>${esc(p.description)}</p><div class="dialog-facts"><div><b>Search match</b><span>${p.match}%</span></div><div><b>Landscapes</b><span>${p.category.map(esc).join(", ")}</span></div></div></div>`;
  $("#parkDialog").showModal();
}
cards.addEventListener("click",e=>{const card=e.target.closest(".park-card");if(!card)return;const b=e.target.closest(".save");if(b)return save(card.dataset.id);if(e.target.closest(".details-button"))openDetails(card.dataset.id);});
$("#searchButton").addEventListener("click",()=>runSearch(true));
$("#queryInput").addEventListener("keydown",e=>{if(e.key==="Enter")runSearch(true)});
document.querySelectorAll(".suggestions button").forEach(b=>b.onclick=()=>{$("#queryInput").value=b.dataset.query;runSearch(true)});
document.querySelectorAll(".filter").forEach(b=>b.onclick=()=>{const previous=document.querySelector(".filter.active");previous?.classList.remove("active");previous?.setAttribute("aria-pressed","false");b.classList.add("active");b.setAttribute("aria-pressed","true");state.category=b.dataset.filter;runSearch();});
document.querySelectorAll(".view-toggle button").forEach(b=>b.onclick=()=>{const previous=document.querySelector(".view-toggle .active");previous?.classList.remove("active");previous?.setAttribute("aria-pressed","false");b.classList.add("active");b.setAttribute("aria-pressed","true");layout.classList.toggle("grid-only",b.dataset.view==="grid");layout.classList.toggle("map-only",b.dataset.view==="map");setTimeout(()=>leafletMap?.invalidateSize(),120);});
$("#locateButton").onclick=()=>navigator.geolocation?.getCurrentPosition(pos=>{state.center=[pos.coords.latitude,pos.coords.longitude];$("#locationInput").value="Current location";runSearch();showToast("Searching from your current location");},()=>showToast("Location permission wasn’t available"));
$("#centerMapButton").onclick=()=>{leafletMap?.setView(state.center,8,{animate:true});setTimeout(()=>{leafletLayer?.eachLayer(layer=>{if(layer instanceof L.Marker)layer.openPopup();});},350);};

const input=$("#imageInput"),zone=$("#uploadZone"),preview=$("#uploadPreview"),remove=$("#removeImage");
function loadImage(file){
  if(!file?.type.match(/^image\/(jpeg|png|webp)$/))return showToast("Choose a JPEG, PNG, or WebP image");
  if(file.size>5_000_000)return showToast("Choose an image smaller than 5 MB");
  const reader=new FileReader();
  reader.onload=()=>{state.imageDataUrl=reader.result;preview.src=reader.result;preview.hidden=false;$("#uploadEmpty").hidden=true;remove.hidden=false;showToast("Finding visually similar parks");runSearch();};
  reader.readAsDataURL(file);
}
input.onchange=()=>loadImage(input.files[0]);
zone.ondragover=e=>{e.preventDefault();zone.classList.add("drag")};zone.ondragleave=()=>zone.classList.remove("drag");zone.ondrop=e=>{e.preventDefault();zone.classList.remove("drag");loadImage(e.dataTransfer.files[0])};
remove.onclick=e=>{e.preventDefault();e.stopPropagation();input.value="";preview.hidden=true;preview.src="";$("#uploadEmpty").hidden=false;remove.hidden=true;state.imageDataUrl=null;runSearch();};
$("#savedButton").onclick=()=>showToast(state.saved.size?`${state.saved.size} dream place${state.saved.size===1?"":"s"} saved on this device`:"Save a place with the heart button");
$("#dialogClose").onclick=()=>$("#parkDialog").close();
$("#parkDialog").addEventListener("click",e=>{if(e.target===$("#parkDialog"))$("#parkDialog").close();});
$("#saveSearchButton").onclick=()=>openSaveDialog();
$("#newGroupButton").onclick=()=>{openSaveDialog();$("#savedSearchGroup").value="__new__";$("#savedSearchGroup").dispatchEvent(new Event("change"));};
$("#savedSearchGroup").onchange=()=>{const isNew=$("#savedSearchGroup").value==="__new__";$("#newGroupField").hidden=!isNew;$("#newGroupName").required=isNew;if(isNew)$("#newGroupName").focus();};
$("#saveSearchForm").onsubmit=()=>saveCurrentSearch();
$("#saveDialogClose").onclick=$("#saveDialogCancel").onclick=()=>$("#saveSearchDialog").close();
$("#savedGroups").onclick=e=>{const remove=e.target.closest(".remove-saved-search");const card=e.target.closest(".saved-search-card");const empty=e.target.closest(".empty-group");if(empty)return openSaveDialog(empty.dataset.emptyGroup);if(!card)return;if(remove){state.searchGroups[card.dataset.group]=state.searchGroups[card.dataset.group].filter(s=>s.id!==card.dataset.searchId);persistGroups();renderSavedGroups();return;}const search=state.searchGroups[card.dataset.group].find(s=>s.id===card.dataset.searchId);if(search)runSavedSearch(search);};

runSearch();
