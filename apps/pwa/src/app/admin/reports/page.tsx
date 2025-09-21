'use client';

import ReportsManager from '@/components/ReportsManager';

export default function AdminReportsPage() {
  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">📄 Relatórios</h2>
        <p className="text-gray-600 mt-1">
          Gerar relatórios AFD, AEJ e outras documentações legais
        </p>
      </div>

      {/* Estatísticas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border">
          <div className="flex items-center">
            <div className="text-2xl text-purple-600 mr-4">📁</div>
            <div>
              <p className="text-sm text-gray-500">Relatórios AFD</p>
              <p className="text-2xl font-bold text-gray-900">12</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 border">
          <div className="flex items-center">
            <div className="text-2xl text-blue-600 mr-4">👤</div>
            <div>
              <p className="text-sm text-gray-500">Relatórios AEJ</p>
              <p className="text-2xl font-bold text-gray-900">8</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 border">
          <div className="flex items-center">
            <div className="text-2xl text-green-600 mr-4">📄</div>
            <div>
              <p className="text-sm text-gray-500">Espelhos de Ponto</p>
              <p className="text-2xl font-bold text-gray-900">45</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 border">
          <div className="flex items-center">
            <div className="text-2xl text-orange-600 mr-4">📊</div>
            <div>
              <p className="text-sm text-gray-500">Registros Este Mês</p>
              <p className="text-2xl font-bold text-gray-900">1.2k</p>
            </div>
          </div>
        </div>
      </div>

      {/* Componente de Relatórios */}
      <ReportsManager />
    </div>
  );
}
