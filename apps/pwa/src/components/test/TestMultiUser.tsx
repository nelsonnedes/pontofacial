'use client';

/**
 * 🧪 COMPONENTE DE TESTE - SISTEMA MULTI-USUÁRIO
 * Demonstra a identificação automática entre todos os funcionários
 */

import { useState } from 'react';
import { useFaceEmbeddings } from '@/hooks/useFaceEmbeddings';
import type { MultiUserResult } from '@/lib/multi-user-recognition';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function TestMultiUser() {
  const [result, setResult] = useState<MultiUserResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { identifyEmployeeFromAll, isLoading } = useFaceEmbeddings();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null); // Limpar resultado anterior
    }
  };

  const handleIdentification = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    try {
      console.log('🧪 Iniciando teste de identificação multi-usuário...');
      const result = await identifyEmployeeFromAll(selectedFile);
      setResult(result);
      
      // Log detalhado para análise
      console.log('🧪 RESULTADO DO TESTE:', {
        success: result.success,
        method: result.method,
        employeeName: result.employeeName,
        similarity: result.similarity ? `${Math.round(result.similarity * 100)}%` : 'N/A',
        confidence: result.confidence ? `${Math.round(result.confidence * 100)}%` : 'N/A',
        candidates: result.candidates?.length || 0,
        processingTime: result.processingTime
      });
      
    } catch (error) {
      console.error('❌ Erro no teste:', error);
      setResult({
        success: false,
        method: 'no_match',
        message: `Erro no teste: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        reason: 'TEST_ERROR'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const clearTest = () => {
    setSelectedFile(null);
    setResult(null);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          🧪 Teste Sistema Multi-Usuário
        </h1>
        <p className="text-gray-600">
          Teste a identificação automática entre todos os funcionários cadastrados
        </p>
      </div>

      {/* Upload de arquivo */}
      <div className="mb-6 p-6 bg-white rounded-lg border">
        <h2 className="text-lg font-semibold mb-4">📸 Carregar Foto de Teste</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selecionar foto de funcionário:
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={isProcessing || isLoading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {selectedFile && (
            <Alert>
              <AlertDescription>
                ✅ Arquivo selecionado: <strong>{selectedFile.name}</strong> ({Math.round(selectedFile.size / 1024)}KB)
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button 
              onClick={handleIdentification}
              disabled={!selectedFile || isProcessing || isLoading}
              className="flex items-center gap-2"
            >
              {isProcessing || isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Identificando...
                </>
              ) : (
                <>
                  🎯 Identificar Funcionário
                </>
              )}
            </Button>

            <Button 
              onClick={clearTest}
              variant="outline"
              disabled={isProcessing || isLoading}
            >
              🗑️ Limpar
            </Button>
          </div>
        </div>
      </div>

      {/* Status de processamento */}
      {(isProcessing || isLoading) && (
        <div className="mb-6">
          <Alert>
            <AlertDescription>
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <div>
                  <strong>🔍 Analisando funcionários cadastrados...</strong>
                  <p className="text-sm mt-1">
                    Comparando com todos os funcionários • Aplicando análise anti-ambiguidade • Calculando threshold adaptativo
                  </p>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Resultado da identificação */}
      {result && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">📊 Resultado da Identificação</h2>
          
          <div className="bg-white rounded-lg border overflow-hidden">
            {result.success ? (
              <div className="bg-green-50 border-l-4 border-green-500 p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">✅</div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">
                      Funcionário Identificado Automaticamente!
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-green-700">
                      <div>
                        <p><strong>👤 Nome:</strong> {result.employeeName}</p>
                        <p><strong>🎯 Similaridade:</strong> {Math.round(result.similarity! * 100)}%</p>
                        <p><strong>💯 Confiança:</strong> {Math.round(result.confidence! * 100)}%</p>
                      </div>
                      <div>
                        <p><strong>🤖 Método:</strong> {result.method.replace(/_/g, ' ').toUpperCase()}</p>
                        {result.processingTime && (
                          <p><strong>⏱️ Tempo:</strong> {result.processingTime}ms</p>
                        )}
                        <p><strong>📊 Candidatos:</strong> {result.candidates?.length || 0} analisados</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-red-50 border-l-4 border-red-500 p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">❌</div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">
                      Identificação Não Realizada
                    </h3>
                    <div className="text-red-700 space-y-2">
                      <p><strong>🚨 Motivo:</strong> {result.reason}</p>
                      <p><strong>💬 Mensagem:</strong> {result.message}</p>
                      {result.processingTime && (
                        <p><strong>⏱️ Tempo:</strong> {result.processingTime}ms</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Análise de ambiguidade */}
            {result.ambiguityAnalysis && (
              <div className="border-t p-6 bg-blue-50">
                <h4 className="font-semibold text-blue-800 mb-3">🧠 Análise de Ambiguidade</h4>
                <div className="text-blue-700 space-y-2">
                  <p><strong>Status:</strong> {result.ambiguityAnalysis.resolved ? '✅ Resolvida' : '⚠️ Não resolvida'}</p>
                  <p><strong>Método:</strong> {result.ambiguityAnalysis.resolutionMethod.replace(/_/g, ' ')}</p>
                  <p><strong>Diferença:</strong> {Math.round(result.ambiguityAnalysis.differenceFromSecond * 100)}%</p>
                  <p><strong>Análise:</strong> {result.ambiguityAnalysis.reasoning}</p>
                </div>
              </div>
            )}

            {/* Lista de candidatos */}
            {result.candidates && result.candidates.length > 0 && (
              <div className="border-t p-6">
                <h4 className="font-semibold text-gray-800 mb-4">👥 Candidatos Analisados (Top {Math.min(5, result.candidates.length)})</h4>
                <div className="space-y-3">
                  {result.candidates.slice(0, 5).map((candidate, index) => (
                    <div
                      key={candidate.employeeId}
                      className={`p-4 rounded-lg border-2 ${
                        index === 0 && result.success
                          ? 'bg-green-50 border-green-300' 
                          : candidate.isMatch
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📍'}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{candidate.employeeName}</p>
                            <p className="text-sm text-gray-500">Qualidade: {candidate.recognitionQuality}</p>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="flex items-center gap-4 text-sm">
                            <span>Similaridade: <strong>{Math.round(candidate.similarity * 100)}%</strong></span>
                            <span>Threshold: <strong>{Math.round(candidate.threshold * 100)}%</strong></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              candidate.isMatch 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {candidate.isMatch ? '✅ Match' : '❌ No Match'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {Math.round(candidate.confidence * 100)}% confiança
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instruções */}
      <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-3">💡 Como Testar</h3>
        <div className="text-blue-700 space-y-2 text-sm">
          <p><strong>1. Carregar foto:</strong> Selecione uma foto de um funcionário cadastrado no sistema</p>
          <p><strong>2. Identificar:</strong> Clique em "Identificar Funcionário" para testar o sistema multi-usuário</p>
          <p><strong>3. Analisar resultado:</strong> Verifique se o sistema identificou corretamente o funcionário</p>
          <p><strong>4. Console logs:</strong> Abra DevTools → Console para ver logs detalhados</p>
        </div>
      </div>

      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-6 bg-gray-50 rounded-lg p-4 border">
          <h3 className="font-semibold text-gray-800 mb-2">🔧 Debug Info</h3>
          <div className="text-sm text-gray-600 space-y-1">
            <p>• Sistema multi-usuário: <strong>Ativo</strong></p>
            <p>• Threshold adaptativo: <strong>Ativo</strong></p>
            <p>• Análise anti-ambiguidade: <strong>Ativa</strong></p>
            <p>• Cache de funcionários: <strong>10min TTL</strong></p>
          </div>
        </div>
      )}
    </div>
  );
}
