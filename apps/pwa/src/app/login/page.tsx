'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { getToken } from 'firebase/app-check'
import { auth, getFirebaseAppCheck } from '@/lib/firebase'
import Link from 'next/link'

export default function Login(){
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [msg, setMsg] = useState<string|undefined>()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Check if user is already logged in
    const unsubscribe = auth.onAuthStateChanged((user: any) => {
      if (user) {
        router.push('/app')
      }
    })
    return () => unsubscribe()
  }, [router])

  async function ensureAppCheckReady(): Promise<boolean> {
    const appCheck = getFirebaseAppCheck()

    if (!appCheck) {
      return true
    }

    try {
      await getToken(appCheck, false)
      return true
    } catch (err: any) {
      const isThrottled = err?.code === 'appCheck/throttled' ||
        String(err?.message || '').includes('throttled')

      setMsg(
        isThrottled
          ? '❌ Validação de segurança temporariamente bloqueada pelo App Check. Feche todas as guias anônimas e tente novamente após ajustarmos a configuração.'
          : '❌ Não foi possível validar a segurança do navegador pelo App Check. Verifique a configuração do reCAPTCHA/App Check antes de tentar login.'
      )
      return false
    }
  }

  async function handleLogin(e: React.FormEvent){
    e.preventDefault()
    setMsg(undefined)
    setLoading(true)

    try{
      const appCheckReady = await ensureAppCheckReady()
      if (!appCheckReady) {
        return
      }

      await signInWithEmailAndPassword(auth, email, senha)
      setMsg('✅ Autenticado com sucesso! Redirecionando...')
      setTimeout(() => {
        router.push('/app')
      }, 1500)
    }catch(err:any){
      let errorMessage = 'Falha no login'
      if (err.code === 'auth/user-not-found') {
        errorMessage = 'Usuário não encontrado no Firebase'
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Senha incorreta'
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Email inválido'
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Muitas tentativas. Tente novamente mais tarde'
      } else if (err.code === 'auth/invalid-credential') {
        errorMessage = 'Credenciais inválidas - usuário não existe ou senha errada'
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = 'Falha de rede ao acessar o Firebase'
      } else if (String(err?.message || '').includes('AppCheck')) {
        errorMessage = 'Falha na validação de segurança App Check'
      }
      
      setMsg(`❌ ${errorMessage} (${err.code})`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header com Logo */}
        <div className="text-center mb-8">
          <div className="relative mx-auto mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl">
              <span className="text-white text-3xl font-bold">📷</span>
            </div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-4 border-white flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Ponto Facial</h1>
          <p className="text-gray-600 text-lg">Sistema de controle de ponto por reconhecimento facial</p>
        </div>

        {/* Login Form */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/50">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Fazer Login</h2>
            <p className="text-gray-600">Entre com suas credenciais para acessar o sistema</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                📧 Email
              </label>
              <input 
                className="w-full px-4 py-4 border-2 border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white text-gray-900 placeholder-gray-500" 
                type="email" 
                value={email} 
                onChange={e=>setEmail(e.target.value)} 
                placeholder="Digite seu email"
                name="email"
                autoComplete="username"
                required
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                🔒 Senha
              </label>
              <div className="relative">
                <input 
                  className="w-full px-4 py-4 pr-12 border-2 border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white text-gray-900 placeholder-gray-500" 
                  type={showPassword ? 'text' : 'password'}
                  value={senha} 
                  onChange={e=>setSenha(e.target.value)} 
                  placeholder="Digite sua senha"
                  name="password"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                  disabled={loading}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            
            <button 
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-4 px-6 rounded-2xl hover:from-blue-600 hover:to-indigo-700 focus:ring-4 focus:ring-blue-300 transition-all duration-200 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-xl hover:shadow-2xl transform hover:scale-[1.02]" 
              type="submit"
              disabled={loading || !email || !senha}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                  Entrando...
                </>
              ) : (
                <>
                  <span className="mr-2">🚀</span>
                  Entrar no Sistema
                </>
              )}
            </button>
            
            {msg && (
              <div className={`p-4 rounded-2xl text-sm font-medium border-2 ${
                msg.includes('✅') 
                  ? 'bg-green-50 text-green-700 border-green-200' 
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                <div className="flex items-center gap-2">
                  <span>{msg.includes('✅') ? '✅' : '❌'}</span>
                  <span>{msg}</span>
                </div>
              </div>
            )}
          </form>
          
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <Link 
                href="/" 
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-semibold transition-colors"
              >
                <span>←</span>
                Voltar ao início
              </Link>
              
              <div className="text-xs text-gray-500">
                v1.0.0
              </div>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center">
          <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <span>🔒</span>
              Autenticado
            </span>
            <span className="flex items-center gap-1">
              <span>⚡</span>
              Rápido
            </span>
            <span className="flex items-center gap-1">
              <span>📱</span>
              PWA
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
