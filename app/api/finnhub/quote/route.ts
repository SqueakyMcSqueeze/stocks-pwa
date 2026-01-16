import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const token = process.env.FINNHUB_TOKEN;
  if (!token) return NextResponse.json({ error: "Missing FINNHUB_TOKEN" }, { status: 500 });

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token)}`;
  const r = await fetch(url, { cache: "no-store" });
  const data = await r.json();

  return NextResponse.json(data, { status: r.ok ? 200 : 502 });
}
