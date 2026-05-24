# Firebase Production Cloud Shell Runbook

Projeto: `dbponto-facial`
Regiao Functions: `us-east1`
Hosting principal: `pontofacial` (`https://pontofacial.web.app`)

Este runbook usa sempre `--project "$PROJECT_ID"`. No Cloud Shell, `firebase use` so funciona dentro de uma pasta com `firebase.json`; por isso ele nao e necessario para os comandos abaixo.

## Diagnostico do inventario de 2026-05-24

- Firebase Web App ativa: `PontoLink AI`.
- Hosting configurado em `dbponto-facial` e `pontofacial`.
- Firestore em `southamerica-east1`, modo Native, PITR habilitado por 7 dias.
- Firestore delete protection ainda esta desabilitado.
- 14 Cloud Functions v2 Node.js 22 em `us-east1`.
- Functions estao com `ENFORCE_APP_CHECK=true`, mas `CONSUME_APP_CHECK_TOKEN=false`.
- Secret Manager nao estava habilitado no projeto.
- O webhook estava com `TIME_RECORD_WEBHOOK_SECRET` em variavel comum de ambiente. Esse valor deve ser considerado exposto e precisa ser rotacionado.
- `LEGAL_SIGNATURE_PROVIDER_URL` e `LEGAL_SIGNATURE_PROVIDER_API_KEY` nao estavam configurados.
- Firestore Rules e Storage Rules implantadas sao antigas em relacao ao codigo local; e preciso publicar as regras atualizadas.
- App Check API respondeu 403 no inventario; falta permissao para auditar ou configurar via CLI/Console com a conta atual.

## 1. Preparar Cloud Shell

```bash
PROJECT_ID="dbponto-facial"
REGION="us-east1"
gcloud config set project "$PROJECT_ID"
firebase projects:list
```

Se `firebase projects:list` funcionar, a autenticacao da Firebase CLI esta ok. Nao rode `firebase use` fora de uma pasta do projeto.

## 2. Habilitar Secret Manager e rotacionar segredo vazado

```bash
PROJECT_ID="dbponto-facial"
gcloud services enable secretmanager.googleapis.com --project "$PROJECT_ID"

WEBHOOK_SECRET="$(openssl rand -hex 32)"
printf "%s" "$WEBHOOK_SECRET" | firebase functions:secrets:set TIME_RECORD_WEBHOOK_SECRET --project "$PROJECT_ID"

unset WEBHOOK_SECRET
```

Importante: atualize tambem qualquer sistema externo que chama `timeRecordWebhook` para usar o novo header `x-webhook-secret`. Nao reutilize o valor antigo.

Quando houver provedor ICP-Brasil contratado/configurado:

```bash
firebase functions:secrets:set LEGAL_SIGNATURE_PROVIDER_API_KEY --project "$PROJECT_ID"
```

## 3. Configurar variaveis nao secretas das Functions

Use estes valores como base de producao. Ajuste `LEGAL_SIGNATURE_PROVIDER_URL` somente quando o provedor estiver pronto.

No diretorio raiz do repositorio, crie `functions/.env.dbponto-facial` antes do deploy:

```bash
cat > functions/.env.dbponto-facial <<'EOF'
PONTO_FACIAL_RELEASE_PROFILE=production
ENFORCE_APP_CHECK=true
CONSUME_APP_CHECK_TOKEN=false
REQUIRE_LEGAL_ACCEPTANCE_FOR_FACIAL=true
REQUIRE_SERVER_BIOMETRIC_VERIFICATION=true
REQUIRED_PRIVACY_NOTICE_VERSION=2026-05-24-privacy-notice-v1
REQUIRED_BIOMETRIC_NOTICE_VERSION=2026-05-24-biometric-notice-v1
REQUIRED_LEGAL_CONTENT_HASH=2026-05-24-legal-baseline
LEGAL_SIGNATURE_PROVIDER_URL=
LEGAL_SIGNATURE_PROVIDER_TIMEOUT_MS=30000
EOF
```

Esse arquivo fica ignorado pelo Git. Nao coloque chaves, tokens ou segredos nele.

## 4. App Check

No Firebase Console:

1. Abra App Check do projeto `dbponto-facial`.
2. Registre/valide a Web App `PontoLink AI`.
3. Use reCAPTCHA Enterprise ou reCAPTCHA v3 e copie a site key.
4. Ative enforcement para Firestore, Storage e Cloud Functions.
5. Se a auditoria CLI continuar com 403, conceda ao seu usuario a role `Firebase App Check Admin` ou `Firebase App Check Viewer`.

Com permissao adequada, confira servicos App Check:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="user:SEU_EMAIL_GOOGLE" \
  --role="roles/firebaseappcheck.admin"
```

Substitua `SEU_EMAIL_GOOGLE` pelo email logado no Cloud Shell.

## 5. Backup Firestore

Crie bucket dedicado e faca um export manual antes do go-live:

```bash
PROJECT_ID="dbponto-facial"
BACKUP_BUCKET="${PROJECT_ID}-firestore-backups"

gcloud storage buckets create "gs://${BACKUP_BUCKET}" \
  --project "$PROJECT_ID" \
  --location="southamerica-east1" \
  --uniform-bucket-level-access || true

gcloud firestore export "gs://${BACKUP_BUCKET}/manual/$(date -u +%Y%m%dT%H%M%SZ)" \
  --project "$PROJECT_ID"
```

Teste restore primeiro em projeto de staging, nunca direto na producao.

## 6. Deploy apos aplicar o codigo local

No computador local, valide:

```bash
pnpm --filter functions lint
pnpm --filter functions build
pnpm --filter pwa lint:check
pnpm --filter pwa typecheck
pnpm --filter pwa test
```

Depois publique com projeto explicito:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage:rules,functions,hosting:pontofacial --project dbponto-facial
```

Se quiser publicar em etapas:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage:rules --project dbponto-facial
firebase deploy --only functions --project dbponto-facial
firebase deploy --only hosting:pontofacial --project dbponto-facial
```

## 7. Verificacoes depois do deploy

```bash
firebase functions:list --project "$PROJECT_ID"
firebase hosting:sites:list --project "$PROJECT_ID"
gcloud firestore databases describe --database="(default)" --project "$PROJECT_ID"
gcloud services list --enabled --project "$PROJECT_ID" | grep -E "appcheck|secretmanager|firestore|cloudfunctions|run"
```

Confirme que novos inventarios nao exibem valores de `TIME_RECORD_WEBHOOK_SECRET` em ambiente comum.

## Pendencias para producao 100%

- Configurar motor biometrico server/provider real com prova de vida/PAD. O perfil de producao bloqueia biometria local simulada.
- Validar textos juridicos com advogado: termo de uso, aviso de privacidade, aviso/consentimento biometrico, politica interna para funcionarios e retencao/descarte.
- Registrar aceites vigentes de usuarios e funcionarios antes de permitir marcacao facial.
- Contratar/configurar assinatura ICP-Brasil se AFD/PDF assinados forem obrigatorios no seu fluxo.
- Ativar App Check enforcement no Console e auditar permissao 403.
- Rotacionar o segredo do webhook e limpar pacotes de inventario antigos que contenham o valor antigo.
- Testar backup/restore em staging.
- Publicar regras atualizadas, Functions e Hosting.
