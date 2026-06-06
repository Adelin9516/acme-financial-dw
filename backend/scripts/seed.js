require("dotenv").config();
const { createAsset, getAllAssets } = require("../src/services/assetsService");
const { createDataSource, getAllDataSources } = require("../src/services/dataSourcesService");
const { insertBatch } = require("../src/services/timeSeriesService");

function generatePriceSeries(startPrice, days, volatility = 0.02) {
  const series = [];
  let price = startPrice;
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const change = price * volatility * (Math.random() - 0.48);
    price = Math.max(price + change, 0.1);
    const open = price * (1 + (Math.random() - 0.5) * 0.01);
    const high = Math.max(price, open) * (1 + Math.random() * 0.01);
    const low  = Math.min(price, open) * (1 - Math.random() * 0.01);
    series.push({
      timestamp: date,
      metrics: {
        openingPrice:    parseFloat(open.toFixed(2)),
        closingPrice:    parseFloat(price.toFixed(2)),
        highPrice:       parseFloat(high.toFixed(2)),
        lowPrice:        parseFloat(low.toFixed(2)),
        volume:          Math.floor(Math.random() * 10000000 + 1000000),
        adjClosingPrice: parseFloat((price * 0.998).toFixed(2)),
      },
    });
  }
  return series;
}

async function seed() {
  console.log("🌱 Seeding Firestore with sample data...\n");

  // 1. Create data sources
  console.log("Creating data sources...");
  const alphaVantage = await createDataSource({
    vendorName:  "Alpha Vantage",
    apiEndpoint: "https://www.alphavantage.co/query",
    description: "Alpha Vantage free tier - daily adjusted OHLCV data (25 req/day)",
  });
  const bloomberg = await createDataSource({
    vendorName:  "Bloomberg (Mock)",
    apiEndpoint: "https://bloomberg.com/api/mock",
    description: "Bloomberg mock data source for demo purposes",
  });
  console.log(`  ✓ Alpha Vantage: ${alphaVantage.id}`);
  console.log(`  ✓ Bloomberg:     ${bloomberg.id}`);

  // 2. Create assets
  console.log("\nCreating assets...");
  const assets = [
    { symbol: "AAPL",   assetClass: "stock",     description: "Apple Inc.",                 region: "US",     specificAttributes: { exchange: "NASDAQ", sector: "Technology",  isin: "US0378331005" } },
    { symbol: "MSFT",   assetClass: "stock",     description: "Microsoft Corporation",       region: "US",     specificAttributes: { exchange: "NASDAQ", sector: "Technology",  isin: "US5949181045" } },
    { symbol: "TSLA",   assetClass: "stock",     description: "Tesla Inc.",                  region: "US",     specificAttributes: { exchange: "NASDAQ", sector: "Automotive",  isin: "US88160R1014" } },
    { symbol: "BTC-USD",assetClass: "crypto",    description: "Bitcoin / US Dollar",         region: "Global", specificAttributes: { blockchain: "Bitcoin",    maxSupply: 21000000 } },
    { symbol: "ETH-USD",assetClass: "crypto",    description: "Ethereum / US Dollar",        region: "Global", specificAttributes: { blockchain: "Ethereum",   consensus: "PoS" } },
    { symbol: "GC=F",   assetClass: "commodity", description: "Gold Futures",                region: "US",     specificAttributes: { exchange: "COMEX", unit: "troy oz", currency: "USD" } },
    { symbol: "EURUSD", assetClass: "forex",     description: "Euro / US Dollar",            region: "Europe", specificAttributes: { baseCurrency: "EUR", quoteCurrency: "USD" } },
    { symbol: "US10Y",  assetClass: "bond",      description: "US 10-Year Treasury Note",    region: "US",     specificAttributes: { issuer: "US Treasury", couponType: "fixed" } },
  ];

  const createdAssets = [];
  for (const a of assets) {
    const created = await createAsset(a);
    createdAssets.push(created);
    console.log(`  ✓ ${a.symbol} (${a.assetClass}): ${created.logicalAssetId}`);
  }

  // 3. Generate time series data (simulated — realistic prices, 180 days)
  console.log("\nGenerating time series data (180 days each)...");
  const startPrices  = { "AAPL": 175, "MSFT": 380, "TSLA": 200, "BTC-USD": 45000, "ETH-USD": 2500, "GC=F": 1950, "EURUSD": 1.08, "US10Y": 4.25 };
  const volatilities = { "AAPL": 0.015, "MSFT": 0.014, "TSLA": 0.03, "BTC-USD": 0.04, "ETH-USD": 0.045, "GC=F": 0.01, "EURUSD": 0.005, "US10Y": 0.005 };

  for (const asset of createdAssets) {
    const series = generatePriceSeries(startPrices[asset.symbol] || 100, 180, volatilities[asset.symbol] || 0.02);
    const dataPoints = series.map((p) => ({
      logicalAssetId: asset.logicalAssetId,
      dataSourceId:   alphaVantage.id,
      timestamp:      p.timestamp,
      metrics:        p.metrics,
    }));

    // Insert in chunks of 400 (Firestore batch limit is 500)
    for (let i = 0; i < dataPoints.length; i += 400) {
      await insertBatch(dataPoints.slice(i, i + 400));
    }
    console.log(`  ✓ ${asset.symbol}: ${series.length} data points`);
  }

  console.log("\n✅ Seed complete!");
  console.log("\nSummary:");
  console.log(`  Data Sources: Alpha Vantage (${alphaVantage.id}), Bloomberg mock (${bloomberg.id})`);
  console.log("  Assets:", createdAssets.map((a) => `${a.symbol}(${a.logicalAssetId.slice(0, 8)}...)`).join(", "));
  console.log("\n💡 To ingest live data, use POST /api/ingest/alphavantage with your ALPHAVANTAGE_API_KEY");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
