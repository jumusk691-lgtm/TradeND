import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// 🌟 Project Firebase Realtime Database Configuration
const firebaseConfig = {
  databaseURL: "https://trade-f600a-default-rtdb.firebaseio.com/"
};

// Initialize Firebase app safely (prevents duplicate initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Export database instance
export const db = getDatabase(app);
