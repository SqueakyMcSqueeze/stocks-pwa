import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const resolution = searchParams.get("resolution") ?? "D";

  if (!symbol || !from || !to) {
    return NextResponse.json({ error: "Missing symbol/from/to" }, { status: 400 });
  }

  const token = process.env.FINNHUB_TOKEN;
  if (!token) return NextResponse.json({ error: "Missing FINNHUB_TOKEN" }, { status: 500 });

  const url =
    `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}` +
    `&resolution=${encodeURIComponent(resolution)}` +
    `&from=${encodeURIComponent(from)}` +
    `&to=${encodeURIComponent(to)}` +
    `&token=${encodeURIComponent(token)}`;

  const r = await fetch(url, { cache: "no-store" });
  const data = await r.json();

  return NextResponse.json(data, { status: r.ok ? 200 : 502 });
}
