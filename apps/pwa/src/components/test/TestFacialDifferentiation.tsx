'use client';

import { useState, useRef, useCallback } from 'react';
import { optimizedFaceRecognition } from '@/lib/face-recognition-optimized';
import { useEmployeesData } from '@/hooks/useEmployeesData';

interface DifferentiationResult {
  nelson: {
    similarity: number;
    characteristics: string[];
  };
  selma: {
    similarity: number;
    characteristics: string[];
  };
  difference: number;
  conclusion: 'WORKING' | 'BROKEN' | 'TESTING';
  details: string;
}

/**
 * 🧪 TESTE ESPECÍFICO: Nelson (homem) vs Selma (mulher)
 * Verifica se novo algoritmo consegue diferenciar adequadamente
 */
export default function TestFacialDifferentiation() {
  const [result, setResult] = useState<DifferentiationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { employees } = useEmployeesData();

  const testDifferentiation = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setResult(null);

      if (!videoRef.current) {
        throw new Error('Vídeo não disponível');
      }

      // Capturar frame atual
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Extrair embedding com novo algoritmo
      const embedding = await optimizedFaceRecognition.extractFaceEmbedding(canvas);
      
      if (!embedding) {
        throw new Error('Nenhuma face detectada');
      }

      console.log('🎯 Embedding capturado para teste:', {
        dimensions: embedding.descriptor.length,
        confidence: embedding.confidence,
        method: embedding.method
      });

      // Encontrar Nelson e Selma nos funcionários cadastrados
      const nelson = employees.find(emp => emp.name.toLowerCase().includes('nelson'));
      const selma = employees.find(emp => emp.name.toLowerCase().includes('selma'));

      if (!nelson || !selma) {
        throw new Error('Nelson ou Selma não encontrados nos funcionários cadastrados');
      }

      // Comparar com ambos
      const nelsonSimilarity = optimizedFaceRecognition.compareFaces(
        embedding,
        { descriptor: new Float32Array(nelson.embedding), confidence: nelson.confidence || 0.9, timestamp: Date.now(), method: 'stored' }
      );

      const selmaSimilarity = optimizedFaceRecognition.compareFaces(
        embedding,
        { descriptor: new Float32Array(selma.embedding), confidence: selma.confidence || 0.9, timestamp: Date.now(), method: 'stored' }
      );

      const difference = Math.abs(nelsonSimilarity - selmaSimilarity);

      // Analisar resultado
      let conclusion: 'WORKING' | 'BROKEN' | 'TESTING' = 'TESTING';
      let details = '';

      if (difference < 0.05) { // Menos de 5% diferença
        conclusion = 'BROKEN';
        details = `CRÍTICO: Diferença muito baixa (${Math.round(difference * 100)}%). Algoritmo ainda não distingue homem de mulher adequadamente.`;
      } else if (difference < 0.15) { // 5-15% diferença
        conclusion = 'TESTING';
        details = `MELHORANDO: Diferença de ${Math.round(difference * 100)}%. Progresso, mas ainda insuficiente para diferenciação clara.`;
      } else { // >15% diferença
        conclusion = 'WORKING';
        details = `✅ SUCESSO: Diferença de ${Math.round(difference * 100)}%. Algoritmo agora distingue adequadamente pessoas diferentes!`;
      }

      const testResult: DifferentiationResult = {
        nelson: {
          similarity: nelsonSimilarity,
          characteristics: [
            `Similaridade: ${Math.round(nelsonSimilarity * 100)}%`,
            `Embedding: ${nelson.embedding.length}D`,
            `Tipo: ${nelson.name.includes('Nelson') ? 'Masculino' : 'Indefinido'}`
          ]
        },
        selma: {
          similarity: selmaSimilarity,
          characteristics: [
            `Similaridade: ${Math.round(selmaSimilarity * 100)}%`,
            `Embedding: ${selma.embedding.length}D`,
            `Tipo: ${selma.name.includes('Selma') ? 'Feminino' : 'Indefinido'}`
          ]
        },
        difference,
        conclusion,
        details
      };

      setResult(testResult);

      console.log('🧪 TESTE DE DIFERENCIAÇÃO FACIAL:', testResult);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      console.error('❌ Erro no teste de diferenciação:', err);
    } finally {
      setIsLoading(false);
    }
  }, [employees]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setError('Erro ao iniciar câmera: ' + (err instanceof Error ? err.message : 'Erro desconhecido'));
    }
  }, []);

  // Auto-iniciar câmera quando componente carrega
  useState(() => {
    startCamera();
  });

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      {/* HEADER */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          🧪 Teste de Diferenciação Facial
        </h1>
        <p className="text-lg text-gray-600">
          Verificando se algoritmo distingue <strong>Nelson (homem)</strong> de <strong>Selma (mulher)</strong>
        </p>
        <div className="mt-3 px-4 py-2 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Expectativa:</strong> Diferença mínima de 30% entre homem e mulher
          </p>
        </div>
      </div>

      {/* ÁREA DE VÍDEO */}
      <div className="mb-6">
        <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
          />
          
          {/* OVERLAY DE STATUS */}
          <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white px-3 py-2 rounded-lg">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Analisando...
              </span>
            ) : (
              <span>💻 Câmera ativa</span>
            )}
          </div>
        </div>
      </div>

      {/* BOTÃO DE TESTE */}
      <div className="mb-6 text-center">
        <button
          onClick={testDifferentiation}
          disabled={isLoading}
          className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
            isLoading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
          }`}
        >
          {isLoading ? 'Testando Algoritmo...' : '🧪 Testar Diferenciação Facial'}
        </button>
      </div>

      {/* RESULTADO DO TESTE */}
      {result && (
        <div className="mb-6">
          <div className={`p-6 rounded-xl border-2 ${
            result.conclusion === 'WORKING' ? 'bg-green-50 border-green-200' :
            result.conclusion === 'BROKEN' ? 'bg-red-50 border-red-200' :
            'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">
                {result.conclusion === 'WORKING' ? '✅' : 
                 result.conclusion === 'BROKEN' ? '❌' : '⚠️'}
              </span>
              <h3 className="text-xl font-bold">
                {result.conclusion === 'WORKING' ? 'ALGORITMO FUNCIONANDO!' :
                 result.conclusion === 'BROKEN' ? 'ALGORITMO COM PROBLEMA' :
                 'ALGORITMO EM TESTE'}
              </h3>
            </div>

            <p className="text-gray-700 mb-4">{result.details}</p>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              {/* NELSON */}
              <div className="bg-white p-4 rounded-lg border">
                <h4 className="font-semibold text-blue-900 mb-2">👨 Nelson (Homem)</h4>
                <div className="space-y-1">
                  {result.nelson.characteristics.map((char, idx) => (
                    <p key={idx} className="text-sm text-gray-600">{char}</p>
                  ))}
                </div>
              </div>

              {/* SELMA */}
              <div className="bg-white p-4 rounded-lg border">
                <h4 className="font-semibold text-pink-900 mb-2">👩 Selma (Mulher)</h4>
                <div className="space-y-1">
                  {result.selma.characteristics.map((char, idx) => (
                    <p key={idx} className="text-sm text-gray-600">{char}</p>
                  ))}
                </div>
              </div>
            </div>

            {/* DIFERENÇA */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-semibold">Diferença de Similaridade:</span>
                <span className={`text-lg font-bold ${
                  result.difference > 0.3 ? 'text-green-600' :
                  result.difference > 0.15 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {Math.round(result.difference * 100)}%
                </span>
              </div>
              
              <div className="mt-2">
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className={`h-3 rounded-full transition-all duration-500 ${
                      result.difference > 0.3 ? 'bg-green-500' :
                      result.difference > 0.15 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(result.difference * 100, 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>15% (Mínimo)</span>
                  <span>30% (Ideal)</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ERRO */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h4 className="font-semibold text-red-900 mb-2">❌ Erro no Teste</h4>
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* INFORMAÇÕES TÉCNICAS */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-semibold text-gray-900 mb-3">📊 Informações Técnicas</h4>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Funcionários Cadastrados:</strong> {employees.length}</p>
            <p><strong>Nelson Encontrado:</strong> {employees.some(e => e.name.toLowerCase().includes('nelson')) ? '✅' : '❌'}</p>
            <p><strong>Selma Encontrada:</strong> {employees.some(e => e.name.toLowerCase().includes('selma')) ? '✅' : '❌'}</p>
          </div>
          <div>
            <p><strong>Algoritmo:</strong> Características Faciais Reais</p>
            <p><strong>Dimensões:</strong> 128D (32+24+20+16+resto)</p>
            <p><strong>Método:</strong> Análise por região (olhos, nariz, boca, formato)</p>
          </div>
        </div>
      </div>

      {/* EXPLICAÇÃO */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-3">💡 Como Funciona o Novo Algoritmo</h4>
        <div className="text-sm text-blue-800 space-y-2">
          <p><strong>Antes (Primitivo):</strong> Comparava apenas "brilho médio por quadrante" - Nelson e Selma tinham 1% diferença!</p>
          <p><strong>Agora (Real):</strong> Analisa características distintivas:</p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li><strong>Olhos:</strong> Cor, formato, pupila, contraste (32 características)</li>
            <li><strong>Nariz:</strong> Largura, altura, sombras, gradientes (24 características)</li>
            <li><strong>Boca:</strong> Lábios, vermelhidão, linha, formato (20 características)</li>
            <li><strong>Rosto:</strong> Proporções, testa/queixo, simetria (16 características)</li>
          </ul>
          <p><strong>Resultado Esperado:</strong> Nelson (homem) e Selma (mulher) devem ter 30%+ diferença</p>
        </div>
      </div>
    </div>
  );
}
