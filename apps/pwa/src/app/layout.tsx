import './globals.css'
import ClientProviders from '../components/ClientProviders'
import ServiceWorkerCleaner from '../components/ServiceWorkerCleaner'
import ConsoleOptimizerClient from '../components/ConsoleOptimizerClient'

export const metadata = { 
  title: 'Ponto Facial PWA', 
  description: 'REP-P + PTRP (PWA)' 
}

export default function RootLayout({ children }:{ children: React.ReactNode }){
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#000000" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <ConsoleOptimizerClient />
        <ServiceWorkerCleaner />
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  )
}
