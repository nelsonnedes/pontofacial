'use client'
import { useState } from 'react'

export default function EspelhoPage(){
  const [userId, setUserId] = useState('user-demo')
  const [mes, setMes] = useState('2025-08')
  const [res, setRes] = useState<any>()
  const [toleranciaMin, setTol] = useState(5)
  const [limiteDiario, setLim] = useState(480)
  const [notI, setNotI] = useState('22:00')
  const [notF, setNotF] = useState('05:00')
  const [estab, setEstab] = useState('estab-demo')
  const [busy, setBusy] = useState(false)

  async function carregar(){
    // carrega marcacoes por userId e mes
    const tsI = new Date(mes+'-01T00:00:00')
    const tsF = new Date(new Date(tsI.getFullYear(), tsI.getMonth()+1, 0, 23,59,59))
    const { collection, query, where, getDocs, orderBy, Timestamp } = await import('firebase/firestore')
    const col = collection(db, 'marcacoes')
    const snap = await getDocs(query(col, where('usuarioId','==', userId), orderBy('createdAt','asc')))
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() } as any)).filter(r => { const dt = (r.dataHoraTZ? new Date(r.dataHoraTZ) : (r.createdAt?.toDate? r.createdAt.toDate(): new Date())); return dt>=tsI && dt<=tsF })
    return rows.map((r:any, idx:number)=> ({ nsr: r.nsr||idx+1, cpf: r.cpf||'', dataHoraISO: r.dataHoraTZ||new Date().toISOString(), usuarioId: r.usuarioId }))
  }

  async function gerar(e: React.FormEvent){
    e.preventDefault()
    setBusy(true)
    setRes(undefined)
    try{
      const marcacoes = await carregar()
      const politicas = { toleranciaMin, limiteDiarioMin: limiteDiario, noturno: { inicio: notI, fim: notF } }
      const ferSnap = await getDocs(collection(db,'feriados'))
      const feriados = ferSnap.docs.map(d=>({ data: d.data().data, nome: d.data().nome }))
      const rq = await fetch('/api/espelho', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ userId, mes, marcacoes, politicas, feriados }) })
      const js = await rq.json()
      setRes(js)
    }catch(e:any){
      setRes({ error: e?.message || String(e) })
    }finally{
      setBusy(false)
    }
  }

  return (
    <main className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Admin • Espelho (PDF)</h1>
      <form onSubmit={gerar} className="grid gap-3 max-w-md">
        <input className="rounded-lg border p-2" value={userId} onChange={e=>setUserId(e.target.value)} placeholder="userId"/>
        <input className="rounded-lg border p-2" value={mes} onChange={e=>setMes(e.target.value)} placeholder="YYYY-MM"/>
        <button disabled={busy} className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50">{busy?'Gerando...':'Gerar PDF'}</button>
      </form>

      <div className="grid grid-cols-3 gap-3 max-w-3xl">
        <label className="block">Estabelecimento (p/ filtro futuro)
          <input className="mt-1 w-full rounded-lg border p-2" value={estab} onChange={e=>setEstab(e.target.value)} />
        </label>
        <label className="block">Tolerância (min)
          <input type="number" className="mt-1 w-full rounded-lg border p-2" value={toleranciaMin} onChange={e=>setTol(parseInt(e.target.value||'0'))} />
        </label>
        <label className="block">Limite/dia (min)
          <input type="number" className="mt-1 w-full rounded-lg border p-2" value={limiteDiario} onChange={e=>setLim(parseInt(e.target.value||'0'))} />
        </label>
        <label className="block">Noturno início
          <input type="time" className="mt-1 w-full rounded-lg border p-2" value={notI} onChange={e=>setNotI(e.target.value)} />
        </label>
        <label className="block">Noturno fim
          <input type="time" className="mt-1 w-full rounded-lg border p-2" value={notF} onChange={e=>setNotF(e.target.value)} />
        </label>
      </div>
      {res && (
        <section className="p-3 rounded-xl bg-gray-100 text-sm">
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(res, null, 2)}</pre>
          {res?.pdfBase64 && (
            <a className="inline-block mt-3 underline" download={res.nomeArquivo || `espelho_${userId}_${mes}.pdf`} href={`data:application/pdf;base64,${res.pdfBase64}`}>Baixar PDF</a>
          )}
        </section>
      )}
    </main>
  )
}
