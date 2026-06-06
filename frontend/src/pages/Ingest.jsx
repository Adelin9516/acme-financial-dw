import React, { useEffect, useState } from "react";
import { api } from "../hooks/useApi";

export default function Ingest() {
  const [assets, setAssets] = useState([]);
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState({ logicalAssetId: "", dataSourceId: "", dataset: "WIKI", ticker: "AAPL", startDate: "2020-01-01", endDate: "2024-12-31" });
  const [manualForm, setManualForm] = useState({ logicalAssetId: "", dataSourceId: "", json: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("nasdaq");

  useEffect(() => {
    Promise.all([api.assets.list(), api.dataSources.list()]).then(([a, s]) => {
      setAssets(a);
      setSources(s);
      if (a.length) setForm((f) => ({ ...f, logicalAssetId: a[0].logicalAssetId }));
      if (a.length) setManualForm((f) => ({ ...f, logicalAssetId: a[0].logicalAssetId }));
      if (s.length) setForm((f) => ({ ...f, dataSourceId: s[0].id }));
      if (s.length) setManualForm((f) => ({ ...f, dataSourceId: s[0].id }));
    });
  }, []);

  async function handleNasdaq(e) {
    e.preventDefault();
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await api.ingest.nasdaq(form);
      setResult(res);
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  async function handleManual(e) {
    e.preventDefault();
    setLoading(true); setError(""); setResult(null);
    try {
      const dataPoints = JSON.parse(manualForm.json);
      const res = await api.ingest.manual({ logicalAssetId: manualForm.logicalAssetId, dataSourceId: manualForm.dataSourceId, dataPoints });
      setResult(res);
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  const exampleJson = JSON.stringify([
    { timestamp: "2024-01-15", metrics: { closingPrice: 185.5, openingPrice: 183.0, volume: 5000000 } },
    { timestamp: "2024-01-16", metrics: { closingPrice: 187.2, openingPrice: 185.5, volume: 4800000 } },
  ], null, 2);

  return (
    <div>
      <div className="page-title">Data Ingest</div>
      <div className="page-subtitle">Import financial time series data from external providers</div>

      {/* Tabs */}
      <div className="flex" style={{ marginBottom: 20, gap: 4 }}>
        {["nasdaq", "manual"].map((t) => (
          <button key={t} className={`btn ${tab === t ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(t)}>
            {t === "nasdaq" ? "Nasdaq Data Link" : "Manual / Other Provider"}
          </button>
        ))}
      </div>

      {error && <div style={{ color: "var(--danger)", marginBottom: 16, fontFamily: "var(--font-mono)", fontSize: 13 }}>{error}</div>}
      {result && (
        <div className="card section" style={{ borderColor: "rgba(0,212,170,0.3)" }}>
          <div style={{ color: "var(--accent)", fontWeight: 600, marginBottom: 8 }}>✓ Ingest Successful</div>
          <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)" }}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      {tab === "nasdaq" && (
        <div className="card">
          <div className="card-title">Ingest from Nasdaq Data Link</div>
          <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
            Requires a Nasdaq API key. Free tier provides historical EOD data. Get yours at{" "}
            <a href="https://data.nasdaq.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent2)" }}>data.nasdaq.com</a>
          </p>
          <form onSubmit={handleNasdaq} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>Asset</div>
              <select className="input" value={form.logicalAssetId} onChange={(e) => setForm((f) => ({ ...f, logicalAssetId: e.target.value }))}>
                {assets.map((a) => <option key={a.logicalAssetId} value={a.logicalAssetId}>{a.symbol}</option>)}
              </select>
            </div>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>Data Source</div>
              <select className="input" value={form.dataSourceId} onChange={(e) => setForm((f) => ({ ...f, dataSourceId: e.target.value }))}>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.vendorName}</option>)}
              </select>
            </div>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>Dataset Code (e.g. WIKI, EOD)</div>
              <input className="input" value={form.dataset} onChange={(e) => setForm((f) => ({ ...f, dataset: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>Ticker Symbol</div>
              <input className="input" value={form.ticker} onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>Start Date</div>
              <input type="date" className="input" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>End Date</div>
              <input type="date" className="input" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ gridColumn: "1 / -1" }}>
              {loading ? "Ingesting..." : "Ingest from Nasdaq"}
            </button>
          </form>
        </div>
      )}

      {tab === "manual" && (
        <div className="card">
          <div className="card-title">Manual / Other Provider Ingest</div>
          <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
            Paste an array of data points as JSON. The <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>metrics</code> object is flexible — include any attributes for that provider.
          </p>
          <form onSubmit={handleManual} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>Asset</div>
              <select className="input" value={manualForm.logicalAssetId} onChange={(e) => setManualForm((f) => ({ ...f, logicalAssetId: e.target.value }))}>
                {assets.map((a) => <option key={a.logicalAssetId} value={a.logicalAssetId}>{a.symbol}</option>)}
              </select>
            </div>
            <div>
              <div className="text-sm" style={{ marginBottom: 6 }}>Data Source</div>
              <select className="input" value={manualForm.dataSourceId} onChange={(e) => setManualForm((f) => ({ ...f, dataSourceId: e.target.value }))}>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.vendorName}</option>)}
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
              {loading ? "Ingesting..." : "Ingest Data"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
