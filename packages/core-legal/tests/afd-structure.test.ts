import { describe, it, expect } from 'vitest'
import { montarAFD671, crc16KermitHex } from '../src/afd671'
import { validateAFD671 } from '../src/afdValidator'

function iso(day: string, hm: string){ return `${day}T${hm}:00-0300` }

describe('AFD 671 Builder & Validator', () => {
  it('gera AFD válido com 2,4,5,6,7 e trailer + assinatura', () => {
    const { conteudo, nome } = montarAFD671({
      header: {
        empregadorTipoId: '1',
        empregadorId: '12345678000199',
        cnoOuCaepf: '',
        razaoSocial: 'EMPRESA DEMO LTDA',
        repTipo: 'P',
        repIdent: '12345678901234567',
        versaoLeiaute: '003',
        desenvolvedorTipoId: '1',
        desenvolvedorId: '00000000000000',
      },
      periodo: { inicio: new Date('2025-08-01T00:00:00-03:00'), fim: new Date('2025-08-31T23:59:59-03:00') },
      geradoEm: new Date('2025-08-23T10:00:00-03:00'),
      tzOverride: '-0300',
      registros2: [{
        nsr: 1, dhGravISO: new Date().toISOString(), cpfResp:'00000000000',
        empregadorTipoId:'1', empregadorId:'12345678000199', cnoOuCaepf:'', razao:'EMPRESA DEMO LTDA', localPrestacao:'MATRIZ'
      }],
      registros4: [{
        nsr: 2, dhAntesISO: '2025-08-01T00:00:00-03:00', dhAjustISO: '2025-08-01T00:05:00-03:00', cpfResp:'00000000000'
      }],
      registros5: [{
        nsr: 3, dhGravISO: new Date().toISOString(), operacao:'I', cpf:'12345678901', nome:'COLABORADOR TESTE', demais:'    ', cpfResp:'00000000000'
      }],
      registros6: [{
        nsr: 4, dhGravISO: new Date().toISOString(), tipoEvento:'07'
      }],
      registros7: [
        { nsr: 5, dataHoraMarcISO: iso('2025-08-02','08:00'), cpf:'12345678901', dataHoraGravISO: iso('2025-08-02','08:00'), coletor:'01', offline:false },
        { nsr: 6, dataHoraMarcISO: iso('2025-08-02','12:00'), cpf:'12345678901', dataHoraGravISO: iso('2025-08-02','12:00'), coletor:'01', offline:false },
      ]
    })

    expect(nome).toMatch(/^AFD_\d{17}_\d{14}_REP_P\.txt$/)

    const val = validateAFD671(conteudo)
    expect(val.ok).toBe(true)
    expect(val.errors.length).toBe(0)

    const lines = conteudo.trimEnd().split(/\r?\n/)
    // last two lines: trailer and signature
    expect(lines.at(-1)!.length).toBe(100)
    expect(lines.at(-2)!.slice(9,10)).toBe('9')

    // check CRC of reg 2 line manually
    const reg2 = lines.find(l => l.slice(9,10) === '2')!
    const crcField = reg2.slice(-4).trim()
    const base = reg2.slice(0, -4)
    expect(crcField).toBe(crc16KermitHex(base))
  })

  it('detecta CRC inválido e SHA encadeado inválido', () => {
    const { conteudo } = montarAFD671({
      header: {
        empregadorTipoId: '1',
        empregadorId: '12345678000199',
        cnoOuCaepf: '',
        razaoSocial: 'EMPRESA DEMO LTDA',
        repTipo: 'P',
        repIdent: '12345678901234567',
        versaoLeiaute: '003',
        desenvolvedorTipoId: '1',
        desenvolvedorId: '00000000000000',
      },
      periodo: { inicio: new Date('2025-08-01T00:00:00-03:00'), fim: new Date('2025-08-31T23:59:59-03:00') },
      geradoEm: new Date('2025-08-23T10:00:00-03:00'),
      tzOverride: '-0300',
      registros7: [
        { nsr: 1, dataHoraMarcISO: iso('2025-08-02','08:00'), cpf:'12345678901', dataHoraGravISO: iso('2025-08-02','08:00'), coletor:'01', offline:false },
        { nsr: 2, dataHoraMarcISO: iso('2025-08-02','12:00'), cpf:'12345678901', dataHoraGravISO: iso('2025-08-02','12:00'), coletor:'01', offline:false },
      ]
    })

    const lines = conteudo.trimEnd().split(/\r?\n/)
    // corrompe CRC do header (tipo 1)
    const idx1 = lines.findIndex(l => l.slice(9,10) === '1')
    lines[idx1] = lines[idx1].slice(0,-4) + 'DEAD'

    // corrompe hash da primeira linha 7 (troca um dígito no campo 074-137)
    const i7 = lines.findIndex(l => l.slice(9,10) === '7')
    const l7 = lines[i7]
    const before = l7.slice(0,73)
    const hash = l7.slice(73,137)
    const after = l7.slice(137)
    const tampered = before + hash.replace(/[0-9A-F]/, '0' if False else 'Z') + after
    lines[i7] = tampered

    const broken = lines.join('\r\n') + '\r\n'
    const val = validateAFD671(broken)
    expect(val.ok).toBe(false)
    expect(val.errors.some(e => /CRC inválido/.test(e.message))).toBe(true)
    expect(val.errors.some(e => /Hash SHA-256 inválido/.test(e.message))).toBe(true)
  })
})
