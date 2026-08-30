'use client';

import { confirmUser } from '@/lib/user-dialogs';
import React, { useState, useCallback, useEffect } from 'react';
import { useScheduleManager } from '@/hooks/useScheduleManager';
import { EmployeeSchedule, DaySchedule, DayOfWeek, ScheduleUtils } from '@/lib/scheduling';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import HolidayManager from './HolidayManager';
import { SCHEDULE_TYPES, getScheduleTypeInfo } from '@/types/schedule';
import { useAuth } from '@/hooks/useAuth';

interface Employee {
  id: string;
  nomeCompleto: string;
  cargo: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda', short: 'Seg' },
  { value: 2, label: 'Terça', short: 'Ter' },
  { value: 3, label: 'Quarta', short: 'Qua' },
  { value: 4, label: 'Quinta', short: 'Qui' },
  { value: 5, label: 'Sexta', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' }
];

const DEFAULT_SHIFT = {
  start: '08:00',
  end: '17:00',
  breakStart: '12:00',
  breakEnd: '13:00'
};

const DEFAULT_TOLERANCE = {
  entryMinutes: 15,
  exitMinutes: 15,
  breakMinutes: 10
};

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function formatTimeDraft(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  if (digits.length === 3 && Number(digits.slice(0, 2)) > 23) {
    return `0${digits.slice(0, 1)}:${digits.slice(1)}`;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeTime(value: string, fallback: string): string {
  const trimmedValue = value.trim();
  if (isValidTime(trimmedValue)) return trimmedValue;

  const colonMatch = /^(\d{1,2}):(\d{1,2})$/.exec(trimmedValue);
  if (colonMatch) {
    const hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2].padEnd(2, '0'));

    if (hours <= 23 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    return fallback;
  }

  const digits = trimmedValue.replace(/\D/g, '').slice(0, 4);
  if (!digits) return fallback;

  const hoursDigits = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, Math.min(2, digits.length));
  const minutesDigits = digits.length === 3 ? digits.slice(1) : digits.length > 2 ? digits.slice(2) : '00';
  const hours = Number(hoursDigits || '0');
  const minutes = Number(minutesDigits.padEnd(2, '0') || '0');

  if (hours > 23 || minutes > 59) return fallback;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getFirstShift(dayData: DaySchedule) {
  return dayData.shifts[0] || DEFAULT_SHIFT;
}

function cloneDaySchedule(source: DaySchedule, targetDayOfWeek: DayOfWeek): DaySchedule {
  return {
    ...source,
    dayOfWeek: targetDayOfWeek,
    isWorkingDay: true,
    shifts: (source.shifts.length > 0 ? source.shifts : [DEFAULT_SHIFT]).map(shift => ({ ...shift })),
    tolerance: { ...source.tolerance }
  };
}

function isWeekday(dayOfWeek: DayOfWeek): boolean {
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function TimeInput({
  id,
  label,
  value,
  fallback,
  onChange
}: {
  id: string;
  label: string;
  value?: string;
  fallback: string;
  onChange: (_value: string) => void;
}) {
  const normalizedValue = value || fallback;
  const [draft, setDraft] = useState(normalizedValue);

  useEffect(() => {
    setDraft(normalizedValue);
  }, [normalizedValue]);

  const commitValue = useCallback((nextValue: string) => {
    const normalized = normalizeTime(nextValue, normalizedValue);
    setDraft(normalized);
    onChange(normalized);
  }, [normalizedValue, onChange]);

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="HH:MM"
        value={draft}
        onChange={(event) => {
          const nextDraft = formatTimeDraft(event.target.value);
          setDraft(nextDraft);

          if (isValidTime(nextDraft)) {
            onChange(nextDraft);
          }
        }}
        onBlur={() => commitValue(draft)}
        className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label={label}
      />
    </div>
  );
}

const DayScheduleForm: React.FC<{
  dayData: DaySchedule;
  onUpdate: (_data: Partial<DaySchedule>) => void;
  onCopyToNextWeekdays: () => void;
}> = React.memo(function DayScheduleForm({
  dayData,
  onUpdate,
  onCopyToNextWeekdays
}) {
  const dayInfo = DAYS_OF_WEEK.find(d => d.value === dayData.dayOfWeek);
  const shift = getFirstShift(dayData);

  const updateShift = useCallback((updates: Partial<typeof DEFAULT_SHIFT>) => {
    onUpdate({
      shifts: [{
        ...shift,
        ...updates
      }]
    });
  }, [onUpdate, shift]);

  const toggleWorkingDay = useCallback((isWorkingDay: boolean) => {
    onUpdate({
      isWorkingDay,
      shifts: isWorkingDay && dayData.shifts.length === 0 ? [{ ...DEFAULT_SHIFT }] : dayData.shifts,
      tolerance: dayData.tolerance || { ...DEFAULT_TOLERANCE }
    });
  }, [dayData.shifts, dayData.tolerance, onUpdate]);

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
        <h4 className="font-medium text-gray-900">{dayInfo?.label}</h4>
        <div className="flex flex-wrap items-center gap-3">
          {dayData.isWorkingDay && isWeekday(dayData.dayOfWeek) && dayData.dayOfWeek < 5 && (
            <button
              type="button"
              onClick={onCopyToNextWeekdays}
              className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Replicar para próximos dias úteis
            </button>
          )}
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={dayData.isWorkingDay}
              onChange={(e) => toggleWorkingDay(e.target.checked)}
              className="rounded mr-2"
            />
            <span className="text-sm text-gray-600">Dia de trabalho</span>
          </label>
        </div>
      </div>

      {dayData.isWorkingDay && (
        <div className="space-y-4">
          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Digite no formato HH:MM, por exemplo 07:30. O campo não muda sozinho para o próximo horário.
          </div>

          {/* Horário principal */}
          <div className="grid grid-cols-2 gap-4">
            <TimeInput
              id={`schedule-${dayData.dayOfWeek}-start`}
              label="Entrada"
              value={shift.start}
              fallback="08:00"
              onChange={(value) => updateShift({ start: value })}
            />
            <TimeInput
              id={`schedule-${dayData.dayOfWeek}-end`}
              label="Saída"
              value={shift.end}
              fallback="17:00"
              onChange={(value) => updateShift({ end: value })}
            />
          </div>

          {/* Intervalo */}
          <div className="grid grid-cols-2 gap-4">
            <TimeInput
              id={`schedule-${dayData.dayOfWeek}-break-start`}
              label="Início Intervalo"
              value={shift.breakStart}
              fallback="12:00"
              onChange={(value) => updateShift({ breakStart: value })}
            />
            <TimeInput
              id={`schedule-${dayData.dayOfWeek}-break-end`}
              label="Fim Intervalo"
              value={shift.breakEnd}
              fallback="13:00"
              onChange={(value) => updateShift({ breakEnd: value })}
            />
          </div>

          {/* Tolerâncias */}
          <div className="border-t pt-3">
            <h5 className="text-xs font-medium text-gray-700 mb-2">Tolerâncias (minutos)</h5>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Entrada</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={dayData.tolerance.entryMinutes}
                  onChange={(e) => onUpdate({
                    tolerance: {
                      ...dayData.tolerance,
                      entryMinutes: parseInt(e.target.value) || 0
                    }
                  })}
                  className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Saída</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={dayData.tolerance.exitMinutes}
                  onChange={(e) => onUpdate({
                    tolerance: {
                      ...dayData.tolerance,
                      exitMinutes: parseInt(e.target.value) || 0
                    }
                  })}
                  className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Intervalo</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={dayData.tolerance.breakMinutes}
                  onChange={(e) => onUpdate({
                    tolerance: {
                      ...dayData.tolerance,
                      breakMinutes: parseInt(e.target.value) || 0
                    }
                  })}
                  className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default function ScheduleConfiguration() {
  const { user } = useAuth();
  const {
    schedules,
    isLoadingSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    error,
    clearError
  } = useScheduleManager();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [editingSchedule, setEditingSchedule] = useState<EmployeeSchedule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'schedules' | 'holidays'>('schedules');

  // Carregar funcionários
  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'employees'));
      const employeesData: Employee[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        employeesData.push({
          id: doc.id,
          nomeCompleto: data.nomeCompleto || '',
          cargo: data.cargo || ''
        });
      });
      
      setEmployees(employeesData);
      console.log(`✅ Carregados ${employeesData.length} funcionários`);
    } catch (error) {
      console.error('❌ Erro ao carregar funcionários:', error);
    } finally {
      setIsLoadingEmployees(false);
    }
  };

  // Iniciar criação de novo horário
  const handleCreateNew = useCallback(() => {
    if (!selectedEmployee) return;
    
    const employee = employees.find(e => e.id === selectedEmployee);
    if (!employee) return;

    const newSchedule = ScheduleUtils.createDefaultSchedule(
      selectedEmployee,
      employee.nomeCompleto,
      user?.uid || 'system'
    );

    setEditingSchedule(newSchedule);
    setIsCreating(true);
    clearError();
  }, [selectedEmployee, employees, clearError, user?.uid]);

  // Editar horário existente
  const handleEdit = useCallback((schedule: EmployeeSchedule) => {
    setEditingSchedule(schedule);
    setIsCreating(false);
    clearError();
  }, [clearError]);

  // Atualizar campo do horário
  const updateScheduleField = useCallback((field: keyof EmployeeSchedule, value: any) => {
    if (!editingSchedule) return;
    
    setEditingSchedule(prev => prev ? { ...prev, [field]: value } : null);
  }, [editingSchedule]);

  // Atualizar horário de um dia específico
  const updateDaySchedule = useCallback((dayOfWeek: DayOfWeek, daySchedule: Partial<DaySchedule>) => {
    if (!editingSchedule) return;

    const updatedWeekSchedule = editingSchedule.weekSchedule.map(day => {
      if (day.dayOfWeek === dayOfWeek) {
        return { ...day, ...daySchedule };
      }
      return day;
    });

    setEditingSchedule(prev => prev ? { 
      ...prev, 
      weekSchedule: updatedWeekSchedule 
    } : null);
  }, [editingSchedule]);

  const replicateFirstWorkingDayToNextWeekdays = useCallback(() => {
    setEditingSchedule(prev => {
      if (!prev) return null;

      const sourceDay = prev.weekSchedule.find(day => (
        isWeekday(day.dayOfWeek) && day.isWorkingDay && day.shifts.length > 0
      ));
      if (!sourceDay) return prev;

      return {
        ...prev,
        scheduleType: 'custom',
        weekSchedule: prev.weekSchedule.map(day => (
          day.dayOfWeek > sourceDay.dayOfWeek && isWeekday(day.dayOfWeek)
            ? cloneDaySchedule(sourceDay, day.dayOfWeek)
            : day
        ))
      };
    });
  }, []);

  const replicateDayToNextWeekdays = useCallback((sourceDayOfWeek: DayOfWeek) => {
    setEditingSchedule(prev => {
      if (!prev) return null;

      const sourceDay = prev.weekSchedule.find(day => day.dayOfWeek === sourceDayOfWeek);
      if (!sourceDay || !sourceDay.isWorkingDay) return prev;

      return {
        ...prev,
        scheduleType: 'custom',
        weekSchedule: prev.weekSchedule.map(day => (
          day.dayOfWeek > sourceDay.dayOfWeek && isWeekday(day.dayOfWeek)
            ? cloneDaySchedule(sourceDay, day.dayOfWeek)
            : day
        ))
      };
    });
  }, []);

  // Salvar horário
  const handleSave = useCallback(async () => {
    if (!editingSchedule || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (isCreating) {
        await createSchedule(editingSchedule);
      } else if (editingSchedule.id) {
        await updateSchedule(editingSchedule.id, editingSchedule);
      }
      
      setEditingSchedule(null);
      setIsCreating(false);
      setSelectedEmployee('');
    } catch (error) {
      console.error('Erro ao salvar horário:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [editingSchedule, isCreating, isSubmitting, createSchedule, updateSchedule]);

  // Cancelar edição
  const handleCancel = useCallback(() => {
    setEditingSchedule(null);
    setIsCreating(false);
    setSelectedEmployee('');
    clearError();
  }, [clearError]);

  // Deletar horário
  const handleDelete = useCallback(async (scheduleId: string) => {
    if (!confirmUser('Tem certeza que deseja deletar este horário?')) return;
    
    try {
      await deleteSchedule(scheduleId);
    } catch (error) {
      console.error('Erro ao deletar horário:', error);
    }
  }, [deleteSchedule]);

  if (isLoadingSchedules || isLoadingEmployees) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando horários...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">⏰ Configuração de Horários</h1>
            <p className="text-gray-600">Gerencie horários de trabalho e tolerâncias dos funcionários</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <div className="text-red-700">{error}</div>
          </div>
        )}

        {/* Tabs de navegação */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('schedules')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'schedules'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              ⏰ Horários dos Funcionários
            </button>
            <button
              onClick={() => setActiveTab('holidays')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'holidays'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📅 Feriados
            </button>
          </nav>
        </div>

        {activeTab === 'schedules' && !editingSchedule ? (
          <>
            {/* Seleção de funcionário para novo horário */}
            <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-900 mb-4">➕ Criar Novo Horário</h3>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Selecionar Funcionário
                  </label>
                  <select
                    value={selectedEmployee}
                    onChange={(e) => setSelectedEmployee(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione um funcionário...</option>
                    {employees
                      .filter(emp => !schedules.some(sch => sch.employeeId === emp.id))
                      .map(employee => (
                        <option key={employee.id} value={employee.id}>
                          {employee.nomeCompleto} - {employee.cargo}
                        </option>
                      ))
                    }
                  </select>
                </div>
                <button
                  onClick={handleCreateNew}
                  disabled={!selectedEmployee}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Criar Horário
                </button>
              </div>
            </div>

            {/* Lista de horários existentes */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Horários Configurados</h3>
              
              {schedules.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Nenhum horário configurado ainda.
                </div>
              ) : (
                <div className="space-y-4">
                  {schedules.map((schedule) => (
                    <div key={schedule.id} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">{schedule.employeeName}</h4>
                          <p className="text-sm text-gray-600 mb-2">
                            Tipo: {schedule.scheduleType === 'default' ? 'Padrão' : 
                                   schedule.scheduleType === 'custom' ? 'Personalizado' : 'Flexível'}
                          </p>
                          
                          <div className="grid grid-cols-7 gap-2">
                            {schedule.weekSchedule.map((day) => {
                              const dayInfo = DAYS_OF_WEEK.find(d => d.value === day.dayOfWeek);
                              const shift = day.shifts[0];
                              
                              return (
                                <div key={day.dayOfWeek} className="text-center">
                                  <div className="text-xs font-medium text-gray-700">{dayInfo?.short}</div>
                                  {day.isWorkingDay && shift ? (
                                    <div className="text-xs text-gray-600">
                                      <div>{shift.start}-{shift.end}</div>
                                      {shift.breakStart && (
                                        <div className="text-gray-400">
                                          🍽️ {shift.breakStart}-{shift.breakEnd}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-400">Folga</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEdit(schedule)}
                            className="text-blue-600 hover:text-blue-700 text-sm underline"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => schedule.id && handleDelete(schedule.id)}
                            className="text-red-600 hover:text-red-700 text-sm underline"
                          >
                            🗑️ Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : activeTab === 'schedules' && editingSchedule ? (
          /* Editor de horário */
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">
                {isCreating ? '➕ Criando' : '✏️ Editando'} Horário: {editingSchedule.employeeName}
              </h3>
              <div className="space-x-2">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>

            {/* Configurações gerais */}
            <div className="mb-8 p-4 border rounded-lg">
              <h4 className="font-medium text-gray-900 mb-4">⚙️ Configurações Gerais</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Horário
                  </label>
                  <select
                    value={editingSchedule.scheduleType}
                    onChange={(e) => updateScheduleField('scheduleType', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {SCHEDULE_TYPES.map(type => (
                      <option key={type.type} value={type.type}>
                        {type.icon} {type.label}
                      </option>
                    ))}
                  </select>
                  
                  {/* ✅ SÊNIOR: Exibir características do tipo selecionado */}
                  {editingSchedule.scheduleType && (() => {
                    const typeInfo = getScheduleTypeInfo(editingSchedule.scheduleType);
                    if (!typeInfo) return null;
                    
                    return (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm font-semibold text-blue-900 mb-2">
                          {typeInfo.icon} {typeInfo.description}
                        </p>
                        <div className="text-xs text-blue-700 space-y-1">
                          {typeInfo.characteristics.map((char, idx) => (
                            <div key={idx}>{char}</div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                <div className="flex items-center">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editingSchedule.active}
                      onChange={(e) => updateScheduleField('active', e.target.checked)}
                      className="rounded mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Horário ativo</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Horários da semana */}
            <div>
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">📅 Horários da Semana</h4>
                  <p className="mt-1 text-sm text-gray-600">
                    Ajuste o primeiro dia útil e replique para os próximos dias úteis quando a jornada for igual.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={replicateFirstWorkingDayToNextWeekdays}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  Replicar primeiro dia útil
                </button>
              </div>
              <div className="space-y-4">
                {editingSchedule.weekSchedule.map((daySchedule) => (
                  <DayScheduleForm
                    key={daySchedule.dayOfWeek}
                    dayData={daySchedule}
                    onUpdate={(data) => updateDaySchedule(daySchedule.dayOfWeek, data)}
                    onCopyToNextWeekdays={() => replicateDayToNextWeekdays(daySchedule.dayOfWeek)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : activeTab === 'holidays' ? (
          /* Gerenciamento de Feriados */
          <HolidayManager />
        ) : null}
      </div>
    </div>
  );
}
