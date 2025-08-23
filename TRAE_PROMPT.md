# TRAE_PROMPT.md — Sistema de Ponto Facial (PWA Minimalista) — Web + Firebase

## Objetivo
Construir uma **PWA independente** de **Ponto Facial** (REP-P + PTRP) usando **Web moderna** com o **mínimo de código possível**, mantendo conformidade com a Portaria 671/2021. Backend **Firebase**. Suporte amplo a Android (Chrome) e iOS (Safari) como **aplicativo instalável**. Design limpo e responsivo. 

---
## Estratégia “mínimo de código”
- **Framework**: Next.js 15 (App Router) para SSR/rotas/API; **Tailwind** para estilo.
- **Câmera/Face**: `MediaDevices.getUserMedia` + **Face API Web (TensorFlow.js)** para detecção/embeddings simples no cliente; fallback para captura + verificação no servidor se necessário.
- **PWA**: Manifest + Service Worker (Workbox) para offline básico (marcação em fila).
- **Assinaturas**: Cloud Functions com **OpenSSL** (CAdES) e **pyHanko** (PAdES).
- **Sem plugins nativos**: priorizar Web APIs; geolocalização via Geolocation API; **IndexedDB** para fila offline (Dexie).

---
## Módulos
- `apps/pwa` (única aplicação Next.js com rotas `/app` (colaborador) e `/admin`).
- `packages/core-legal`, `core-rules`, `core-crypto` (iguais ao RN/Expo, reaproveitados).
- `functions` (assinatura e NTP).

---
## Fluxo funcional (PWA)
1. Autenticação (Firebase) → perfil colaborador/admin.
2. Coleta facial via webcam (Face API Web) + liveness simples (desafio em tela).
3. Captura geo + hora (sincronismo via endpoint `/time/ntp`).
4. Gravar marcação no Firestore; se offline, **fila IndexedDB** (Dexie) e posterior sync.
5. **NSR** sequencial gerado no servidor (Cloud Function transacional).
6. **AFD diário** gerado servidor-side (Next API/Function) + **CAdES**.
7. PTRP: tratamento/AEJ/Espelho no servidor, exibição no `/admin`.
8. **PWA Install** + push notifications (Web Push/FCM).

---
## Tarefas para o Cursor (passo a passo)
1) Criar monorepo com:
   - `apps/pwa` (Next.js)
   - `packages/core-legal`, `core-rules`, `core-crypto`, `ui`
   - `functions` (assinatura e NTP)
2) PWA básica em `apps/pwa`:
   - Configurar Manifest + SW (Workbox).
   - Páginas: `/login`, `/app/marcar`, `/app/comprovantes`, `/admin/*`.
   - Componentes: **CameraPanel**, **LivenessStep**, **GeoBadge**, **QueueStatus**.
   - IndexedDB (Dexie) para fila de marcação offline.
   - Rotas API internas para gerar **AFD**, **AEJ**, **Espelho** (chamando libs `core-*` e endpoints `/sign/*`).
3) Firebase:
   - Auth, Firestore, Storage, Functions, App Check, FCM; regras multitenant.
4) Legal e Regras:
   - `core-legal`: schemas AFD/AEJ, **CRC-16/KERMIT**, nomeação.
   - `core-rules`: CLT parametrizável (tolerância 5/10 min; noturno 52m30s; DSR; feriados; banco de horas).
5) Segurança/LGPD:
   - Guardar **embedding** em vez de imagem bruta quando possível; políticas de privacidade; logs de acesso.
6) Testes/QA:
   - Unitários de AFD/AEJ/CRC; integração de fila offline; geração de PDFs e assinaturas.

---
## Entregáveis
- PWA instalável (Android/iOS).
- AFD/AEJ/Espelho assinados; ATRT/INPI (metadados) documentados.
- Guia de auditoria e exportações.

