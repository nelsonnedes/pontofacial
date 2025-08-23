import { NextRequest, NextResponse } from 'next/server'
import { gerarAEJ } from '../../../../packages/core-legal/src/aejGenerator'
import { computeDay, computeWeek } from '../../../../packages/core-rules/src/computeAdvanced'
import type { AEJ } from '../../../../packages/core-legal/src/schemas'

function mockAEJ(cnpj:string, estabId:string, inicio:string, fim:string): AEJ {
  return {
    estabelecimentoId: estabId,
    cnpj,
    periodo: { inicio, fim },
    versaoLeiaute: '001',
    jornadas: [{
      cpf: '12345678900',
      dias: [{
        data: inicio,
        eventos: [
          { nsr: 1, cpf: '12345678900', dataHoraISO: inicio+'T08:00:00-03:00', origem: 'online' },
          { nsr: 2, cpf: '12345678900', dataHoraISO: inicio+'T12:00:00-03:00', origem: 'online' },
          { nsr: 3, cpf: '12345678900', dataHoraISO: inicio+'T13:00:00-03:00', origem: 'online' },
          { nsr: 4, cpf: '12345678900', dataHoraISO: inicio+'T17:00:00-03:00', origem: 'online' },
        ]
      }]
    }]
  }
}

export async function POST(req: NextRequest){
  try{
    const { cnpj, estabId, inicio, fim, marcacoes, politicas, feriados = [], escala = [] } = await req.json()
    if (!cnpj || !estabId || !inicio || !fim) return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 })
    // Build from payload
    const porCpf = new Map<string, any[]>()
    if (Array.isArray(marcacoes)){
      for (const m of marcacoes){
        const cpf = (m.cpf||'').toString()
        if (!porCpf.has(cpf)) porCpf.set(cpf, [])
        porCpf.get(cpf)!.push({ nsr: m.nsr, cpf, dataHoraISO: m.dataHoraISO, origem: m.origem||'online' })
      }
    }
    const jornadas = []
    for (const [cpf, arr] of porCpf.entries()){
      // agrupar por dia
      const byDay = new Map<string, any[]>()
      for (const ev of arr){
        const dia = ev.dataHoraISO.slice(0,10)
        if (!byDay.has(dia)) byDay.set(dia, [])
        byDay.get(dia)!.push(ev)
      }
      const dias = []
      for (const [dia, eventos] of byDay.entries()){
        const tot = computeDay(eventos.map(e=>({ cpf, dataHoraISO: e.dataHoraISO })), politicas||{})
        dias.push({ data: dia, eventos, totais: { horasTrabalhadas: tot.totalMin, horasNoturnas: tot.noturnoMin, extras: tot.extras } })
      }
      jornadas.push({ cpf, dias })
    }
    const model = { estabelecimentoId: estabId, cnpj, periodo: { inicio, fim }, versaoLeiaute: '001', jornadas }
    const { conteudo, nomeOficial } = gerarAEJ(model)

    const signUrl = process.env.NEXT_PUBLIC_SIGN_CADES_URL || 'http://localhost:8080/sign/cades'
    let p7sBase64: string | null = null
    try{
      const res = await fetch(signUrl, { method:'POST', body: Buffer.from(conteudo, 'utf-8') })
      if (res.ok){
        const js = await res.json()
        p7sBase64 = js?.signatureBase64 || null
      }
    }catch(_){}

    const aejBase64 = Buffer.from(conteudo, 'utf-8').toString('base64')
    return NextResponse.json({ ok:true, nomeArquivo: nomeOficial, aejBase64, p7sBase64 })
  }catch(e:any){
    return NextResponse.json({ error: e?.message||String(e) }, { status: 500 })
  }
}
