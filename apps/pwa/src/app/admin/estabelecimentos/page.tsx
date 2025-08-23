'use client'
import { useEffect, useState } from 'react'
import { db } from '@/app/lib/firebase'
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore'

export default function EstabsPage(){
  const [empresas, setEmpresas] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [empresaId, setEmpresaId] = useState('')
  const [nome, setNome] = useState('Matriz')
  const [cnpj, setCnpj] = useState('00000000000000')
  const [tzOffset, setTzOffset] = useState('-0300')

  async function load(){
    const empSnap = await getDocs(collection(db, 'empresas'))
    setEmpresas(empSnap.docs.map(d=>({ id: d.id, ...d.data() })))
    const estSnap = await getDocs(collection(db, 'estabelecimentos'))
    setItems(estSnap.docs.map(d=>({ id: d.id, ...d.data() })))
  }
  useEffect(()=>{ load() },[])

  async function add(e: React.FormEvent){
    e.preventDefault()
    await addDoc(collection(db, 'estabelecimentos'), { empresaId, nome, cnpj, tzOffset, createdAt: new Date().toISOString() })
    setNome(''); setCnpj('')
    await load()
  }
  async function remove(id: string){
    await deleteDoc(doc(db, 'estabelecimentos', id))
    await load()
  }

  return (
    <main className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Estabelecimentos</h1>
      <form onSubmit={add} className="grid gap-3 max-w-md">
        <select className="rounded-lg border p-2" value={empresaId} onChange={e=>setEmpresaId(e.target.value)} required>
          <option value="">Selecione a empresa</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razao}</option>)}
        </select>
        <input className="rounded-lg border p-2" value={nome} onChange={e=>setNome(e.target.value)} placeholder="Nome" required/>
        <input className="rounded-lg border p-2" value={cnpj} onChange={e=>setCnpj(e.target.value)} placeholder="CNPJ do Estabelecimento" required/>
        <input className="rounded-lg border p-2" value={tzOffset} onChange={e=>setTzOffset(e.target.value)} placeholder="TZ offset (-0300)" required/>
        <button className="px-4 py-2 rounded-lg bg-black text-white">Adicionar</button>
      </form>
      <ul className="space-y-2">
        {items.map(it => (
          <li key={it.id} className="p-3 rounded-lg border flex justify-between">
            <span>{it.nome} — {it.cnpj} <i className="opacity-60">({it.empresaId})</i> <b className="ml-2">TZ:</b> {it.tzOffset||'-'}</span>
            <button onClick={()=>remove(it.id)} className="text-red-600 underline">Excluir</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
