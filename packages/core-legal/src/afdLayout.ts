/**
 * Layout configurável para geração de AFD.
 * ATENÇÃO: Este layout é mínimo e serve como base. Para homologação,
 * preencha os campos exatos conforme Portaria/Anexos vigentes.
 */
export type Campo = { nome: string; obter: (ctx: any) => string };
export type Registro = { nome: string; campos: Campo[] };
export interface LayoutAFD {
  separador: string;
  header: Registro;
  linhaMarcacao: Registro;
}

export const LayoutMinimo671: LayoutAFD = {
  separador: '|',
  header: {
    nome: 'HEADER',
    campos: [
      { nome: 'tipo', obter: () => 'AFD' },
      { nome: 'versao', obter: () => '001' },
      { nome: 'cnpj', obter: (ctx:any) => ctx.cnpj },
      { nome: 'periodo_inicio', obter: (ctx:any) => ctx.periodo.inicio },
      { nome: 'periodo_fim', obter: (ctx:any) => ctx.periodo.fim },
    ]
  },
  linhaMarcacao: {
    nome: 'MARC',
    campos: [
      { nome: 'nsr', obter: ({m}:any) => String(m.nsr) },
      { nome: 'cpf', obter: ({m}:any) => m.cpf || '' },
      { nome: 'dataHoraISO', obter: ({m}:any) => m.dataHoraISO },
      { nome: 'matricula', obter: ({m}:any) => m.matricula ?? '' },
      { nome: 'origem', obter: ({m}:any) => m.origem ?? 'online' },
      { nome: 'equipamento', obter: ({m}:any) => m.equipamento ?? '' },
    ]
  }
}
