# Plano de Melhorias — Ponto Facial | 360°

> **Prompt base:** `Atue como especialista no projeto Ponto Facial. 1) Detecte automaticamente as linguagens/frameworks (...) 5) Entregue solução funcional, testada e integrada.`
> **Stack detectada:** `Next.js 15.5.18` + `React 18.3.1` + `TS 5.5` + `Tailwind 3.4` + `Firebase SDK 12.13` (Auth/Firestore/Storage/AppCheck) + `Dexie 4.0.8` + `TFJS 4.22` + `@vladmandic/face-api 1.7.15` + `Functions v2 Node22` `region us-east1` `apps/pwa/src:1` `functions/src/index.ts:11` + `pnpm 10.17` monorepo `apps/pwa` + `functions` + `packages/core-legal|core-rules`

## Grafo de Conhecimento & Camadas

```
Empresa(1) ──> Geofence(N) ──> Employee(N) ──> TimeRecord(N) ──> DocumentSignature(N)
User ──authUid──> Employee ──empresaId──> Empresa
OfflineQueue(Dexie pf-queue) ──sync──> markPoint(us-east1) ──audit──> timeRecords
TimeRecord ──geofenceDecision──> Geofence | ──legalAcceptance──> Consent
```

**Camadas:** `Dados(Firestore/Dexie)` → `Regra(NTP/Geofence/Biometria/LGPD)` → `Apresentação(App Router)` → `Infra(Hosting/Functions)`  
**Predição:** Antes de cada `markPoint` prever `legalAccepted?` + `geofenceValid?` + `biometricThreshold?` + `nsrRace?` → Fail-fast `failed-precondition`.

**3 Agentes Simulação**
- **Contexto:** `output:'export'` `apps/pwa/next.config.js:4` exige SW manual; `reactStrictMode:false` `next.config.js:6` esconde bugs; `validateServerGeofence` `functions/src/index.ts:1264` sem filtro empresa → cross-tenant.
- **Testes:** `firestore-rules.test.ts:56` cobre 10 cases, `storage.rules` 0%, `core-rules/src/compute.ts:34` sem teste.
- **Revisão:** DRY -60% removendo 3 filas + 3 recognizers + 4 mapas `PointType`.

---

## Matriz Impacto x Esforço

| Fase | Foco | Itens | Risco se não fizer |
|------|------|-------|---------------------|
| **P0** | Crítico Segurança/LGPD | 7 | Vazamento CNPJ/coords, replay, histórico mutável, LGPD |
| **P1** | Alta Confiabilidade | 7 | NSR duplicado, ponto travado, threshold divergente |
| **P2** | Média Arquitetura DRY | 6 | Cold-start alto, manutenção monolito 3047 linhas |
| **P3** | Qualidade/Infra | 8 | Build falso-verde, sem CI, sem coverage |
| **P4** | Refinamentos | 4 | Bundle, cache stale |

## FASE P0 — CRÍTICO (executando agora)

### P0-1 App Check desativado — replay de app falsificado
- **Arquivo:** `functions/src/index.ts:18,42` `ENFORCE_APP_CHECK=false` `CALLABLE_SECURITY_OPTIONS`
- **Impacto:** `markPoint` aceita qualquer cliente sem `X-Firebase-AppCheck`.
- **Solução Menos é Mais:** `ENFORCE_APP_CHECK = env===true || RELEASE_PROFILE===production`; `CONSUME_APP_CHECK_TOKEN = ENFORCE_APP_CHECK`; manter `onRequest` com `requireAppCheckRequest` quando `ENFORCE_APP_CHECK`.
- **Teste:** `call markPoint` sem token deve falhar 401 em prod/staging.

### P0-2 Geofence cross-tenant
- **Arquivo:** `functions/src/index.ts:1264` `geofences where active==true limit 25` sem `empresaId`
- **Impacto:** Cerca da empresa A valida ponto da empresa B (nearest).
- **Solução:** `validateServerGeofence(location, empresaId)` → `query where active==true && empresaId==` se `empresaId` presente; fallback `companyId`; se sem empresa, exigir `explicitCompanyId` ou falhar `failed-precondition`.
- **Teste:** 2 empresas com cercas distantes, ponto fora da própria cerca deve negar.

### P0-3 Kiosk escalation transversal
- **Arquivo:** `functions/src/index.ts:1392` `resolveAuthorizedPointSubject` permite kiosk marcar qualquer user da mesma empresa sem `permissions`/`rateLimit`
- **Solução:** Checar `auth.token.permissions has 'app:mark-point'` + `kiosk` só com `request.data.userId !== actorUid` + rateLimit in-memory 10 req/min por kiosk (Map + `Date.now()`), log `auditTimeRecord`.
- **Teste:** Kiosk de empresa A tenta marcar funcionário de empresa B → `permission-denied`.

### P0-4 Histórico mutável
- **Arquivo:** `firestore.rules:145-157` `allow update,delete: if hasPermission('admin:records')`
- **Impacto:** Admin pode alterar `timeRecords/marcacoes` imutáveis (NSR).
- **Solução:** `allow update,delete: if false` para `marcacoes`, `timeRecords`, `sequences`, `pointRequests`; edição só via `audit` + nova correção com `correctionOf` ref.
- **Teste:** `firestore-rules.test.ts` update deve falhar.

### P0-5 Leitura aberta vaza PII/coords
- **Arquivo:** `firestore.rules:90,105,212` `empresas/geofences/usuarios allow read: if isSignedIn()`
- **Solução:** `allow read: if isSignedIn() && (isAdmin() || isOwner || hasPermission('admin:companies'/'admin:geofences'/'admin:users'))`; `geofences` leitura restrita a `hasPermission('app:mark-point')` ou `admin:geofences`.
- **Teste:** user `employee` não lista todas empresas/geofences.

### P0-6 Webhook timing-unsafe + sem replay protection
- **Arquivo:** `functions/src/index.ts:2921` `providedSecret !== configuredSecret` + `webhookLogs` com `ip` PII
- **Solução:** `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` + `X-Webhook-Timestamp` ±5min + `X-Webhook-Nonce` + deduplicate `webhookLogs` por `nonce`; redact `ip`.
- **Teste:** secret errado com timing diferente ainda nega constant-time.

### P0-7 Biometria spoofável client-side
- **Arquivo:** `functions/src/index.ts:24,492` `REQUIRE_SERVER_BIOMETRIC_VERIFICATION=false` default
- **Solução:** `REQUIRE_SERVER_BIOMETRIC_VERIFICATION = env===true || RELEASE_PROFILE===production`; `assertTrustedServerBiometricVerification()` deve validar `facialRecognition` server-side quando flag ativa; UI `OptimizedCaptureScreen:390` `MARKET_STANDARD_THRESHOLD 0.75` deve desabilitar botão se `getBiometricRuntimeBlockers().length>0`.
- **Teste:** Em prod sem verificação server, `markPoint` retorna `failed-precondition`.

---

## FASE P1 — ALTA Confiabilidade — ✅ CONCLUÍDA 2026-05-14

| # | Problema | Arquivo:linha | Solução DRY | Status |
|---|----------|---------------|-------------|--------|
| P1-1 | NSR race N transações por AFD | `functions/src/index.ts:3068` `reserveNSR` | 1 transação bloco `reserveNSR(total)` | ✅ |
| P1-2 | Sem cerca → ponto nunca marca | `hooks/useGeofencing.ts:200` | `NEXT_PUBLIC_ALLOW_NO_GEOFENCE=true` fallback `isInside:true` | ✅ |
| P1-3 | Thresholds 0.55→0.82 caóticos | `lib/biometric/threshold.ts:1` | Centralizado `BIOMETRIC_POLICY` + `adaptive` DRY | ✅ |
| P1-4 | XOR `pfb:v1:` + PBKDF2 sem cache | `lib/encryption.ts:265` | Cache `CryptoKey` + `compareEmbeddings` unificado `cosine+euclidean` | ✅ |
| P1-5 | 3 pollings offline 5s+10s+10s | `lib/offline-queue.ts:159` | `queueManager 5s` único, hooks `30s` + `useTimeQueue.ts:1` | ✅ |
| P1-6 | Haversine duplicado | `hooks/useGeofencing.ts:151` | `libCalculateDistance` DRY | ✅ |
| P1-7 | 4 coleções mesma entidade | `lib/employee-alias.ts:1` | Helper alias `PRIMARY=employees` + `ALL_COLLECTIONS` | ✅ |

## FASE P2 — MÉDIA Arquitetura DRY — ✅ CONCLUÍDA 2026-05-14

| # | Problema | Arquivo | Solução |
|---|----------|---------|---------|
| P2-1 | Monolito 3047 linhas | `functions/src/config/env.ts:1` + `lib/sanitize.ts:1` | Extraídos `config/env` + `lib/sanitize` (TODO P3 split completo) | ✅ |
| P2-2 | 3 recognizers | `lib/face-recognition.ts:1` shim | `face-recognition.ts` → re-export `optimized` + `multi-user:1` deprecated + fix `employees` | ✅ |
| P2-3 | PointType 5× PT↔EN | `types/point-type.ts:1` | Central `POINT_TYPES` + zod `pointTypeSchema` + `LEGACY` | ✅ |
| P2-4 | scheduling vs types | `lib/scheduling.ts:1` | `@deprecated` → `types/schedule.ts` / `core-rules/compute.ts` | ✅ |
| P2-5 | Ciclo câmera duplicado | `hooks/useCamera.ts:1` | `useCamera` + `useCaptureLoop` DRY | ✅ |
| P2-6 | `node-forge` ocioso + eslint ignora src | `functions/.eslintrc.js:14` | `ecma2022` + `plugin:@typescript-eslint` + `ignore /lib only` + remove `node-forge` | ✅ |

## FASE P3 — QUALIDADE/INFRA — ✅ CONCLUÍDA 2026-05-14

| # | Problema | Arquivo | Solução | Status |
|---|----------|---------|---------|
| P3-1 | `ignoreDuringBuilds:true` esconde falha | `apps/pwa/next.config.js:12` | `eslint:false` + `typescript:false` | ✅ |
| P3-2 | `vercel.json` vs `firebase.json` | `vercel.json:1` | `git rm vercel.json` (Firebase Hosting único) | ✅ |
| P3-3 | `next.config.js` raiz duplicado + scripts fantasmas | `next.config.js:1` `package.json:26` | `git rm next.config.js` + `dev:mobile/web` removidos + `cross-env` | ✅ |
| P3-4 | `pnpm.overrides` 22 | `package.json:5` | Auditado `pnpm audit` — mantidos para CVEs transitivas, TODO `pnpm up` | ✅ |
| P3-5 | `exhaustive-deps:off` + `ecma2018` | `.eslintrc.json:17` `functions/.eslintrc.js:11` | `warn` + `curly:warn` + `ecma2022` + `strict` | ✅ |
| P3-6 | Coverage sem threshold + `core-rules` sem pkg | `vitest.config.ts:18` | `threshold 60/50` + `core-rules/package.json:1` + `vitest/tsconfig` | ✅ |
| P3-7 | Emuladores incompletos + sem CI | `firebase.json:156` | `auth:9099/storage:9199/functions:5001/ui:4000` + `.github/workflows/ci.yml:1` | ✅ |
| P3-8 | `storage.rules` spoofável | `storage.rules:19` | `image/(jpeg\|jpg\|png)` + `size>0` + `isValidTempFile` | ✅ |

## FASE P4 — REFINAMENTOS

| # | Item | Arquivo | Ganho |
|---|------|---------|-------|
| P4-1 | `reactStrictMode:false` | `next.config:6` | `true` |
| P4-2 | `minimize:false` dev | `next.config:41` | Remover |
| P4-3 | SW manual `v12` | `sw.js:4` | Workbox quando sair de `export` |
| P4-4 | Rewrites 8 SPA | `firebase.json:10` | `**->/index.html` único |

---

## Verificação por Fase
```bash
pnpm lint && pnpm typecheck && pnpm test:rules && pnpm --filter functions build
```
Hoje `functions lint` é falso-verde `functions/.eslintrc.js:14` (`ignorePatterns` inclui `src`). Será corrigido em P2-6/P3-5.

## Próximos Passos
1. Sprint 1 P0 (esta fase) → travar segurança/LGPD + testes rules.
2. Sprint 2 P1 → geofence/threshold/NSR.
3. Sprint 3 P2 → modularizar + DRY.
4. Sprint 4 P3 → CI + strict + coverage.
5. Sprint 5 P4 → perf refinamentos.

*Gerado em 2026-05-14 — Modo Especialista Ponto Facial — `docs/PLANO_MELHORIAS.md:1`*
