import { cats as fallbackCats, dogs } from "./data.js";

let cats = [...fallbackCats];
try {
  const response = await fetch(new URL("./data/generated-cats.json", import.meta.url));
  if (response.ok) cats = (await response.json()).cats || [];
} catch {}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const savedKey = "doppel-saved-pets";
const matchTaglineKey = "doppel-match-taglines";
const defaultMatchTaglines = {
  "dog:adopt": "Golden energy, close to home",
  "dog:pet": "Friendly dogs who welcome visitors",
  "cat:adopt": "Feline energy, close to home",
  "cat:pet": "Friendly cats who welcome visitors",
};
let storedMatchTaglines = {};
try {
  storedMatchTaglines = JSON.parse(localStorage.getItem(matchTaglineKey) || "{}");
} catch {}
const localCatalogs = { cat: cats, dog: dogs };
let dogCatalog = cats.slice(0, 24);
const dogCache = new Map([...dogs, ...cats].map(pet => [pet.id, pet]));

const state = {
  screen: "camera",
  species: "cat",
  mode: "adopt",
  query: "",
  saved: new Set(JSON.parse(localStorage.getItem(savedKey) || "[]")),
  stream: null,
  facingMode: "user",
  busy: false,
  selectedDog: null,
  matchedDog: null,
  searchResults: null,
  dataSource: "local",
  view: "list",
  radius: 10,
  totalFound: cats.length,
  currentPage: 1,
  lastMatchedDogId: null,
  matchTaglines: { ...defaultMatchTaglines, ...storedMatchTaglines },
};

const els = {
  body: document.body,
  dogList: $("#dogList"),
  dogMap: $("#dogMap"),
  displayBar: $(".display-bar"),
  dogResultCount: $("#dogResultCount"),
  discoverTitle: $("#discoverTitle"),
  discoverKicker: $(".discover-header .section-kicker"),
  discoverTools: $(".discover-tools"),
  matchBanner: $("#matchBanner"),
  matchBannerLabel: $("#matchBannerLabel"),
  matchTagline: $("#matchTagline"),
  cameraFrame: $("#cameraFrame"),
  cameraIntro: $("#cameraIntro"),
  cameraFeed: $("#cameraFeed"),
  cameraFallback: $("#cameraFallback"),
  capturePreview: $("#capturePreview"),
  captureCanvas: $("#captureCanvas"),
  scanLayer: $("#scanLayer"),
  matchResult: $("#matchResult"),
  toast: $("#toast"),
};

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function icon(name) {
  return `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function dogPhotoStyle(dog) {
  if (/^assets\/(?:dogs|cats)\/(?:generated\/)?[a-z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(dog.image || "")) {
    return `--dog-image:url(${dog.image});--dog-size:cover;--dog-position:center`;
  }
  return `--photo:${esc(dog.photo)}`;
}

function persistSaved() {
  localStorage.setItem(savedKey, JSON.stringify([...state.saved]));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function updateMatchBannerCopy() {
  const key = `${state.species}:${state.mode}`;
  els.matchBannerLabel.textContent = state.mode === "adopt" ? "YOUR TOP MATCHES" : "NEARBY PLAYDATES";
  els.matchTagline.value = state.matchTaglines[key] || defaultMatchTaglines[key];
}

function updateSpeciesCopy() {
  const singular = state.species;
  const plural = `${singular}s`;
  const title = singular.charAt(0).toUpperCase() + singular.slice(1);
  els.body.dataset.species = singular;
  $("#speciesEyebrow").textContent = `${title.toUpperCase()} DOPPELGÄNGER`;
  $("#cameraSpeciesCopy").textContent = `Take a selfie. We’ll match your vibe with ${plural} near you.`;
  $("#scanSpeciesCopy").textContent = `Reading your ${singular} energy…`;
  $("#matchCtaCopy").textContent = `Meet ${plural} like me`;
  $("#photoSpeciesLabel").textContent = `YOUR ${title.toUpperCase()} DOPPELGÄNGER`;
  $("#dogSearch").placeholder = `Search ${plural}`;
  $("#dogSearch").setAttribute("aria-label", `Search nearby ${plural}`);
  $("#leafletMap").setAttribute("aria-label", `Interactive map of nearby ${plural}`);
  document.title = `Doppel — Meet your ${singular} doppelgänger`;
  updateMatchBannerCopy();
}

function saveMatchTagline() {
  const key = `${state.species}:${state.mode}`;
  const fallback = defaultMatchTaglines[key];
  const nextTagline = els.matchTagline.value.trim().slice(0, 52) || fallback;
  els.matchTagline.value = nextTagline;
  if (nextTagline === state.matchTaglines[key]) return;
  state.matchTaglines[key] = nextTagline;
  localStorage.setItem(matchTaglineKey, JSON.stringify(state.matchTaglines));
  showToast("Your match message is saved");
}

function favoriteButton(dog, extraClass = "") {
  const saved = state.saved.has(dog.id);
  return `<button class="favorite-button ${saved ? "saved" : ""} ${extraClass}" type="button" data-favorite="${dog.id}" aria-label="${saved ? "Remove" : "Save"} ${esc(dog.name)}">${icon("heart")}</button>`;
}

function dogCard(dog, index) {
  const action = dog.type === "adopt" ? "Meet" : "Visit";
  return `<article class="dog-card" data-dog-id="${dog.id}" style="--delay:${index * 55}ms">
    <div class="dog-card-photo dog-photo" style="${dogPhotoStyle(dog)}">
      <span class="distance-pill">${dog.distance.toFixed(1)} MI AWAY</span>
      ${favoriteButton(dog)}
      <span class="vibe-chip">✦ ${dog.vibe}% VIBE MATCH</span>
    </div>
    <div class="dog-card-body">
      <div class="dog-title-row"><h3>${esc(dog.name)}</h3><span>${esc(dog.age)}</span></div>
      <p class="breed">${esc(dog.breed)}</p>
      <div class="dog-tags">${dog.tags.slice(0, 2).map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>
      <div class="card-footer">
        <div class="shelter">${icon("pin")}<span>${esc(dog.shelter)}</span></div>
        <button class="meet-button" type="button" data-open-dog="${dog.id}">${action}</button>
      </div>
    </div>
  </article>`;
}

function renderProfile() {
  const species = state.species === "cat" ? "cat" : "dog";
  const exampleBreed = state.species === "cat" ? "Maine Coon mix" : "Golden retriever mix";
  els.dogList.innerHTML = `<section class="profile-sheet">
    <div class="profile-hero"><div class="profile-avatar">SA</div><span class="profile-paw">${icon("paw")}</span></div>
    <h3>Alex’s ${species} energy</h3>
    <p>${exampleBreed}</p>
    <div class="profile-meter"><span style="width:96%"></span></div>
    <div class="profile-stats">
      <div><b>${state.saved.size}</b><span>Saved friends</span></div>
      <div><b>${state.totalFound.toLocaleString()}</b><span>Nearby ${species}s</span></div>
      <div><b>96%</b><span>Top match</span></div>
    </div>
    <button type="button" data-screen-link="camera">Take a new Doppel</button>
  </section>`;
}

function visibleDogResults() {
  let visible = dogCatalog;
  if (state.screen === "saved") visible = [...state.saved].map(id => dogCache.get(id)).filter(Boolean);
  else if (state.searchResults) visible = state.searchResults;
  else visible = dogCatalog.filter((dog) => dog.type === state.mode);

  if (state.query) {
    const q = state.query.toLowerCase();
    visible = visible.filter((dog) => [dog.name, dog.breed, dog.shelter, ...dog.tags].join(" ").toLowerCase().includes(q));
  }
  if (state.screen !== "saved") visible = visible.filter((pet) => Number(pet.distance) <= state.radius);
  return visible;
}

function renderDogs() {
  if (state.screen === "profile") {
    renderProfile();
    return;
  }

  const visible = visibleDogResults();
  const label = state.screen === "saved"
    ? `saved friend${visible.length === 1 ? "" : "s"}`
    : `${state.mode === "adopt" ? "adoptable" : "playdate"} ${state.species}${visible.length === 1 ? "" : "s"}`;
  els.dogResultCount.textContent = state.screen === "saved"
    ? `${visible.length} ${label}`
    : `Showing ${visible.length} of ${state.totalFound.toLocaleString()} ${label} within ${state.radius} mi`;

  els.dogList.innerHTML = visible.length
    ? visible.map(dogCard).join("")
    : `<div class="empty-dogs">${icon("paw")}<b>${state.screen === "saved" ? "No saved friends yet" : `No ${state.species}s found`}</b><span>${state.screen === "saved" ? "Tap a heart when a pet catches your eye." : "Try another name, breed, or personality."}</span></div>`;
  els.dogList.hidden = state.view === "map";
  els.dogMap.hidden = state.view !== "map";
  if (state.view === "map") renderMap(visible);
}

let leafletMap;
let markerLayer;

function initializeMap() {
  if (leafletMap || !window.L) return;
  leafletMap = L.map("leafletMap", { zoomControl: true, attributionControl: true }).setView([39.7684, -86.1581], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(leafletMap);
  markerLayer = L.layerGroup().addTo(leafletMap);
}

function renderMap(visible = visibleDogResults()) {
  initializeMap();
  if (!leafletMap || !markerLayer) return;
  markerLayer.clearLayers();

  const origin = [39.7684, -86.1581];
  L.circle(origin, {
    radius: state.radius * 1609.344,
    color: "#c9c600",
    weight: 2,
    dashArray: "6 7",
    fillColor: "#fffc00",
    fillOpacity: .06,
    interactive: false,
  }).addTo(markerLayer);
  L.circleMarker(origin, { radius: 7, color: "#fff", weight: 3, fillColor: "#10110f", fillOpacity: 1 })
    .bindTooltip("Your search area", { direction: "top" })
    .addTo(markerLayer);

  const points = [origin];
  visible.forEach((dog) => {
    if (!Number.isFinite(dog.lat) || !Number.isFinite(dog.lng)) return;
    points.push([dog.lat, dog.lng]);
    const marker = L.marker([dog.lat, dog.lng], {
      title: `${dog.name}, ${dog.distance.toFixed(1)} miles away`,
      icon: L.divIcon({
        className: "dog-marker",
        html: `<div class="dog-map-marker"><div class="dog-photo" style="${dogPhotoStyle(dog)}"></div><span class="marker-vibe">${dog.vibe}</span></div>`,
        iconSize: [52, 57],
        iconAnchor: [26, 57],
        popupAnchor: [0, -53],
      }),
    });
    marker.bindPopup(`<div class="map-popup"><b>${esc(dog.name)}</b><span>${esc(dog.breed)} · ${dog.distance.toFixed(1)} mi</span><button type="button" data-map-dog="${dog.id}">View profile</button></div>`);
    marker.addTo(markerLayer);
  });

  if (points.length > 1) leafletMap.fitBounds(points, { padding: [48, 48], maxZoom: 12 });
  else leafletMap.setView(origin, 11);
  setTimeout(() => leafletMap.invalidateSize(), 0);
}

function updateSavedCounts() {
  $("#sideSavedCount").textContent = state.saved.size;
  $("#mobileSavedCount").textContent = state.saved.size;
  $("#mobileSavedCount").classList.toggle("visible", state.saved.size > 0);
}

function setScreen(screen) {
  state.screen = screen;
  els.body.dataset.screen = screen;
  const compactCount = state.totalFound >= 1000 ? `${(state.totalFound / 1000).toFixed(1).replace(".0", "")}k` : state.totalFound;
  $(".nav-item[data-screen-link='nearby'] i").textContent = compactCount;
  $$('[data-screen-link]').forEach((button) => button.classList.toggle("active", button.dataset.screenLink === screen));

  els.discoverTools.hidden = screen === "saved" || screen === "profile";
  els.matchBanner.hidden = screen === "saved" || screen === "profile";
  els.displayBar.hidden = screen === "profile";

  if (screen === "saved") {
    els.discoverKicker.textContent = `${state.saved.size} SAVED FRIEND${state.saved.size === 1 ? "" : "S"}`;
    els.discoverTitle.textContent = "The ones you love";
  } else if (screen === "profile") {
    els.discoverKicker.textContent = "YOUR DOPPEL PROFILE";
    els.discoverTitle.textContent = "A very good human";
  } else {
    els.discoverKicker.textContent = `${state.totalFound.toLocaleString()} FRIENDS NEARBY${state.dataSource === "typesense" ? " · LIVE" : ""}`;
    els.discoverTitle.textContent = state.mode === "adopt" ? "Waiting to meet you" : state.species === "cat" ? "Ready for a cuddle" : "Ready for a playdate";
  }

  renderDogs();
  if (screen !== "camera" && window.innerWidth > 820) $("#discoverPanel").scrollTo({ top: 0, behavior: "smooth" });
}

function toggleFavorite(id) {
  const dog = dogCache.get(id);
  if (!dog) return;
  const willSave = !state.saved.has(id);
  willSave ? state.saved.add(id) : state.saved.delete(id);
  persistSaved();
  updateSavedCounts();
  renderDogs();

  const dialogFavorite = $(`#dogDialog [data-favorite="${id}"]`);
  if (dialogFavorite) {
    dialogFavorite.classList.toggle("saved", willSave);
    dialogFavorite.setAttribute("aria-label", `${willSave ? "Remove" : "Save"} ${dog.name}`);
  }
  showToast(willSave ? `${dog.name} saved to your favorites` : `${dog.name} removed from saved`);
}

function openDog(id) {
  const dog = dogCache.get(id);
  if (!dog) return;
  state.selectedDog = dog;
  const action = dog.type === "adopt" ? `Ask to meet ${dog.name}` : `Request a playdate`;
  $("#dogDialogContent").innerHTML = `<div class="dialog-photo dog-photo" style="${dogPhotoStyle(dog)}">
      <span class="dialog-vibe">✦ ${dog.vibe}% VIBE MATCH</span>
    </div>
    <div class="dialog-body">
      <div class="dialog-title">
        <div><h2>${esc(dog.name)}</h2><p>${esc(dog.age)} · ${esc(dog.breed)}</p></div>
        ${favoriteButton(dog, "dialog-favorite")}
      </div>
      <div class="dog-tags dialog-tags">${dog.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>
      <p>${esc(dog.bio)}</p>
      <div class="dialog-facts">
        <div><span>Hosted by</span><b>${esc(dog.shelter)}</b></div>
        <div><span>Neighborhood</span><b>${esc(dog.neighborhood)}</b></div>
        <div><span>Distance</span><b>${dog.distance.toFixed(1)} miles away</b></div>
        <div><span>Details</span><b>${esc(dog.fee)}</b></div>
      </div>
      ${dog.source_url ? `<p class="photo-credit">Photo supplied by <a href="${esc(dog.source_url)}" target="_blank" rel="noopener">${esc(dog.source || "the photo provider")}</a></p>` : ""}
      <button class="dialog-action" type="button" data-interest="${dog.id}">${action} ${icon("message")}</button>
    </div>`;
  $("#dogDialog").showModal();
}

function openInterest(id) {
  const dog = dogCache.get(id) || state.selectedDog;
  if (!dog) return;
  state.selectedDog = dog;
  $("#dogDialog").close();
  $("#interestDogName").textContent = dog.name;
  $("#interestDialog .section-kicker").textContent = dog.type === "adopt" ? "ONE STEP CLOSER" : "MAKE A NEW FRIEND";
  $("#interestMessage").value = dog.type === "adopt"
    ? `Hi! I’d love to learn more about ${dog.name} and arrange a visit.`
    : `Hi! I’d love to meet ${dog.name} for a supervised playdate.`;
  $("#interestDialog").showModal();
}

function stopCamera() {
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  els.cameraFrame.classList.remove("live-camera");
  els.cameraIntro.hidden = false;
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Live camera isn’t available here — upload a photo instead");
    return;
  }
  try {
    stopCamera();
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode, width: { ideal: 1280 }, height: { ideal: 1600 } },
      audio: false,
    });
    els.cameraFeed.srcObject = state.stream;
    els.cameraFeed.hidden = false;
    els.cameraFallback.hidden = true;
    els.capturePreview.hidden = true;
    els.cameraFrame.classList.add("live-camera");
    els.cameraIntro.hidden = true;
    $("#useCameraButton span").textContent = "Live";
    showToast("Camera ready — looking good!");
  } catch {
    showToast("Camera permission wasn’t available — you can still upload a selfie");
  }
}

function chooseDogMatch() {
  const candidates = dogCatalog.length ? dogCatalog : localCatalogs[state.species];
  const freshCandidates = candidates.filter((dog) => dog.id !== state.lastMatchedDogId);
  const pool = freshCandidates.length ? freshCandidates : candidates;
  const dog = pool[Math.floor(Math.random() * pool.length)];
  state.lastMatchedDogId = dog.id;
  return dog;
}

function showMatch(dog = chooseDogMatch()) {
  const traits = dog.tags?.slice(0, 2).join(" and ").toLowerCase();
  const reason = traits
    ? `${traits} — and ready for a new friend`
    : "a one-of-a-kind personality match nearby";

  state.matchedDog = dog;
  $(".match-dog", els.matchResult).setAttribute("style", dogPhotoStyle(dog));
  $(".match-dog", els.matchResult).setAttribute("aria-label", `Enlarge ${dog.name}'s photo`);
  $(".match-copy h2", els.matchResult).textContent = dog.breed;
  $(".match-copy p", els.matchResult).textContent = reason;
  $(".match-score strong", els.matchResult).textContent = Math.max(84, dog.vibe || 0);
  els.matchResult.hidden = false;
}

function renderSideRecommendation(dog = state.matchedDog) {
  const panel = $("#sideRecommendation");
  if (!dog) {
    panel.hidden = true;
    return;
  }
  $("#recommendationPhoto").setAttribute("style", dogPhotoStyle(dog));
  $("#recommendationName").textContent = dog.name;
  $("#recommendationBreed").textContent = dog.breed;
  $("#recommendationDetails").textContent = `${dog.distance.toFixed(1)} mi away · ${dog.shelter}`;
  $("#recommendationScore").textContent = `${Math.max(84, dog.vibe || 0)}%`;
  $("#recommendationProfileButton").dataset.openDog = dog.id;
  panel.hidden = false;
}

function showMatchedRecommendation() {
  const dog = state.matchedDog;
  if (!dog) return setScreen("nearby");
  if (state.searchResults) state.searchResults = [dog, ...state.searchResults.filter((pet) => pet.id !== dog.id)];
  else dogCatalog = [dog, ...dogCatalog.filter((pet) => pet.id !== dog.id)];
  setScreen("nearby");
  renderSideRecommendation(dog);
  if (window.innerWidth <= 820) $("#sideRecommendation").scrollIntoView({ behavior: "smooth", block: "start" });
}

const photoViewer = { scale: 1, x: 0, y: 0, pointers: new Map(), pinchDistance: 0, dragOffset: null };

function clampPhotoPan() {
  const stage = $("#photoDialogStage");
  const maxX = stage.clientWidth * (photoViewer.scale - 1) / 2;
  const maxY = stage.clientHeight * (photoViewer.scale - 1) / 2;
  photoViewer.x = Math.max(-maxX, Math.min(maxX, photoViewer.x));
  photoViewer.y = Math.max(-maxY, Math.min(maxY, photoViewer.y));
}

function renderPhotoZoom() {
  clampPhotoPan();
  $("#photoDialogImage").style.transform = `translate3d(${photoViewer.x}px, ${photoViewer.y}px, 0) scale(${photoViewer.scale})`;
  $("#photoZoomLevel").value = `${Math.round(photoViewer.scale * 100)}%`;
  $("#photoDialogStage").classList.toggle("can-pan", photoViewer.scale > 1);
}

function setPhotoZoom(scale) {
  photoViewer.scale = Math.max(1, Math.min(4, scale));
  if (photoViewer.scale === 1) photoViewer.x = photoViewer.y = 0;
  renderPhotoZoom();
}

function openPhotoViewer(dog) {
  if (!dog) return;
  const image = $("#photoDialogImage");
  image.setAttribute("style", dogPhotoStyle(dog));
  image.setAttribute("aria-label", `${dog.name}, ${dog.breed}`);
  $("#photoDialogTitle").textContent = `${dog.name} · ${dog.breed}`;
  photoViewer.scale = 1;
  photoViewer.x = photoViewer.y = 0;
  photoViewer.pointers.clear();
  renderPhotoZoom();
  $("#photoDialog").showModal();
}

function analyzePhoto() {
  if (state.busy) return;
  state.busy = true;
  els.cameraFrame.classList.add("captured");
  els.scanLayer.classList.add("active");
  els.matchResult.hidden = true;
  setTimeout(() => {
    els.scanLayer.classList.remove("active");
    showMatch();
    state.busy = false;
  }, 1150);
}

function capturePhoto() {
  if (state.busy) return;
  if (state.stream && els.cameraFeed.readyState >= 2) {
    const canvas = els.captureCanvas;
    canvas.width = els.cameraFeed.videoWidth;
    canvas.height = els.cameraFeed.videoHeight;
    const context = canvas.getContext("2d");
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(els.cameraFeed, 0, 0, canvas.width, canvas.height);
    els.capturePreview.src = canvas.toDataURL("image/jpeg", .88);
    els.capturePreview.hidden = false;
    els.cameraFeed.hidden = true;
  } else {
    els.capturePreview.src = els.cameraFallback.src;
    els.capturePreview.hidden = false;
    els.cameraFallback.hidden = true;
  }
  analyzePhoto();
}

function resetCapture() {
  els.cameraFrame.classList.remove("captured");
  els.matchResult.hidden = true;
  els.scanLayer.classList.remove("active");
  els.capturePreview.hidden = true;
  if (state.stream) els.cameraFeed.hidden = false;
  else els.cameraFallback.hidden = false;
}

function loadUploadedPhoto(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return showToast("Choose a JPEG, PNG, or WebP photo");
  if (file.size > 7_000_000) return showToast("Choose a photo smaller than 7 MB");
  const reader = new FileReader();
  reader.onload = () => {
    stopCamera();
    els.capturePreview.src = reader.result;
    els.capturePreview.hidden = false;
    els.cameraFeed.hidden = true;
    els.cameraFallback.hidden = true;
    analyzePhoto();
  };
  reader.readAsDataURL(file);
}

function normalizeRemoteDog(document) {
  const location = Array.isArray(document.location) ? document.location : [];
  return {
    ...document,
    lat: Number(document.lat ?? location[0]),
    lng: Number(document.lng ?? location[1]),
    distance: Number(document.distance),
    vibe: Number(document.vibe),
    tags: Array.isArray(document.tags) ? document.tags : [],
  };
}

let searchRequest = 0;
async function fetchDogPage(page) {
  const params = new URLSearchParams({ q: state.query || "*", mode: state.mode, species: state.species, radius: String(state.radius), page: String(page) });
  const response = await fetch(`/api/pets?${params}`);
  if (!response.ok) throw new Error("Typesense unavailable");
  return response.json();
}

async function searchTypesenseDogs({ randomize = false } = {}) {
  const request = ++searchRequest;
  if (location.protocol === "file:") return renderDogs();
  try {
    let payload = await fetchDogPage(1);
    if (randomize && !state.query && payload.found > 24) {
      const pages = Math.ceil(payload.found / 24);
      let nextPage = 1 + Math.floor(Math.random() * pages);
      if (pages > 1 && nextPage === state.currentPage) nextPage = nextPage % pages + 1;
      payload = await fetchDogPage(nextPage);
    }
    if (request !== searchRequest) return;
    const remoteDogs = payload.hits?.map(hit => normalizeRemoteDog(hit.document)).filter(dog => dog.id) || [];
    remoteDogs.forEach(dog => dogCache.set(dog.id, dog));
    dogCatalog = remoteDogs;
    state.searchResults = remoteDogs;
    state.totalFound = Number(payload.found) || remoteDogs.length;
    state.currentPage = Number(payload.page) || 1;
    state.dataSource = "typesense";
    setScreen(state.screen);
  } catch {
    if (request !== searchRequest) return;
    const fallback = localCatalogs[state.species];
    dogCatalog = fallback
      .filter(pet => pet.type === state.mode && Number(pet.distance) <= state.radius)
      .slice(0, 24);
    state.searchResults = null;
    state.totalFound = fallback.filter(dog => dog.type === state.mode && Number(dog.distance) <= state.radius).length;
    state.dataSource = "local";
    setScreen(state.screen);
  }
}

function loadTypesenseCatalog() {
  return searchTypesenseDogs({ randomize: true });
}

async function setSpecies(species) {
  if (!localCatalogs[species] || species === state.species) return;
  state.species = species;
  state.query = "";
  state.searchResults = null;
  state.currentPage = 1;
  state.lastMatchedDogId = null;
  state.matchedDog = null;
  renderSideRecommendation(null);
  const fallback = localCatalogs[species];
  dogCatalog = fallback
    .filter(pet => pet.type === state.mode && Number(pet.distance) <= state.radius)
    .slice(0, 24);
  state.totalFound = fallback.filter(pet => pet.type === state.mode && Number(pet.distance) <= state.radius).length;
  $("#dogSearch").value = "";
  $$('[data-species]').forEach(button => button.classList.toggle("active", button.dataset.species === species));
  resetCapture();
  updateSpeciesCopy();
  setScreen("nearby");
  await searchTypesenseDogs({ randomize: true });
}

document.addEventListener("click", (event) => {
  const screenLink = event.target.closest("[data-screen-link]");
  if (screenLink) {
    event.preventDefault();
    setScreen(screenLink.dataset.screenLink);
    return;
  }

  const favorite = event.target.closest("[data-favorite]");
  if (favorite) {
    event.stopPropagation();
    toggleFavorite(favorite.dataset.favorite);
    return;
  }

  const dogButton = event.target.closest("[data-open-dog]");
  if (dogButton) openDog(dogButton.dataset.openDog);

  const interestButton = event.target.closest("[data-interest]");
  if (interestButton) openInterest(interestButton.dataset.interest);

  const mapDogButton = event.target.closest("[data-map-dog]");
  if (mapDogButton) openDog(mapDogButton.dataset.mapDog);
});

$("#dogList").addEventListener("click", (event) => {
  const card = event.target.closest(".dog-card");
  if (card && !event.target.closest("button")) openDog(card.dataset.dogId);
});

$$('[data-mode], [data-intent]').forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode || button.dataset.intent;
    state.searchResults = null;
    $$("[data-intent]").forEach((item) => item.classList.toggle("active", item.dataset.intent === state.mode));
    updateMatchBannerCopy();
    setScreen("nearby");
    searchTypesenseDogs({ randomize: true });
  });
});

$$('[data-species]').forEach(button => button.addEventListener("click", () => setSpecies(button.dataset.species)));

els.matchTagline.addEventListener("change", saveMatchTagline);
els.matchTagline.addEventListener("keydown", (event) => {
  if (event.key === "Enter") els.matchTagline.blur();
  if (event.key === "Escape") {
    const key = `${state.species}:${state.mode}`;
    els.matchTagline.value = state.matchTaglines[key] || defaultMatchTaglines[key];
    els.matchTagline.blur();
  }
});
$("#editMatchTagline").addEventListener("click", () => {
  els.matchTagline.focus();
  els.matchTagline.select();
});

let searchTimer;
$("#dogSearch").addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchTypesenseDogs, 220);
});

$$('[data-results-view]').forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.resultsView;
    $$('[data-results-view]').forEach(item => item.classList.toggle("active", item === button));
    renderDogs();
  });
});

$$('[data-distance]').forEach((button) => {
  button.addEventListener("click", async () => {
    const radius = Number(button.dataset.distance);
    if (!Number.isFinite(radius) || radius === state.radius) return;
    state.radius = radius;
    state.currentPage = 1;
    $$('[data-distance]').forEach((item) => item.classList.toggle("active", item === button));
    await searchTypesenseDogs();
    showToast(`Showing ${state.species}s within ${radius} miles`);
  });
});

$("#recenterMap").addEventListener("click", () => leafletMap?.flyTo([39.7684, -86.1581], 12, { duration: .7 }));
$("#shuffleDogs").addEventListener("click", async () => {
  const button = $("#shuffleDogs");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  state.query = "";
  $("#dogSearch").value = "";
  try {
    await searchTypesenseDogs({ randomize: true });
    showToast(`Fresh ${state.species}s just arrived`);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
});

$("#shutterButton").addEventListener("click", capturePhoto);
$("#matchDogZoom").addEventListener("click", () => openPhotoViewer(state.matchedDog));
$("#useCameraButton").addEventListener("click", startCamera);
$("#photoInput").addEventListener("change", (event) => loadUploadedPhoto(event.target.files[0]));
$("#retakeButton").addEventListener("click", resetCapture);
$("#showMatchesButton").addEventListener("click", showMatchedRecommendation);
$("#flipButton").addEventListener("click", () => {
  state.facingMode = state.facingMode === "user" ? "environment" : "user";
  startCamera();
});
$("#flashButton").addEventListener("click", (event) => {
  event.currentTarget.classList.toggle("active");
  showToast(event.currentTarget.classList.contains("active") ? "Screen flash on" : "Screen flash off");
});

$("#dogDialogClose").addEventListener("click", () => $("#dogDialog").close());
$("#photoDialogClose").addEventListener("click", () => $("#photoDialog").close());
$("#photoDialog").addEventListener("click", (event) => { if (event.target === $("#photoDialog")) $("#photoDialog").close(); });
$$('[data-photo-zoom]').forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.photoZoom === "reset") setPhotoZoom(1);
  else setPhotoZoom(photoViewer.scale + (button.dataset.photoZoom === "in" ? .5 : -.5));
}));

const photoStage = $("#photoDialogStage");
photoStage.addEventListener("wheel", (event) => {
  event.preventDefault();
  setPhotoZoom(photoViewer.scale + (event.deltaY < 0 ? .25 : -.25));
}, { passive: false });
photoStage.addEventListener("dblclick", () => setPhotoZoom(photoViewer.scale === 1 ? 2 : 1));
photoStage.addEventListener("pointerdown", (event) => {
  photoStage.setPointerCapture(event.pointerId);
  photoViewer.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (photoViewer.pointers.size === 1) photoViewer.dragOffset = { x: event.clientX - photoViewer.x, y: event.clientY - photoViewer.y };
  if (photoViewer.pointers.size === 2) {
    const [a, b] = [...photoViewer.pointers.values()];
    photoViewer.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
photoStage.addEventListener("pointermove", (event) => {
  if (!photoViewer.pointers.has(event.pointerId)) return;
  photoViewer.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (photoViewer.pointers.size === 2) {
    const [a, b] = [...photoViewer.pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (photoViewer.pinchDistance) setPhotoZoom(photoViewer.scale * distance / photoViewer.pinchDistance);
    photoViewer.pinchDistance = distance;
  } else if (photoViewer.scale > 1 && photoViewer.dragOffset) {
    photoViewer.x = event.clientX - photoViewer.dragOffset.x;
    photoViewer.y = event.clientY - photoViewer.dragOffset.y;
    renderPhotoZoom();
  }
});
function endPhotoPointer(event) {
  photoViewer.pointers.delete(event.pointerId);
  photoViewer.pinchDistance = 0;
  const remaining = [...photoViewer.pointers.values()][0];
  photoViewer.dragOffset = remaining ? { x: remaining.x - photoViewer.x, y: remaining.y - photoViewer.y } : null;
}
photoStage.addEventListener("pointerup", endPhotoPointer);
photoStage.addEventListener("pointercancel", endPhotoPointer);
photoStage.addEventListener("lostpointercapture", endPhotoPointer);
$("#interestDialogClose").addEventListener("click", () => $("#interestDialog").close());
$("#dogDialog").addEventListener("click", (event) => { if (event.target === $("#dogDialog")) $("#dogDialog").close(); });
$("#interestDialog").addEventListener("click", (event) => { if (event.target === $("#interestDialog")) $("#interestDialog").close(); });
$("#interestForm").addEventListener("submit", () => {
  const dogName = state.selectedDog?.name || "this pet";
  setTimeout(() => showToast(`Your hello to ${dogName} is ready to go!`), 80);
});

window.addEventListener("beforeunload", stopCamera);
window.addEventListener("resize", () => leafletMap?.invalidateSize());

updateSavedCounts();
updateSpeciesCopy();
setScreen("camera");
loadTypesenseCatalog();
