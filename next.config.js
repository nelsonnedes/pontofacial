/** @type {import('next').NextConfig} */
const nextConfig = {
  // Usar export estático para Vercel
  output: 'export',
  trailingSlash: true,
  reactStrictMode: false, 
  
  // Configurações para static export
  images: {
    unoptimized: true
  },
  
  // Ignorar erros de build 
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  }
};

module.exports = nextConfig;
