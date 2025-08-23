// packages/core-rules/src/holidays.ts
export type Feriado = { data: string, nome?: string }
export function isFeriado(dataISO: string, lista: Feriado[]){
  return lista.some(f => f.data === dataISO.slice(0,10))
}
