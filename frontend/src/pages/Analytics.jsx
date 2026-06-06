import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "../hooks/useApi";

const METRICS = ["closingPrice", "openingPrice", "highPrice", "lowPrice", "volume", "adjClosingPrice"];

export default function Analytics() {
  const [assets, setAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState("");
  const [metric, setMetric] = useState("closingPrice");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.assets.list().then((a) => { setAssets(a); if (a.length) setSelectedAsset(a[0].logicalAssetId); });
  }, []);

  async function runAnalysis() {
    if (!selectedAsset) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.analytics.analyze({ logicalAssetId: selectedAsset, metric, startDate: startDate || undefined, endDate: endDate || undefined });
      setAnalysis(result);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  const chartData = analysis?.rawSeries?.map((p) => ({
    date: new Date(p.timestamp?._seconds * 1000 || p.timestamp).toLocaleDateString(),
    value: p.value,
  })) || [];

  const ma7Data = analysis?.movingAverages?.ma7?.map((p) => ({
    date: new Date(p.timestamp?._seconds * 1000 || p.timestamp).toLocaleDateString(),
    ma: p.ma,
  })) || [];

  // Merge chart data
  const merged = chartData.map((p, i) => ({
    ...p,
    ma7: ma7Data[i]?.ma,
  }));

  const assetName = assets.find((a) => a.logicalAssetId === selectedAsset)?.symbol || "";

  return (
    <div>
      <div className="page-title">Analytics</div>
      <div className="page-subtitle">Time series analysis, forecasts, and risk signals</div>

      {/* Controls */}
      <div className="card section">
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <div className="text-sm" style={{ marginBottom: 6 }}>Asset</div>
            <select className="input" value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)}>
              {assets.map((a) => <option key={a.logicalAssetId} value={a.logicalAssetId}>{a.symbol} ({a.assetClass})</option>)}
            </select>
          </div>
          <div>
            <div className="text-sm" style={{ marginBottom: 6 }}>Metric</div>
            <select className="input" value={metric} onChange={(e) => setMetric(e.target.value)}>
              {METRICS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div className="text-sm" style={{ marginBottom: 6 }}>From</div>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <div className="text-sm" style={{ marginBottom: 6 }}>To</div>
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={runAnalysis} disabled={loading} style={{ height: 40 }}>
            {loading ? "..." : "Analyze"}
          </button>
        </div>
      </div>

      {error && <div style={{ color: "var(--danger)", marginBottom: 16, fontFamily: "var(--font-mono)", fontSize: 13 }}>{error}</div>}

      {analysis && !analysis.error && (
        <>
          {/* Stats Grid */}
          <div className="grid-4 section">
            {[
              { label: "Change %", value: `${analysis.stats.changePct > 0 ? "+" : ""}${analysis.stats.changePct}%`, up: analysis.stats.changePct > 0 },
              { label: "Min", value: analysis.stats.min?.toFixed(4) },
              { label: "Max", value: analysis.stats.max?.toFixed(4) },
              { label: "Mean", value: analysis.stats.mean?.toFixed(4) },
            ].map((s) => (
              <div className="card" key={s.label}>
                <div className="card-title">{s.label}</div>
                <div className={`stat-value ${s.up !== undefined ? (s.up ? "text-accent" : "") : ""}`} style={{ fontSize: 22, color: s.up !== undefined ? (s.up ? "var(--accent)" : "var(--danger)") : "var(--text)" }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Risk + Forecast */}
          <div className="grid-2 section">
            <div className="card">
              <div className="card-title">Risk Signal</div>
              <div className="flex" style={{ marginBottom: 12 }}>
                <span className={`badge badge-${analysis.risk?.riskSignal}`} style={{ fontSize: 18, padding: "6px 14px" }}>
                  {analysis.risk?.riskSignal}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div className="text-sm">Daily Volatility</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{analysis.risk?.dailyVolatility}%</div>
                </div>
                <div>
                  <div className="text-sm">Annual Volatility</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{analysis.risk?.annualizedVolatility}%</div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Linear Regression Forecast (next 5 periods)</div>
              {analysis.forecast?.forecasts.map((f) => (
                <div key={f.step} className="flex-between" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="text-sm">Day +{f.step}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--accent2)" }}>{f.predictedValue}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div className="card">
            <div className="card-title">{assetName} — {metric} (last {merged.length} points)</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={merged}>
                <CartesianGrid stroke="rgba(30,45,61,0.5)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#7a90a8", fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#7a90a8", fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8 }}
                  labelStyle={{ color: "var(--text2)", fontSize: 11 }}
                  itemStyle={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
                <Line type="monotone" dataKey="value" stroke="#00d4aa" dot={false} strokeWidth={2} name={metric} />
                <Line type="monotone" dataKey="ma7" stroke="#0088ff" dot={false} strokeWidth={1.5} strokeDasharray="4 2" name="MA(7)" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Std Dev + Data Points */}
          <div className="card mt-24">
            <div className="card-title">Statistics Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {[
                ["Data Points", analysis.stats.count],
                ["Std Deviation", analysis.stats.stdDev],
                ["First Value", analysis.stats.first],
                ["Last Value", analysis.stats.last],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-sm">{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 15 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {analysis?.error && (
        <div className="card" style={{ color: "var(--danger)", fontFamily: "var(--font-mono)" }}>
          {analysis.error}
        </div>
      )}
    </div>
  );
}
