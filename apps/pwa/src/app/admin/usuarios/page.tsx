'use client'
import { useEffect, useState } from 'react'
import { db } from '@/app/lib/firebase'
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore'

export default function UsuariosPage(){
  const [items, setItems] = useState<any[]>([])
  const [empresaId, setEmpresaId] = useState('')
  const [nome, setNome] = useState('Colaborador')
  const [cpf, setCpf] = useState('00000000000')
  const [matricula, setMatricula] = useState('0001')

  async function load(){
    const snap = await getDocs(collection(db, 'usuarios'))
    setItems(snap.docs.map(d=>({ id: d.id, ...d.data() })))
  }
  useEffect(()=>{ load() },[])

  async function add(e: React.FormEvent){
    e.preventDefault()
    await addDoc(collection(db, 'usuarios'), { empresaId, nome, cpf, matricula, createdAt: new Date().toISOString() })
    setNome(''); setCpf(''); setMatricula('')
    await load()
  }
  async function remove(id: string){
    await deleteDoc(doc(db, 'usuarios', id))
    await load()
  }

  return (
    <main className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Usuários</h1>
      <form onSubmit={add} className="grid gap-3 max-w-md">
        <input className="rounded-lg border p-2" value={empresaId} onChange={e=>setEmpresaId(e.target.value)} placeholder="Empresa ID" required/>
        <input className="rounded-lg border p-2" value={nome} onChange={e=>setNome(e.target.value)} placeholder="Nome" required/>
        <input className="rounded-lg border p-2" value={cpf} onChange={e=>setCpf(e.target.value)} placeholder="CPF" required/>
        <input className="rounded-lg border p-2" value={matricula} onChange={e=>setMatricula(e.target.value)} placeholder="Matrícula" required/>
        <button className="px-4 py-2 rounded-lg bg-black text-white">Adicionar</button>
      </form>
      <ul className="space-y-2">
        {items.map(it => (
          <li key={it.id} className="p-3 rounded-lg border flex justify-between">
            <span>{it.nome} — CPF {it.cpf} — Mat. {it.matricula}</span>
            <button onClick={()=>remove(it.id)} className="text-red-600 underline">Excluir</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
