'use client'
import { useState } from 'react'

export default function AejAdminPage(){
  const [cnpj, setCnpj] = useState('00000000000000')
  const [estab, setEstab] = useState('estab-demo')
  const [inicio, setInicio] = useState('2025-08-01')
  const [fim, setFim] = useState('2025-08-31')
  const [result, setResult] = useState<any>(null)
  const [cpf, setCpf] = useState('')
  const [toleranciaMin, setTol] = useState(5)
  const [limiteDiario, setLim] = useState(480)
  const [notI, setNotI] = useState('22:00')
  const [notF, setNotF] = useState('05:00')
  const [preview, setPreview] = useState<any[]>([])
  const [busy, setBusy] = useState(false)

  async function carregar(){
    const col = collection(db, 'marcacoes')
    const tsI = Timestamp.fromDate(new Date(inicio+'T00:00:00'))
    const tsF = Timestamp.fromDate(new Date(fim+'T23:59:59'))
    const qy = query(col, where('estabId','==',estab), where('createdAt','>=', tsI), where('createdAt','<=', tsF), orderBy('createdAt','asc'))
    const snap = await getDocs(qy)
    const rows = snap.docs.map(d => ({ id:d.id, ...d.data() } as any))
    const mapped = rows.filter(r => !cpf || (r.cpf && r.cpf.replace(/\D+/g,'') === cpf.replace(/\D+/g,''))).map((r, idx) => ({ nsr: r.nsr || (idx+1), cpf: (r.cpf||'').toString(), dataHoraISO: r.dataHoraTZ || new Date().toISOString(), origem: r.origem||'online' }))
    setPreview(mapped.slice(0, 10))
    return mapped
  }

  async function gerar(e: React.FormEvent){
    e.preventDefault()
    setBusy(true)
    setResult(null)
    try{
      const marcacoes = await carregar()
      const politicas = { toleranciaMin: toleranciaMin, limiteDiarioMin: limiteDiario, noturno: { inicio: notI, fim: notF } }
      const ferSnap = await getDocs(collection(db,'feriados'))
      const feriados = ferSnap.docs.map(d=>({ data: d.data().data, nome: d.data().nome }))
      const res = await fetch('/api/aej', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ cnpj, estabId:estab, inicio, fim, marcacoes, politicas, feriados }) })
      const json = await res.json()
      setResult(json)
    }catch(e:any){
      setResult({ error: e?.message||String(e) })
    }finally{
      setBusy(false)
    }
  }

  return (
    <main className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Admin • Geração AEJ</h1>
      <form onSubmit={gerar} className="grid gap-3 max-w-md">
        <label className="block">CNPJ
          <input className="mt-1 w-full rounded-lg border p-2" value={cnpj} onChange={e=>setCnpj(e.target.value)} />
        </label>
        <label className="block">Estabelecimento ID
          <input className="mt-1 w-full rounded-lg border p-2" value={estab} onChange={e=>setEstab(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">Início
            <input type="date" className="mt-1 w-full rounded-lg border p-2" value={inicio} onChange={e=>setInicio(e.target.value)} />
          </label>
          <label className="block">Fim
            <input type="date" className="mt-1 w-full rounded-lg border p-2" value={fim} onChange={e=>setFim(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">CPF (opcional)
            <input className="mt-1 w-full rounded-lg border p-2" value={cpf} onChange={e=>setCpf(e.target.value)} />
          </label>
        </div>
        <fieldset className="border rounded-lg p-3">
          <legend className="px-2 text-sm opacity-70">Políticas</legend>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">Tolerância (min)
              <input type="number" className="mt-1 w-full rounded-lg border p-2" value={toleranciaMin} onChange={e=>setTol(parseInt(e.target.value||'0'))}/>
            </label>
            <label className="block">Limite/dia (min)
              <input type="number" className="mt-1 w-full rounded-lg border p-2" value={limiteDiario} onChange={e=>setLim(parseInt(e.target.value||'0'))}/>
            </label>
            <label className="block">Noturno início
              <input type="time" className="mt-1 w-full rounded-lg border p-2" value={notI} onChange={e=>setNotI(e.target.value)}/>
            </label>
            <label className="block">Noturno fim
              <input type="time" className="mt-1 w-full rounded-lg border p-2" value={notF} onChange={e=>setNotF(e.target.value)}/>
            </label>
          </div>
        </fieldset>
        <button disabled={busy} className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50">{busy?'Gerando...':'Gerar AEJ'}</button>
      </form>

      {preview.length>0 && (<section className="p-3 rounded-xl bg-gray-50 text-sm"><p className="font-medium mb-2">Prévia (10 primeiras marcações):</p><ul className="space-y-1">{preview.map((m,i)=>(<li key={i} className="font-mono">{m.nsr} | {m.cpf} | {m.dataHoraISO} | {m.origem}</li>))}</ul></section>)}

      {result && (
        <section className="p-3 rounded-xl bg-gray-100 text-sm">
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(result, null, 2)}</pre>
          {result?.aejBase64 && (
            <a className="inline-block mt-3 underline" download={result.nomeArquivo} href={`data:text/plain;base64,${result.aejBase64}`}>Baixar AEJ (.txt)</a>
          )}
          {result?.p7sBase64 && (
            <a className="inline-block mt-3 underline" download={result.nomeArquivo+'.p7s'} href={`data:application/pkcs7-signature;base64,${result.p7sBase64}`}>Baixar Assinatura (.p7s)</a>
          )}
        </section>
      )}
    </main>
  )
}
