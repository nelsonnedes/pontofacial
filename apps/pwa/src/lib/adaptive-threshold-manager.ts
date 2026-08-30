'use client';

/**
 * 🎯 ADAPTIVE THRESHOLD MANAGER 
 * Sistema inteligente de threshold para reconhecimento facial corporativo
 * Substitui thresholds fixos rigorosos por sistema adaptativo tolerante
 */

interface RecognitionContext {
  imageQuality?: number;
  lighting?: number;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  confidence?: number;
  employeeId?: string;
  timeOfDay?: number;
}

interface ThresholdAnalysis {
  baseThreshold: number;
  finalThreshold: number;
  adjustments: {
    imageQuality: number;
    lighting: number;
    device: number;
    confidence: number;
    temporal: number;
  };
  reasoning: string[];
}

export class AdaptiveThresholdManager {
  private static instance: AdaptiveThresholdManager;

  // 🎯 NOVOS THRESHOLDS OTIMIZADOS PARA AMBIENTE CORPORATIVO
  private readonly OPTIMIZED_THRESHOLDS = {
    // Base mais tolerante para uso diário corporativo
    DAILY_USE: 0.55,           // 55% - Uso diário balanceado
    SECURE_MODE: 0.65,         // 65% - Modo seguro moderado  
    HIGH_SECURITY: 0.75,       // 75% - Alta segurança (apenas quando necessário)
    
    // Limites de segurança
    MIN_THRESHOLD: 0.40,       // 40% - Mínimo absoluto
    MAX_THRESHOLD: 0.80,       // 80% - Máximo prático
    
    // Ajustes contextuais
    ADJUSTMENTS: {
      EXCELLENT_IMAGE: +0.05,   // Imagem perfeita
      GOOD_IMAGE: +0.02,        // Boa imagem
      POOR_IMAGE: -0.08,        // Imagem ruim
      BAD_LIGHTING: -0.10,      // Iluminação ruim
      MOBILE_DEVICE: -0.05,     // Dispositivo móvel
      HIGH_CONFIDENCE: +0.03,   // Alta confiança no embedding
      LOW_CONFIDENCE: -0.05,    // Baixa confiança
      NIGHT_TIME: -0.03,        // Período noturno
      BUSINESS_HOURS: +0.02     // Horário comercial
    }
  };

  private constructor() {}

  public static getInstance(): AdaptiveThresholdManager {
    if (!AdaptiveThresholdManager.instance) {
      AdaptiveThresholdManager.instance = new AdaptiveThresholdManager();
    }
    return AdaptiveThresholdManager.instance;
  }

  /**
   * 🧠 ALGORITMO PRINCIPAL - Calcular threshold adaptativo inteligente
   */
  public calculateOptimalThreshold(context: RecognitionContext = {}): ThresholdAnalysis {
    // Começar com base tolerante para ambiente corporativo
    const baseThreshold = this.OPTIMIZED_THRESHOLDS.DAILY_USE; // 55%
    const adjustments = {
      imageQuality: 0,
      lighting: 0,
      device: 0,
      confidence: 0,
      temporal: 0
    };
    const reasoning: string[] = [];

    // 1. AJUSTE POR QUALIDADE DA IMAGEM
    if (context.imageQuality !== undefined) {
      if (context.imageQuality >= 0.9) {
        adjustments.imageQuality = this.OPTIMIZED_THRESHOLDS.ADJUSTMENTS.EXCELLENT_IMAGE;
        reasoning.push('Imagem excelente (+5%)');
      } else if (context.imageQuality >= 0.7) {
        adjustments.imageQuality = this.OPTIMIZED_THRESHOLDS.ADJUSTMENTS.GOOD_IMAGE;
        reasoning.push('Boa imagem (+2%)');
      } else if (context.imageQuality < 0.5) {
        adjustments.imageQuality = this.OPTIMIZED_THRESHOLDS.ADJUSTMENTS.POOR_IMAGE;
        reasoning.push('Imagem ruim (-8%)');
      }
    }

    // 2. AJUSTE POR ILUMINAÇÃO
    if (context.lighting !== undefined) {
      if (context.lighting < 0.4) {
        adjustments.lighting = this.OPTIMIZED_THRESHOLDS.ADJUSTMENTS.BAD_LIGHTING;
        reasoning.push('Iluminação ruim (-10%)');
      }
    }

    // 3. AJUSTE POR DISPOSITIVO
    if (context.deviceType === 'mobile') {
      adjustments.device = this.OPTIMIZED_THRESHOLDS.ADJUSTMENTS.MOBILE_DEVICE;
      reasoning.push('Dispositivo móvel (-5%)');
    }

    // 4. AJUSTE POR CONFIANÇA DO EMBEDDING
    if (context.confidence !== undefined) {
      if (context.confidence >= 0.9) {
        adjustments.confidence = this.OPTIMIZED_THRESHOLDS.ADJUSTMENTS.HIGH_CONFIDENCE;
        reasoning.push('Alta confiança no embedding (+3%)');
      } else if (context.confidence < 0.6) {
        adjustments.confidence = this.OPTIMIZED_THRESHOLDS.ADJUSTMENTS.LOW_CONFIDENCE;
        reasoning.push('Baixa confiança no embedding (-5%)');
      }
    }

    // 5. AJUSTE TEMPORAL (HORÁRIO DO DIA)
    const currentHour = context.timeOfDay || new Date().getHours();
    if (currentHour >= 6 && currentHour <= 18) {
      adjustments.temporal = this.OPTIMIZED_THRESHOLDS.ADJUSTMENTS.BUSINESS_HOURS;
      reasoning.push('Horário comercial (+2%)');
    } else {
      adjustments.temporal = this.OPTIMIZED_THRESHOLDS.ADJUSTMENTS.NIGHT_TIME;
      reasoning.push('Período noturno (-3%)');
    }

    // CALCULAR THRESHOLD FINAL
    const totalAdjustment = Object.values(adjustments).reduce((sum, adj) => sum + adj, 0);
    let finalThreshold = baseThreshold + totalAdjustment;

    // APLICAR LIMITES DE SEGURANÇA
    finalThreshold = Math.max(
      this.OPTIMIZED_THRESHOLDS.MIN_THRESHOLD,
      Math.min(this.OPTIMIZED_THRESHOLDS.MAX_THRESHOLD, finalThreshold)
    );

    return {
      baseThreshold,
      finalThreshold,
      adjustments,
      reasoning: reasoning.length > 0 ? reasoning : ['Threshold base aplicado']
    };
  }

  /**
   * 🎯 THRESHOLD PARA DIFERENTES CENÁRIOS DE SEGURANÇA
   */
  public getThresholdForSecurityLevel(level: 'low' | 'medium' | 'high', context: RecognitionContext = {}): number {
    const analysis = this.calculateOptimalThreshold(context);
    
    switch (level) {
      case 'low':
        return Math.max(0.40, analysis.finalThreshold - 0.10);
      case 'medium':
        return analysis.finalThreshold;
      case 'high':
        return Math.min(0.80, analysis.finalThreshold + 0.10);
      default:
        return analysis.finalThreshold;
    }
  }

  /**
   * 📊 ANÁLISE DE IMAGEM PARA CONTEXTO
   */
  public analyzeImageContext(imageData: ImageData): { quality: number; lighting: number } {
    try {
      const pixels = imageData.data;
      let totalBrightness = 0;
      let contrastSum = 0;
      let pixelCount = 0;

      // Amostragem a cada 16 pixels para performance
      for (let i = 0; i < pixels.length; i += 16) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        
        const brightness = (r + g + b) / 3;
        totalBrightness += brightness;
        
        // Calcular contraste local (aproximado)
        if (i > 16) {
          const prevBrightness = (pixels[i - 16] + pixels[i - 15] + pixels[i - 14]) / 3;
          contrastSum += Math.abs(brightness - prevBrightness);
        }
        
        pixelCount++;
      }

      const avgBrightness = totalBrightness / pixelCount;
      const avgContrast = contrastSum / pixelCount;

      // Calcular scores de qualidade (0-1)
      const lighting = this.calculateLightingScore(avgBrightness);
      const quality = this.calculateQualityScore(avgBrightness, avgContrast);

      return { quality, lighting };

    } catch (error) {
      console.warn('Erro ao analisar contexto da imagem:', error);
      return { quality: 0.7, lighting: 0.7 }; // Valores seguros
    }
  }

  private calculateLightingScore(brightness: number): number {
    // Ideal: 80-180, Bom: 50-220, Ruim: <30 ou >240
    if (brightness >= 80 && brightness <= 180) return 1.0;
    if (brightness >= 50 && brightness <= 220) return 0.8;
    if (brightness >= 30 && brightness <= 240) return 0.6;
    return 0.3;
  }

  private calculateQualityScore(brightness: number, contrast: number): number {
    let score = 0.5;
    
    // Ajuste por brilho
    if (brightness >= 70 && brightness <= 200) score += 0.3;
    else if (brightness >= 40 && brightness <= 230) score += 0.1;
    
    // Ajuste por contraste
    if (contrast >= 15) score += 0.2;
    else if (contrast >= 8) score += 0.1;
    
    return Math.min(1.0, score);
  }

  /**
   * 🔧 CONFIGURAÇÃO PARA DIFERENTES AMBIENTES
   */
  public getEnvironmentConfig(environment: 'office' | 'factory' | 'outdoor' | 'retail'): RecognitionContext {
    switch (environment) {
      case 'office':
        return {
          imageQuality: 0.8,
          lighting: 0.8,
          deviceType: 'desktop'
        };
      case 'factory':
        return {
          imageQuality: 0.6,
          lighting: 0.5,
          deviceType: 'mobile'
        };
      case 'outdoor':
        return {
          imageQuality: 0.5,
          lighting: 0.4,
          deviceType: 'mobile'
        };
      case 'retail':
        return {
          imageQuality: 0.7,
          lighting: 0.7,
          deviceType: 'tablet'
        };
      default:
        return {};
    }
  }

  /**
   * 📝 LOGS DETALHADOS PARA DEBUG
   */
  public logThresholdAnalysis(analysis: ThresholdAnalysis, context: RecognitionContext = {}): void {
    console.log('🎯 ADAPTIVE THRESHOLD ANALYSIS:', {
      baseThreshold: `${Math.round(analysis.baseThreshold * 100)}%`,
      finalThreshold: `${Math.round(analysis.finalThreshold * 100)}%`,
      adjustments: {
        imageQuality: `${analysis.adjustments.imageQuality >= 0 ? '+' : ''}${Math.round(analysis.adjustments.imageQuality * 100)}%`,
        lighting: `${analysis.adjustments.lighting >= 0 ? '+' : ''}${Math.round(analysis.adjustments.lighting * 100)}%`,
        device: `${analysis.adjustments.device >= 0 ? '+' : ''}${Math.round(analysis.adjustments.device * 100)}%`,
        confidence: `${analysis.adjustments.confidence >= 0 ? '+' : ''}${Math.round(analysis.adjustments.confidence * 100)}%`,
        temporal: `${analysis.adjustments.temporal >= 0 ? '+' : ''}${Math.round(analysis.adjustments.temporal * 100)}%`
      },
      reasoning: analysis.reasoning,
      context: {
        imageQuality: context.imageQuality ? `${Math.round(context.imageQuality * 100)}%` : 'N/A',
        lighting: context.lighting ? `${Math.round(context.lighting * 100)}%` : 'N/A',
        deviceType: context.deviceType || 'N/A',
        confidence: context.confidence ? `${Math.round(context.confidence * 100)}%` : 'N/A'
      }
    });
  }
}

// Exportar instância singleton
export const adaptiveThresholdManager = AdaptiveThresholdManager.getInstance();

// Tipos para exportação
export type { RecognitionContext, ThresholdAnalysis };
