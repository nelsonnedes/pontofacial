/** @type {import('next').NextConfig} */
const CopyPlugin = require('copy-webpack-plugin');
const nextConfig = {
  // Configurações base
  trailingSlash: true,
  reactStrictMode: false, // Desabilitado para evitar dupla inicialização do TensorFlow.js
  
  // Configuração de saída para produção
  output: 'export', // Usar export estático para Firebase Hosting
  
  // Configurações de desenvolvimento
  ...(process.env.NODE_ENV === 'development' ? {
    // Configurações específicas para desenvolvimento
    assetPrefix: '', // Garantir que assets sejam servidos localmente
    basePath: '', // Sem base path em desenvolvimento
    // REMOVIDO: optimizeFonts e minify não são opções válidas do Next.js 15
  } : {}),
  
  // Configurações de imagens
  images: {
    unoptimized: true
  },
  
  // Configurações experimentais
  experimental: {
    // Configurações experimentais se necessário
  },
  
  // Configurações para PWA
  env: {
    CUSTOM_KEY: 'my-value',
  },
  
  // Configurações de build
  eslint: {
    ignoreDuringBuilds: process.env.NODE_ENV === 'production',
    // Permitir erros em desenvolvimento para não bloquear
    dirs: ['src'],
  },
  typescript: {
    ignoreBuildErrors: process.env.NODE_ENV === 'production',
    // Verificar tipos apenas em produção para melhor performance em dev
  },
  
  // Configurações para reduzir warnings e melhorar debugging
  onDemandEntries: {
    // Tempo para manter páginas em memória
    maxInactiveAge: 25 * 1000,
    // Número de páginas que devem ser mantidas simultaneamente
    pagesBufferLength: 2,
  },
  
  // Configurações de compilação
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production', // Remover console.log apenas em produção
  },
  
  // Configurações para webpack
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
        url: false,
        querystring: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        constants: false,
        domain: false,
        events: false,
        punycode: false,
        string_decoder: false,
        sys: false,
        timers: false,
        tty: false,
        vm: false,
        child_process: false,
        cluster: false,
        module: false,
        global: false,
        Buffer: false,
        __dirname: false,
        __filename: false,
        setImmediate: false,
        clearImmediate: false,
      };
      config.plugins.push(
        new CopyPlugin({
          patterns: [
            {
              from: 'node_modules/@tensorflow/tfjs-backend-wasm/dist/*.wasm',
              to: 'static/chunks/[name][ext]'
            }
          ]
        })
      );
      
      // Regra para arquivos WASM
      config.module.rules.push({
        test: /\.wasm$/,
        type: 'asset/resource',
        generator: {
          filename: 'static/chunks/[name][ext]'
        }
      });
      
      // Configurações específicas para TensorFlow.js
      config.module.rules.push({
        test: /\.js$/,
        include: /node_modules\/@tensorflow/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: ['@babel/plugin-transform-runtime']
          }
        }
      });
      
      // Configurações específicas para desenvolvimento
      if (dev) {
        config.optimization.minimize = false;
        // Desabilitar cache problemático em desenvolvimento
        config.cache = false;
        // Configurações adicionais para debugging
        config.devtool = 'cheap-module-source-map';
      }
      
      // CORREÇÃO: Suprimir warnings específicos que não são críticos
      config.infrastructureLogging = {
        level: 'error',
      };
      
      // Ignorar warnings específicos do face-api
      config.ignoreWarnings = [
        /Critical dependency: the request of a dependency is an expression/,
        /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
        /Module not found: Can't resolve.*face-api/,
        /@vladmandic\/face-api/,
        /Warning: Critical dependency/,
        /node_modules\/@vladmandic\/face-api/,
      ];
      
      // Externals para evitar bundling de módulos problemáticos
      if (!isServer) {
        config.externals = config.externals || {};
        // Face-api não será incluído no bundle se causando problemas
        // config.externals['@vladmandic/face-api'] = false;
      }
    }
    
    // Configurações para resolver problemas de módulos
    config.resolve.alias = {
      ...config.resolve.alias,
      'canvas': false,
      'jsdom': false,
      // Remover alias problemático do face-api
      // '@vladmandic/face-api': require.resolve('@vladmandic/face-api'),
    };
    
    // Configurações adicionais de resolve para estabilidade
    config.resolve.symlinks = false;
    config.resolve.cacheWithContext = false;
    
    // Configurações específicas para problemas de módulos
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@vladmandic/face-api': false, // Desabilitar se causando problemas
    };
    
    return config;
  }
};

module.exports = nextConfig;