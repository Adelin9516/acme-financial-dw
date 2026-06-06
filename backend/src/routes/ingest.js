const express = require("express");
const router = express.Router();
const { ingestFromNasdaq, ingestManual } = require("../services/ingestService");

// UC1: Ingest from Nasdaq Data Link
router.post("/nasdaq", async (req, res, next) => {
  try {
    const { logicalAssetId, dataSourceId, dataset, ticker, startDate, endDate } = req.body;
    if (!logicalAssetId || !dataSourceId || !dataset || !ticker) {
      return res.status(400).json({ error: "logicalAssetId, dataSourceId, dataset, ticker are required" });
    }
    const result = await ingestFromNasdaq({ logicalAssetId, dataSourceId, dataset, ticker, startDate, endDate });
    res.json(result);
  } catch (err) { next(err); }
});

// Manual ingest (for testing / other providers)
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
