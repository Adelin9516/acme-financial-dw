/**
 * Unit Tests – Ingest Service
 * ============================
 * Run:  cd backend && npx jest tests/ingest.test.js --verbose
 *
 * node-fetch v3 e ESM pur — jest.mock() static nu funcționează cu el.
 * Soluție: manual mock în backend/__mocks__/node-fetch.js
 * Jest îl detectează automat și îl folosește pentru ORICE import/require.
 */

'use strict';

// Activează manual mock-ul din __mocks__/node-fetch.js
jest.mock('node-fetch');

// Mock Firestore
jest.mock('../src/config/firebase', () => {
  const store = new Map();
  let counter = 1;
  const mockDb = {
    _store: store,
    _reset() { store.clear(); counter = 1; },
    collection() {
      return {
        async add(data) {
          const id = `ts_${counter++}`;
          store.set(id, { id, ...data });
          return { id };
        },
        doc() {
          const id = `ts_${counter++}`;
          return { id, async set(d) { store.set(id, { id, ...d }); } };
        },
      };
    },
    batch() {
      const ops = [];
      return {
        set(ref, data) { ops.push({ ref, data }); },
        async commit() {
          for (const op of ops) store.set(op.ref.id, { id: op.ref.id, ...op.data });
        },
      };
    },
  };
  return { getFirestore: jest.fn(() => mockDb), _mockDb: mockDb };
});

// Mock timeSeriesService — controlăm ce returnează insertBatch
jest.mock('../src/services/timeSeriesService', () => ({
  insertBatch: jest.fn(async (points) =>
    points.map((p, i) => ({ id: `inserted_${i}`, ...p }))
  ),
}));

// ── Imports ───────────────────────────────────────────────────────────────────
const fetchMock          = require('node-fetch');
const { _mockDb }        = require('../src/config/firebase');
const timeSeriesService  = require('../src/services/timeSeriesService');
const ingestService      = require('../src/services/ingestService');

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeNasdaqResponse(columnNames, rows) {
  return { dataset_data: { column_names: columnNames, data: rows } };
}

function setFetchResponse(body, status = 200) {
  fetchMock.mockResolvedValue({
    ok:   status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
    text: jest.fn(async () => JSON.stringify(body)),
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('ingestService', () => {

  beforeEach(() => {
    _mockDb._reset();
    fetchMock.mockReset();
    timeSeriesService.insertBatch.mockClear();
    process.env.NASDAQ_API_KEY = 'test-api-key-123';
  });

  afterEach(() => {
    delete process.env.NASDAQ_API_KEY;
  });

  describe('ingestFromNasdaq()', () => {

    it('should throw when NASDAQ_API_KEY is missing', async () => {
      delete process.env.NASDAQ_API_KEY;
      await expect(
        ingestService.ingestFromNasdaq({
          logicalAssetId: 'x', dataSourceId: 'y', dataset: 'WIKI', ticker: 'TEST',
        })
      ).rejects.toThrow(/NASDAQ_API_KEY/i);
    });

    it('should call fetch with correct URL including api_key and date params', async () => {
      setFetchResponse(makeNasdaqResponse(['Date', 'Close'], [['2024-01-02', 184.0]]));

      await ingestService.ingestFromNasdaq({
        logicalAssetId: 'aapl-001', dataSourceId: 'nasdaq-src',
        dataset: 'WIKI', ticker: 'AAPL',
        startDate: '2024-01-01', endDate: '2024-01-31',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = fetchMock.mock.calls[0][0].toString();
      expect(url).toContain('WIKI');
      expect(url).toContain('AAPL');
      expect(url).toContain('test-api-key-123');
      expect(url).toContain('start_date=2024-01-01');
    });

    it('should return correct count', async () => {
      setFetchResponse(makeNasdaqResponse(
        ['Date', 'Open', 'Close', 'Volume'],
        [
          ['2024-01-02', 182.0, 184.0, 55000000],
          ['2024-01-03', 184.0, 186.0, 52000000],
        ]
      ));

      const result = await ingestService.ingestFromNasdaq({
        logicalAssetId: 'aapl-001', dataSourceId: 'nasdaq-src',
        dataset: 'WIKI', ticker: 'AAPL',
      });

      expect(result.count).toBe(2);
      expect(result.ticker).toBe('AAPL');
    });

    it('should map Nasdaq column names to normalised metric keys', async () => {
      setFetchResponse(makeNasdaqResponse(
        ['Date', 'Open', 'High', 'Low', 'Close', 'Volume'],
        [['2024-01-02', 182.0, 185.0, 181.0, 184.0, 50000000]]
      ));

      await ingestService.ingestFromNasdaq({
        logicalAssetId: 'aapl-001', dataSourceId: 'nasdaq-src',
        dataset: 'WIKI', ticker: 'AAPL',
      });

      const points = timeSeriesService.insertBatch.mock.calls[0][0];
      const metrics = points[0].metrics;
      expect(metrics).toHaveProperty('closingPrice', 184.0);
      expect(metrics).toHaveProperty('openingPrice', 182.0);
      expect(metrics).toHaveProperty('volume', 50000000);
    });

    it('should record dataSourceId (provenance) on every point', async () => {
      setFetchResponse(makeNasdaqResponse(
        ['Date', 'Close'],
        [['2024-02-01', 188.0], ['2024-02-02', 189.5], ['2024-02-03', 187.2]]
      ));

      await ingestService.ingestFromNasdaq({
        logicalAssetId: 'aapl-001', dataSourceId: 'nasdaq-provenance',
        dataset: 'WIKI', ticker: 'AAPL',
      });

      const points = timeSeriesService.insertBatch.mock.calls[0][0];
      points.forEach(p => expect(p.dataSourceId).toBe('nasdaq-provenance'));
    });

    it('should assign logicalAssetId to every point', async () => {
      setFetchResponse(makeNasdaqResponse(['Date', 'Close'], [['2024-01-10', 195.0]]));

      await ingestService.ingestFromNasdaq({
        logicalAssetId: 'tsla-unique', dataSourceId: 'src',
        dataset: 'WIKI', ticker: 'TSLA',
      });

      const points = timeSeriesService.insertBatch.mock.calls[0][0];
      points.forEach(p => expect(p.logicalAssetId).toBe('tsla-unique'));
    });

    it('should parse timestamp as Date from Nasdaq date string', async () => {
      setFetchResponse(makeNasdaqResponse(['Date', 'Close'], [['2024-06-15', 200.0]]));

      await ingestService.ingestFromNasdaq({
        logicalAssetId: 'test-asset', dataSourceId: 'src',
        dataset: 'WIKI', ticker: 'TEST',
      });

      const points = timeSeriesService.insertBatch.mock.calls[0][0];
      expect(points[0].timestamp).toBeInstanceOf(Date);
      expect(points[0].timestamp.getFullYear()).toBe(2024);
    });

    it('should throw on non-2xx HTTP response from Nasdaq', async () => {
      setFetchResponse({ quandl_error: { message: 'Not Found' } }, 404);

      await expect(
        ingestService.ingestFromNasdaq({
          logicalAssetId: 'x', dataSourceId: 'y',
          dataset: 'WIKI', ticker: 'INVALID',
        })
      ).rejects.toThrow(/404/);
    });

    it('should return count=0 and period=null for empty response', async () => {
      setFetchResponse(makeNasdaqResponse(['Date', 'Close'], []));

      const result = await ingestService.ingestFromNasdaq({
        logicalAssetId: 'x', dataSourceId: 'y',
        dataset: 'WIKI', ticker: 'EMPTY',
      });

      expect(result.count).toBe(0);
      expect(result.period).toBeNull();
    });

    it('should handle heterogeneous columns (unknown provider)', async () => {
      setFetchResponse(makeNasdaqResponse(
        ['Date', 'PX_LAST', 'PX_OPEN', 'PX_VOLUME', 'EQY_DVD_YLD'],
        [['2024-01-05', 192.5, 190.0, 51000000, 0.53]]
      ));

      const result = await ingestService.ingestFromNasdaq({
        logicalAssetId: 'aapl-001', dataSourceId: 'bloomberg',
        dataset: 'BBG', ticker: 'AAPL US',
      });

      expect(result.count).toBe(1);
      const points = timeSeriesService.insertBatch.mock.calls[0][0];
      expect(Object.keys(points[0].metrics)).toHaveLength(4);
    });
  });
});
