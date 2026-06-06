const { getFirestore } = require("../config/firebase");
const { v4: uuidv4 } = require("uuid");

const COLLECTION = "Assets_Collection";

/**
 * Temporal DWH: records are never deleted/updated in-place.
 * Each asset has a logicalAssetId. Multiple documents can share the same
 * logicalAssetId, representing versions over time (validFrom / validTo).
 */

async function createAsset(data) {
  const db = getFirestore();
  const logicalAssetId = data.logicalAssetId || uuidv4();
  const now = new Date();

  const doc = {
    logicalAssetId,
    symbol: data.symbol,
    assetClass: data.assetClass,
    description: data.description || "",
    region: data.region || "",
    specificAttributes: data.specificAttributes || {},
    validFrom: now,
    validTo: null, // null = currently active
    isDeleted: false,
    createdAt: now,
  };

  const ref = await db.collection(COLLECTION).add(doc);
  return { id: ref.id, ...doc };
}

async function getAllAssets() {
  const db = getFirestore();
  // Return only the latest active version of each logical asset
  const snapshot = await db
    .collection(COLLECTION)
    .where("validTo", "==", null)
    .where("isDeleted", "==", false)
    .get();

  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getAssetById(logicalAssetId) {
  const db = getFirestore();
  const snapshot = await db
    .collection(COLLECTION)
    .where("logicalAssetId", "==", logicalAssetId)
    .where("validTo", "==", null)
    .where("isDeleted", "==", false)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getAssetHistory(logicalAssetId) {
  const db = getFirestore();
  const snapshot = await db
    .collection(COLLECTION)
    .where("logicalAssetId", "==", logicalAssetId)
    .orderBy("validFrom", "asc")
    .get();

  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function updateAsset(logicalAssetId, updates) {
  const db = getFirestore();
  const now = new Date();

  // Get current active record
  const current = await getAssetById(logicalAssetId);
  if (!current) throw new Error("Asset not found");

  // Close current record (temporal: set validTo)
  await db.collection(COLLECTION).doc(current.id).update({ validTo: now });

  // Create new version
  const newDoc = {
    logicalAssetId,
    symbol: updates.symbol ?? current.symbol,
    assetClass: updates.assetClass ?? current.assetClass,
    description: updates.description ?? current.description,
    region: updates.region ?? current.region,
    specificAttributes: updates.specificAttributes ?? current.specificAttributes,
    validFrom: now,
    validTo: null,
    isDeleted: false,
    createdAt: now,
  };

  const ref = await db.collection(COLLECTION).add(newDoc);
  return { id: ref.id, ...newDoc };
}

async function deleteAsset(logicalAssetId) {
  const db = getFirestore();
  const now = new Date();

  const current = await getAssetById(logicalAssetId);
  if (!current) throw new Error("Asset not found");

  // Close current record
  await db.collection(COLLECTION).doc(current.id).update({ validTo: now });

  // Add deletion marker
  const markerDoc = {
    logicalAssetId,
    symbol: current.symbol,
    assetClass: current.assetClass,
    description: current.description,
    region: current.region,
    specificAttributes: current.specificAttributes,
    validFrom: now,
    validTo: null,
    isDeleted: true,
    createdAt: now,
  };

  await db.collection(COLLECTION).add(markerDoc);
  return { message: "Asset marked as deleted", logicalAssetId };
}

// Get asset state at a specific point in time (temporal query)
async function getAssetAtTime(logicalAssetId, atDate) {
  const db = getFirestore();
  const ts = atDate instanceof Date ? atDate : new Date(atDate);

  const snapshot = await db
    .collection(COLLECTION)
    .where("logicalAssetId", "==", logicalAssetId)
    .orderBy("validFrom", "desc")
    .get();

  // Find the version that was valid at the given timestamp
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const validFrom = data.validFrom?.toDate ? data.validFrom.toDate() : new Date(data.validFrom);
    const validTo = data.validTo ? (data.validTo?.toDate ? data.validTo.toDate() : new Date(data.validTo)) : null;

    if (validFrom <= ts && (validTo === null || validTo > ts)) {
      return { id: doc.id, ...data };
    }
  }
  return null;
}

module.exports = {
  createAsset,
  getAllAssets,
  getAssetById,
  getAssetHistory,
  updateAsset,
  deleteAsset,
  getAssetAtTime,
};
