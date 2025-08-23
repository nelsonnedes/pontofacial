'use client'
import { useEffect, useState } from 'react'
import { db } from '@/app/lib/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'

export default function PoliticasPage(){
  const [empresaId, setEmpresaId] = useState('')
  const [toleranciaMin, setTol] = useState(5)
  const [limiteDiario, setLim] = useState(10)
  const [noturnoInicio, setNotI] = useState('22:00')
  const [noturnoFim, setNotF] = useState('05:00')
  const [msg, setMsg] = useState<string|undefined>()

  async function load(){
    if (!empresaId) return
    const snap = await getDoc(doc(db, 'empresas', empresaId))
    const data = snap.exists() ? (snap.data() as any) : null
    if (data?.politicasPonto){
      const p = data.politicasPonto
      setTol(p.toleranciaMin ?? 5)
      setLim(p.limiteDiario ?? 10)
      setNotI(p.noturno?.inicio ?? '22:00')
      setNotF(p.noturno?.fim ?? '05:00')
    }
  }
  useEffect(()=>{ load() },[empresaId])

  async function salvar(e: React.FormEvent){
    e.preventDefault()
    if (!empresaId) { setMsg('Informe empresaId'); return }
    await setDoc(doc(db,'empresas',empresaId), {
      politicasPonto: {
        toleranciaMin, limiteDiario, noturno: { inicio: noturnoInicio, fim: noturnoFim, fator: '52m30s' }
      }
    }, { merge: true })
    setMsg('✅ Políticas salvas')
  }

  return (
    <main className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Políticas CLT</h1>
      <form onSubmit={salvar} className="grid gap-3 max-w-md">
        <input className="rounded-lg border p-2" value={empresaId} onChange={e=>setEmpresaId(e.target.value)} placeholder="Empresa ID" required/>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">Tolerância (min)
            <input type="number" className="mt-1 w-full rounded-lg border p-2" value={toleranciaMin} onChange={e=>setTol(parseInt(e.target.value||'0'))}/>
          </label>
          <label className="block">Limite/dia (min)
            <input type="number" className="mt-1 w-full rounded-lg border p-2" value={limiteDiario} onChange={e=>setLim(parseInt(e.target.value||'0'))}/>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">Noturno início
            <input type="time" className="mt-1 w-full rounded-lg border p-2" value={noturnoInicio} onChange={e=>setNotI(e.target.value)}/>
          </label>
          <label className="block">Noturno fim
            <input type="time" className="mt-1 w-full rounded-lg border p-2" value={noturnoFim} onChange={e=>setNotF(e.target.value)}/>
          </label>
        </div>
        <button className="px-4 py-2 rounded-lg bg-black text-white">Salvar</button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>
    </main>
  )
}
