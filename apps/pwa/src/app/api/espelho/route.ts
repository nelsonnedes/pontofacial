import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { computeDay } from '../../../../packages/core-rules/src/computeAdvanced'

export async function POST(req: NextRequest){
  try{
    const { userId, mes, marcacoes, politicas, feriados = [] } = await req.json()
    if (!userId || !mes) return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 })

    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595.28, 841.89]) // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const draw = (text:string, x:number, y:number, size=12)=>{
      page.drawText(text, { x, y, size, font, color: rgb(0,0,0) })
    }
    let y = 800
    draw('Espelho de Ponto (MENSAL) — DEMO', 40, y); y -= 24
    draw('Usuário: ' + userId, 40, y); y -= 18
    draw('Mês: ' + mes, 40, y); y -= 24
    draw('--- Lançamentos (exemplo) ---', 40, y); y -= 18
    // Agrupar por dia a partir das marcações do usuário
    const byDay = new Map<string, any[]>()
    if (Array.isArray(marcacoes)){
      for (const m of marcacoes){
        if ((m.userId||m.usuarioId) && (m.userId||m.usuarioId) !== userId) continue
        const dia = (m.dataHoraISO||m.dataHoraTZ||'').slice(0,10)
        if (!dia) continue
        if (!byDay.has(dia)) byDay.set(dia, [])
        byDay.get(dia)!.push({ cpf: m.cpf||'', dataHoraISO: m.dataHoraISO||m.dataHoraTZ })
      }
    }
    const dias = Array.from(byDay.keys()).sort()
    for (const dia of dias){
      const eventos = byDay.get(dia)!
      const tot = computeDay(eventos, politicas||{})
      draw(`${dia}  •  Total: ${tot.totalMin} min  •  Noturno: ${tot.noturnoMin} min  •  Extras: ${tot.extras} min`, 40, y); y -= 16
    }

    const bytes = await pdf.save()
    const pdfBase64 = Buffer.from(bytes).toString('base64')

    // Tenta assinatura PAdES (stub)
    const signUrl = process.env.NEXT_PUBLIC_SIGN_PADES_URL || 'http://localhost:8080/sign/pades'
    let padesBase64: string | null = null
    try{
      const res = await fetch(signUrl, { method:'POST', body: Buffer.from(bytes) })
      if (res.ok){
        const js = await res.json()
        padesBase64 = js?.signatureBase64 || null
      }
    }catch(_){}

    return NextResponse.json({ ok:true, pdfBase64, padesBase64, nomeArquivo: `espelho_${userId}_${mes}.pdf` })
  }catch(e:any){
    return NextResponse.json({ error: e?.message||String(e) }, { status: 500 })
  }
}
