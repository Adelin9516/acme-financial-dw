const { insertBatch } = require("./timeSeriesService");

const NASDAQ_BASE = "https://data.nasdaq.com/api/v3";

/**
 * Fetch time series from Nasdaq Data Link and ingest into Firestore.
 * Free tier supports historical EOD data.
 */
async function ingestFromNasdaq({ logicalAssetId, dataSourceId, dataset, ticker, startDate, endDate }) {
  const apiKey = process.env.NASDAQ_API_KEY;
  if (!apiKey) throw new Error("NASDAQ_API_KEY not configured");

  // Nasdaq Data Link endpoint format: /datasets/{database_code}/{dataset_code}/data.json
  const url = new URL(`${NASDAQ_BASE}/datasets/${dataset}/${ticker}/data.json`);
  url.searchParams.set("api_key", apiKey);
  if (startDate) url.searchParams.set("start_date", startDate);
  if (endDate) url.searchParams.set("end_date", endDate);
  url.searchParams.set("order", "asc");

  const fetch = (await import("node-fetch")).default;
  const response = await fetch(url.toString());
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nasdaq API error: ${response.status} - ${text}`);
  }

  const json = await response.json();
  const { data: rows, column_names: columns } = json.dataset_data;

  // Map Nasdaq columns dynamically to our metrics object (heterogeneous data support)
  const dataPoints = rows.map((row) => {
    const metrics = {};
    columns.forEach((col, idx) => {
      if (col.toLowerCase() !== "date") {
        // Normalize common column names
        const normalized = normalizeColumnName(col);
        metrics[normalized] = row[idx];
      }
    });

    return {
      logicalAssetId,
      dataSourceId,
      timestamp: new Date(row[0]), // first column is always Date
      metrics,
    };
  });

  const inserted = await insertBatch(dataPoints);
  return {
    message: `Ingested ${inserted.length} data points from Nasdaq`,
    dataset,
    ticker,
    count: inserted.length,
    period: dataPoints.length ? { from: dataPoints[0].timestamp, to: dataPoints[dataPoints.length - 1].timestamp } : null,
  };
}

function normalizeColumnName(col) {
  const map = {
    "Open": "openingPrice",
    "High": "highPrice",
    "Low": "lowPrice",
    "Close": "closingPrice",
    "Volume": "volume",
    "Adj. Open": "adjOpeningPrice",
    "Adj. High": "adjHighPrice",
    "Adj. Low": "adjLowPrice",
    "Adj. Close": "adjClosingPrice",
    "Adj. Volume": "adjVolume",
    "Ex-Dividend": "exDividend",
    "Split Ratio": "splitRatio",
  };
  return map[col] || col.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}

/**
 * Manual ingest: POST an array of data points directly.
 * Useful for testing or ingesting from other providers.
 */
async function ingestManual({ logicalAssetId, dataSourceId, dataPoints }) {
  const normalized = dataPoints.map((p) => ({
    logicalAssetId,
    dataSourceId,
    timestamp: new Date(p.timestamp || p.date),
    metrics: p.metrics || { ...p, timestamp: undefined, date: undefined },
  }));

  const inserted = await insertBatch(normalized);
  return {
    message: `Manually ingested ${inserted.length} data points`,
    count: inserted.length,
  };
}

module.exports = { ingestFromNasdaq, ingestManual };
