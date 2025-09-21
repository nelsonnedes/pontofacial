'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import FaceRegistration from '@/components/FaceRegistration';

export default function CadastroFacialPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [showRegistration, setShowRegistration] = useState(false);

  const handleRegistrationSuccess = () => {
    alert('✅ Cadastro facial realizado com sucesso!\n\nAgora você pode marcar ponto usando reconhecimento facial.');
    router.push('/app');
  };

  const handleCancel = () => {
    router.push('/app');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="text-red-600 text-5xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Acesso Negado</h1>
          <p className="text-gray-600">Você precisa estar logado para realizar o cadastro facial.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/app')}
                className="flex items-center justify-center w-10 h-10 text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
              >
                <span className="text-lg">←</span>
              </button>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                  👤 Cadastro Facial
                </h1>
                <p className="text-gray-600 text-sm">
                  Configure seu reconhecimento facial para marcar ponto
                </p>
              </div>
            </div>
          </div>
        </div>

        {!showRegistration ? (
          /* Tela de Introdução */
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">🤳</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Cadastre Seu Rosto para Marcar Ponto
              </h2>
              <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
                O cadastro facial permitirá que você marque ponto de forma rápida e segura, 
                sem precisar inserir dados manualmente. O processo é simples e leva apenas alguns minutos.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div className="text-center p-6 bg-blue-50 rounded-xl">
                <div className="text-3xl mb-3">🔒</div>
                <h3 className="font-semibold text-gray-900 mb-2">Seguro e Privado</h3>
                <p className="text-sm text-gray-600">
                  Seus dados biométricos são criptografados e armazenados com segurança.
                </p>
              </div>
              
              <div className="text-center p-6 bg-green-50 rounded-xl">
                <div className="text-3xl mb-3">⚡</div>
                <h3 className="font-semibold text-gray-900 mb-2">Rápido e Fácil</h3>
                <p className="text-sm text-gray-600">
                  Marque ponto em segundos apenas olhando para a câmera.
                </p>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-8">
              <div className="flex items-start gap-3">
                <div className="text-yellow-600 text-xl">⚠️</div>
                <div>
                  <h3 className="font-semibold text-yellow-800 mb-2">Importante:</h3>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    <li>• Certifique-se de estar em um local bem iluminado</li>
                    <li>• Mantenha o rosto centralizado na câmera</li>
                    <li>• Evite óculos escuros ou objetos que cubram o rosto</li>
                    <li>• O processo inclui testes de vivacidade para segurança</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="text-center space-y-4">
              <button
                onClick={() => setShowRegistration(true)}
                className="bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-700 transition-colors font-medium text-lg"
              >
                🚀 Iniciar Cadastro Facial
              </button>
              
              <div>
                <button
                  onClick={handleCancel}
                  className="text-gray-500 hover:text-gray-700 transition-colors text-sm"
                >
                  Cancelar e voltar
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Tela de Registro */
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-blue-600 text-white p-6">
              <h2 className="text-xl font-bold">🤳 Processo de Cadastro Facial</h2>
              <p className="text-blue-100 text-sm mt-1">
                Siga as instruções na tela para completar seu cadastro
              </p>
            </div>
            
            <div className="p-6">
              <FaceRegistration 
                onSuccess={handleRegistrationSuccess}
                onCancel={handleCancel}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
