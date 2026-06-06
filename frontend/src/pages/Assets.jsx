import React, { useEffect, useState } from "react";
import { api } from "../hooks/useApi";

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ symbol: "", assetClass: "stock", description: "", region: "", specificAttributes: "{}" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.assets.list();
      setAssets(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function selectAsset(id) {
    const [detail, hist] = await Promise.all([api.assets.get(id), api.assets.history(id)]);
    setSelected(detail);
    setHistory(hist);
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      let attrs = {};
      try { attrs = JSON.parse(form.specificAttributes); } catch {}
      await api.assets.create({ ...form, specificAttributes: attrs });
      setShowCreate(false);
      setForm({ symbol: "", assetClass: "stock", description: "", region: "", specificAttributes: "{}" });
      await load();
    } catch (e) { setError(e.message); }
  }

  async function handleDelete(id) {
    if (!window.confirm("Mark as deleted? (temporal - record preserved)")) return;
    await api.assets.delete(id);
    setSelected(null);
    await load();
  }

  if (loading) return <div style={{ color: "var(--text2)", padding: 40 }}>Loading assets...</div>;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 24 }}>
        <div>
          <div className="page-title">Assets</div>
          <div className="page-subtitle">Financial instruments registry with temporal versioning</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "+ New Asset"}
        </button>
      </div>

      {error && <div style={{ color: "var(--danger)", marginBottom: 16, fontFamily: "var(--font-mono)", fontSize: 13 }}>{error}</div>}

      {showCreate && (
        <div className="card section">
          <div className="card-title">Create New Asset</div>
          <form onSubmit={handleCreate} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input className="input" placeholder="Symbol (e.g. AAPL)" value={form.symbol} onChange={e => setForm(f => ({...f, symbol: e.target.value}))} required />
            <select className="input" value={form.assetClass} onChange={e => setForm(f => ({...f, assetClass: e.target.value}))}>
              {["stock", "crypto", "commodity", "forex", "bond", "derivative", "index"].map(c => <option key={c}>{c}</option>)}
            </select>
            <input className="input" placeholder="Description" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
            <input className="input" placeholder="Region (e.g. US)" value={form.region} onChange={e => setForm(f => ({...f, region: e.target.value}))} />
            <div style={{ gridColumn: "1 / -1" }}>
              <input className="input" placeholder='Specific attributes JSON (e.g. {"exchange":"NYSE"})' value={form.specificAttributes} onChange={e => setForm(f => ({...f, specificAttributes: e.target.value}))} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ gridColumn: "1 / -1" }}>Create Asset</button>
          </form>
        </div>
      )}

      <div className="grid-2">
        {/* Asset List */}
        <div className="card">
          <div className="card-title">All Assets ({assets.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {assets.map((a) => (
              <div key={a.logicalAssetId}
                onClick={() => selectAsset(a.logicalAssetId)}
                style={{
                  padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                  background: selected?.logicalAssetId === a.logicalAssetId ? "rgba(0,212,170,0.1)" : "transparent",
                  border: selected?.logicalAssetId === a.logicalAssetId ? "1px solid rgba(0,212,170,0.3)" : "1px solid transparent",
                  transition: "all 0.15s",
                }}>
                <div className="flex-between">
                  <div className="flex">
                    <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 14 }}>{a.symbol}</span>
                    <span className={`badge badge-${a.assetClass}`}>{a.assetClass}</span>
                  </div>
                  <span className="text-sm">{a.region}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Asset Detail + History */}
        <div>
          {selected ? (
            <>
              <div className="card section">
                <div className="flex-between" style={{ marginBottom: 16 }}>
                  <div className="card-title">Asset Details</div>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px", color: "var(--danger)" }} onClick={() => handleDelete(selected.logicalAssetId)}>
                    Mark Deleted
                  </button>
                </div>
                {[
                  ["Logical Asset ID", selected.logicalAssetId],
                  ["Symbol", selected.symbol],
                  ["Class", selected.assetClass],
                  ["Description", selected.description],
                  ["Region", selected.region],
                  ["Valid From", selected.validFrom ? new Date(selected.validFrom._seconds * 1000 || selected.validFrom).toLocaleString() : "—"],
                  ["Is Deleted", selected.isDeleted ? "Yes" : "No"],
                ].map(([label, value]) => (
                  <div key={label} className="flex-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text2)", fontSize: 12 }}>{label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{value}</span>
                  </div>
                ))}
                {Object.keys(selected.specificAttributes || {}).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ color: "var(--text2)", fontSize: 12, marginBottom: 6 }}>Specific Attributes</div>
                    <pre style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", background: "var(--bg3)", padding: 10, borderRadius: 6, overflow: "auto" }}>
                      {JSON.stringify(selected.specificAttributes, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {history.length > 1 && (
                <div className="card">
                  <div className="card-title">Version History ({history.length} versions)</div>
                  {history.map((v, i) => (
                    <div key={v.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                      <span style={{ color: "var(--text2)" }}>v{i + 1}</span>
                      <span style={{ margin: "0 8px", color: "var(--text)" }}>
                        {new Date(v.validFrom?._seconds * 1000 || v.validFrom).toLocaleString()}
                      </span>
                      {v.isDeleted && <span className="badge badge-HIGH">DELETED</span>}
                      {!v.validTo && !v.isDeleted && <span className="badge badge-LOW">ACTIVE</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text2)" }}>
              Select an asset to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
