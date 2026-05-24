'use client';

import { useState, useEffect, useRef } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// Função para garantir que o documento do usuário existe no Firestore
async function ensureUserDocument(user: User) {
  try {
    const userRef = doc(db, 'usuarios', user.uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      // Criar documento base para o usuário
      console.log('📝 Criando documento base para usuário:', user.email);
      await setDoc(userRef, {
        email: user.email,
        name: user.displayName || user.email?.split('@')[0] || 'Usuário',
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        // Dados faciais serão adicionados posteriormente via merge
        faceEmbedding: null,
        faceRegisteredAt: null,
        faceLastVerified: null,
        faceVerificationCount: 0
      });
      console.log('✅ Documento do usuário criado com sucesso');
    } else {
      console.log('✅ Documento do usuário já existe');
    }
  } catch (error) {
    console.error('❌ Erro ao criar/verificar documento do usuário:', error);
    // Não bloqueia o login se houver erro na criação do documento
  }
}

// Singleton para garantir um único listener de autenticação por aplicação
class AuthManager {
  private static instance: AuthManager;
  private listeners: Set<(user: User | null, loading: boolean) => void> = new Set();
  private user: User | null = null;
  private isLoading = true;
  private unsubscribe: (() => void) | null = null;
  private isInitialized = false;

  private constructor() {
    this.initialize();
  }

  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  private initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    console.log('🔐 Inicializando AuthManager singleton');
    
    this.unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        console.log('🔐 Auth state changed:', currentUser ? 'logged in' : 'logged out');
        this.user = currentUser;
        
        // Se o usuário logou, garantir que o documento existe no Firestore
        if (currentUser) {
          await ensureUserDocument(currentUser);
        }
        
        this.isLoading = false;
        this.notifyListeners();
      },
      (error) => {
        console.error('❌ Erro no listener de autenticação:', error);
        this.isLoading = false;
        this.notifyListeners();
      }
    );
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.user, this.isLoading);
      } catch (error) {
        console.error('❌ Erro ao notificar listener de auth:', error);
      }
    });
  }

  public addListener(listener: (user: User | null, loading: boolean) => void) {
    this.listeners.add(listener);
    // ✅ CORREÇÃO: Só notificar se não estiver carregando para evitar re-renders desnecessários
    if (!this.isLoading) {
      listener(this.user, this.isLoading);
    }
  }

  public removeListener(listener: (user: User | null, loading: boolean) => void) {
    this.listeners.delete(listener);
  }

  public getCurrentUser(): User | null {
    return this.user;
  }

  public isCurrentlyLoading(): boolean {
    return this.isLoading;
  }

  public cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.listeners.clear();
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const authManager = AuthManager.getInstance();

    const listener = (newUser: User | null, loading: boolean) => {
      if (isMountedRef.current) {
        setUser(newUser);
        setIsLoading(loading);
      }
    };

    authManager.addListener(listener);

    return () => {
      isMountedRef.current = false;
      authManager.removeListener(listener);
    };
  }, []); // Dependências vazias - executar apenas uma vez

  return {
    user,
    isLoading,
    loading: isLoading, // Manter compatibilidade
    isAuthenticated: !!user
  };
}