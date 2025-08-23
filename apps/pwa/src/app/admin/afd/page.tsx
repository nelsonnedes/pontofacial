'use client'
import { useMemo, useState } from 'react'
import { db } from '@/app/lib/firebase'
import { collection, getDocs, query, where, orderBy, Timestamp, doc, getDoc } from 'firebase/firestore'

export default function AfdAdminPage(){
async function getEstab(){
  const s = await getDoc(doc(db, 'estabelecimentos', estab))
  return s.exists() ? ({ id: s.id, ...s.data() } as any) : null
}
async function getEmpresa(empresaId:string){
  const s = await getDoc(doc(db, 'empresas', empresaId))
  return s.exists() ? ({ id: s.id, ...s.data() } as any) : null
}

  const [cnpj, setCnpj] = useState('00000000000000')
  const [razao, setRazao] = useState('Minha Empresa LTDA')
  const [estab, setEstab] = useState('estab-demo')
  const [inicio, setInicio] = useState('2025-08-01')
  const [fim, setFim] = useState('2025-08-31')
  const [cpf, setCpf] = useState('') // opcional filtro
  const [inpi, setInpi] = useState(process.env.NEXT_PUBLIC_REP_INPI || '00000000000000000')
  const [devTipo, setDevTipo] = useState<'1'|'2'>('1')
  const [devId, setDevId] = useState('00000000000000')
  const [tz, setTz] = useState('-0300')
  const [inclui246, setInclui246] = useState(true)

  const [result, setResult] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<any[]>([])

  const tsInicio = useMemo(()=> Timestamp.fromDate(new Date(inicio+'T00:00:00')), [inicio])
  const tsFim = useMemo(()=> Timestamp.fromDate(new Date(fim+'T23:59:59')), [fim])

  async function carregarMarcacoes(){
    const col = collection(db, 'marcacoes')
    let q = query(col, where('estabId','==',estab), where('createdAt','>=', tsInicio), where('createdAt','<=', tsFim), orderBy('createdAt','asc'))
    const snap = await getDocs(q)
    const rows = snap.docs.map(d => ({ id:d.id, ...d.data() } as any))
    const mapped = rows
      .filter(r => !cpf || (r.cpf && r.cpf.replace(/\D+/g,'') === cpf.replace(/\D+/g,'')))
      .map((r, idx) => ({
        nsr: r.nsr || (idx+1),
        cpf: (r.cpf || '').toString(),
        dataHoraISO: r.dataHoraTZ || new Date().toISOString(),
        createdAt: r.createdAt,
        origem: r.origem || 'online'
      }))
    setPreview(mapped.slice(0, 10))
    return mapped
  }

async function autoTz(){
  try{
    const est = await getEstab()
    if (est?.tzOffset) setTz(est.tzOffset)
  }catch{}
}

  async function gerar(e: React.FormEvent){
    e.preventDefault()
    setBusy(true)
    setResult(null)
    try{
      const marcacoes = await carregarMarcacoes()
      let regs2:any[] = [], regs4:any[] = [], regs5:any[] = [], regs6:any[] = []
      if (inclui246){
        // Reg. 2 com empresa/estab
        const est = await getEstab(); const emp = est?.empresaId ? await getEmpresa(est.empresaId) : null
        const localPrest = est?.nome || 'LOCAL'
        regs2 = [{ nsr: 0, dhGravISO: new Date().toISOString(), cpfResp: '00000000000', empregadorTipoId: '1', empregadorId: (emp?.cnpj||cnpj), cnoOuCaepf: '', razao: (emp?.razao || razao), localPrestacao: localPrest }]
        // Reg. 4 a partir de /ajustes dentro do período
        const ajSnap = await getDocs(query(collection(db,'ajustes'), where('estabId','==',estab), where('createdAt','>=', tsInicio), where('createdAt','<=', tsFim)))
        regs4 = ajSnap.docs.map((d,i)=>({ nsr: 0, dhAntesISO: d.data().antesISO, dhAjustISO: d.data().depoisISO, cpfResp: d.data().cpfResp }))
        // Reg. 5 a partir de /usuarios criados no período (operação I)
        const usSnap = await getDocs(query(collection(db,'usuarios'), where('createdAt','>=', tsInicio), where('createdAt','<=', tsFim)))
        regs5 = usSnap.docs.map(d=>({ nsr:0, dhGravISO: d.data().createdAt, operacao: 'I', cpf: (d.data().cpf||''), nome: (d.data().nome||''), demais:'', cpfResp:'00000000000' }))
        // Reg. 6 a partir de /eventosSens
        const evSnap = await getDocs(query(collection(db,'eventosSens'), where('estabId','==',estab), where('createdAt','>=', tsInicio), where('createdAt','<=', tsFim)))
        regs6 = evSnap.docs.map(d=>({ nsr:0, dhGravISO: d.data().createdAt, tipoEvento: (d.data().tipoEvento||'07') }))
      }

      const res = await fetch('/api/afd', {
        method:'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({ cnpj, razao, estabId:estab, inicio, fim, marcacoes, inpi, devTipo, devId, tz, regs2, regs4, regs5, regs6 })
      })
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
      <h1 className="text-xl font-semibold">Admin • Geração AFD (Portaria 671/2021)</h1>
      <form onSubmit={gerar} className="grid gap-3 max-w-xl">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">CNPJ do empregador
            <input className="mt-1 w-full rounded-lg border p-2" value={cnpj} onChange={e=>setCnpj(e.target.value)} />
          </label>
          <label className="block">Razão Social
            <input className="mt-1 w-full rounded-lg border p-2" value={razao} onChange={e=>setRazao(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">Estabelecimento ID
            <input className="mt-1 w-full rounded-lg border p-2" value={estab} onChange={async e=>{ setEstab(e.target.value); await autoTz(); }} />
          </label>
          <label className="block">CPF (opcional filtro)
            <input className="mt-1 w-full rounded-lg border p-2" value={cpf} onChange={e=>setCpf(e.target.value)} placeholder="Somente números" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">Início
            <input type="date" className="mt-1 w-full rounded-lg border p-2" value={inicio} onChange={e=>setInicio(e.target.value)} />
          </label>
          <label className="block">Fim
            <input type="date" className="mt-1 w-full rounded-lg border p-2" value={fim} onChange={e=>setFim(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">INPI (REP-P)
            <input className="mt-1 w-full rounded-lg border p-2" value={inpi} onChange={e=>setInpi(e.target.value)} placeholder="17 dígitos"/>
          </label>
          <label className="block">Dev Tipo ID (1=CNPJ,2=CPF)
            <select className="mt-1 w-full rounded-lg border p-2" value={devTipo} onChange={e=>setDevTipo(e.target.value as any)}>
              <option value="1">1 (CNPJ)</option>
              <option value="2">2 (CPF)</option>
            </select>
          </label>
          <label className="block">Dev ID (CNPJ/CPF)
            <input className="mt-1 w-full rounded-lg border p-2" value={devId} onChange={e=>setDevId(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">TZ (offset)
            <input className="mt-1 w-full rounded-lg border p-2" value={tz} onChange={e=>setTz(e.target.value)} placeholder="-0300" />
          </label>
          <label className="block">Incluir Reg. 2/4/5/6
            <input type="checkbox" className="ml-2" checked={inclui246} onChange={e=>setInclui246(e.target.checked)} />
          </label>
        </div>

        <button disabled={busy} className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50">{busy?'Gerando...':'Carregar & Gerar AFD'}</button>
      </form>

      {preview.length > 0 && (
        <section className="p-3 rounded-xl bg-gray-50 text-sm">
          <p className="font-medium mb-2">Prévia (10 primeiras marcações):</p>
          <ul className="space-y-1">
            {preview.map((m, i)=>(<li key={i} className="font-mono">{m.nsr} | {m.cpf} | {m.dataHoraISO} | {m.origem}</li>))}
          </ul>
        </section>
      )}

      {result && (
        <section className="p-3 rounded-xl bg-gray-100 text-sm">
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(result, null, 2)}</pre>
          {result?.afdBase64 && (
            <a className="inline-block mt-3 underline" download={result.nomeArquivo} href={`data:text/plain;base64,${result.afdBase64}`}>Baixar AFD (.txt)</a>
          )}
          {result?.p7sBase64 && (
            <a className="inline-block mt-3 underline" download={result.nomeArquivo+'.p7s'} href={`data:application/pkcs7-signature;base64,${result.p7sBase64}`}>Baixar Assinatura (.p7s)</a>
          )}
        </section>
      )}
    </main>
  )
}
