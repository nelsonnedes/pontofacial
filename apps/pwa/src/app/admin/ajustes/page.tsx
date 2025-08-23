'use client'
import { useEffect, useState } from 'react'
import { db } from '@/app/lib/firebase'
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore'

export default function AjustesPage(){
  const [estabId, setEstabId] = useState('estab-demo')
  const [antes, setAntes] = useState('2025-08-01T00:00:00-03:00')
  const [depois, setDepois] = useState('2025-08-01T00:05:00-03:00')
  const [cpfResp, setCpfResp] = useState('00000000000')
  const [items, setItems] = useState<any[]>([])

  async function load(){
    const qy = query(collection(db,'ajustes'), where('estabId','==',estabId), orderBy('createdAt','desc'))
    const snap = await getDocs(qy)
    setItems(snap.docs.map(d=>({ id:d.id, ...d.data() })))
  }
  useEffect(()=>{ load() }, [estabId])

  async function add(e: React.FormEvent){
    e.preventDefault()
    await addDoc(collection(db,'ajustes'), { estabId, antesISO: antes, depoisISO: depois, cpfResp, createdAt: new Date().toISOString() })
    await load()
  }
  async function remove(id:string){
    await deleteDoc(doc(db,'ajustes', id))
    await load()
  }

  return (
    <main className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Ajustes de Relógio (Reg. 4)</h1>
      <form onSubmit={add} className="grid gap-3 max-w-md">
        <input className="rounded-lg border p-2" value={estabId} onChange={e=>setEstabId(e.target.value)} placeholder="estabId"/>
        <input className="rounded-lg border p-2" value={antes} onChange={e=>setAntes(e.target.value)} placeholder="Antes ISO"/>
        <input className="rounded-lg border p-2" value={depois} onChange={e=>setDepois(e.target.value)} placeholder="Depois ISO"/>
        <input className="rounded-lg border p-2" value={cpfResp} onChange={e=>setCpfResp(e.target.value)} placeholder="CPF Responsável"/>
        <button className="px-4 py-2 rounded-lg bg-black text-white">Adicionar</button>
      </form>
      <ul className="space-y-2">
        {items.map(it => (
          <li key={it.id} className="p-3 rounded-lg border flex justify-between">
            <span>{it.antesISO} → {it.depoisISO} • Resp: {it.cpfResp}</span>
            <button onClick={()=>remove(it.id)} className="text-red-600 underline">Excluir</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
