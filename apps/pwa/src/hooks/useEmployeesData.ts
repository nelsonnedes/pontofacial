'use client';

import { useState, useEffect } from 'react';
import { isStrictProduction } from '@/lib/production-guardrails';

interface Employee {
  id: string;
  name: string;
  embedding: number[];
  confidence?: number;
}

/**
 * Hook para obter dados de funcionários
 * Versão simplificada para resolver problema de build
 */
export function useEmployeesData() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isStrictProduction()) {
        setEmployees([]);
        setError('Leitura de embeddings biométricos no browser bloqueada em produção');
        setLoading(false);
        return () => {};
      }

      // Importações locais
      const { db } = await import('@/lib/firebase');
      const { collection, onSnapshot, query, where } = await import('firebase/firestore');
      
      const q = query(collection(db, 'employees'), where('faceEmbedding', '!=', null));
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const loadedEmployees: Employee[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.faceEmbedding) {
            // Decodificar o embedding se necessário
            let embeddingArray = [];
            if (Array.isArray(data.faceEmbedding)) {
              embeddingArray = data.faceEmbedding;
            } else if (typeof data.faceEmbedding === 'string') {
              try {
                const parsed = JSON.parse(data.faceEmbedding);
                embeddingArray = parsed.descriptor || parsed;
              } catch (e) {
                console.warn('Falha ao dar parse no embedding:', e);
              }
            } else if (data.faceEmbedding.descriptor) {
              embeddingArray = Array.from(data.faceEmbedding.descriptor);
            }
            
            if (embeddingArray && embeddingArray.length > 0) {
              loadedEmployees.push({
                id: doc.id,
                name: data.nomeCompleto || data.nome || 'Funcionário',
                embedding: embeddingArray,
                confidence: data.confidence || 0.95
              });
            }
          }
        });
        
        setEmployees(loadedEmployees);
        setLoading(false);
      }, (err) => {
        console.error('Erro no snapshot de funcionários:', err);
        setError('Falha ao sincronizar funcionários em tempo real');
        setLoading(false);
      });

      return unsubscribe;
    } catch (err) {
      console.error('Erro ao inicializar sync de funcionários:', err);
      setError('Falha ao inicializar o banco de dados');
      setLoading(false);
      return () => {};
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    fetchEmployees().then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return {
    employees,
    loading,
    error,
    refreshEmployees: fetchEmployees
  };
}
