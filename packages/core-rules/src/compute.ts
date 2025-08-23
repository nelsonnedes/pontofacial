export type Marca = { cpf: string; dataHoraISO: string }
export type Politicas = {
  toleranciaMin?: number
  limiteDiarioMin?: number
  noturno?: { inicio: string; fim: string } // '22:00' a '05:00'
}

function parseHM(s: string){ const [h,m] = s.split(':').map(x=>parseInt(x,10)); return h*60 + (m||0) }
function isNight(mins:number, start:number, end:number){ // window possibly wraps midnight
  if (start <= end) return mins >= start && mins < end
  return mins >= start || mins < end
}

export function pairDay(marcas: Marca[]){
  const sorted = marcas.slice().sort((a,b)=> a.dataHoraISO.localeCompare(b.dataHoraISO))
  const pares: [string,string][] = []
  for (let i=0; i<sorted.length; i+=2){
    const a = sorted[i]; const b = sorted[i+1]
    if (a && b) pares.push([a.dataHoraISO, b.dataHoraISO])
  }
  return pares
}

export function calcDia(marcas: Marca[], politicas: Politicas){
  const pares = pairDay(marcas)
  let totalMin = 0, noturnoMin = 0
  const nightStart = politicas.noturno ? parseHM(politicas.noturno.inicio) : parseHM('22:00')
  const nightEnd = politicas.noturno ? parseHM(politicas.noturno.fim) : parseHM('05:00')
  for (const [iniISO, fimISO] of pares){
    const ini = new Date(iniISO); const fim = new Date(fimISO)
    const durMin = Math.max(0, Math.round((+fim - +ini)/60000))
    totalMin += durMin
    // rough night mins: iterate minute by minute (ok for small ranges)
    for (let t=+ini; t<+fim; t+=60000){
      const d = new Date(t)
      const mins = d.getHours()*60 + d.getMinutes()
      if (isNight(mins, nightStart, nightEnd)) noturnoMin++
    }
  }
  const limite = politicas.limiteDiarioMin ?? 8*60
  const extras = Math.max(0, totalMin - limite)
  return { totalMin, noturnoMin, extras }
}
