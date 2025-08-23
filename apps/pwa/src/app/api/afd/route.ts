import { NextRequest, NextResponse } from 'next/server'
import { montarAFD671, nomeArquivoAFD } from '../../../../packages/core-legal/src/afd671'
import { validateAFD671 } from '../../../../packages/core-legal/src/afdValidator'

type MarcaInput = {
  nsr: number
  cpf?: string
  dataHoraISO?: string // marcação
  dataHoraTZ?: string  // alias
  createdAt?: { seconds:number, nanoseconds:number } | string // Firestore TS or ISO
  origem?: string // 'online' | 'offline' | 'offline-sync'
}

function toDateFromMixed(v:any): Date {
  if (!v) return new Date()
  if (typeof v === 'string') return new Date(v)
  if (typeof v === 'object' && 'seconds' in v) return new Date(v.seconds * 1000)
  return new Date()
}

export async function POST(req: NextRequest){
  try{
    const body = await req.json()
    const { cnpj, estabId, inicio, fim, marcacoes, inpi, devTipo='1', devId='00000000000000', razao='EMPREGADOR', tz='-0300', regs2=[], regs4=[], regs5=[], regs6=[] } = body || {}
    if (!cnpj || !estabId || !inicio || !fim){
      const validation = validateAFD671(conteudo)

    return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 })
    }
    const repIdent = (inpi || process.env.NEXT_PUBLIC_REP_INPI || '00000000000000000').toString()

    const regs7 = (Array.isArray(marcacoes)? marcacoes : []).map((m: MarcaInput) => ({
      nsr: Number(m.nsr || 0),
      dataHoraMarcISO: (m.dataHoraISO || m.dataHoraTZ || new Date().toISOString()),
      cpf: (m.cpf || '').toString(),
      dataHoraGravISO: typeof m.createdAt === 'string' ? m.createdAt : toDateFromMixed(m.createdAt).toISOString(),
      coletor: '01',
      offline: m.origem === 'offline' || m.origem === 'offline-sync'
    }))

        // Renumera NSR sequencialmente (2/4/5/6/7)
    let nsr = 1
    const r2 = (regs2||[]).map((r:any)=>({ ...r, nsr: nsr++ }))
    const r4 = (regs4||[]).map((r:any)=>({ ...r, nsr: nsr++ }))
    const r5 = (regs5||[]).map((r:any)=>({ ...r, nsr: nsr++ }))
    const r6 = (regs6||[]).map((r:any)=>({ ...r, nsr: nsr++ }))
    const r7 = regs7.map((r:any)=>({ ...r, nsr: nsr++ }))

    const { conteudo, nome } = montarAFD671({
      header: {
        empregadorTipoId: '1',
        empregadorId: cnpj,
        cnoOuCaepf: '',
        razaoSocial: razao,
        repTipo: 'P',
        repIdent,
        versaoLeiaute: '003',
        desenvolvedorTipoId: devTipo,
        desenvolvedorId: devId,
      },
      periodo: { inicio: new Date(inicio + 'T00:00:00'), fim: new Date(fim + 'T23:59:59') },
      geradoEm: new Date(),
      registros2: r2,
      registros4: r4,
      registros5: r5,
      registros6: r6,
      registros7: r7,
      tzOverride: tz
    })

    const signUrl = process.env.NEXT_PUBLIC_SIGN_CADES_URL || 'http://localhost:8080/sign/cades'
    let p7sBase64: string | null = null
    try{
      const res = await fetch(signUrl, { method:'POST', body: Buffer.from(conteudo, 'latin1') })
      if (res.ok){ const js = await res.json(); p7sBase64 = js?.signatureBase64 || null }
    }catch(_){}

    const validation = validateAFD671(conteudo)

    return NextResponse.json({
      ok: true,
      nomeArquivo: nome || nomeArquivoAFD('P', repIdent, cnpj),
      totalRegistros7: regs7.length,
      afdBase64: Buffer.from(conteudo, 'latin1').toString('base64'),
      p7sBase64,
      validacao: validation
    })
  }catch(e:any){
    const validation = validateAFD671(conteudo)

    return NextResponse.json({ error: e?.message||String(e) }, { status: 500 })
  }
}
