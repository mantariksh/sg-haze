import { getDb } from "../lib/db.js";
import { trackRequest } from "../lib/metrics.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  trackRequest("/api/history").catch(() => {});

  const { from, to, station, source } = req.query;

  let sql = `SELECT source, station, timestamp, pm25_1hr, pm25_24hr, pm10_24hr,
    o3_8hr, co_8hr, so2_24hr, no2_1hr, psi, latitude, longitude, collected_at
    FROM readings WHERE 1=1`;
  const args = [];

  if (from) {
    sql += " AND timestamp >= ?";
    args.push(from);
  }
  if (to) {
    sql += " AND timestamp <= ?";
    args.push(to);
  }
  if (station) {
    sql += " AND station = ?";
    args.push(station);
  }
  if (source) {
    sql += " AND source = ?";
    args.push(source);
  }

  sql += " ORDER BY timestamp DESC LIMIT 1000";

  try {
    const db = getDb();
    const result = await db.execute({ sql, args });

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=60"
    );
    return res.status(200).json({ readings: result.rows });
  } catch (err) {
    console.error("Error querying history:", err);
    return res.status(500).json({ error: "Failed to query history" });
  }
}
