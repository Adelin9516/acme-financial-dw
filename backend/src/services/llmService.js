const { GoogleGenerativeAI } = require("@google/generative-ai");
const assetsService = require("./assetsService");
const dataSourcesService = require("./dataSourcesService");
const timeSeriesService = require("./timeSeriesService");
const analyticsService = require("./analyticsService");

let genAI;
function getGenAI() {
  if (!genAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not configured");
    genAI = new GoogleGenerativeAI(key);
  }
  return genAI;
}

// Tool definitions for Gemini function calling (MCP-style)
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "list_assets",
        description: "List all financial assets available in the data warehouse. Returns symbol, class, region, and asset ID.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "get_asset_details",
        description: "Get full details of a financial asset by its logical asset ID.",
        parameters: {
          type: "object",
          properties: {
            logicalAssetId: { type: "string", description: "The logical asset ID" },
          },
          required: ["logicalAssetId"],
        },
      },
      {
        name: "list_data_sources",
        description: "List all financial data sources (vendors) available.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "fetch_time_series",
        description: "Fetch time series price data for an asset from a data source.",
        parameters: {
          type: "object",
          properties: {
            logicalAssetId: { type: "string", description: "The logical asset ID" },
            dataSourceId: { type: "string", description: "The data source ID (optional)" },
            startDate: { type: "string", description: "Start date ISO format (optional)" },
            endDate: { type: "string", description: "End date ISO format (optional)" },
          },
          required: ["logicalAssetId"],
        },
      },
      {
        name: "analyze_asset",
        description: "Compute analytics (stats, moving averages, forecast, risk) for an asset.",
        parameters: {
          type: "object",
          properties: {
            logicalAssetId: { type: "string", description: "The logical asset ID" },
            dataSourceId: { type: "string", description: "The data source ID (optional)" },
            metric: { type: "string", description: "Metric to analyze, e.g. closingPrice, volume (default: closingPrice)" },
            startDate: { type: "string" },
            endDate: { type: "string" },
          },
          required: ["logicalAssetId"],
        },
      },
      {
        name: "compare_assets",
        description: "Compare multiple assets side by side with stats and risk signals.",
        parameters: {
          type: "object",
          properties: {
            assetIds: { type: "array", items: { type: "string" }, description: "List of logical asset IDs to compare" },
            metric: { type: "string", description: "Metric to compare (default: closingPrice)" },
            startDate: { type: "string" },
            endDate: { type: "string" },
          },
          required: ["assetIds"],
        },
      },
      {
        name: "summarize_trends",
        description: "Summarize price trends for an asset over a time period.",
        parameters: {
          type: "object",
          properties: {
            logicalAssetId: { type: "string" },
            startDate: { type: "string" },
            endDate: { type: "string" },
          },
          required: ["logicalAssetId"],
        },
      },
    ],
  },
];

// Execute a tool call from Gemini
async function executeTool(name, args) {
  try {
    switch (name) {
      case "list_assets": {
        const assets = await assetsService.getAllAssets();
        return assets.map((a) => ({
          logicalAssetId: a.logicalAssetId,
          symbol: a.symbol,
          assetClass: a.assetClass,
          region: a.region,
          description: a.description,
        }));
      }
      case "get_asset_details": {
        return await assetsService.getAssetById(args.logicalAssetId);
      }
      case "list_data_sources": {
        return await dataSourcesService.getAllDataSources();
      }
      case "fetch_time_series": {
        const series = await timeSeriesService.getTimeSeries({
          logicalAssetId: args.logicalAssetId,
          dataSourceId: args.dataSourceId,
          startDate: args.startDate,
          endDate: args.endDate,
          limit: 100,
        });
        return series.map((p) => ({
          timestamp: p.timestamp,
          metrics: p.metrics,
        }));
      }
      case "analyze_asset": {
        return await analyticsService.analyzeAsset({
          logicalAssetId: args.logicalAssetId,
          dataSourceId: args.dataSourceId,
          metric: args.metric || "closingPrice",
          startDate: args.startDate,
          endDate: args.endDate,
        });
      }
      case "compare_assets": {
        return await analyticsService.compareAssets({
          assetIds: args.assetIds,
          metric: args.metric || "closingPrice",
          startDate: args.startDate,
          endDate: args.endDate,
        });
      }
      case "summarize_trends": {
        const analysis = await analyticsService.analyzeAsset({
          logicalAssetId: args.logicalAssetId,
          startDate: args.startDate,
          endDate: args.endDate,
        });
        return {
          summary: {
            period: analysis.period,
            change: analysis.stats?.change,
            changePct: analysis.stats?.changePct,
            min: analysis.stats?.min,
            max: analysis.stats?.max,
            mean: analysis.stats?.mean,
            riskSignal: analysis.risk?.riskSignal,
            forecastNextDay: analysis.forecast?.forecasts?.[0]?.predictedValue,
          },
        };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

async function chat({ messages, systemPrompt }) {
  const genAIInstance = getGenAI();
  const model = genAIInstance.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction:
      systemPrompt ||
      `You are Acme Financial Assistant, an expert AI that helps users explore and analyze financial market data stored in the Acme Ltd data warehouse.
You have access to tools that let you query real financial data. Always use the tools to fetch actual data before answering.
Be concise, data-driven, and professional. When presenting numbers, format them clearly.
If asked about risk, use the analyze_asset tool and explain the risk signal in plain language.
Today's date context: ${new Date().toISOString().split("T")[0]}.`,
    tools: TOOLS,
  });

  // Convert messages to Gemini format
  let history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // FIX: Ensure the history array strictly begins with a 'user' role
  while (history.length > 0 && history[0].role === "model") {
    history.shift();
  }

  const chat = model.startChat({ history });
  const lastMessage = messages[messages.length - 1];

  let response = await chat.sendMessage(lastMessage.content);
  let result = response.response;

  // Agentic loop: handle tool calls
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (result.functionCalls()?.length && iterations < MAX_ITERATIONS) {
    iterations++;
    const toolCalls = result.functionCalls();
    const toolResults = [];

    for (const call of toolCalls) {
      const toolResult = await executeTool(call.name, call.args);
      toolResults.push({
        functionResponse: {
          name: call.name,
          response: { result: JSON.stringify(toolResult) },
        },
      });
    }

    response = await chat.sendMessage(toolResults);
    result = response.response;
  }

  return {
    content: result.text(),
    toolCallsCount: iterations,
  };
}

module.exports = { chat, executeTool, TOOLS };