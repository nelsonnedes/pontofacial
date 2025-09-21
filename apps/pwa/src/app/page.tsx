import Link from 'next/link'
import PwaInstall from '@/components/PwaInstall'

export default function Home(){
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24">
          <div className="text-center">
            {/* Logo/Icon */}
            <div className="w-24 h-24 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-lg">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            
            {/* Title */}
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
              Ponto Facial
              <span className="block text-2xl sm:text-3xl font-normal text-blue-600 mt-2">PWA</span>
            </h1>
            
            {/* Subtitle */}
            <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed">
              Sistema moderno de controle de ponto com reconhecimento facial. 
              Seguro, rápido e funciona offline.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link 
                href="/login" 
                className="px-8 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors font-semibold shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Entrar no Sistema</span>
              </Link>
              
              <Link 
                href="/app/marcar" 
                className="px-8 py-4 bg-white text-blue-600 border-2 border-blue-600 rounded-2xl hover:bg-blue-50 transition-colors font-semibold shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
              >
                <span>📍</span>
                <span>Marcar Ponto</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
      
      {/* Features Section */}
      <div className="bg-white py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Principais Funcionalidades</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Reconhecimento Facial</h3>
              <p className="text-sm text-gray-600">Identificação segura e precisa com tecnologia avançada</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Funciona Offline</h3>
              <p className="text-sm text-gray-600">Continue marcando ponto mesmo sem internet</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Histórico Completo</h3>
              <p className="text-sm text-gray-600">Visualize todas as suas marcações e comprovantes</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-yellow-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Relatórios AFD</h3>
              <p className="text-sm text-gray-600">Geração automática de arquivos para o eSocial</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* PWA Install Section */}
      <div className="bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Instale o App</h2>
          <p className="text-gray-600 mb-8">Tenha acesso rápido ao sistema direto da tela inicial do seu dispositivo</p>
          <PwaInstall />
        </div>
      </div>
      
      {/* Footer */}
      <footer className="bg-white border-t py-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-gray-600">© 2024 Ponto Facial PWA. Sistema de controle de ponto moderno e seguro.</p>
        </div>
      </footer>
    </div>
  )
}