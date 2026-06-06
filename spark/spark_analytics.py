"""
UC3 – Data Aggregation, Analytics and Data Mining (Apache Spark)
================================================================
Reads financial time-series data exported from Firestore (via the REST API
or a JSON export), runs distributed analytics with PySpark, and writes
results back as parquet/CSV so downstream ML tools or dashboards can consume them.

Usage
-----
# Export data first (one-time or scheduled):
#   GET /api/export/timeseries?format=json  → saves timeseries.json

# Then run:
#   spark-submit spark_analytics.py \
#       --input  ../exports/timeseries.json \
#       --output ../exports/analytics_results \
#       --asset  AAPL \
#       --metric closingPrice

Dependencies
------------
    pip install pyspark==3.5.1 requests python-dotenv

Environment variables (same .env as the backend):
    BACKEND_URL=http://localhost:5000   (used to fetch data from REST API)
    NASDAQ_API_KEY=...                  (optional, for direct ingest)
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta

# ── PySpark imports ────────────────────────────────────────────────────────────
try:
    from pyspark.sql import SparkSession
    from pyspark.sql import functions as F
    from pyspark.sql.types import (
        DoubleType, StringType, StructField, StructType, TimestampType,
    )
    from pyspark.sql.window import Window
except ImportError:
    print("PySpark not found.  Install with: pip install pyspark==3.5.1")
    sys.exit(1)

# ── Optional: load .env so BACKEND_URL is available ───────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
except ImportError:
    pass

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:5000")


# ══════════════════════════════════════════════════════════════════════════════
# 1.  DATA LOADING
# ══════════════════════════════════════════════════════════════════════════════

def fetch_from_api(asset_id: str, source_id: str | None,
                   start: str | None, end: str | None) -> list[dict]:
    """Pull time-series JSON directly from the running backend."""
    try:
        import requests
    except ImportError:
        raise RuntimeError("requests not installed. Run: pip install requests")

    params = {"logicalAssetId": asset_id, "limit": 5000}
    if source_id:
        params["dataSourceId"] = source_id
    if start:
        params["startDate"] = start
    if end:
        params["endDate"] = end

    url = f"{BACKEND_URL}/api/timeseries"
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def load_json_file(path: str) -> list[dict]:
    with open(path, "r") as f:
        return json.load(f)


def build_dataframe(spark: SparkSession, records: list[dict], metric: str):
    """
    Convert raw Firestore records into a typed Spark DataFrame.

    Firestore document shape:
        { logicalAssetId, dataSourceId, timestamp, metrics: { closingPrice, ... } }
    """
    schema = StructType([
        StructField("logicalAssetId", StringType(), True),
        StructField("dataSourceId",   StringType(), True),
        StructField("timestamp",      TimestampType(), True),
        StructField("metric_value",   DoubleType(), True),
    ])

    rows = []
    for rec in records:
        ts_raw = rec.get("timestamp")
        # Handle both ISO string and Firestore Timestamp dict
        if isinstance(ts_raw, dict):
            ts = datetime.utcfromtimestamp(ts_raw.get("_seconds", 0))
        elif isinstance(ts_raw, str):
            ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
        else:
            ts = None

        val = rec.get("metrics", {}).get(metric)
        if val is not None:
            try:
                val = float(val)
            except (TypeError, ValueError):
                val = None

        rows.append((
            rec.get("logicalAssetId"),
            rec.get("dataSourceId"),
            ts,
            val,
        ))

    return spark.createDataFrame(rows, schema=schema).filter(
        F.col("metric_value").isNotNull() & F.col("timestamp").isNotNull()
    ).orderBy("timestamp")


# ══════════════════════════════════════════════════════════════════════════════
# 2.  ANALYTICS FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def compute_basic_stats(df):
    """min / max / mean / stddev / count — via Spark aggregation."""
    return df.agg(
        F.count("metric_value").alias("count"),
        F.min("metric_value").alias("min"),
        F.max("metric_value").alias("max"),
        F.avg("metric_value").alias("mean"),
        F.stddev("metric_value").alias("stddev"),
        F.first("metric_value").alias("first_value"),
        F.last("metric_value").alias("last_value"),
    )


def compute_moving_averages(df, windows=(7, 30)):
    """
    Sliding window moving averages using Spark Window functions.
    Returns a DataFrame with MA columns appended.
    """
    result = df
    for w in windows:
        win_spec = (
            Window.orderBy(F.unix_timestamp("timestamp"))
                  .rowsBetween(-(w - 1), 0)
        )
        result = result.withColumn(
            f"ma_{w}",
            F.round(F.avg("metric_value").over(win_spec), 4)
        )
    return result


def compute_daily_returns(df):
    """Compute daily log returns using LAG window function."""
    win_spec = Window.orderBy("timestamp")
    return df.withColumn(
        "prev_value", F.lag("metric_value", 1).over(win_spec)
    ).withColumn(
        "daily_return",
        F.round(
            F.log(F.col("metric_value") / F.col("prev_value")),
            6
        )
    ).filter(F.col("daily_return").isNotNull())


def compute_volatility(returns_df):
    """Annualised volatility = daily_std * sqrt(252)."""
    return returns_df.agg(
        F.stddev("daily_return").alias("daily_stddev"),
        F.avg("daily_return").alias("mean_daily_return"),
    ).withColumn(
        "annualized_volatility",
        F.round(F.col("daily_stddev") * F.sqrt(F.lit(252.0)), 6)
    ).withColumn(
        "risk_signal",
        F.when(F.col("annualized_volatility") > 0.5, "HIGH")
         .when(F.col("annualized_volatility") > 0.2, "MEDIUM")
         .otherwise("LOW")
    )


def compute_monthly_aggregation(df):
    """Group by year-month and compute OHLC-style stats per period."""
    return df.withColumn(
        "year_month", F.date_format("timestamp", "yyyy-MM")
    ).groupBy("logicalAssetId", "dataSourceId", "year_month").agg(
        F.first("metric_value").alias("open"),
        F.max("metric_value").alias("high"),
        F.min("metric_value").alias("low"),
        F.last("metric_value").alias("close"),
        F.avg("metric_value").alias("avg"),
        F.count("metric_value").alias("data_points"),
    ).orderBy("year_month")


def compare_assets(spark: SparkSession, records_map: dict[str, list[dict]], metric: str):
    """
    Side-by-side asset comparison.
    records_map = { assetId: [records...], ... }
    Returns a single joined DataFrame with one column per asset.
    """
    dfs = {}
    for asset_id, records in records_map.items():
        df = build_dataframe(spark, records, metric)
        dfs[asset_id] = df.select(
            F.date_format("timestamp", "yyyy-MM-dd").alias("date"),
            F.col("metric_value").alias(asset_id),
        )

    result = None
    for asset_id, df in dfs.items():
        if result is None:
            result = df
        else:
            result = result.join(df, on="date", how="outer")

    return result.orderBy("date") if result else None


# ══════════════════════════════════════════════════════════════════════════════
# 3.  MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

def run_analytics(input_path: str | None,
                  output_dir: str,
                  asset_id: str,
                  source_id: str | None,
                  metric: str,
                  start: str | None,
                  end: str | None) -> None:

    spark = (
        SparkSession.builder
        .appName("AcmeFinancialDWH_Analytics")
        .config("spark.sql.session.timeZone", "UTC")
        # Local mode — works without a cluster
        .master("local[*]")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    print(f"\n{'='*60}")
    print(f"  Acme Financial DWH — Spark Analytics")
    print(f"  Asset: {asset_id}  |  Metric: {metric}")
    print(f"{'='*60}\n")

    # ── Load data ────────────────────────────────────────────────────────────
    if input_path:
        print(f"[1/5] Loading records from file: {input_path}")
        records = load_json_file(input_path)
    else:
        print(f"[1/5] Fetching records from backend API ({BACKEND_URL}) …")
        records = fetch_from_api(asset_id, source_id, start, end)

    # Filter to requested asset (file may contain multiple)
    records = [r for r in records if r.get("logicalAssetId") == asset_id]
    print(f"      → {len(records)} records for asset '{asset_id}'")

    if not records:
        print("  No data found. Exiting.")
        spark.stop()
        return

    df = build_dataframe(spark, records, metric)
    print(f"      → {df.count()} valid data points in Spark DataFrame")

    os.makedirs(output_dir, exist_ok=True)

    # ── Basic statistics ─────────────────────────────────────────────────────
    print("\n[2/5] Computing basic statistics …")
    stats_df = compute_basic_stats(df)
    stats_df.show()
    stats_df.coalesce(1).write.mode("overwrite").option("header", True).csv(
        os.path.join(output_dir, "basic_stats")
    )

    # ── Moving averages ───────────────────────────────────────────────────────
    print("[3/5] Computing moving averages (MA7, MA30) …")
    ma_df = compute_moving_averages(df, windows=(7, 30))
    ma_df.show(10)
    ma_df.write.mode("overwrite").parquet(
        os.path.join(output_dir, "moving_averages")
    )

    # ── Volatility / risk signal ──────────────────────────────────────────────
    print("[4/5] Computing daily returns and volatility …")
    returns_df = compute_daily_returns(df)
    vol_df = compute_volatility(returns_df)
    vol_df.show()
    vol_df.coalesce(1).write.mode("overwrite").option("header", True).csv(
        os.path.join(output_dir, "volatility")
    )

    # ── Monthly aggregation ───────────────────────────────────────────────────
    print("[5/5] Monthly OHLC aggregation …")
    monthly_df = compute_monthly_aggregation(df)
    monthly_df.show(12)
    monthly_df.coalesce(1).write.mode("overwrite").option("header", True).csv(
        os.path.join(output_dir, "monthly_aggregation")
    )

    print(f"\n✅  Analytics complete. Results saved to: {output_dir}")
    spark.stop()


# ══════════════════════════════════════════════════════════════════════════════
# 4.  CLI ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def _parse_args():
    p = argparse.ArgumentParser(
        description="Acme Financial DWH – Spark Analytics (UC3)"
    )
    p.add_argument("--input",    help="Path to JSON export file (optional; uses API if omitted)")
    p.add_argument("--output",   default="exports/analytics_results", help="Output directory")
    p.add_argument("--asset",    required=True, help="logicalAssetId to analyse")
    p.add_argument("--source",   default=None, help="dataSourceId filter (optional)")
    p.add_argument("--metric",   default="closingPrice", help="Metric key to analyse")
    p.add_argument("--start",    default=None, help="Start date YYYY-MM-DD (optional)")
    p.add_argument("--end",      default=None, help="End date   YYYY-MM-DD (optional)")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    run_analytics(
        input_path=args.input,
        output_dir=args.output,
        asset_id=args.asset,
        source_id=args.source,
        metric=args.metric,
        start=args.start,
        end=args.end,
    )
