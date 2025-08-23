'use client'
import { useEffect, useState } from 'react'
import { db } from '@/app/lib/firebase'
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore'

export default function EventosPage(){
  const [estabId, setEstabId] = useState('estab-demo')
  const [tipoEvento, setTipoEvento] = useState('07')
  const [items, setItems] = useState<any[]>([])

  async function load(){
    const qy = query(collection(db,'eventosSens'), where('estabId','==',estabId), orderBy('createdAt','desc'))
    const snap = await getDocs(qy)
    setItems(snap.docs.map(d=>({ id:d.id, ...d.data() })))
  }
  useEffect(()=>{ load() }, [estabId])

  async function add(e: React.FormEvent){
    e.preventDefault()
    await addDoc(collection(db,'eventosSens'), { estabId, tipoEvento, createdAt: new Date().toISOString() })
    await load()
  }
  async function remove(id:string){
    await deleteDoc(doc(db,'eventosSens', id))
    await load()
  }

  return (
    <main className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Eventos Sensíveis (Reg. 6)</h1>
      <form onSubmit={add} className="grid gap-3 max-w-md">
        <input className="rounded-lg border p-2" value={estabId} onChange={e=>setEstabId(e.target.value)} placeholder="estabId"/>
        <select className="rounded-lg border p-2" value={tipoEvento} onChange={e=>setTipoEvento(e.target.value)}>
          {['01','02','03','04','05','06','07','08'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="px-4 py-2 rounded-lg bg-black text-white">Adicionar</button>
      </form>
      <ul className="space-y-2">
        {items.map(it => (
          <li key={it.id} className="p-3 rounded-lg border flex justify-between">
            <span>Tipo: {it.tipoEvento} • {it.createdAt}</span>
            <button onClick={()=>remove(it.id)} className="text-red-600 underline">Excluir</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
