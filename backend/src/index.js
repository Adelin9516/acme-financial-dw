require("dotenv").config();
const express = require("express");
const cors = require("cors");

const assetsRouter = require("./routes/assets");
const dataSourcesRouter = require("./routes/dataSources");
const timeSeriesRouter = require("./routes/timeSeries");
const ingestRouter = require("./routes/ingest");
const analyticsRouter = require("./routes/analytics");
const llmRouter = require("./routes/llm");
const mcpRouter = require("./routes/mcp");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), service: "Acme Financial DWH" });
});

// API Routes
app.use("/api/assets", assetsRouter);
app.use("/api/data-sources", dataSourcesRouter);
app.use("/api/time-series", timeSeriesRouter);
app.use("/api/ingest", ingestRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/llm", llmRouter);
app.use("/mcp", mcpRouter);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Acme Financial DWH running on http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api`);
  console.log(`🤖 MCP: http://localhost:${PORT}/mcp`);
});

module.exports = app;
