'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const DEFAULT_SETTINGS = {
  systemName: 'Sistema de Ponto Facial',
  allowOfflineMode: true,
  faceApiTimeout: 45,
  geofencingEnabled: false,
  autoBackup: true,
  maxRetryAttempts: 3,
  sessionTimeout: 24
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const configRef = doc(db, 'systemConfig', 'appSettings');
        const snapshot = await getDoc(configRef);

        if (snapshot.exists()) {
          setSettings(prev => ({ ...prev, ...snapshot.data() }));
          setStatusMessage('Configurações carregadas do Firestore.');
        } else {
          setStatusMessage('Usando padrões locais. Clique em salvar para publicar no Firestore.');
        }

        setLastLoadedAt(new Date());
      } catch (error) {
        console.error('Erro ao carregar configurações:', error);
        setStatusMessage('Não foi possível confirmar as configurações no Firestore.');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage('');

    try {
      const configRef = doc(db, 'systemConfig', 'appSettings');
      await setDoc(configRef, {
        ...settings,
        updatedAt: serverTimestamp(),
        source: 'admin-settings'
      }, { merge: true });
      setStatusMessage('Configurações salvas no Firestore.');
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      setStatusMessage('Erro ao salvar configurações no Firestore.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setStatusMessage('Padrões aplicados na tela. Clique em salvar para publicar.');
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">⚙️ Configurações</h2>
        <p className="text-gray-600 mt-1">
          Configurar parâmetros persistidos do sistema
        </p>
      </div>

      {statusMessage && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {statusMessage}
        </div>
      )}

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
          <p className="mt-1 text-xs text-gray-500">
            Estes parâmetros ficam persistidos no Firestore; a aplicação operacional depende dos módulos conectados a cada regra.
          </p>
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
                Reserva de configuração para rotina automatizada no backend
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
              <span className="text-gray-600">Configuração:</span>
              <span className="font-medium text-blue-600">
                {loading ? 'Carregando' : lastLoadedAt ? 'Verificada' : 'Não verificada'}
              </span>
            </div>
          </div>
          {lastLoadedAt && (
            <p className="mt-3 text-xs text-gray-500">
              Última leitura: {lastLoadedAt.toLocaleString('pt-BR')}
            </p>
          )}
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
