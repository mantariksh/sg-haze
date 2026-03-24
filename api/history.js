import { getDb } from "../lib/db.js";
import { trackRequest } from "../lib/metrics.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  trackRequest("/api/history").catch(() => {});

  const { from, to, station, source, page } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSize = 20;

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

  // Count total for pagination
  const countSql = sql.replace(/^SELECT[\s\S]*?FROM/, "SELECT COUNT(*) as total FROM");
  const offset = (pageNum - 1) * pageSize;
  sql += ` ORDER BY timestamp DESC LIMIT ${pageSize} OFFSET ${offset}`;

  try {
    const db = getDb();
    const [result, countResult] = await Promise.all([
      db.execute({ sql, args }),
      db.execute({ sql: countSql, args }),
    ]);
    const total = countResult.rows[0].total;

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=60"
    );
    return res.status(200).json({
      readings: result.rows,
      page: pageNum,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error("Error querying history:", err);
    return res.status(500).json({ error: "Failed to query history" });
  }
}
