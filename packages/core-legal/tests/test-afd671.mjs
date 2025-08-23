// Simple manual test runner for AFD671
import { montarAFD671 } from '../src/afd671.js'
import { validateAFD671 } from '../src/afdValidator.js'

function iso(day, hm){ return `${day}T${hm}:00-0300` }

const afd = montarAFD671({
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

const out = validateAFD671(afd.conteudo)
console.log('Arquivo:', afd.nome)
console.log('OK?', out.ok)
console.log('Erros:', out.errors)
