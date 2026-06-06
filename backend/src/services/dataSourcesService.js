const { getFirestore } = require("../config/firebase");
const { v4: uuidv4 } = require("uuid");

const COLLECTION = "DataSources_Collection";

async function createDataSource(data) {
  const db = getFirestore();
  const doc = {
    vendorName: data.vendorName,
    apiEndpoint: data.apiEndpoint || "",
    description: data.description || "",
    createdAt: new Date(),
  };
  const ref = await db.collection(COLLECTION).add(doc);
  return { id: ref.id, ...doc };
}

async function getAllDataSources() {
  const db = getFirestore();
  const snapshot = await db.collection(COLLECTION).get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getDataSourceById(id) {
  const db = getFirestore();
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function updateDataSource(id, updates) {
  const db = getFirestore();
  await db.collection(COLLECTION).doc(id).update(updates);
  return getDataSourceById(id);
}

module.exports = {
  createDataSource,
  getAllDataSources,
  getDataSourceById,
  updateDataSource,
};
