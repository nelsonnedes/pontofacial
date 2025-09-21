'use client';

import { useState } from 'react';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState({
    systemName: 'Sistema de Ponto Facial',
    allowOfflineMode: true,
    faceApiTimeout: 45,
    geofencingEnabled: false,
    autoBackup: true,
    maxRetryAttempts: 3,
    sessionTimeout: 24
  });

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Simular salvamento
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert('✅ Configurações salvas com sucesso!');
    } catch (error) {
      alert('❌ Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Tem certeza que deseja restaurar as configurações padrão?')) {
      setSettings({
        systemName: 'Sistema de Ponto Facial',
        allowOfflineMode: true,
        faceApiTimeout: 45,
        geofencingEnabled: false,
        autoBackup: true,
        maxRetryAttempts: 3,
        sessionTimeout: 24
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">⚙️ Configurações</h2>
        <p className="text-gray-600 mt-1">
          Configurar parâmetros do sistema
        </p>
      </div>

      {/* Configurações Gerais */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-medium text-gray-900">
            🏢 Configurações Gerais
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome do Sistema
            </label>
            <input
              type="text"
              value={settings.systemName}
              onChange={(e) => setSettings(prev => ({ ...prev, systemName: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Timeout de Sessão (horas)
            </label>
            <input
              type="number"
              min="1"
              max="168"
              value={settings.sessionTimeout}
              onChange={(e) => setSettings(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) }))}
              className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Configurações do Face API */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-medium text-gray-900">
            🤖 Reconhecimento Facial
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Timeout do Face API (segundos)
            </label>
            <input
              type="number"
              min="10"
              max="120"
              step="5"
              value={settings.faceApiTimeout}
              onChange={(e) => setSettings(prev => ({ ...prev, faceApiTimeout: parseInt(e.target.value) }))}
              className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Tempo limite para inicialização da API de reconhecimento facial
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Máximo de Tentativas
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={settings.maxRetryAttempts}
              onChange={(e) => setSettings(prev => ({ ...prev, maxRetryAttempts: parseInt(e.target.value) }))}
              className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Número máximo de tentativas para reconhecimento facial
            </p>
          </div>
        </div>
      </div>

      {/* Configurações de Sistema */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-medium text-gray-900">
            🔧 Sistema
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">
                Modo Offline
              </label>
              <p className="text-xs text-gray-500">
                Permitir funcionamento offline com sincronização posterior
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.allowOfflineMode}
              onChange={(e) => setSettings(prev => ({ ...prev, allowOfflineMode: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">
                Cercas Virtuais
              </label>
              <p className="text-xs text-gray-500">
                Ativar validação de geofencing para registro de ponto
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.geofencingEnabled}
              onChange={(e) => setSettings(prev => ({ ...prev, geofencingEnabled: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">
                Backup Automático
              </label>
              <p className="text-xs text-gray-500">
                Fazer backup automático dos dados diariamente
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.autoBackup}
              onChange={(e) => setSettings(prev => ({ ...prev, autoBackup: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          </div>
        </div>
      </div>

      {/* Status do Sistema */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-medium text-gray-900">
            📊 Status do Sistema
          </h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Versão:</span>
              <span className="font-medium">v1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Ambiente:</span>
              <span className="font-medium">
                {process.env.NODE_ENV === 'development' ? 'Desenvolvimento' : 'Produção'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span className="font-medium text-green-600">✅ Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? '💾 Salvando...' : '💾 Salvar Configurações'}
        </button>
        <button
          onClick={handleReset}
          className="flex-1 bg-gray-600 text-white px-6 py-3 rounded-md hover:bg-gray-700 transition-colors"
        >
          🔄 Restaurar Padrões
        </button>
      </div>
    </div>
  );
}
