'use client';

/**
 * 🎯 SISTEMA MULTI-USUÁRIO DE RECONHECIMENTO FACIAL
 * Identifica automaticamente entre todos os funcionários cadastrados
 * Resolve confusão entre funcionários com rostos similares
 */

import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { optimizedFaceRecognition, type OptimizedFaceEmbedding } from '@/lib/face-recognition-optimized';
import { adaptiveThresholdManager, type RecognitionContext } from '@/lib/adaptive-threshold-manager';
import { decryptEmbedding } from './encryption';

// Interfaces para o sistema multi-usuário
export interface EmployeeProfile {
  id: string;
  email: string;
  name: string;
  embedding: OptimizedFaceEmbedding;
  isActive: boolean;
  lastRecognition?: number;
  recognitionCount?: number;
  avgSimilarity?: number;
  successRate?: number;
}

export interface MultiUserCandidate {
  employeeId: string;
  employeeName: string;
  similarity: number;
  threshold: number;
  confidence: number;
  isMatch: boolean;
  recognitionQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface MultiUserResult {
  success: boolean;
  employeeId?: string;
  employeeName?: string;
  similarity?: number;
  confidence?: number;
  method: 'automatic_identification' | 'ambiguity_resolved' | 'manual_selection' | 'no_match';
  candidates?: MultiUserCandidate[];
  reason?: string;
  message: string;
  processingTime?: number;
  ambiguityAnalysis?: AmbiguityAnalysis;
}

interface AmbiguityAnalysis {
  resolved: boolean;
  topCandidates: MultiUserCandidate[];
  differenceFromSecond: number;
  resolutionMethod: 'facial_features' | 'temporal_pattern' | 'contextual_hints' | 'insufficient_difference';
  reasoning: string;
}

export class MultiUserFaceRecognition {
  private static instance: MultiUserFaceRecognition;
  private employeeCache = new Map<string, EmployeeProfile>();
  private cacheLastUpdated = 0;
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutos
  private readonly AMBIGUITY_THRESHOLD = 0.12; // 12% de diferença mínima entre candidatos

  private constructor() {}

  public static getInstance(): MultiUserFaceRecognition {
    if (!MultiUserFaceRecognition.instance) {
      MultiUserFaceRecognition.instance = new MultiUserFaceRecognition();
    }
    return MultiUserFaceRecognition.instance;
  }

  /**
   * 🎯 FUNÇÃO PRINCIPAL: Identificar funcionário automaticamente
   * Compara com todos os funcionários e identifica o melhor match
   */
  public async identifyEmployeeAutomatically(capturedImage: Blob): Promise<MultiUserResult> {
    const startTime = Date.now();
    
    try {
      console.log('🔍 Iniciando identificação multi-usuário automática...');

      // 1. Extrair embedding da imagem capturada
      const capturedEmbedding = await optimizedFaceRecognition.processImageForRecognition(capturedImage);
      
      if (!capturedEmbedding) {
        return {
          success: false,
          method: 'no_match',
          message: 'Nenhum rosto detectado na imagem capturada.',
          reason: 'NO_FACE_DETECTED'
        };
      }

      // 2. Obter todos os funcionários ativos
      const allEmployees = await this.getActiveEmployees();
      console.log(`🔍 Comparando com ${allEmployees.length} funcionários cadastrados`);

      if (allEmployees.length === 0) {
        return {
          success: false,
          method: 'no_match',
          message: 'Nenhum funcionário cadastrado no sistema.',
          reason: 'NO_EMPLOYEES_REGISTERED'
        };
      }

      // 3. Análise paralela de todos os funcionários
      const candidates = await this.analyzeAllCandidates(capturedEmbedding, allEmployees);

      // 4. Ordenar por similaridade (melhores primeiro)
      const rankedCandidates = candidates
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10); // Top 10 candidatos

      console.log('📊 Top candidatos:', rankedCandidates.slice(0, 3).map(c => ({
        name: c.employeeName,
        similarity: `${Math.round(c.similarity * 100)}%`,
        threshold: `${Math.round(c.threshold * 100)}%`,
        isMatch: c.isMatch
      })));

      // 5. Análise de ambiguidade e decisão final
      const result = await this.makeIdentificationDecision(rankedCandidates, capturedEmbedding);
      
      // 6. Atualizar estatísticas se identificação foi bem-sucedida
      if (result.success && result.employeeId) {
        await this.updateEmployeeStats(result.employeeId, true, result.similarity!);
      }

      // 7. Adicionar tempo de processamento
      result.processingTime = Date.now() - startTime;

      console.log(`🎯 Identificação concluída em ${result.processingTime}ms:`, {
        success: result.success,
        method: result.method,
        employee: result.employeeName || 'N/A',
        similarity: result.similarity ? `${Math.round(result.similarity * 100)}%` : 'N/A'
      });

      return result;

    } catch (error) {
      console.error('❌ Erro na identificação multi-usuário:', error);
      return {
        success: false,
        method: 'no_match',
        message: `Erro na identificação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        reason: 'PROCESSING_ERROR',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * 🧮 Analisar todos os candidatos em paralelo
   */
  private async analyzeAllCandidates(
    capturedEmbedding: OptimizedFaceEmbedding, 
    employees: EmployeeProfile[]
  ): Promise<MultiUserCandidate[]> {
    
    const analysisPromises = employees.map(async (employee) => {
      try {
        // Context para threshold adaptativo
        const context: RecognitionContext = {
          confidence: capturedEmbedding.confidence,
          employeeId: employee.id
        };

        // Calcular threshold adaptativo para este funcionário
        const thresholdAnalysis = adaptiveThresholdManager.calculateOptimalThreshold(context);
        const adaptiveThreshold = thresholdAnalysis.finalThreshold;

        // Comparar embeddings
        const similarity = optimizedFaceRecognition.compareFaces(capturedEmbedding, employee.embedding);
        const isMatch = similarity >= adaptiveThreshold;

        // Calcular confiança baseada na qualidade da comparação
        const confidence = this.calculateComparisonConfidence(similarity, adaptiveThreshold, employee);

        // Determinar qualidade do reconhecimento
        const recognitionQuality = this.determineRecognitionQuality(similarity, confidence);

        return {
          employeeId: employee.id,
          employeeName: employee.name,
          similarity,
          threshold: adaptiveThreshold,
          confidence,
          isMatch,
          recognitionQuality
        };

      } catch (error) {
        console.warn(`Erro ao analisar funcionário ${employee.name}:`, error);
        return {
          employeeId: employee.id,
          employeeName: employee.name,
          similarity: 0,
          threshold: 0.8,
          confidence: 0,
          isMatch: false,
          recognitionQuality: 'poor' as const
        };
      }
    });

    return Promise.all(analysisPromises);
  }

  /**
   * 🎯 Tomar decisão final de identificação com análise de ambiguidade
   */
  private async makeIdentificationDecision(
    candidates: MultiUserCandidate[],
    capturedEmbedding: OptimizedFaceEmbedding
  ): Promise<MultiUserResult> {
    
    const validMatches = candidates.filter(c => c.isMatch);
    
    if (validMatches.length === 0) {
      const bestCandidate = candidates[0];
      return {
        success: false,
        method: 'no_match',
        message: `Nenhum funcionário identificado. Melhor similaridade: ${Math.round(bestCandidate.similarity * 100)}% (necessário: ${Math.round(bestCandidate.threshold * 100)}%)`,
        candidates: candidates.slice(0, 3),
        reason: 'INSUFFICIENT_SIMILARITY'
      };
    }

    const bestMatch = validMatches[0];
    const secondBest = validMatches[1];

    // Análise de ambiguidade crítica
    if (secondBest && (bestMatch.similarity - secondBest.similarity) < this.AMBIGUITY_THRESHOLD) {
      console.log('⚠️ Ambiguidade detectada - analisando...', {
        first: { name: bestMatch.employeeName, similarity: Math.round(bestMatch.similarity * 100) },
        second: { name: secondBest.employeeName, similarity: Math.round(secondBest.similarity * 100) },
        difference: Math.round((bestMatch.similarity - secondBest.similarity) * 100)
      });

      // Tentar resolver ambiguidade com análise avançada
      const ambiguityAnalysis = await this.resolveAmbiguity(
        capturedEmbedding, 
        validMatches.slice(0, 3)
      );

      if (ambiguityAnalysis.resolved) {
        const resolvedCandidate = ambiguityAnalysis.topCandidates[0];
        return {
          success: true,
          employeeId: resolvedCandidate.employeeId,
          employeeName: resolvedCandidate.employeeName,
          similarity: resolvedCandidate.similarity,
          confidence: resolvedCandidate.confidence,
          method: 'ambiguity_resolved',
          message: `Funcionário identificado após resolução de ambiguidade: ${resolvedCandidate.employeeName}`,
          candidates: candidates.slice(0, 5),
          ambiguityAnalysis
        };
      } else {
        return {
          success: false,
          method: 'manual_selection',
          message: `Múltiplos funcionários similares detectados. Selecione manualmente na lista.`,
          candidates: validMatches.slice(0, 3),
          reason: 'AMBIGUOUS_IDENTIFICATION',
          ambiguityAnalysis
        };
      }
    }

    // Identificação clara - funcionário único identificado
    return {
      success: true,
      employeeId: bestMatch.employeeId,
      employeeName: bestMatch.employeeName,
      similarity: bestMatch.similarity,
      confidence: bestMatch.confidence,
      method: 'automatic_identification',
      message: `Funcionário identificado automaticamente: ${bestMatch.employeeName}`,
      candidates: candidates.slice(0, 5)
    };
  }

  /**
   * 🧠 Resolver ambiguidade com análise avançada
   */
  private async resolveAmbiguity(
    capturedEmbedding: OptimizedFaceEmbedding,
    ambiguousCandidates: MultiUserCandidate[]
  ): Promise<AmbiguityAnalysis> {
    
    console.log('🔬 Iniciando análise avançada de ambiguidade...');

    const enhancedCandidates = await Promise.all(
      ambiguousCandidates.map(async (candidate) => {
        const employee = await this.getEmployeeProfile(candidate.employeeId);
        
        // Análise temporal (padrão de horário do funcionário)
        const temporalScore = this.analyzeTemporalPattern(employee);
        
        // Análise de histórico de sucesso
        const historyScore = this.analyzeHistoryPattern(employee);
        
        // Análise de características distintivas (simulada - será expandida com embeddings 512D)
        const distinctiveScore = this.analyzeDistinctiveFeatures(
          capturedEmbedding, 
          employee.embedding
        );

        // Score final ponderado
        const enhancedScore = (
          candidate.similarity * 0.60 +        // 60% - Similaridade facial
          distinctiveScore * 0.25 +            // 25% - Características distintivas
          temporalScore * 0.10 +               // 10% - Padrão temporal
          historyScore * 0.05                  // 5% - Histórico
        );

        return {
          ...candidate,
          enhancedScore,
          analysis: {
            facial: candidate.similarity,
            distinctive: distinctiveScore,
            temporal: temporalScore,
            history: historyScore
          }
        };
      })
    );

    // Reordenar por score aprimorado
    const reranked = enhancedCandidates.sort((a, b) => b.enhancedScore - a.enhancedScore);
    const winner = reranked[0];
    const runnerUp = reranked[1];

    const finalDifference = winner.enhancedScore - runnerUp.enhancedScore;
    
    console.log('📊 Análise de ambiguidade concluída:', {
      winner: winner.employeeName,
      runnerUp: runnerUp.employeeName,
      difference: Math.round(finalDifference * 100),
      resolved: finalDifference >= 0.08
    });

    // Considerar resolvido se diferença >= 8% após análise
    if (finalDifference >= 0.08) {
      return {
        resolved: true,
        topCandidates: reranked,
        differenceFromSecond: finalDifference,
        resolutionMethod: 'facial_features',
        reasoning: `Funcionário ${winner.employeeName} identificado com ${Math.round(winner.enhancedScore * 100)}% de confiança após análise avançada.`
      };
    }

    return {
      resolved: false,
      topCandidates: reranked,
      differenceFromSecond: finalDifference,
      resolutionMethod: 'insufficient_difference',
      reasoning: `Ambiguidade persistente entre ${winner.employeeName} e ${runnerUp.employeeName}. Diferença insuficiente: ${Math.round(finalDifference * 100)}%.`
    };
  }

  /**
   * 📊 Analisar padrão temporal do funcionário
   */
  private analyzeTemporalPattern(_employee: EmployeeProfile): number {
    const currentHour = new Date().getHours();
    
    // Simulação de padrão temporal (será expandido com dados reais)
    // Funcionários administrativos: 8-17h
    // Funcionários operacionais: turnos variados
    
    if (currentHour >= 8 && currentHour <= 17) {
      return 0.8; // Horário comercial padrão
    } else if (currentHour >= 18 && currentHour <= 22) {
      return 0.6; // Segundo turno
    } else {
      return 0.3; // Turno noturno/madrugada
    }
  }

  /**
   * 📈 Analisar histórico de sucesso do funcionário
   */
  private analyzeHistoryPattern(employee: EmployeeProfile): number {
    const successRate = employee.successRate || 0.7;
    const recognitionCount = employee.recognitionCount || 1;
    
    // Funcionários com histórico bom têm score mais alto
    if (successRate >= 0.9 && recognitionCount >= 10) {
      return 0.9; // Histórico excelente
    } else if (successRate >= 0.7 && recognitionCount >= 5) {
      return 0.7; // Histórico bom
    } else {
      return 0.5; // Histórico limitado ou ruim
    }
  }

  /**
   * 🎨 Analisar características distintivas (versão simplificada)
   */
  private analyzeDistinctiveFeatures(
    capturedEmbedding: OptimizedFaceEmbedding,
    storedEmbedding: OptimizedFaceEmbedding
  ): number {
    // Versão simplificada - será melhorada com embeddings 512D
    const desc1 = new Float32Array(capturedEmbedding.descriptor);
    const desc2 = new Float32Array(storedEmbedding.descriptor);

    // Analisar diferentes "regiões" do embedding
    let distinctiveScore = 0;
    const regionSize = Math.floor(desc1.length / 4);

    for (let i = 0; i < 4; i++) {
      const start = i * regionSize;
      const end = (i + 1) * regionSize;
      
      const region1 = desc1.slice(start, end);
      const region2 = desc2.slice(start, end);
      
      // Calcular similaridade da região
      let dotProduct = 0;
      let norm1 = 0;
      let norm2 = 0;
      
      for (let j = 0; j < region1.length; j++) {
        dotProduct += region1[j] * region2[j];
        norm1 += region1[j] * region1[j];
        norm2 += region2[j] * region2[j];
      }
      
      const regionSimilarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
      distinctiveScore += Math.max(0, regionSimilarity);
    }

    return distinctiveScore / 4; // Média das regiões
  }

  /**
   * 🎯 Calcular confiança da comparação
   */
  private calculateComparisonConfidence(
    similarity: number, 
    threshold: number, 
    employee: EmployeeProfile
  ): number {
    // Confiança baseada na distância do threshold
    const thresholdDistance = similarity - threshold;
    let confidence = 0.5;

    if (thresholdDistance > 0.15) {
      confidence = 0.95; // Muito acima do threshold
    } else if (thresholdDistance > 0.05) {
      confidence = 0.80; // Acima do threshold
    } else if (thresholdDistance > 0) {
      confidence = 0.65; // Ligeiramente acima
    } else if (thresholdDistance > -0.05) {
      confidence = 0.40; // Ligeiramente abaixo
    } else {
      confidence = 0.20; // Muito abaixo
    }

    // Ajustar pela qualidade do embedding armazenado
    const embeddingConfidence = employee.embedding.confidence || 0.8;
    confidence *= embeddingConfidence;

    return Math.min(0.95, Math.max(0.1, confidence));
  }

  /**
   * 📊 Determinar qualidade do reconhecimento
   */
  private determineRecognitionQuality(
    similarity: number, 
    confidence: number
  ): 'excellent' | 'good' | 'fair' | 'poor' {
    if (similarity >= 0.8 && confidence >= 0.8) return 'excellent';
    if (similarity >= 0.7 && confidence >= 0.7) return 'good';
    if (similarity >= 0.6 && confidence >= 0.6) return 'fair';
    return 'poor';
  }

  /**
   * 👥 Obter todos os funcionários ativos (com cache)
   */
  private async getActiveEmployees(): Promise<EmployeeProfile[]> {
    const now = Date.now();
    
    // Verificar cache
    if (this.employeeCache.size > 0 && (now - this.cacheLastUpdated) < this.CACHE_TTL) {
      console.log(`📦 Cache hit - ${this.employeeCache.size} funcionários em cache`);
      return Array.from(this.employeeCache.values());
    }

    console.log('🔄 Atualizando cache de funcionários...');

    try {
      const usersCollection = collection(db, 'usuarios');
      const querySnapshot = await getDocs(usersCollection);
      
      this.employeeCache.clear();
      
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        
        // Apenas funcionários ativos com embedding
        if (userData.isActive !== false && userData.faceEmbedding && userData.faceEmbedding.length > 0) {
          const decrypted = decryptEmbedding(userData.faceEmbedding);
          const descriptor = decrypted.descriptor instanceof Float32Array
            ? decrypted.descriptor
            : new Float32Array(decrypted.descriptor);

          const employee: EmployeeProfile = {
            id: doc.id,
            email: userData.email || '',
            name: userData.name || userData.email?.split('@')[0] || 'Funcionário',
            embedding: {
              descriptor,
              confidence: userData.faceConfidence || 0.8,
              timestamp: userData.faceRegisteredAt || Date.now(),
              method: 'stored'
            },
            isActive: userData.isActive !== false,
            lastRecognition: userData.faceLastVerified,
            recognitionCount: userData.faceVerificationCount || 0,
            avgSimilarity: userData.avgSimilarity || 0.7,
            successRate: userData.successRate || 0.7
          };
          
          this.employeeCache.set(doc.id, employee);
        }
      });

      this.cacheLastUpdated = now;
      console.log(`✅ Cache atualizado - ${this.employeeCache.size} funcionários ativos carregados`);
      
      return Array.from(this.employeeCache.values());
      
    } catch (error) {
      console.error('❌ Erro ao carregar funcionários:', error);
      return [];
    }
  }

  /**
   * 👤 Obter perfil específico de um funcionário
   */
  private async getEmployeeProfile(employeeId: string): Promise<EmployeeProfile> {
    // Verificar cache primeiro
    if (this.employeeCache.has(employeeId)) {
      return this.employeeCache.get(employeeId)!;
    }

    // Carregar do banco
    try {
      const employeeDoc = await getDoc(doc(db, 'usuarios', employeeId));
      const userData = employeeDoc.data();
      
      if (userData && userData.faceEmbedding) {
        const decrypted = decryptEmbedding(userData.faceEmbedding);
        const descriptor = decrypted.descriptor instanceof Float32Array
          ? decrypted.descriptor
          : new Float32Array(decrypted.descriptor);

        const employee: EmployeeProfile = {
          id: employeeId,
          email: userData.email || '',
          name: userData.name || userData.email?.split('@')[0] || 'Funcionário',
          embedding: {
            descriptor,
            confidence: userData.faceConfidence || 0.8,
            timestamp: userData.faceRegisteredAt || Date.now(),
            method: 'stored'
          },
          isActive: userData.isActive !== false,
          lastRecognition: userData.faceLastVerified,
          recognitionCount: userData.faceVerificationCount || 0,
          avgSimilarity: userData.avgSimilarity || 0.7,
          successRate: userData.successRate || 0.7
        };
        
        this.employeeCache.set(employeeId, employee);
        return employee;
      }
    } catch (error) {
      console.error(`Erro ao carregar perfil do funcionário ${employeeId}:`, error);
    }

    // Fallback
    return {
      id: employeeId,
      email: '',
      name: 'Funcionário Desconhecido',
      embedding: { descriptor: new Float32Array(512), confidence: 0, timestamp: 0, method: 'stored' },
      isActive: true
    };
  }

  /**
   * 📊 Atualizar estatísticas do funcionário
   */
  private async updateEmployeeStats(
    employeeId: string, 
    success: boolean, 
    similarity?: number
  ): Promise<void> {
    try {
      const employeeRef = doc(db, 'usuarios', employeeId);
      const employee = this.employeeCache.get(employeeId);
      
      const updates: any = {
        faceLastVerified: Date.now()
      };

      if (success) {
        const newCount = (employee?.recognitionCount || 0) + 1;
        const currentAvg = employee?.avgSimilarity || 0.7;
        const newAvg = similarity ? (currentAvg + similarity) / 2 : currentAvg;
        
        updates.faceVerificationCount = newCount;
        updates.avgSimilarity = newAvg;
      }

      await updateDoc(employeeRef, updates);

      // Atualizar cache
      if (employee) {
        Object.assign(employee, updates);
      }

    } catch (error) {
      console.warn(`Erro ao atualizar estatísticas do funcionário ${employeeId}:`, error);
    }
  }

  /**
   * 🔄 Limpar cache (para forçar recarregamento)
   */
  public clearCache(): void {
    this.employeeCache.clear();
    this.cacheLastUpdated = 0;
    console.log('🗑️ Cache de funcionários limpo');
  }

  /**
   * 📊 Obter estatísticas do cache
   */
  public getCacheStats(): { size: number; lastUpdated: Date; ttl: number } {
    return {
      size: this.employeeCache.size,
      lastUpdated: new Date(this.cacheLastUpdated),
      ttl: this.CACHE_TTL
    };
  }
}

// Exportar instância singleton
export const multiUserRecognition = MultiUserFaceRecognition.getInstance();

