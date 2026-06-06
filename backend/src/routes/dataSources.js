const express = require("express");
const router = express.Router();
const svc = require("../services/dataSourcesService");

// Q3: Get all data sources (limited info)
router.get("/", async (req, res, next) => {
  try {
    const sources = await svc.getAllDataSources();
    res.json(sources.map((s) => ({ id: s.id, vendorName: s.vendorName })));
  } catch (err) { next(err); }
});

// Q4: Get full data source details
router.get("/:id", async (req, res, next) => {
  try {
    const source = await svc.getDataSourceById(req.params.id);
    if (!source) return res.status(404).json({ error: "Data source not found" });
    res.json(source);
  } catch (err) { next(err); }
});

// Create data source
router.post("/", async (req, res, next) => {
  try {
    const source = await svc.createDataSource(req.body);
    res.status(201).json(source);
  } catch (err) { next(err); }
});

// Update data source
router.put("/:id", async (req, res, next) => {
  try {
    const source = await svc.updateDataSource(req.params.id, req.body);
    res.json(source);
  } catch (err) { next(err); }
});

module.exports = router;
