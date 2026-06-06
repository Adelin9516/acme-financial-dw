const { getTimeSeries } = require("./timeSeriesService");

/**
 * Compute basic analytics on time series data.
 * Designed to be easy to pipe into ML tools (Apache Spark, pandas, etc.)
 */

function extractMetricValues(series, metric) {
  return series
    .map((p) => ({ timestamp: p.timestamp, value: p.metrics?.[metric] }))
    .filter((p) => p.value !== undefined && p.value !== null);
}

function computeStats(values) {
  if (!values.length) return null;
  const nums = values.map((v) => v.value);
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / nums.length;
  const variance = nums.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / nums.length;
  return {
    count: nums.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: parseFloat(mean.toFixed(4)),
    stdDev: parseFloat(Math.sqrt(variance).toFixed(4)),
    first: nums[0],
    last: nums[nums.length - 1],
    change: parseFloat((nums[nums.length - 1] - nums[0]).toFixed(4)),
    changePct: parseFloat((((nums[nums.length - 1] - nums[0]) / nums[0]) * 100).toFixed(2)),
  };
}

function computeMovingAverage(values, window = 7) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      result.push({ timestamp: values[i].timestamp, ma: null });
    } else {
      const slice = values.slice(i - window + 1, i + 1).map((v) => v.value);
      const avg = slice.reduce((a, b) => a + b, 0) / window;
      result.push({ timestamp: values[i].timestamp, ma: parseFloat(avg.toFixed(4)) });
    }
  }
  return result;
}

// Simple linear regression forecast
function linearRegressionForecast(values, steps = 1) {
  const n = values.length;
  if (n < 2) return null;

  const xs = values.map((_, i) => i);
  const ys = values.map((v) => v.value);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const forecasts = [];
  for (let s = 1; s <= steps; s++) {
    forecasts.push({
      step: s,
      predictedValue: parseFloat((slope * (n - 1 + s) + intercept).toFixed(4)),
    });
  }
  return { slope: parseFloat(slope.toFixed(6)), intercept: parseFloat(intercept.toFixed(4)), forecasts };
}

// Risk signal: simple volatility-based
function computeRiskSignal(values) {
  if (values.length < 2) return null;
  const returns = [];
  for (let i = 1; i < values.length; i++) {
    const ret = (values[i].value - values[i - 1].value) / values[i - 1].value;
    returns.push(ret);
  }
  const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - meanRet, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252); // annualized

  let signal = "LOW";
  if (volatility > 0.5) signal = "HIGH";
  else if (volatility > 0.2) signal = "MEDIUM";

  return {
    dailyVolatility: parseFloat((Math.sqrt(variance) * 100).toFixed(4)),
    annualizedVolatility: parseFloat((volatility * 100).toFixed(4)),
    riskSignal: signal,
  };
}

async function analyzeAsset({ logicalAssetId, dataSourceId, startDate, endDate, metric = "closingPrice" }) {
  const series = await getTimeSeries({ logicalAssetId, dataSourceId, startDate, endDate, limit: 1000 });
  const values = extractMetricValues(series, metric);

  if (!values.length) {
    return { error: "No data found for the given parameters", logicalAssetId, metric };
  }

  const stats = computeStats(values);
  const ma7 = computeMovingAverage(values, 7);
  const ma30 = computeMovingAverage(values, 30);
  const forecast = linearRegressionForecast(values, 5);
  const risk = computeRiskSignal(values);

  return {
    logicalAssetId,
    dataSourceId,
    metric,
    period: { from: values[0].timestamp, to: values[values.length - 1].timestamp },
    dataPoints: values.length,
    stats,
    movingAverages: {
      ma7: ma7.filter((p) => p.ma !== null).slice(-30),
      ma30: ma30.filter((p) => p.ma !== null).slice(-10),
    },
    forecast,
    risk,
    rawSeries: values.slice(-100), // last 100 points for charting
  };
}

async function compareAssets({ assetIds, dataSourceId, startDate, endDate, metric = "closingPrice" }) {
  const results = await Promise.all(
    assetIds.map((id) => analyzeAsset({ logicalAssetId: id, dataSourceId, startDate, endDate, metric }))
  );
  return results;
}

module.exports = { analyzeAsset, compareAssets, computeStats, computeMovingAverage, linearRegressionForecast, computeRiskSignal };
