// packages/core-legal/src/afd671.ts
import { createHash } from 'crypto'

function padN(value: string | number, len: number){ const v = String(value||'').replace(/\D+/g,''); return v.padStart(len, '0').slice(0, len) }
function padA(value: string | number, len: number){ const v = String(value??''); return (v + ' '.repeat(len)).slice(0, len) }

function formatDate(d: Date){ // AAAA-MM-dd
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const day = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}
function formatDH(d: Date, tzOverride?: string){ // AAAA-MM-ddThh:mm:00ZZZZZ
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const day = String(d.getDate()).padStart(2,'0')
  const hh = String(d.getHours()).padStart(2,'0')
  const mm = String(d.getMinutes()).padStart(2,'0')
  // seconds fixed "00"
  let offMin: number
  if (tzOverride && /^[-+]\d{4}$/.test(tzOverride)) {
    const s = tzOverride.startsWith('-') ? -1 : 1
    const hh = parseInt(tzOverride.slice(1,3),10)
    const mm = parseInt(tzOverride.slice(3,5),10)
    offMin = s * (hh*60 + mm)
  } else {
    offMin = -d.getTimezoneOffset() // minutes east of UTC
  }
  const sign = offMin >= 0 ? '+' : '-'
  const abs = Math.abs(offMin)
  const oh = String(Math.floor(abs/60)).padStart(2,'0')
  const om = String(abs%60).padStart(2,'0')
  return `${y}-${m}-${day}T${hh}:${mm}:00${sign}${oh}${om}`
}

// CRC-16 KERMIT (CCITT-TRUE)
export function crc16KermitHex(input: string): string {
  let crc = 0x0000
  for (let i=0; i<input.length; i++){
    crc ^= input.charCodeAt(i)
    for (let j=0; j<8; j++){
      if (crc & 0x0001) crc = (crc >> 1) ^ 0x8408; else crc >>= 1
      crc &= 0xFFFF
    }
  }
  return crc.toString(16).toUpperCase().padStart(4,'0')
}

// Helpers to pad and CRC already exist.

type Registro2 = {
  nsr: number
  dhGravISO: string
  cpfResp: string
  empregadorTipoId: '1'|'2'
  empregadorId: string
  cnoOuCaepf?: string
  razao: string
  localPrestacao: string
}
function buildRegistro2(r: Registro2, tz?: string){
  const campos = [
    padN(r.nsr, 9),                                 // 001-009 NSR
    '2',                                            // 010-010 tipo
    padA(formatDH(new Date(r.dhGravISO), tz), 24),  // 011-034 DH gravação
    padN(r.cpfResp, 14),                            // 035-048 CPF resp
    padN(r.empregadorTipoId, 1),                    // 049-049
    padN(r.empregadorId, 14),                       // 050-063
    padN(r.cnoOuCaepf || '', 14),                   // 064-077
    padA(r.razao, 150),                             // 078-227 Razão Social
    padA(r.localPrestacao, 100),                    // 228-327 Local prestação
  ]
  const base = campos.join('')
  const crc = crc16KermitHex(base)                  // 328-331 CRC
  return base + padA(crc, 4)
}

type Registro4 = {
  nsr: number
  dhAntesISO: string
  dhAjustISO: string
  cpfResp: string
}
function buildRegistro4(r: Registro4, tz?: string){
  const campos = [
    padN(r.nsr, 9),                                 // 001-009 NSR
    '4',                                            // 010-010 tipo
    padA(formatDH(new Date(r.dhAntesISO), tz), 24), // 011-034 DH antes
    padA(formatDH(new Date(r.dhAjustISO), tz), 24), // 035-058 DH ajustada
    padN(r.cpfResp, 11),                            // 059-069 CPF resp
  ]
  const base = campos.join('')
  const crc = crc16KermitHex(base)                  // 070-073 CRC
  return base + padA(crc, 4)
}

type Registro5 = {
  nsr: number
  dhGravISO: string
  operacao: 'I'|'A'|'E'
  cpf: string
  nome: string
  demais: string
  cpfResp: string
}
function buildRegistro5(r: Registro5, tz?: string){
  const campos = [
    padN(r.nsr, 9),                                 // 001-009 NSR
    '5',                                            // 010-010 tipo
    padA(formatDH(new Date(r.dhGravISO), tz), 24),  // 011-034 DH gravação
    padA(r.operacao, 1),                            // 035-035 operação
    padN(r.cpf, 12),                                // 036-047 CPF empregado
    padA(r.nome, 52),                               // 048-099 Nome
    padA(r.demais, 4),                              // 100-103 Demais dados
    padN(r.cpfResp, 11),                            // 104-114 CPF resp
  ]
  const base = campos.join('')
  const crc = crc16KermitHex(base)                  // 115-118 CRC
  return base + padA(crc, 4)
}

type Registro6 = {
  nsr: number
  dhGravISO: string
  tipoEvento: '01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'
}
function buildRegistro6(r: Registro6, tz?: string){
  const campos = [
    padN(r.nsr, 9),                                 // 001-009 NSR
    '6',                                            // 010-010 tipo
    padA(formatDH(new Date(r.dhGravISO), tz), 24),  // 011-034 DH gravação
    padN(r.tipoEvento, 2),                          // 035-036 Tipo evento
  ]
  return campos.join('')                            // sem CRC
}

export type Registro7 = {
  nsr: number
  dataHoraMarcISO: string // ISO string
  cpf: string
  dataHoraGravISO?: string // ISO string (if absent, now)
  coletor?: '01'|'02'|'03'|'04'|'05' // 01 mobile (default)
  offline?: boolean // true => '1'
}

export type AfdHeaderInput = {
  empregadorTipoId: '1'|'2' // 1 CNPJ, 2 CPF
  empregadorId: string // CNPJ/CPF
  cnoOuCaepf?: string // quando existir
  razaoSocial: string
  repTipo: 'P'|'A'|'C' // aqui usamos 'P'
  repIdent: string // P: registro no INPI (17N) | C: num fabricação | A: num acordo
  versaoLeiaute?: '003'
  desenvolvedorTipoId?: '1'|'2' // 1 CNPJ, 2 CPF
  desenvolvedorId?: string // CNPJ/CPF do desenvolvedor
  modeloRepC?: string
}

export type AfdBuildInput = {
  header: AfdHeaderInput
  periodo: { inicio: Date, fim: Date }
  geradoEm?: Date
  registros2?: Registro2[]
  registros4?: Registro4[]
  registros5?: Registro5[]
  registros6?: Registro6[]
  registros7: Registro7[]
  tzOverride?: string
}

function buildHeader(h: AfdHeaderInput, periodo:{inicio:Date,fim:Date}, geradoEm: Date, tz?: string){
  const campos = [
    padN('0', 9),                 // 001-009 "000000000"
    padN(1, 1),                   // 010-010 tipo "1"
    padN(h.empregadorTipoId, 1),  // 011-011
    padN(h.empregadorId, 14),     // 012-025
    padN(h.cnoOuCaepf || '', 14), // 026-039
    padA(h.razaoSocial, 150),     // 040-189
  ]
  // 190-206: número fabricação / acordo / INPI
  campos.push(padN(h.repIdent, 17))
  // 207-216 Data inicial
  campos.push(padA(formatDate(periodo.inicio), 10))
  // 217-226 Data final
  campos.push(padA(formatDate(periodo.fim), 10))
  // 227-250 Data/hora geração
  campos.push(padA(formatDH(geradoEm, tz), 24))
  // 251-253 Versão leiaute "003"
  campos.push(padN(h.versaoLeiaute || '003', 3))
  // 254-254 Tipo id desenvolvedor
  campos.push(padN(h.desenvolvedorTipoId || '1', 1))
  // 255-268 id desenvolvedor
  campos.push(padN(h.desenvolvedorId || '00000000000000', 14))
  // 269-298 modelo REP-C (não se aplica a P) — preencher com espaços
  campos.push(padA(h.modeloRepC || '', 30))
  // 299-302 CRC-16 do registro
  let linhaSemCRC = campos.join('')
  const crc = crc16KermitHex(linhaSemCRC)
  const linha = linhaSemCRC + padA(crc, 4)
  return linha
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf-8')).digest('hex').toUpperCase()
}

function buildRegistro7(r: Registro7, prevHash: string, tz?: string){
  const campos = [
    padN(r.nsr, 9),                        // 001-009 NSR
    '7',                                   // 010-010 tipo '7'
    padA(formatDH(new Date(r.dataHoraMarcISO), tz), 24), // 011-034 DH marcação
    padN(r.cpf, 12),                       // 035-046 CPF (12N)
    padA(formatDH(new Date(r.dataHoraGravISO || new Date().toISOString()), tz), 24), // 047-070 DH gravação
    padN(r.coletor || '01', 2),            // 071-072 coletor (01 mobile)
    padN(r.offline ? '1' : '0', 1),        // 073-073 online '0' / offline '1'
    padA('', 64)                            // 074-137 hash (preencher depois)
  ]
  const baseParaHash = campos.slice(0, 7).join('') + (prevHash || ''.padEnd(64, ' '))
  const hash = sha256Hex(baseParaHash).slice(0,64) // 64 hex
  campos[7] = padA(hash, 64)
  return { linha: campos.join(''), hash }
}

function buildTrailer(cont2:number, cont3:number, cont4:number, cont5:number, cont6:number, cont7:number){
  const campos = [
    padN('999999999', 9), // 001-009
    padN(cont2, 9),       // 010-018
    padN(cont3, 9),       // 019-027
    padN(cont4, 9),       // 028-036
    padN(cont5, 9),       // 037-045
    padN(cont6, 9),       // 046-054
    padN(cont7, 9),       // 055-063
    padN(9, 1),           // 064-064 tipo '9'
  ]
  return campos.join('')
}

export function nomeArquivoAFD(repTipo: 'P'|'A'|'C', repIdent: string, empregadorId: string){
  const idEmp = empregadorId.replace(/\D+/g,'')
  const repId = repIdent.replace(/\D+/g,'')
  const sufixo = repTipo === 'P' ? 'REP_P' : (repTipo === 'A' ? 'REP_A' : 'REP_C')
  return `AFD_${repId}_${idEmp}_${sufixo}.txt`
}

export function montarAFD671(input: AfdBuildInput){
  const { header, periodo } = input
  const geradoEm = input.geradoEm || new Date()
  const linhas: string[] = []
  let cont2=0,cont3=0,cont4=0,cont5=0,cont6=0,cont7=0

  // Tipo 1
linhas.push(buildHeader(header, periodo, geradoEm, input.tzOverride))

// Tipos 2 (opcional)
if (input.registros2 && input.registros2.length){
  for (const r2 of input.registros2){
    linhas.push(buildRegistro2(r2, input.tzOverride)); cont2++
  }
}

// Tipo 4 (opcional)
if (input.registros4 && input.registros4.length){
  for (const r4 of input.registros4){
    linhas.push(buildRegistro4(r4, input.tzOverride)); cont4++
  }
}

// Tipo 5 (opcional)
if (input.registros5 && input.registros5.length){
  for (const r5 of input.registros5){
    linhas.push(buildRegistro5(r5, input.tzOverride)); cont5++
  }
}

// Tipo 6 (opcional)
if (input.registros6 && input.registros6.length){
  for (const r6 of input.registros6){
    linhas.push(buildRegistro6(r6, input.tzOverride)); cont6++
  }
}

// Tipos 7 (REP-P)
let prevHash = ''.padEnd(64, ' ')
const regsOrdenados = input.registros7.slice().sort((a,b)=> a.nsr - b.nsr)
for (const r of regsOrdenados){
  const { linha, hash } = buildRegistro7(r, prevHash, input.tzOverride)
  linhas.push(linha)
  prevHash = hash.padEnd(64, ' ')
  cont7++
}

// Tipo 9 (trailer)
linhas.push(buildTrailer(cont2, cont3, cont4, cont5, cont6, cont7))

  // Assinatura digital (texto literal p/ REP-P)
  linhas.push(padA('ASSINATURA_DIGITAL_EM_ARQUIVO_P7S', 100))

  const conteudo = linhas.join('\r\n') + '\r\n'
  const nome = nomeArquivoAFD('P', header.repIdent, header.empregadorId)
  return { conteudo, nome }
}
