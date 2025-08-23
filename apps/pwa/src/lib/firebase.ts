import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
export const firebaseConfig = {
  apiKey: "AIzaSyAcF2A3Y3Eq6sYJrHyD-kdIPJd5oRBlkdc",
  authDomain: "dbponto-facial.firebaseapp.com",
  projectId: "dbponto-facial",
  storageBucket: "dbponto-facial.firebasestorage.app",
  messagingSenderId: "19681620887",
  appId: "1:19681620887:web:554c2528d592496130cad2",
  measurementId: "G-D4DQNPHJM3"
};
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
let analytics: Analytics | null = null;
if (typeof window !== "undefined") {
  isSupported().then((ok)=>{ if (ok) analytics = getAnalytics(app); }).catch(()=>{});
}
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { app, analytics };
