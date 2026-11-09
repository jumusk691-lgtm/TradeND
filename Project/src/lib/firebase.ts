import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth'; // 👈 Firebase Auth इम्पोर्ट करें

const firebaseConfig = {
  databaseURL: "https://trade-f600a-default-rtdb.firebaseio.com/"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Export both database and auth instances
export const db = getDatabase(app);
export const auth = getAuth(app); // 👈 यहाँ auth को एक्सपोर्ट करें
