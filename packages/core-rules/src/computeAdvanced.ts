// packages/core-rules/src/computeAdvanced.ts
export type Marca = { cpf: string; dataHoraISO: string }
export type Politicas = {
  toleranciaMin?: number
  limiteDiarioMin?: number
  limiteSemanalMin?: number
  noturno?: { inicio: string; fim: string } // '22:00'..'05:00'
  jornadaPadraoMin?: number // expectativa/dia
}
export type Feriado = { data: string } // 'YYYY-MM-DD'
export type EscalaDia = { dow: number; minutosPrevistos: number } // 0=Dom,...6=Sab

function parseHM(s: string){ const [h,m] = s.split(':').map(x=>parseInt(x||'0',10)); return h*60+m }
function inNight(mins:number, start:number, end:number){ return start<=end ? (mins>=start && mins<end) : (mins>=start || mins<end) }
const NIGHT_FACTOR = 60/52.5 // 1.142857...

export function pairDay(marcas: Marca[]){
  const sorted = marcas.slice().sort((a,b)=> a.dataHoraISO.localeCompare(b.dataHoraISO))
  const pares: [string,string][] = []
  for (let i=0;i<sorted.length;i+=2){ const a=sorted[i], b=sorted[i+1]; if (a&&b) pares.push([a.dataHoraISO,b.dataHoraISO]) }
  return pares
}

export function groupBy<T>(arr:T[], key:(t:T)=>string){
  const m = new Map<string,T[]>()
  for (const x of arr){ const k = key(x); if(!m.has(k)) m.set(k,[]); m.get(k)!.push(x) }
  return m
}

export function computeDay(marcas: Marca[], politicas: Politicas){
  const tol = politicas.toleranciaMin ?? 0
  const pairs = pairDay(marcas)
  let total = 0, noturno = 0
  for (const [iniISO, fimISO] of pairs){
    const ini = new Date(iniISO), fim = new Date(fimISO)
    let dur = Math.max(0, Math.round((+fim-+ini)/60000))
    if (dur < tol) dur = 0
    total += dur
    for (let t=+ini; t<+fim; t+=60000){
      const d = new Date(t), m = d.getHours()*60 + d.getMinutes()
      const ns = politicas.noturno ? parseHM(politicas.noturno.inicio) : parseHM('22:00')
      const nf = politicas.noturno ? parseHM(politicas.noturno.fim) : parseHM('05:00')
      if (inNight(m, ns, nf)) noturno++
    }
  }
  const noturnoEq = Math.round(noturno * NIGHT_FACTOR)
  const previsto = politicas.jornadaPadraoMin ?? politicas.limiteDiarioMin ?? 480
  const extras = Math.max(0, total - previsto)
  const banco = total - previsto
  return { totalMin: total, noturnoMin: noturno, noturnoEquivalenteMin: noturnoEq, extrasMin: extras, bancoMin: banco }
}

export function computeWeek(byDate: Map<string, Marca[]>, politicas: Politicas, feriados: Feriado[] = [], escala: EscalaDia[] = []){
  const dias = Array.from(byDate.keys()).sort()
  const resDia: any[] = []
  let semanal = 0, semanalNot = 0, semanalExtra = 0, semanalBanco = 0
  for (const dia of dias){
    const comp = computeDay(byDate.get(dia)!, politicas)
    const dt = new Date(dia+'T00:00:00')
    const dow = dt.getDay()
    const prevEsc = escala.find(e => e.dow===dow)?.minutosPrevistos
    const previsto = prevEsc ?? (politicas.jornadaPadraoMin ?? politicas.limiteDiarioMin ?? 480)
    const feriado = feriados.some(f => f.data===dia)
    const bancoAjust = feriado ? 0 : (comp.totalMin - previsto)
    resDia.push({ dia, ...comp, previstoMin: previsto, feriado })
    semanal += comp.totalMin
    semanalNot += comp.noturnoMin
    semanalExtra += Math.max(0, comp.totalMin - previsto)
    semanalBanco += bancoAjust
  }
  const limiteSemanal = politicas.limiteSemanalMin ?? ( (politicas.limiteDiarioMin ?? 480) * 6 )
  const excedSemanal = Math.max(0, semanal - limiteSemanal)
  return { dias: resDia, semanalMin: semanal, semanalNoturnoMin: semanalNot, semanalExtrasMin: semanalExtra, semanalBancoMin: semanalBanco, excedSemanalMin: excedSemanal }
}
