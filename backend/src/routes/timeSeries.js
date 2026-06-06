const express = require("express");
const router = express.Router();
const svc = require("../services/timeSeriesService");

// Q5: Get time series data
router.get("/", async (req, res, next) => {
  try {
    const { logicalAssetId, dataSourceId, startDate, endDate, limit } = req.query;
    if (!logicalAssetId) return res.status(400).json({ error: "logicalAssetId required" });

    const series = await svc.getTimeSeries({
      logicalAssetId,
      dataSourceId,
      startDate,
      endDate,
      limit: limit ? parseInt(limit) : 500,
    });
    res.json(series);
  } catch (err) { next(err); }
});

// Get latest price for an asset
router.get("/latest", async (req, res, next) => {
  try {
    const { logicalAssetId, dataSourceId } = req.query;
    if (!logicalAssetId) return res.status(400).json({ error: "logicalAssetId required" });
    const latest = await svc.getLatestPrice(logicalAssetId, dataSourceId);
    if (!latest) return res.status(404).json({ error: "No data found" });
    res.json(latest);
  } catch (err) { next(err); }
});

// Manual insert single point
router.post("/", async (req, res, next) => {
  try {
    const point = await svc.insertTimeSeriesPoint(req.body);
    res.status(201).json(point);
  } catch (err) { next(err); }
});

// Batch insert
router.post("/batch", async (req, res, next) => {
  try {
    const { dataPoints } = req.body;
    if (!Array.isArray(dataPoints)) return res.status(400).json({ error: "dataPoints array required" });
    const result = await svc.insertBatch(dataPoints);
    res.status(201).json({ inserted: result.length });
  } catch (err) { next(err); }
});

module.exports = router;
