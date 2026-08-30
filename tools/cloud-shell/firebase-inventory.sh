#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="${1:-${GOOGLE_CLOUD_PROJECT:-dbponto-facial}}"
REGION="${REGION:-us-east1}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="firebase-inventory-${PROJECT_ID}-${STAMP}"

mkdir -p "${OUT_DIR}"

log() {
  printf '\n==> %s\n' "$*"
}

run() {
  local name="$1"
  shift
  log "${name}"
  {
    printf '$'
    printf ' %q' "$@"
    printf '\n\n'
    "$@"
  } > "${OUT_DIR}/${name}.txt" 2>&1 || true
}

json() {
  local name="$1"
  shift
  log "${name}"
  {
    printf '$'
    printf ' %q' "$@"
    printf '\n\n'
    "$@"
  } > "${OUT_DIR}/${name}.json" 2>&1 || true
}

access_token() {
  gcloud auth print-access-token 2>/dev/null || true
}

api_get() {
  local name="$1"
  local url="$2"
  local token
  token="$(access_token)"
  log "${name}"
  if [[ -z "${token}" ]]; then
    printf 'Nao foi possivel obter access token.\n' > "${OUT_DIR}/${name}.json"
    return 0
  fi

  {
    printf 'GET %s\n\n' "${url}"
    curl -fsS -H "Authorization: Bearer ${token}" "${url}"
  } > "${OUT_DIR}/${name}.json" 2>&1 || true
}

gcloud config set project "${PROJECT_ID}" >/dev/null

run "00_versions" bash -lc "gcloud --version && printf '\n--- firebase ---\n' && firebase --version || true && printf '\n--- node ---\n' && node --version || true && printf '\n--- pnpm ---\n' && pnpm --version || true"
json "01_project_describe" gcloud projects describe "${PROJECT_ID}" --format=json
run "02_active_config" gcloud config list
json "03_enabled_services" gcloud services list --enabled --project "${PROJECT_ID}" --format=json

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)' 2>/dev/null || true)"
printf '%s\n' "${PROJECT_NUMBER}" > "${OUT_DIR}/project-number.txt"

json "10_firebase_projects" firebase projects:list --json
json "11_firebase_apps" firebase apps:list --project "${PROJECT_ID}" --json
json "12_firebase_hosting_sites" firebase hosting:sites:list --project "${PROJECT_ID}" --json

json "20_firestore_databases" gcloud firestore databases list --project "${PROJECT_ID}" --format=json
json "21_firestore_indexes_composite" gcloud firestore indexes composite list --project "${PROJECT_ID}" --format=json
json "22_firestore_indexes_fields" gcloud firestore indexes fields list --project "${PROJECT_ID}" --format=json
json "23_firestore_operations" gcloud firestore operations list --project "${PROJECT_ID}" --format=json

json "30_storage_buckets" gcloud storage buckets list --project "${PROJECT_ID}" --format=json
run "31_storage_bucket_roots" bash -lc "gcloud storage buckets list --project '${PROJECT_ID}' --format='value(name)' | while read -r bucket; do [ -n \"\$bucket\" ] && echo \"--- gs://\$bucket ---\" && gcloud storage ls \"gs://\$bucket\" || true; done"

json "40_functions_firebase" firebase functions:list --project "${PROJECT_ID}" --json
json "41_functions_gen2" gcloud functions list --gen2 --regions="${REGION}" --project "${PROJECT_ID}" --format=json
json "42_cloud_run_services" gcloud run services list --region="${REGION}" --project "${PROJECT_ID}" --format=json
json "43_cloud_scheduler_jobs" gcloud scheduler jobs list --location="${REGION}" --project "${PROJECT_ID}" --format=json

json "50_secret_names" gcloud secrets list --project "${PROJECT_ID}" --format=json
run "51_secret_versions_metadata" bash -lc "gcloud secrets list --project '${PROJECT_ID}' --format='value(name)' | while read -r secret; do [ -n \"\$secret\" ] && echo \"--- \$secret ---\" && gcloud secrets versions list \"\$secret\" --project '${PROJECT_ID}' --format='table(name,state,createTime,destroyTime)' || true; done"
json "52_service_accounts" gcloud iam service-accounts list --project "${PROJECT_ID}" --format=json

if [[ -n "${PROJECT_NUMBER}" ]]; then
  api_get "60_security_rules_releases" "https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases"
  api_get "61_security_rules_rulesets" "https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets?pageSize=10"
  api_get "70_appcheck_services" "https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT_NUMBER}/services"

  APP_IDS_FILE="${OUT_DIR}/app-ids.txt"
  node -e "const fs=require('fs'); const p='${OUT_DIR}/11_firebase_apps.json'; let raw=fs.readFileSync(p,'utf8'); raw=raw.slice(raw.indexOf('{')); const j=JSON.parse(raw); const apps=(j.result||j.apps||[]); for (const app of apps) console.log(app.appId||app.appInfo?.appId||'');" \
    > "${APP_IDS_FILE}" 2>/dev/null || true

  while read -r app_id; do
    [[ -z "${app_id}" ]] && continue
    safe_app_id="$(printf '%s' "${app_id}" | tr ':/' '__')"
    api_get "71_appcheck_recaptcha_v3_${safe_app_id}" "https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT_NUMBER}/apps/${app_id}/recaptchaV3Config"
    api_get "72_appcheck_recaptcha_enterprise_${safe_app_id}" "https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT_NUMBER}/apps/${app_id}/recaptchaEnterpriseConfig"
    api_get "73_appcheck_debug_tokens_${safe_app_id}" "https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT_NUMBER}/apps/${app_id}/debugTokens"
  done < "${APP_IDS_FILE}"
fi

cat > "${OUT_DIR}/README.txt" <<EOF
Inventario Firebase/GCP do projeto ${PROJECT_ID}
Gerado em ${STAMP}

Nao inclui documentos do Firestore nem payloads de Storage.
Nao inclui valores de secrets, apenas nomes e metadata de versoes.

Antes de compartilhar, revise os arquivos .json/.txt e remova qualquer dado que voce considere sensivel.
EOF

tar -czf "${OUT_DIR}.tar.gz" "${OUT_DIR}"

cat <<EOF

Inventario gerado:
  ${OUT_DIR}/
  ${OUT_DIR}.tar.gz

Para baixar do Cloud Shell:
  cloudshell download ${OUT_DIR}.tar.gz

EOF
