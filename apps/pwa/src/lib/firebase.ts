import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, initializeFirestore } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyAcF2A3Y3Eq6sYJrHyD-kdIPJd5oRBlkdc",
  authDomain: "dbponto-facial.firebaseapp.com",
  projectId: "dbponto-facial",
  storageBucket: "dbponto-facial.firebasestorage.app",
  messagingSenderId: "19681620887",
  appId: "1:19681620887:web:554c2528d592496130cad2",
  measurementId: "G-D4DQNPHJM3"
};

// Singleton para garantir inicialização única
let app: any = null;
let auth: any = null;
let db: any = null;
let storage: any = null;
let analytics: Analytics | null = null;

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
        // Usar initializeFirestore com configurações otimizadas
        db = initializeFirestore(app, {
          experimentalForceLongPolling: false,
          ignoreUndefinedProperties: true,
          // Configurações para desenvolvimento local
          ...(process.env.NODE_ENV === 'development' && {
            // Configurações específicas para dev se necessário
          })
        });
        console.log('🗃️ Firebase Firestore inicializado');
      } catch (error) {
        console.warn('⚠️ Firestore já inicializado, usando instância existente');
        try {
          db = getFirestore(app);
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

// Inicializar Firebase se estivermos no cliente
if (typeof window !== 'undefined') {
  initializeFirebase();
}

export { app, auth, db, storage, analytics };
