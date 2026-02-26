/**
 * Firebase client config for the dashboard.
 * Uses the Stocker project credentials.
 */

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC5cPocVlLiZZzzxWZw9Pw1YWSx2o8-d-4",
  authDomain: "stocker-5213e.firebaseapp.com",
  projectId: "stocker-5213e",
  storageBucket: "stocker-5213e.firebasestorage.app",
  messagingSenderId: "612220870441",
  appId: "1:612220870441:web:59004cb1a0b995714d6138",
  measurementId: "G-VELDXXRSX1"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, analytics, auth, db };
