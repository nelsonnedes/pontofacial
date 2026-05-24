'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ReactNode, useState, useEffect } from 'react';
import CollapsibleSidebar, { NavSection } from '@/components/navigation/CollapsibleSidebar';
import { useAccessProfile } from '@/hooks/useAccessProfile';
import LegalTermsGate from '@/components/legal/LegalTermsGate';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const access = useAccessProfile();
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // Atualizar relógio
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Aguardar carregamento da autenticação
  if (loading || access.isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando aplicativo...</p>
        </div>
      </div>
    );
  }

  // Verificar se usuário está logado
  if (!user) {
    router.push('/login');
    return null;
  }

  // ✅ CONFIGURAÇÃO DA NAVEGAÇÃO DO APP
  const canAccess = (permission: string) => access.isAdmin || access.hasPermission(permission);

  const appNavSections: NavSection[] = [
    {
      title: 'Principal',
      items: [
        { href: '/app', label: 'Dashboard', icon: '🏠' },
        ...(canAccess('app:mark-point') ? [{ href: '/app/marcar', label: 'Marcar Ponto', icon: '📍' }] : []),
        ...(canAccess('app:history') ? [{ href: '/app/historico', label: 'Histórico', icon: '📊' }] : [])
      ].filter(item => access.isAdmin || !access.isKiosk || item.href !== '/app')
    },
    {
      title: 'Documentos',
      items: [
        ...(canAccess('app:receipts') ? [{ href: '/app/comprovantes', label: 'Comprovantes', icon: '📄' }] : []),
        ...(access.isAdmin || canAccess('app:sync-queue') ? [{ href: '/app/fila', label: 'Fila de Sync', icon: '🔄' }] : [])
      ]
    },
    {
      title: 'Configuração',
      items: [
        ...(canAccess('app:face-verification') || canAccess('app:face-registration')
          ? [{ href: '/app/verificar-face', label: 'Verificação Facial', icon: '🤳' }]
          : []),
        { href: '/app/manual', label: 'Manual', icon: '📘' },
        ...(access.isAdmin ? [{ href: '/admin', label: 'Administração', icon: '⚙️' }] : [])
      ]
    }
  ].map(section => ({
    ...section,
    items: section.items.filter(Boolean)
  })).filter(section => section.items.length > 0);

  // ✅ FUNÇÃO DE LOGOUT
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  // ✅ FORMATAÇÃO DE TEMPO
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  };

  // ✅ COMPONENTE HEADER DO APP
  const AppHeader = () => (
    <div className="bg-white/90 backdrop-blur-xl border-b border-gray-200/80 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Olá, {user.displayName || user.email?.split('@')[0] || 'Usuário'}!
            </h1>
            <p className="text-sm text-gray-600">{formatDate(currentTime)}</p>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Relógio Digital */}
            <div className="text-right">
              <div className="text-lg font-mono font-bold text-gray-900">
                {formatTime(currentTime)}
              </div>
              <div className="text-xs text-gray-500">Horário atual</div>
            </div>
            
            {/* Botão de Logout */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all duration-200 shadow-sm hover:shadow-md"
              title="Sair do sistema"
            >
              <span>🚪</span>
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="nav-container">
      <CollapsibleSidebar
        logo={{
          icon: '📱',
          text: 'Ponto Facial',
          href: '/app'
        }}
        navSections={appNavSections}
        defaultCollapsed={true} // ✅ RECOLHIDO POR PADRÃO
        persistState={true}
        storageKey="app-sidebar-collapsed"
        onToggle={setIsSidebarCollapsed}
      />
      
      <div className={`main-content ${isSidebarCollapsed ? 'main-content--sidebar-collapsed' : ''}`}>
        <AppHeader />
        <LegalTermsGate user={user}>
          <main className="p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </LegalTermsGate>
      </div>
    </div>
  );
}
