'use client';

import React, { useState } from 'react';

export interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
  className?: string;
  mobileOnly?: boolean; // Mostrar apenas em mobile
  hideOnMobile?: boolean; // Esconder em mobile
}

export interface Action {
  label: string | ((row: any) => string);
  onClick: (row: any) => void;
  className?: string | ((row: any) => string);
  disabled?: (row: any) => boolean;
  icon?: string | ((row: any) => string);
}

interface ResponsiveTableProps {
  data: any[];
  columns: Column[];
  actions?: Action[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: string;
  searchTerm?: string;
  className?: string;
  cardTitle?: (row: any) => React.ReactNode; // Título para o card mobile
  cardSubtitle?: (row: any) => React.ReactNode; // Subtítulo para o card mobile
}

export default function ResponsiveTable({
  data,
  columns,
  actions = [],
  loading = false,
  emptyMessage = 'Nenhum item encontrado',
  emptyIcon = '📄',
  searchTerm = '',
  className = '',
  cardTitle,
  cardSubtitle
}: ResponsiveTableProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // ✅ Filtrar colunas para desktop/mobile
  const desktopColumns = columns.filter(col => !col.mobileOnly);
  const mobileColumns = columns.filter(col => !col.hideOnMobile);

  // ✅ RENDERIZAR AÇÕES NO MOBILE
  const renderMobileActions = (row: any, rowId: string) => {
    if (!actions.length) return null;

    const availableActions = actions.filter(action => 
      !action.disabled || !action.disabled(row)
    );

    if (!availableActions.length) return null;

    return (
      <div className="relative">
        <button
          onClick={() => setOpenDropdown(openDropdown === rowId ? null : rowId)}
          className="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          aria-label="Abrir ações"
        >
          <span className="text-gray-600">⋮</span>
        </button>

        {openDropdown === rowId && (
          <>
            {/* Overlay para fechar dropdown */}
            <div 
              className="fixed inset-0 z-10"
              onClick={() => setOpenDropdown(null)}
            />
            
            {/* Menu dropdown */}
            <div className="absolute right-0 top-12 bg-white rounded-lg shadow-lg border border-gray-200 z-20 min-w-48">
              <div className="py-1">
                {availableActions.map((action, actionIndex) => {
                  const label = typeof action.label === 'function' ? action.label(row) : action.label;
                  const icon = typeof action.icon === 'function' ? action.icon(row) : action.icon;
                  const className = typeof action.className === 'function' ? action.className(row) : action.className;

                  return (
                    <button
                      key={actionIndex}
                      onClick={() => {
                        action.onClick(row);
                        setOpenDropdown(null);
                      }}
                      className={`
                        w-full text-left px-4 py-3 text-sm transition-colors
                        hover:bg-gray-50 flex items-center gap-3
                        ${className || 'text-gray-700 hover:text-gray-900'}
                      `}
                      disabled={action.disabled && action.disabled(row)}
                    >
                      {icon && <span>{icon}</span>}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // ✅ RENDERIZAR LOADING
  if (loading) {
    return (
      <div className="space-y-4">
        {/* Desktop skeleton */}
        <div className="hidden md:block">
          <div className="bg-gray-200 h-12 rounded-lg animate-pulse mb-4"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-200 h-16 rounded-lg animate-pulse mb-2"></div>
          ))}
        </div>
        
        {/* Mobile skeleton */}
        <div className="md:hidden space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-200 h-32 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  // ✅ RENDERIZAR VAZIO
  if (!data.length) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">{emptyIcon}</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">{emptyMessage}</h3>
        {searchTerm && (
          <p className="text-sm text-gray-500">
            Tente ajustar os termos de busca.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* ✅ VERSÃO DESKTOP - TABELA TRADICIONAL */}
      <div className="hidden md:block bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {desktopColumns.map((column) => (
                  <th
                    key={column.key}
                    className={`
                      px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider
                      ${column.className || ''}
                    `}
                  >
                    {column.label}
                  </th>
                ))}
                {actions.length > 0 && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map((row, rowIndex) => (
                <tr key={row.id || rowIndex} className="hover:bg-gray-50">
                  {desktopColumns.map((column) => (
                    <td key={column.key} className={`px-6 py-4 ${column.className || ''}`}>
                      {column.render ? column.render(row[column.key], row) : row[column.key]}
                    </td>
                  ))}
                  {actions.length > 0 && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex flex-wrap justify-end gap-1">
                        {actions.map((action, actionIndex) => {
                          const label = typeof action.label === 'function' ? action.label(row) : action.label;
                          const icon = typeof action.icon === 'function' ? action.icon(row) : action.icon;
                          const className = typeof action.className === 'function' ? action.className(row) : action.className;

                          return (
                            <button
                              key={actionIndex}
                              onClick={() => action.onClick(row)}
                              disabled={action.disabled && action.disabled(row)}
                              className={`
                                px-2 py-1 rounded text-xs transition-colors disabled:opacity-50
                                ${className || 'bg-blue-100 text-blue-700 hover:bg-blue-200'}
                              `}
                            >
                              {icon && <span>{icon} </span>}
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ✅ VERSÃO MOBILE - CARDS VERTICAIS */}
      <div className="md:hidden space-y-4">
        {data.map((row, rowIndex) => (
          <div key={row.id || rowIndex} className="bg-white rounded-lg shadow-sm border p-4">
            {/* Header do Card */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                {cardTitle && (
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {cardTitle(row)}
                  </h3>
                )}
                {cardSubtitle && (
                  <p className="text-xs text-gray-500 mt-1">
                    {cardSubtitle(row)}
                  </p>
                )}
              </div>
              
              {/* Ações Mobile */}
              {actions.length > 0 && renderMobileActions(row, `mobile-${row.id || rowIndex}`)}
            </div>

            {/* Conteúdo do Card */}
            <div className="space-y-2">
              {mobileColumns.map((column) => {
                const value = column.render ? column.render(row[column.key], row) : row[column.key];
                if (!value) return null;

                return (
                  <div key={column.key} className="flex justify-between items-start">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {column.label}:
                    </span>
                    <div className="text-sm text-gray-900 text-right ml-2 flex-1">
                      {value}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
