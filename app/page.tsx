import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase().trim();

  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Missing FINNHUB_API_KEY on server" }, { status: 500 });
  }

  const url =
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}` +
    `&token=${encodeURIComponent(key)}`;

  const upstream = await fetch(url, { cache: "no-store" });
  const data = await upstream.json();

  return NextResponse.json(data, {
    status: upstream.status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
