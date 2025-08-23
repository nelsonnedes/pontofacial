'use client'
import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/app/lib/firebase'

export default function Login(){
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [msg, setMsg] = useState<string|undefined>()

  async function handleLogin(e: React.FormEvent){
    e.preventDefault()
    setMsg(undefined)
    try{
      await signInWithEmailAndPassword(auth, email, senha)
      setMsg('✅ Autenticado. Abra /app para continuar.')
    }catch(err:any){
      setMsg(err?.message || 'Falha no login')
    }
  }

  return (
    <main className="p-6 max-w-sm mx-auto">
      <h1 className="text-xl font-semibold mb-4">Entrar</h1>
      <form onSubmit={handleLogin} className="space-y-3">
        <label className="block">Email
          <input className="mt-1 w-full rounded-lg border p-2" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>
        </label>
        <label className="block">Senha
          <input className="mt-1 w-full rounded-lg border p-2" type="password" value={senha} onChange={e=>setSenha(e.target.value)} required/>
        </label>
        <button className="px-4 py-2 rounded-lg bg-black text-white" type="submit">Entrar</button>
        {msg && <p className="text-sm mt-2">{msg}</p>}
      </form>
    </main>
  )
}
