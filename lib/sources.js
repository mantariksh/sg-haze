const NEA_REGIONS = {
  west: { lat: 1.35735, lng: 103.7 },
  east: { lat: 1.35735, lng: 103.94 },
  central: { lat: 1.35735, lng: 103.82 },
  south: { lat: 1.29587, lng: 103.82 },
  north: { lat: 1.41803, lng: 103.82 },
};

export async function fetchNea() {
  const [psiRes, pm25Res] = await Promise.all([
    fetch("https://api-open.data.gov.sg/v2/real-time/api/psi", {
      headers: { "x-api-key": process.env.NEA_API_KEY },
    }),
    fetch("https://api-open.data.gov.sg/v2/real-time/api/pm25", {
      headers: { "x-api-key": process.env.NEA_API_KEY },
    }),
  ]);

  if (!psiRes.ok) throw new Error(`NEA PSI API returned ${psiRes.status}`);
  if (!pm25Res.ok) throw new Error(`NEA PM2.5 API returned ${pm25Res.status}`);

  const psi = await psiRes.json();
  const pm25 = await pm25Res.json();

  const psiItem = psi.data.items[0];
  const pm25Item = pm25.data.items[0];
  const readings = psiItem.readings;

  return Object.entries(NEA_REGIONS).map(([region, coords]) => ({
    source: "nea",
    station: region,
    timestamp: psiItem.timestamp,
    pm25_1hr: pm25Item?.readings?.pm25_one_hourly?.[region] ?? null,
    pm25_24hr: readings.pm25_twenty_four_hourly[region],
    pm10_24hr: readings.pm10_twenty_four_hourly[region],
    o3_8hr: readings.o3_eight_hour_max[region],
    co_8hr: readings.co_eight_hour_max[region],
    so2_24hr: readings.so2_twenty_four_hourly[region],
    no2_1hr: readings.no2_one_hour_max[region],
    psi: readings.psi_twenty_four_hourly[region],
    latitude: coords.lat,
    longitude: coords.lng,
    raw_json: JSON.stringify({ psi: psiItem, pm25: pm25Item }),
  }));
}

const AQICN_STATIONS = [
  { id: "A538438", name: "seaside-residences" },
  { id: "A477646", name: "nasa-gsfc-rutgers" },
];

// Convert US EPA AQI sub-index back to PM2.5 concentration (µg/m³)
const PM25_BREAKPOINTS = [
  { aqiLo: 0, aqiHi: 50, concLo: 0, concHi: 12.0 },
  { aqiLo: 51, aqiHi: 100, concLo: 12.1, concHi: 35.4 },
  { aqiLo: 101, aqiHi: 150, concLo: 35.5, concHi: 55.4 },
  { aqiLo: 151, aqiHi: 200, concLo: 55.5, concHi: 150.4 },
  { aqiLo: 201, aqiHi: 300, concLo: 150.5, concHi: 250.4 },
  { aqiLo: 301, aqiHi: 500, concLo: 250.5, concHi: 500.4 },
];

const PM10_BREAKPOINTS = [
  { aqiLo: 0, aqiHi: 50, concLo: 0, concHi: 54 },
  { aqiLo: 51, aqiHi: 100, concLo: 55, concHi: 154 },
  { aqiLo: 101, aqiHi: 150, concLo: 155, concHi: 254 },
  { aqiLo: 151, aqiHi: 200, concLo: 255, concHi: 354 },
  { aqiLo: 201, aqiHi: 300, concLo: 355, concHi: 424 },
  { aqiLo: 301, aqiHi: 500, concLo: 425, concHi: 604 },
];

function aqiToConcentration(aqi, breakpoints) {
  if (aqi == null) return null;
  for (const bp of breakpoints) {
    if (aqi <= bp.aqiHi) {
      const conc = ((aqi - bp.aqiLo) / (bp.aqiHi - bp.aqiLo)) * (bp.concHi - bp.concLo) + bp.concLo;
      return Math.round(conc * 10) / 10;
    }
  }
  return null;
}

export async function fetchAqicn() {
  const results = await Promise.all(
    AQICN_STATIONS.map(async (station) => {
      const res = await fetch(
        `https://api.waqi.info/feed/${station.id}/?token=${process.env.AQICN_TOKEN}`
      );
      if (!res.ok) throw new Error(`AQICN ${station.id} returned ${res.status}`);
      const json = await res.json();
      if (json.status !== "ok") throw new Error(`AQICN ${station.id}: ${json.data}`);

      const data = json.data;
      const pm25Aqi = data.iaqi.pm25?.v ?? null;
      const pm10Aqi = data.iaqi.pm10?.v ?? null;

      return {
        source: "aqicn",
        station: station.name,
        timestamp: data.time.iso,
        pm25_1hr: aqiToConcentration(pm25Aqi, PM25_BREAKPOINTS),
        pm25_24hr: null,
        pm10_24hr: aqiToConcentration(pm10Aqi, PM10_BREAKPOINTS),
        o3_8hr: null,
        co_8hr: null,
        so2_24hr: null,
        no2_1hr: null,
        psi: null,
        latitude: data.city.geo[0],
        longitude: data.city.geo[1],
        raw_json: JSON.stringify(data),
      };
    })
  );
  return results;
}

// Singapore bounding box for PurpleAir
const PA_BOUNDS = { nwlat: 1.47, nwlng: 103.6, selat: 1.22, selng: 104.05 };
const PA_MAX_AGE = 86400; // 24 hours

export async function fetchPurpleAir() {
  const params = new URLSearchParams({
    fields: "sensor_index,name,latitude,longitude,location_type,last_seen,pm2.5,pm2.5_60minute,pm2.5_24hour,pm10.0,humidity,temperature",
    max_age: PA_MAX_AGE,
    nwlat: PA_BOUNDS.nwlat,
    nwlng: PA_BOUNDS.nwlng,
    selat: PA_BOUNDS.selat,
    selng: PA_BOUNDS.selng,
  });

  const res = await fetch(`https://api.purpleair.com/v1/sensors?${params}`, {
    headers: { "X-API-Key": process.env.PURPLEAIR_API_KEY },
  });

  if (!res.ok) throw new Error(`PurpleAir API returned ${res.status}`);
  const json = await res.json();

  const fields = json.fields;
  const idx = (name) => fields.indexOf(name);

  return json.data.map((row) => {
    const lastSeen = row[idx("last_seen")];
    return {
      source: "purpleair",
      station: `pa-${row[idx("sensor_index")]}`,
      station_name: row[idx("name")],
      timestamp: new Date(lastSeen * 1000).toISOString(),
      pm25_1hr: row[idx("pm2.5_60minute")] ?? row[idx("pm2.5")],
      pm25_24hr: row[idx("pm2.5_24hour")] ?? null,
      pm10_24hr: row[idx("pm10.0")] ?? null,
      o3_8hr: null,
      co_8hr: null,
      so2_24hr: null,
      no2_1hr: null,
      psi: null,
      latitude: row[idx("latitude")],
      longitude: row[idx("longitude")],
      location_type: row[idx("location_type")] === 0 ? "outdoor" : "indoor",
      raw_json: JSON.stringify(row),
    };
  });
}
