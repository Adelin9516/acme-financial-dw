"""
UC3 – Machine Learning with Apache Spark MLlib
================================================
Implements price forecasting using Spark MLlib pipelines:
  • Linear Regression  (baseline, interpretable)
  • Random Forest Regressor (robust, handles non-linearity)
  • Gradient Boosted Trees (GBT) — best accuracy

Features engineered from the raw time-series:
  lag_1, lag_3, lag_5, lag_10  (autoregressive lags)
  ma_7, ma_30                  (moving averages)
  day_of_week, month           (calendar seasonality)
  daily_return                 (momentum)

Usage
-----
    spark-submit spark_ml.py \
        --input  ../exports/timeseries.json \
        --output ../exports/ml_results \
        --asset  AAPL \
        --metric closingPrice \
        --model  gbt \
        --forecast-days 5

Dependencies
------------
    pip install pyspark==3.5.1 requests python-dotenv
"""

import argparse
import json
import math
import os
import sys
from datetime import datetime

try:
    from pyspark.sql import SparkSession
    from pyspark.sql import functions as F
    from pyspark.sql.types import (
        DoubleType, StringType, StructField, StructType, TimestampType,
    )
    from pyspark.sql.window import Window
    from pyspark.ml import Pipeline
    from pyspark.ml.feature import VectorAssembler, StandardScaler
    from pyspark.ml.regression import (
        LinearRegression,
        RandomForestRegressor,
        GBTRegressor,
    )
    from pyspark.ml.evaluation import RegressionEvaluator
    from pyspark.ml.tuning import ParamGridBuilder, CrossValidator
except ImportError:
    print("PySpark not found.  Install with: pip install pyspark==3.5.1")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
except ImportError:
    pass

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:5000")


# ══════════════════════════════════════════════════════════════════════════════
# 1.  DATA LOADING  (shared with spark_analytics.py)
# ══════════════════════════════════════════════════════════════════════════════

def fetch_from_api(asset_id, source_id, start, end):
    try:
        import requests
    except ImportError:
        raise RuntimeError("pip install requests")

    params = {"logicalAssetId": asset_id, "limit": 5000}
    if source_id:
        params["dataSourceId"] = source_id
    if start:
        params["startDate"] = start
    if end:
        params["endDate"] = end

    resp = requests.get(f"{BACKEND_URL}/api/timeseries", params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def load_records(path, asset_id, source_id, start, end):
    if path:
        with open(path) as f:
            recs = json.load(f)
    else:
        recs = fetch_from_api(asset_id, source_id, start, end)
    return [r for r in recs if r.get("logicalAssetId") == asset_id]


def parse_ts(ts_raw):
    if isinstance(ts_raw, dict):
        return datetime.utcfromtimestamp(ts_raw.get("_seconds", 0))
    if isinstance(ts_raw, str):
        return datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
    return None


def build_base_df(spark, records, metric):
    schema = StructType([
        StructField("logicalAssetId", StringType(),   True),
        StructField("dataSourceId",   StringType(),   True),
        StructField("timestamp",      TimestampType(), True),
        StructField("metric_value",   DoubleType(),   True),
    ])
    rows = []
    for rec in records:
        ts  = parse_ts(rec.get("timestamp"))
        val = rec.get("metrics", {}).get(metric)
        if val is not None:
            try:
                val = float(val)
            except (TypeError, ValueError):
                val = None
        rows.append((rec.get("logicalAssetId"), rec.get("dataSourceId"), ts, val))

    return (
        spark.createDataFrame(rows, schema=schema)
        .filter(F.col("metric_value").isNotNull() & F.col("timestamp").isNotNull())
        .orderBy("timestamp")
    )


# ══════════════════════════════════════════════════════════════════════════════
# 2.  FEATURE ENGINEERING
# ══════════════════════════════════════════════════════════════════════════════

def engineer_features(df):
    """
    Create autoregressive and calendar features from a time-ordered DataFrame.
    Target variable: next-day value  (label = lag(-1) = future value)
    """
    win = Window.orderBy("timestamp")

    # Autoregressive lags (look-back features)
    for lag in [1, 3, 5, 10]:
        df = df.withColumn(f"lag_{lag}", F.lag("metric_value", lag).over(win))

    # Moving averages
    for w in [7, 30]:
        win_rows = Window.orderBy(F.unix_timestamp("timestamp")).rowsBetween(-(w - 1), 0)
        df = df.withColumn(f"ma_{w}", F.avg("metric_value").over(win_rows))

    # Daily return (momentum)
    df = df.withColumn(
        "daily_return",
        (F.col("metric_value") - F.lag("metric_value", 1).over(win)) /
        F.lag("metric_value", 1).over(win)
    )

    # Calendar features
    df = df.withColumn("day_of_week", F.dayofweek("timestamp").cast(DoubleType()))
    df = df.withColumn("month",       F.month("timestamp").cast(DoubleType()))

    # Target: next day price
    df = df.withColumn("label", F.lead("metric_value", 1).over(win))

    # Drop rows with nulls in any feature
    feature_cols = ["lag_1", "lag_3", "lag_5", "lag_10",
                    "ma_7", "ma_30", "daily_return",
                    "day_of_week", "month"]
    return df.dropna(subset=feature_cols + ["label"]), feature_cols


# ══════════════════════════════════════════════════════════════════════════════
# 3.  MODEL BUILDING
# ══════════════════════════════════════════════════════════════════════════════

def build_pipeline(feature_cols: list[str], model_type: str):
    """
    Returns a Spark ML Pipeline:
        VectorAssembler → StandardScaler → Regressor
    """
    assembler = VectorAssembler(inputCols=feature_cols, outputCol="raw_features")
    scaler    = StandardScaler(inputCol="raw_features", outputCol="features",
                                withMean=True, withStd=True)

    if model_type == "lr":
        regressor = LinearRegression(
            featuresCol="features", labelCol="label",
            maxIter=200, regParam=0.1, elasticNetParam=0.5
        )
    elif model_type == "rf":
        regressor = RandomForestRegressor(
            featuresCol="features", labelCol="label",
            numTrees=100, maxDepth=6, seed=42
        )
    elif model_type == "gbt":
        regressor = GBTRegressor(
            featuresCol="features", labelCol="label",
            maxIter=100, maxDepth=5, stepSize=0.1, seed=42
        )
    else:
        raise ValueError(f"Unknown model type: {model_type}. Choose lr | rf | gbt")

    return Pipeline(stages=[assembler, scaler, regressor])


def evaluate_model(predictions):
    evaluator_rmse = RegressionEvaluator(
        labelCol="label", predictionCol="prediction", metricName="rmse"
    )
    evaluator_r2 = RegressionEvaluator(
        labelCol="label", predictionCol="prediction", metricName="r2"
    )
    evaluator_mae = RegressionEvaluator(
        labelCol="label", predictionCol="prediction", metricName="mae"
    )
    return {
        "rmse": round(evaluator_rmse.evaluate(predictions), 6),
        "mae":  round(evaluator_mae.evaluate(predictions), 6),
        "r2":   round(evaluator_r2.evaluate(predictions), 6),
    }


# ══════════════════════════════════════════════════════════════════════════════
# 4.  FORECASTING  (out-of-sample future predictions)
# ══════════════════════════════════════════════════════════════════════════════

def forecast_future(model, last_row_df, feature_cols: list[str], steps: int):
    """
    Iterative single-step-ahead forecasting.
    We take the last known row, predict step+1, then slide the window.

    Returns a list of {"step": i, "predicted_value": v} dicts.
    """
    # Collect last feature values as a Python dict
    last = last_row_df.collect()[0].asDict()
    forecasts = []

    current_val = last["metric_value"]
    lag_1  = last.get("lag_1",  current_val)
    lag_3  = last.get("lag_3",  current_val)
    lag_5  = last.get("lag_5",  current_val)
    lag_10 = last.get("lag_10", current_val)
    ma_7   = last.get("ma_7",   current_val)
    ma_30  = last.get("ma_30",  current_val)

    for step in range(1, steps + 1):
        # Update sliding features
        daily_ret  = (current_val - lag_1) / lag_1 if lag_1 else 0.0
        day_of_week = (last.get("day_of_week", 1.0) + step - 1) % 7 + 1
        month       = last.get("month", 1.0)

        row_data = {
            "lag_1": current_val,
            "lag_3": lag_3,
            "lag_5": lag_5,
            "lag_10": lag_10,
            "ma_7":  ma_7,
            "ma_30": ma_30,
            "daily_return": daily_ret,
            "day_of_week":  day_of_week,
            "month":        month,
            "metric_value": current_val,
            "label":        0.0,  # dummy
        }

        schema_fields = [StructField(c, DoubleType(), True) for c in feature_cols + ["metric_value", "label"]]
        schema = StructType(schema_fields)

        # Build a single-row DataFrame and predict
        spark = SparkSession.getActiveSession()
        row_df = spark.createDataFrame(
            [{k: v for k, v in row_data.items() if k in [f.name for f in schema_fields]}],
            schema=schema
        )

        pred = model.transform(row_df).select("prediction").collect()[0]["prediction"]
        forecasts.append({"step": step, "predicted_value": round(pred, 4)})

        # Slide the window forward
        lag_10 = lag_5
        lag_5  = lag_3
        lag_3  = lag_1
        lag_1  = current_val
        current_val = pred
        # Update moving averages (simplified EWMA approximation)
        alpha_7  = 2 / (7 + 1)
        alpha_30 = 2 / (30 + 1)
        ma_7  = alpha_7  * pred + (1 - alpha_7)  * ma_7
        ma_30 = alpha_30 * pred + (1 - alpha_30) * ma_30

    return forecasts


# ══════════════════════════════════════════════════════════════════════════════
# 5.  MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

def run_ml(input_path, output_dir, asset_id, source_id,
           metric, model_type, forecast_days, start, end):

    spark = (
        SparkSession.builder
        .appName("AcmeFinancialDWH_ML")
        .config("spark.sql.session.timeZone", "UTC")
        .master("local[*]")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    print(f"\n{'='*60}")
    print(f"  Acme Financial DWH — Spark ML Forecast")
    print(f"  Asset: {asset_id}  |  Metric: {metric}  |  Model: {model_type.upper()}")
    print(f"{'='*60}\n")

    # ── Load & prepare ────────────────────────────────────────────────────────
    print("[1/5] Loading data …")
    records = load_records(input_path, asset_id, source_id, start, end)
    print(f"      → {len(records)} raw records")

    if len(records) < 40:
        print("  ⚠  Not enough data for ML (need ≥ 40 points). Exiting.")
        spark.stop()
        return

    base_df = build_base_df(spark, records, metric)

    # ── Feature engineering ───────────────────────────────────────────────────
    print("[2/5] Engineering features …")
    feat_df, feature_cols = engineer_features(base_df)
    n = feat_df.count()
    print(f"      → {n} rows with complete features")
    print(f"      → Features: {feature_cols}")

    # ── Train / test split (80 / 20, time-ordered — no shuffle!) ─────────────
    print("[3/5] Splitting train/test (80/20 time-ordered) …")
    train_size = int(n * 0.8)
    # Add a row-number column
    win = Window.orderBy("timestamp")
    indexed = feat_df.withColumn("row_num", F.row_number().over(win))
    train_df = indexed.filter(F.col("row_num") <= train_size)
    test_df  = indexed.filter(F.col("row_num") >  train_size)
    print(f"      → Train: {train_df.count()}  |  Test: {test_df.count()}")

    # ── Build & train model ───────────────────────────────────────────────────
    print(f"[4/5] Training {model_type.upper()} model …")
    pipeline = build_pipeline(feature_cols, model_type)
    model    = pipeline.fit(train_df)

    # Evaluate on test set
    predictions = model.transform(test_df)
    metrics     = evaluate_model(predictions)

    print(f"\n  📊  Model Evaluation on Test Set:")
    print(f"      RMSE : {metrics['rmse']}")
    print(f"      MAE  : {metrics['mae']}")
    print(f"      R²   : {metrics['r2']}")

    os.makedirs(output_dir, exist_ok=True)

    # Save predictions
    predictions.select("timestamp", "metric_value", "label", "prediction") \
        .coalesce(1).write.mode("overwrite").option("header", True) \
        .csv(os.path.join(output_dir, "test_predictions"))

    # ── Future forecast ───────────────────────────────────────────────────────
    print(f"\n[5/5] Forecasting next {forecast_days} day(s) …")
    last_row = indexed.orderBy(F.col("row_num").desc()).limit(1)

    # Only attempt if enough lag data exists
    forecasts = forecast_future(model, last_row, feature_cols, forecast_days)

    print(f"\n  🔮  {forecast_days}-Step Ahead Forecast:")
    for f in forecasts:
        print(f"      Step {f['step']:>2}: {f['predicted_value']:.4f}")

    # Save forecast
    forecast_df = spark.createDataFrame(
        forecasts,
        schema=StructType([
            StructField("step",            DoubleType(), True),
            StructField("predicted_value", DoubleType(), True),
        ])
    )
    forecast_df.coalesce(1).write.mode("overwrite").option("header", True) \
        .csv(os.path.join(output_dir, "forecast"))

    # Save summary metrics
    summary = {
        "asset_id":       asset_id,
        "metric":         metric,
        "model":          model_type,
        "features":       feature_cols,
        "train_size":     train_size,
        "test_size":      n - train_size,
        "evaluation":     metrics,
        "forecasts":      forecasts,
        "generated_at":   datetime.utcnow().isoformat(),
    }
    with open(os.path.join(output_dir, "ml_summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2)

    print(f"\n✅  ML pipeline complete. Results saved to: {output_dir}")
    spark.stop()
    return summary


# ══════════════════════════════════════════════════════════════════════════════
# 6.  CLI ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def _parse_args():
    p = argparse.ArgumentParser(
        description="Acme Financial DWH – Spark ML Forecast (UC3)"
    )
    p.add_argument("--input",          help="Path to JSON export (optional; uses API if omitted)")
    p.add_argument("--output",         default="exports/ml_results", help="Output directory")
    p.add_argument("--asset",          required=True, help="logicalAssetId")
    p.add_argument("--source",         default=None,  help="dataSourceId filter (optional)")
    p.add_argument("--metric",         default="closingPrice")
    p.add_argument("--model",          default="gbt",
                   choices=["lr", "rf", "gbt"],
                   help="lr=Linear Regression, rf=Random Forest, gbt=Gradient Boosted Trees")
    p.add_argument("--forecast-days",  type=int, default=5, help="Steps ahead to forecast")
    p.add_argument("--start",          default=None, help="Start date YYYY-MM-DD")
    p.add_argument("--end",            default=None, help="End date   YYYY-MM-DD")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    run_ml(
        input_path=args.input,
        output_dir=args.output,
        asset_id=args.asset,
        source_id=args.source,
        metric=args.metric,
        model_type=args.model,
        forecast_days=args.forecast_days,
        start=args.start,
        end=args.end,
    )
