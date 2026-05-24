'use client';

import { ReactNode } from 'react';
import { FaceAPIProvider } from './FaceAPIProvider';

interface ClientFaceAPIProviderProps {
  children: ReactNode;
}

export default function ClientFaceAPIProvider({ children }: ClientFaceAPIProviderProps) {
  return <FaceAPIProvider>{children}</FaceAPIProvider>;
}