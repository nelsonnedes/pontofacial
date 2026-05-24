'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MarcarPonto() {
  const router = useRouter();

  // Redirecionar para a rota principal do app
  useEffect(() => {
    router.replace('/app/marcar');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecionando...</p>
      </div>
    </div>
  );
}