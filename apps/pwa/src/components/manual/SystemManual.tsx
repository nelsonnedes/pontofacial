'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  FileCheck2,
  FileText,
  Fingerprint,
  HelpCircle,
  Landmark,
  LockKeyhole,
  MapPin,
  Monitor,
  Settings,
  ShieldCheck,
  Smartphone,
  Users
} from 'lucide-react';
import { AccessRole, useAccessProfile } from '@/hooks/useAccessProfile';

type ManualAudience = 'admin' | 'rh' | 'manager' | 'kiosk' | 'employee' | 'user';

interface ManualExampleField {
  label: string;
  value: string;
  note?: string;
}

interface ManualPreview {
  title: string;
  subtitle: string;
  highlights: string[];
  rows: string[];
}

interface ManualSection {
  id: string;
  title: string;
  subtitle: string;
  route: string;
  icon: typeof BookOpen;
  color: string;
  permissions: string[];
  audiences: ManualAudience[];
  overview: string;
  steps: string[];
  fields: ManualExampleField[];
  desktopPreview: ManualPreview;
  mobilePreview: ManualPreview;
  tips: string[];
  warnings?: string[];
}

const roleLabels: Record<AccessRole, string> = {
  admin: 'Administrador',
  rh: 'RH',
  manager: 'Gestor',
  kiosk: 'Portaria/Kiosk',
  employee: 'Funcionário',
  user: 'Usuário'
};

const officialLegalLinks = [
  {
    label: 'MTE - Registro Eletrônico de Ponto',
    href: 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/fiscalizacao-do-trabalho/rep',
    description: 'Página oficial com Portaria 671, leiautes AFD/AEJ e modelo do Atestado Técnico.'
  },
  {
    label: 'Portaria MTP 671 compilada',
    href: 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/legislacao/portarias-1/portarias-vigentes-3/portaria-no-671-de-8-de-novembro-de-2021-compilada-20-10-2023.pdf/@@download/file',
    description: 'Base normativa para REP-P, comprovante, ARP, AFD, AEJ, espelho e assinatura.'
  },
  {
    label: 'ITI - Certificação Digital ICP-Brasil',
    href: 'https://www.gov.br/iti/pt-br/acesso-a-informacao/perguntas-frequentes/certificacao-digital',
    description: 'Como obter certificado digital e quais passos fazer junto à AC/AR escolhida.'
  },
  {
    label: 'ITI - Autoridades Certificadoras',
    href: 'https://www.gov.br/iti/pt-br/assuntos/icp-brasil/autoridades-certificadoras',
    description: 'Lista oficial de Autoridades Certificadoras e estrutura ICP-Brasil.'
  },
  {
    label: 'VALIDAR ITI',
    href: 'https://validar.iti.gov.br/',
    description: 'Serviço oficial para validar PDF assinado e assinatura destacada .p7s.'
  }
];

const manualSections: ManualSection[] = [
  {
    id: 'app-dashboard',
    title: 'Dashboard do Aplicativo',
    subtitle: 'Resumo diário para quem bate ponto',
    route: '/app',
    icon: Monitor,
    color: 'blue',
    permissions: ['app:dashboard'],
    audiences: ['admin', 'employee', 'user'],
    overview: 'Use esta tela para ver horário atual, último ponto encontrado e situação da fila de sincronização.',
    steps: [
      'Confira o relógio no topo antes de iniciar a marcação.',
      'Verifique o card de último ponto para evitar marcação duplicada.',
      'Quando houver registros pendentes, abra a fila para acompanhar a sincronização.'
    ],
    fields: [
      { label: 'Último ponto', value: '20:32', note: 'Horário do registro mais recente encontrado para o login.' },
      { label: 'Fila Sync', value: '0', note: 'Quando estiver acima de zero, existe registro aguardando envio.' }
    ],
    desktopPreview: {
      title: 'Dashboard',
      subtitle: 'Visão desktop com ações rápidas e cards de status',
      highlights: ['Marcar Ponto', 'Histórico', 'Comprovantes'],
      rows: ['Conexão do dispositivo: Com internet', 'Último ponto: 20:32', 'Fila Sync: 0 pendentes']
    },
    mobilePreview: {
      title: 'Início',
      subtitle: 'Ações em coluna para uso no celular',
      highlights: ['Marcar', 'Comprovantes'],
      rows: ['Relógio no topo', 'Cards empilhados', 'Botões grandes para toque']
    },
    tips: [
      'No celular, deixe a PWA instalada na tela inicial para abrir em tela cheia.',
      'Atualize a página se o último ponto não aparecer após uma marcação recente.'
    ]
  },
  {
    id: 'mark-point',
    title: 'Marcar Ponto',
    subtitle: 'Registro facial com GPS e NSR gerado pelo backend',
    route: '/app/marcar',
    icon: Fingerprint,
    color: 'emerald',
    permissions: ['app:mark-point'],
    audiences: ['admin', 'kiosk', 'employee', 'user'],
    overview: 'Esta é a tela principal da operação. O servidor valida o funcionário, o GPS, a cerca virtual e grava o ponto com NSR.',
    steps: [
      'Escolha o tipo de ponto: entrada, saída ou intervalo.',
      'Permita câmera e localização quando o navegador solicitar.',
      'Centralize o rosto, aguarde a validação facial e confirme o envio.',
      'Considere o ponto definitivo somente quando aparecer processado com NSR.'
    ],
    fields: [
      { label: 'Tipo', value: 'Entrada', note: 'Use o tipo correto para manter a jornada consistente.' },
      { label: 'GPS', value: '-1.613588, -47.487378', note: 'O sistema envia latitude, longitude e precisão.' },
      { label: 'Similaridade facial', value: '88%', note: 'Exemplo de validação real aceita.' },
      { label: 'NSR', value: '5', note: 'Sequência gerada pelo backend após processamento.' }
    ],
    desktopPreview: {
      title: 'Marcação de ponto',
      subtitle: 'Câmera, status facial, GPS e botão de confirmação',
      highlights: ['Entrada', 'Face validada', 'GPS dentro da cerca'],
      rows: ['Funcionário: Nelson N. R. Brito', 'Empresa: JN Ind Com Exportação Ltda', 'Status: Processado']
    },
    mobilePreview: {
      title: 'Marcar',
      subtitle: 'Fluxo vertical com câmera em destaque',
      highlights: ['Rosto centralizado', 'GPS OK'],
      rows: ['Tipo: Entrada', 'Validação: 88%', 'NSR: 5']
    },
    tips: [
      'Boa iluminação reduz falhas de reconhecimento.',
      'Para portaria, use perfil Portaria/Kiosk em vez de conta admin.',
      'Se estiver offline, trate o registro como pendente até a sincronização confirmar.'
    ],
    warnings: [
      'Não use a conta de administrador em aparelho fixo de portaria.',
      'Não considere comprovante legal antes do registro ter NSR e status processado.'
    ]
  },
  {
    id: 'face-verification',
    title: 'Verificação e Cadastro Facial',
    subtitle: 'Identificação do funcionário antes da marcação',
    route: '/app/verificar-face',
    icon: Camera,
    color: 'pink',
    permissions: ['app:face-verification', 'app:face-registration'],
    audiences: ['admin', 'kiosk', 'employee', 'user'],
    overview: 'Use a verificação facial para confirmar a pessoa e, quando permitido, cadastrar ou atualizar a face do funcionário.',
    steps: [
      'Abra a verificação facial em ambiente iluminado.',
      'Mantenha o rosto dentro da moldura até a captura estabilizar.',
      'Quando o funcionário já existir, confirme se o sistema identificou o cadastro correto.',
      'Quando for cadastro inicial, vincule a face ao funcionário correto.'
    ],
    fields: [
      { label: 'Funcionário', value: 'Nelson Nedes do Rosario Brito', note: 'Deve vir do cadastro real de funcionário.' },
      { label: 'Empresa', value: 'JN Ind Com Exportação Ltda', note: 'Vem do vínculo do funcionário.' },
      { label: 'Qualidade mínima', value: 'Boa iluminação e rosto centralizado' }
    ],
    desktopPreview: {
      title: 'Verificação facial',
      subtitle: 'Câmera ao centro com status de identificação',
      highlights: ['Face detectada', 'Funcionário identificado'],
      rows: ['Nome encontrado', 'Empresa vinculada', 'Ação: prosseguir para marcação']
    },
    mobilePreview: {
      title: 'Face',
      subtitle: 'Câmera em tela vertical',
      highlights: ['Olhar para câmera', 'Aguardar confirmação'],
      rows: ['Status: Identificado', 'Similaridade: 88%', 'Próximo: Marcar ponto']
    },
    tips: [
      'Use a face já cadastrada no cadastro do funcionário para evitar duplicidade.',
      'Se a identificação redirecionar para cadastro sem necessidade, revise vínculo do funcionário e embedding facial.'
    ]
  },
  {
    id: 'history',
    title: 'Histórico de Pontos',
    subtitle: 'Consulta operacional de registros',
    route: '/app/historico',
    icon: ClipboardList,
    color: 'green',
    permissions: ['app:history'],
    audiences: ['admin', 'employee', 'user'],
    overview: 'Mostra os registros associados ao usuário ou funcionário vinculado, com datas, tipos e status.',
    steps: [
      'Abra o histórico após a marcação para confirmar se o registro apareceu.',
      'Confira data, hora, tipo e status.',
      'Use os comprovantes quando precisar gerar prévia para conferência.'
    ],
    fields: [
      { label: 'Data/Hora', value: '23/05/2026 às 20:32' },
      { label: 'Tipo', value: 'Entrada' },
      { label: 'Status', value: 'Processado' }
    ],
    desktopPreview: {
      title: 'Histórico',
      subtitle: 'Lista com filtros e registros recentes',
      highlights: ['Hoje', 'Entrada', 'Processado'],
      rows: ['23/05/2026 20:32 - Entrada', 'GPS registrado', 'Face validada']
    },
    mobilePreview: {
      title: 'Histórico',
      subtitle: 'Cards empilhados por data',
      highlights: ['Entrada', 'Saída'],
      rows: ['Registro recente no topo', 'Status visível', 'Detalhes ao tocar']
    },
    tips: [
      'Se um registro novo não aparecer, atualize a página e verifique a fila de sincronização.'
    ]
  },
  {
    id: 'receipts',
    title: 'Comprovantes',
    subtitle: 'Prévia operacional dos registros',
    route: '/app/comprovantes',
    icon: FileText,
    color: 'purple',
    permissions: ['app:receipts'],
    audiences: ['admin', 'employee', 'user'],
    overview: 'Gera prévias operacionais com funcionário, empresa, data, GPS, validação facial, NSR e hash de conferência.',
    steps: [
      'Selecione o registro desejado na lista.',
      'Confira funcionário, empresa, GPS, validação facial e NSR.',
      'Use a prévia PDF para conferência interna.'
    ],
    fields: [
      { label: 'Funcionário', value: 'Nelson Nedes do Rosario Brito' },
      { label: 'Empresa', value: 'JN Ind Com Exportação Ltda' },
      { label: 'NSR', value: '5' },
      { label: 'Status', value: 'Validação confirmada' }
    ],
    desktopPreview: {
      title: 'Comprovantes',
      subtitle: 'Lista de registros e prévia PDF',
      highlights: ['NSR 5', 'Validação confirmada', 'Prévia PDF'],
      rows: ['Funcionário identificado', 'GPS com precisão', 'Hash de verificação']
    },
    mobilePreview: {
      title: 'Comprovante',
      subtitle: 'Registro em card com botão de prévia',
      highlights: ['PDF', 'NSR'],
      rows: ['Funcionário', 'Data/Hora', 'GPS']
    },
    tips: [
      'A prévia operacional ainda não substitui comprovante legal com assinatura backend.',
      'Para emissão oficial, o próximo passo é integrar assinatura digital backend auditável.'
    ],
    warnings: [
      'Não apresente a prévia como documento assinado legalmente enquanto a assinatura ICP-Brasil não estiver integrada.'
    ]
  },
  {
    id: 'companies',
    title: 'Empresas',
    subtitle: 'Cadastro da empresa, CNPJ e localização',
    route: '/admin/empresas',
    icon: Building2,
    color: 'sky',
    permissions: ['admin:companies'],
    audiences: ['admin'],
    overview: 'Cadastre a empresa real que será usada nos funcionários, geofences, registros e relatórios.',
    steps: [
      'Preencha razão social, nome fantasia, CNPJ e status ativo.',
      'Cadastre endereço e coordenadas reais da empresa.',
      'Revise se a empresa ativa aparece nas telas de registros e comprovantes.'
    ],
    fields: [
      { label: 'Razão Social', value: 'JN Ind Com Exportação Ltda' },
      { label: 'CNPJ', value: '00.000.000/0001-00', note: 'Use o CNPJ real da empresa.' },
      { label: 'Coordenadas', value: '-1.613588, -47.487378' },
      { label: 'Status', value: 'Ativa' },
      { label: 'Certificado ICP-Brasil', value: 'e-CNPJ A1 ou A3', note: 'Cadastre apenas metadados seguros; nunca senha, PIN ou PFX.' }
    ],
    desktopPreview: {
      title: 'Gerenciamento de Empresas',
      subtitle: 'Cards de indicadores e formulário de cadastro',
      highlights: ['Empresa ativa', 'GPS válido', 'Funcionários vinculados'],
      rows: ['Razão Social', 'CNPJ', 'Endereço e coordenadas']
    },
    mobilePreview: {
      title: 'Empresas',
      subtitle: 'Formulário em etapas verticais',
      highlights: ['Dados', 'GPS'],
      rows: ['Nome fantasia', 'CNPJ', 'Salvar empresa']
    },
    tips: [
      'A empresa deve existir antes de criar perfil Portaria/Kiosk.',
      'Use coordenadas reais para que a validação de geofence seja confiável.',
      'Se a empresa já possui e-CNPJ A1/A3, registre o tipo no cadastro da empresa para preparar a emissão legal.'
    ]
  },
  {
    id: 'employees',
    title: 'Funcionários',
    subtitle: 'Cadastro canônico do colaborador',
    route: '/admin/funcionarios',
    icon: Users,
    color: 'indigo',
    permissions: ['admin:employees'],
    audiences: ['admin', 'rh'],
    overview: 'O funcionário é o cadastro principal para nome, matrícula, empresa, vínculo facial e histórico de ponto.',
    steps: [
      'Cadastre o funcionário com nome completo, CPF, matrícula, e-mail e empresa.',
      'Mantenha o status ativo para permitir marcações.',
      'Faça ou revise o cadastro facial antes de liberar marcação por reconhecimento.'
    ],
    fields: [
      { label: 'Nome completo', value: 'Nelson Nedes do Rosario Brito' },
      { label: 'E-mail', value: 'nedes1@hotmail.com' },
      { label: 'Matrícula', value: '0005' },
      { label: 'Empresa', value: 'JN Ind Com Exportação Ltda' }
    ],
    desktopPreview: {
      title: 'Funcionários',
      subtitle: 'Tabela com busca, status e ações',
      highlights: ['Ativo', 'Face cadastrada', 'Empresa vinculada'],
      rows: ['Nome e e-mail', 'Matrícula', 'Ações: editar, face, status']
    },
    mobilePreview: {
      title: 'Funcionário',
      subtitle: 'Cards com ações principais',
      highlights: ['Editar', 'Face'],
      rows: ['Nome', 'Empresa', 'Status']
    },
    tips: [
      'Para funcionário sem celular, basta cadastro de funcionário e face; ele pode bater pela portaria.',
      'Para funcionário com celular próprio, crie também um perfil de acesso vinculado.'
    ]
  },
  {
    id: 'access-profiles',
    title: 'Usuários e Perfis',
    subtitle: 'Firebase Auth, claims e vínculos',
    route: '/admin/users',
    icon: ShieldCheck,
    color: 'amber',
    permissions: ['admin:users'],
    audiences: ['admin'],
    overview: 'Crie perfis de acesso sem confundir login com funcionário. O perfil controla permissões; o funcionário controla jornada e biometria.',
    steps: [
      'Clique em Novo Perfil.',
      'Informe e-mail, senha inicial, nome e função no sistema.',
      'Para Portaria/Kiosk, preencha a empresa vinculada.',
      'Para funcionário com celular próprio, informe o ID, matrícula, CPF ou PIS do funcionário.'
    ],
    fields: [
      { label: 'E-mail', value: 'portaria@empresa.com' },
      { label: 'Função', value: 'Portaria/Kiosk' },
      { label: 'Empresa vinculada', value: 'e9bjUTxTnODSXrVoJgEU', note: 'Use o ID da empresa cadastrada.' },
      { label: 'Funcionário vinculado', value: '0005', note: 'Use quando o login for de uma pessoa específica.' }
    ],
    desktopPreview: {
      title: 'Gerenciar Usuários',
      subtitle: 'Lista de perfis e modal seguro',
      highlights: ['Novo Perfil', 'Portaria/Kiosk', 'Claims'],
      rows: ['Perfil admin ativo', 'Fonte: usuarios/users', 'Criar via Cloud Function']
    },
    mobilePreview: {
      title: 'Novo Perfil',
      subtitle: 'Formulário vertical com função e empresa',
      highlights: ['E-mail', 'Função', 'Empresa'],
      rows: ['Senha inicial', 'Portaria/Kiosk', 'Salvar perfil']
    },
    tips: [
      'Não use conta admin em aparelho de portaria.',
      'Use Portaria/Kiosk para celular fixo compartilhado.',
      'Use Funcionário para pessoa com celular próprio.'
    ],
    warnings: [
      'Desativar perfil bloqueia o login, mas preserva histórico.'
    ]
  },
  {
    id: 'geofences',
    title: 'Cercas Virtuais',
    subtitle: 'Área autorizada para marcação',
    route: '/admin/geofences',
    icon: MapPin,
    color: 'rose',
    permissions: ['admin:geofences'],
    audiences: ['admin'],
    overview: 'Configure o ponto geográfico e raio permitido para validar se a batida ocorreu dentro da área autorizada.',
    steps: [
      'Crie uma cerca para a empresa ou local de trabalho.',
      'Informe latitude, longitude e raio em metros.',
      'Teste uma marcação real para confirmar distância e precisão.'
    ],
    fields: [
      { label: 'Nome', value: 'Portaria Principal' },
      { label: 'Latitude', value: '-1.613588' },
      { label: 'Longitude', value: '-47.487378' },
      { label: 'Raio', value: '50m' }
    ],
    desktopPreview: {
      title: 'Cercas Virtuais',
      subtitle: 'Mapa operacional e lista de cercas',
      highlights: ['Ativa', '50m', 'Empresa'],
      rows: ['Portaria Principal', 'Coordenadas reais', 'Validação server-side']
    },
    mobilePreview: {
      title: 'Geofence',
      subtitle: 'Resumo da cerca em card',
      highlights: ['Ativa', 'Raio'],
      rows: ['Latitude', 'Longitude', 'Salvar']
    },
    tips: [
      'Evite raio pequeno demais se o GPS do aparelho oscila.',
      'Use a precisão mostrada no registro para ajustar o raio.'
    ]
  },
  {
    id: 'schedules',
    title: 'Horários e Escalas',
    subtitle: 'Jornada esperada por funcionário',
    route: '/admin/horarios',
    icon: Clock,
    color: 'cyan',
    permissions: ['admin:schedules'],
    audiences: ['admin', 'rh'],
    overview: 'Use horários e escalas para apoiar análise de atrasos, banco de horas e consistência da jornada.',
    steps: [
      'Cadastre a escala padrão da empresa.',
      'Vincule funcionários à escala correta.',
      'Revise feriados e exceções antes de usar relatórios de jornada.'
    ],
    fields: [
      { label: 'Entrada', value: '08:00' },
      { label: 'Intervalo', value: '12:00 - 13:00' },
      { label: 'Saída', value: '18:00' },
      { label: 'Tolerância', value: '10 minutos' }
    ],
    desktopPreview: {
      title: 'Horários',
      subtitle: 'Escalas, tolerância e exceções',
      highlights: ['08:00', '18:00', 'Tolerância'],
      rows: ['Escala comercial', 'Funcionários vinculados', 'Feriados']
    },
    mobilePreview: {
      title: 'Escala',
      subtitle: 'Campos de horário empilhados',
      highlights: ['Entrada', 'Saída'],
      rows: ['Intervalo', 'Tolerância', 'Salvar']
    },
    tips: [
      'Mantenha a escala atualizada antes de analisar atrasos.'
    ]
  },
  {
    id: 'records',
    title: 'Registros e Revisão',
    subtitle: 'Auditoria operacional das marcações',
    route: '/admin/registros',
    icon: ClipboardList,
    color: 'orange',
    permissions: ['admin:records'],
    audiences: ['admin', 'manager', 'rh'],
    overview: 'Tela para conferir funcionário, status, GPS, foto/evidência, Face ID, similaridade e NSR.',
    steps: [
      'Use filtros por data, funcionário, status e tipo.',
      'Abra o registro para revisar evidências.',
      'Confira se funcionário, empresa, GPS e Face ID estão preenchidos.',
      'Aprove somente registros coerentes com a política da empresa.'
    ],
    fields: [
      { label: 'Funcionário', value: 'Nelson Nedes do Rosario Brito' },
      { label: 'Status', value: 'Processado' },
      { label: 'Face ID', value: 'Sim' },
      { label: 'Similaridade', value: '88%' }
    ],
    desktopPreview: {
      title: 'Registros',
      subtitle: 'Tabela com filtros e modal de revisão',
      highlights: ['Funcionário', 'NSR', 'Face ID'],
      rows: ['Entrada 20:32', 'GPS 10m', 'Origem server-mark-point']
    },
    mobilePreview: {
      title: 'Revisão',
      subtitle: 'Detalhes do registro em card',
      highlights: ['88%', 'NSR 5'],
      rows: ['Funcionário', 'Data/Hora', 'Observações']
    },
    tips: [
      'Registros sem funcionário identificado não devem ser tratados como prontos para produção.',
      'Use observações para justificar qualquer revisão manual.'
    ]
  },
  {
    id: 'reports',
    title: 'Relatórios',
    subtitle: 'Prévias operacionais e exportações',
    route: '/admin/reports',
    icon: FileText,
    color: 'slate',
    permissions: ['admin:reports'],
    audiences: ['admin', 'manager', 'rh'],
    overview: 'Use relatórios para conferência operacional de registros, jornada e arquivos de apoio.',
    steps: [
      'Selecione período, empresa e funcionário quando disponível.',
      'Gere a prévia e confira contagem de registros.',
      'Use somente como conferência até a assinatura backend legal estar finalizada.',
      'Administrador deve seguir o processo de regularização legal no rodapé deste manual antes de tratar AFD, AEJ ou Espelho como oficiais.'
    ],
    fields: [
      { label: 'Período', value: '01/05/2026 a 31/05/2026' },
      { label: 'Empresa', value: 'JN Ind Com Exportação Ltda' },
      { label: 'Tipo', value: 'Espelho operacional' }
    ],
    desktopPreview: {
      title: 'Relatórios',
      subtitle: 'Filtros e prévias de exportação',
      highlights: ['Período', 'Empresa', 'Gerar'],
      rows: ['Espelho operacional', 'AFD/AEJ em validação', 'Download interno']
    },
    mobilePreview: {
      title: 'Relatório',
      subtitle: 'Filtros em sequência',
      highlights: ['Período', 'Gerar'],
      rows: ['Empresa', 'Tipo', 'Baixar']
    },
    tips: [
      'Antes de usar relatório como oficial, confirme assinatura backend, dados fiscais completos e Atestado Técnico/Termo de Responsabilidade.'
    ],
    warnings: [
      'AFD/AEJ devem permanecer como prévias até a rotina legal assinada estar concluída.'
    ]
  },
  {
    id: 'settings',
    title: 'Configurações',
    subtitle: 'Parâmetros operacionais do sistema',
    route: '/admin/settings',
    icon: Settings,
    color: 'gray',
    permissions: ['admin:settings'],
    audiences: ['admin'],
    overview: 'Central para parâmetros administrativos. Altere com cautela e valide o efeito na operação.',
    steps: [
      'Revise cada configuração antes de salvar.',
      'Documente mudanças que impactem marcação, geofence ou sincronização.',
      'Faça uma batida assistida após mudanças críticas.'
    ],
    fields: [
      { label: 'Modo offline', value: 'Controlado' },
      { label: 'Geofence', value: 'Obrigatória' },
      { label: 'App Check', value: 'Ativo em produção' }
    ],
    desktopPreview: {
      title: 'Configurações',
      subtitle: 'Toggles e parâmetros administrativos',
      highlights: ['App Check', 'Offline', 'Geofence'],
      rows: ['Salvar configurações', 'Última atualização', 'Responsável']
    },
    mobilePreview: {
      title: 'Config.',
      subtitle: 'Controles em lista',
      highlights: ['Ativo', 'Salvar'],
      rows: ['Modo offline', 'Cercas virtuais', 'Backup']
    },
    tips: [
      'Não altere configuração crítica durante o horário de pico de marcações.'
    ]
  }
];

function colorClasses(color: string) {
  const classes: Record<string, string> = {
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    cyan: 'bg-cyan-50 border-cyan-200 text-cyan-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    gray: 'bg-gray-50 border-gray-200 text-gray-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    pink: 'bg-pink-50 border-pink-200 text-pink-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    rose: 'bg-rose-50 border-rose-200 text-rose-800',
    sky: 'bg-sky-50 border-sky-200 text-sky-800',
    slate: 'bg-slate-50 border-slate-200 text-slate-800'
  };

  return classes[color] || classes.blue;
}

function isSectionAllowed(section: ManualSection, access: ReturnType<typeof useAccessProfile>) {
  if (access.isAdmin) {
    return true;
  }

  if (section.audiences.includes(access.role)) {
    return true;
  }

  return access.hasAnyPermission(section.permissions);
}

function DevicePreview({ preview, mode }: { preview: ManualPreview; mode: 'desktop' | 'mobile' }) {
  if (mode === 'mobile') {
    return (
      <div className="mx-auto w-full max-w-[280px] rounded-[2rem] border border-gray-300 bg-gray-950 p-3 shadow-xl">
        <div className="rounded-[1.5rem] bg-white p-4">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-gray-300" />
          <div className="text-xs font-semibold uppercase text-gray-400">Print mobile</div>
          <h4 className="mt-1 text-lg font-bold text-gray-900">{preview.title}</h4>
          <p className="mt-1 text-xs text-gray-500">{preview.subtitle}</p>
          <div className="mt-4 space-y-2">
            {preview.highlights.map((item) => (
              <div key={item} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {preview.rows.map((row) => (
              <div key={row} className="rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-700">
                {row}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-100 p-3 shadow-xl">
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
          <div className="h-3 w-3 rounded-full bg-green-400" />
          <div className="ml-4 h-7 flex-1 rounded-md bg-gray-100 px-3 py-1 text-xs text-gray-500">
            Print desktop
          </div>
        </div>
        <div className="grid min-h-[280px] grid-cols-[150px_1fr]">
          <div className="border-r border-gray-200 bg-gray-950 p-4 text-white">
            <div className="mb-5 text-sm font-semibold">Ponto Facial</div>
            {preview.highlights.map((item) => (
              <div key={item} className="mb-2 rounded-md bg-white/10 px-3 py-2 text-xs">
                {item}
              </div>
            ))}
          </div>
          <div className="p-5">
            <div className="text-xs font-semibold uppercase text-gray-400">Tela orientativa</div>
            <h4 className="mt-1 text-xl font-bold text-gray-900">{preview.title}</h4>
            <p className="mt-1 text-sm text-gray-500">{preview.subtitle}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {preview.rows.map((row) => (
                <div key={row} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  {row}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResponsiveScreenshot({ section }: { section: ManualSection }) {
  return (
    <div>
      <div className="hidden lg:block">
        <DevicePreview preview={section.desktopPreview} mode="desktop" />
      </div>
      <div className="lg:hidden">
        <DevicePreview preview={section.mobilePreview} mode="mobile" />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
        <Monitor className="hidden h-4 w-4 lg:block" />
        <Smartphone className="h-4 w-4 lg:hidden" />
        <span className="hidden lg:inline">Exibindo print otimizado para computador.</span>
        <span className="lg:hidden">Exibindo print otimizado para celular.</span>
      </div>
    </div>
  );
}

function ScenarioCards({ access }: { access: ReturnType<typeof useAccessProfile> }) {
  const scenarios = [
    {
      id: 'kiosk',
      title: 'Celular fixo na portaria',
      visible: access.isAdmin || access.role === 'kiosk',
      icon: Smartphone,
      steps: [
        'Crie um perfil Portaria/Kiosk em Usuários e Perfis.',
        'Vincule o perfil à empresa correta.',
        'Instale a PWA no celular da portaria e faça login com esse perfil.',
        'Funcionários sem celular batem ponto por reconhecimento facial nesse aparelho.'
      ]
    },
    {
      id: 'employee-mobile',
      title: 'Funcionário com celular próprio',
      visible: access.isAdmin || access.role === 'employee' || access.role === 'user',
      icon: Fingerprint,
      steps: [
        'Admin cadastra funcionário e empresa.',
        'Admin cadastra ou revisa a face do funcionário.',
        'Admin cria perfil Funcionário vinculado ao cadastro.',
        'Funcionário acessa o app no próprio celular e marca ponto com sua face.'
      ]
    },
    {
      id: 'admin-setup',
      title: 'Implantação administrativa',
      visible: access.isAdmin,
      icon: ShieldCheck,
      steps: [
        'Cadastre empresa com CNPJ e coordenadas reais.',
        'Cadastre funcionários e vincule empresa.',
        'Configure cercas virtuais e horários.',
        'Crie perfis de acesso com menor permissão necessária.',
        'Faça uma batida assistida e confira Registros e Comprovantes.'
      ]
    }
  ].filter(scenario => scenario.visible);

  if (scenarios.length === 0) {
    return null;
  }

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {scenarios.map((scenario) => {
        const Icon = scenario.icon;
        return (
          <div key={scenario.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-2 text-blue-700">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-gray-900">{scenario.title}</h3>
            </div>
            <ol className="mt-4 space-y-2 text-sm text-gray-600">
              {scenario.steps.map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </section>
  );
}

function SectionCard({ section }: { section: ManualSection }) {
  const Icon = section.icon;

  return (
    <article id={section.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`rounded-xl border p-3 ${colorClasses(section.color)}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{section.title}</h2>
                <p className="text-sm text-gray-500">{section.subtitle}</p>
              </div>
            </div>
            <Link
              href={section.route}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Abrir tela
            </Link>
          </div>

          <p className="mt-5 text-sm leading-6 text-gray-700">{section.overview}</p>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Como usar</h3>
              <ol className="mt-3 space-y-2 text-sm text-gray-600">
                {section.steps.map((step, index) => (
                  <li key={step} className="flex gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900">Exemplo de preenchimento</h3>
              <div className="mt-3 space-y-2">
                {section.fields.map((field) => (
                  <div key={`${field.label}-${field.value}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-semibold uppercase text-gray-500">{field.label}</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{field.value}</div>
                    {field.note && <div className="mt-1 text-xs text-gray-500">{field.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {section.tips.map((tip) => (
              <div key={tip} className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{tip}</span>
              </div>
            ))}
            {section.warnings?.map((warning) => (
              <div key={warning} className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        </div>

        <ResponsiveScreenshot section={section} />
      </div>
    </article>
  );
}

function LegalProductionGuide() {
  const technicalSteps = [
    'Confirmar com contador, jurídico trabalhista ou consultoria de folha se a operação será REP-P e se há acordo/convenção aplicável.',
    'Completar dados legais no sistema: razão social, CNPJ/CPF, CEI/CAEPF/CNO quando existir, endereço/local de prestação, CPF do trabalhador, matrícula e vínculo de empresa.',
    'Garantir trilha REP-P: NSR por estabelecimento, armazenamento imutável/ARP, hash SHA-256, relógio sincronizado com Hora Legal Brasileira e disponibilidade para marcação on-line/off-line.',
    'Emitir e manter o Atestado Técnico e Termo de Responsabilidade assinado por pessoa física responsável, conforme Portaria 671.',
    'Registrar no cadastro da empresa qual certificado já existe: e-CNPJ A1, e-CNPJ A3 token, e-CNPJ A3 cartão ou provedor ICP-Brasil/HSM.',
    'Quando o certificado estiver no computador do administrador, iniciar o conector local e usar Detectar certificados deste PC em Empresas para preencher titular, CNPJ, emissor, validade e série.',
    'Escolher Autoridade Certificadora/Autoridade de Registro ICP-Brasil apenas se a empresa ainda não tiver certificado adequado ou precisar renovar o atual.',
    'Integrar no backend: PAdES para comprovante/espelho PDF e CAdES detached .p7s para AFD/AEJ, com cadeia de certificados, verificação de revogação e carimbo de tempo quando contratado. A1 costuma permitir automação via cofre/provedor; A3 token/cartão exige estação/dispositivo físico ou provedor compatível.',
    'Validar amostras no VALIDAR ITI, guardar relatório de conformidade e só então trocar os rótulos de prévia operacional para documento assinado.'
  ];

  const ownerSteps = [
    'Informar se a empresa já possui e-CNPJ A1, token A3 ou cartão A3.',
    'No PC onde o certificado estiver instalado ou o token/cartão A3 estiver conectado, rodar cd C:\\ponto-facial && pnpm cert:connector antes de clicar em Detectar certificados deste PC. Use a porta 8765 na tela; se iniciar com PONTO_FACIAL_CERT_PORT=8766, selecione 8766.',
    'Escolher AC/AR ICP-Brasil e fazer validação presencial ou por videoconferência quando precisar emitir ou renovar certificado.',
    'Definir responsável legal/técnico que assinará o Atestado Técnico e Termo de Responsabilidade.',
    'Contratar provedor/HSM de assinatura ou disponibilizar certificado de forma segura, sem entregar chave privada em arquivo comum. Nunca enviar senha, PIN, PFX ou PEM pelo cadastro da empresa.',
    'Validar com contabilidade/jurídico os leiautes AFD/AEJ/Espelho e política de guarda dos documentos.'
  ];

  const implementationSteps = [
    'Ler os metadados do certificado configurados em Empresas para escolher o fluxo correto.',
    'Usar o conector local somente para inventário e preenchimento seguro; a assinatura real deve continuar em provedor/HSM ou estação A3 controlada.',
    'Configurar secrets do provedor de assinatura nas Cloud Functions quando houver provedor/HSM ou A1 em cofre seguro.',
    'Ativar endpoints reais hoje bloqueados: assinatura de AFD, AEJ, comprovante e espelho.',
    'Gerar testes automatizados com arquivo assinado e validação de hash/NSR.',
    'Publicar functions/hosting e fazer batida assistida com emissão oficial validada.'
  ];

  return (
    <section id="regularizacao-legal-rep" className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-semibold text-amber-900">
            <Landmark className="h-4 w-4" />
            Regularização legal da Prévia Operacional
          </div>
          <h2 className="text-2xl font-bold text-gray-950">Como transformar prévias em documentos oficiais assinados</h2>
          <p className="mt-3 text-sm leading-6 text-amber-950">
            Enquanto a assinatura ICP-Brasil não estiver integrada e validada, AFD, AEJ, Espelho e PDF continuam sendo prévias de conferência.
            Este roteiro mostra o que precisa ser feito fora e dentro do sistema para concluir a etapa legal.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-300 bg-white p-4 text-sm text-amber-950">
          <div className="flex items-center gap-2 font-semibold">
            <LockKeyhole className="h-4 w-4" />
            Status atual
          </div>
          <p className="mt-2 leading-6">
            Emissão legal assinada bloqueada por segurança. O cadastro do e-CNPJ A1/A3 prepara a integração, mas o backend não deve publicar documento como assinado sem provedor ICP-Brasil real ou estação A3 controlada.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-white p-5">
          <div className="flex items-center gap-2 font-semibold text-gray-950">
            <FileCheck2 className="h-5 w-5 text-amber-700" />
            Processo completo
          </div>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-gray-700">
            {technicalSteps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-white p-5">
          <div className="flex items-center gap-2 font-semibold text-gray-950">
            <Landmark className="h-5 w-5 text-amber-700" />
            O que depende do administrador
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-700">
            {ownerSteps.map((step) => (
              <li key={step} className="flex gap-2">
                <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-amber-700" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-white p-5">
          <div className="flex items-center gap-2 font-semibold text-gray-950">
            <Settings className="h-5 w-5 text-amber-700" />
            O que entra no sistema depois
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-700">
            {implementationSteps.map((step) => (
              <li key={step} className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">
            Assim que você escolher AC/provedor e tiver o certificado/contrato seguro, a integração técnica pode ser feita sem alterar o fluxo operacional de ponto.
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-white p-5">
        <h3 className="font-semibold text-gray-950">Órgãos, páginas oficiais e validação</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {officialLegalLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-gray-200 p-4 text-sm transition hover:border-amber-300 hover:bg-amber-50"
            >
              <div className="flex items-center justify-between gap-3 font-semibold text-gray-950">
                <span>{link.label}</span>
                <ExternalLink className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-amber-700" />
              </div>
              <p className="mt-2 leading-6 text-gray-600">{link.description}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function AdminManualFooter() {
  return (
    <footer className="rounded-3xl border border-gray-200 bg-gray-950 p-6 text-white shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-amber-300">Fechamento para produção legal</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
            Acesse o roteiro completo para concluir a etapa da Prévia Operacional: órgãos oficiais, certificado ICP-Brasil,
            Atestado Técnico, assinatura PAdES/CAdES e validação no ITI.
          </p>
        </div>
        <a
          href="#regularizacao-legal-rep"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-gray-950 transition hover:bg-amber-300"
        >
          Ver processo legal completo
          <FileCheck2 className="h-4 w-4" />
        </a>
      </div>
    </footer>
  );
}

export default function SystemManual() {
  const access = useAccessProfile();

  if (access.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
          <p className="text-gray-600">Preparando manual conforme suas permissões...</p>
        </div>
      </div>
    );
  }

  const visibleSections = manualSections.filter(section => isSectionAllowed(section, access));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800">
              <BookOpen className="h-4 w-4" />
              Manual inteligente
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Manual do Sistema Ponto Facial</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
              Instruções profissionais para operar o sistema com segurança. O conteúdo abaixo foi filtrado pelo seu perfil:
              <strong className="ml-1 text-gray-900">{roleLabels[access.role]}</strong>.
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">Acesso atual</div>
            <div className="mt-1">{access.email || 'Usuário autenticado'}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(access.isAdmin ? ['Administrador completo'] : access.permissions.slice(0, 4)).map((permission) => (
                <span key={permission} className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">
                  {permission}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <ScenarioCards access={access} />

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-900">
        <div className="flex gap-3">
          <HelpCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h2 className="font-semibold">Sobre os prints deste manual</h2>
            <p className="mt-1 text-sm leading-6">
              Os prints são orientativos e responsivos: em computador aparecem no formato desktop; em celular aparecem no formato vertical/mobile.
              Os exemplos usam dados mascarados ou operacionais conhecidos para ensinar preenchimento sem expor segredos.
            </p>
          </div>
        </div>
      </section>

      {visibleSections.length === 0 ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-gray-400" />
          <h2 className="mt-3 text-xl font-semibold text-gray-900">Nenhuma seção disponível</h2>
          <p className="mt-2 text-sm text-gray-600">
            Seu perfil não possui módulos liberados para exibição no manual.
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          {visibleSections.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}
        </div>
      )}

      {access.isAdmin && (
        <>
          <LegalProductionGuide />
          <AdminManualFooter />
        </>
      )}
    </div>
  );
}
