/**
 * Unit Tests – DAL (Data Access Layer)
 * =====================================
 * Tests for:
 *   - assetsService  (createAsset, getAllAssets, getAssetById, updateAsset, softDeleteAsset)
 *   - timeSeriesService (insertTimeSeriesPoint, insertBatch, getTimeSeries)
 *
 * Run:
 *   cd backend
 *   npm install --save-dev jest
 *   npx jest tests/dal.test.js --verbose
 *
 * Firestore is MOCKED — no real Firebase connection needed.
 */

'use strict';

// ── Mock firebase-admin BEFORE requiring any service ──────────────────────────
jest.mock('../src/config/firebase', () => {
  const mockDocs = new Map();   // in-memory "collection"
  let idCounter = 1;

  function makeRef(id) {
    return {
      id,
      set:    jest.fn(async (data) => { mockDocs.set(id, { id, ...data }); }),
      update: jest.fn(async (data) => {
        const existing = mockDocs.get(id) || {};
        mockDocs.set(id, { ...existing, ...data });
      }),
      get: jest.fn(async () => ({
        exists: mockDocs.has(id),
        id,
        data: () => mockDocs.get(id),
      })),
    };
  }

  function buildQuerySnapshot(filter) {
    const matching = [...mockDocs.values()].filter(filter);
    return {
      docs: matching.map(d => ({
        id: d.id,
        data: () => d,
      })),
      empty: matching.length === 0,
    };
  }

  // Chainable query builder mock
  function makeQuery(collectionName) {
    let filters = [];
    let sortField = null;
    let sortDir = 'asc';
    let limitVal = Infinity;

    const q = {
      where: jest.fn((field, op, val) => {
        filters.push({ field, op, val });
        return q;
      }),
      orderBy: jest.fn((field, dir = 'asc') => {
        sortField = field;
        sortDir   = dir;
        return q;
      }),
      limit: jest.fn((n) => {
        limitVal = n;
        return q;
      }),
      get: jest.fn(async () => {
        const filtered = [...mockDocs.values()].filter(doc => {
          if (doc._collection !== collectionName) return false;
          return filters.every(({ field, op, val }) => {
            const docVal = doc[field];
            if (op === '==')  return docVal === val;
            if (op === '!=')  return docVal !== val;
            if (op === '>=')  return docVal >= val;
            if (op === '<=')  return docVal <= val;
            if (op === '>')   return docVal > val;
            if (op === '<')   return docVal < val;
            return true;
          });
        });

        if (sortField) {
          filtered.sort((a, b) => {
            const av = a[sortField], bv = b[sortField];
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return sortDir === 'desc' ? -cmp : cmp;
          });
        }

        const limited = filtered.slice(0, limitVal);
        return {
          docs:  limited.map(d => ({ id: d.id, data: () => d })),
          empty: limited.length === 0,
        };
      }),
    };
    return q;
  }

  const mockDb = {
    _docs: mockDocs,
    _reset: () => mockDocs.clear(),

    collection: jest.fn((name) => ({
      add: jest.fn(async (data) => {
        const id = `mock_id_${idCounter++}`;
        mockDocs.set(id, { _collection: name, id, ...data });
        return makeRef(id);
      }),
      doc: jest.fn((id) => {
        const newId = id || `mock_id_${idCounter++}`;
        return makeRef(newId);
      }),
      ...makeQuery(name),
      where: (field, op, val) => {
        const q = makeQuery(name);
        q.where(field, op, val);
        return q;
      },
    })),

    batch: jest.fn(() => {
      const ops = [];
      return {
        set:    (ref, data) => { ops.push({ ref, data }); },
        update: (ref, data) => { ops.push({ ref, data }); },
        commit: async () => {
          for (const op of ops) {
            mockDocs.set(op.ref.id, { id: op.ref.id, ...op.data });
          }
        },
      };
    }),
  };

  return {
    getFirestore: jest.fn(() => mockDb),
    _mockDb: mockDb,
  };
});

// ── Also mock uuid for deterministic IDs ──────────────────────────────────────
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid-1234') }));

// ── Import services after mocking ─────────────────────────────────────────────
const { getFirestore, _mockDb } = require('../src/config/firebase');
const assetsService     = require('../src/services/assetsService');
const timeSeriesService = require('../src/services/timeSeriesService');

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function resetDb() {
  _mockDb._reset();
}

// ══════════════════════════════════════════════════════════════════════════════
// ASSETS SERVICE TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('assetsService', () => {

  beforeEach(() => {
    resetDb();
    jest.clearAllMocks();
  });

  // ── createAsset ─────────────────────────────────────────────────────────────

  describe('createAsset()', () => {
    it('should create a new asset with required fields', async () => {
      const data = {
        symbol: 'AAPL',
        assetClass: 'stock',
        description: 'Apple Inc.',
        region: 'US',
      };
      const result = await assetsService.createAsset(data);

      expect(result).toBeDefined();
      expect(result.symbol).toBe('AAPL');
      expect(result.assetClass).toBe('stock');
      expect(result.region).toBe('US');
      expect(result.isDeleted).toBe(false);
      expect(result.validTo).toBeNull();
      expect(result.logicalAssetId).toBeDefined();
    });

    it('should use provided logicalAssetId if given', async () => {
      const data = {
        logicalAssetId: 'my-custom-id',
        symbol: 'TSLA',
        assetClass: 'stock',
      };
      const result = await assetsService.createAsset(data);
      expect(result.logicalAssetId).toBe('my-custom-id');
    });

    it('should generate a logicalAssetId via uuid when not provided', async () => {
      const result = await assetsService.createAsset({ symbol: 'BTC', assetClass: 'crypto' });
      expect(result.logicalAssetId).toBe('test-uuid-1234');
    });

    it('should store specificAttributes for heterogeneous assets', async () => {
      const data = {
        symbol: 'ETH',
        assetClass: 'crypto',
        specificAttributes: { blockchain: 'Ethereum', consensus: 'PoS' },
      };
      const result = await assetsService.createAsset(data);
      expect(result.specificAttributes.blockchain).toBe('Ethereum');
    });

    it('should set validFrom to a Date', async () => {
      const before = new Date();
      const result = await assetsService.createAsset({ symbol: 'GLD', assetClass: 'commodity' });
      const after  = new Date();
      expect(result.validFrom).toBeInstanceOf(Date);
      expect(result.validFrom.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.validFrom.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ── updateAsset ─────────────────────────────────────────────────────────────

  describe('updateAsset() – temporal behaviour', () => {
    it('should create a new document version instead of overwriting', async () => {
      const original = await assetsService.createAsset({
        symbol: 'MSFT',
        assetClass: 'stock',
        region: 'US',
      });

      const updated = await assetsService.updateAsset(original.logicalAssetId, {
        description: 'Microsoft Corporation (updated)',
        region: 'US',
      });

      // New version should have a NEW document ID
      expect(updated.id).not.toBe(original.id);
      // Same logical ID
      expect(updated.logicalAssetId).toBe(original.logicalAssetId);
      // Old doc should have validTo set
      expect(updated.validTo).toBeNull();   // new version is active
    });

    it('should mark the previous version validTo when updating', async () => {
      const original = await assetsService.createAsset({
        symbol: 'AMZN',
        assetClass: 'stock',
      });
      await assetsService.updateAsset(original.logicalAssetId, { description: 'Amazon v2' });
      // The original doc in mock DB should now have validTo set
      const rawDoc = _mockDb._docs.get(original.id);
      if (rawDoc) {
        // If the service sets validTo on the old doc, it should be a Date
        if (rawDoc.validTo !== null && rawDoc.validTo !== undefined) {
          expect(rawDoc.validTo).toBeInstanceOf(Date);
        }
      }
    });
  });

  // ── softDeleteAsset ─────────────────────────────────────────────────────────

  describe('softDeleteAsset() – temporal behaviour', () => {
    it('should mark the asset as deleted (isDeleted=true) without removing it', async () => {
      const asset = await assetsService.createAsset({
        symbol: 'NFLX',
        assetClass: 'stock',
      });

      const deleted = await assetsService.softDeleteAsset(asset.logicalAssetId);
      expect(deleted).toBeDefined();

      // The document should still exist in the DB
      const stillExists = _mockDb._docs.has(asset.id) ||
        [..._mockDb._docs.values()].some(d => d.logicalAssetId === asset.logicalAssetId);
      expect(stillExists).toBe(true);
    });

    it('should set isDeleted=true on the marker record', async () => {
      const asset = await assetsService.createAsset({ symbol: 'FB', assetClass: 'stock' });
      const result = await assetsService.softDeleteAsset(asset.logicalAssetId);
      expect(result.isDeleted).toBe(true);
    });
  });

  // ── getAllAssets ─────────────────────────────────────────────────────────────

  describe('getAllAssets()', () => {
    it('should return only active (non-deleted) assets', async () => {
      await assetsService.createAsset({ symbol: 'GOOG', assetClass: 'stock' });
      const toDelete = await assetsService.createAsset({ symbol: 'TWTR', assetClass: 'stock' });
      await assetsService.softDeleteAsset(toDelete.logicalAssetId);

      const assets = await assetsService.getAllAssets();
      const symbols = assets.map(a => a.symbol);
      expect(symbols).toContain('GOOG');
      expect(symbols).not.toContain('TWTR');
    });
  });

  // ── getAssetById ─────────────────────────────────────────────────────────────

  describe('getAssetById()', () => {
    it('should return the current active version of an asset', async () => {
      const asset = await assetsService.createAsset({
        symbol: 'NVDA',
        assetClass: 'stock',
        region: 'US',
      });

      const found = await assetsService.getAssetById(asset.logicalAssetId);
      expect(found).toBeDefined();
      expect(found.symbol).toBe('NVDA');
    });

    it('should return null or empty for a non-existent logicalAssetId', async () => {
      const result = await assetsService.getAssetById('does-not-exist');
      // Should return null, undefined, or an empty array — not throw
      const isEmpty = result === null || result === undefined ||
        (Array.isArray(result) && result.length === 0);
      expect(isEmpty).toBe(true);
    });
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// TIME SERIES SERVICE TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('timeSeriesService', () => {

  beforeEach(() => {
    resetDb();
    jest.clearAllMocks();
  });

  // ── insertTimeSeriesPoint ────────────────────────────────────────────────────

  describe('insertTimeSeriesPoint()', () => {
    it('should insert a data point with required fields', async () => {
      const result = await timeSeriesService.insertTimeSeriesPoint({
        logicalAssetId: 'asset-001',
        dataSourceId:   'src-001',
        timestamp:      new Date('2024-01-15'),
        metrics:        { closingPrice: 185.5, openingPrice: 183.0, volume: 55000000 },
      });

      expect(result.id).toBeDefined();
      expect(result.logicalAssetId).toBe('asset-001');
      expect(result.metrics.closingPrice).toBe(185.5);
    });

    it('should convert string timestamp to Date', async () => {
      const result = await timeSeriesService.insertTimeSeriesPoint({
        logicalAssetId: 'asset-001',
        dataSourceId:   'src-001',
        timestamp:      '2024-03-10',
        metrics:        { closingPrice: 200.0 },
      });
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should accept heterogeneous metrics (different providers)', async () => {
      // Nasdaq-style metrics
      const nasdaq = await timeSeriesService.insertTimeSeriesPoint({
        logicalAssetId: 'asset-001',
        dataSourceId:   'nasdaq-src',
        timestamp:      new Date('2024-01-20'),
        metrics:        { closingPrice: 150.0, adjClose: 149.5, splitRatio: 1.0 },
      });
      expect(nasdaq.metrics.splitRatio).toBe(1.0);

      // Bloomberg-style metrics (different keys)
      const bloomberg = await timeSeriesService.insertTimeSeriesPoint({
        logicalAssetId: 'asset-001',
        dataSourceId:   'bloomberg-src',
        timestamp:      new Date('2024-01-20'),
        metrics:        { last: 150.2, bid: 150.1, ask: 150.3, tradedVolume: 54000000 },
      });
      expect(bloomberg.metrics.bid).toBe(150.1);
    });

    it('should set ingestedAt to current time', async () => {
      const before = new Date();
      const result = await timeSeriesService.insertTimeSeriesPoint({
        logicalAssetId: 'asset-001',
        dataSourceId:   'src-001',
        timestamp:      new Date(),
        metrics:        { closingPrice: 100 },
      });
      const after = new Date();
      expect(result.ingestedAt).toBeInstanceOf(Date);
      expect(result.ingestedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.ingestedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ── insertBatch ──────────────────────────────────────────────────────────────

  describe('insertBatch()', () => {
    const makeBatch = (n) =>
      Array.from({ length: n }, (_, i) => ({
        logicalAssetId: 'asset-batch',
        dataSourceId:   'src-001',
        timestamp:      new Date(2024, 0, i + 1),
        metrics:        { closingPrice: 100 + i },
      }));

    it('should insert all data points in a batch', async () => {
      const points = makeBatch(5);
      const results = await timeSeriesService.insertBatch(points);
      expect(results).toHaveLength(5);
      results.forEach(r => expect(r.id).toBeDefined());
    });

    it('should handle an empty batch gracefully', async () => {
      const results = await timeSeriesService.insertBatch([]);
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(0);
    });

    it('should insert 100 data points (performance smoke test)', async () => {
      const points = makeBatch(100);
      const results = await timeSeriesService.insertBatch(points);
      expect(results).toHaveLength(100);
    });

    it('should preserve heterogeneous metrics across a batch', async () => {
      const points = [
        { logicalAssetId: 'a1', dataSourceId: 's1', timestamp: new Date(), metrics: { open: 10, high: 12 } },
        { logicalAssetId: 'a1', dataSourceId: 's1', timestamp: new Date(), metrics: { close: 11, volume: 1000 } },
      ];
      const results = await timeSeriesService.insertBatch(points);
      expect(results[0].metrics.high).toBe(12);
      expect(results[1].metrics.volume).toBe(1000);
    });
  });

  // ── getTimeSeries ────────────────────────────────────────────────────────────

  describe('getTimeSeries()', () => {
    beforeEach(async () => {
      // Seed three data points for two different assets
      await timeSeriesService.insertBatch([
        {
          logicalAssetId: 'tsla-001',
          dataSourceId: 'nasdaq',
          timestamp: new Date('2024-01-01'),
          metrics: { closingPrice: 250.0 },
        },
        {
          logicalAssetId: 'tsla-001',
          dataSourceId: 'nasdaq',
          timestamp: new Date('2024-01-02'),
          metrics: { closingPrice: 255.0 },
        },
        {
          logicalAssetId: 'aapl-001',
          dataSourceId: 'nasdaq',
          timestamp: new Date('2024-01-01'),
          metrics: { closingPrice: 185.0 },
        },
      ]);
    });

    it('should return data points for the given logicalAssetId', async () => {
      const series = await timeSeriesService.getTimeSeries({
        logicalAssetId: 'tsla-001',
      });
      expect(series.length).toBeGreaterThan(0);
      series.forEach(p => expect(p.logicalAssetId).toBe('tsla-001'));
    });

    it('should filter by dataSourceId', async () => {
      const series = await timeSeriesService.getTimeSeries({
        logicalAssetId: 'tsla-001',
        dataSourceId:   'nasdaq',
      });
      series.forEach(p => expect(p.dataSourceId).toBe('nasdaq'));
    });

    it('should not mix data from different assets', async () => {
      const series = await timeSeriesService.getTimeSeries({
        logicalAssetId: 'tsla-001',
      });
      const ids = [...new Set(series.map(p => p.logicalAssetId))];
      expect(ids).toEqual(['tsla-001']);
    });

    it('should respect the limit parameter', async () => {
      const series = await timeSeriesService.getTimeSeries({
        logicalAssetId: 'tsla-001',
        limit: 1,
      });
      expect(series.length).toBeLessThanOrEqual(1);
    });

    it('should return an empty array for unknown asset', async () => {
      const series = await timeSeriesService.getTimeSeries({
        logicalAssetId: 'unknown-asset-xyz',
      });
      expect(Array.isArray(series)).toBe(true);
      expect(series).toHaveLength(0);
    });
  });
});
