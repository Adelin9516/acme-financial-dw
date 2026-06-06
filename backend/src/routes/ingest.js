const express = require("express");
const router = express.Router();
const { ingestFromAlphaVantage, ingestManual } = require("../services/ingestService");

// UC1: Ingest from Alpha Vantage (free tier — 25 req/day)
// Get free API key at: https://www.alphavantage.co/support/#api-key
// Then add ALPHAVANTAGE_API_KEY=your_key to backend/.env
router.post("/alphavantage", async (req, res, next) => {
  try {
    const { logicalAssetId, dataSourceId, ticker, startDate, endDate } = req.body;
    if (!logicalAssetId || !dataSourceId || !ticker) {
      return res.status(400).json({ error: "logicalAssetId, dataSourceId, ticker are required" });
    }
    const result = await ingestFromAlphaVantage({ logicalAssetId, dataSourceId, ticker, startDate, endDate });
    res.json(result);
  } catch (err) { next(err); }
});

// Manual ingest (for testing or other providers)
router.post("/manual", async (req, res, next) => {
  try {
    const { logicalAssetId, dataSourceId, dataPoints } = req.body;
    if (!logicalAssetId || !dataSourceId || !dataPoints) {
      return res.status(400).json({ error: "logicalAssetId, dataSourceId, dataPoints are required" });
    }
    const result = await ingestManual({ logicalAssetId, dataSourceId, dataPoints });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
