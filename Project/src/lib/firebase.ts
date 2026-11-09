import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  databaseURL: "https://trade-f600a-default-rtdb.firebaseio.com/"
};

// Safely initialize Firebase app
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Export database and auth instances
export const db = getDatabase(app);
