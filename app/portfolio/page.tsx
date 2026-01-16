"use client";

import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";

type Item = { id: string; symbol: string; name: string; shares: number };
type Quote = { c?: number; dp?: number };
type RangePreset = "ALL" | "30D" | "90D" | "180D" | "365D";
type PriceLog = Record<string, Record<string, number>>; // symbol -> { YYYY-MM-DD: price }

function uid() {
  return crypto.randomUUID();
}

async function fetchQuote(symbol: string): Promise<Quote> {
  const r = await fetch(`/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`);
  if (!r.ok) throw new Error("Quote failed");
  return r.json();
}

function dayKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function loadPriceLog(): PriceLog {
  try {
    const raw = localStorage.getItem("price_log");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePriceLog(log: PriceLog) {
  try {
    localStorage.setItem("price_log", JSON.stringify(log));
  } catch {
    // ignore
  }
}

function alreadyLoggedToday(log: PriceLog, symbols: string[]) {
  const k = dayKey(new Date());
  for (const s of symbols) {
    if (log?.[s]?.[k] != null) return true;
  }
  return false;
}

function toSeriesFromLog(log: PriceLog, symbol: string): Array<[number, number]> {
  const byDay = log[symbol] ?? {};
  return Object.entries(byDay)
    .map(([k, v]) => [new Date(k + "T00:00:00").getTime(), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

function filterByRange(series: Array<[number, number]>, range: RangePreset): Array<[number, number]> {
  if (range === "ALL") return series;
  const days = range === "30D" ? 30 : range === "90D" ? 90 : range === "180D" ? 180 : 365;
  const cutoff = Date.now() - days * 86400000;
  return series.filter(([t]) => t >= cutoff);
}

export default function PortfolioPage() {
  // IMPORTANT: start null until loaded so we never overwrite localStorage with []
  const [items, setItems] = useState<Item[] | null>(null);
  const itemsLoaded = items !== null;

  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [shares, setShares] = useState("1");

  // Quotes + 5 min cache
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [quotesTs, setQuotesTs] = useState<number>(0);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const QUOTE_CACHE_MS = 5 * 60 * 1000;

  // Local history: null until loaded
  const [priceLog, setPriceLog] = useState<PriceLog | null>(null);

  // Charts
  const [range, setRange] = useState<RangePreset>("365D");
  const [chartMode, setChartMode] = useState<"total" | "normalized">("total");

  // Load items AFTER mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("portfolio");
      setItems(raw ? JSON.parse(raw) : []);
    } catch {
      setItems([]);
    }
  }, []);

  // Save items only AFTER loaded
  useEffect(() => {
    if (!itemsLoaded) return;
    localStorage.setItem("portfolio", JSON.stringify(items));
  }, [itemsLoaded, items]);

  // Load cached quotes + timestamp
  useEffect(() => {
    const rawQ = localStorage.getItem("portfolio_quotes");
    const rawTs = localStorage.getItem("portfolio_quotes_ts");
    if (rawQ) setQuotes(JSON.parse(rawQ));
    if (rawTs) setQuotesTs(Number(rawTs) || 0);
  }, []);

  // Save quotes cache
  useEffect(() => {
    localStorage.setItem("portfolio_quotes", JSON.stringify(quotes));
  }, [quotes]);

  useEffect(() => {
    localStorage.setItem("portfolio_quotes_ts", String(quotesTs));
  }, [quotesTs]);

  // Load price log AFTER mount
  useEffect(() => {
    setPriceLog(loadPriceLog());
  }, []);

  // Save price log only after loaded
  useEffect(() => {
    if (priceLog === null) return;
    savePriceLog(priceLog);
  }, [priceLog]);

  const safeItems = items ?? [];
  const safeLog: PriceLog = priceLog ?? {};

  function add() {
    if (!itemsLoaded) return;

    const s = symbol.trim().toUpperCase();
    const sh = Number(shares.replace(",", "."));
    if (!s || !Number.isFinite(sh) || sh <= 0) return;

    setItems([{ id: uid(), symbol: s, name: name.trim() || s, shares: sh }, ...safeItems]);
    setSymbol("");
    setName("");
    setShares("1");
  }

  function del(id: string) {
    if (!itemsLoaded) return;
    setItems(safeItems.filter((x) => x.id !== id));
  }

  function logTodayFromQuotes(q: Record<string, Quote | null>) {
    if (!itemsLoaded) return;

    const k = dayKey(new Date());
    setPriceLog((prev) => {
      if (prev === null) return prev;
      const next: PriceLog = { ...prev };

      for (const it of safeItems) {
        const p = q[it.symbol]?.c;
        if (p == null) continue;

        if (!next[it.symbol]) next[it.symbol] = {};
        next[it.symbol][k] = p;
      }
      return next;
    });
  }

  async function refreshQuotes(force: boolean = false) {
    if (!itemsLoaded || safeItems.length === 0) return;

    const stale = !quotesTs || Date.now() - quotesTs > QUOTE_CACHE_MS;
    if (!force && !stale) return;

    setLoadingPrices(true);
    const next: Record<string, Quote | null> = {};

    for (const it of safeItems) {
      try {
        next[it.symbol] = await fetchQuote(it.symbol);
      } catch {
        next[it.symbol] = null;
      }
    }

    setQuotes(next);
    setQuotesTs(Date.now());
    setLoadingPrices(false);

    // Log today after refresh (if log loaded)
    if (priceLog !== null) logTodayFromQuotes(next);
  }

  // Auto refresh quotes when items change (only after log loaded)
  useEffect(() => {
    if (!itemsLoaded) return;
    if (priceLog === null) return;
    if (safeItems.length === 0) return;
    refreshQuotes(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsLoaded, priceLog !== null, safeItems.length]);

  // ✅ Automatic daily logging (once/day)
  useEffect(() => {
    if (!itemsLoaded) return;
    if (priceLog === null) return;
    if (safeItems.length === 0) return;

    const symbols = safeItems.map((x) => x.symbol);
    if (alreadyLoggedToday(safeLog, symbols)) return;

    // force refresh + log
    refreshQuotes(true);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsLoaded, priceLog !== null, safeItems.length]);

  const lastUpdated = quotesTs > 0 ? new Date(quotesTs).toLocaleString() : "—";
  const ready = itemsLoaded && priceLog !== null;

  // Build per-symbol series
  const seriesBySymbol = useMemo(() => {
    const out: Record<string, Array<[number, number]>> = {};
    for (const it of safeItems) {
      out[it.symbol] = filterByRange(toSeriesFromLog(safeLog, it.symbol), range);
    }
    return out;
  }, [safeItems, safeLog, range]);

  // Total series (uses current shares across history)
  const totalSeries: Array<[number, number]> = useMemo(() => {
    const allTimes = new Set<number>();
    for (const it of safeItems) for (const p of seriesBySymbol[it.symbol] ?? []) allTimes.add(p[0]);
    const times = Array.from(allTimes).sort((a, b) => a - b);

    const maps: Record<string, Map<number, number>> = {};
    for (const it of safeItems) maps[it.symbol] = new Map((seriesBySymbol[it.symbol] ?? []).map(([t, v]) => [t, v]));

    const out: Array<[number, number]> = [];
    for (const t of times) {
      let total = 0;
      for (const it of safeItems) {
        const p = maps[it.symbol].get(t);
        if (p == null) continue;
        total += p * it.shares;
      }
      out.push([t, total]);
    }
    return out;
  }, [safeItems, seriesBySymbol]);

  // Normalized series
  const normalizedSeries = useMemo(() => {
    return safeItems
      .map((it) => {
        const arr = seriesBySymbol[it.symbol] ?? [];
        if (arr.length < 2) return null;
        const first = arr[0][1];
        if (!first) return null;
        return { name: it.symbol, data: arr.map(([t, v]) => [t, (v / first) * 100] as [number, number]) };
      })
      .filter(Boolean) as Array<{ name: string; data: Array<[number, number]> }>;
  }, [safeItems, seriesBySymbol]);

  const totalOption = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      xAxis: { type: "time" },
      yAxis: { type: "value" },
      series: [{ name: "Total", type: "line", showSymbol: false, data: totalSeries }],
    }),
    [totalSeries]
  );

  const normalizedOption = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      legend: { type: "scroll" },
      xAxis: { type: "time" },
      yAxis: { type: "value" },
      series: normalizedSeries.map((s) => ({ name: s.name, type: "line", showSymbol: false, data: s.data })),
    }),
    [normalizedSeries]
  );

  const hasEnoughHistory =
    chartMode === "total" ? totalSeries.length >= 2 : normalizedSeries.some((s) => s.data.length >= 2);

  return (
    <div>
      <h2>Portfolio</h2>

      {!itemsLoaded ? (
        <div style={{ color: "#666" }}>Loading portfolio…</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input placeholder="Symbol (e.g. AAPL)" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
            <input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <input placeholder="Shares" value={shares} onChange={(e) => setShares(e.target.value)} />
            <button onClick={add}>Add</button>

            <button onClick={() => refreshQuotes(true)} disabled={!ready || loadingPrices || safeItems.length === 0}>
              {loadingPrices ? "Refreshing..." : !ready ? "Loading..." : "Refresh prices (logs today)"}
            </button>

            <span style={{ color: "#666", fontSize: 12, alignSelf: "center" }}>
              Last quote refresh: {lastUpdated}
            </span>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <h3 style={{ margin: "0 0 10px 0" }}>Charts (local history)</h3>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <label>Range:</label>
              <select value={range} onChange={(e) => setRange(e.target.value as RangePreset)}>
                <option value="30D">30D</option>
                <option value="90D">90D</option>
                <option value="180D">180D</option>
                <option value="365D">365D</option>
                <option value="ALL">ALL</option>
              </select>

              <label>Mode:</label>
              <select value={chartMode} onChange={(e) => setChartMode(e.target.value as any)}>
                <option value="total">Total portfolio (local)</option>
                <option value="normalized">Normalized (start=100)</option>
              </select>

              <span style={{ color: "#666", fontSize: 12 }}>Line appears after you have at least 2 logged days.</span>
            </div>

            {!ready ? (
              <div style={{ color: "#666" }}>Loading local history…</div>
            ) : !hasEnoughHistory ? (
              <div style={{ color: "#666" }}>Not enough history yet (need 2 logged days).</div>
            ) : chartMode === "total" ? (
              <ReactECharts option={totalOption as any} style={{ height: 280 }} />
            ) : (
              <ReactECharts option={normalizedOption as any} style={{ height: 280 }} />
            )}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Symbol</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Name</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Shares</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Price</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Day %</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}></th>
              </tr>
            </thead>

            <tbody>
              {safeItems.map((it) => {
                const q = quotes[it.symbol];

                return (
                  <tr key={it.id}>
                    <td style={{ padding: 6, fontWeight: 700 }}>{it.symbol}</td>
                    <td style={{ padding: 6 }}>{it.name}</td>

                    {/* Editable shares */}
                    <td style={{ padding: 6 }}>
                      <input
                        type="number"
                        step="0.01"
                        value={it.shares}
                        onChange={(e) => {
                          if (!itemsLoaded) return;
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          if (v < 0) return;

                          setItems(safeItems.map((x) => (x.id === it.id ? { ...x, shares: v } : x)));
                        }}
                        style={{ width: 90 }}
                      />
                    </td>

                    <td style={{ padding: 6 }}>{q?.c ?? "—"}</td>
                    <td style={{ padding: 6 }}>{q?.dp != null ? `${q.dp.toFixed(2)}%` : "—"}</td>

                    <td style={{ padding: 6 }}>
                      <button onClick={() => del(it.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
