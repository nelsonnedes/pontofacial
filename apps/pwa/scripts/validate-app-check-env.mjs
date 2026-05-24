import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const isProductionBuild =
  process.env.NODE_ENV === "production" ||
  process.env.npm_lifecycle_event === "prebuild" ||
  process.env.npm_lifecycle_event === "build";

const loadedEnv = {};
const envName = isProductionBuild ? "production" : "development";
const envFiles = [
  ".env",
  `.env.${envName}`,
  envName === "test" ? null : ".env.local",
  `.env.${envName}.local`
].filter(Boolean);

function loadEnvFile(fileName) {
  const filePath = join(process.cwd(), fileName);
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    loadedEnv[key] = value;
  }
}

for (const fileName of envFiles) {
  loadEnvFile(fileName);
}

function getEnv(name) {
  return process.env[name] ?? loadedEnv[name] ?? "";
}

const placeholderFragments = [
  "SUA_CHAVE",
  "YOUR_",
  "PLACEHOLDER"
];

const placeholderValues = new Set([
  "SUA_CHAVE_PUBLICA_RECAPTCHA_V3",
  "YOUR_RECAPTCHA_V3_SITE_KEY",
  "YOUR_APP_CHECK_SITE_KEY"
]);

const siteKey = (
  getEnv("NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY") ||
  getEnv("NEXT_PUBLIC_RECAPTCHA_SITE_KEY") ||
  ""
).trim();
const enforceAppCheck = getEnv("ENFORCE_APP_CHECK") === "true";
const appCheckDebugToken = getEnv("NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN").trim();
const releaseProfile = (
  getEnv("PONTO_FACIAL_RELEASE_PROFILE") ||
  getEnv("NEXT_PUBLIC_PONTO_FACIAL_RELEASE_PROFILE") ||
  ""
).trim().toLowerCase();
const biometricEngine = getEnv("NEXT_PUBLIC_BIOMETRIC_ENGINE").trim().toLowerCase();
const livenessRequired = getEnv("NEXT_PUBLIC_BIOMETRIC_LIVENESS_REQUIRED").trim();
const allowManualLiveness = getEnv("NEXT_PUBLIC_ALLOW_MANUAL_LIVENESS").trim() === "true";
const allowDemoBiometrics = getEnv("NEXT_PUBLIC_ALLOW_BIOMETRIC_DEMO").trim() === "true";
const allowLegacyClientBiometrics = getEnv("NEXT_PUBLIC_ALLOW_LEGACY_CLIENT_BIOMETRICS").trim() === "true";
const clientEncryptionKey = getEnv("NEXT_PUBLIC_ENCRYPTION_KEY").trim();
const requiredAppTermsVersion = getEnv("NEXT_PUBLIC_REQUIRED_APP_TERMS_VERSION").trim();
const requiredPrivacyNoticeVersion = getEnv("NEXT_PUBLIC_REQUIRED_PRIVACY_NOTICE_VERSION").trim();
const requiredBiometricNoticeVersion = getEnv("NEXT_PUBLIC_REQUIRED_BIOMETRIC_NOTICE_VERSION").trim();
const approvedBiometricEngines = new Set(["server", "provider"]);

const isPlaceholder =
  placeholderValues.has(siteKey) ||
  placeholderFragments.some((fragment) => siteKey.toUpperCase().includes(fragment));

if (siteKey && isPlaceholder) {
  console.error(
    "NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY esta com valor de exemplo. Use a chave real do reCAPTCHA v3 ou deixe vazio."
  );
  process.exit(1);
}

if (enforceAppCheck && !siteKey) {
  console.error(
    "ENFORCE_APP_CHECK=true exige NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY com a chave publica real do reCAPTCHA v3."
  );
  process.exit(1);
}

if (siteKey && siteKey.length < 20) {
  console.error("NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY parece curta demais para uma chave reCAPTCHA v3 valida.");
  process.exit(1);
}

if (isProductionBuild && appCheckDebugToken) {
  console.error("NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN nao pode estar configurado em build de producao.");
  process.exit(1);
}

if (releaseProfile === "production") {
  const blockers = [];

  if (!enforceAppCheck) {
    blockers.push("PONTO_FACIAL_RELEASE_PROFILE=production exige ENFORCE_APP_CHECK=true.");
  }

  if (!siteKey) {
    blockers.push("Producao exige NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY real.");
  }

  if (!approvedBiometricEngines.has(biometricEngine)) {
    blockers.push("Producao exige NEXT_PUBLIC_BIOMETRIC_ENGINE=server ou provider.");
  }

  if (livenessRequired !== "true") {
    blockers.push("Producao exige NEXT_PUBLIC_BIOMETRIC_LIVENESS_REQUIRED=true.");
  }

  if (allowManualLiveness) {
    blockers.push("NEXT_PUBLIC_ALLOW_MANUAL_LIVENESS nao pode ser true em producao.");
  }

  if (allowDemoBiometrics) {
    blockers.push("NEXT_PUBLIC_ALLOW_BIOMETRIC_DEMO nao pode ser true em producao.");
  }

  if (allowLegacyClientBiometrics) {
    blockers.push("NEXT_PUBLIC_ALLOW_LEGACY_CLIENT_BIOMETRICS nao pode ser true em producao.");
  }

  if (clientEncryptionKey) {
    blockers.push("NEXT_PUBLIC_ENCRYPTION_KEY nao deve ser usada para biometria em producao.");
  }

  if (!requiredAppTermsVersion || !requiredPrivacyNoticeVersion || !requiredBiometricNoticeVersion) {
    blockers.push("Producao exige versoes legais: app terms, aviso de privacidade e ciencia biometrica.");
  }

  if (blockers.length > 0) {
    console.error(`Build de producao bloqueado:\n- ${blockers.join("\n- ")}`);
    process.exit(1);
  }
}
