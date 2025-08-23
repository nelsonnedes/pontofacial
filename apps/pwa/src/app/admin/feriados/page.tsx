'use client'
import { useEffect, useState } from 'react'
import { db } from '@/app/lib/firebase'
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore'

export default function FeriadosPage(){
  const [empresaId, setEmpresaId] = useState('')
  const [data, setData] = useState('2025-12-25')
  const [nome, setNome] = useState('Natal')
  const [items, setItems] = useState<any[]>([])

  async function load(){
    let qy = collection(db, 'feriados')
    const snap = await getDocs(qy)
    setItems(snap.docs.map(d=>({ id:d.id, ...d.data() })))
  }
  useEffect(()=>{ load() },[])

  async function add(e: React.FormEvent){
    e.preventDefault()
    await addDoc(collection(db,'feriados'), { empresaId, data, nome, createdAt: new Date().toISOString() })
    await load()
  }
  async function remove(id:string){
    await deleteDoc(doc(db,'feriados', id))
    await load()
  }

  return (
    <main className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Feriados</h1>
      <form onSubmit={add} className="grid gap-3 max-w-md">
        <input className="rounded-lg border p-2" value={empresaId} onChange={e=>setEmpresaId(e.target.value)} placeholder="Empresa ID (opcional)"/>
        <input className="rounded-lg border p-2" type="date" value={data} onChange={e=>setData(e.target.value)} />
        <input className="rounded-lg border p-2" value={nome} onChange={e=>setNome(e.target.value)} placeholder="Nome do feriado"/>
        <button className="px-4 py-2 rounded-lg bg-black text-white">Adicionar</button>
      </form>
      <ul className="space-y-2">
        {items.map(it => (
          <li key={it.id} className="p-3 rounded-lg border flex justify-between">
            <span>{it.data} — {it.nome} {it.empresaId && <i className="opacity-60">({it.empresaId})</i>}</span>
            <button onClick={()=>remove(it.id)} className="text-red-600 underline">Excluir</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
