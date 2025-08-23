'use client'
import { useEffect, useState } from 'react'
import { db } from '@/app/lib/firebase'
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore'

export default function EmpresasPage(){
  const [items, setItems] = useState<any[]>([])
  const [razao, setRazao] = useState('Minha Empresa')
  const [cnpj, setCnpj] = useState('00000000000000')
  const col = collection(db, 'empresas')

  async function load(){
    const snap = await getDocs(col)
    setItems(snap.docs.map(d=>({ id: d.id, ...d.data() })))
  }
  useEffect(()=>{ load() },[])

  async function add(e: React.FormEvent){
    e.preventDefault()
    await addDoc(col, { razao, cnpj, createdAt: new Date().toISOString() })
    setRazao(''); setCnpj('')
    await load()
  }
  async function remove(id: string){
    await deleteDoc(doc(db, 'empresas', id))
    await load()
  }

  return (
    <main className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Empresas</h1>
      <form onSubmit={add} className="grid gap-3 max-w-md">
        <input className="rounded-lg border p-2" value={razao} onChange={e=>setRazao(e.target.value)} placeholder="Razão Social" required/>
        <input className="rounded-lg border p-2" value={cnpj} onChange={e=>setCnpj(e.target.value)} placeholder="CNPJ" required/>
        <button className="px-4 py-2 rounded-lg bg-black text-white">Adicionar</button>
      </form>
      <ul className="space-y-2">
        {items.map(it => (
          <li key={it.id} className="p-3 rounded-lg border flex justify-between">
            <span>{it.razao} — {it.cnpj}</span>
            <button onClick={()=>remove(it.id)} className="text-red-600 underline">Excluir</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
