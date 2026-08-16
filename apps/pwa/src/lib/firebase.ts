import { initializeApp, getApps } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  AppCheck
} from "firebase/app-check";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || ""
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

const firebaseDebugEnabled =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_VERBOSE_FIREBASE_LOGS === "true";

function logFirebaseDebug(...args: unknown[]): void {
  if (firebaseDebugEnabled) {
    console.debug("[firebase]", ...args);
  }
}

function warnFirebaseDebug(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(...args);
  }
}

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
    warnFirebaseDebug("Firebase App Check ignorado: chave publica de exemplo detectada.");
    return null;
  }

  return siteKey;
}

function createAppCheckProvider(siteKey: string) {
  const provider = (
    process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_PROVIDER ||
    process.env.NEXT_PUBLIC_APPCHECK_PROVIDER ||
    "recaptcha-v3"
  ).trim().toLowerCase();

  if (provider === "recaptcha-enterprise" || provider === "enterprise") {
    return new ReCaptchaEnterpriseProvider(siteKey);
  }

  return new ReCaptchaV3Provider(siteKey);
}

// Função para inicializar Firebase de forma robusta
function initializeFirebase() {
  try {
    // Verificar se estamos no cliente
    if (typeof window === 'undefined') {
      logFirebaseDebug('Skipping initialization during SSR');
      return;
    }

    // Verificar se já foi inicializado
    const apps = getApps();
    if (apps.length > 0) {
      app = apps[0];
      logFirebaseDebug('Usando app existente');
    } else {
      app = initializeApp(firebaseConfig);
      logFirebaseDebug('App inicializado');
    }

    // Inicializar serviços apenas uma vez
    if (!auth) {
      auth = getAuth(app);
      // Configurar timeout para auth
      auth.languageCode = 'pt';
      logFirebaseDebug('Firebase Auth inicializado');
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
        logFirebaseDebug('Firebase Firestore inicializado com cache otimizado');
      } catch (error) {
        warnFirebaseDebug('Firestore já inicializado, usando instância existente');
        try {
          db = getFirestore(app);
          logFirebaseDebug('Usando instância Firestore existente');
        } catch (fallbackError) {
          console.error('❌ Erro crítico ao obter Firestore:', fallbackError);
          throw fallbackError;
        }
      }
    }

    if (!storage) {
      try {
        storage = getStorage(app);
        logFirebaseDebug('Firebase Storage inicializado');
      } catch (error) {
        warnFirebaseDebug('Erro ao inicializar Storage:', error);
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
          provider: createAppCheckProvider(siteKey),
          isTokenAutoRefreshEnabled: true
        });
        logFirebaseDebug('Firebase App Check inicializado');
      }
    }

    // Analytics apenas no cliente e se suportado
    if (typeof window !== "undefined" && !analytics && process.env.NODE_ENV === 'production') {
      isSupported()
        .then((supported) => {
          if (supported) {
            analytics = getAnalytics(app);
            logFirebaseDebug('Firebase Analytics inicializado');
          } else {
            logFirebaseDebug('Analytics não suportado neste navegador');
          }
        })
        .catch((error) => {
          warnFirebaseDebug('Erro ao verificar suporte do Analytics:', error);
        });
    }

    logFirebaseDebug('Firebase inicialização completa');
  } catch (error) {
    console.error('❌ Erro crítico ao inicializar Firebase:', error);
    // Em desenvolvimento, não quebrar a aplicação
    if (process.env.NODE_ENV === 'development') {
      warnFirebaseDebug('Continuando em modo de desenvolvimento sem Firebase completo');
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
