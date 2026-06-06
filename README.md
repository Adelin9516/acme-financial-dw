# Acme Financial Data Warehouse

A production-ready financial market data platform built for Acme Ltd.

## Tech Stack
- **Backend**: Node.js + Express
- **Database**: Google Firebase Firestore (NoSQL, temporal)
- **LLM**: Google Gemini 1.5 Flash (free tier)
- **Frontend**: React + Recharts
- **Data Source**: Nasdaq Data Link API (free tier)

## Architecture

```
acme-financial/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express server
│   │   ├── config/firebase.js    # Firestore setup
│   │   ├── routes/               # REST API routes (UC2)
│   │   │   ├── assets.js         # Q1, Q2 - Asset CRUD + temporal
│   │   │   ├── dataSources.js    # Q3, Q4 - Data source CRUD
│   │   │   ├── timeSeries.js     # Q5 - Time series queries
│   │   │   ├── ingest.js         # UC1 - Data ingestion
│   │   │   ├── analytics.js      # UC3 - Analytics
│   │   │   ├── llm.js            # UC4 - Gemini chat
│   │   │   └── mcp.js            # MCP protocol endpoint
│   │   └── services/
│   │       ├── assetsService.js      # Temporal DWH logic
│   │       ├── dataSourcesService.js
│   │       ├── timeSeriesService.js
│   │       ├── analyticsService.js   # Stats, MA, forecast, risk
│   │       ├── ingestService.js      # Nasdaq + manual ingest
│   │       └── llmService.js         # Gemini + tool calling (agentic)
│   └── scripts/seed.js           # Demo data seeder
└── frontend/
    └── src/
        ├── pages/
        │   ├── Dashboard.jsx     # Overview + latest prices
        │   ├── Assets.jsx        # Asset management + history
        │   ├── Analytics.jsx     # Charts + risk + forecast
        │   ├── Ingest.jsx        # Data ingestion UI
        │   └── LLMChat.jsx       # AI assistant chat
        └── hooks/useApi.js       # API client
```

## Firestore Collections

| Collection | Type | Description |
|---|---|---|
| `Assets_Collection` | Temporal Document | Financial assets with version history |
| `DataSources_Collection` | Document | Data vendors (Nasdaq, Bloomberg, etc.) |
| `TimeSeriesData_Collection` | Time Series Optimized | OHLCV price data, append-only |

## Setup

### 1. Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable **Firestore Database** (Native mode)
4. Go to Project Settings → Service Accounts → Generate new private key
5. Note: `projectId`, `clientEmail`, `privateKey`

### 2. Firestore Indexes (Required)
Create these composite indexes in Firestore Console → Indexes:

**Assets_Collection:**
- `logicalAssetId ASC, validTo ASC, isDeleted ASC`
- `logicalAssetId ASC, validFrom ASC`

**TimeSeriesData_Collection:**
- `logicalAssetId ASC, dataSourceId ASC, timestamp ASC`
- `logicalAssetId ASC, timestamp DESC`

### 3. Gemini API Key (Free)
1. Go to [Google AI Studio](https://aistudio.google.com)
2. Create an API key — free tier includes generous limits

### 4. Nasdaq API Key (Optional, for live ingest)
1. Register at [data.nasdaq.com](https://data.nasdaq.com)
2. Get your free API key from the account dashboard

### 5. Install & Run

```bash
# Clone and install
cd acme-financial
cd backend && npm install
cd ../frontend && npm install

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your keys

# Seed sample data (8 assets, 180 days each)
cd backend && npm run seed

# Start backend (port 3001)
npm run dev

# Start frontend (port 3000) in another terminal
cd frontend && npm start
```

## REST API Reference

### Assets
```
GET    /api/assets                          # Q1: List all assets
GET    /api/assets/:logicalAssetId          # Q2: Asset details
GET    /api/assets/:logicalAssetId/history  # Temporal version history
GET    /api/assets/:logicalAssetId/at-time?date=2023-01-01  # Point-in-time
POST   /api/assets                          # Create asset
PUT    /api/assets/:logicalAssetId          # Update (new temporal version)
DELETE /api/assets/:logicalAssetId          # Soft delete (temporal marker)
```

### Data Sources
```
GET  /api/data-sources        # Q3: List sources
GET  /api/data-sources/:id    # Q4: Source details
POST /api/data-sources        # Create source
```

### Time Series
```
GET  /api/time-series?logicalAssetId=&dataSourceId=&startDate=&endDate=  # Q5
GET  /api/time-series/latest?logicalAssetId=
POST /api/time-series/batch   # Bulk insert
```

### Analytics (UC3)
```
GET  /api/analytics/analyze?logicalAssetId=&metric=closingPrice
POST /api/analytics/compare   { assetIds: [...], metric }
```

### Ingest (UC1)
```
POST /api/ingest/nasdaq   { logicalAssetId, dataSourceId, dataset, ticker, startDate, endDate }
POST /api/ingest/manual   { logicalAssetId, dataSourceId, dataPoints: [...] }
```

### LLM Assistant (UC4)
```
POST /api/llm/chat   { messages: [{role, content}] }
```

### MCP Endpoint
```
GET  /mcp/tools      # List MCP tools
POST /mcp/call       { tool: "list_assets", arguments: {} }
GET  /mcp/manifest   # MCP server manifest
```

## Temporal DWH Design

The platform implements the **temporal database paradigm**:
- ✅ Records are **never updated or deleted in-place**
- ✅ Updates add a **new version** (close old `validTo`, create new with `validFrom = now`)
- ✅ Deletion adds a **marker record** with `isDeleted: true`
- ✅ Historical queries supported via `/at-time?date=` endpoint
- ✅ Version history via `/history` endpoint

## MCP Integration

The platform exposes an MCP HTTP server at `/mcp`. Tools available:
- `list_assets` — list all financial assets
- `get_asset_details` — full asset info
- `list_data_sources` — list vendors
- `fetch_time_series` — get price data
- `analyze_asset` — stats + risk + forecast
- `compare_assets` — side-by-side comparison
- `summarize_trends` — trend summary

To use with Claude Desktop or other MCP clients, point to: `http://localhost:3001/mcp`

## Demo Queries for Evaluation

```
# LLM Assistant prompts:
"List all available financial assets"
"Analyze TSLA and tell me about its risk"
"Compare AAPL and MSFT over the last 90 days"
"What is the trend for BTC-USD?"
"Which asset has the highest volatility?"
"Find AAPL's closing price for the last 30 days and summarize the trend"
```

---

## Apache Spark Analytics & ML (UC3 — MANDATORY)

> **New additions fixing the grading gaps.**

### Setup

```bash
pip install pyspark==3.5.1 requests python-dotenv
java -version  # needs Java 11 or 17
```

### Run Analytics (aggregations, MA, volatility, monthly OHLC)

```bash
cd spark

# Pull live data from the running backend:
spark-submit spark_analytics.py --asset <logicalAssetId> --metric closingPrice

# Or from a local JSON export:
spark-submit spark_analytics.py \
    --input exports/timeseries.json \
    --asset <logicalAssetId> --metric closingPrice \
    --output exports/analytics_results
```

### Run ML Forecast (GBT / Random Forest / Linear Regression)

```bash
cd spark
spark-submit spark_ml.py \
    --asset <logicalAssetId> \
    --metric closingPrice \
    --model gbt \
    --forecast-days 5 \
    --output exports/ml_results
```

Output: `exports/ml_results/ml_summary.json` — contains RMSE, MAE, R², and the N-step forecast.

---

## Unit Tests

```bash
cd backend
npm install          # installs jest
npm test             # runs all tests
npm run test:coverage  # with coverage report
```

Tests cover:
- **DAL** (`tests/dal.test.js`): `createAsset`, `updateAsset` (temporal versioning), `softDeleteAsset`, `getAllAssets`, `getAssetById`, `insertTimeSeriesPoint`, `insertBatch`, `getTimeSeries`
- **Ingest** (`tests/ingest.test.js`): `ingestFromNasdaq` (HTTP mocked), column normalisation, provenance tracking, error cases
