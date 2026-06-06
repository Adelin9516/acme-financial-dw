# Spark Analytics & ML — Setup and Usage

This folder contains two PySpark scripts that implement **UC3 (Data Aggregation, Analytics and Data Mining)** using Apache Spark.

---

## Prerequisites

```bash
# Python 3.10+
pip install pyspark==3.5.1 requests python-dotenv

# Java 11 or 17 is required by Spark
java -version   # should print 11.x or 17.x

# On Ubuntu/Debian:
sudo apt install openjdk-17-jdk
```

---

## Scripts

| Script | Purpose |
|---|---|
| `spark_analytics.py` | Aggregations, moving averages, volatility, monthly OHLC |
| `spark_ml.py` | ML forecast using Linear Regression / Random Forest / GBT |

---

## Running the Analytics Script

```bash
# Option A: fetch data live from the running backend
spark-submit spark_analytics.py \
    --asset  <logicalAssetId> \
    --metric closingPrice \
    --output exports/analytics

# Option B: from a JSON export
#   First export: curl http://localhost:5000/api/timeseries?logicalAssetId=... > data.json
spark-submit spark_analytics.py \
    --input  exports/timeseries.json \
    --asset  <logicalAssetId> \
    --metric closingPrice \
    --output exports/analytics
```

### Output files

```
exports/analytics/
├── basic_stats/         ← count, min, max, mean, stddev (CSV)
├── moving_averages/     ← MA7 and MA30 per data point (Parquet)
├── volatility/          ← daily & annualised volatility + risk signal (CSV)
└── monthly_aggregation/ ← OHLC per month (CSV)
```

---

## Running the ML Script

```bash
# Default model: GBT (best accuracy)
spark-submit spark_ml.py \
    --asset  <logicalAssetId> \
    --metric closingPrice \
    --model  gbt \
    --forecast-days 5 \
    --output exports/ml

# Compare all three models (run separately):
for MODEL in lr rf gbt; do
  spark-submit spark_ml.py --asset <id> --metric closingPrice \
      --model $MODEL --output exports/ml_$MODEL
done
```

### Output files

```
exports/ml/
├── test_predictions/  ← actual vs. predicted on held-out test set (CSV)
├── forecast/          ← next N days predictions (CSV)
└── ml_summary.json    ← RMSE, MAE, R², forecasts (JSON)
```

---

## Connecting to the Backend

Both scripts can pull data directly from the running Express backend:

```bash
# Set in backend/.env (already there):
BACKEND_URL=http://localhost:5000

# Start backend first:
cd backend && npm start

# Then run Spark:
spark-submit spark_analytics.py --asset TSLA_001 --metric closingPrice
```

---

## Models Available

| Key | Algorithm | Notes |
|-----|-----------|-------|
| `lr` | Linear Regression | Fast, interpretable, good baseline |
| `rf` | Random Forest | Robust, handles non-linearity |
| `gbt` | Gradient Boosted Trees | Best accuracy, recommended |

Features used: `lag_1`, `lag_3`, `lag_5`, `lag_10`, `ma_7`, `ma_30`, `daily_return`, `day_of_week`, `month`
