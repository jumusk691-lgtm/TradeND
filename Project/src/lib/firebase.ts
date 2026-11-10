
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD9JvroqZtwREJX51m6Jg_dRfYdvuuQHvU",
  authDomain: "trade-f600a.firebaseapp.com",
  databaseURL: "https://trade-f600a-default-rtdb.firebaseio.com",
  projectId: "trade-f600a",
  storageBucket: "trade-f600a.firebasestorage.app",
  messagingSenderId: "322191828273",
  appId: "1:322191828273:web:f6d95229649c0b10013c10"
};

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

export const db = getDatabase(app);
export const auth = getAuth(app);
