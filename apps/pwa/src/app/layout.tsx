import './globals.css'
import ClientProviders from '../components/ClientProviders'
import ConsoleOptimizerClient from '../components/ConsoleOptimizerClient'

const PWA_ASSET_VERSION = '20260524-icon-v2'

export const metadata = { 
  title: 'Ponto Facial PWA', 
  description: 'REP-P + PTRP (PWA)' 
}

export default function RootLayout({ children }:{ children: React.ReactNode }){
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href={`/manifest.webmanifest?v=${PWA_ASSET_VERSION}`} />
        <link rel="icon" href={`/favicon.ico?v=${PWA_ASSET_VERSION}`} sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href={`/icons/icon-32x32.png?v=${PWA_ASSET_VERSION}`} />
        <link rel="icon" type="image/png" sizes="192x192" href={`/icons/icon-192x192.png?v=${PWA_ASSET_VERSION}`} />
        <link rel="apple-touch-icon" sizes="180x180" href={`/icons/apple-touch-icon.png?v=${PWA_ASSET_VERSION}`} />
        <meta name="theme-color" content="#2563eb" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Ponto Facial" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="msapplication-TileColor" content="#2563eb" />
        <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />
        <meta name="format-detection" content="telephone=no" />
        
        {/* ✅ PRELOAD REMOVIDO: Causando warnings desnecessários */}
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <ConsoleOptimizerClient />
        {/* <ServiceWorkerCleaner /> Temporariamente desabilitado */}
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  )
}
