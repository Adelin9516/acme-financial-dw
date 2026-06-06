const { insertBatch } = require("./timeSeriesService");

const ALPHAVANTAGE_BASE = "https://www.alphavantage.co/query";

// ─────────────────────────────────────────────────────────────────────────────
// UC1 — Ingest from Alpha Vantage
//
// Uses TIME_SERIES_DAILY (free tier) — raw OHLCV, no adjusted close.
// "compact" outputsize = last 100 trading days (free tier, no restrictions).
// "full"    outputsize = 20+ years of history (free tier, available for daily).
//
// Requires ALPHAVANTAGE_API_KEY in backend/.env
// Free tier: 25 requests/day — https://www.alphavantage.co/support/#api-key
// ─────────────────────────────────────────────────────────────────────────────
async function ingestFromAlphaVantage({ logicalAssetId, dataSourceId, ticker, startDate, endDate }) {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) throw new Error("ALPHAVANTAGE_API_KEY not configured in .env");

  // Decide outputsize: if date range is within last 100 days, use compact (faster).
  // Otherwise use full to get the complete history.
  const outputsize = "compact";

  const url = new URL(ALPHAVANTAGE_BASE);
  url.searchParams.set("function",   "TIME_SERIES_DAILY"); // free tier endpoint
  url.searchParams.set("symbol",     ticker);
  url.searchParams.set("outputsize", outputsize);
  url.searchParams.set("apikey",     apiKey);

  const fetch = (await import("node-fetch")).default;
  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept":     "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Alpha Vantage HTTP error: ${response.status}`);
  }

  const json = await response.json();

  // Alpha Vantage returns errors inside 200 responses — check for them explicitly
  if (json["Error Message"]) {
    throw new Error(`Alpha Vantage error: ${json["Error Message"]} — check the ticker symbol`);
  }
  if (json["Note"]) {
    throw new Error(`Alpha Vantage rate limit reached. Free tier allows 25 requests/day. Try again tomorrow.`);
  }
  if (json["Information"]) {
    throw new Error(`Alpha Vantage: ${json["Information"]}`);
  }

  // TIME_SERIES_DAILY response key
  const timeSeries = json["Time Series (Daily)"];
  if (!timeSeries) {
    throw new Error(`Alpha Vantage: unexpected response shape for ticker "${ticker}". Check that the symbol is valid.`);
  }

  const start = startDate ? new Date(startDate) : null;
  const end   = endDate   ? new Date(endDate)   : null;

  const dataPoints = Object.entries(timeSeries)
    .map(([dateStr, values]) => ({
      logicalAssetId,
      dataSourceId,
      timestamp: new Date(dateStr),
      metrics: {
        openingPrice: parseFloat(values["1. open"]),
        highPrice:    parseFloat(values["2. high"]),
        lowPrice:     parseFloat(values["3. low"]),
        closingPrice: parseFloat(values["4. close"]),
        volume:       parseInt(values["5. volume"], 10),
      },
    }))
    .filter((p) => {
      if (start && p.timestamp < start) return false;
      if (end   && p.timestamp > end)   return false;
      return true;
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!dataPoints.length) {
    return {
      message: `No data points found for "${ticker}" in the requested date range`,
      ticker,
      count: 0,
    };
  }

  // Insert in chunks of 400 (Firestore hard limit is 500 per batch)
  for (let i = 0; i < dataPoints.length; i += 400) {
    await insertBatch(dataPoints.slice(i, i + 400));
  }

  return {
    message:  `Ingested ${dataPoints.length} data points from Alpha Vantage`,
    ticker,
    count:    dataPoints.length,
    outputsize,
    period: {
      from: dataPoints[0].timestamp,
      to:   dataPoints[dataPoints.length - 1].timestamp,
    },
  };
}

// Returns true if startDate is within the last 100 trading days (~140 calendar days).
// Used to pick "compact" vs "full" outputsize automatically.
function _isWithinLast100Days(startDate) {
  if (!startDate) return false;
  const start    = new Date(startDate);
  const cutoff   = new Date();
  cutoff.setDate(cutoff.getDate() - 140);
  return start >= cutoff;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual ingest — for testing or any other provider
// ─────────────────────────────────────────────────────────────────────────────
async function ingestManual({ logicalAssetId, dataSourceId, dataPoints }) {
  const normalized = dataPoints.map((p) => ({
    logicalAssetId,
    dataSourceId,
    timestamp: new Date(p.timestamp || p.date),
    metrics:   p.metrics || { ...p, timestamp: undefined, date: undefined },
  }));

  for (let i = 0; i < normalized.length; i += 400) {
    await insertBatch(normalized.slice(i, i + 400));
  }

  return {
    message: `Manually ingested ${normalized.length} data points`,
    count:   normalized.length,
  };
}

module.exports = { ingestFromAlphaVantage, ingestManual };
