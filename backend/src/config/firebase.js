const admin = require("firebase-admin");
require("dotenv").config();

let db;

function getFirestore() {
  if (!db) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });
    }
    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

module.exports = { getFirestore };
