import React, { useState } from "react";
import Dashboard from "./pages/Dashboard";
import Assets from "./pages/Assets";
import Analytics from "./pages/Analytics";
import Ingest from "./pages/Ingest";
import LLMChat from "./pages/LLMChat";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "⬛" },
  { id: "assets", label: "Assets", icon: "📋" },
  { id: "analytics", label: "Analytics", icon: "📈" },
  { id: "ingest", label: "Ingest Data", icon: "⬇️" },
  { id: "ai", label: "AI Assistant", icon: "🤖" },
];

export default function App() {
  const [page, setPage] = useState("dashboard");

  const pages = { dashboard: Dashboard, assets: Assets, analytics: Analytics, ingest: Ingest, ai: LLMChat };
  const Page = pages[page];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Acme DWH</h1>
          <span>Financial Markets</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
              <span>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text2)", fontFamily: "var(--font-mono)", lineHeight: 1.6 }}>
            <div>Gemini 1.5 Flash</div>
            <div>Firestore NoSQL</div>
            <div style={{ color: "var(--accent)", marginTop: 4 }}>v1.0.0</div>
          </div>
        </div>
      </aside>
      <main className="main">
        <Page />
      </main>
    </div>
  );
}
