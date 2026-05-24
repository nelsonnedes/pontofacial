'use client';

import { notifyUser, confirmUser } from '@/lib/user-dialogs';
import React, { useState, useCallback } from 'react';
import { useScheduleManager } from '@/hooks/useScheduleManager';
import { HolidayConfig } from '@/lib/scheduling';

const HOLIDAY_TYPES = [
  { value: 'national', label: 'Nacional', icon: '🇧🇷' },
  { value: 'state', label: 'Estadual', icon: '🏛️' },
  { value: 'municipal', label: 'Municipal', icon: '🏢' },
  { value: 'company', label: 'Empresa', icon: '🏭' }
];

// Feriados nacionais mais comuns (podem ser criados automaticamente)
const COMMON_NATIONAL_HOLIDAYS = [
  { name: 'Confraternização Universal', date: '01-01', recurrent: true },
  { name: 'Tiradentes', date: '04-21', recurrent: true },
  { name: 'Dia do Trabalho', date: '05-01', recurrent: true },
  { name: 'Independência do Brasil', date: '09-07', recurrent: true },
  { name: 'Nossa Senhora Aparecida', date: '10-12', recurrent: true },
  { name: 'Finados', date: '11-02', recurrent: true },
  { name: 'Proclamação da República', date: '11-15', recurrent: true },
  { name: 'Natal', date: '12-25', recurrent: true }
];

type HolidayFormData = Pick<HolidayConfig, 'name' | 'date' | 'type' | 'recurrent' | 'active'>;

export default function HolidayManager() {
  const {
    holidays,
    isLoadingHolidays,
    createHoliday,
    updateHoliday,
    deleteHoliday,
    error,
    clearError
  } = useScheduleManager();

  const [isCreating, setIsCreating] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<HolidayConfig | null>(null);
  const [formData, setFormData] = useState<HolidayFormData>({
    name: '',
    date: '',
    type: 'national',
    recurrent: false,
    active: true
  });

  // Resetar formulário
  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      date: '',
      type: 'national',
      recurrent: false,
      active: true
    });
    setIsCreating(false);
    setEditingHoliday(null);
    clearError();
  }, [clearError]);

  // Iniciar criação
  const handleStartCreate = useCallback(() => {
    resetForm();
    setIsCreating(true);
  }, [resetForm]);

  // Editar feriado
  const handleEdit = useCallback((holiday: HolidayConfig) => {
    setFormData({
      name: holiday.name,
      date: holiday.date,
      type: holiday.type,
      recurrent: holiday.recurrent,
      active: holiday.active
    });
    setEditingHoliday(holiday);
    setIsCreating(false);
    clearError();
  }, [clearError]);

  // Salvar feriado
  const handleSave = useCallback(async () => {
    if (!formData.name.trim() || !formData.date.trim()) {
      notifyUser('Nome e data são obrigatórios.');
      return;
    }

    try {
      if (editingHoliday?.id) {
        // Editar existente
        await updateHoliday(editingHoliday.id, formData);
      } else {
        // Criar novo
        await createHoliday(formData);
      }
      
      resetForm();
    } catch (error) {
      console.error('Erro ao salvar feriado:', error);
    }
  }, [formData, editingHoliday, createHoliday, updateHoliday, resetForm]);

  // Deletar feriado
  const handleDelete = useCallback(async (holidayId: string, holidayName: string) => {
    if (!confirmUser(`Tem certeza que deseja deletar o feriado "${holidayName}"?`)) return;
    
    try {
      await deleteHoliday(holidayId);
    } catch (error) {
      console.error('Erro ao deletar feriado:', error);
    }
  }, [deleteHoliday]);

  // Toggle ativo/inativo
  const handleToggleActive = useCallback(async (holiday: HolidayConfig) => {
    if (!holiday.id) return;
    
    try {
      await updateHoliday(holiday.id, { active: !holiday.active });
    } catch (error) {
      console.error('Erro ao atualizar feriado:', error);
    }
  }, [updateHoliday]);

  // Criar feriados nacionais comuns
  const handleCreateCommonHolidays = useCallback(async () => {
    if (!confirmUser('Deseja criar os feriados nacionais mais comuns? Isso pode duplicar feriados existentes.')) {
      return;
    }

    try {
      const currentYear = new Date().getFullYear();
      
      for (const holiday of COMMON_NATIONAL_HOLIDAYS) {
        const fullDate = `${currentYear}-${holiday.date}`;
        
        // Verificar se já existe
        const exists = holidays.some(h => h.date === fullDate && h.name === holiday.name);
        if (!exists) {
          await createHoliday({
            name: holiday.name,
            date: fullDate,
            type: 'national',
            recurrent: holiday.recurrent,
            active: true
          });
        }
      }
      
      notifyUser('Feriados nacionais criados com sucesso!');
    } catch (error) {
      console.error('Erro ao criar feriados comuns:', error);
      notifyUser('Erro ao criar alguns feriados. Verifique o console.');
    }
  }, [holidays, createHoliday]);

  if (isLoadingHolidays) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando feriados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📅 Gerenciar Feriados</h1>
            <p className="text-gray-600">Configure feriados que afetam os horários de trabalho</p>
          </div>
          
          <div className="space-x-2">
            <button
              onClick={handleCreateCommonHolidays}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
            >
              🇧🇷 Criar Feriados Nacionais
            </button>
            <button
              onClick={handleStartCreate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              ➕ Novo Feriado
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <div className="text-red-700">{error}</div>
          </div>
        )}

        {(isCreating || editingHoliday) && (
          <div className="border rounded-lg p-6 mb-8 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingHoliday ? '✏️ Editar' : '➕ Criar'} Feriado
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do Feriado <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Natal, Ano Novo, etc."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {HOLIDAY_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.recurrent}
                      onChange={(e) => setFormData(prev => ({ ...prev, recurrent: e.target.checked }))}
                      className="rounded mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Recorrente (anual)</span>
                  </label>
                </div>
                
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.active}
                      onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.checked }))}
                      className="rounded mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Ativo</span>
                  </label>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingHoliday ? 'Atualizar' : 'Criar'} Feriado
              </button>
            </div>
          </div>
        )}

        {/* Lista de feriados */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Feriados Configurados</h3>
          
          {holidays.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhum feriado configurado ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {holidays
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((holiday) => {
                  const typeInfo = HOLIDAY_TYPES.find(t => t.value === holiday.type);
                  const dateFormatted = new Date(holiday.date + 'T00:00:00').toLocaleDateString('pt-BR');
                  
                  return (
                    <div key={holiday.id} className={`border rounded-lg p-4 ${
                      holiday.active ? 'bg-white' : 'bg-gray-50 opacity-60'
                    }`}>
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <span className="text-2xl">{typeInfo?.icon || '📅'}</span>
                            <div>
                              <h4 className="font-semibold text-gray-900">{holiday.name}</h4>
                              <p className="text-sm text-gray-600">
                                {dateFormatted} • {typeInfo?.label || holiday.type}
                                {holiday.recurrent && ' • Recorrente'}
                                {!holiday.active && ' • Inativo'}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleToggleActive(holiday)}
                            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                              holiday.active
                                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                            }`}
                          >
                            {holiday.active ? '✅ Ativo' : '⏸️ Inativo'}
                          </button>
                          
                          <button
                            onClick={() => handleEdit(holiday)}
                            className="text-blue-600 hover:text-blue-700 text-sm underline"
                          >
                            ✏️ Editar
                          </button>
                          
                          <button
                            onClick={() => holiday.id && handleDelete(holiday.id, holiday.name)}
                            className="text-red-600 hover:text-red-700 text-sm underline"
                          >
                            🗑️ Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Informações adicionais */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">💡 Como Funciona</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Feriados <strong>ativos</strong> são considerados na análise de pontos</li>
            <li>• Em feriados, os funcionários não precisam bater ponto</li>
            <li>• Feriados <strong>recorrentes</strong> ficam sinalizados para aplicação anual na análise</li>
            <li>• Use o tipo <strong>"Empresa"</strong> para feriados específicos da sua organização</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
