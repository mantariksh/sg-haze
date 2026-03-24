import { getDb } from "./db.js";

export async function trackRequest(endpoint) {
  const date = new Date().toISOString().slice(0, 10);
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO api_metrics (endpoint, date, count) VALUES (?, ?, 1)
      ON CONFLICT (endpoint, date) DO UPDATE SET count = count + 1`,
    args: [endpoint, date],
  });
}
