"use client";

import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";

type PortfolioItem = { id: string; symbol: string; name: string; industry?: string; shares: number };

type DividendEvent = {
  id: string;
  symbol: string;
  date: string; // YYYY-MM-DD
  amount: number; // total cash received (EUR)
  note?: string;
};

type DividendSetting = {
  symbol: string;
  annualPerShare: number; // expected annual dividend per share (EUR)
  frequency: "Monthly" | "Quarterly" | "Semi-Annual" | "Annual";
  nextPayDate: string; // YYYY-MM-DD
};

function uid() {
  return crypto.randomUUID();
}

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYmd(s: string): Date {
  return new Date(s + "T00:00:00");
}

function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  const day = x.getDate();
  x.setMonth(x.getMonth() + months);
  if (x.getDate() !== day) x.setDate(0);
  return x;
}

function freqToMonths(freq: DividendSetting["frequency"]) {
  if (freq === "Monthly") return 1;
  if (freq === "Quarterly") return 3;
  if (freq === "Semi-Annual") return 6;
  return 12;
}

function freqCountPerYear(freq: DividendSetting["frequency"]) {
  if (freq === "Monthly") return 12;
  if (freq === "Quarterly") return 4;
  if (freq === "Semi-Annual") return 2;
  return 1;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default function DividendsPage() {
  const [portfolio, setPortfolio] = useState<PortfolioItem[] | null>(null);
  const [events, setEvents] = useState<DividendEvent[] | null>(null);
  const [settings, setSettings] = useState<Record<string, DividendSetting> | null>(null);

  const [symbol, setSymbol] = useState("");
  const [date, setDate] = useState(ymd(new Date()));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const [setSymbol2, setSetSymbol2] = useState("");
  const [annualPerShare, setAnnualPerShare] = useState("");
  const [frequency, setFrequency] = useState<DividendSetting["frequency"]>("Quarterly");
  const [nextPayDate, setNextPayDate] = useState(ymd(new Date()));

  const ready = portfolio !== null && events !== null && settings !== null;

  // Load after mount (prevents wipe bugs)
  useEffect(() => {
    const pfRaw = loadJson<any[]>("portfolio", []);
    // Make it tolerant to shape changes (industry added later)
    const pf: PortfolioItem[] = (pfRaw ?? []).map((x) => ({
      id: String(x.id),
      symbol: String(x.symbol),
      name: String(x.name ?? x.symbol),
      shares: Number(x.shares ?? 0),
      industry: x.industry != null ? String(x.industry) : undefined,
    }));

    setPortfolio(pf);
    setEvents(loadJson<DividendEvent[]>("dividend_events", []));
    setSettings(loadJson<Record<string, DividendSetting>>("dividend_settings", {}));
  }, []);

  useEffect(() => {
    if (events === null) return;
    localStorage.setItem("dividend_events", JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    if (settings === null) return;
    localStorage.setItem("dividend_settings", JSON.stringify(settings));
  }, [settings]);

  const portfolioSymbols = useMemo(() => {
    return (portfolio ?? [])
      .map((p) => p.symbol)
      .filter(Boolean)
      .sort();
  }, [portfolio]);

  const sharesBySymbol = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of portfolio ?? []) map[p.symbol] = Number(p.shares) || 0;
    return map;
  }, [portfolio]);

  function addEvent() {
    if (!ready) return;

    const s = symbol.trim().toUpperCase();
    const a = Number(amount.replace(",", "."));

    if (!s || !date || !Number.isFinite(a) || a <= 0) return;

    setEvents([{ id: uid(), symbol: s, date, amount: a, note: note.trim() || undefined }, ...events!]);

    setSymbol("");
    setAmount("");
    setNote("");
    setDate(ymd(new Date()));
  }

  function delEvent(id: string) {
    if (!ready) return;
    setEvents(events!.filter((e) => e.id !== id));
  }

  function saveSetting() {
    if (!ready) return;

    const s = setSymbol2.trim().toUpperCase();
    const aps = Number(annualPerShare.replace(",", "."));

    if (!s || !nextPayDate || !Number.isFinite(aps) || aps < 0) return;

    const next: DividendSetting = { symbol: s, annualPerShare: aps, frequency, nextPayDate };
    setSettings({ ...settings!, [s]: next });
    setSetSymbol2(s);
  }

  function deleteSetting(sym: string) {
    if (!ready) return;
    const next = { ...settings! };
    delete next[sym];
    setSettings(next);
  }

  // Actual cashflow by month (last 12 months)
  const actualMonthly = useMemo(() => {
    if (!ready) return { labels: [], values: [] };

    const now = new Date();
    const start = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -11);
    const buckets = new Map<string, number>();

    for (let i = 0; i < 12; i++) {
      const d = addMonths(start, i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(k, 0);
    }

    for (const ev of events!) {
      const d = parseYmd(ev.date);
      if (d < start) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + ev.amount);
    }

    const labels = Array.from(buckets.keys());
    const values = labels.map((k) => Number((buckets.get(k) ?? 0).toFixed(2)));
    return { labels, values };
  }, [ready, events]);

  // Forecast next 12 months by month
  const forecastMonthly = useMemo(() => {
    if (!ready) return { labels: [], values: [] };

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const buckets = new Map<string, number>();

    for (let i = 0; i < 12; i++) {
      const d = addMonths(start, i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(k, 0);
    }

    for (const sym of Object.keys(settings!)) {
      const st = settings![sym];
      const shares = sharesBySymbol[sym] ?? 0;
      if (!shares) continue;
      if (!st.nextPayDate) continue;

      const count = freqCountPerYear(st.frequency);
      const perPayment = st.annualPerShare / count;
      const stepMonths = freqToMonths(st.frequency);

      let pay = parseYmd(st.nextPayDate);
      while (pay < start) pay = addMonths(pay, stepMonths);

      const end = addMonths(start, 12);
      while (pay < end) {
        const k = `${pay.getFullYear()}-${String(pay.getMonth() + 1).padStart(2, "0")}`;
        if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + shares * perPayment);
        pay = addMonths(pay, stepMonths);
      }
    }

    const labels = Array.from(buckets.keys());
    const values = labels.map((k) => Number((buckets.get(k) ?? 0).toFixed(2)));
    return { labels, values };
  }, [ready, settings, sharesBySymbol]);

  const chartOption = useMemo(() => {
    if (!ready) return {};

    return {
      tooltip: {
        trigger: "axis",
        valueFormatter: (v: number) => euro.format(Number(v) || 0),
      },
      legend: { type: "scroll" },
      xAxis: { type: "category", data: actualMonthly.labels },
      yAxis: { type: "value" },
      series: [
        { name: "Actual dividends", type: "bar", data: actualMonthly.values },
        { name: "Expected dividends", type: "bar", data: forecastMonthly.values },
      ],
    };
  }, [ready, actualMonthly, forecastMonthly]);

  const totalActual12m = useMemo(() => {
    if (!ready) return 0;
    return actualMonthly.values.reduce((a, b) => a + b, 0);
  }, [ready, actualMonthly]);

  const totalForecast12m = useMemo(() => {
    if (!ready) return 0;
    return forecastMonthly.values.reduce((a, b) => a + b, 0);
  }, [ready, forecastMonthly]);

  return (
    <div>
      <h2>Dividends</h2>

      {!ready ? (
        <div style={{ color: "#666" }}>Loading…</div>
      ) : (
        <>
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Dividend cashflow (Actual vs Expected)</h3>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", color: "#666", marginBottom: 8 }}>
              <div>
                Actual (last 12 months): <b>{euro.format(totalActual12m)}</b>
              </div>
              <div>
                Expected (next 12 months): <b>{euro.format(totalForecast12m)}</b>
              </div>
            </div>
            <ReactECharts option={chartOption as any} style={{ height: 320 }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Add dividend received</h3>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                  <option value="">Symbol…</option>
                  {portfolioSymbols.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

                <input placeholder="Amount (total cash, EUR)" value={amount} onChange={(e) => setAmount(e.target.value)} />

                <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

                <button onClick={addEvent}>Add</button>
              </div>

              <p style={{ color: "#666", marginTop: 10, marginBottom: 0 }}>
                Tip: enter the <b>total cash</b> you received (not per share).
              </p>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Expected dividend settings (forecast)</h3>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <select value={setSymbol2} onChange={(e) => setSetSymbol2(e.target.value)}>
                  <option value="">Symbol…</option>
                  {portfolioSymbols.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <input
                  placeholder="Annual dividend per share (EUR)"
                  value={annualPerShare}
                  onChange={(e) => setAnnualPerShare(e.target.value)}
                />

                <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)}>
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Semi-Annual">Semi-Annual</option>
                  <option value="Annual">Annual</option>
                </select>

                <input type="date" value={nextPayDate} onChange={(e) => setNextPayDate(e.target.value)} />

                <button onClick={saveSetting}>Save</button>
              </div>

              <p style={{ color: "#666", margin: 0 }}>
                Forecast uses your current shares from Portfolio × (annual ÷ frequency).
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Dividend log</h3>

              {(events ?? []).length === 0 ? (
                <div style={{ color: "#666" }}>No dividends logged yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Date</th>
                      <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Symbol</th>
                      <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Amount</th>
                      <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Note</th>
                      <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {events!.map((e) => (
                      <tr key={e.id}>
                        <td style={{ padding: 6 }}>{e.date}</td>
                        <td style={{ padding: 6, fontWeight: 700 }}>{e.symbol}</td>
                        <td style={{ padding: 6 }}>{euro.format(e.amount)}</td>
                        <td style={{ padding: 6 }}>{e.note ?? ""}</td>
                        <td style={{ padding: 6 }}>
                          <button onClick={() => delEvent(e.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Forecast settings</h3>

              {Object.keys(settings!).length === 0 ? (
                <div style={{ color: "#666" }}>No forecast settings yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Symbol</th>
                      <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Annual/share</th>
                      <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Frequency</th>
                      <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}>Next pay</th>
                      <th style={{ borderBottom: "1px solid #ddd", padding: 6 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(settings!)
                      .sort()
                      .map((sym) => {
                        const st = settings![sym];
                        return (
                          <tr key={sym}>
                            <td style={{ padding: 6, fontWeight: 700 }}>{sym}</td>
                            <td style={{ padding: 6 }}>{euro.format(st.annualPerShare)}</td>
                            <td style={{ padding: 6 }}>{st.frequency}</td>
                            <td style={{ padding: 6 }}>{st.nextPayDate}</td>
                            <td style={{ padding: 6 }}>
                              <button onClick={() => deleteSetting(sym)}>Delete</button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
