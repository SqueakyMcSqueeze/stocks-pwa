import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const symbol = String(req.query.symbol || "").toUpperCase().trim();
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return res.status(500).json({ error: "Missing FINNHUB_API_KEY on server" });

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`;
  const upstream = await fetch(url, { cache: "no-store" });
  const text = await upstream.text();

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.status(upstream.status).send(text);
}
