const storageKey = "checkpoint-map-state-v1";
const photoDbName = "checkpoint-map-photos";
const photoStoreName = "photos";
const googleMapsApiKey = "AIzaSyD9kGCaluN0auzX_ch_gZRX3ul1RhrjUI0";
const supabaseProjectUrl = "https://wjembxkybxpsardbmkra.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZW1ieGt5Ynhwc2FyZGJta3JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjA2MDYsImV4cCI6MjA5NjMzNjYwNn0.8Yy2N38pVjxnaNXbHOSbCM8iCcZ4vl3AGDdZQgCwVtU";
const cloudStateTable = "shared_map_state";
const cloudStateId = "main";
const appLocale = "en";
const mustSeeRouteKey = "must-see";
const mustSeeRouteLabel = "Must see";
const defaultGoogleCenter = { lat: 51.5072, lng: -0.1276 };

const state = {
  points: [],
  selectedId: null,
  mapImage: "",
  googleMapQuery: "",
  googleMapCenter: null,
  googleMapZoom: 14,
  mapMode: "add",
  routePlans: {},
  activeRouteDate: todayKey(),
  activeView: "map",
};

const mapSurface = document.querySelector("#mapSurface");
const googleMapCanvas = document.querySelector("#googleMapCanvas");
const markerLayer = document.querySelector("#markerLayer");
const emptyHint = document.querySelector("#emptyHint");
const checkpointList = document.querySelector("#checkpointList");
const editorTitle = document.querySelector("#editorTitle");
const titleInput = document.querySelector("#titleInput");
const openingHoursInput = document.querySelector("#openingHoursInput");
const noteInput = document.querySelector("#noteInput");
const doneInput = document.querySelector("#doneInput");
const notInsideInput = document.querySelector("#notInsideInput");
const positionText = document.querySelector("#positionText");
const deleteButton = document.querySelector("#deleteButton");
const clearButton = document.querySelector("#clearButton");
const exportButton = document.querySelector("#exportButton");
const importInput = document.querySelector("#importInput");
const resetMapButton = document.querySelector("#resetMapButton");
const menuButton = document.querySelector("#menuButton");
const actionsMenu = document.querySelector("#actionsMenu");
const googleMapForm = document.querySelector("#googleMapForm");
const googleMapInput = document.querySelector("#googleMapInput");
const googleMapSearchButton = document.querySelector("#googleMapSearchButton");
const mapModeButton = document.querySelector("#mapModeButton");
const searchStatus = document.querySelector("#searchStatus");
const photoInput = document.querySelector("#photoInput");
const photoGallery = document.querySelector("#photoGallery");
const mapPage = document.querySelector("#mapPage");
const routePage = document.querySelector("#routePage");
const mapPageButton = document.querySelector("#mapPageButton");
const routePageButton = document.querySelector("#routePageButton");
const routeMapButton = document.querySelector("#routeMapButton");
const routePlannerButton = document.querySelector("#routePlannerButton");
const addToRouteButton = document.querySelector("#addToRouteButton");
const addToMustSeeButton = document.querySelector("#addToMustSeeButton");
const clearRouteButton = document.querySelector("#clearRouteButton");
const routeDateTitle = document.querySelector("#routeDateTitle");
const routeDoneInput = document.querySelector("#routeDoneInput");
const routeDateSelector = document.querySelector("#routeDateSelector");
const routeList = document.querySelector("#routeList");
const routeHistoryList = document.querySelector("#routeHistoryList");

let googleMapsPromise = null;
let googleMap = null;
let googleGeocoder = null;
let googleMarkers = [];
let googleProjectionOverlay = null;
let photoDbPromise = null;
let cloudReady = false;
let cloudSaveTimer = null;
let lastCloudStateJson = "";

function makeId() {
  return `checkpoint-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isNumber(value) {
  return Number.isFinite(Number(value));
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatRouteDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(appLocale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isDateRouteKey(routeKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(routeKey);
}

function isValidRouteKey(routeKey) {
  return routeKey === mustSeeRouteKey || isDateRouteKey(routeKey);
}

function activeRouteKey() {
  return isValidRouteKey(state.activeRouteDate) ? state.activeRouteDate : todayKey();
}

function routeDisplayName(routeKey) {
  if (routeKey === mustSeeRouteKey) return mustSeeRouteLabel;
  return formatRouteDate(routeKey);
}

function routeTitle(routeKey) {
  if (routeKey === mustSeeRouteKey) return mustSeeRouteLabel;
  return routeKey === todayKey() ? `Today, ${formatRouteDate(routeKey)}` : formatRouteDate(routeKey);
}

function hasGoogleMap() {
  return Boolean(state.googleMapQuery && state.googleMapCenter);
}

function normalizePoint(point, index = 0) {
  return {
    id: point.id || makeId(),
    title: point.title || `Checkpoint ${index + 1}`,
    note: point.note || "",
    openingHours: point.openingHours || "",
    x: isNumber(point.x) ? Number(point.x) : undefined,
    y: isNumber(point.y) ? Number(point.y) : undefined,
    lat: isNumber(point.lat) ? Number(point.lat) : undefined,
    lng: isNumber(point.lng) ? Number(point.lng) : undefined,
    photos: normalizePhotos(point.photos).map((photo) => ({ id: photo.id, name: photo.name })),
    done: Boolean(point.done),
    notInside: Boolean(point.notInside),
    createdAt: point.createdAt || new Date().toISOString(),
  };
}

function applySavedState(parsed, options = {}) {
  const previousSelectedId = state.selectedId;
  state.points = Array.isArray(parsed.points)
    ? parsed.points.map((point, index) => normalizePoint(point, index))
    : [];
  state.selectedId = options.keepSelection && state.points.some((point) => point.id === previousSelectedId)
    ? previousSelectedId
    : parsed.selectedId || state.points[0]?.id || null;
  state.mapImage = parsed.mapImage || "";
  state.googleMapQuery = parsed.googleMapQuery || "";
  state.googleMapCenter = parsed.googleMapCenter || null;
  state.googleMapZoom = parsed.googleMapZoom || 14;
  state.mapMode = parsed.mapMode === "browse" ? "browse" : "add";
  state.routePlans = normalizeRoutePlans(parsed.routePlans);
  state.activeRouteDate = isValidRouteKey(parsed.activeRouteDate) ? parsed.activeRouteDate : activeRouteKey();
  state.activeView = parsed.activeView === "route" ? "route" : "map";
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return;

  try {
    applySavedState(JSON.parse(saved));
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function saveState(options = {}) {
  const lightState = {
    ...state,
    points: state.points.map((point) => ({
      ...point,
      photos: normalizePhotos(point.photos).map((photo) => ({
        id: photo.id,
        name: photo.name,
      })),
    })),
  };

  localStorage.setItem(storageKey, JSON.stringify(lightState));
  if (!options.localOnly) scheduleCloudSave();
}

function sharedStateSnapshot() {
  return {
    points: state.points.map((point, index) => normalizePoint(point, index)),
    mapImage: state.mapImage,
    googleMapQuery: state.googleMapQuery,
    googleMapCenter: state.googleMapCenter,
    googleMapZoom: state.googleMapZoom,
    routePlans: state.routePlans,
  };
}

function hasSharedStateData(data) {
  return Boolean(
    data &&
      (Array.isArray(data.points) && data.points.length > 0 ||
        data.googleMapQuery ||
        Object.keys(data.routePlans || {}).length > 0),
  );
}

function applyCloudState(data) {
  if (!data || typeof data !== "object") return false;

  applySavedState(
    {
      ...data,
      selectedId: state.selectedId,
      activeRouteDate: state.activeRouteDate,
      activeView: state.activeView,
      mapMode: state.mapMode,
    },
    { keepSelection: true },
  );
  saveState({ localOnly: true });
  render();
  return true;
}

function scheduleCloudSave() {
  if (!cloudReady) return;

  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(() => {
    saveCloudState().catch((error) => console.warn("Could not sync map data.", error));
  }, 900);
}

function supabaseHeaders(extraHeaders = {}) {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    ...extraHeaders,
  };
}

async function saveCloudState() {
  const data = sharedStateSnapshot();
  const dataJson = JSON.stringify(data);
  if (dataJson === lastCloudStateJson) return;

  const response = await fetch(`${supabaseProjectUrl}/rest/v1/${cloudStateTable}?on_conflict=id`, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({ id: cloudStateId, data, updated_at: new Date().toISOString() }),
  });

  if (!response.ok) throw new Error(await response.text());
  lastCloudStateJson = dataJson;
}

async function loadCloudState() {
  const response = await fetch(`${supabaseProjectUrl}/rest/v1/${cloudStateTable}?id=eq.${cloudStateId}&select=data`, {
    headers: supabaseHeaders(),
  });

  if (!response.ok) throw new Error(await response.text());

  const rows = await response.json();
  const cloudData = rows?.[0]?.data;

  cloudReady = true;
  if (hasSharedStateData(cloudData)) {
    lastCloudStateJson = JSON.stringify(cloudData);
    applyCloudState(cloudData);
    return;
  }

  await saveCloudState();
}

function selectedPoint() {
  return state.points.find((point) => point.id === state.selectedId) || null;
}

function checkpointById(id) {
  return state.points.find((point) => point.id === id) || null;
}

function isMustSeePoint(point) {
  return Boolean(
    point?.id &&
      state.routePlans[mustSeeRouteKey]?.steps?.some((step) => step.checkpointId === point.id),
  );
}

function routePlan(routeKey = activeRouteKey()) {
  const key = isValidRouteKey(routeKey) ? routeKey : todayKey();

  if (!state.routePlans[key]) {
    state.routePlans[key] = {
      date: key,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      done: false,
      steps: [],
    };
  }

  state.routePlans[key].date = key;
  state.routePlans[key].done = Boolean(state.routePlans[key].done);

  if (!Array.isArray(state.routePlans[key].steps)) {
    state.routePlans[key].steps = [];
  }

  return state.routePlans[key];
}

function normalizeRoutePlans(routePlans) {
  if (!routePlans || typeof routePlans !== "object") return {};

  return Object.fromEntries(
    Object.entries(routePlans)
      .filter(([routeKey]) => isValidRouteKey(routeKey))
      .map(([dateKey, plan]) => [
        dateKey,
        {
          date: dateKey,
          createdAt: plan?.createdAt || new Date().toISOString(),
          updatedAt: plan?.updatedAt || new Date().toISOString(),
          done: Boolean(plan?.done),
          steps: Array.isArray(plan?.steps)
            ? plan.steps
                .filter((step) => step?.checkpointId)
                .map((step) => ({
                  id: step.id || makeId(),
                  checkpointId: step.checkpointId,
                  title: step.title || "Checkpoint",
                  note: step.note || "",
                  addedAt: step.addedAt || new Date().toISOString(),
                }))
            : [],
        },
      ]),
  );
}

function normalizePhotos(photos) {
  if (!Array.isArray(photos)) return [];

  return photos
    .filter((photo) => photo?.id || photo?.src)
    .map((photo) => ({
      id: photo.id || makeId(),
      name: photo.name || "Checkpoint photo",
      ...(photo.src ? { src: photo.src } : {}),
    }));
}

function openPhotoDb() {
  if (photoDbPromise) return photoDbPromise;

  photoDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(photoDbName, 1);

    request.addEventListener("upgradeneeded", () => {
      const db = request.result;
      const store = db.createObjectStore(photoStoreName, { keyPath: "id" });
      store.createIndex("checkpointId", "checkpointId", { unique: false });
    });

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(new Error("Photo storage could not be opened.")));
  });

  return photoDbPromise;
}

async function photoTransaction(mode = "readonly") {
  const db = await openPhotoDb();
  return db.transaction(photoStoreName, mode).objectStore(photoStoreName);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error || new Error("Photo storage request failed.")));
  });
}

async function savePhotoRecord(checkpointId, photo) {
  const store = await photoTransaction("readwrite");
  await requestToPromise(store.put({ id: photo.id, checkpointId, name: photo.name, src: photo.src }));
}

async function getPhotoRecord(photoId) {
  const store = await photoTransaction();
  return requestToPromise(store.get(photoId));
}

async function getCheckpointPhotoRecords(checkpointId) {
  const store = await photoTransaction();
  const index = store.index("checkpointId");
  return requestToPromise(index.getAll(checkpointId));
}

async function deletePhotoRecord(photoId) {
  const store = await photoTransaction("readwrite");
  await requestToPromise(store.delete(photoId));
}

async function deleteCheckpointPhotoRecords(checkpointId) {
  const photos = await getCheckpointPhotoRecords(checkpointId);
  await Promise.all(photos.map((photo) => deletePhotoRecord(photo.id)));
}

async function clearPhotoRecords() {
  const store = await photoTransaction("readwrite");
  await requestToPromise(store.clear());
}

async function migrateInlinePhotosToIndexedDB() {
  let changed = false;

  for (const point of state.points) {
    const photos = normalizePhotos(point.photos);
    for (const photo of photos) {
      if (!photo.src) continue;
      await savePhotoRecord(point.id, photo);
      changed = true;
    }
    point.photos = photos.map((photo) => ({ id: photo.id, name: photo.name }));
  }

  if (changed) saveState();
}

function pointLabel(point) {
  return state.points.indexOf(point) + 1;
}

function isNotInside(point) {
  return !point.done && Boolean(point.notInside);
}

function extractGoogleMapSearch(value) {
  const rawValue = value.trim();
  if (!rawValue) return "";

  try {
    const url = new URL(rawValue);
    const placeMatch = url.href.match(/\/place\/([^/]+)/);
    const searchMatch = url.href.match(/\/search\/([^/?]+)/);
    const query =
      url.searchParams.get("q") ||
      url.searchParams.get("query") ||
      url.searchParams.get("destination") ||
      url.searchParams.get("daddr") ||
      url.searchParams.get("ll");

    if (query) return query;
    if (placeMatch) return decodeURIComponent(placeMatch[1]).replaceAll("+", " ");
    if (searchMatch) return decodeURIComponent(searchMatch[1]).replaceAll("+", " ");
  } catch {
    return rawValue;
  }

  return rawValue;
}

function extractLatLng(value) {
  const rawValue = value.trim();
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/,
  ];

  for (const pattern of patterns) {
    const match = rawValue.match(pattern);
    const lat = Number(match?.[1]);
    const lng = Number(match?.[2]);
    if (validLatLng(lat, lng)) return { lat, lng };
  }

  try {
    const url = new URL(rawValue);
    const query =
      url.searchParams.get("q") ||
      url.searchParams.get("query") ||
      url.searchParams.get("ll") ||
      url.searchParams.get("center");
    const queryMatch = query?.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
    const lat = Number(queryMatch?.[1]);
    const lng = Number(queryMatch?.[2]);
    if (validLatLng(lat, lng)) return { lat, lng };
  } catch {
    return null;
  }

  return null;
}

function validLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function setSearchStatus(message = "", isError = false) {
  searchStatus.textContent = message;
  searchStatus.classList.toggle("error", isError);
}

function setSearchLoading(isLoading) {
  googleMapSearchButton.disabled = isLoading;
  googleMapSearchButton.textContent = isLoading ? "Searching..." : "Search";
}

function loadGoogleMapsApi() {
  if (window.google?.maps) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    window.initCheckpointGoogleMap = resolve;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&callback=initCheckpointGoogleMap&v=weekly&language=en`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Google Maps could not be loaded."));
    document.head.append(script);
  });

  return googleMapsPromise;
}

async function ensureGoogleMap() {
  await loadGoogleMapsApi();

  if (!googleMap) {
    googleGeocoder ||= new google.maps.Geocoder();
    googleMap = new google.maps.Map(googleMapCanvas, {
      center: state.googleMapCenter || defaultGoogleCenter,
      zoom: state.googleMapZoom,
      fullscreenControl: false,
      gestureHandling: state.mapMode === "browse" ? "greedy" : "cooperative",
      draggableCursor: state.mapMode === "browse" ? "grab" : "crosshair",
      draggingCursor: "grabbing",
      mapTypeControl: true,
      streetViewControl: true,
      zoomControl: false,
    });

    googleMap.addListener("click", (event) => {
      if (state.mapMode !== "add") return;
      addGooglePoint(event.latLng);
    });

    googleMap.addListener("idle", () => {
      const center = googleMap.getCenter();
      if (!center || !hasGoogleMap()) return;

      state.googleMapCenter = { lat: center.lat(), lng: center.lng() };
      state.googleMapZoom = googleMap.getZoom();
      saveState();
      migrateScreenPinsToMapCoordinates();
      renderGoogleMarkers();
    });

    googleProjectionOverlay = new google.maps.OverlayView();
    googleProjectionOverlay.draw = () => {};
    googleProjectionOverlay.setMap(googleMap);
  }

  if (state.googleMapCenter) {
    googleMap.setCenter(state.googleMapCenter);
    googleMap.setZoom(state.googleMapZoom);
  }

  migrateScreenPinsToMapCoordinates();
  renderGoogleMarkers();
  updateGoogleMapInteraction();
}

function migrateScreenPinsToMapCoordinates() {
  if (!googleProjectionOverlay || !hasGoogleMap()) return;

  const projection = googleProjectionOverlay.getProjection();
  if (!projection) return;

  let changed = false;
  const mapBox = googleMapCanvas.getBoundingClientRect();

  state.points.forEach((point) => {
    if (isNumber(point.lat) && isNumber(point.lng)) return;
    if (!isNumber(point.x) || !isNumber(point.y)) return;

    const pixel = new google.maps.Point((Number(point.x) / 100) * mapBox.width, (Number(point.y) / 100) * mapBox.height);
    const latLng = projection.fromContainerPixelToLatLng(pixel);
    if (!latLng) return;

    point.lat = latLng.lat();
    point.lng = latLng.lng();
    delete point.x;
    delete point.y;
    changed = true;
  });

  if (changed) saveState();
}

function clearGoogleMarkers() {
  googleMarkers.forEach((marker) => marker.setMap(null));
  googleMarkers = [];
}

function renderGoogleMarkers() {
  if (!googleMap || !hasGoogleMap()) return;

  clearGoogleMarkers();

  state.points
    .filter((point) => isNumber(point.lat) && isNumber(point.lng))
    .forEach((point) => {
      const selected = point.id === state.selectedId;
      const mustSee = isMustSeePoint(point);
      const marker = new google.maps.Marker({
        map: googleMap,
        position: { lat: Number(point.lat), lng: Number(point.lng) },
        title: point.title,
        label: {
          text: String(pointLabel(point)),
          color: point.done || isNotInside(point) ? "#ffffff" : "#24180a",
          fontWeight: "900",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: point.done ? "#83C44B" : isNotInside(point) ? "#FFA11D" : "#85ABFF",
          fillOpacity: 1,
          scale: selected ? 15 : 12,
          strokeColor: mustSee ? "#FFD84D" : selected ? "#20242a" : "#ffffff",
          strokeWeight: mustSee || selected ? 4 : 3,
        },
      });

      marker.addListener("click", () => selectPoint(point.id));
      googleMarkers.push(marker);
    });
}

function updateMapSource() {
  googleMapInput.value = state.googleMapQuery;
  mapSurface.classList.toggle("has-google", hasGoogleMap());
  mapSurface.classList.toggle("map-browse", state.mapMode === "browse" && hasGoogleMap());
  mapModeButton.setAttribute("aria-pressed", String(state.mapMode === "browse"));
  mapModeButton.textContent = state.mapMode === "browse" ? "Move map" : "Add pins";

  if (state.mapImage) {
    mapSurface.classList.add("has-image");
    mapSurface.style.backgroundImage = `url("${state.mapImage}")`;
  } else {
    mapSurface.classList.remove("has-image");
    mapSurface.style.backgroundImage = "";
  }

  if (hasGoogleMap()) {
    ensureGoogleMap().catch((error) => window.alert(error.message));
  } else {
    clearGoogleMarkers();
  }
}

function updateGoogleMapInteraction() {
  if (!googleMap) return;

  googleMap.setOptions({
    draggableCursor: state.mapMode === "browse" ? "grab" : "crosshair",
    gestureHandling: state.mapMode === "browse" ? "greedy" : "cooperative",
  });
}

function markerPreview(point) {
  const photoCount = normalizePhotos(point.photos).length;
  if (point.note) return point.note;
  if (point.openingHours) return point.openingHours;
  if (photoCount) return `${photoCount} photo${photoCount === 1 ? "" : "s"}`;
  if (isNumber(point.lat) && isNumber(point.lng)) {
    return `${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}`;
  }
  return `${Math.round(point.x || 50)}%, ${Math.round(point.y || 50)}%`;
}

function renderMarkers() {
  markerLayer.replaceChildren();

  if (hasGoogleMap()) {
    renderGoogleMarkers();
    emptyHint.classList.toggle("hidden", state.points.length > 0);
    return;
  }

  state.points.forEach((point) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "marker";
    marker.style.left = `${point.x || 50}%`;
    marker.style.top = `${point.y || 50}%`;
    marker.title = point.title;
    marker.setAttribute("aria-label", `Select ${point.title}`);

    if (point.done) marker.classList.add("done");
    if (isNotInside(point)) marker.classList.add("not-inside");
    if (isMustSeePoint(point)) marker.classList.add("must-see");
    if (point.id === state.selectedId) marker.classList.add("selected");

    const number = document.createElement("span");
    number.textContent = pointLabel(point);
    marker.append(number);

    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      selectPoint(point.id);
    });

    markerLayer.append(marker);
  });

  emptyHint.classList.toggle("hidden", state.points.length > 0);
}

function renderList() {
  checkpointList.replaceChildren();

  if (!state.points.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "No checkpoints yet.";
    checkpointList.append(empty);
    return;
  }

  state.points.forEach((point) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "checkpoint-item";
    if (point.done) item.classList.add("done");
    if (isNotInside(point)) item.classList.add("not-inside");
    if (isMustSeePoint(point)) item.classList.add("must-see");
    if (point.id === state.selectedId) item.classList.add("selected");

    const number = document.createElement("span");
    number.className = "checkpoint-number";
    number.textContent = pointLabel(point);

    const copy = document.createElement("span");
    copy.className = "checkpoint-copy";

    const title = document.createElement("strong");
    title.textContent = point.title;

    const preview = document.createElement("span");
    preview.textContent = markerPreview(point);

    copy.append(title, preview);
    item.append(number, copy);

    const firstPhoto = normalizePhotos(point.photos)[0];
    if (firstPhoto) {
      const thumb = document.createElement("span");
      thumb.className = "checkpoint-thumb";

      const image = document.createElement("img");
      image.alt = "";
      thumb.append(image);
      item.append(thumb);

      getPhotoRecord(firstPhoto.id)
        .then((photo) => {
          if (photo?.src) {
            image.src = photo.src;
          } else {
            thumb.remove();
          }
        })
        .catch(() => {
          thumb.remove();
        });
    }

    item.addEventListener("click", () => selectPoint(point.id));
    checkpointList.append(item);
  });
}

function renderEditor() {
  const point = selectedPoint();
  const hasPoint = Boolean(point);

  titleInput.disabled = !hasPoint;
  openingHoursInput.disabled = !hasPoint;
  noteInput.disabled = !hasPoint;
  doneInput.disabled = !hasPoint;
  notInsideInput.disabled = !hasPoint;
  photoInput.disabled = !hasPoint;
  addToRouteButton.disabled = !hasPoint;
  addToMustSeeButton.disabled = !hasPoint;
  deleteButton.disabled = !hasPoint;
  photoGallery.replaceChildren();

  if (!point) {
    editorTitle.textContent = "No checkpoint selected";
    titleInput.value = "";
    openingHoursInput.value = "";
    noteInput.value = "";
    doneInput.checked = false;
    notInsideInput.checked = false;
    positionText.textContent = "No position";
    renderPhotoGallery(null);
    return;
  }

  point.photos = normalizePhotos(point.photos);
  editorTitle.replaceChildren();
  const titleText = document.createElement("span");
  titleText.textContent = point.title;
  editorTitle.append(titleText);
  if (isMustSeePoint(point)) {
    const star = document.createElement("span");
    star.className = "must-see-star";
    star.setAttribute("aria-label", "Must see");
    star.textContent = "★";
    editorTitle.append(star);
  }
  titleInput.value = point.title;
  openingHoursInput.value = point.openingHours || "";
  noteInput.value = point.note;
  doneInput.checked = point.done;
  notInsideInput.checked = Boolean(point.notInside);
  positionText.textContent = markerPreview(point);
  renderPhotoGallery(point);
}

async function renderPhotoGallery(point) {
  photoGallery.replaceChildren();

  if (!point) {
    const empty = document.createElement("p");
    empty.className = "photo-empty";
    empty.textContent = "Select a checkpoint to add photos.";
    photoGallery.append(empty);
    return;
  }

  const photos = normalizePhotos(point.photos);
  if (!photos.length) {
    const empty = document.createElement("p");
    empty.className = "photo-empty";
    empty.textContent = "No photos attached.";
    photoGallery.append(empty);
    return;
  }

  photos.forEach((photo) => {
    const card = document.createElement("figure");
    card.className = "photo-card";

    const image = document.createElement("img");
    image.src = photo.src;
    image.alt = photo.name;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "x";
    removeButton.title = "Remove photo";
    removeButton.setAttribute("aria-label", `Remove ${photo.name}`);
    removeButton.addEventListener("click", () => removePhoto(photo.id));

    card.append(image, removeButton);
    photoGallery.append(card);

    getPhotoRecord(photo.id)
      .then((record) => {
        if (record?.src) {
          image.src = record.src;
        } else {
          card.remove();
        }
      })
      .catch(() => {
        card.remove();
      });
  });
}

function render() {
  updateMapSource();
  renderMarkers();
  renderList();
  renderEditor();
  renderRoutePlanner();
  renderView();
}

function routeStepLabel(step) {
  const checkpoint = checkpointById(step.checkpointId);
  return checkpoint?.title || step.title || "Missing checkpoint";
}

function routeStepMeta(step) {
  const checkpoint = checkpointById(step.checkpointId);
  if (!checkpoint) return "Checkpoint was deleted";
  if (checkpoint.openingHours) return checkpoint.openingHours;
  if (checkpoint.note) return checkpoint.note;
  if (isNumber(checkpoint.lat) && isNumber(checkpoint.lng)) {
    return `${Number(checkpoint.lat).toFixed(5)}, ${Number(checkpoint.lng).toFixed(5)}`;
  }
  return markerPreview(checkpoint);
}

function renderRoutePlanner() {
  const routeKey = activeRouteKey();
  const plan = routePlan(routeKey);
  routeDateTitle.textContent = routeTitle(routeKey);
  routeDoneInput.checked = Boolean(plan.done);
  routeList.replaceChildren();
  renderRouteDateSelector();

  if (!plan.steps.length) {
    const empty = document.createElement("p");
    empty.className = "route-empty";
    empty.textContent = routeKey === mustSeeRouteKey
      ? "No must-see stops yet. Select a checkpoint on the map and add it to Must see."
      : "No route steps yet. Select a checkpoint on the map and add it to your route.";
    routeList.append(empty);
  } else {
    plan.steps.forEach((step, index) => {
      const checkpoint = checkpointById(step.checkpointId);
      const card = document.createElement("article");
      card.className = "route-step";
      if (checkpoint?.done) card.classList.add("done");
      if (checkpoint && isNotInside(checkpoint)) card.classList.add("not-inside");

      const number = document.createElement("span");
      number.className = "route-step-number";
      number.textContent = index + 1;

      const copy = document.createElement("div");
      copy.className = "route-step-copy";

      const title = document.createElement("strong");
      title.textContent = routeStepLabel(step);

      const meta = document.createElement("span");
      meta.textContent = routeStepMeta(step);

      const note = document.createElement("textarea");
      note.value = step.note || "";
      note.placeholder = "Route note for this stop";
      note.dataset.routeAction = "note";
      note.dataset.stepId = step.id;

      copy.append(title, meta, note);

      const actions = document.createElement("div");
      actions.className = "route-step-actions";
      actions.append(
        routeActionButton("Up", "up", step.id, index === 0),
        routeActionButton("Down", "down", step.id, index === plan.steps.length - 1),
        routeActionButton("Remove", "remove", step.id, false),
      );

      card.append(number, copy, actions);
      routeList.append(card);
    });
  }

  renderRouteHistory();
}

function renderRouteDateSelector() {
  routeDateSelector.replaceChildren();
  const today = todayKey();

  const mustSeeButton = document.createElement("button");
  mustSeeButton.type = "button";
  mustSeeButton.className = "date-button must-see-button";
  if (activeRouteKey() === mustSeeRouteKey) mustSeeButton.classList.add("active");
  mustSeeButton.dataset.routeDate = mustSeeRouteKey;

  const mustSeeLabel = document.createElement("strong");
  mustSeeLabel.textContent = mustSeeRouteLabel;

  const mustSeeSubtext = document.createElement("span");
  mustSeeSubtext.textContent = "No date";

  mustSeeButton.append(mustSeeLabel, mustSeeSubtext);
  routeDateSelector.append(mustSeeButton);

  for (let index = 0; index < 10; index += 1) {
    const dateKey = addDays(today, index);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-button";
    if (dateKey === activeRouteKey()) button.classList.add("active");
    button.dataset.routeDate = dateKey;

    const label = document.createElement("strong");
    label.textContent = index === 0 ? "Today" : new Date(`${dateKey}T12:00:00`).toLocaleDateString(appLocale, { weekday: "short" });

    const date = document.createElement("span");
    date.textContent = new Date(`${dateKey}T12:00:00`).toLocaleDateString(appLocale, { month: "short", day: "numeric" });

    button.append(label, date);
    routeDateSelector.append(button);
  }
}

function routeActionButton(label, action, stepId, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.routeAction = action;
  button.dataset.stepId = stepId;
  button.disabled = disabled;
  return button;
}

function renderRouteHistory() {
  routeHistoryList.replaceChildren();
  const routeKeys = Object.values(state.routePlans)
    .filter((plan) => plan.steps?.length || plan.done)
    .map((plan) => plan.date)
    .sort((a, b) => {
      if (a === mustSeeRouteKey) return -1;
      if (b === mustSeeRouteKey) return 1;
      return b.localeCompare(a);
    });

  if (!routeKeys.includes(todayKey())) routeKeys.unshift(todayKey());

  routeKeys.forEach((dateKey) => {
    const plan = routePlan(dateKey);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-button";
    if (dateKey === activeRouteKey()) button.classList.add("active");
    button.dataset.routeDate = dateKey;

    const dateLabel = document.createElement("span");
    dateLabel.className = "history-date-label";

    const date = document.createElement("strong");
    date.textContent = routeDisplayName(dateKey);
    dateLabel.append(date);

    if (plan.done) {
      const doneIcon = document.createElement("span");
      doneIcon.className = "history-done-icon";
      doneIcon.setAttribute("aria-label", "Route done");
      doneIcon.textContent = "✓";
      dateLabel.append(doneIcon);
    }

    const stopCount = document.createElement("span");
    stopCount.textContent = `${plan.steps.length} stop${plan.steps.length === 1 ? "" : "s"}`;

    button.append(dateLabel, stopCount);
    routeHistoryList.append(button);
  });
}

function renderView() {
  const showingRoute = state.activeView === "route";
  mapPage.classList.toggle("is-hidden", showingRoute);
  routePage.classList.toggle("is-hidden", !showingRoute);
  mapPageButton.classList.toggle("active", !showingRoute);
  routePageButton.classList.toggle("active", showingRoute);
  routeMapButton.classList.toggle("active", !showingRoute);
  routePlannerButton.classList.toggle("active", showingRoute);
}

function showView(view) {
  state.activeView = view === "route" ? "route" : "map";
  saveState();
  render();
}

function addSelectedToRoute() {
  const point = selectedPoint();
  if (!point) return;

  const dateKey = isDateRouteKey(activeRouteKey()) ? activeRouteKey() : todayKey();
  addPointToRoute(point, dateKey);
}

function addSelectedToMustSee() {
  const point = selectedPoint();
  if (!point) return;

  addPointToRoute(point, mustSeeRouteKey, { openRoute: false });
}

function addPointToRoute(point, routeKey, options = {}) {
  const plan = routePlan(routeKey);
  const existing = plan.steps.find((step) => step.checkpointId === point.id);
  plan.steps = plan.steps.filter((step) => step.checkpointId !== point.id);
  plan.steps.push(
    existing || {
      id: makeId(),
      checkpointId: point.id,
      title: point.title,
      note: "",
      addedAt: new Date().toISOString(),
    },
  );
  plan.updatedAt = new Date().toISOString();
  if (options.openRoute !== false) {
    state.activeRouteDate = routeKey;
    state.activeView = "route";
  }
  saveState();
  render();
}

function moveRouteStep(stepId, direction) {
  const plan = routePlan(state.activeRouteDate);
  const index = plan.steps.findIndex((step) => step.id === stepId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= plan.steps.length) return;

  const [step] = plan.steps.splice(index, 1);
  plan.steps.splice(nextIndex, 0, step);
  plan.updatedAt = new Date().toISOString();
  saveState();
  render();
}

function removeRouteStep(stepId) {
  const plan = routePlan(state.activeRouteDate);
  plan.steps = plan.steps.filter((step) => step.id !== stepId);
  plan.updatedAt = new Date().toISOString();
  saveState();
  render();
}

function updateRouteStepNote(stepId, note) {
  const plan = routePlan(state.activeRouteDate);
  const step = plan.steps.find((item) => item.id === stepId);
  if (!step) return;

  step.note = note;
  plan.updatedAt = new Date().toISOString();
  saveState();
}

function updateActiveRouteDone(done) {
  const plan = routePlan(state.activeRouteDate);
  plan.done = done;
  plan.updatedAt = new Date().toISOString();
  saveState();
  renderRouteHistory();
}

function removeCheckpointFromRoutes(checkpointId) {
  Object.values(state.routePlans).forEach((plan) => {
    plan.steps = (plan.steps || []).filter((step) => step.checkpointId !== checkpointId);
    plan.updatedAt = new Date().toISOString();
  });
}

function clearActiveRoute() {
  const routeKey = activeRouteKey();
  const plan = routePlan(routeKey);
  if (!plan.steps.length && !plan.done) return;
  const confirmed = window.confirm(`Clear route plan for ${routeDisplayName(routeKey)}?`);
  if (!confirmed) return;

  plan.steps = [];
  plan.done = false;
  plan.updatedAt = new Date().toISOString();
  saveState();
  render();
}

function selectPoint(id) {
  state.selectedId = id;
  saveState();
  render();
}

function addImagePoint(event) {
  if (event.target.closest(".marker")) return;
  if (hasGoogleMap() || state.mapMode === "browse") return;

  const rect = mapSurface.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  const nextNumber = state.points.length + 1;

  const point = {
    id: makeId(),
    title: `Checkpoint ${nextNumber}`,
    note: "",
    openingHours: "",
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
    photos: [],
    done: false,
    notInside: false,
    createdAt: new Date().toISOString(),
  };

  state.points.push(point);
  state.selectedId = point.id;
  saveState();
  render();
  titleInput.focus();
  titleInput.select();
}

function addGooglePoint(latLng) {
  const nextNumber = state.points.length + 1;
  const point = {
    id: makeId(),
    title: `Checkpoint ${nextNumber}`,
    note: "",
    openingHours: "",
    lat: latLng.lat(),
    lng: latLng.lng(),
    photos: [],
    done: false,
    notInside: false,
    createdAt: new Date().toISOString(),
  };

  state.points.push(point);
  state.selectedId = point.id;
  saveState();
  render();
  titleInput.focus();
  titleInput.select();
}

function updateSelectedPoint(changes) {
  const point = selectedPoint();
  if (!point) return;

  Object.assign(point, changes);
  saveState();
  render();
}

async function deleteSelectedPoint() {
  const point = selectedPoint();
  if (!point) return;

  await deleteCheckpointPhotoRecords(point.id);
  removeCheckpointFromRoutes(point.id);
  state.points = state.points.filter((item) => item.id !== point.id);
  state.selectedId = state.points[0]?.id || null;
  saveState();
  render();
}

async function clearAll() {
  if (!state.points.length && !state.mapImage && !state.googleMapQuery) return;
  const confirmed = window.confirm("Clear all checkpoints and reset the map?");
  if (!confirmed) return;

  await clearPhotoRecords();
  state.points = [];
  state.selectedId = null;
  state.mapImage = "";
  state.googleMapQuery = "";
  state.googleMapCenter = null;
  state.googleMapZoom = 14;
  state.mapMode = "add";
  state.routePlans = {};
  state.activeRouteDate = todayKey();
  saveState();
  render();
}

async function exportCheckpoints() {
  const points = await Promise.all(
    state.points.map(async (point) => ({
      ...point,
      photos: await getCheckpointPhotoRecords(point.id),
    })),
  );
  const payload = {
    exportedAt: new Date().toISOString(),
    points,
    mapImage: state.mapImage,
    googleMapQuery: state.googleMapQuery,
    googleMapCenter: state.googleMapCenter,
    googleMapZoom: state.googleMapZoom,
    routePlans: state.routePlans,
    activeRouteDate: state.activeRouteDate,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "checkpoint-map.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importCheckpoints(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed.points)) throw new Error("Missing points");

      await clearPhotoRecords();
      state.points = parsed.points.map((point, index) => normalizePoint(point, index));
      await Promise.all(
        parsed.points.flatMap((point, index) => {
          const checkpointId = state.points[index].id;
          return normalizePhotos(point.photos)
            .filter((photo) => photo.src)
            .map((photo) => savePhotoRecord(checkpointId, photo));
        }),
      );
      state.mapImage = parsed.mapImage || "";
      state.googleMapQuery = parsed.googleMapQuery || "";
      state.googleMapCenter = parsed.googleMapCenter || null;
      state.googleMapZoom = parsed.googleMapZoom || 14;
      state.mapMode = "add";
      state.routePlans = normalizeRoutePlans(parsed.routePlans);
      state.activeRouteDate = isValidRouteKey(parsed.activeRouteDate) ? parsed.activeRouteDate : todayKey();
      state.selectedId = state.points[0]?.id || null;
      saveState();
      render();
    } catch {
      window.alert("That file does not look like a checkpoint map export.");
    } finally {
      importInput.value = "";
    }
  });
  reader.readAsText(file);
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("Could not read that photo.")));
    reader.addEventListener("load", () => {
      const image = new Image();
      image.addEventListener("error", () => reject(new Error("That file is not a usable image.")));
      image.addEventListener("load", () => {
        const maxSize = 1400;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);

        resolve({
          id: makeId(),
          name: file.name || "Checkpoint photo",
          src: canvas.toDataURL("image/jpeg", 0.82),
        });
      });
      image.src = String(reader.result);
    });
    reader.readAsDataURL(file);
  });
}

async function addPhotos(files) {
  const point = selectedPoint();
  if (!point || !files.length) return;

  try {
    const photos = await Promise.all([...files].map((file) => compressPhoto(file)));
    await Promise.all(photos.map((photo) => savePhotoRecord(point.id, photo)));
    point.photos = [
      ...normalizePhotos(point.photos),
      ...photos.map((photo) => ({ id: photo.id, name: photo.name })),
    ];
    saveState();
    render();
  } catch (error) {
    window.alert(error.message);
  } finally {
    photoInput.value = "";
  }
}

async function removePhoto(photoId) {
  const point = selectedPoint();
  if (!point) return;

  await deletePhotoRecord(photoId);
  point.photos = normalizePhotos(point.photos).filter((photo) => photo.id !== photoId);
  saveState();
  render();
}

async function geocodeGoogleMap(query) {
  const directLatLng = extractLatLng(query);
  if (directLatLng) return directLatLng;

  await loadGoogleMapsApi();
  googleGeocoder ||= new google.maps.Geocoder();
  const searchQuery = extractGoogleMapSearch(query);

  if (searchQuery.includes("maps.app.goo.gl") || searchQuery.includes("goo.gl/maps")) {
    throw new Error("Short Google Maps links cannot be read here. Paste the full address, coordinates, or expanded Google Maps URL.");
  }

  try {
    return await new Promise((resolve, reject) => {
      googleGeocoder.geocode({ address: searchQuery }, (results, status) => {
        if (status !== "OK" || !results?.[0]) {
          reject(new Error(status));
          return;
        }

        const location = results[0].geometry.location;
        resolve({ lat: location.lat(), lng: location.lng() });
      });
    });
  } catch {
    return geocodeWithOpenStreetMap(searchQuery);
  }
}

async function geocodeWithOpenStreetMap(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", appLocale);
  url.searchParams.set("q", query);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Search is unavailable right now. Try coordinates like 51.5072,-0.1276.");
  }

  const results = await response.json();
  const result = results?.[0];
  const lat = Number(result?.lat);
  const lng = Number(result?.lon);

  if (!validLatLng(lat, lng)) {
    throw new Error("Could not find that place. Try a more specific address or coordinates.");
  }

  return { lat, lng };
}

function reverseGeocodeGoogleMap(latLng) {
  if (!googleGeocoder) return;

  googleGeocoder.geocode({ location: latLng }, (results, status) => {
      if (status !== "OK" || !results?.[0]) {
        return;
      }

    const point = selectedPoint();
    if (!point || point.title !== "Dropped pin") return;

    point.title = results[0].formatted_address || "Dropped pin";
    saveState();
    render();
  });
}

function updateMapUrl(query) {
  const url = new URL(window.location.href);
  url.searchParams.set("map", query);
  window.history.replaceState({}, "", url);
}

async function loadGoogleMap(value, options = {}) {
  const query = extractGoogleMapSearch(value);
  if (!query) return;

  setSearchLoading(true);
  setSearchStatus("Searching Google Maps...");

  try {
    const center = await geocodeGoogleMap(value);
    state.googleMapQuery = query;
    state.mapImage = "";
    state.mapMode = "add";
    state.googleMapCenter = center;
    state.googleMapZoom = 15;
    saveState();
    render();
    await ensureGoogleMap();
    googleMap.setCenter(center);
    googleMap.setZoom(state.googleMapZoom);
    googleMapInput.value = query;
    setSearchStatus(`Showing ${query}`);
    if (options.updateUrl !== false) updateMapUrl(query);
  } catch (error) {
    setSearchStatus(error.message, true);
  } finally {
    setSearchLoading(false);
  }
}

mapSurface.addEventListener("click", addImagePoint);
titleInput.addEventListener("input", () => updateSelectedPoint({ title: titleInput.value || "Untitled checkpoint" }));
openingHoursInput.addEventListener("input", () => updateSelectedPoint({ openingHours: openingHoursInput.value }));
noteInput.addEventListener("input", () => updateSelectedPoint({ note: noteInput.value }));
doneInput.addEventListener("change", () => updateSelectedPoint({ done: doneInput.checked }));
notInsideInput.addEventListener("change", () => updateSelectedPoint({ notInside: notInsideInput.checked }));
deleteButton.addEventListener("click", () => deleteSelectedPoint().catch((error) => window.alert(error.message)));
clearButton.addEventListener("click", () => clearAll().catch((error) => window.alert(error.message)));
exportButton.addEventListener("click", () => exportCheckpoints().catch((error) => window.alert(error.message)));
importInput.addEventListener("change", () => importCheckpoints(importInput.files[0]));
photoInput.addEventListener("change", () => addPhotos(photoInput.files));
addToRouteButton.addEventListener("click", addSelectedToRoute);
addToMustSeeButton.addEventListener("click", addSelectedToMustSee);
menuButton.addEventListener("click", () => {
  const isOpen = !actionsMenu.classList.contains("is-hidden");
  actionsMenu.classList.toggle("is-hidden", isOpen);
  menuButton.setAttribute("aria-expanded", String(!isOpen));
});
actionsMenu.addEventListener("click", (event) => {
  if (event.target.closest("button")) {
    actionsMenu.classList.add("is-hidden");
    menuButton.setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("click", (event) => {
  if (event.target.closest(".menu-wrap")) return;
  actionsMenu.classList.add("is-hidden");
  menuButton.setAttribute("aria-expanded", "false");
});
mapPageButton.addEventListener("click", () => showView("map"));
routePageButton.addEventListener("click", () => showView("route"));
routeMapButton.addEventListener("click", () => showView("map"));
routePlannerButton.addEventListener("click", () => showView("route"));
clearRouteButton.addEventListener("click", clearActiveRoute);
routeDoneInput.addEventListener("change", () => updateActiveRouteDone(routeDoneInput.checked));
routeDateSelector.addEventListener("click", (event) => {
  const button = event.target.closest("[data-route-date]");
  if (!button) return;

  state.activeRouteDate = isValidRouteKey(button.dataset.routeDate) ? button.dataset.routeDate : todayKey();
  state.activeView = "route";
  saveState();
  render();
});
routeHistoryList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-route-date]");
  if (!button) return;

  state.activeRouteDate = isValidRouteKey(button.dataset.routeDate) ? button.dataset.routeDate : todayKey();
  state.activeView = "route";
  saveState();
  render();
});
routeList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-route-action]");
  if (!button) return;

  const stepId = button.dataset.stepId;
  if (button.dataset.routeAction === "up") moveRouteStep(stepId, -1);
  if (button.dataset.routeAction === "down") moveRouteStep(stepId, 1);
  if (button.dataset.routeAction === "remove") removeRouteStep(stepId);
});
routeList.addEventListener("input", (event) => {
  if (event.target.dataset.routeAction !== "note") return;
  updateRouteStepNote(event.target.dataset.stepId, event.target.value);
});
resetMapButton.addEventListener("click", () => {
  state.mapImage = "";
  state.googleMapQuery = "";
  state.googleMapCenter = null;
  state.googleMapZoom = 14;
  state.mapMode = "add";
  saveState();
  render();
});
googleMapForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadGoogleMap(googleMapInput.value);
});
mapModeButton.addEventListener("click", () => {
  state.mapMode = state.mapMode === "browse" ? "add" : "browse";
  saveState();
  render();
});
async function startApp() {
  loadState();
  await migrateInlinePhotosToIndexedDB();
  await loadCloudState().catch((error) => console.warn("Could not load shared map data.", error));

  const initialMapQuery = new URLSearchParams(window.location.search).get("map");
  if (initialMapQuery) {
    loadGoogleMap(initialMapQuery, { updateUrl: false });
  } else {
    render();
  }
}

startApp().catch((error) => {
  window.alert(error.message);
  render();
});
