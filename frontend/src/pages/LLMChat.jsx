import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "../hooks/useApi";

const SUGGESTIONS = [
  "List all available financial assets",
  "Analyze AAPL and tell me the risk level",
  "What is the latest closing price for TSLA?",
  "Compare AAPL and MSFT performance",
  "What is the trend for BTC-USD?",
  "Find assets with HIGH risk signals",
];

export default function LLMChat() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hello! I'm the **Acme Financial Assistant**, powered by Gemini. I have direct access to the financial data warehouse — I can list assets, fetch time series, run analytics, compare assets, and explain trends. What would you like to explore?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sendMessage(text) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");

    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const result = await api.llm.chat(newMessages.filter((m) => m.role !== "system"));
      setMessages([...newMessages, { role: "assistant", content: result.content }]);
    } catch (e) {
      setMessages([...newMessages, { role: "assistant", content: `Error: ${e.message}` }]);
    }
    setLoading(false);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <div>
      <div className="page-title">AI Assistant</div>
      <div className="page-subtitle">Powered by Gemini — queries live data from the warehouse</div>

      {messages.length === 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => sendMessage(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="card chat-container">
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chat-message ${m.role}`}>
              <div className="chat-avatar">{m.role === "user" ? "👤" : "🤖"}</div>
              <div className="chat-bubble">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          {loading && (
            <div className="chat-message assistant">
              <div className="chat-avatar">🤖</div>
              <div className="chat-bubble">
                <span className="loading-dot">●</span>{" "}
                <span className="loading-dot">●</span>{" "}
                <span className="loading-dot">●</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-area">
          <textarea
            className="input"
            style={{ resize: "none", height: 44, lineHeight: "26px" }}
            placeholder="Ask about your financial data..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
          />
          <button className="btn btn-primary" onClick={() => sendMessage()} disabled={loading || !input.trim()} style={{ height: 44, whiteSpace: "nowrap" }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
