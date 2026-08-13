# Plano de aperfeicoamento e producao - Ponto Facial

Data da auditoria: 2026-05-22  
Escopo: monorepo `ponto-facial`, PWA Next.js, Firebase Hosting, Firestore, Storage, Functions, reconhecimento facial, offline sync, geofence, admin e esteira de entrega.

## Veredicto executivo

O sistema avancou nos bloqueios P0 de seguranca, na base de qualidade e no primeiro corte de ponto server-side autoritativo, mas ainda nao deve ser considerado 100% pronto para producao ate fechar biometria real/liveness, App Check, testes de rules, E2E e validacao legal/operacional.

Status local atualizado em 2026-05-22:

- `pnpm --filter pwa typecheck` passa.
- `pnpm --filter pwa lint:check` passa, ainda com avisos de divida tecnica.
- `pnpm --filter pwa test` passa com suite inicial real: 2 arquivos, 5 testes.
- `pnpm test:rules` passa com suite inicial de Firestore Rules: 1 arquivo, 7 testes.
- `pnpm --filter pwa exec next build` passa sem `ignoreBuildErrors`/`ignoreDuringBuilds`.
- `pnpm --filter functions build` passa.
- `firebase deploy --only firestore:rules --dry-run` e `firebase deploy --only storage --dry-run` compilam as regras.
- `pnpm audit --prod --audit-level high` passa; restam 8 vulnerabilidades moderadas e 2 baixas para triagem.
- Functions foram alinhadas para Node 22 para remover o aviso de runtime Node.js 20 depreciado.
- PWA ficou preparado para inicializar Firebase App Check quando `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` estiver configurado.
- O build do PWA agora bloqueia chave App Check de exemplo e falha se `ENFORCE_APP_CHECK=true` estiver sem chave publica real.
- Functions callable e HTTP sensiveis ficaram prontas para exigir App Check via `ENFORCE_APP_CHECK=true` persistido em `functions/.env` ou `functions/.env.dbponto-facial`.
- Teste publicado em 2026-05-22 mostrou que passar `ENFORCE_APP_CHECK=true` apenas no PowerShell nao ativou o enforcement em producao.
- Deploy corretivo de `functions,hosting` publicado em 2026-05-22 com `functions/.env` em `ENFORCE_APP_CHECK=false`, removendo a chave App Check de exemplo do build publicado ate haver chave real.
- A worktree segue com muitos artefatos `.next`/`out` e arquivos gerados/sujos que devem ser limpos antes do go-live.

## Equipe de especialistas

| Especialista | Responsabilidade | Foco inicial |
| --- | --- | --- |
| Arquiteto de Software | Consolidar dominio, modularizacao e modelo de dados | Unificar `usuarios/users/employees/funcionarios` e `marcacoes/timeRecords` |
| Especialista Backend/Firebase | Functions, Firestore, Storage, regras e dados | Autorizacao, App Check, regras e criacao server-side do ponto |
| Especialista Frontend/PWA | Next.js, UX, offline, service worker e responsividade | Corrigir gates de build, PWA offline real e fluxos operacionais |
| Especialista Seguranca/LGPD/Biometria | Acesso, dados sensiveis, antifraude e privacidade | Biometria segura, liveness/PAD, logs sem PII e plano LGPD |
| Especialista DevOps/QA | CI/CD, testes, dependencias e deploy | PNPM, CI, audit, testes E2E e ambientes dev/staging/prod |
| Especialista Produto/RH | Regras funcionais de ponto e jornada | Fluxo legal de registro, ajuste, comprovante, AFD/AEJ e auditoria |

## Riscos P0 - corrigir antes de qualquer producao

1. **Qualquer usuario autenticado pode virar admin**  
   `functions/src/index.ts:21` expoe `setAdminClaims` exigindo apenas login. `apps/pwa/public/setup-admin.html:155` chama essa function publicamente.

2. **Admin UI sem validacao real de admin**  
   `apps/pwa/src/app/admin/layout.tsx:12` apenas verifica usuario logado. `apps/pwa/src/app/app/layout.tsx:63` mostra link de administracao para usuarios comuns.

3. **Firestore permite vazamento e fraude de ponto**  
   `firestore.rules:73` e `firestore.rules:81` liberam leitura/criacao de `marcacoes` e `timeRecords` para qualquer autenticado. Isso permite criar ponto para outro usuario e ler registros de todos.

4. **Dados biometricos e PII expostos**  
   `firestore.rules:160` libera `employees` para leitura/criacao por qualquer usuario logado. Essa colecao contem dados de funcionario e `faceEmbedding`.

5. **Functions HTTP sensiveis sem autenticacao**  
   `signAfd`, `signPdf` e `timeRecordWebhook` usam CORS aberto e nao validam token/claim/admin. O webhook pode escrever em `employees` e exportar registros.

6. **Biometria nao confiavel para producao**  
   `apps/pwa/src/lib/face-recognition-optimized.ts:125` retorna face sintetica com confianca fixa para qualquer video/imagem. `FaceAPIProvider.tsx:88` e `:113` retornam pronto mesmo em fallback.

7. **Criptografia biometrica insegura**  
   `apps/pwa/src/lib/encryption.ts:9` usa chave `NEXT_PUBLIC`/default e XOR reversivel. O bundle do cliente expoe a chave.

8. **Registro de ponto confia no cliente**  
   Geofence usa fallback fixo e permite marcacao sem cerca ativa em `useGeofencing.ts:150` e `:244`. A fila offline grava horario/local client-side em `offline-queue.ts`.

9. **Deploy mascara falhas**  
   `apps/pwa/next.config.js:13` ignora erros de ESLint e TypeScript. Isso permite publicar sistema com typecheck falhando.

10. **Rota e esteira inconsistentes**  
    `firebase.json:12` aponta `/api/time/ntp/**` para function `api`, que nao existe. O workflow GitHub usa `npm`, Node 18 e `package-lock`, mas o projeto e PNPM.

## Plano por fases

### Fase 0 - Contencao imediata de risco

Prazo recomendado: 1 a 2 dias.

Estado atual: executada a contencao principal. `setup-admin.html` removido, admin gate passou a exigir custom claim, regras Firestore/Storage foram endurecidas, endpoints sensiveis exigem admin/segredo quando aplicavel e `/api/time/ntp/**` aponta para `timeNtp`.

- Remover `apps/pwa/public/setup-admin.html` do deploy e retirar qualquer referencia do README.
- Desativar ou restringir `setAdminClaims`; se mantida, exigir `request.auth.token.admin === true`, App Check e auditoria.
- Revogar claims admin indevidas no Firebase Auth.
- Bloquear endpoints `signAfd`, `signPdf` e `timeRecordWebhook` ate terem Auth, autorizacao, CORS restrito e validacao de payload.
- Alterar regras emergenciais para impedir leitura global de `timeRecords`, `marcacoes` e `employees`.
- Remover logs com e-mail, coordenadas, candidatos faciais e embeddings.

Critérios de aceite:

- Usuario comum nao acessa `/admin`.
- Usuario comum nao consegue promover admin.
- Usuario comum nao le `employees`, `timeRecords` ou `marcacoes` de terceiros.
- Webhook e assinaturas rejeitam chamadas sem token/segredo valido.

### Fase 1 - Base de qualidade e dependencia

Prazo recomendado: 3 a 5 dias.

Estado atual: base operacional. PNPM esta em versao exata, Next/ESLint foram alinhados, ignores de build foram removidos, typecheck/lint/test/build passam e ha testes unitarios iniciais para embedding e criptografia.

- Corrigir `packageManager` para versao exata de PNPM.
- Remover scripts com `|| true`.
- Corrigir lint para ESLint atual ou alinhar Next/ESLint.
- Corrigir todos os erros de TypeScript do PWA.
- Adicionar testes minimos para hooks e libs criticas.
- Atualizar dependencias vulneraveis: `next`, `jspdf`, `node-forge`, Firebase SDK/Admin/Functions e transientes criticos.
- Unificar lockfile no `pnpm-lock.yaml` raiz.
- Desversionar `.next`, `out`, `tsconfig.tsbuildinfo`, `.vercel`, `Backup` e artefatos gerados.

Critérios de aceite:

- `pnpm install --frozen-lockfile` passa.
- `pnpm --filter pwa typecheck` passa.
- `pnpm --filter pwa lint:check` passa ou e substituido por comando ESLint valido.
- `pnpm --filter pwa test` possui suite real e passa.
- `pnpm audit --prod` sem vulnerabilidades criticas/altas abertas sem justificativa formal.

### Fase 2 - Seguranca Firebase e backend autoritativo

Prazo recomendado: 1 a 2 semanas.

Estado atual: primeira versao de `markPoint` criada em Cloud Functions. A fila offline passou a chamar a callable autenticada, inclusive o helper legado `sync.ts`, o servidor define horario/NSR/hash/origem e grava `timeRecords` + espelho `marcacoes` em transacao idempotente. A Function aceita funcionário identificado por `employees/usuarios` apenas quando vinculado ao Auth por `authUid`/`uid`/`userId` ou e-mail, salvo admin. O servidor tambem recalcula geofence contra cercas ativas e bloqueia ponto sem cerca, fora da area ou com GPS acima de 100m de precisao. As regras Firestore agora bloqueiam `create` direto de `timeRecords`, `marcacoes` e `pointRequests` via SDK cliente, e a callable legada `signTimeRecord` ficou restrita a administradores.

- Reescrever `firestore.rules` com menor privilegio:
  - `create` de ponto apenas para `request.auth.uid`.
  - `read` de ponto apenas dono, admin ou escopo de empresa.
  - Campos permitidos por operacao com `hasOnly`.
  - `empresaId`, `employeeId`, `role` e `admin` imutaveis pelo usuario comum.
- Reescrever `storage.rules`:
  - `allow create` em vez de `write`.
  - Limite de `contentType` e tamanho.
  - Documentos administrativos apenas para admin/RH.
  - Bloqueio de overwrite e paths fora do dono.
- Evoluir callable/HTTP autenticado `markPoint`:
  - servidor define `serverTimestamp`, NSR e auditoria.
  - servidor valida usuario, empresa, jornada, geofence, repeticao, idempotencia e evidencias.
  - cliente nunca grava `marcacoes`/`timeRecords` diretamente.
- Criar testes de regras no Firebase Emulator Suite.
- Habilitar Firebase App Check para Firestore, Storage e Functions.
  - Cliente PWA ja inicializa App Check com reCAPTCHA v3 quando a chave publica estiver no ambiente.
  - Build do PWA bloqueia placeholders como `SUA_CHAVE_PUBLICA_RECAPTCHA_V3`.
  - Functions callable (`markPoint`, `setAdminClaims`, `signTimeRecord`) ja recebem `enforceAppCheck` configuravel no deploy.
  - Endpoints HTTP administrativos/webhook ja validam `X-Firebase-AppCheck` quando `ENFORCE_APP_CHECK=true` e liberam esse header no CORS.
  - Falta configurar App Check no Console/Firebase, persistir as variaveis em `functions/.env` ou `functions/.env.dbponto-facial`, publicar com a chave real e ativar enforcement nos produtos.
  - Smoke test publicado: Hosting responde 200, `markPoint` sem Auth retorna 401 e `getNTPTime` responde 200 com hora NTP.

Critérios de aceite:

- Testes de regras cobrem admin, funcionario, usuario comum e atacante.
- Ponto nao pode ser criado para outro usuario via SDK cliente.
- Registro de ponto e imutavel; ajustes entram em fluxo separado de aprovacao.

### Fase 3 - Biometria, liveness e antifraude

Prazo recomendado: 1 a 3 semanas, dependendo da estrategia de biometria.

- Remover detecção facial sintetica e fallbacks que marcam FaceAPI como pronta sem modelo real.
- Usar modelo/provedor validado com liveness/PAD, desafio randômico e multiplos frames.
- Calibrar thresholds com metricas: falso aceite, falso rejeite, qualidade, iluminacao e ambiguidade.
- Trocar XOR por criptografia real:
  - AES-GCM via WebCrypto apenas para cache local.
  - Chaves sensiveis em Secret Manager/KMS no backend.
  - Rotacao de chaves e segregacao entre PII e templates biometricos.
- Evitar leitura em massa de `faceEmbedding`; identificacao multiusuario deve ser feita por backend seguro ou por desenho que nao exponha templates.
- Implementar revisao manual segura para casos borderline, sem liberar ponto automaticamente.

Critérios de aceite:

- Foto impressa, video em tela e replay sao rejeitados em testes.
- Embeddings nao aparecem em logs, respostas publicas ou leitura de usuario comum.
- Captura facial falha fechado quando modelo/liveness nao estiver pronto.

### Fase 4 - PWA, offline e experiencia operacional

Prazo recomendado: 1 a 2 semanas.

- Recriar service worker com Workbox ou estrategia equivalente:
  - cache de app shell e chunks versionados.
  - pagina offline real.
  - banner de atualizacao.
  - limpeza segura de caches antigos.
- Corrigir background sync hoje desabilitado/mismatched.
- Garantir que o status global conte tambem `timeRecords`, nao apenas a fila legada.
- Fazer sincronizacao manual aguardar conclusao real da fila antes de reportar sucesso.
- Criptografar fila offline no IndexedDB e limitar janela de sincronizacao.
- Assinar eventos offline com chave vinculada ao dispositivo ou WebAuthn quando viavel.
- Geofence deve falhar fechado: sem GPS valido, cerca ativa ou precisao aceitavel, nao marca.
- Persistir no ponto: coordenada, precisao, cerca, decisao e motivo.
- Melhorar UX operacional:
  - status claro de online/offline.
  - ultimo ponto.
  - pendencias de sync.
  - erros acionaveis.
  - admin com filtros, paginacao e estados vazios.
- Corrigir acessibilidade: remover `user-scalable=no`, labels, `aria-label`, foco, dialogos e contraste.

Critérios de aceite:

- PWA instalado funciona offline para telas previstas.
- Sincronizacao nao duplica pontos e nao altera horario servidor.
- Testes E2E cobrem login, cadastro facial, marcação online/offline, geofence e admin.

### Fase 5 - Legal, relatorios, observabilidade e go-live

Prazo recomendado: 1 a 2 semanas.

- Trocar assinatura simulada por CAdES/PAdES real quando houver exigencia legal.
- Validar AFD/AEJ com modelo unico de dados e timestamps consistentes.
- Definir retencao: ponto, fotos, embeddings, logs, comprovantes e auditoria.
- Criar DPIA/RIPD para biometria e documento LGPD:
  - finalidade.
  - base legal.
  - minimizacao.
  - direitos do titular.
  - operador/controlador.
  - incidente e descarte.
- Adicionar observabilidade:
  - Cloud Logging estruturado.
  - alertas para criacao de admin, exportacao, falhas faciais, burst offline e geofence.
  - Error Reporting/Sentry.
- Configurar ambientes `dev`, `staging` e `prod`.
- CI/CD com gates:
  - lint.
  - typecheck.
  - unit/integration.
  - Firebase rules tests.
  - E2E.
  - audit.
  - build PWA/functions.

Critérios de aceite:

- Checklist de go-live assinado tecnicamente e juridicamente.
- Staging validado em dispositivos reais.
- Rollback documentado.
- Backup, retencao e alertas ativos.

## Modernizacao recomendada

- Next.js atual com App Router, React atual e Node LTS alinhado aos requisitos oficiais.
- PNPM com versao exata e workspace limpo.
- Firebase Functions v2 com Auth, App Check, Secret Manager e logs estruturados.
- Firestore rules testadas como contrato de seguranca.
- Workbox para PWA offline.
- Zod para schemas de entrada em Functions e formularios.
- Playwright para E2E mobile/camera/offline.
- Renovate ou Dependabot para atualizacoes continuas.
- CodeQL, secret scanning e audit em CI.
- Passkeys/MFA para administradores.
- RBAC/ABAC por `companyId`, `employeeId`, papel e escopo.

## Backlog priorizado

| Prioridade | Item | Dono | Resultado esperado |
| --- | --- | --- | --- |
| P0 | Remover bootstrap admin publico | Backend/Firebase | Ninguem se promove via app |
| P0 | Regras Firestore emergenciais | Backend/Firebase | Sem leitura/criacao global de ponto/funcionarios |
| P0 | Bloquear Functions HTTP sensiveis | Backend/Firebase | Sem exportacao/escrita anonima |
| P0 | Admin gate por custom claim | Frontend/Security | Usuario comum nao entra nem ve admin |
| P0 | Remover biometria sintetica/fallback permissivo | Biometria | Falha fechado quando modelo nao esta pronto |
| P1 | TypeScript/lint/testes passando | DevOps/QA | Build confiavel sem ignores |
| P1 | Atualizar dependencias vulneraveis | DevOps/QA | Zero criticas/altas conhecidas |
| P1 | Evoluir `markPoint` server-side | Backend/Produto | Geofence/empresa/jornada validadas no servidor, com testes de rules/E2E |
| P1 | Testes de rules no Emulator | QA/Security | Contrato de seguranca automatizado |
| P2 | Workbox/offline robusto | Frontend/PWA | App instalado confiavel |
| P2 | Observabilidade e alertas | DevOps | Incidentes detectaveis |
| P2 | Plano LGPD/DPIA | Security/Produto | Operacao juridicamente sustentavel |

## Checklist final de producao

- [ ] Branch limpa e sincronizada com remoto.
- [ ] Sem artefatos gerados versionados.
- [ ] Um unico lockfile PNPM.
- [ ] Zero P0/P1 abertos.
- [ ] `pnpm install --frozen-lockfile` passa.
- [x] `pnpm --filter pwa typecheck` passa.
- [x] Lint passa sem `|| true` no pacote PWA.
- [x] Testes unitarios iniciais passam.
- [x] Testes Firebase rules iniciais passam.
- [ ] E2E mobile passa em cenarios online/offline.
- [x] `pnpm audit --prod --audit-level high` sem criticas/altas abertas.
- [ ] App Check habilitado e enforce ativo.
- [ ] Regras Firestore/Storage revisadas por menor privilegio.
- [ ] Functions com Auth, autorizacao, CORS restrito e rate limit.
- [ ] Biometria validada com liveness/PAD.
- [ ] Dados biometricos protegidos por desenho seguro e sem logs.
- [ ] AFD/AEJ/comprovantes gerados a partir de dados server-side.
- [ ] Observabilidade, alertas, backup e rollback configurados.
- [ ] Documentacao LGPD e politica de retencao aprovadas.

## Referencias

- Firebase App Check: https://firebase.google.com/docs/app-check
- Firebase Security Rules: https://firebase.google.com/docs/rules
- Validacao de dados em Firebase Security Rules: https://firebase.google.com/docs/rules/data-validation
- Next.js docs: https://nextjs.org/docs
- LGPD - Lei 13.709/2018: https://www.planalto.gov.br/ccivil_03/_Ato2015-2018/2018/Lei/L13709compilado.htm
- Guia ANPD de seguranca da informacao: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte
