'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';

// ✅ INTERFACES
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  section?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface CollapsibleSidebarProps {
  // Configuração básica
  logo: {
    icon: string;
    text: string;
    href?: string;
  };
  
  // Itens de navegação
  navItems?: NavItem[];
  navSections?: NavSection[];
  
  // Comportamento
  defaultCollapsed?: boolean;
  persistState?: boolean;
  storageKey?: string;
  
  // Callbacks
  onToggle?: (_isCollapsed: boolean) => void;
  onItemClick?: (_item: NavItem) => void;
  
  // Customização
  className?: string;
  children?: React.ReactNode;
}

// ✅ HOOK DE CONTROLE DE ESTADO
function useSidebarState(
  defaultCollapsed: boolean = false,
  persistState: boolean = true,
  storageKey: string = 'sidebar-collapsed'
) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // ✅ DETECTAR MOBILE - OTIMIZADO PARA MOBILE
  useEffect(() => {
    const checkMobile = () => {
      // ✅ CORREÇÃO: Breakpoint mais adequado 768px para mobile
      const isMobileDevice = window.innerWidth <= 768;
      const isTabletDevice = window.innerWidth <= 1024 && window.innerWidth > 768;
      
      setIsMobile(isMobileDevice);
      
      // ✅ OTIMIZAÇÃO: Log apenas quando necessário (debug)
      if (process.env.NODE_ENV === 'development') {
        console.log('📱 Mobile detection:', { 
          width: window.innerWidth, 
          isMobile: isMobileDevice, 
          isTablet: isTabletDevice,
          userAgent: navigator.userAgent.includes('Mobile')
        });
      }
    };
    
    // Detectar no mount
    checkMobile();
    
    // ✅ CORREÇÃO: Usar apenas window.addEventListener para melhor performance no mobile
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Carregar estado salvo
  useEffect(() => {
    if (persistState && typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) {
        setIsCollapsed(JSON.parse(saved));
      }
    }
  }, [persistState, storageKey]);

  // Salvar estado
  useEffect(() => {
    if (persistState && typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(isCollapsed));
    }
  }, [isCollapsed, persistState, storageKey]);

  const toggle = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const toggleMobile = useCallback(() => {
    setIsMobileOpen(prev => {
      const newState = !prev;
      
      // Debug para desenvolvimento
      if (process.env.NODE_ENV === 'development') {
        console.log('📱 Toggle mobile menu:', { from: prev, to: newState });
      }
      
      // Prevenir scroll do body quando menu aberto
      if (newState) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
      
      return newState;
    });
  }, []);

  const closeMobile = useCallback(() => {
    setIsMobileOpen(false);
    // Restaurar scroll do body
    document.body.style.overflow = '';
    
    if (process.env.NODE_ENV === 'development') {
      console.log('📱 Close mobile menu');
    }
  }, []);

  return {
    isCollapsed,
    isMobileOpen,
    isMobile,
    toggle,
    toggleMobile,
    closeMobile,
    setIsCollapsed
  };
}

// ✅ COMPONENTE PRINCIPAL
export default function CollapsibleSidebar({
  logo,
  navItems = [],
  navSections = [],
  defaultCollapsed = true, // ✅ RECOLHIDO POR PADRÃO
  persistState = true,
  storageKey = 'sidebar-collapsed',
  onToggle,
  onItemClick,
  className = '',
  children
}: CollapsibleSidebarProps) {
  
  const pathname = usePathname(); // ✅ CORREÇÃO: Declarar pathname
  const sidebarRef = useRef<HTMLElement>(null);
  const [tooltip, setTooltip] = useState<{
    label: string;
    badge?: number;
    top: number;
    left: number;
  } | null>(null);
  
  const {
    isCollapsed,
    isMobileOpen,
    isMobile,
    toggle,
    toggleMobile,
    closeMobile
  } = useSidebarState(defaultCollapsed, persistState, storageKey);

  // Callback de toggle
  useEffect(() => {
    if (onToggle) {
      onToggle(isCollapsed);
    }
  }, [isCollapsed, onToggle]);

  useEffect(() => {
    if (isMobile || !isCollapsed) {
      setTooltip(null);
    }
  }, [isMobile, isCollapsed]);

  // Fechar mobile ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isMobile && 
        isMobileOpen && 
        sidebarRef.current && 
        !sidebarRef.current.contains(event.target as Node)
      ) {
        closeMobile();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobile, isMobileOpen, closeMobile]);

  // ❌ COMENTADO: Fechar mobile ao navegar (CAUSA DO PROBLEMA)
  // useEffect(() => {
  //   if (isMobile && isMobileOpen) {
  //     closeMobile();
  //   }
  // }, [pathname, isMobile, isMobileOpen, closeMobile]);

  const groupedItems = navSections.length > 0 ? navSections : [
    { title: '', items: navItems }
  ];

  // ✅ CLASSE CSS DINÂMICA
  const sidebarClasses = [
    'sidebar',
    isCollapsed && !isMobile ? 'sidebar--collapsed' : '',
    isMobile ? 'sidebar--mobile' : '',
    isMobile && isMobileOpen ? 'sidebar--open' : '',
    className
  ].filter(Boolean).join(' ');

  // ✅ RENDERIZAR NAV ITEM
  const renderNavItem = (item: NavItem) => {
    const isActive = pathname === item.href || 
                     (item.href !== '/' && pathname.startsWith(item.href));
    
    const handleClick = () => {
      if (onItemClick) {
        onItemClick(item);
      }
      setTooltip(null);
      if (isMobile) {
        closeMobile();
      }
    };

    const showTooltip = (target: HTMLElement) => {
      if (isMobile || !isCollapsed) return;

      const rect = target.getBoundingClientRect();
      setTooltip({
        label: item.label,
        badge: item.badge,
        top: rect.top + rect.height / 2,
        left: rect.right + 12
      });
    };

    return (
      <li key={item.href} className="nav-item">
        <Link
          href={item.href}
          onClick={handleClick}
          onMouseEnter={(event) => showTooltip(event.currentTarget)}
          onMouseLeave={() => setTooltip(null)}
          onFocus={(event) => showTooltip(event.currentTarget)}
          onBlur={() => setTooltip(null)}
          className={`nav-link ${isActive ? 'nav-link--active' : ''}`}
          aria-label={item.label}
          aria-current={isActive ? 'page' : undefined}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-text">{item.label}</span>
          
          {/* Badge de notificação */}
          {item.badge && item.badge > 0 && (
            <span className={`nav-badge ${item.badge > 9 ? 'nav-badge--with-number' : ''}`}>
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <>
      {/* ✅ HEADER MOBILE */}
      {isMobile && (
        <header className="mobile-header">
          <button
            onClick={toggleMobile}
            className={`mobile-menu-btn ${isMobileOpen ? 'mobile-menu-btn--open' : ''}`}
            aria-label={isMobileOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={isMobileOpen}
            type="button"
          >
            {isMobileOpen ? '✕' : '☰'}
          </button>
          
          <Link href={logo.href || '/'} className="sidebar-logo">
            <span className="sidebar-logo-icon">{logo.icon}</span>
            <span className="sidebar-logo-text">{logo.text}</span>
          </Link>
          
          <div style={{ width: '2.5rem' }} /> {/* Spacer para centralizar logo */}
        </header>
      )}

      {/* ✅ OVERLAY MOBILE */}
      {isMobile && (
        <div 
          className={`sidebar-overlay ${isMobileOpen ? 'sidebar-overlay--visible' : ''}`}
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* ✅ SIDEBAR PRINCIPAL */}
      <aside 
        ref={sidebarRef}
        className={sidebarClasses}
        aria-label="Navegação principal"
      >
        {/* Header do Sidebar */}
        <div className="sidebar-header">
          <Link href={logo.href || '/'} className="sidebar-logo">
            <span className="sidebar-logo-icon">{logo.icon}</span>
            <span className="sidebar-logo-text">{logo.text}</span>
          </Link>
          
          {!isMobile && (
            <button
              onClick={toggle}
              className="sidebar-toggle"
              aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
              title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
              type="button"
            >
              {isCollapsed ? '→' : '←'}
            </button>
          )}
        </div>

        {/* Navegação */}
        <nav className="sidebar-nav" role="navigation">
          {groupedItems.map((section, sectionIndex) => (
            <div key={sectionIndex} className="nav-section">
              {section.title && (
                <h3 className="nav-section-title">{section.title}</h3>
              )}
              <ul className="nav-list" role="list">
                {section.items.map(renderNavItem)}
              </ul>
            </div>
          ))}
          
          {/* Conteúdo customizado */}
          {children}
        </nav>
      </aside>

      {tooltip && !isMobile && isCollapsed && typeof document !== 'undefined' && createPortal(
        <div
          className="nav-floating-tooltip"
          style={{
            top: `${tooltip.top}px`,
            left: `${tooltip.left}px`
          }}
          role="tooltip"
        >
          {tooltip.label}
          {tooltip.badge && tooltip.badge > 0 && ` (${tooltip.badge})`}
        </div>,
        document.body
      )}

    </>
  );
}

// ✅ COMPONENTE DE LAYOUT AUXILIAR
interface SidebarLayoutProps {
  children?: React.ReactNode;
  className?: string;
}

export function SidebarLayout({ children, className = '' }: SidebarLayoutProps) {
  return (
    <main className={`main-content ${className}`} role="main">
      {children}
    </main>
  );
}

// ✅ HOC PARA FACILITAR USO
export function withSidebar<P extends object>(
  Component: React.ComponentType<P>,
  sidebarProps: Omit<CollapsibleSidebarProps, 'children'>
) {
  return function WrappedComponent(props: P) {
    return (
      <div className="nav-container">
        <CollapsibleSidebar {...sidebarProps} />
        <SidebarLayout>
          <Component {...props} />
        </SidebarLayout>
      </div>
    );
  };
}

// ✅ CONTEXT PARA CONTROLE GLOBAL (OPCIONAL)
import { createContext, useContext } from 'react';

interface SidebarContextValue {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  isMobile: boolean;
  toggle: () => void;
  toggleMobile: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ 
  children, 
  ...sidebarProps 
}: CollapsibleSidebarProps) {
  const sidebarState = useSidebarState(
    sidebarProps.defaultCollapsed,
    sidebarProps.persistState,
    sidebarProps.storageKey
  );

  return (
    <SidebarContext.Provider value={sidebarState}>
      <div className="nav-container">
        <CollapsibleSidebar {...sidebarProps}>
          {children}
        </CollapsibleSidebar>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return context;
}
