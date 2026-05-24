'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

type PontoType = 'entrada' | 'saida' | 'pausa_inicio' | 'pausa_fim';

interface TypeOption {
  type: PontoType;
  label: string;
  icon: string;
  color: string;
  description: string;
}

const typeOptions: TypeOption[] = [
  {
    type: 'entrada',
    label: 'Entrada',
    icon: '🟢',
    color: 'bg-green-600 hover:bg-green-700',
    description: 'Registrar entrada no trabalho'
  },
  {
    type: 'saida', 
    label: 'Saída',
    icon: '🔴',
    color: 'bg-red-600 hover:bg-red-700',
    description: 'Registrar saída do trabalho'
  },
  {
    type: 'pausa_inicio',
    label: 'Início da Pausa',
    icon: '⏸️',
    color: 'bg-yellow-600 hover:bg-yellow-700',
    description: 'Iniciar intervalo/pausa'
  },
  {
    type: 'pausa_fim',
    label: 'Fim da Pausa', 
    icon: '▶️',
    color: 'bg-blue-600 hover:bg-blue-700',
    description: 'Finalizar intervalo/pausa'
  }
];

interface TypeCardProps {
  option: TypeOption;
  onSelect: (type: PontoType) => void;
}

function TypeCard({ option, onSelect }: TypeCardProps) {
  return (
    <button
      onClick={() => onSelect(option.type)}
      className={`
        ${option.color}
        text-white p-6 rounded-2xl shadow-xl hover:shadow-2xl
        transform hover:scale-105 transition-all duration-300
        flex flex-col items-center space-y-4
        min-h-[200px] w-full
        focus:outline-none focus:ring-4 focus:ring-blue-300
      `}
    >
      <div className="text-6xl mb-2">{option.icon}</div>
      <h3 className="text-xl font-bold text-center">{option.label}</h3>
      <p className="text-sm text-center opacity-90 leading-relaxed">
        {option.description}
      </p>
    </button>
  );
}

export default function SelectTypeScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isReady, setIsReady] = useState(false);

  // Verificar se usuário está pronto para marcar ponto
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    setIsReady(true);
  }, [user, authLoading, router]);

  const handleTypeSelect = (type: PontoType) => {
    // Navegar para página de captura com o tipo selecionado
    router.push(`/app/marcar/capture?type=${type}`);
  };

  // Loading state
  if (!isReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {authLoading ? 'Verificando acesso...' : 'Carregando...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            Marcar Ponto
          </h1>
          <p className="text-lg text-gray-600">
            Selecione o tipo de marcação que deseja realizar
          </p>
          
          {/* User info */}
          {user && (
            <div className="mt-4 inline-flex items-center px-4 py-2 bg-white rounded-full shadow-md">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              <span className="text-sm text-gray-700">
                Logado como <strong>{user.displayName || user.email}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Type Selection Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {typeOptions.map((option) => (
            <TypeCard
              key={option.type}
              option={option}
              onSelect={handleTypeSelect}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="text-center space-y-4">
          <div className="text-sm text-gray-500">
            Sistema de Ponto Facial - Reconhecimento automático multi-usuário
          </div>
          
          <div className="flex justify-center space-x-4">
            <Link
              href="/app"
              className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              ← Voltar ao Menu
            </Link>
            
            <Link
              href="/app/historico"
              className="px-6 py-2 text-blue-600 hover:text-blue-800 transition-colors"
            >
              Ver Histórico
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
