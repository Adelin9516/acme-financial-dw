const express = require("express");
const router = express.Router();
const { executeTool, TOOLS } = require("../services/llmService");

/**
 * MCP (Model Context Protocol) HTTP server.
 * Exposes the platform's capabilities as tools that any LLM client can call.
 * 
 * Endpoints:
 *   GET  /mcp/tools       - list available tools
 *   POST /mcp/call        - call a tool
 */

// List available MCP tools
router.get("/tools", (req, res) => {
  const tools = TOOLS[0].functionDeclarations.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.parameters,
  }));
  res.json({
    protocol: "mcp",
    version: "1.0",
    tools,
  });
});

// Call an MCP tool
router.post("/call", async (req, res, next) => {
  try {
    const { tool, arguments: args } = req.body;
    if (!tool) return res.status(400).json({ error: "tool name required" });

    const result = await executeTool(tool, args || {});
    res.json({
      tool,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// MCP manifest (for Claude Desktop / other MCP clients)
router.get("/manifest", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json({
    name: "acme-financial-dwh",
    description: "Acme Ltd Financial Data Warehouse - tools for exploring financial market data",
    version: "1.0.0",
    tools_endpoint: `${baseUrl}/mcp/tools`,
    call_endpoint: `${baseUrl}/mcp/call`,
    tools: TOOLS[0].functionDeclarations.map((t) => t.name),
  });
});

module.exports = router;
