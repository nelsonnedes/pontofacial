'use client';

import { useAuth } from '@/hooks/useAuth';
import { ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';
import CollapsibleSidebar, { NavSection } from '@/components/navigation/CollapsibleSidebar';
import { useAccessProfile } from '@/hooks/useAccessProfile';
import LegalTermsGate from '@/components/legal/LegalTermsGate';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading } = useAuth();
  const access = useAccessProfile();
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const canAccessAdmin = access.isAdmin || access.permissions.some(permission => permission.startsWith('admin:'));
  const canAccess = (permission: string) => access.isAdmin || access.hasPermission(permission);

  // Aguardar carregamento da autenticação
  if (loading || access.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Validando acesso administrativo...</p>
        </div>
      </div>
    );
  }

  // Verificar se usuário está logado
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl p-8 border border-white/50">
            <div className="text-red-500 text-6xl mb-6">🚫</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Acesso Negado</h1>
            <p className="text-gray-600 mb-8 leading-relaxed">
              Você precisa estar logado para acessar o módulo administrativo do sistema.
            </p>
            <button 
              onClick={() => router.push('/login')}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl font-medium"
            >
              🔑 Fazer Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!canAccessAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl p-8 border border-white/50">
            <div className="text-red-500 text-6xl mb-6">🚫</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Acesso Restrito</h1>
            <p className="text-gray-600 mb-8 leading-relaxed">
              Sua conta não possui permissão administrativa para acessar este módulo.
            </p>
            <button
              onClick={() => router.push('/app')}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl font-medium"
            >
              ← Voltar ao App
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ CONFIGURAÇÃO DA NAVEGAÇÃO ADMIN
  const adminNavSections: NavSection[] = [
    {
      title: 'Principal',
      items: [
        ...(canAccess('admin:dashboard') ? [{ href: '/admin', label: 'Dashboard', icon: '📊' }] : []),
        ...(canAccess('admin:companies') ? [{ href: '/admin/empresas', label: 'Empresas', icon: '🏢' }] : []),
        ...(canAccess('admin:employees') ? [{ href: '/admin/funcionarios', label: 'Funcionários', icon: '👥' }] : [])
      ]
    },
    {
      title: 'Gestão',
      items: [
        ...(canAccess('admin:schedules') ? [{ href: '/admin/horarios', label: 'Horários', icon: '⏰' }] : []),
        ...(canAccess('admin:hr') ? [{ href: '/admin/rh', label: 'RH', icon: '👔' }] : []),
        ...(canAccess('admin:records') ? [{ href: '/admin/registros', label: 'Registros', icon: '📋' }] : []),
        ...(canAccess('admin:users') ? [{ href: '/admin/users', label: 'Usuários Sistema', icon: '👤' }] : [])
      ]
    },
    {
      title: 'Tecnologia',
      items: [
        ...(access.isAdmin || access.hasAnyPermission(['app:face-verification', 'app:face-registration'])
          ? [{ href: '/app/verificar-face', label: 'Verificação Facial', icon: '🔍' }]
          : []),
        ...(canAccess('admin:geofences') ? [{ href: '/admin/geofences', label: 'Cercas Virtuais', icon: '🎯' }] : [])
      ]
    },
    {
      title: 'Sistema',
      items: [
        ...(canAccess('admin:reports') ? [{ href: '/admin/reports', label: 'Relatórios', icon: '📄' }] : []),
        ...(canAccess('admin:settings') ? [{ href: '/admin/settings', label: 'Configurações', icon: '⚙️' }] : []),
        { href: '/admin/manual', label: 'Manual', icon: '📘' }
      ]
    }
  ].map(section => ({
    ...section,
    items: section.items.filter(Boolean)
  })).filter(section => section.items.length > 0);

  // ✅ COMPONENTE HEADER ADMIN
  const AdminHeader = () => (
    <div className="bg-white/90 backdrop-blur-xl border-b border-gray-200/80 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              🔧 Administração
            </h1>
            <p className="text-sm text-gray-600">Sistema de Ponto Facial</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm text-gray-500">Conectado como</div>
              <div className="text-sm font-medium text-gray-900">
                {user.displayName || user.email?.split('@')[0] || 'Administrador'}
              </div>
            </div>
            <button 
              onClick={() => router.push('/app')}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 text-sm font-medium shadow-sm hover:shadow-md"
            >
              ← Voltar ao App
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
          icon: '🔧',
          text: 'Admin',
          href: '/admin'
        }}
        navSections={adminNavSections}
        defaultCollapsed={true} // ✅ RECOLHIDO POR PADRÃO
        persistState={true}
        storageKey="admin-sidebar-collapsed"
        onToggle={setIsSidebarCollapsed}
      />
      
      <div className={`main-content ${isSidebarCollapsed ? 'main-content--sidebar-collapsed' : ''}`}>
        <AdminHeader />
        <LegalTermsGate user={user}>
          <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            {children}
          </main>
        </LegalTermsGate>
      </div>
    </div>
  );
}
