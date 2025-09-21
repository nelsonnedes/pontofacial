// packages/core-legal/src/schemas.ts

export interface Marcacao {
  nsr: number;
  cpf: string;
  dataHoraISO: string;
  origem?: string;
}

export interface DiaJornada {
  data: string;
  eventos: Marcacao[];
  totais?: {
    horasTrabalhadas: number;
    horasNoturnas: number;
    extras: number;
  };
}

export interface JornadaFuncionario {
  cpf: string;
  dias: DiaJornada[];
}

export interface AEJ {
  cnpj: string;
  estabelecimentoId: string;
  periodo: {
    inicio: string;
    fim: string;
  };
  versaoLeiaute: string;
  jornadas: JornadaFuncionario[];
}

export interface AFDHeader {
  empregadorTipoId: string;
  empregadorId: string;
  cnoOuCaepf: string;
  razaoSocial: string;
  repTipo: string;
  repIdent: string;
  versaoLeiaute: string;
  desenvolvedorTipoId: string;
  desenvolvedorId: string;
}

export interface AFDPeriodo {
  inicio: Date;
  fim: Date;
}

export interface AFDRegistro {
  nsr: number;
  [key: string]: any;
}

export interface AFDData {
  header: AFDHeader;
  periodo: AFDPeriodo;
  geradoEm: Date;
  registros2: AFDRegistro[];
  registros4: AFDRegistro[];
  registros5: AFDRegistro[];
  registros6: AFDRegistro[];
  registros7: AFDRegistro[];
  tzOverride?: string;
}