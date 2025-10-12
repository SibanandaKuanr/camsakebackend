// config/firebase.js
// Initialize Firebase Admin to verify ID tokens from client Google Sign-in
import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';

try {
  const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin initialized');
} catch (err) {
  console.warn('Firebase admin init failed. Make sure serviceAccountKey.json path is correct.', err.message);
}

export default admin;
