/* ===================================================
   firebase-config.js
   INSTRUCCIONES: Pega aquí tu configuración de Firebase.
   Obtenerla en: Firebase Console → Tu proyecto → ⚙️ → Tus apps → Web
   =================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAOimisumr2PPz6_5ScK2pG5QSmCUupBIg",
  authDomain: "facturatec-15453.firebaseapp.com",
  projectId: "facturatec-15453",
  storageBucket: "facturatec-15453.firebasestorage.app",
  messagingSenderId: "379196559567",
  appId: "1:379196559567:web:1060cbccc71393e9e6e7ba"
};

// NO TOCAR — Detecta si la config es la de plantilla
const FIREBASE_CONFIGURED = !firebaseConfig.apiKey.startsWith('PEGA_');
