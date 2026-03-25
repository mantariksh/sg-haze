const POLL_INTERVAL = 60_000;
const SINGAPORE_CENTER = [1.3521, 103.8198];

const STATION_LABELS = {
  nea: {
    west: "NEA West",
    east: "NEA East",
    central: "NEA Central",
    south: "NEA South",
    north: "NEA North",
  },
  aqicn: {
    "seaside-residences": "Seaside Residences",
    "nasa-gsfc-rutgers": "NASA GSFC Rutgers",
  },
};

const SOURCE_LABELS = {
  nea: "NEA",
  aqicn: "AQICN",
  purpleair: "PurpleAir",
};

// NEA PM2.5 1-hr bands
function pm25Band(value) {
  if (value == null) return { band: "—", descriptor: "—", color: "#666" };
  if (value <= 55) return { band: "1", descriptor: "Normal", color: "#50c878" };
  if (value <= 150) return { band: "2", descriptor: "Elevated", color: "#f0c040" };
  if (value <= 250) return { band: "3", descriptor: "High", color: "#ff8c00" };
  return { band: "4", descriptor: "Very High", color: "#ff4444" };
}

function formatVal(v, unit) {
  if (v == null) return "—";
  return `${Math.round(v)} ${unit || ""}`.trim();
}

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  });
}

function formatDateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-SG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  });
}

function stationLabel(r) {
  if (r.station_name) return r.station_name;
  return STATION_LABELS[r.source]?.[r.station] ?? r.station;
}

// --- Map setup ---
const SG_BOUNDS = L.latLngBounds([1.27, 103.68], [1.43, 103.98]);
const map = L.map("map", {
  zoomControl: true,
}).fitBounds(SG_BOUNDS, { padding: [10, 10] });

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  maxZoom: 18,
}).addTo(map);

// Legend
const legend = L.control({ position: "bottomright" });
legend.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  L.DomEvent.disableClickPropagation(div);

  const toggleRow = L.DomUtil.create("div", "legend-toggle-row", div);

  const toggle = L.DomUtil.create("button", "legend-toggle", toggleRow);
  toggle.textContent = "Legend";
  toggle.setAttribute("aria-label", "Toggle legend");

  const close = L.DomUtil.create("button", "legend-close", toggleRow);
  close.textContent = "\u00d7";
  close.setAttribute("aria-label", "Close legend");
  close.addEventListener("click", () => {
    div.classList.remove("legend-open");
  });

  const body = L.DomUtil.create("div", "legend-body", div);
  body.innerHTML = `
    <div class="legend-title">NEA PM2.5 bands</div>
    <div class="legend-item"><span class="legend-color" style="background:#50c878"></span> Normal (0\u201355)</div>
    <div class="legend-item"><span class="legend-color" style="background:#f0c040"></span> Elevated (56\u2013150)</div>
    <div class="legend-item"><span class="legend-color" style="background:#ff8c00"></span> High (151\u2013250)</div>
    <div class="legend-item"><span class="legend-color" style="background:#ff4444"></span> Very High (\u2265251)</div>
  `;

  toggle.addEventListener("click", () => {
    div.classList.toggle("legend-open");
  });

  return div;
};
legend.addTo(map);

// Markers layer
const markers = {};
const clusterGroup = L.markerClusterGroup({
  maxClusterRadius: 40,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  iconCreateFunction(cluster) {
    const children = cluster.getAllChildMarkers();
    const values = children.map((m) => m._pm25Value).filter((v) => v != null);
    const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : "—";
    const band = pm25Band(avg === "—" ? null : avg);
    return L.divIcon({
      className: "",
      html: `<div class="cluster-icon" style="background:${band.color};color:#fff">
        <span>${avg}</span>
        <small>${values.length} sensors</small>
      </div>`,
      iconSize: [52, 36],
      iconAnchor: [26, 18],
    });
  },
});
map.addLayer(clusterGroup);

function createMarkerIcon(source, color, pm25Value) {
  const label = pm25Value != null ? Math.round(pm25Value) : "—";
  const sourceTag = source === "nea" ? "NEA" : "non-gov";
  const shape = `<circle cx="30" cy="20" r="16" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2.5"/>`;

  return L.divIcon({
    className: "",
    html: `<div class="map-marker">
      <svg width="60" height="52" viewBox="0 0 60 52">${shape}</svg>
      <span class="marker-label" style="color:${color}">${label}</span>
      <span class="marker-source" style="color:${color}">${sourceTag}</span>
    </div>`,
    iconSize: [60, 52],
    iconAnchor: [30, 26],
    popupAnchor: [0, -26],
  });
}

// Primary PM2.5 value and label per source
function primaryPm25(r) {
  if (r.source === "purpleair" && r.pm25_realtime != null) {
    return { value: r.pm25_realtime, label: "real-time" };
  }
  if (r.source === "aqicn") {
    return { value: r.pm25_1hr, label: "real-time" };
  }
  return { value: r.pm25_1hr, label: "1-hr avg" };
}

function popupContent(r) {
  const label = stationLabel(r);
  const sourceLabel = SOURCE_LABELS[r.source];
  const primary = primaryPm25(r);
  const band = pm25Band(primary.value);

  const rows = [];
  if (primary.value != null) rows.push([`PM2.5 (${primary.label})`, `${Math.round(primary.value)} \u00b5g/m\u00b3`]);
  if (r.source === "purpleair" && r.pm25_1hr != null) rows.push(["PM2.5 (1-hr avg)", `${Math.round(r.pm25_1hr)} \u00b5g/m\u00b3`]);
  if (r.pm25_24hr != null) rows.push(["PM2.5 (24-hr avg)", `${Math.round(r.pm25_24hr)} \u00b5g/m\u00b3`]);
  const pm10Label = r.source === "nea" ? "PM10 (24-hr avg)" : "PM10 (real-time)";
  if (r.pm10_24hr != null) rows.push([pm10Label, `${Math.round(r.pm10_24hr)} \u00b5g/m\u00b3`]);
  if (r.o3_8hr != null) rows.push(["O\u2083 (8-hr avg)", `${Math.round(r.o3_8hr)} \u00b5g/m\u00b3`]);
  if (r.psi != null) rows.push(["PSI (24-hr)", Math.round(r.psi)]);

  const detailsHtml = rows
    .map(([k, v]) => `<tr><td class="popup-key">${k}</td><td class="popup-val">${v}</td></tr>`)
    .join("");

  return `
    <div class="popup-title">${label}</div>
    <div class="popup-value" style="color:${band.color}">${primary.value != null ? Math.round(primary.value) : "—"}</div>
    <div class="popup-unit">\u00b5g/m\u00b3 PM2.5 (${primary.label})</div>
    <div class="popup-band" style="color:${band.color}">${band.descriptor}</div>
    <table class="popup-table">${detailsHtml}</table>
    <div class="popup-meta">Source: ${sourceLabel}</div>
    <div class="popup-meta">Updated: ${formatTime(r.timestamp)}</div>
  `;
}

function updateMarkers(readings) {
  const seenKeys = new Set();

  for (const r of readings) {
    const key = `${r.source}-${r.station}`;
    seenKeys.add(key);
    const primary = primaryPm25(r);
    const band = pm25Band(primary.value);
    const icon = createMarkerIcon(r.source, band.color, primary.value);

    if (markers[key]) {
      markers[key].setIcon(icon).setPopupContent(popupContent(r));
      markers[key]._pm25Value = primary.value;
    } else {
      const marker = L.marker([r.latitude, r.longitude], { icon })
        .bindPopup(popupContent(r));
      marker._pm25Value = primary.value;
      clusterGroup.addLayer(marker);
      markers[key] = marker;
    }
  }
}

// --- Fetch & poll ---
async function fetchReadings() {
  try {
    const res = await fetch("/api/readings");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    updateMarkers(data.readings);
    document.getElementById("status").textContent =
      `Last updated: ${formatTime(data.fetchedAt)}`;
  } catch (err) {
    console.error("Failed to fetch readings:", err);
    document.getElementById("status").textContent = `Error: ${err.message}`;
  }
}

// --- History ---
let historyPage = 1;

async function fetchHistory(page) {
  historyPage = page || 1;
  const date = document.getElementById("history-date").value;
  const from = document.getElementById("history-from").value;
  const to = document.getElementById("history-to").value;

  if (!date) return;

  const params = new URLSearchParams();
  params.set("from", date + "T" + (from || "00:00") + ":00+08:00");
  params.set("to", date + "T" + (to || "23:59") + ":59+08:00");
  params.set("page", historyPage);

  try {
    const res = await fetch(`/api/history?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const tbody = document.getElementById("history-body");
    if (data.readings.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="color:#666;text-align:center">No historical data yet</td></tr>';
      document.getElementById("history-pagination").innerHTML = "";
      return;
    }

    tbody.innerHTML = data.readings
      .map((r) => {
        const badge = r.source === "nea" ? "badge-nea" : "badge-community";
        const band = pm25Band(r.pm25_1hr);
        return `<tr>
          <td>${formatDateTime(r.timestamp)}</td>
          <td>${stationLabel(r)}</td>
          <td><span class="badge ${badge}">${r.source}</span></td>
          <td style="color:${band.color}">${formatVal(r.pm25_1hr, "\u00b5g/m\u00b3")}</td>
          <td style="color:${band.color}">${band.descriptor}</td>
          <td>${formatVal(r.pm10_24hr, "\u00b5g/m\u00b3")}</td>
        </tr>`;
      })
      .join("");

    const pag = document.getElementById("history-pagination");
    pag.innerHTML = `
      <button ${data.page <= 1 ? "disabled" : ""} onclick="fetchHistory(${data.page - 1})">&laquo; Prev</button>
      <span>Page ${data.page} of ${data.totalPages}</span>
      <button ${data.page >= data.totalPages ? "disabled" : ""} onclick="fetchHistory(${data.page + 1})">Next &raquo;</button>
    `;
  } catch (err) {
    console.error("Failed to fetch history:", err);
  }
}

document.getElementById("history-btn").addEventListener("click", () => fetchHistory(1));

// Set default history date to today
const todaySGT = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
document.getElementById("history-date").value = todaySGT;
document.getElementById("history-from").value = "00:00";
document.getElementById("history-to").value = "23:59";

// Start polling
fetchReadings();
setInterval(fetchReadings, POLL_INTERVAL);
