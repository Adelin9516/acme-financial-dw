const express = require("express");
const router = express.Router();
const { analyzeAsset, compareAssets } = require("../services/analyticsService");

// UC3: Analyze single asset
router.get("/analyze", async (req, res, next) => {
  try {
    const { logicalAssetId, dataSourceId, metric, startDate, endDate } = req.query;
    if (!logicalAssetId) return res.status(400).json({ error: "logicalAssetId required" });
    const result = await analyzeAsset({ logicalAssetId, dataSourceId, metric, startDate, endDate });
    res.json(result);
  } catch (err) { next(err); }
});

// Compare multiple assets
router.post("/compare", async (req, res, next) => {
  try {
    const { assetIds, dataSourceId, metric, startDate, endDate } = req.body;
    if (!assetIds || !Array.isArray(assetIds)) return res.status(400).json({ error: "assetIds array required" });
    const result = await compareAssets({ assetIds, dataSourceId, metric, startDate, endDate });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
