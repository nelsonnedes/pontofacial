// packages/core-legal/src/afdValidator.ts
import { crc16KermitHex } from './afd671'
import { createHash } from 'crypto'

function sha256Hex(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'latin1')).digest('hex').toUpperCase()
}

export type ValidationError = { line: number; message: string }
export type ValidationResult = { ok: boolean; errors: ValidationError[] }

// Expected total lengths by type (inclusive of CRC when applicable)
const LEN_BY_TYPE: Record<string, number> = {
  '1': 302,
  '2': 331,
  '3': 50,
  '4': 73,
  '5': 118,
  '6': 36,
  '7': 137,
  '9': 64
}
const SIG_LEN = 100

export function validateAFD671(conteudo: string): ValidationResult {
  const errors: ValidationError[] = []
  const lines = conteudo.replace(/\r?\n$/, '').split(/\r?\n/)

  let prevHash = ''.padEnd(64, ' ')

  lines.forEach((ln, idx) => {
    const lineNo = idx+1
    const tipo = ln.slice(9,10) // position 010-010
    const expectLen = LEN_BY_TYPE[tipo]
    if (expectLen && ln.length !== expectLen){ errors.push({ line: lineNo, message: `Tamanho inválido p/ tipo ${tipo} (esperado ${expectLen}, encontrado ${ln.length})` }) }

    // CRC for 1..5
    if (['1','2','3','4','5'].includes(tipo)){
      const crcField = ln.slice(-4)
      const base = ln.slice(0, -4)
      const crc = crc16KermitHex(base)
      if (crcField.trim().toUpperCase() !== crc){
        errors.push({ line: lineNo, message: `CRC inválido (esperado ${crc}, encontrado ${crcField})` })
      }
    }

    // Type-specific checks
    if (tipo === '7'){
      const hashField = ln.slice(73, 137).trimEnd()
      const baseParaHash = [
        ln.slice(0, 9),   // NSR
        ln.slice(9, 10),  // tipo
        ln.slice(10, 34), // DH marcação
        ln.slice(34, 46), // CPF
        ln.slice(46, 70), // DH gravação
        ln.slice(70, 72), // coletor
        ln.slice(72, 73), // on/off
        prevHash.padEnd(64, ' ')
      ].join('')
      const expect = sha256Hex(baseParaHash).slice(0,64)
      if (hashField !== expect){
        errors.push({ line: lineNo, message: 'Hash SHA-256 inválido no reg. 7' })
      }
      prevHash = expect.padEnd(64, ' ')
    }
  })

// Verify presence of signature line (100A) after trailer if provided
if (lines.length >= 2){
  const last = lines[lines.length-1]
  const prev = lines[lines.length-2]
  const prevType = prev.slice(9,10)
  if (prevType === '9'){
    if (last.length !== SIG_LEN){
      errors.push({ line: lines.length, message: `Assinatura digital com tamanho inválido (esperado ${SIG_LEN}, encontrado ${last.length})` })
    }
  }
}

  return { ok: errors.length === 0, errors }
}
