import { fetchNea, fetchAqicn, fetchPurpleAir } from "../lib/sources.js";
import { trackRequest } from "../lib/metrics.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  trackRequest("/api/readings").catch(() => {});

  try {
    const [nea, aqicn, purpleair] = await Promise.all([
      fetchNea(),
      fetchAqicn(),
      fetchPurpleAir(),
    ]);

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const readings = [...nea, ...aqicn, ...purpleair].filter(
      (r) => new Date(r.timestamp).getTime() > cutoff
    );

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=30"
    );
    return res.status(200).json({
      readings,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error fetching readings:", err);
    return res.status(502).json({ error: "Failed to fetch upstream data" });
  }
}
