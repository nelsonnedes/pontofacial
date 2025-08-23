import type { AEJ, Marcacao } from './schemas';

const SEP = '|';

export function gerarAEJ(aej: AEJ): { conteudo: string; nomeOficial: string } {
  const header = ['AEJ','001', aej.cnpj, aej.periodo.inicio, aej.periodo.fim].join(SEP);
  const linhas: string[] = [header];
  for (const j of aej.jornadas) {
    for (const d of j.dias) {
      for (const ev of d.eventos) {
        linhas.push([j.cpf, d.data, String(ev.nsr), ev.dataHoraISO, ev.origem ?? 'online'].join(SEP));
      }
    }
  }
  const conteudo = linhas.join('\n') + '\n';
  const nomeOficial = `AEJ_${aej.cnpj}_${aej.periodo.inicio}_${aej.periodo.fim}.txt`;
  return { conteudo, nomeOficial };
}
