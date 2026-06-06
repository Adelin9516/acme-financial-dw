const { getFirestore } = require("../config/firebase");

const COLLECTION = "TimeSeriesData_Collection";

/**
 * Time Series data is append-only by nature (temporal DWH).
 * Each document: { logicalAssetId, dataSourceId, timestamp, metrics: {...} }
 * metrics is flexible to handle heterogeneous data from different providers.
 */

async function insertTimeSeriesPoint(data) {
  const db = getFirestore();
  const doc = {
    logicalAssetId: data.logicalAssetId,
    dataSourceId: data.dataSourceId,
    timestamp: data.timestamp instanceof Date ? data.timestamp : new Date(data.timestamp),
    metrics: data.metrics || {},
    ingestedAt: new Date(),
  };
  const ref = await db.collection(COLLECTION).add(doc);
  return { id: ref.id, ...doc };
}

async function insertBatch(dataPoints) {
  const db = getFirestore();
  const batch = db.batch();
  const results = [];

  for (const data of dataPoints) {
    const ref = db.collection(COLLECTION).doc();
    const doc = {
      logicalAssetId: data.logicalAssetId,
      dataSourceId: data.dataSourceId,
      timestamp: data.timestamp instanceof Date ? data.timestamp : new Date(data.timestamp),
      metrics: data.metrics || {},
      ingestedAt: new Date(),
    };
    batch.set(ref, doc);
    results.push({ id: ref.id, ...doc });
  }

  await batch.commit();
  return results;
}

async function getTimeSeries({ logicalAssetId, dataSourceId, startDate, endDate, limit = 500 }) {
  const db = getFirestore();
  let query = db.collection(COLLECTION).where("logicalAssetId", "==", logicalAssetId);

  if (dataSourceId) {
    query = query.where("dataSourceId", "==", dataSourceId);
  }
  if (startDate) {
    query = query.where("timestamp", ">=", new Date(startDate));
  }
  if (endDate) {
    query = query.where("timestamp", "<=", new Date(endDate));
  }

  query = query.orderBy("timestamp", "asc").limit(limit);
  const snapshot = await query.get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getLatestPrice(logicalAssetId, dataSourceId) {
  const db = getFirestore();
  let query = db
    .collection(COLLECTION)
    .where("logicalAssetId", "==", logicalAssetId)
    .orderBy("timestamp", "desc")
    .limit(1);

  if (dataSourceId) {
    query = db
      .collection(COLLECTION)
      .where("logicalAssetId", "==", logicalAssetId)
      .where("dataSourceId", "==", dataSourceId)
      .orderBy("timestamp", "desc")
      .limit(1);
  }

  const snapshot = await query.get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

module.exports = {
  insertTimeSeriesPoint,
  insertBatch,
  getTimeSeries,
  getLatestPrice,
};
