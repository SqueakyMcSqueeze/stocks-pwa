export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase().trim();

  if (!symbol) {
    return Response.json({ error: "Missing symbol" }, { status: 400 });
  }

  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    return Response.json(
      { error: "Missing FINNHUB_API_KEY on server" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`;

  const upstream = await fetch(url, { cache: "no-store" });
  const text = await upstream.text();

  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
