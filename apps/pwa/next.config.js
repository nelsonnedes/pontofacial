/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuração para export estático (Firebase Hosting)
  output: 'export',
  trailingSlash: true,
  reactStrictMode: false, 
  
  // Imagens não otimizadas para export estático
  images: {
    unoptimized: true
  },
  
  // ✅ PWA: Configuração removida (não funciona com export estático)
  
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

      // Configurações específicas para desenvolvimento
      if (dev) {
        config.optimization.minimize = false;
      }
      
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
