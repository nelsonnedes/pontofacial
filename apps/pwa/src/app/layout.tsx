import './globals.css'
import RegisterSW from './register-sw'
export const metadata = { title: 'Ponto Facial PWA', description: 'REP-P + PTRP (PWA)' }
export default function RootLayout({ children }:{ children: React.ReactNode }){
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {children}
        <RegisterSW />
      </body>
    </html>
  )
}
