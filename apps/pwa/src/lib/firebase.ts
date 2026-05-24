import { initializeApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, AppCheck } from "firebase/app-check";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAcF2A3Y3Eq6sYJrHyD-kdIPJd5oRBlkdc",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "dbponto-facial.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "dbponto-facial",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "dbponto-facial.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "19681620887",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:19681620887:web:554c2528d592496130cad2",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-D4DQNPHJM3"
};

// Singleton para garantir inicialização única
let app: any = null;
let auth: any = null;
let db: any = null;
let storage: any = null;
let analytics: Analytics | null = null;
let appCheck: AppCheck | null = null;

const APP_CHECK_SITE_KEY_PLACEHOLDERS = new Set([
  "SUA_CHAVE_PUBLICA_RECAPTCHA_V3",
  "YOUR_RECAPTCHA_V3_SITE_KEY",
  "YOUR_APP_CHECK_SITE_KEY"
]);

function getAppCheckSiteKey(): string | null {
  const siteKey = (
    process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY ||
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ||
    ""
  ).trim();

  if (!siteKey) {
    return null;
  }

  const isPlaceholder =
    APP_CHECK_SITE_KEY_PLACEHOLDERS.has(siteKey) ||
    siteKey.includes("SUA_CHAVE") ||
    siteKey.includes("YOUR_") ||
    siteKey.toLowerCase().includes("placeholder");

  if (isPlaceholder) {
    console.warn("Firebase App Check ignorado: chave publica de exemplo detectada.");
    return null;
  }

  return siteKey;
}

// Função para inicializar Firebase de forma robusta
function initializeFirebase() {
  try {
    // Verificar se estamos no cliente
    if (typeof window === 'undefined') {
      console.log('🚫 Firebase: Skipping initialization during SSR');
      return;
    }

    // Verificar se já foi inicializado
    const apps = getApps();
    if (apps.length > 0) {
      app = apps[0];
      console.log('♻️ Firebase: Usando app existente');
    } else {
      app = initializeApp(firebaseConfig);
      console.log('🆕 Firebase: App inicializado');
    }

    // Inicializar serviços apenas uma vez
    if (!auth) {
      auth = getAuth(app);
      // Configurar timeout para auth
      auth.languageCode = 'pt';
      console.log('🔐 Firebase Auth inicializado');
    }

    if (!db) {
      try {
        // Usar initializeFirestore com configurações otimizadas para reduzir erros 400
        db = initializeFirestore(app, {
          experimentalForceLongPolling: false,
          ignoreUndefinedProperties: true,
          localCache: {
            kind: 'persistent'
          },
          // Configurações específicas para reduzir erros de WebSocket
          ...(process.env.NODE_ENV === 'development' && {
            // Em desenvolvimento, usar polling longo para evitar reconexões frequentes
            experimentalForceLongPolling: true
          })
        });
        console.log('🗃️ Firebase Firestore inicializado com cache otimizado');
      } catch (error) {
        console.warn('⚠️ Firestore já inicializado, usando instância existente');
        try {
          db = getFirestore(app);
          console.log('🗃️ Usando instância Firestore existente');
        } catch (fallbackError) {
          console.error('❌ Erro crítico ao obter Firestore:', fallbackError);
          throw fallbackError;
        }
      }
    }

    if (!storage) {
      try {
        storage = getStorage(app);
        console.log('📁 Firebase Storage inicializado');
      } catch (error) {
        console.error('❌ Erro ao inicializar Storage:', error);
        // Storage não é crítico, continuar sem ele
      }
    }

    if (!appCheck) {
      const siteKey = getAppCheckSiteKey();
      if (siteKey) {
        const debugToken = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN?.trim();
        if (debugToken && process.env.NODE_ENV !== 'production') {
          (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
        }

        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(siteKey),
          isTokenAutoRefreshEnabled: true
        });
        console.log('🛡️ Firebase App Check inicializado');
      }
    }

    // Analytics apenas no cliente e se suportado
    if (typeof window !== "undefined" && !analytics && process.env.NODE_ENV === 'production') {
      isSupported()
        .then((supported) => {
          if (supported) {
            analytics = getAnalytics(app);
            console.log('📊 Firebase Analytics inicializado');
          } else {
            console.log('📊 Analytics não suportado neste navegador');
          }
        })
        .catch((error) => {
          console.warn('⚠️ Erro ao verificar suporte do Analytics:', error);
        });
    }

    console.log('✅ Firebase inicialização completa');
  } catch (error) {
    console.error('❌ Erro crítico ao inicializar Firebase:', error);
    // Em desenvolvimento, não quebrar a aplicação
    if (process.env.NODE_ENV === 'development') {
      console.warn('🔧 Continuando em modo de desenvolvimento sem Firebase completo');
    } else {
      throw error;
    }
  }
}

// Função para obter instâncias com verificação de inicialização
export function getFirebaseApp() {
  if (!app) {
    initializeFirebase();
  }
  return app;
}

export function getFirebaseAuth() {
  if (!auth) {
    initializeFirebase();
  }
  return auth;
}

export function getFirebaseFirestore() {
  if (!db) {
    initializeFirebase();
  }
  return db;
}

export function getFirebaseStorage() {
  if (!storage) {
    initializeFirebase();
  }
  return storage;
}

export function getFirebaseAppCheck() {
  if (!appCheck) {
    initializeFirebase();
  }
  return appCheck;
}

// Inicializar Firebase se estivermos no cliente
if (typeof window !== 'undefined') {
  initializeFirebase();
}

export { app, auth, db, storage, analytics, appCheck };
