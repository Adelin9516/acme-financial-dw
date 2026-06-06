import React, { useEffect, useState } from "react";
import { api } from "../hooks/useApi";

export default function Dashboard() {
  const [assets, setAssets] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [latestPrices, setLatestPrices] = useState({});

  useEffect(() => {
    Promise.all([api.assets.list(), api.dataSources.list()])
      .then(([a, s]) => {
        setAssets(a);
        setSources(s);
        // Fetch latest prices for all assets
        a.forEach((asset) => {
          api.timeSeries.latest(asset.logicalAssetId)
            .then((p) => setLatestPrices((prev) => ({ ...prev, [asset.logicalAssetId]: p })))
            .catch(() => {});
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const classCounts = assets.reduce((acc, a) => {
    acc[a.assetClass] = (acc[a.assetClass] || 0) + 1;
    return acc;
  }, {});

  if (loading) return <div style={{ color: "var(--text2)", padding: 40 }}>Loading...</div>;

  return (
    <div>
      <div className="page-title">Dashboard</div>
      <div className="page-subtitle">Acme Ltd Financial Data Warehouse</div>

      {/* Stats Row */}
      <div className="grid-4 section">
        {[
          { label: "Total Assets", value: assets.length, icon: "📊" },
          { label: "Data Sources", value: sources.length, icon: "🔌" },
          { label: "Asset Classes", value: Object.keys(classCounts).length, icon: "🏷️" },
          { label: "Active Records", value: assets.length, icon: "✅" },
        ].map((s) => (
          <div className="card" key={s.label}>
            <div className="card-title">{s.icon} {s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Asset Class Breakdown + Data Sources */}
      <div className="grid-2 section">
        <div className="card">
          <div className="card-title">Asset Classes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(classCounts).map(([cls, count]) => (
              <div key={cls} className="flex-between">
                <span className={`badge badge-${cls}`}>{cls}</span>
                <div style={{ flex: 1, margin: "0 12px", height: 4, background: "var(--bg3)", borderRadius: 2 }}>
                  <div style={{ width: `${(count / assets.length) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 2 }} />
                </div>
                <span className="text-mono" style={{ fontSize: 13 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Data Sources</div>
          {sources.map((s) => (
            <div key={s.id} className="flex-between" style={{ marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{s.vendorName}</div>
                <div className="text-sm text-mono">{s.id.slice(0, 16)}...</div>
              </div>
              <span className="badge badge-LOW">active</span>
            </div>
          ))}
        </div>
      </div>

      {/* Latest Prices Table */}
      <div className="card">
        <div className="card-title">Latest Prices</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Class</th>
              <th>Region</th>
              <th>Open</th>
              <th>Close</th>
              <th>Volume</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              const lp = latestPrices[a.logicalAssetId];
              return (
                <tr key={a.logicalAssetId}>
                  <td style={{ fontWeight: 700, color: "var(--accent)" }}>{a.symbol}</td>
                  <td><span className={`badge badge-${a.assetClass}`}>{a.assetClass}</span></td>
                  <td>{a.region}</td>
                  <td>{lp ? (typeof (lp.metrics?.openingPrice ?? lp.metrics?.open) === 'number' ? `$${(lp.metrics?.openingPrice ?? lp.metrics?.open).toFixed(2)}` : "—") : <span className="text-sm">—</span>}</td>
                  <td>{lp ? (typeof lp.metrics?.closingPrice === 'number' ? `$${lp.metrics.closingPrice.toFixed(2)}` : "—") : <span className="text-sm">—</span>}</td>
                  <td>{lp ? (typeof lp.metrics?.volume === 'number' ? lp.metrics.volume.toLocaleString() : (lp.metrics?.volume ? lp.metrics.volume : "—")) : "—"}</td>
                  <td className="text-sm">{lp ? new Date(lp.timestamp?._seconds ? lp.timestamp._seconds * 1000 : lp.timestamp).toLocaleDateString() : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
