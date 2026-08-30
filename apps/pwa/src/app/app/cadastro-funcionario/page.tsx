'use client';

import dynamic from 'next/dynamic';

// ✅ USANDO FORMULÁRIO REFATORADO SEM DEPENDÊNCIA CIRCULAR
const EmployeeRegistrationForm = dynamic(
  () => import('@/components/employee/EmployeeRegistrationForm'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando formulário de cadastro...</p>
        </div>
      </div>
    )
  }
);

export default function CadastroFuncionario() {
  return <EmployeeRegistrationForm />;
}
