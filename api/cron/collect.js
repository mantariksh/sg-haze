import { getDb } from "../../lib/db.js";
import { fetchNea, fetchAqicn, fetchPurpleAir } from "../../lib/sources.js";
import { trackRequest } from "../../lib/metrics.js";

export default async function handler(req, res) {
  trackRequest("/api/cron/collect").catch(() => {});

  const authHeader = req.headers["authorization"];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const [nea, aqicn, purpleair] = await Promise.all([fetchNea(), fetchAqicn(), fetchPurpleAir()]);
    const all = [...nea, ...aqicn, ...purpleair];
    const db = getDb();

    const insertSql = `INSERT INTO readings
      (source, station, timestamp, pm25_1hr, pm25_24hr, pm10_24hr, o3_8hr, co_8hr, so2_24hr, no2_1hr, psi, latitude, longitude, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    for (const r of all) {
      await db.execute({
        sql: insertSql,
        args: [
          r.source, r.station, r.timestamp,
          r.pm25_1hr, r.pm25_24hr, r.pm10_24hr, r.o3_8hr, r.co_8hr, r.so2_24hr, r.no2_1hr, r.psi,
          r.latitude, r.longitude, r.raw_json,
        ],
      });
    }

    return res.status(200).json({ inserted: all.length });
  } catch (err) {
    console.error("Cron collect error:", err);
    return res.status(500).json({ error: "Collection failed" });
  }
}
