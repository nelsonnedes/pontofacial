'use client';

import { useState, useEffect } from 'react';
import { useFaceEmbeddings } from '@/hooks/useFaceEmbeddings';
import FaceRegistration from './FaceRegistration';
import FaceVerification from './FaceVerification';

interface FaceManagementProps {
  className?: string;
}

type ManagementView = 'overview' | 'register' | 'verify' | 'update';

export default function FaceManagement({ className = '' }: FaceManagementProps) {
  const [currentView, setCurrentView] = useState<ManagementView>('overview');
  const [faceData, setFaceData] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const {
    getFaceData,
    removeFaceEmbedding,
    hasRegisteredFace,
    isLoading,
    error: embeddingError
  } = useFaceEmbeddings();

  // Carregar dados faciais ao montar o componente
  useEffect(() => {
    loadFaceData();
  }, []);

  // Limpar mensagens após delay
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Carregar dados faciais
  const loadFaceData = async () => {
    try {
      setError(null);
      const hasRegistered = await hasRegisteredFace();
      
      if (hasRegistered) {
        const data = await getFaceData();
        setFaceData(data);
      } else {
        setFaceData(null);
      }
    } catch (err) {
      setError('Erro ao carregar dados faciais.');
    }
  };

  // Manipular sucesso do cadastro
  const handleRegistrationSuccess = () => {
    setSuccess('Rosto cadastrado com sucesso!');
    setCurrentView('overview');
    loadFaceData();
  };

  // Manipular sucesso da verificação
  const handleVerificationSuccess = (userId: string) => {
    setSuccess(`Verificação bem-sucedida! ID: ${userId.substring(0, 8)}...`);
    setCurrentView('overview');
  };

  // Manipular remoção de dados faciais
  const handleRemoveFaceData = async () => {
    try {
      setError(null);
      const result = await removeFaceEmbedding();
      
      if (result) {
        setSuccess('Dados faciais removidos com sucesso!');
        setFaceData(null);
        setShowDeleteConfirm(false);
      } else {
        setError('Erro ao remover dados faciais');
      }
    } catch (err) {
      setError('Erro ao remover dados faciais.');
    }
  };

  // Renderizar visão geral
  const renderOverview = () => {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            👤 Gerenciamento Facial
          </h2>
          <p className="text-gray-600">
            Gerencie seus dados de reconhecimento facial
          </p>
        </div>

        {/* Status do cadastro */}
        <div className="bg-gray-50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Status do Cadastro
            </h3>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              faceData 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {faceData ? '✅ Cadastrado' : '❌ Não Cadastrado'}
            </div>
          </div>
          
          {faceData ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Data de Cadastro:</span>
                  <div className="font-medium">
                    {faceData.createdAt ? new Date(faceData.createdAt).toLocaleDateString('pt-BR') : 'N/A'}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Última Atualização:</span>
                  <div className="font-medium">
                    {faceData.updatedAt ? new Date(faceData.updatedAt).toLocaleDateString('pt-BR') : 'N/A'}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">ID do Usuário:</span>
                  <div className="font-medium font-mono text-xs">
                    {faceData.userId ? `${faceData.userId.substring(0, 16)}...` : 'N/A'}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Qualidade:</span>
                  <div className="font-medium">
                    {faceData.quality ? `${Math.round(faceData.quality * 100)}%` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-600">
              Nenhum rosto cadastrado. Cadastre seu rosto para usar reconhecimento facial.
            </p>
          )}
        </div>

        {/* Ações disponíveis */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!faceData ? (
            <button
              onClick={() => setCurrentView('register')}
              className="p-6 bg-blue-50 border-2 border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-left"
            >
              <div className="text-2xl mb-2">📸</div>
              <h3 className="font-semibold text-blue-900 mb-1">Cadastrar Rosto</h3>
              <p className="text-sm text-blue-700">
                Registre seu rosto para usar reconhecimento facial
              </p>
            </button>
          ) : (
            <>
              <button
                onClick={() => setCurrentView('verify')}
                className="p-6 bg-green-50 border-2 border-green-200 rounded-lg hover:bg-green-100 transition-colors text-left"
              >
                <div className="text-2xl mb-2">🔍</div>
                <h3 className="font-semibold text-green-900 mb-1">Testar Verificação</h3>
                <p className="text-sm text-green-700">
                  Teste o reconhecimento do seu rosto cadastrado
                </p>
              </button>
              
              <button
                onClick={() => setCurrentView('update')}
                className="p-6 bg-orange-50 border-2 border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-left"
              >
                <div className="text-2xl mb-2">🔄</div>
                <h3 className="font-semibold text-orange-900 mb-1">Atualizar Cadastro</h3>
                <p className="text-sm text-orange-700">
                  Recadastre seu rosto com uma nova foto
                </p>
              </button>
            </>
          )}
        </div>

        {/* Ações perigosas */}
        {faceData && (
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Zona de Perigo
            </h3>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              🗑️ Remover Dados Faciais
            </button>
            <p className="text-sm text-gray-500 mt-2">
              Esta ação não pode ser desfeita. Você precisará cadastrar seu rosto novamente.
            </p>
          </div>
        )}
      </div>
    );
  };

  // Renderizar conteúdo baseado na visão atual
  const renderContent = () => {
    switch (currentView) {
      case 'register':
      case 'update':
        return (
          <FaceRegistration
            onSuccess={handleRegistrationSuccess}
            onCancel={() => setCurrentView('overview')}
          />
        );
        
      case 'verify':
        return (
          <FaceVerification
            onSuccess={handleVerificationSuccess}
            onCancel={() => setCurrentView('overview')}
            autoCapture={false}
            maxAttempts={3}
          />
        );
        
      default:
        return renderOverview();
    }
  };

  return (
    <div className={`max-w-4xl mx-auto ${className}`}>
      {/* Navegação */}
      {currentView !== 'overview' && (
        <div className="mb-6">
          <button
            onClick={() => setCurrentView('overview')}
            className="flex items-center text-blue-600 hover:text-blue-700 transition-colors"
          >
            <span className="mr-2">←</span>
            Voltar ao Gerenciamento
          </button>
        </div>
      )}

      {/* Mensagens de feedback */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <div className="text-green-600 mr-2">✅</div>
            <div className="text-sm text-green-700">{success}</div>
          </div>
        </div>
      )}

      {(error || embeddingError) && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <div className="text-red-600 mr-2">⚠️</div>
            <div className="text-sm text-red-700">{error || embeddingError}</div>
          </div>
        </div>
      )}

      {/* Conteúdo principal */}
      <div className="bg-white rounded-2xl shadow-xl p-6">
        {renderContent()}
      </div>

      {/* Modal de confirmação de exclusão */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <div className="text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Confirmar Remoção
              </h3>
              <p className="text-gray-600 mb-6">
                Tem certeza que deseja remover todos os seus dados faciais? 
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRemoveFaceData}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Removendo...' : 'Remover'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && !showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Processando...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Tipos para exportação
export type { FaceManagementProps };