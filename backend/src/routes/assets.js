const express = require("express");
const router = express.Router();
const svc = require("../services/assetsService");

// Q1: Get all assets (limited info)
router.get("/", async (req, res, next) => {
  try {
    const assets = await svc.getAllAssets();
    res.json(assets.map((a) => ({
      logicalAssetId: a.logicalAssetId,
      symbol: a.symbol,
      assetClass: a.assetClass,
      region: a.region,
    })));
  } catch (err) { next(err); }
});

// Q2: Get full asset details
router.get("/:logicalAssetId", async (req, res, next) => {
  try {
    const asset = await svc.getAssetById(req.params.logicalAssetId);
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    res.json(asset);
  } catch (err) { next(err); }
});

// Get asset history (all temporal versions)
router.get("/:logicalAssetId/history", async (req, res, next) => {
  try {
    const history = await svc.getAssetHistory(req.params.logicalAssetId);
    res.json(history);
  } catch (err) { next(err); }
});

// Get asset state at a specific point in time
router.get("/:logicalAssetId/at-time", async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "date query param required" });
    const asset = await svc.getAssetAtTime(req.params.logicalAssetId, date);
    if (!asset) return res.status(404).json({ error: "Asset not found at given time" });
    res.json(asset);
  } catch (err) { next(err); }
});

// Create new asset
router.post("/", async (req, res, next) => {
  try {
    const asset = await svc.createAsset(req.body);
    res.status(201).json(asset);
  } catch (err) { next(err); }
});

// Update asset (creates new temporal version)
router.put("/:logicalAssetId", async (req, res, next) => {
  try {
    const asset = await svc.updateAsset(req.params.logicalAssetId, req.body);
    res.json(asset);
  } catch (err) { next(err); }
});

// Soft delete asset (temporal marker)
router.delete("/:logicalAssetId", async (req, res, next) => {
  try {
    const result = await svc.deleteAsset(req.params.logicalAssetId);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
