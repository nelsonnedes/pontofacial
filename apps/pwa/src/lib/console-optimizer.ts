// Console Optimizer - Reduz ruído de logs em desenvolvimento
// Este arquivo filtra e otimiza mensagens do console para melhor debugging

class ConsoleOptimizer {
  private originalError: typeof console.error;
  private originalWarn: typeof console.warn;
  private originalLog: typeof console.log;
  private originalInfo: typeof console.info;
  private originalDebug: typeof console.debug;
  private initialized = false;
  
  constructor() {
    this.originalError = console.error;
    this.originalWarn = console.warn;
    this.originalLog = console.log;
    this.originalInfo = console.info;
    this.originalDebug = console.debug;
  }

  private shouldSilenceProductionConsole(): boolean {
    return process.env.NODE_ENV === 'production' &&
      process.env.NEXT_PUBLIC_ENABLE_PRODUCTION_CONSOLE !== 'true';
  }

  private shouldFilter(message: string): boolean {
    // ✅ FILTROS AGRESSIVOS para desenvolvimento limpo
    const filters = [
      // React DevTools e stack traces COMPLETOS
      'Download the React DevTools',
      'recursivelyTraversePassiveMountEffects',
      'commitPassiveMountOnFiber',
      'flushPassiveEffects',
      'react-dom-client.development.js',
      'scheduler.development.js',
      'reconnectPassiveEffects',
      'recursivelyTraverseReconnectPassiveEffects',
      'commitHookEffectListMount',
      'commitHookPassiveMountEffects',
      'commitPassiveMountOnFiber',
      'recursivelyTraversePassiveMountEffects',
      'runWithFiberInDEV',
      'react-stack-bottom-frame',
      'performWorkUntilDeadline',
      
      // Firebase stack traces COMPLETOS
      'index.esm2017.js',
      'webchannel_blob_es2018.js',
      '__PRIVATE_',
      'Promise.then',
      'setTimeout',
      'eval @',
      'await in',
      'onSnapshot @',
      'onError @',
      'Ya @',
      'error @',
      'enqueue @',
      'enqueueAndForget @',
      'gu @',
      'bo @',
      'ab @',
      'F @',
      'Z.ta @',
      'Rb @',
      'M.Y @',
      'M.ca @',
      'Wc @',
      'h.bb @',
      'h.Ea @',
      'Lc @',
      'h.Pa @',
      'Nc @',
      'h.Sa @',
      'h.send @',
      'h.ea @',
      'Jb @',
      'fd @',
      'h.Fa @',
      'Da @',
      'x @',
      'ec @',
      'Hb @',
      'h.Ga @',
      'fc @',
      'h.connect @',
      'Y.m @',
      'Io @',
      'send @',
      'a_ @',
      'A_ @',
      'wo @',
      'Bo @',
      'T_ @',
      'P_ @',
      'auth @',
      'start @',
      'gc @',
      'Y.close @',
      'Ub @',
      'Mc @',
      
      // Headers de stack trace do Firebase
      'firestore.googleapis.com',
      'identitytoolkit.googleapis.com',
      
      // Main app warnings
      'main-app.js?v=',
      
      // PWA warnings
      'beforeinstallpromptevent.preventDefault() called',
      'Banner not shown',
      
      // Outros warnings não críticos
      'WARN_UNSUPPORTED_ENGINE',
      'The field "pnpm.overrides" was found',
      'WARN deprecated',
    ];
    
    return filters.some(filter => message.includes(filter));
  }

  private formatMessage(level: string, args: any[]): string {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    return `[${level.toUpperCase()}] ${message}`;
  }

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    if (this.shouldSilenceProductionConsole()) {
      console.log = () => undefined;
      console.info = () => undefined;
      console.debug = () => undefined;
      return;
    }

    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    // Interceptar console.error ULTRA-AGRESSIVAMENTE
    console.error = (...args: any[]) => {
      // 🚫 BLOQUEAR IMEDIATAMENTE - stack traces e argumentos problemáticos
      if (this.shouldBlockArgs(args)) {
        return; // Bloquear completamente na origem
      }
      
      const message = this.formatMessage('error', args);
      
      // Para erros críticos do nosso sistema, sempre mostrar
      if (message.includes('❌') || message.includes('Erro ao')) {
        this.originalError(...args);
        return;
      }
      
      this.originalError(...args);
    };

    // Interceptar console.warn
    console.warn = (...args: any[]) => {
      const message = this.formatMessage('warn', args);
      
      if (this.shouldFilter(message)) {
        // Para warnings do nosso sistema, sempre mostrar
        if (message.includes('⚠️') || message.includes('Warning:')) {
          this.originalWarn(...args);
        }
        return;
      }
      
      this.originalWarn(...args);
    };

    // Agrupar logs similares
    const logCounts: {[key: string]: number} = {};
    const LOG_GROUP_LIMIT = 3; // Mostrar no máximo 3 logs similares

    console.log = (...args: any[]) => {
      const message = this.formatMessage('log', args);
      
      // Agrupar logs repetitivos
      const logKey = message.substring(0, 50); // Primeiros 50 caracteres como chave
      logCounts[logKey] = (logCounts[logKey] || 0) + 1;
      
      if (logCounts[logKey] > LOG_GROUP_LIMIT) {
        if (logCounts[logKey] === LOG_GROUP_LIMIT + 1) {
          this.originalLog(`🔇 Log similar repetido ${LOG_GROUP_LIMIT}+ vezes, suprimindo...`);
        }
        return;
      }
      
      this.originalLog(...args);
    };

    console.log('🎛️ Console Optimizer ativado - filtrando ruído de desenvolvimento');
  }

  public restore(): void {
    console.error = this.originalError;
    console.warn = this.originalWarn;
    console.log = this.originalLog;
    console.info = this.originalInfo;
    console.debug = this.originalDebug;
    this.initialized = false;
  }
  // 🚫 NOVO: Bloquear argumentos problemáticos AGRESSIVAMENTE
  private shouldBlockArgs(args: any[]): boolean {
    // Juntar todos os argumentos numa string para análise
    const fullMessage = args.join(' ');
    
    // 🚫 PADRÕES ULTRA-AGRESSIVOS PARA BLOQUEAR
    const blockPatterns = [
      // React stack traces específicos
      'recursivelyTraversePassiveMountEffects',
      'commitPassiveMountOnFiber', 
      'commitHookEffectListMount',
      'commitPassiveMountOnFiber',
      'flushPassiveEffects',
      'performWorkUntilDeadline',
      'runWithFiberInDEV',
      'react-stack-bottom-frame',
      'commitHookPassiveMountEffects',
      'reconnectPassiveEffects',
      'recursivelyTraverseReconnectPassiveEffects',
      
      // Firebase stack traces específicos
      'index.esm2017.js',
      'webchannel_blob_es2018.js',
      '__PRIVATE_eventManagerOnWatchError',
      '__PRIVATE_removeAndCleanupTarget',
      '__PRIVATE_syncEngineRejectListen',
      '__PRIVATE_handleTargetError',
      '__PRIVATE_onWatchStreamChange',
      '__PRIVATE_sendWatchRequest',
      '__PRIVATE_onWatchStreamOpen',
      '__PRIVATE_startWatchStream',
      '__PRIVATE_remoteStoreListen',
      '__PRIVATE_allocateTargetAndMaybeListen',
      '__PRIVATE_syncEngineListen',
      '__PRIVATE_eventManagerListen',
      '__PRIVATE_firestoreClientListen',
      
      // DevTools warnings
      'Download the React DevTools for a better development experience',
      'main-app.js?v=',
      
      // URLs de requisição Firebase (TODAS as variações)
      'firestore.googleapis.com/google.firestore.v1.Firestore/Listen',
      'firestore.googleapis.com',
      'RID=',
      'SID=',
      'TYPE=terminate',
      '400 (Bad Request)',
      
      // Logs específicos que ainda aparecem
      'Erro ao carregar cercas virtuais',
      'Missing or insufficient permissions',
      'intercept-console-error.ts',
      'Auto-captura cancelada',
      'vídeo não ficou pronto',
      'tentativas)',
    ];
    
    // Se contém qualquer padrão bloqueado
    if (blockPatterns.some(pattern => fullMessage.includes(pattern))) {
      return true; // BLOQUEAR
    }
    
    // Se tem mais de 10 linhas E mais de 20 "@" (stack trace gigante)
    const lines = fullMessage.split('\n');
    if (lines.length > 10 && (fullMessage.match(/@/g)?.length || 0) > 20) {
      return true; // BLOQUEAR stack traces massivos
    }
    
    // Se contém muitos "eval @" (Firebase interno)
    if ((fullMessage.match(/eval @/g)?.length || 0) > 3) {
      return true; // BLOQUEAR
    }
    
    return false;
  }
}

// Singleton
const consoleOptimizer = new ConsoleOptimizer();

// Auto-inicializar no cliente o mais cedo possível.
if (typeof window !== 'undefined') {
  consoleOptimizer.initialize();
}

export default consoleOptimizer;
