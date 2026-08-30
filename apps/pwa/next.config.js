/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuração para export estático (Firebase Hosting)
  output: 'export',
  trailingSlash: true,
  // P4-1: StrictMode true expõe double-effect bugs em dev — Menos é Mais, sem esconder leaks de câmera
  reactStrictMode: true, 
  
  // Imagens não otimizadas para export estático
  images: {
    unoptimized: true
  },
  
  // P3-1: Build deve falhar em lint/type errors — Menos é Mais, sem dívida oculta
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  // P4-3: PWA next-pwa removido — não funciona com output:export. SW manual em public/sw.js:4 (v12).
  // Quando migrar para SSR (remover output:export), reativar next-pwa com Workbox: { runtimeCaching: [...] }
  
  // Desabilitar features que não funcionam com export estático
  experimental: {
    // Configurações específicas se necessário
  },

  // Configurações para webpack para otimização do TensorFlow.js e face-api
  webpack: (config, { dev, isServer }) => {
    if (!isServer) {
      // Fallbacks para módulos Node.js
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        util: false,
        buffer: false,
        process: false,
        path: false,
        os: false,
        zlib: false,
      };

      // P4-2: Removido minimize:false — deixa webpack decidir (Menos é Mais, bundle otimizado até em dev)
      // Suprimir warnings específicos do face-api que não são críticos
      config.infrastructureLogging = {
        level: 'error',
      };
      
      config.ignoreWarnings = [
        /Critical dependency: the request of a dependency is an expression/,
        /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
        /Module not found: Can't resolve.*face-api/,
        /@vladmandic\/face-api/,
        /Warning: Critical dependency/,
        /node_modules\/@vladmandic\/face-api/,
      ];
    }
    
    // Configurações para resolver problemas de módulos
    config.resolve.alias = {
      ...config.resolve.alias,
      'canvas': false,
      'jsdom': false,
      'canvg': false,
    };
    
    return config;
  }
};

module.exports = nextConfig;
