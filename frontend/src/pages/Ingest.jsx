import React, { useEffect, useState } from "react";
import { api } from "../hooks/useApi";

export default function Ingest() {
  const [assets, setAssets]           = useState([]);
  const [sources, setSources]         = useState([]);
  const [form, setForm]               = useState({
    logicalAssetId: "",
    dataSourceId:   "",
    ticker:         "AAPL",
    startDate:      "2026-01-01",
    endDate:        "2026-02-31",
  });
  const [manualForm, setManualForm]   = useState({ logicalAssetId: "", dataSourceId: "", json: "" });
  const [result, setResult]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [tab, setTab]                 = useState("alphavantage");

  useEffect(() => {
    Promise.all([api.assets.list(), api.dataSources.list()]).then(([a, s]) => {
      setAssets(a);
      setSources(s);
      if (a.length) {
        setForm((f)       => ({ ...f, logicalAssetId: a[0].logicalAssetId }));
        setManualForm((f) => ({ ...f, logicalAssetId: a[0].logicalAssetId }));
      }
      if (s.length) {
        setForm((f)       => ({ ...f, dataSourceId: s[0].id }));
        setManualForm((f) => ({ ...f, dataSourceId: s[0].id }));
      }
    });
  }, []);

  async function handleAlphaVantage(e) {
    e.preventDefault();
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await api.ingest.alphavantage(form);
      setResult(res);
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  async function handleManual(e) {
    e.preventDefault();
    setLoading(true); setError(""); setResult(null);
    try {
      const dataPoints = JSON.parse(manualForm.json);
      const res = await api.ingest.manual({
        logicalAssetId: manualForm.logicalAssetId,
        dataSourceId:   manualForm.dataSourceId,
        dataPoints,
      });
      setResult(res);
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  const exampleJson = JSON.stringify([
    { timestamp: "2024-01-15", metrics: { closingPrice: 185.5, openingPrice: 183.0, volume: 5000000 } },
    { timestamp: "2024-01-16", metrics: { closingPrice: 187.2, openingPrice: 185.5, volume: 4800000 } },
  ], null, 2);

  const POPULAR_TICKERS = ["AAPL", "MSFT", "TSLA", "GOOGL", "AMZN", "NVDA", "META", "IBM"];

  return (
    <div>
      <div className="page-title">Data Ingest</div>
      <div className="page-subtitle">Import financial time series data from external providers</div>

      {/* Tabs */}
      <div className="flex" style={{ marginBottom: 20, gap: 4 }}>
        {["alphavantage", "manual"].map((t) => (
          <button
            key={t}
            className={`btn ${tab === t ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab(t)}
          >
            {t === "alphavantage" ? "Alpha Vantage" : "Manual / Other Provider"}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ color: "var(--danger)", marginBottom: 16, fontFamily: "var(--font-mono)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {result && (
        <div className="card section" style={{ borderColor: "rgba(0,212,170,0.3)" }}>
          <div style={{ color: "var(--accent)", fontWeight: 600, marginBottom: 8 }}>✓ Ingest Successful</div>
          <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)" }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {/* ── Alpha Vantage Tab ─────────────────────────────────────────── */}
      {tab === "alphavantage" && (
        <div className="card">
          <div className="card-title">Ingest from Alpha Vantage</div>
          <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
            Requires an Alpha Vantage API key (free tier — 25 requests/day). Get yours at{" "}
            <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noreferrer"
               style={{ color: "var(--accent2)" }}>
              alphavantage.co
            </a>{" "}
            and add <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>ALPHAVANTAGE_API_KEY=your_key</code>{" "}
            to <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>backend/.env</code>.
          </p>

          {/* Quick ticker buttons */}
          <div style={{ marginBottom: 16 }}>
            <div className="text-sm" style={{ marginBottom: 6 }}>Quick select ticker</div>
            <div className="flex" style={{ flexWrap: "wrap", gap: 6 }}>
              {POPULAR_TICKERS.map((t) => (
                <button
                  key={t}
                  className={`btn btn-ghost`}
                  style={{ padding: "4px 10px", fontSize: 12, opacity: form.ticker === t ? 1 : 0.6 }}
                  onClick={() => setForm((f) => ({ ...f, ticker: t }))}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleAlphaVantage} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>Asset</div>
              <select className="input" value={form.logicalAssetId}
                onChange={(e) => setForm((f) => ({ ...f, logicalAssetId: e.target.value }))}>
                {assets.map((a) => (
                  <option key={a.logicalAssetId} value={a.logicalAssetId}>{a.symbol} — {a.assetClass}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>Data Source</div>
              <select className="input" value={form.dataSourceId}
                onChange={(e) => setForm((f) => ({ ...f, dataSourceId: e.target.value }))}>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.vendorName}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>Ticker Symbol</div>
              <input className="input" value={form.ticker}
                onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                placeholder="e.g. AAPL, MSFT, TSLA"
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div className="text-sm" style={{ marginBottom: 6 }}>Start Date</div>
                <input type="date" className="input" value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <div className="text-sm" style={{ marginBottom: 6 }}>End Date</div>
                <input type="date" className="input" value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ gridColumn: "1 / -1" }}>
              {loading ? "Ingesting from Alpha Vantage..." : "⬇ Ingest from Alpha Vantage"}
            </button>
          </form>
        </div>
      )}

      {/* ── Manual Tab ───────────────────────────────────────────────── */}
      {tab === "manual" && (
        <div className="card">
          <div className="card-title">Manual / Other Provider Ingest</div>
          <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
            Paste an array of data points as JSON. The{" "}
            <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>metrics</code>{" "}
            object is flexible — include any attributes for that provider.
          </p>
          <form onSubmit={handleManual} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>Asset</div>
              <select className="input" value={manualForm.logicalAssetId}
                onChange={(e) => setManualForm((f) => ({ ...f, logicalAssetId: e.target.value }))}>
                {assets.map((a) => (
                  <option key={a.logicalAssetId} value={a.logicalAssetId}>{a.symbol}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>Data Source</div>
              <select className="input" value={manualForm.dataSourceId}
                onChange={(e) => setManualForm((f) => ({ ...f, dataSourceId: e.target.value }))}>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.vendorName}</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="text-sm" style={{ marginBottom: 6 }}>Data Points (JSON array)</div>
              <textarea
                className="input"
                style={{ height: 200, resize: "vertical" }}
                placeholder={exampleJson}
                value={manualForm.json}
                onChange={(e) => setManualForm((f) => ({ ...f, json: e.target.value }))}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ gridColumn: "1 / -1" }}>
              {loading ? "Ingesting..." : "⬇ Ingest Data"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
