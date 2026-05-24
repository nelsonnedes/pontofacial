'use client';

import { notifyUser, confirmUser } from '@/lib/user-dialogs';
import { useState, useCallback } from 'react';
import { useGeofenceManager } from '@/hooks/useGeofenceManager';
import { Geofence, Location, PointType, formatDistance } from '@/lib/geofencing';

interface GeofenceManagerProps {
  className?: string;
}

type ViewMode = 'list' | 'create' | 'edit';

export default function GeofenceManager({ className = '' }: GeofenceManagerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedFence, setSelectedFence] = useState<Geofence | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const {
    geofences,
    isLoading,
    error,
    createGeofence,
    updateGeofence,
    deleteGeofence,
    toggleGeofence,
    clearError
  } = useGeofenceManager();

  // Formulário para criar/editar cerca
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    latitude: '',
    longitude: '',
    radius: '50',
    allowedTypes: ['entrada', 'saida', 'pausa_inicio', 'pausa_fim'] as PointType[],
    strictMode: true,
    alertMode: false,
    workingHours: {
      enabled: false,
      start: '08:00',
      end: '18:00',
      days: [1, 2, 3, 4, 5] // Seg-Sex
    }
  });

  // Resetar formulário
  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      description: '',
      latitude: '',
      longitude: '',
      radius: '50',
      allowedTypes: ['entrada', 'saida', 'pausa_inicio', 'pausa_fim'],
      strictMode: true,
      alertMode: false,
      workingHours: {
        enabled: false,
        start: '08:00',
        end: '18:00',
        days: [1, 2, 3, 4, 5]
      }
    });
    setSelectedFence(null);
  }, []);

  // Carregar dados da cerca para edição
  const loadFenceForEdit = useCallback((fence: Geofence) => {
    setFormData({
      name: fence.name,
      description: fence.description || '',
      latitude: fence.center.latitude.toString(),
      longitude: fence.center.longitude.toString(),
      radius: fence.radius.toString(),
      allowedTypes: fence.allowedTypes,
      strictMode: fence.strictMode,
      alertMode: fence.alertMode,
      workingHours: {
        enabled: !!fence.workingHours,
        start: fence.workingHours?.start || '08:00',
        end: fence.workingHours?.end || '18:00',
        days: fence.workingHours?.days || [1, 2, 3, 4, 5]
      }
    });
    setSelectedFence(fence);
    setViewMode('edit');
  }, []);

  // Estado para controle do GPS
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Obter localização atual do navegador
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      notifyUser('❌ Geolocalização não é suportada neste navegador.');
      return;
    }

    console.log('📍 Solicitando localização atual...');
    setIsGettingLocation(true);

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('✅ Localização obtida:', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });

        setFormData(prev => ({
          ...prev,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6)
        }));

        setIsGettingLocation(false);
        notifyUser(`✅ Localização obtida com sucesso!\n📍 Lat: ${position.coords.latitude.toFixed(6)}\n📍 Lng: ${position.coords.longitude.toFixed(6)}\n🎯 Precisão: ${Math.round(position.coords.accuracy)}m`);
      },
      (error) => {
        console.error('❌ Erro ao obter localização:', error);
        setIsGettingLocation(false);
        
        let errorMessage = 'Erro desconhecido ao obter localização.';
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = '❌ Permissão de localização negada.\nVá nas configurações do navegador e permita acesso à localização.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = '❌ Localização indisponível.\nVerifique se o GPS está ativado.';
            break;
          case error.TIMEOUT:
            errorMessage = '❌ Tempo limite excedido.\nTente novamente.';
            break;
        }
        
        notifyUser(errorMessage);
      },
      options
    );
  }, []);

  // Submeter formulário
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.latitude || !formData.longitude) {
      notifyUser('Preencha todos os campos obrigatórios.');
      return;
    }

    setIsSubmitting(true);
    clearError();

    try {
      const center: Location = {
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude)
      };

      const radius = parseInt(formData.radius);

      if (viewMode === 'edit' && selectedFence) {
        // ✅ CORREÇÃO: Atualizar com dados corretos
        await updateGeofence(selectedFence.id, {
          name: formData.name,
          description: formData.description,
          latitude: center.latitude,
          longitude: center.longitude,
          radius,
          allowedTypes: formData.allowedTypes,
          strictMode: formData.strictMode,
          alertMode: formData.alertMode,
          workingHours: formData.workingHours.enabled ? {
            enabled: true,
            start: formData.workingHours.start,
            end: formData.workingHours.end,
            days: formData.workingHours.days
          } : undefined
        });
        console.log('✅ Cerca virtual atualizada');
      } else {
        // ✅ CORREÇÃO: Chamar createGeofence com objeto correto
        await createGeofence({
          name: formData.name,
          description: formData.description,
          latitude: center.latitude,
          longitude: center.longitude,
          radius,
          allowedTypes: formData.allowedTypes,
          active: true, // Nova cerca sempre ativa
          strictMode: formData.strictMode,
          alertMode: formData.alertMode,
          workingHours: formData.workingHours.enabled ? {
            enabled: true,
            start: formData.workingHours.start,
            end: formData.workingHours.end,
            days: formData.workingHours.days
          } : undefined
        });
        console.log('✅ Cerca virtual criada');
      }

      resetForm();
      setViewMode('list');
      
    } catch (err) {
      console.error('❌ Erro ao salvar cerca virtual:', err);
      notifyUser('Erro ao salvar cerca virtual. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, viewMode, selectedFence, createGeofence, updateGeofence, clearError, resetForm]);

  // Deletar cerca
  const handleDelete = useCallback(async (fence: Geofence) => {
    if (!confirmUser(`Tem certeza que deseja excluir a cerca "${fence.name}"?`)) {
      return;
    }

    try {
      await deleteGeofence(fence.id);
      console.log('✅ Cerca virtual excluída');
    } catch (err) {
      console.error('❌ Erro ao excluir cerca:', err);
      notifyUser('Erro ao excluir cerca virtual.');
    }
  }, [deleteGeofence]);

  // Toggle ativo/inativo
  const handleToggle = useCallback(async (fence: Geofence) => {
    try {
      await toggleGeofence(fence.id, !fence.active);
      console.log(`✅ Cerca ${!fence.active ? 'ativada' : 'desativada'}`);
    } catch (err) {
      console.error('❌ Erro ao alterar status da cerca:', err);
      notifyUser('Erro ao alterar status da cerca.');
    }
  }, [toggleGeofence]);

  // Renderizar lista de cercas
  const renderFenceList = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Cercas Virtuais Configuradas</h3>
        <button
          onClick={() => {
            resetForm();
            setViewMode('create');
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          ➕ Nova Cerca
        </button>
      </div>

      {geofences.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">🎯</div>
          <p className="text-gray-500">Nenhuma cerca virtual configurada</p>
          <button
            onClick={() => setViewMode('create')}
            className="mt-4 text-blue-600 hover:text-blue-700 underline"
          >
            Criar primeira cerca virtual
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {geofences.map((fence) => (
            <div
              key={fence.id}
              className={`p-4 border rounded-lg transition-colors ${
                fence.active ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium text-gray-900">{fence.name}</h4>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      fence.active 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {fence.active ? '🟢 Ativa' : '🔴 Inativa'}
                    </span>
                  </div>
                  
                  {fence.description && (
                    <p className="text-sm text-gray-600 mb-2">{fence.description}</p>
                  )}
                  
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>📍 {fence.center.latitude.toFixed(4)}, {fence.center.longitude.toFixed(4)}</span>
                    <span>📏 {formatDistance(fence.radius)}</span>
                    <span>🎯 {fence.allowedTypes.length} tipos de ponto</span>
                    <span>📊 {fence.totalMarkings} marcações</span>
                  </div>

                  {fence.workingHours && (
                    <div className="mt-2 text-xs text-blue-600">
                      ⏰ {fence.workingHours.start} às {fence.workingHours.end} 
                      ({fence.workingHours.days.length} dias/semana)
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggle(fence)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      fence.active
                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {fence.active ? '⏸️' : '▶️'}
                  </button>
                  <button
                    onClick={() => loadFenceForEdit(fence)}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200 transition-colors"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(fence)}
                    className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Renderizar formulário
  const renderForm = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          {viewMode === 'create' ? 'Nova Cerca Virtual' : 'Editar Cerca Virtual'}
        </h3>
        <button
          onClick={() => {
            resetForm();
            setViewMode('list');
          }}
          className="text-gray-600 hover:text-gray-800"
        >
          ❌ Cancelar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Informações básicas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome da Cerca *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ex: Escritório Principal"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Raio (metros)
            </label>
            <input
              type="number"
              value={formData.radius}
              onChange={(e) => setFormData(prev => ({ ...prev, radius: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min="1"
              max="1000"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descrição
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={2}
            placeholder="Descrição opcional da cerca virtual"
          />
        </div>

        {/* Localização */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Localização *
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <input
                type="number"
                value={formData.latitude}
                onChange={(e) => setFormData(prev => ({ ...prev, latitude: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Latitude"
                step="any"
                required
              />
            </div>
            <div>
              <input
                type="number"
                value={formData.longitude}
                onChange={(e) => setFormData(prev => ({ ...prev, longitude: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Longitude"
                step="any"
                required
              />
            </div>
          </div>
          <button
            type="button"
            onClick={getCurrentLocation}
            disabled={isGettingLocation}
            className="text-sm text-blue-600 hover:text-blue-700 underline disabled:text-gray-400 disabled:no-underline flex items-center gap-1"
          >
            {isGettingLocation ? (
              <>
                <div className="animate-spin w-3 h-3 border border-blue-500 border-t-transparent rounded-full"></div>
                🔄 Obtendo localização...
              </>
            ) : (
              '📍 Usar minha localização atual'
            )}
          </button>
        </div>

        {/* Tipos de ponto permitidos */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipos de Ponto Permitidos
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'entrada', label: '🟢 Entrada' },
              { value: 'saida', label: '🔴 Saída' },
              { value: 'pausa_inicio', label: '⏸️ Início Pausa' },
              { value: 'pausa_fim', label: '▶️ Fim Pausa' }
            ].map((type) => (
              <label key={type.value} className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.allowedTypes.includes(type.value as PointType)}
                  onChange={(e) => {
                    const typeValue = type.value as PointType;
                    if (e.target.checked) {
                      setFormData(prev => ({
                        ...prev,
                        allowedTypes: [...prev.allowedTypes, typeValue]
                      }));
                    } else {
                      setFormData(prev => ({
                        ...prev,
                        allowedTypes: prev.allowedTypes.filter(t => t !== typeValue)
                      }));
                    }
                  }}
                  className="mr-2"
                />
                <span className="text-sm">{type.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Configurações de modo */}
        <div className="space-y-3">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="strictMode"
              checked={formData.strictMode}
              onChange={(e) => setFormData(prev => ({ ...prev, strictMode: e.target.checked }))}
              className="mr-2"
            />
            <label htmlFor="strictMode" className="text-sm">
              <strong>Modo Rigoroso</strong> - Bloqueia marcação fora da área
            </label>
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id="alertMode"
              checked={formData.alertMode}
              onChange={(e) => setFormData(prev => ({ ...prev, alertMode: e.target.checked }))}
              className="mr-2"
            />
            <label htmlFor="alertMode" className="text-sm">
              <strong>Modo Alerta</strong> - Apenas avisa, mas permite marcação
            </label>
          </div>
        </div>

        {/* Horário de trabalho */}
        <div className="space-y-3">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="workingHoursEnabled"
              checked={formData.workingHours.enabled}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                workingHours: { ...prev.workingHours, enabled: e.target.checked }
              }))}
              className="mr-2"
            />
            <label htmlFor="workingHoursEnabled" className="text-sm font-medium">
              Restringir horário de trabalho
            </label>
          </div>
          
          {formData.workingHours.enabled && (
            <div className="ml-6 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Início</label>
                  <input
                    type="time"
                    value={formData.workingHours.start}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      workingHours: { ...prev.workingHours, start: e.target.value }
                    }))}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Fim</label>
                  <input
                    type="time"
                    value={formData.workingHours.end}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      workingHours: { ...prev.workingHours, end: e.target.value }
                    }))}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-gray-600 mb-1">Dias da semana</label>
                <div className="flex gap-1">
                  {[
                    { value: 1, label: 'S' },
                    { value: 2, label: 'T' },
                    { value: 3, label: 'Q' },
                    { value: 4, label: 'Q' },
                    { value: 5, label: 'S' },
                    { value: 6, label: 'S' },
                    { value: 0, label: 'D' }
                  ].map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => {
                        const days = formData.workingHours.days.includes(day.value)
                          ? formData.workingHours.days.filter(d => d !== day.value)
                          : [...formData.workingHours.days, day.value];
                        setFormData(prev => ({
                          ...prev,
                          workingHours: { ...prev.workingHours, days }
                        }));
                      }}
                      className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                        formData.workingHours.days.includes(day.value)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? '⏳ Salvando...' : viewMode === 'create' ? '➕ Criar Cerca' : '💾 Atualizar'}
          </button>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setViewMode('list');
            }}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );

  if (isLoading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando cercas virtuais...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${className}`}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">🎯 Cercas Virtuais</h2>
          <p className="text-gray-600">
            Configure áreas onde os funcionários podem marcar ponto. Sistema inspirado no Ponto Web Secullum.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <div className="text-red-600 mr-2">⚠️</div>
              <div className="text-sm text-red-700">{error}</div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6">
            {viewMode === 'list' ? renderFenceList() : renderForm()}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { GeofenceManagerProps };
