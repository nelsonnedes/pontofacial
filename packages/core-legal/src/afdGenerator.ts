import { crc16KermitHex } from './crc16Kermit'
import type { AFD, Marcacao } from './schemas'
import type { LayoutAFD } from './afdLayout'
import { LayoutMinimo671 } from './afdLayout'

export interface GerarAFDOptions {
  layout?: LayoutAFD
  normalizarCPF?: boolean
  ordenarPorNSR?: boolean
}

function somenteDigitos(v:string){ return (v||'').replace(/\D+/g, '') }

export function gerarAFD(afd: AFD, opts: GerarAFDOptions = {}){
  const layout = opts.layout ?? LayoutMinimo671
  const ctxHeader = { cnpj: somenteDigitos(afd.cnpj), periodo: afd.periodo }
  const header = layout.header.campos.map(c => c.obter(ctxHeader)).join(layout.separador)

  let marcacoes: Marcacao[] = afd.marcacoes.slice()
  if (opts.ordenarPorNSR !== false) {
    marcacoes.sort((a,b)=> (a.nsr||0) - (b.nsr||0))
  }
  const linhas = marcacoes.map(m => {
    const mm = { ...m }
    if (opts.normalizarCPF !== false && mm.cpf) mm.cpf = somenteDigitos(mm.cpf)
    const ctx = { m: mm }
    return layout.linhaMarcacao.campos.map(c => c.obter(ctx)).join(layout.separador)
  })

  const conteudo = [header, ...linhas].join('\n') + '\n'
  const crc16 = crc16KermitHex(conteudo)
  const nomeOficial = `AFD_${ctxHeader.cnpj}_${afd.periodo.inicio}_${afd.periodo.fim}.txt`
  return { conteudo, crc16, nomeOficial }
}
