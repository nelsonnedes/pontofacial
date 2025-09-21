'use client';

import { ReactNode, useState, useEffect } from 'react';
import OnlineStatus from './OnlineStatus';
import BackgroundSyncProvider from './BackgroundSyncProvider';
import ClientRegisterSW from './ClientRegisterSW';
import FaceAPIProvider from './FaceAPIProvider';

interface ClientProvidersProps {
  children: ReactNode;
}

export default function ClientProviders({ children }: ClientProvidersProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Não renderizar nada até estar montado no cliente
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <FaceAPIProvider>
      <BackgroundSyncProvider>
        {children}
        <OnlineStatus />
      </BackgroundSyncProvider>
      <ClientRegisterSW />
    </FaceAPIProvider>
  );
}
