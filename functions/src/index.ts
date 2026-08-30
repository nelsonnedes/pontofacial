import { onCall, HttpsError, onRequest, type CallableOptions, type HttpsOptions } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { createSocket } from 'dgram';
import { createHash, timingSafeEqual } from 'crypto';

// Configurar região global
setGlobalOptions({ region: 'us-east1' });

// Inicializar Firebase Admin
admin.initializeApp();

const db = admin.firestore();

// Rate-limit in-memory para kiosk (P0-3) — Menos é Mais: sem dependência externa
const KIOSK_RATE_LIMIT = new Map<string, { count: number; windowStart: number }>();
const KIOSK_RATE_LIMIT_MAX = 10;
const KIOSK_RATE_LIMIT_WINDOW_MS = 60_000;
function checkKioskRateLimit(kioskUid: string): void {
  const now = Date.now();
  const entry = KIOSK_RATE_LIMIT.get(kioskUid);
  if (!entry || now - entry.windowStart > KIOSK_RATE_LIMIT_WINDOW_MS) {
    KIOSK_RATE_LIMIT.set(kioskUid, { count: 1, windowStart: now });
    return;
  }
  if (entry.count >= KIOSK_RATE_LIMIT_MAX) {
    throw new HttpsError("resource-exhausted", "Limite de marcações via portaria atingido (10/min). Aguarde.");
  }
  entry.count++;
}

const RELEASE_PROFILE = (process.env.PONTO_FACIAL_RELEASE_PROFILE || "").toLowerCase();
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === "true" || RELEASE_PROFILE === "production";
const CONSUME_APP_CHECK_TOKEN = process.env.CONSUME_APP_CHECK_TOKEN === "true" || ENFORCE_APP_CHECK;
const REQUIRE_LEGAL_ACCEPTANCE_FOR_FACIAL =
  process.env.REQUIRE_LEGAL_ACCEPTANCE_FOR_FACIAL === "true" ||
  RELEASE_PROFILE === "production";
const REQUIRE_SERVER_BIOMETRIC_VERIFICATION =
  process.env.REQUIRE_SERVER_BIOMETRIC_VERIFICATION === "true" ||
  RELEASE_PROFILE === "production";
const REQUIRED_PRIVACY_NOTICE_VERSION =
  process.env.REQUIRED_PRIVACY_NOTICE_VERSION ||
  process.env.NEXT_PUBLIC_REQUIRED_PRIVACY_NOTICE_VERSION ||
  "2026-05-24-privacy-notice-v1";
const REQUIRED_BIOMETRIC_NOTICE_VERSION =
  process.env.REQUIRED_BIOMETRIC_NOTICE_VERSION ||
  process.env.NEXT_PUBLIC_REQUIRED_BIOMETRIC_NOTICE_VERSION ||
  "2026-05-24-biometric-notice-v1";
const REQUIRED_LEGAL_CONTENT_HASH =
  process.env.REQUIRED_LEGAL_CONTENT_HASH ||
  process.env.NEXT_PUBLIC_REQUIRED_LEGAL_CONTENT_HASH ||
  "2026-05-24-legal-baseline";
const LEGAL_SIGNATURE_PROVIDER_URL = process.env.LEGAL_SIGNATURE_PROVIDER_URL || "";
const LEGAL_SIGNATURE_PROVIDER_TIMEOUT_MS = Number(process.env.LEGAL_SIGNATURE_PROVIDER_TIMEOUT_MS || 30000);
const LEGAL_SIGNATURE_PROVIDER_API_KEY_PARAM = defineSecret("LEGAL_SIGNATURE_PROVIDER_API_KEY");
const TIME_RECORD_WEBHOOK_SECRET_PARAM = defineSecret("TIME_RECORD_WEBHOOK_SECRET");
const CALLABLE_SECURITY_OPTIONS: CallableOptions = {
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: CONSUME_APP_CHECK_TOKEN
};
const LEGAL_SIGNATURE_CALLABLE_OPTIONS: CallableOptions = {
  ...CALLABLE_SECURITY_OPTIONS,
  secrets: [LEGAL_SIGNATURE_PROVIDER_API_KEY_PARAM]
};
const LEGAL_SIGNATURE_REQUEST_OPTIONS: HttpsOptions = {
  secrets: [LEGAL_SIGNATURE_PROVIDER_API_KEY_PARAM]
};
const WEBHOOK_REQUEST_OPTIONS: HttpsOptions = {
  secrets: [TIME_RECORD_WEBHOOK_SECRET_PARAM]
};

function readSecretValue(secret: { value: () => string }, fallbackEnvName: string): string {
  try {
    return secret.value() || process.env[fallbackEnvName] || "";
  } catch {
    return process.env[fallbackEnvName] || "";
  }
}

function getLegalSignatureProviderApiKey(): string {
  return readSecretValue(LEGAL_SIGNATURE_PROVIDER_API_KEY_PARAM, "LEGAL_SIGNATURE_PROVIDER_API_KEY");
}

function getTimeRecordWebhookSecret(): string {
  return readSecretValue(TIME_RECORD_WEBHOOK_SECRET_PARAM, "TIME_RECORD_WEBHOOK_SECRET");
}

type PointType = "entry" | "exit" | "break_start" | "break_end";

const VALID_POINT_TYPES: PointType[] = [
  "entry",
  "exit",
  "break_start",
  "break_end"
];

const LEGACY_POINT_TYPES: Record<PointType, string> = {
  entry: "entrada",
  exit: "saida",
  break_start: "intervalo_inicio",
  break_end: "intervalo_fim"
};

type GeofenceDecision = {
  geofenceId: string;
  name: string;
  radius: number;
  distanceMeters: number;
  accuracy: number;
  empresaId?: string;
  companyId?: string;
  companyName?: string;
};

type PointSubjectProfile = {
  employeeId?: string;
  authUid?: string;
  name?: string;
  email?: string;
  cpf?: string;
  pisPasep?: string;
  matricula?: string;
  dataAdmissao?: string;
  empresaId?: string;
  companyId?: string;
  sourceCollection?: string;
};

type CompanyContext = {
  empresaId?: string;
  companyId?: string;
  companyName?: string;
  empresaNome?: string;
  razaoSocial?: string;
  cnpj?: string;
  source?: string;
};

type LegalCertificateType =
  "none" |
  "ecnpj_a1" |
  "ecnpj_a3_token" |
  "ecnpj_a3_card" |
  "provider_icp";

type LegalIntegrationMode =
  "metadata_only" |
  "a1_secure_backend" |
  "a3_external_workstation" |
  "provider_api";

type LegalSignatureFormat = "cades-detached" | "pades";

type LegalSignatureDocumentType = "afd" | "aej" | "espelho" | "pdf" | "time-record";

type LegalSignatureConfig = {
  enabled: boolean;
  certificateType: LegalCertificateType;
  holderName?: string;
  holderCnpj?: string;
  serialNumber?: string;
  issuer?: string;
  validUntil?: string;
  providerName?: string;
  providerProtocol?: string;
  integrationMode: LegalIntegrationMode;
  notes?: string;
  status?: string;
};

type LegalSignatureReadiness = {
  enabled: boolean;
  certificateType: LegalCertificateType;
  integrationMode: LegalIntegrationMode;
  readyForAutomaticSigning: boolean;
  canCreateExternalJob: boolean;
  supportedFormats: LegalSignatureFormat[];
  blockers: string[];
  warnings: string[];
  actionRequired: string;
};

type LegalSignatureArtifact = {
  fileName: string;
  contentType: string;
  content: Buffer;
  hash: string;
  storagePath?: string;
};

type LegalSignatureRunResult = {
  status: "signed" | "pending_external_signature";
  signatureId?: string;
  jobId?: string;
  signedContent?: Buffer;
  detachedSignature?: Buffer;
  signedContentType?: string;
  detachedSignatureContentType?: string;
  providerRequestId?: string;
  signedAt?: string;
  actionRequired?: string;
};

type AccessRole = "admin" | "rh" | "manager" | "kiosk" | "employee" | "user";

type EmployeeProfileMatch = {
  id: string;
  ref: admin.firestore.DocumentReference;
  data: admin.firestore.DocumentData;
};

type LegalAcceptanceSnapshot = {
  privacyNoticeVersion: string;
  biometricConsentVersion: string;
  legalContentHash: string;
  source: string;
  acceptedByUid?: string;
  status: "accepted";
};

const ACCESS_ROLES: AccessRole[] = ["admin", "rh", "manager", "kiosk", "employee", "user"];

const ROLE_PERMISSION_PRESETS: Record<AccessRole, string[]> = {
  admin: [
    "admin:dashboard",
    "admin:companies",
    "admin:employees",
    "admin:schedules",
    "admin:hr",
    "admin:records",
    "admin:users",
    "admin:geofences",
    "admin:reports",
    "admin:settings",
    "admin:manual",
    "app:dashboard",
    "app:mark-point",
    "app:history",
    "app:face-verification",
    "app:face-registration",
    "app:receipts",
    "app:sync-queue",
    "app:manual"
  ],
  rh: [
    "admin:dashboard",
    "admin:employees",
    "admin:schedules",
    "admin:hr",
    "admin:records",
    "admin:reports",
    "admin:manual",
    "app:dashboard",
    "app:face-verification",
    "app:manual"
  ],
  manager: [
    "admin:dashboard",
    "admin:records",
    "admin:reports",
    "admin:manual",
    "app:dashboard",
    "app:face-verification",
    "app:manual"
  ],
  kiosk: [
    "app:mark-point",
    "app:face-verification",
    "app:manual"
  ],
  employee: [
    "app:dashboard",
    "app:mark-point",
    "app:history",
    "app:receipts",
    "app:face-registration",
    "app:manual"
  ],
  user: [
    "app:dashboard",
    "app:mark-point",
    "app:history",
    "app:receipts",
    "app:manual"
  ]
};

const ALLOWED_PROFILE_PERMISSIONS = new Set(
  Object.values(ROLE_PERMISSION_PRESETS).flat()
);

const DEFAULT_ALLOWED_ORIGINS = [
  "https://dbponto-facial.web.app",
  "https://dbponto-facial.firebaseapp.com",
  "https://pontofacial.web.app",
  "https://pontofacial.firebaseapp.com",
  "http://localhost:3000",
  "http://localhost:3001"
];

function getAllowedOrigins(): string[] {
  const configured = process.env.ALLOWED_ORIGINS || "";
  const extraOrigins = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...DEFAULT_ALLOWED_ORIGINS, ...extraOrigins];
}

function setCorsHeaders(req: any, res: any, methods = "GET, POST, OPTIONS"): void {
  const origin = req.headers.origin;
  if (origin && getAllowedOrigins().includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }

  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", methods);
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck, X-Webhook-Secret, X-Webhook-Timestamp, X-Webhook-Nonce");
}

function handleCorsPreflight(req: any, res: any, methods = "GET, POST, OPTIONS"): boolean {
  setCorsHeaders(req, res, methods);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }

  return false;
}

function getBearerToken(req: any): string | null {
  const authorization = req.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

async function requireAdminRequest(req: any): Promise<admin.auth.DecodedIdToken> {
  await requireAppCheckRequest(req);

  const token = getBearerToken(req);

  if (!token) {
    throw new HttpsError("unauthenticated", "Token de autenticação obrigatório");
  }

  const decodedToken = await admin.auth().verifyIdToken(token);
  if (decodedToken.admin !== true) {
    throw new HttpsError("permission-denied", "Acesso restrito a administradores");
  }

  return decodedToken;
}

async function requireAppCheckRequest(req: any): Promise<void> {
  if (!ENFORCE_APP_CHECK) {
    return;
  }

  const token = req.headers["x-firebase-appcheck"];
  if (typeof token !== "string" || !token) {
    throw new HttpsError("unauthenticated", "Token App Check obrigatório");
  }

  try {
    await admin.appCheck().verifyToken(token, {
      consume: CONSUME_APP_CHECK_TOKEN
    });
  } catch (error) {
    console.warn("App Check inválido:", error);
    throw new HttpsError("permission-denied", "Token App Check inválido");
  }
}

function sendHttpsError(res: any, error: unknown): void {
  if (error instanceof HttpsError) {
    const statusByCode: Record<string, number> = {
      unauthenticated: 401,
      "permission-denied": 403,
      "invalid-argument": 400,
      "failed-precondition": 412,
      "not-found": 404,
      "unimplemented": 501
    };

    res.status(statusByCode[error.code] || 500).json({
      success: false,
      error: error.message,
      ...(error.details ? { details: error.details } : {})
    });
    return;
  }

  console.error("Erro inesperado:", error);
  res.status(500).json({
    success: false,
    error: "Erro interno do servidor"
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeText(value: unknown, maxLength = 200): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function sanitizeScalarText(value: unknown, maxLength = 200): string | undefined {
  if (typeof value === "string") {
    return sanitizeText(value, maxLength);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim().slice(0, maxLength) || undefined;
  }

  return undefined;
}

function readTextField(
  data: Record<string, unknown>,
  fields: string[],
  maxLength = 200
): string | undefined {
  for (const field of fields) {
    const value = sanitizeScalarText(data[field], maxLength);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function readLegalMap(data: admin.firestore.DocumentData | undefined): Record<string, unknown> {
  const legal = data?.legal;
  return isPlainObject(legal) ? legal : {};
}

function hasRequiredFacialLegalAcceptance(legal: Record<string, unknown>): boolean {
  const status = sanitizeScalarText(legal.biometricConsentStatus, 80);
  const biometricVersion = sanitizeScalarText(legal.biometricConsentVersion, 160);
  const privacyVersion = sanitizeScalarText(legal.privacyNoticeVersion, 160);
  const revokedAt = legal.biometricConsentRevokedAt;

  return status === "accepted" &&
    biometricVersion === REQUIRED_BIOMETRIC_NOTICE_VERSION &&
    privacyVersion === REQUIRED_PRIVACY_NOTICE_VERSION &&
    !revokedAt;
}

async function requireFacialLegalAcceptance(
  employeeId: string,
  authUid?: string
): Promise<LegalAcceptanceSnapshot | null> {
  if (!REQUIRE_LEGAL_ACCEPTANCE_FOR_FACIAL) {
    return null;
  }

  const refs: admin.firestore.DocumentReference[] = [
    db.collection("employees").doc(employeeId)
  ];

  if (authUid) {
    refs.push(db.collection("users").doc(authUid));
    refs.push(db.collection("usuarios").doc(authUid));
  }

  const snapshots = await Promise.all(refs.map((ref) => ref.get()));

  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      continue;
    }

    const legal = readLegalMap(snapshot.data());
    if (hasRequiredFacialLegalAcceptance(legal)) {
      return {
        privacyNoticeVersion: REQUIRED_PRIVACY_NOTICE_VERSION,
        biometricConsentVersion: REQUIRED_BIOMETRIC_NOTICE_VERSION,
        legalContentHash: sanitizeScalarText(legal.legalContentHash, 160) ||
          REQUIRED_LEGAL_CONTENT_HASH,
        source: snapshot.ref.path,
        acceptedByUid: sanitizeScalarText(legal.biometricConsentAcceptedByUid, 128),
        status: "accepted"
      };
    }
  }

  throw new HttpsError(
    "failed-precondition",
    "Aceite LGPD/biometrico vigente nao encontrado para este funcionario"
  );
}

function assertTrustedServerBiometricVerification(): void {
  if (!REQUIRE_SERVER_BIOMETRIC_VERIFICATION) {
    return;
  }

  throw new HttpsError(
    "failed-precondition",
    "Verificacao biometrica server/provider e obrigatoria em producao e ainda nao esta configurada para markPoint"
  );
}

function sanitizeRequiredEmail(value: unknown): string {
  const email = sanitizeText(value, 320)?.toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !emailPattern.test(email)) {
    throw new HttpsError("invalid-argument", "E-mail válido é obrigatório");
  }

  return email;
}

function sanitizePassword(value: unknown, required: boolean): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    if (required) {
      throw new HttpsError("invalid-argument", "Senha é obrigatória");
    }

    return undefined;
  }

  if (value.length < 6) {
    throw new HttpsError("invalid-argument", "Senha deve ter pelo menos 6 caracteres");
  }

  return value;
}

function sanitizeAccessRole(value: unknown): AccessRole {
  const role = sanitizeText(value, 40) as AccessRole | undefined;
  if (role && ACCESS_ROLES.includes(role)) {
    return role;
  }

  return "employee";
}

function sanitizePermissions(value: unknown, role: AccessRole): string[] {
  if (!Array.isArray(value)) {
    return ROLE_PERMISSION_PRESETS[role];
  }

  const permissions = value
    .map((entry) => sanitizeText(entry, 80))
    .filter((entry): entry is string => Boolean(entry))
    .filter((entry) => ALLOWED_PROFILE_PERMISSIONS.has(entry));

  return permissions.length > 0 ? [...new Set(permissions)] : ROLE_PERMISSION_PRESETS[role];
}

function sanitizeProfileBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function buildProfileClaims(
  existingClaims: Record<string, unknown> | undefined,
  role: AccessRole,
  permissions: string[],
  isActive: boolean,
  employeeId?: string,
  empresaId?: string
): Record<string, unknown> {
  const claims: Record<string, unknown> = {
    ...(existingClaims || {}),
    admin: role === "admin" && isActive,
    kiosk: role === "kiosk" && isActive,
    role,
    permissions,
    active: isActive
  };

  if (employeeId) {
    claims.employeeId = employeeId;
  } else {
    delete claims.employeeId;
  }

  if (empresaId) {
    claims.empresaId = empresaId;
    claims.companyId = empresaId;
  } else {
    delete claims.empresaId;
    delete claims.companyId;
  }

  return claims;
}

async function findEmployeeByField(
  field: string,
  value: string
): Promise<EmployeeProfileMatch | null> {
  const snapshot = await db
    .collection("employees")
    .where(field, "==", value)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const document = snapshot.docs[0];
  return {
    id: document.id,
    ref: document.ref,
    data: document.data()
  };
}

async function resolveEmployeeForProfile(
  employeeReference: string | undefined,
  email: string
): Promise<EmployeeProfileMatch | null> {
  if (employeeReference) {
    const directRef = db.collection("employees").doc(employeeReference);
    const directDoc = await directRef.get();
    if (directDoc.exists) {
      return {
        id: directDoc.id,
        ref: directDoc.ref,
        data: directDoc.data() || {}
      };
    }

    for (const field of ["matricula", "employeeId", "funcionarioId", "cpf", "pisPasep"]) {
      const match = await findEmployeeByField(field, employeeReference);
      if (match) {
        return match;
      }
    }

    throw new HttpsError(
      "failed-precondition",
      "Funcionário informado não foi encontrado em employees"
    );
  }

  for (const field of ["email", "emailCorporativo", "employeeEmail"]) {
    const match = await findEmployeeByField(field, email);
    if (match) {
      return match;
    }
  }

  return null;
}

function sanitizeDocId(value: unknown): string {
  const text = sanitizeText(value, 120);
  if (!text) {
    return createHash("sha256")
      .update(`${Date.now()}-${Math.random()}`)
      .digest("hex");
  }

  return text.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function sanitizeCertificateType(value: unknown): LegalCertificateType {
  const certificateType = sanitizeText(value, 40) as LegalCertificateType | undefined;
  if (
    certificateType === "ecnpj_a1" ||
    certificateType === "ecnpj_a3_token" ||
    certificateType === "ecnpj_a3_card" ||
    certificateType === "provider_icp"
  ) {
    return certificateType;
  }

  return "none";
}

function sanitizeIntegrationMode(value: unknown, certificateType: LegalCertificateType): LegalIntegrationMode {
  const integrationMode = sanitizeText(value, 60) as LegalIntegrationMode | undefined;
  if (
    integrationMode === "a1_secure_backend" ||
    integrationMode === "a3_external_workstation" ||
    integrationMode === "provider_api" ||
    integrationMode === "metadata_only"
  ) {
    return integrationMode;
  }

  if (certificateType === "ecnpj_a1") {
    return "a1_secure_backend";
  }

  if (certificateType === "ecnpj_a3_token" || certificateType === "ecnpj_a3_card") {
    return "a3_external_workstation";
  }

  if (certificateType === "provider_icp") {
    return "provider_api";
  }

  return "metadata_only";
}

function normalizeLegalSignatureConfig(data: unknown): LegalSignatureConfig {
  const source = isPlainObject(data) ? data : {};
  const certificateType = sanitizeCertificateType(source.certificateType);
  const enabled = source.enabled === true && certificateType !== "none";

  return {
    enabled,
    certificateType: enabled ? certificateType : "none",
    holderName: sanitizeScalarText(source.holderName, 180),
    holderCnpj: sanitizeScalarText(source.holderCnpj, 20)?.replace(/\D/g, ""),
    serialNumber: sanitizeScalarText(source.serialNumber, 120),
    issuer: sanitizeScalarText(source.issuer, 180),
    validUntil: sanitizeScalarText(source.validUntil, 20),
    providerName: sanitizeScalarText(source.providerName, 180),
    providerProtocol: sanitizeScalarText(source.providerProtocol, 180),
    integrationMode: enabled
      ? sanitizeIntegrationMode(source.integrationMode, certificateType)
      : "metadata_only",
    notes: sanitizeScalarText(source.notes, 500),
    status: sanitizeScalarText(source.status, 120)
  };
}

function evaluateLegalSignatureReadiness(config: LegalSignatureConfig): LegalSignatureReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const supportedFormats: LegalSignatureFormat[] = ["cades-detached", "pades"];

  if (!config.enabled || config.certificateType === "none") {
    blockers.push("A empresa ainda não configurou e-CNPJ/provedor ICP-Brasil no cadastro.");
  }

  if (config.enabled && !config.holderCnpj) {
    blockers.push("CNPJ titular do certificado não informado.");
  }

  if (config.enabled && !config.validUntil) {
    blockers.push("Validade do certificado não informada.");
  }

  const isA3 = config.certificateType === "ecnpj_a3_token" || config.certificateType === "ecnpj_a3_card";
  const canCreateExternalJob = config.enabled && isA3;
  const providerApiKey = getLegalSignatureProviderApiKey();
  const providerConfigured = Boolean(LEGAL_SIGNATURE_PROVIDER_URL && providerApiKey);
  const automaticMode = config.integrationMode === "a1_secure_backend" || config.integrationMode === "provider_api";

  if (config.enabled && automaticMode && !providerConfigured) {
    blockers.push("Configure LEGAL_SIGNATURE_PROVIDER_URL e LEGAL_SIGNATURE_PROVIDER_API_KEY nas Functions para assinar automaticamente.");
  }

  if (config.enabled && isA3) {
    warnings.push("Certificado A3 exige token/cartão físico e PIN; o backend criará job para estação/provedor externo, não assinatura automática local.");
  }

  if (config.enabled && config.integrationMode === "metadata_only") {
    blockers.push("Modo de integração está apenas como cadastro/preparação.");
  }

  const readyForAutomaticSigning = blockers.length === 0 && automaticMode && providerConfigured;
  const actionRequired = readyForAutomaticSigning
    ? "Backend apto a chamar o provedor ICP-Brasil configurado."
    : canCreateExternalJob
      ? "Use uma estação de assinatura A3 ou provedor compatível para concluir o job pendente."
      : blockers.join(" ");

  return {
    enabled: config.enabled,
    certificateType: config.certificateType,
    integrationMode: config.integrationMode,
    readyForAutomaticSigning,
    canCreateExternalJob,
    supportedFormats,
    blockers,
    warnings,
    actionRequired
  };
}

async function getCompanyLegalSignature(
  empresaId: string
): Promise<{
  companyData: admin.firestore.DocumentData;
  legalSignature: LegalSignatureConfig;
  readiness: LegalSignatureReadiness;
}> {
  const empresaDoc = await db.collection("empresas").doc(empresaId).get();
  if (!empresaDoc.exists) {
    throw new HttpsError("not-found", "Empresa não encontrada");
  }

  const companyData = empresaDoc.data() || {};
  const legalSignature = normalizeLegalSignatureConfig(companyData.legalSignature);
  const readiness = evaluateLegalSignatureReadiness(legalSignature);

  return {
    companyData,
    legalSignature,
    readiness
  };
}

function createArtifactHash(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function callLegalSignatureProvider(input: {
  empresaId: string;
  companyData: admin.firestore.DocumentData;
  legalSignature: LegalSignatureConfig;
  artifact: LegalSignatureArtifact;
  documentType: LegalSignatureDocumentType;
  signatureFormat: LegalSignatureFormat;
  requestedBy: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  signedContent?: Buffer;
  detachedSignature?: Buffer;
  signedContentType?: string;
  detachedSignatureContentType?: string;
  providerRequestId?: string;
  signedAt?: string;
}> {
  const providerApiKey = getLegalSignatureProviderApiKey();

  if (!LEGAL_SIGNATURE_PROVIDER_URL || !providerApiKey) {
    throw new HttpsError(
      "failed-precondition",
      "Provedor de assinatura ICP-Brasil não configurado nas Functions.",
      {
        missing: [
          "LEGAL_SIGNATURE_PROVIDER_URL",
          "LEGAL_SIGNATURE_PROVIDER_API_KEY"
        ]
      }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LEGAL_SIGNATURE_PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(LEGAL_SIGNATURE_PROVIDER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${providerApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contract: "ponto-facial-legal-signature-v1",
        empresaId: input.empresaId,
        documentType: input.documentType,
        signatureFormat: input.signatureFormat,
        fileName: input.artifact.fileName,
        contentType: input.artifact.contentType,
        contentBase64: input.artifact.content.toString("base64"),
        hashSha256: input.artifact.hash,
        requestedBy: input.requestedBy,
        company: {
          nomeEmpresa: sanitizeScalarText(input.companyData.nomeEmpresa, 180),
          razaoSocial: sanitizeScalarText(input.companyData.razaoSocial, 180),
          cnpj: sanitizeScalarText(input.companyData.cnpj, 20)?.replace(/\D/g, "")
        },
        certificate: {
          certificateType: input.legalSignature.certificateType,
          holderName: input.legalSignature.holderName,
          holderCnpj: input.legalSignature.holderCnpj,
          serialNumber: input.legalSignature.serialNumber,
          issuer: input.legalSignature.issuer,
          validUntil: input.legalSignature.validUntil,
          providerName: input.legalSignature.providerName,
          providerProtocol: input.legalSignature.providerProtocol
        },
        metadata: input.metadata || {}
      }),
      signal: controller.signal
    });

    const rawText = await response.text();
    const payload = rawText ? JSON.parse(rawText) : {};

    if (!response.ok) {
      throw new HttpsError(
        "failed-precondition",
        `Provedor ICP-Brasil recusou a assinatura (${response.status}).`,
        {
          status: response.status,
          response: rawText.slice(0, 1000)
        }
      );
    }

    if (!isPlainObject(payload)) {
      throw new HttpsError("failed-precondition", "Resposta inválida do provedor ICP-Brasil.");
    }

    const signedContentBase64 = typeof payload.signedContentBase64 === "string"
      ? payload.signedContentBase64
      : undefined;
    const signatureBase64 = typeof payload.signatureBase64 === "string"
      ? payload.signatureBase64
      : undefined;

    return {
      signedContent: signedContentBase64 ? Buffer.from(signedContentBase64, "base64") : undefined,
      detachedSignature: signatureBase64 ? Buffer.from(signatureBase64, "base64") : undefined,
      signedContentType: sanitizeScalarText(payload.signedContentType, 120),
      detachedSignatureContentType: sanitizeScalarText(payload.signatureContentType, 120),
      providerRequestId: sanitizeScalarText(payload.providerRequestId, 180),
      signedAt: sanitizeScalarText(payload.signedAt, 60) || new Date().toISOString()
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    const message = error instanceof Error && error.name === "AbortError"
      ? "Tempo limite ao chamar provedor ICP-Brasil."
      : "Falha ao chamar provedor ICP-Brasil.";

    throw new HttpsError("failed-precondition", message, {
      originalError: error instanceof Error ? error.message : String(error)
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function createExternalSignatureJob(input: {
  empresaId: string;
  legalSignature: LegalSignatureConfig;
  readiness: LegalSignatureReadiness;
  artifact: LegalSignatureArtifact;
  documentType: LegalSignatureDocumentType;
  signatureFormat: LegalSignatureFormat;
  requestedBy: string;
  metadata?: Record<string, unknown>;
}): Promise<LegalSignatureRunResult> {
  const jobRef = await db.collection("legalSignatureJobs").add({
    empresaId: input.empresaId,
    documentType: input.documentType,
    signatureFormat: input.signatureFormat,
    fileName: input.artifact.fileName,
    storagePath: input.artifact.storagePath || null,
    contentType: input.artifact.contentType,
    hashSha256: input.artifact.hash,
    status: "pending_external_signature",
    actionRequired: input.readiness.actionRequired,
    certificateType: input.legalSignature.certificateType,
    integrationMode: input.legalSignature.integrationMode,
    legalSignature: {
      certificateType: input.legalSignature.certificateType,
      holderName: input.legalSignature.holderName || null,
      holderCnpj: input.legalSignature.holderCnpj || null,
      serialNumber: input.legalSignature.serialNumber || null,
      issuer: input.legalSignature.issuer || null,
      validUntil: input.legalSignature.validUntil || null,
      providerName: input.legalSignature.providerName || null
    },
    metadata: input.metadata || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: input.requestedBy
  });

  return {
    status: "pending_external_signature",
    jobId: jobRef.id,
    actionRequired: input.readiness.actionRequired
  };
}

async function runLegalSignature(input: {
  empresaId: string;
  artifact: LegalSignatureArtifact;
  documentType: LegalSignatureDocumentType;
  signatureFormat: LegalSignatureFormat;
  requestedBy: string;
  metadata?: Record<string, unknown>;
}): Promise<LegalSignatureRunResult> {
  const { companyData, legalSignature, readiness } = await getCompanyLegalSignature(input.empresaId);

  if (readiness.canCreateExternalJob && !readiness.readyForAutomaticSigning) {
    return createExternalSignatureJob({
      empresaId: input.empresaId,
      legalSignature,
      readiness,
      artifact: input.artifact,
      documentType: input.documentType,
      signatureFormat: input.signatureFormat,
      requestedBy: input.requestedBy,
      metadata: input.metadata
    });
  }

  if (!readiness.readyForAutomaticSigning) {
    throw new HttpsError(
      "failed-precondition",
      "Assinatura legal ainda não está pronta para esta empresa.",
      { readiness }
    );
  }

  const providerResult = await callLegalSignatureProvider({
    empresaId: input.empresaId,
    companyData,
    legalSignature,
    artifact: input.artifact,
    documentType: input.documentType,
    signatureFormat: input.signatureFormat,
    requestedBy: input.requestedBy,
    metadata: input.metadata
  });

  if (input.signatureFormat === "pades" && !providerResult.signedContent) {
    throw new HttpsError(
      "failed-precondition",
      "Provedor não retornou PDF assinado em signedContentBase64 para PAdES."
    );
  }

  if (input.signatureFormat === "cades-detached" && !providerResult.detachedSignature) {
    throw new HttpsError(
      "failed-precondition",
      "Provedor não retornou assinatura destacada signatureBase64 para CAdES."
    );
  }

  const signatureDoc = await db.collection("documentSignatures").add({
    empresaId: input.empresaId,
    documentType: input.documentType,
    signatureFormat: input.signatureFormat,
    fileName: input.artifact.fileName,
    storagePath: input.artifact.storagePath || null,
    contentType: input.artifact.contentType,
    hashSha256: input.artifact.hash,
    status: "signed",
    certificateType: legalSignature.certificateType,
    integrationMode: legalSignature.integrationMode,
    providerName: legalSignature.providerName || null,
    providerRequestId: providerResult.providerRequestId || null,
    signedAt: providerResult.signedAt || new Date().toISOString(),
    metadata: input.metadata || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: input.requestedBy
  });

  return {
    status: "signed",
    signatureId: signatureDoc.id,
    signedContent: providerResult.signedContent,
    detachedSignature: providerResult.detachedSignature,
    signedContentType: providerResult.signedContentType,
    detachedSignatureContentType: providerResult.detachedSignatureContentType,
    providerRequestId: providerResult.providerRequestId,
    signedAt: providerResult.signedAt
  };
}

function redactWebhookPayload(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    return {};
  }

  const redactedKeys = new Set([
    "faceEmbedding",
    "faceEvidence",
    "photoEvidence",
    "photo",
    "image",
    "base64",
    "password",
    "senha",
    "token",
    "secret"
  ]);

  return Object.entries(value).reduce<Record<string, unknown>>((payload, [key, entry]) => {
    if (redactedKeys.has(key)) {
      payload[key] = "[redacted]";
      return payload;
    }

    if (typeof entry === "string") {
      payload[key] = entry.length > 500 ? `${entry.slice(0, 500)}...` : entry;
      return payload;
    }

    if (typeof entry === "number" || typeof entry === "boolean" || entry === null) {
      payload[key] = entry;
    }

    return payload;
  }, {});
}

function sanitizeWebhookEmployeeData(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new HttpsError("invalid-argument", "Payload de funcionário inválido");
  }

  const id = sanitizeDocId(value.id);
  const employeeData: Record<string, unknown> = {
    id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const fieldLimits: Record<string, number> = {
    nomeCompleto: 160,
    nome: 160,
    email: 320,
    emailCorporativo: 320,
    cpf: 20,
    pisPasep: 30,
    cargo: 120,
    setor: 120,
    status: 40,
    authUid: 128,
    userId: 128,
    empresaId: 128,
    companyId: 128
  };

  for (const [field, maxLength] of Object.entries(fieldLimits)) {
    const text = sanitizeText(value[field], maxLength);
    if (text) {
      employeeData[field] = text;
    }
  }

  return employeeData;
}

function sanitizeLocation(value: unknown): {
  latitude: number;
  longitude: number;
  accuracy: number;
  address?: string;
} | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const accuracy = Number(value.accuracy);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(accuracy) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    accuracy < 0 ||
    accuracy > 500
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Localização obrigatória ou precisão inválida para registrar ponto"
    );
  }

  const address = sanitizeText(value.address, 500);
  return {
    latitude,
    longitude,
    accuracy,
    ...(address ? { address } : {})
  };
}

function sanitizeDeviceInfo(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) {
    return {};
  }

  const allowedKeys = ["userAgent", "platform", "language", "timezone"];
  return allowedKeys.reduce<Record<string, string>>((deviceInfo, key) => {
    const text = sanitizeText(value[key], key === "userAgent" ? 500 : 120);
    if (text) {
      deviceInfo[key] = text;
    }

    return deviceInfo;
  }, {});
}

function sanitizePointMetadata(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    return {};
  }

  const facialRecognition = isPlainObject(value.facialRecognition)
    ? {
        similarity: Number(value.facialRecognition.similarity) || null,
        userName: sanitizeText(value.facialRecognition.userName, 160) || null,
        method: sanitizeText(value.facialRecognition.method, 80) || null,
        confidence: Number(value.facialRecognition.confidence) || null,
        securityLevel: sanitizeText(value.facialRecognition.securityLevel, 80) || null
      }
    : undefined;

  const geofenceValidation = isPlainObject(value.geofenceValidation)
    ? {
        isValid: value.geofenceValidation.isValid === true,
        message: sanitizeText(value.geofenceValidation.message, 300) || null
      }
    : undefined;

  return {
    offline: value.offline === true,
    networkType: sanitizeText(value.networkType, 80) || "unknown",
    ntpOffset: Number(value.ntpOffset) || 0,
    ...(facialRecognition ? { facialRecognition } : {}),
    ...(geofenceValidation ? { geofenceValidation } : {})
  };
}

function hashEvidence(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  // Nunca persistimos a imagem/base64 recebida; apenas um hash para auditoria.
  return createHash("sha256").update(value).digest("hex");
}

function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const earthRadiusMeters = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

async function validateServerGeofence(location: {
  latitude: number;
  longitude: number;
  accuracy: number;
}, tenantId?: string): Promise<GeofenceDecision> {
  if (location.accuracy > 100) {
    throw new HttpsError(
      "failed-precondition",
      `Precisão de GPS insuficiente (${Math.round(location.accuracy)}m)`
    );
  }

  const geofencesSnapshot = await db
    .collection("geofences")
    .where("active", "==", true)
    .limit(25)
    .get();

  if (geofencesSnapshot.empty) {
    throw new HttpsError(
      "failed-precondition",
      "Nenhuma cerca ativa configurada"
    );
  }

  let nearest: GeofenceDecision | null = null;

  for (const doc of geofencesSnapshot.docs) {
    const data = doc.data();
    const company = isPlainObject(data.company) ? data.company : {};
    const latitude = Number(data.center?.latitude ?? data.latitude);
    const longitude = Number(data.center?.longitude ?? data.longitude);
    const radius = Number(data.radius ?? 0);
    const empresaId = sanitizeScalarText(
      data.empresaId || data.companyId || company.empresaId || company.id,
      128
    );
    const companyId = sanitizeScalarText(
      data.companyId || data.empresaId || company.companyId || company.id,
      128
    );
    const companyName = sanitizeScalarText(
      data.companyName || data.empresaNome || company.companyName || company.nomeEmpresa,
      160
    );

    if (tenantId) {
      const fenceTenant = empresaId || companyId;
      if (fenceTenant && fenceTenant !== tenantId) {
        continue;
      }
      if (!fenceTenant) {
        continue;
      }
    }

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(radius) ||
      radius <= 0
    ) {
      continue;
    }

    const distanceMeters = calculateDistanceMeters(
      location.latitude,
      location.longitude,
      latitude,
      longitude
    );

    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = {
        geofenceId: doc.id,
        name: sanitizeText(data.name, 160) || "Cerca ativa",
        radius,
        distanceMeters,
        accuracy: location.accuracy,
        ...(empresaId ? { empresaId } : {}),
        ...(companyId ? { companyId } : {}),
        ...(companyName ? { companyName } : {})
      };
    }
  }

  if (!nearest) {
    throw new HttpsError(
      "failed-precondition",
      tenantId
        ? "Nenhuma cerca ativa válida configurada para esta empresa"
        : "Nenhuma cerca ativa válida configurada"
    );
  }

  if (nearest.distanceMeters > nearest.radius) {
    throw new HttpsError(
      "permission-denied",
      `Funcionário fora da área permitida (${Math.round(nearest.distanceMeters)}m)`
    );
  }

  return nearest;
}

async function resolveAuthorizedPointSubject(
  auth: any,
  requestedUserId: string
): Promise<{ userId: string; authUid?: string }> {
  const actorUid = auth.uid;
  const actorEmail = sanitizeText(auth.token?.email, 320)?.toLowerCase();
  const isAdminToken = auth.token?.admin === true;
  const isKioskToken = auth.token?.kiosk === true || auth.token?.role === "kiosk";
  const actorEmpresaId = sanitizeText(
    auth.token?.empresaId || auth.token?.companyId,
    128
  );

  if (requestedUserId === actorUid) {
    return { userId: requestedUserId, authUid: actorUid };
  }

  const employeeSnap = await db.collection("employees").doc(requestedUserId).get();
  const usuarioSnap = employeeSnap.exists
    ? null
    : await db.collection("usuarios").doc(requestedUserId).get();
  const subjectData = employeeSnap.exists
    ? employeeSnap.data()
    : usuarioSnap?.exists
      ? usuarioSnap.data()
      : null;

  const linkedAuthUid = sanitizeText(
    subjectData?.authUid || subjectData?.uid || subjectData?.userId,
    128
  );
  const subjectEmail = sanitizeText(subjectData?.email, 320)?.toLowerCase();

  if (
    linkedAuthUid === actorUid ||
    (!!actorEmail && !!subjectEmail && actorEmail === subjectEmail)
  ) {
    return { userId: requestedUserId, authUid: actorUid };
  }

  if (isAdminToken) {
    return {
      userId: requestedUserId,
      ...(linkedAuthUid ? { authUid: linkedAuthUid } : {})
    };
  }

  if (isKioskToken) {
    const kioskPermissions = Array.isArray(auth.token?.permissions) ? (auth.token.permissions as string[]) : [];
    if (!kioskPermissions.includes("app:mark-point") && !kioskPermissions.includes("admin:records")) {
      throw new HttpsError("permission-denied", "Perfil de portaria sem permissão app:mark-point");
    }
    checkKioskRateLimit(actorUid);
    const subjectEmpresaId = sanitizeText(
      subjectData?.empresaId || subjectData?.companyId,
      128
    );

    if (!subjectData) {
      throw new HttpsError(
        "not-found",
        "Funcionário não encontrado para marcação via portaria"
      );
    }

    if (!actorEmpresaId) {
      throw new HttpsError(
        "failed-precondition",
        "Perfil de portaria sem empresa vinculada"
      );
    }

    if (!subjectEmpresaId || subjectEmpresaId !== actorEmpresaId) {
      throw new HttpsError(
        "permission-denied",
        "Perfil de portaria não pode registrar ponto de outra empresa"
      );
    }

    return {
      userId: requestedUserId,
      ...(linkedAuthUid ? { authUid: linkedAuthUid } : {})
    };
  }

  throw new HttpsError(
    "permission-denied",
    "Usuário não pode registrar ponto para este funcionário"
  );
}

function normalizePointSubjectProfile(
  collectionName: string,
  documentId: string,
  data: Record<string, unknown>,
  fallbackName?: string | null
): PointSubjectProfile {
  const employeeId = readTextField(
    data,
    ["employeeId", "funcionarioId", "id"],
    128
  ) || (collectionName === "employees" || collectionName === "usuarios" ? documentId : undefined);
  const authUid = readTextField(data, ["authUid", "uid", "userId"], 128);
  const name = readTextField(
    data,
    ["nomeCompleto", "nome", "name", "displayName", "employeeName"],
    160
  ) || sanitizeScalarText(fallbackName, 160);
  const email = readTextField(data, ["email", "emailCorporativo"], 320);
  const cpf = readTextField(data, ["cpf"], 20);
  const pisPasep = readTextField(data, ["pisPasep", "pis", "pasep"], 30);
  const matricula = readTextField(data, ["matricula", "employeePin", "registration"], 40);
  const dataAdmissao = readTextField(data, ["dataAdmissao", "admissionDate"], 40);
  const empresaId = readTextField(data, ["empresaId", "companyId"], 128);
  const companyId = readTextField(data, ["companyId", "empresaId"], 128);

  return {
    ...(employeeId ? { employeeId } : {}),
    ...(authUid ? { authUid } : {}),
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(cpf ? { cpf } : {}),
    ...(pisPasep ? { pisPasep } : {}),
    ...(matricula ? { matricula } : {}),
    ...(dataAdmissao ? { dataAdmissao } : {}),
    ...(empresaId ? { empresaId } : {}),
    ...(companyId ? { companyId } : {}),
    sourceCollection: collectionName
  };
}

async function findPointSubjectProfileByField(
  collectionName: string,
  field: string,
  value: string,
  fallbackName?: string | null
): Promise<PointSubjectProfile | null> {
  const snapshot = await db
    .collection(collectionName)
    .where(field, "==", value)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const document = snapshot.docs[0];
  return normalizePointSubjectProfile(
    collectionName,
    document.id,
    document.data(),
    fallbackName
  );
}

async function resolvePointSubjectProfile(
  userId: string,
  auth: any,
  fallbackName?: string | null
): Promise<PointSubjectProfile> {
  const collections = ["employees", "usuarios", "users"];

  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName).doc(userId).get();
    if (!snapshot.exists) {
      continue;
    }

    return normalizePointSubjectProfile(
      collectionName,
      snapshot.id,
      snapshot.data() || {},
      fallbackName
    );
  }

  const actorUid = sanitizeScalarText(auth.uid, 128);
  const actorEmail = sanitizeScalarText(auth.token?.email, 320)?.toLowerCase();

  if (actorUid) {
    for (const collectionName of collections) {
      for (const field of ["authUid", "uid", "userId"]) {
        const profile = await findPointSubjectProfileByField(
          collectionName,
          field,
          actorUid,
          fallbackName
        );
        if (profile) {
          return profile;
        }
      }
    }
  }

  if (actorEmail) {
    for (const collectionName of collections) {
      for (const field of ["email", "emailCorporativo"]) {
        const profile = await findPointSubjectProfileByField(
          collectionName,
          field,
          actorEmail,
          fallbackName
        );
        if (profile) {
          return profile;
        }
      }
    }
  }

  const tokenName = sanitizeScalarText(auth.token?.name || fallbackName, 160);
  const tokenEmail = sanitizeScalarText(auth.token?.email, 320);

  return {
    employeeId: userId,
    ...(actorUid ? { authUid: actorUid } : {}),
    ...(tokenName ? { name: tokenName } : {}),
    ...(tokenEmail ? { email: tokenEmail } : {})
  };
}

function normalizeCompanyContext(
  documentId: string,
  data: Record<string, unknown>,
  source: string
): CompanyContext {
  const empresaId = readTextField(data, ["empresaId", "companyId", "id"], 128) || documentId;
  const companyId = readTextField(data, ["companyId", "empresaId", "id"], 128) || documentId;
  const companyName = readTextField(
    data,
    ["nomeEmpresa", "nomeFantasia", "companyName", "name", "razaoSocial"],
    160
  );
  const razaoSocial = readTextField(data, ["razaoSocial", "legalName"], 180);
  const cnpj = readTextField(data, ["cnpj", "companyCnpj"], 20);

  return {
    ...(empresaId ? { empresaId } : {}),
    ...(companyId ? { companyId } : {}),
    ...(companyName ? { companyName, empresaNome: companyName } : {}),
    ...(razaoSocial ? { razaoSocial } : {}),
    ...(cnpj ? { cnpj } : {}),
    source
  };
}

async function resolveCompanyContext(
  profile: PointSubjectProfile,
  geofenceDecision?: GeofenceDecision
): Promise<CompanyContext> {
  const explicitCompanyId =
    profile.empresaId ||
    profile.companyId ||
    geofenceDecision?.empresaId ||
    geofenceDecision?.companyId;

  if (explicitCompanyId) {
    const snapshot = await db.collection("empresas").doc(explicitCompanyId).get();
    if (snapshot.exists) {
      return normalizeCompanyContext(snapshot.id, snapshot.data() || {}, "empresa-doc");
    }

    return {
      empresaId: explicitCompanyId,
      companyId: explicitCompanyId,
      ...(geofenceDecision?.companyName ? {
        companyName: geofenceDecision.companyName,
        empresaNome: geofenceDecision.companyName
      } : {}),
      source: "explicit-id"
    };
  }

  const companiesSnapshot = await db.collection("empresas").limit(25).get();
  const activeCompanies = companiesSnapshot.docs.filter((document) => {
    const data = document.data();
    return data.ativo !== false && data.active !== false && data.status !== "inactive";
  });

  if (activeCompanies.length === 1) {
    const document = activeCompanies[0];
    return normalizeCompanyContext(document.id, document.data(), "single-active-company");
  }

  return {};
}

/**
 * Função para definir claims de administrador
 * Apenas administradores ja existentes podem promover outro usuario.
 * Bootstrap inicial deve ser feito via script interno/IAM.
 */
export const setAdminClaims = onCall(CALLABLE_SECURITY_OPTIONS, async (request) => {
  try {
    // Verificar se o usuário está autenticado
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    if (request.auth.token.admin !== true) {
      throw new HttpsError(
        'permission-denied',
        'Apenas administradores podem definir claims de administrador'
      );
    }

    const { email } = request.data;
    
    if (!email) {
      throw new HttpsError('invalid-argument', 'Email é obrigatório');
    }

    // Buscar usuário pelo email
    const userRecord = await admin.auth().getUserByEmail(email);
    const existingClaims = userRecord.customClaims || {};
    
    // Definir claims de administrador
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      ...existingClaims,
      admin: true
    });

    console.log(`Claims de administrador definidos para UID: ${userRecord.uid}`);
    
    return {
      success: true,
      message: `Claims de administrador definidos para ${userRecord.uid}`,
      uid: userRecord.uid
    };
    
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    console.error('Erro ao definir claims de admin:', error);
    throw new HttpsError('internal', 'Erro ao definir claims de administrador');
  }
});

/**
 * Cria uma conta de acesso pelo backend, mantendo Auth, custom claims e
 * documentos Firestore sincronizados. O cliente nunca deve criar Auth admin.
 */
export const createUserProfile = onCall(CALLABLE_SECURITY_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  if (request.auth.token.admin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Apenas administradores podem criar perfis de acesso"
    );
  }

  const data = isPlainObject(request.data) ? request.data : {};
  const email = sanitizeRequiredEmail(data.email);
  const password = sanitizePassword(data.password, true);
  const role = sanitizeAccessRole(data.role);
  const permissions = sanitizePermissions(data.permissions, role);
  const isActive = sanitizeProfileBoolean(data.isActive, true);
  const employeeReference = readTextField(data, ["employeeId", "funcionarioId", "matricula"], 120);
  const employeeMatch = await resolveEmployeeForProfile(employeeReference, email);
  const employeeId = employeeMatch?.id || employeeReference || "";
  const employeeData = employeeMatch?.data || {};
  const name =
    readTextField(data, ["name", "displayName", "nome"], 160) ||
    readTextField(employeeData, ["nomeCompleto", "name", "displayName", "nome"], 160) ||
    email.split("@")[0];
  const department =
    readTextField(data, ["department", "departamento"], 120) ||
    readTextField(employeeData, ["setor", "department", "departamento"], 120) ||
    "";
  const position =
    readTextField(data, ["position", "cargo"], 120) ||
    readTextField(employeeData, ["cargo", "position"], 120) ||
    "";
  let empresaId =
    readTextField(data, ["empresaId", "companyId"], 120) ||
    readTextField(employeeData, ["empresaId", "companyId"], 120) ||
    "";

  if (role === "kiosk" && !empresaId) {
    const companyFallback = await resolveCompanyContext({}, undefined);
    empresaId = companyFallback.empresaId || companyFallback.companyId || "";
  }

  if (role === "kiosk" && !empresaId) {
    throw new HttpsError(
      "failed-precondition",
      "Perfil de portaria precisa estar vinculado a uma empresa"
    );
  }

  let userRecord: admin.auth.UserRecord;

  try {
    userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      disabled: !isActive
    });
  } catch (error: any) {
    if (error?.code === "auth/email-already-exists") {
      throw new HttpsError(
        "already-exists",
        "Já existe uma conta Firebase Auth para este e-mail"
      );
    }

    console.error("Erro ao criar usuario no Auth:", error);
    throw new HttpsError("internal", "Não foi possível criar a conta de acesso");
  }

  const claims = buildProfileClaims(
    userRecord.customClaims,
    role,
    permissions,
    isActive,
    employeeId || undefined,
    empresaId || undefined
  );

  await admin.auth().setCustomUserClaims(userRecord.uid, claims);

  const profileData = {
    uid: userRecord.uid,
    authUid: userRecord.uid,
    email,
    name,
    displayName: name,
    role,
    permissions,
    isActive,
    employeeId,
    funcionarioId: employeeId,
    empresaId,
    companyId: empresaId,
    department,
    position,
    createdBy: request.auth.uid,
    updatedBy: request.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const batch = db.batch();
  batch.set(db.collection("users").doc(userRecord.uid), profileData, { merge: true });
  batch.set(db.collection("usuarios").doc(userRecord.uid), profileData, { merge: true });

  if (employeeMatch) {
    batch.set(
      employeeMatch.ref,
      {
        authUid: userRecord.uid,
        userId: userRecord.uid,
        email: readTextField(employeeData, ["email", "emailCorporativo"], 320) || email,
        employeeEmail: email,
        ...(empresaId ? { empresaId, companyId: empresaId } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid
      },
      { merge: true }
    );
  }

  await batch.commit();

  return {
    success: true,
    uid: userRecord.uid,
    employeeId,
    role,
    permissions
  };
});

/**
 * Atualiza perfil, status e claims pelo backend para evitar falso positivo
 * onde Firestore muda, mas Auth/custom claims continuam antigos.
 */
export const updateUserProfile = onCall(CALLABLE_SECURITY_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  if (request.auth.token.admin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Apenas administradores podem editar perfis de acesso"
    );
  }

  const data = isPlainObject(request.data) ? request.data : {};
  const uid = readTextField(data, ["uid", "userId", "id"], 128);
  if (!uid) {
    throw new HttpsError("invalid-argument", "UID do perfil é obrigatório");
  }

  const userRecord = await admin.auth().getUser(uid).catch(() => null);
  if (!userRecord) {
    throw new HttpsError("not-found", "Conta Firebase Auth não encontrada");
  }

  const currentProfile = await db.collection("users").doc(uid).get();
  const currentData = currentProfile.exists ? currentProfile.data() || {} : {};
  const role = data.role ? sanitizeAccessRole(data.role) : sanitizeAccessRole(currentData.role);
  const permissions = sanitizePermissions(data.permissions, role);
  const isActive = sanitizeProfileBoolean(
    data.isActive,
    currentData.isActive !== undefined ? currentData.isActive !== false : !userRecord.disabled
  );
  const employeeReference =
    readTextField(data, ["employeeId", "funcionarioId", "matricula"], 120) ||
    readTextField(currentData, ["employeeId", "funcionarioId"], 120);
  const employeeMatch = await resolveEmployeeForProfile(
    employeeReference,
    userRecord.email || readTextField(currentData, ["email"], 320) || ""
  );
  const employeeId = employeeMatch?.id || employeeReference || "";
  const employeeData = employeeMatch?.data || {};
  const name =
    readTextField(data, ["name", "displayName", "nome"], 160) ||
    readTextField(employeeData, ["nomeCompleto", "name", "displayName", "nome"], 160) ||
    readTextField(currentData, ["name", "displayName"], 160) ||
    userRecord.displayName ||
    userRecord.email ||
    uid;
  const department =
    readTextField(data, ["department", "departamento"], 120) ||
    readTextField(employeeData, ["setor", "department", "departamento"], 120) ||
    readTextField(currentData, ["department", "departamento"], 120) ||
    "";
  const position =
    readTextField(data, ["position", "cargo"], 120) ||
    readTextField(employeeData, ["cargo", "position"], 120) ||
    readTextField(currentData, ["position", "cargo"], 120) ||
    "";
  let empresaId =
    readTextField(data, ["empresaId", "companyId"], 120) ||
    readTextField(employeeData, ["empresaId", "companyId"], 120) ||
    readTextField(currentData, ["empresaId", "companyId"], 120) ||
    "";

  if (role === "kiosk" && !empresaId) {
    const companyFallback = await resolveCompanyContext({}, undefined);
    empresaId = companyFallback.empresaId || companyFallback.companyId || "";
  }

  if (role === "kiosk" && !empresaId) {
    throw new HttpsError(
      "failed-precondition",
      "Perfil de portaria precisa estar vinculado a uma empresa"
    );
  }

  await admin.auth().updateUser(uid, {
    displayName: name,
    disabled: !isActive
  });

  const claims = buildProfileClaims(
    userRecord.customClaims,
    role,
    permissions,
    isActive,
    employeeId || undefined,
    empresaId || undefined
  );

  await admin.auth().setCustomUserClaims(uid, claims);

  const profileData = {
    uid,
    authUid: uid,
    email: userRecord.email || readTextField(currentData, ["email"], 320) || "",
    name,
    displayName: name,
    role,
    permissions,
    isActive,
    employeeId,
    funcionarioId: employeeId,
    empresaId,
    companyId: empresaId,
    department,
    position,
    updatedBy: request.auth.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), profileData, { merge: true });
  batch.set(db.collection("usuarios").doc(uid), profileData, { merge: true });

  if (employeeMatch) {
    batch.set(
      employeeMatch.ref,
      {
        authUid: uid,
        userId: uid,
        employeeEmail: userRecord.email || readTextField(currentData, ["email"], 320) || "",
        ...(empresaId ? { empresaId, companyId: empresaId } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid
      },
      { merge: true }
    );
  }

  await batch.commit();

  return {
    success: true,
    uid,
    employeeId,
    role,
    permissions,
    isActive
  };
});

/**
 * Remoção operacional segura: desativa Auth e mantém trilha no Firestore.
 */
export const deleteUserProfile = onCall(CALLABLE_SECURITY_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  if (request.auth.token.admin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Apenas administradores podem desativar perfis de acesso"
    );
  }

  const data = isPlainObject(request.data) ? request.data : {};
  const uid = readTextField(data, ["uid", "userId", "id"], 128);
  if (!uid) {
    throw new HttpsError("invalid-argument", "UID do perfil é obrigatório");
  }

  if (uid === request.auth.uid) {
    throw new HttpsError(
      "failed-precondition",
      "O administrador logado não pode desativar o próprio perfil"
    );
  }

  const userRecord = await admin.auth().getUser(uid).catch(() => null);
  if (userRecord) {
    await admin.auth().updateUser(uid, { disabled: true });
    await admin.auth().setCustomUserClaims(
      uid,
      buildProfileClaims(userRecord.customClaims, "user", [], false)
    );
  }

  const deletionData = {
    isActive: false,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    deletedBy: request.auth.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid
  };

  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), deletionData, { merge: true });
  batch.set(db.collection("usuarios").doc(uid), deletionData, { merge: true });
  await batch.commit();

  return {
    success: true,
    uid
  };
});

/**
 * Registro de ponto autoritativo.
 * O cliente envia apenas evidencias; o servidor define horario, NSR,
 * assinatura/hash e escreve nas colecoes nova e legada em uma transacao.
 */
export const markPoint = onCall(CALLABLE_SECURITY_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Usuário deve estar autenticado");
  }

  const data = isPlainObject(request.data) ? request.data : {};
  const requestedUserId = sanitizeText(data.userId, 128) || request.auth.uid;
  const type = sanitizeText(data.type, 40) as PointType | undefined;

  if (!type || !VALID_POINT_TYPES.includes(type)) {
    throw new HttpsError("invalid-argument", "Tipo de ponto inválido");
  }

  const location = sanitizeLocation(data.location);
  if (!location) {
    throw new HttpsError(
      "invalid-argument",
      "Localização é obrigatória para registrar ponto"
    );
  }

  const subject = await resolveAuthorizedPointSubject(request.auth, requestedUserId);
  const deviceInfo = sanitizeDeviceInfo(data.deviceInfo);
  const metadata = sanitizePointMetadata(data.metadata);
  const facialRecognition = isPlainObject(metadata.facialRecognition)
    ? metadata.facialRecognition
    : null;
  const subjectProfile = await resolvePointSubjectProfile(
    requestedUserId,
    request.auth,
    sanitizeText(facialRecognition?.userName, 160)
  );
  const tentativeTenantId = subjectProfile.empresaId || subjectProfile.companyId;
  const geofenceDecision = await validateServerGeofence(location, tentativeTenantId);
  const companyContext = await resolveCompanyContext(subjectProfile, geofenceDecision);
  const employeeId = subjectProfile.employeeId || requestedUserId;
  const employeeAuthUid =
    subjectProfile.authUid ||
    subject.authUid ||
    (requestedUserId === request.auth.uid ? request.auth.uid : undefined);
  const resolvedAuthUid = request.auth.uid;
  const employeeName = subjectProfile.name;
  const employeeEmail = subjectProfile.email;
  const empresaId = companyContext.empresaId || companyContext.companyId;
  const companyId = companyContext.companyId || companyContext.empresaId;
  const companyName = companyContext.companyName || companyContext.empresaNome;
  const clientRecordId = sanitizeDocId(data.clientRecordId);
  const clientTimestamp = Number(data.clientTimestamp || data.timestamp || 0);
  const evidenceHash = hashEvidence(data.faceEvidence || data.faceEmbedding || data.photoEvidence);
  const hasFacialRecognition = !!facialRecognition || !!evidenceHash;
  const reviewStatus = hasFacialRecognition ? "aprovado" : "pendente";
  if (hasFacialRecognition) {
    assertTrustedServerBiometricVerification();
  }

  const legalAcceptance = hasFacialRecognition
    ? await requireFacialLegalAcceptance(employeeId, employeeAuthUid || request.auth.uid)
    : null;
  const serverTimestampMs = Date.now();
  const recordedAt = admin.firestore.Timestamp.fromMillis(serverTimestampMs);
  const legacyType = LEGACY_POINT_TYPES[type];
  const idempotencyRef = db
    .collection("pointRequests")
    .doc(`${request.auth.uid}_${clientRecordId}`);
  const sequenceRef = db.collection("sequences").doc("nsr");
  const timeRecordRef = db.collection("timeRecords").doc();
  const legacyRecordRef = db.collection("marcacoes").doc(timeRecordRef.id);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const existingRequest = await transaction.get(idempotencyRef);
      if (existingRequest.exists) {
        const existingData = existingRequest.data() || {};
        return {
          recordId: existingData.timeRecordId,
          legacyRecordId: existingData.legacyRecordId,
          nsr: existingData.nsr,
          employeeId: existingData.employeeId || existingData.userId,
          empresaId: existingData.empresaId || existingData.companyId,
          duplicate: true
        };
      }

      const sequenceDoc = await transaction.get(sequenceRef);
      const currentNsr = sequenceDoc.exists ? sequenceDoc.data()?.value || 0 : 0;
      const nsr = currentNsr + 1;

      const baseRecord = {
        userId: employeeId,
        usuarioId: employeeId,
        employeeId,
        funcionarioId: employeeId,
        requestedUserId,
        authUid: resolvedAuthUid,
        actorUid: request.auth!.uid,
        ...(employeeAuthUid && employeeAuthUid !== resolvedAuthUid ? {
          employeeAuthUid
        } : {}),
        ...(employeeName ? {
          userName: employeeName,
          usuarioNome: employeeName,
          employeeName
        } : {}),
        ...(employeeEmail ? {
          userEmail: employeeEmail,
          usuarioEmail: employeeEmail,
          employeeEmail
        } : {}),
        ...(subjectProfile.cpf ? {
          cpf: subjectProfile.cpf,
          employeeCpf: subjectProfile.cpf
        } : {}),
        ...(subjectProfile.pisPasep ? {
          pisPasep: subjectProfile.pisPasep,
          pis: subjectProfile.pisPasep,
          employeePis: subjectProfile.pisPasep
        } : {}),
        ...(subjectProfile.matricula ? {
          matricula: subjectProfile.matricula,
          employeePin: subjectProfile.matricula
        } : {}),
        ...(subjectProfile.dataAdmissao ? {
          dataAdmissao: subjectProfile.dataAdmissao
        } : {}),
        ...(subjectProfile.sourceCollection ? {
          employeeSourceCollection: subjectProfile.sourceCollection
        } : {}),
        ...(empresaId ? {
          empresaId
        } : {}),
        ...(companyId ? {
          companyId
        } : {}),
        ...(companyName ? {
          empresaNome: companyName,
          companyName
        } : {}),
        ...(companyContext.razaoSocial ? {
          razaoSocial: companyContext.razaoSocial
        } : {}),
        ...(companyContext.cnpj ? {
          empresaCnpj: companyContext.cnpj,
          companyCnpj: companyContext.cnpj
        } : {}),
        ...(companyContext.source ? {
          companyContextSource: companyContext.source
        } : {}),
        type,
        tipo: legacyType,
        timestamp: serverTimestampMs,
        dataHoraTZ: recordedAt,
        serverTimestamp: recordedAt,
        clientTimestamp: Number.isFinite(clientTimestamp) ? clientTimestamp : null,
        location,
        localizacao: {
          latitude: location.latitude,
          longitude: location.longitude,
          precisao: location.accuracy,
          ...(location.address ? { endereco: location.address } : {})
        },
        gps: {
          lat: location.latitude,
          lng: location.longitude,
          accuracy: location.accuracy
        },
        geofence: {
          id: geofenceDecision.geofenceId,
          name: geofenceDecision.name,
          radius: geofenceDecision.radius,
          distanceMeters: geofenceDecision.distanceMeters,
          accuracy: geofenceDecision.accuracy,
          ...(empresaId ? { empresaId } : {}),
          ...(companyId ? { companyId } : {}),
          ...(companyName ? { companyName } : {}),
          validatedAt: recordedAt,
          source: "server"
        },
        photoHash: evidenceHash,
        hasPhotoEvidence: !!evidenceHash,
        hasFacialRecognition,
        ...(legalAcceptance ? {
          legal: {
            ...legalAcceptance,
            checkedAt: recordedAt
          }
        } : {}),
        captureMethod: hasFacialRecognition ? "facial" : "unknown",
        status: reviewStatus,
        reviewStatus: hasFacialRecognition ? "approved" : "pending_review",
        verificationStatus: hasFacialRecognition ? "verified" : "missing_evidence",
        ...(facialRecognition ? {
          faceMatch: {
            similarity: facialRecognition.similarity ?? null,
            confidence: facialRecognition.confidence ?? null,
            method: facialRecognition.method ?? null,
            securityLevel: facialRecognition.securityLevel ?? null
          }
        } : {}),
        deviceInfo,
        metadata,
        nsr,
        origem: "server-mark-point",
        syncVersion: "3.0",
        processed: true,
        version: 3,
        immutable: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        syncedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(sequenceRef, {
        value: nsr,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      transaction.create(timeRecordRef, baseRecord);
      transaction.create(legacyRecordRef, {
        ...baseRecord,
        timeRecordId: timeRecordRef.id
      });
      transaction.create(idempotencyRef, {
        actorUid: request.auth!.uid,
        userId: employeeId,
        usuarioId: employeeId,
        employeeId,
        requestedUserId,
        authUid: resolvedAuthUid,
        ...(employeeAuthUid && employeeAuthUid !== resolvedAuthUid ? {
          employeeAuthUid
        } : {}),
        ...(empresaId ? { empresaId } : {}),
        ...(companyId ? { companyId } : {}),
        clientRecordId,
        timeRecordId: timeRecordRef.id,
        legacyRecordId: legacyRecordRef.id,
        nsr,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        recordId: timeRecordRef.id,
        legacyRecordId: legacyRecordRef.id,
        employeeId,
        empresaId,
        nsr,
        duplicate: false
      };
    });

    return {
      success: true,
      ...result,
      recordedAtMs: serverTimestampMs
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    console.error("Erro ao registrar ponto server-side:", error);
    throw new HttpsError("internal", "Erro ao registrar ponto");
  }
});

/**
 * Endpoint NTP para sincronização de tempo
 * Retorna o timestamp atual do servidor NTP
 */
export const getNTPTime = onRequest(async (req, res) => {
  try {
    if (handleCorsPreflight(req, res, "GET, OPTIONS")) {
      return;
    }

    if (req.method !== "GET") {
      res.status(405).json({ error: "Método não permitido" });
      return;
    }

    // Implementação simples de NTP usando UDP
    const ntpTime = await getNTPTimeFromServer();

    res.json({
      timestamp: ntpTime.getTime(),
      iso: ntpTime.toISOString(),
      source: "ntp"
    });
  } catch (error) {
    console.error("Erro ao obter tempo NTP:", error);
    res.status(500).json({
      error: "Erro ao sincronizar tempo",
      timestamp: Date.now(),
      iso: new Date().toISOString(),
      source: "local"
    });
  }
});

/**
 * Endpoint /time/ntp - Alias para getNTPTime
 */
export const timeNtp = onRequest(async (req, res) => {
  try {
    if (handleCorsPreflight(req, res, "GET, OPTIONS")) {
      return;
    }

    if (req.method !== "GET") {
      res.status(405).json({ error: "Método não permitido" });
      return;
    }

    // Obter tempo NTP com fallback para tempo local
    let ntpTime: Date;
    try {
      ntpTime = await getNTPTimeFromServer();
    } catch (error) {
      console.warn("Fallback para tempo local:", error);
      ntpTime = new Date();
    }

    // Calcular offset em relação ao tempo local
    const localTime = new Date();
    const offset = ntpTime.getTime() - localTime.getTime();

    res.json({
      success: true,
      data: {
        timestamp: ntpTime.getTime(),
        iso: ntpTime.toISOString(),
        localTimestamp: localTime.getTime(),
        localIso: localTime.toISOString(),
        offset: offset,
        source: "ntp",
        timezone: "America/Sao_Paulo"
      }
    });
  } catch (error) {
    console.error("Erro no endpoint /time/ntp:", error);
    res.status(500).json({
      success: false,
      error: "Erro ao sincronizar tempo",
      data: {
        timestamp: Date.now(),
        iso: new Date().toISOString(),
        source: "local"
      }
    });
  }
});

// Função auxiliar para obter tempo NTP
async function getNTPTimeFromServer(): Promise<Date> {
  return new Promise((resolve, reject) => {
    const socket = createSocket("udp4");
    const ntpServer = "pool.ntp.org";
    const ntpPort = 123;
    
    // Criar pacote NTP (48 bytes)
    const ntpPacket = Buffer.alloc(48);
    ntpPacket[0] = 0x1B; // LI, VN, Mode
    
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("NTP timeout"));
    }, 5000);
    
    socket.on("message", (msg) => {
      clearTimeout(timeout);
      socket.close();
      
      // Extrair timestamp do pacote NTP (bytes 40-43)
      const seconds = msg.readUInt32BE(40);
      // NTP epoch é 1900-01-01, Unix epoch é 1970-01-01
      const ntpEpochOffset = 2208988800;
      const unixTimestamp = (seconds - ntpEpochOffset) * 1000;
      
      resolve(new Date(unixTimestamp));
    });
    
    socket.on("error", (err) => {
      clearTimeout(timeout);
      socket.close();
      reject(err);
    });
    
    socket.send(ntpPacket, ntpPort, ntpServer);
  });
}

/**
 * Retorna se a empresa esta pronta para assinatura legal ICP-Brasil.
 */
export const getLegalSignatureStatus = onCall(LEGAL_SIGNATURE_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Usuário deve estar autenticado");
  }

  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Consulta de assinatura legal é restrita a administradores");
  }

  const data = isPlainObject(request.data) ? request.data : {};
  const empresaId = sanitizeScalarText(data.empresaId || data.companyId, 128);
  if (!empresaId) {
    throw new HttpsError("invalid-argument", "empresaId é obrigatório");
  }

  const { legalSignature, readiness } = await getCompanyLegalSignature(empresaId);

  return {
    success: true,
    empresaId,
    legalSignature,
    readiness,
    providerConfigured: Boolean(LEGAL_SIGNATURE_PROVIDER_URL && getLegalSignatureProviderApiKey())
  };
});

/**
 * Endpoint legado de assinatura digital CAdES.
 * Agora usa o orquestrador legal por empresa quando configurado.
 */
export const signTimeRecord = onCall(LEGAL_SIGNATURE_CALLABLE_OPTIONS, async (request) => {
  // Verificar autenticação
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Usuário deve estar autenticado"
    );
  }

  const auth = request.auth;

  if (auth.token.admin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Assinatura manual de registro é restrita a administradores; use markPoint para marcação de ponto"
    );
  }

  try {
    const data = isPlainObject(request.data) ? request.data : {};
    const userId = sanitizeScalarText(data.userId, 128);
    const empresaId = sanitizeScalarText(data.empresaId || data.companyId, 128);
    const type = sanitizeScalarText(data.type, 40);

    if (!userId || !empresaId || !type) {
      throw new HttpsError("invalid-argument", "userId, empresaId e type são obrigatórios");
    }

    if (auth.uid !== userId && auth.token.admin !== true) {
      throw new HttpsError(
        "permission-denied",
        "Usuário não pode assinar registro de outro usuário"
      );
    }

    // Criar dados para assinatura
    const recordData = {
      userId,
      empresaId,
      timestamp: data.timestamp || new Date().toISOString(),
      location: data.location || null,
      photoHash: sanitizeScalarText(data.photoHash, 256),
      type,
      requestedBy: auth.uid
    };

    const dataString = JSON.stringify(recordData);
    const content = Buffer.from(dataString, "utf8");
    const hash = createArtifactHash(content);
    const signatureResult = await runLegalSignature({
      empresaId,
      artifact: {
        fileName: `time_record_${sanitizeDocId(userId)}_${Date.now()}.json`,
        contentType: "application/json; charset=utf-8",
        content,
        hash
      },
      documentType: "time-record",
      signatureFormat: "cades-detached",
      requestedBy: auth.uid,
      metadata: {
        userId,
        type
      }
    });

    return {
      success: true,
      status: signatureResult.status,
      signatureId: signatureResult.signatureId,
      jobId: signatureResult.jobId,
      actionRequired: signatureResult.actionRequired,
      hash
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    console.error("Erro na assinatura digital:", error);
    throw new HttpsError(
      "internal",
      "Erro ao processar assinatura digital"
    );
  }
});

/**
 * Função de auditoria - executada quando um registro é criado
 */
export const auditTimeRecord = onDocumentCreated(
  "timeRecords/{recordId}",
  async (event) => {
    const recordData = event.data?.data();
    const recordId = event.params.recordId;

    if (!recordData) {
      console.error('Dados do registro não encontrados');
      return;
    }

    try {
      // Criar log de auditoria
      await db.collection("auditLogs").add({
        action: "CREATE_TIME_RECORD",
        recordId,
        userId: recordData.userId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        data: {
          type: recordData.type,
          location: recordData.location,
          hasPhoto: !!recordData.photoHash,
          hasSignature: !!recordData.digitalSignature
        },
        metadata: {
          source: "firestore_trigger",
          version: "1.0"
        }
      });

      console.log(`Auditoria criada para registro ${recordId}`);
    } catch (error) {
      console.error("Erro na auditoria:", error);
    }
  });

/**
 * Função agendada para limpeza de dados antigos
 * Executa diariamente às 2:00 AM
 */
export const cleanupOldRecords = onSchedule(
  "0 2 * * *",
  async (event) => {
    try {
      // Limpar logs de auditoria com mais de 90 dias
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const oldLogs = await db
        .collection("auditLogs")
        .where("timestamp", "<", cutoffDate)
        .limit(500)
        .get();

      const batch = db.batch();
      oldLogs.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      console.log(`Limpeza concluída: ${oldLogs.size} logs removidos`);
    } catch (error) {
      console.error("Erro na limpeza:", error);
      throw error;
    }
  });

/**
 * Endpoint legado /sign/afd.
 * Bloqueado para nao emitir falso positivo de assinatura legal.
 */
export const signAfd = onRequest(LEGAL_SIGNATURE_REQUEST_OPTIONS, async (req, res) => {
  try {
    if (handleCorsPreflight(req, res, "POST, OPTIONS")) {
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Método não permitido" });
      return;
    }

    const auth = await requireAdminRequest(req);

    const { startDate, endDate, empresaId } = req.body;

    if (!startDate || !endDate || !empresaId) {
      res.status(400).json({ 
        success: false, 
        error: "Parâmetros obrigatórios: startDate, endDate, empresaId" 
      });
      return;
    }

    // Buscar dados da empresa
    const empresaDoc = await db.collection("empresas").doc(empresaId).get();
    if (!empresaDoc.exists) {
      res.status(404).json({ success: false, error: "Empresa não encontrada" });
      return;
    }

    const empresaData = empresaDoc.data();

    // Buscar registros de ponto no período
    const marcacoesQuery = await db
      .collection("marcacoes")
      .where("empresaId", "==", empresaId)
      .where("dataHoraTZ", ">=", new Date(startDate))
      .where("dataHoraTZ", "<=", new Date(endDate))
      .orderBy("dataHoraTZ")
      .get();

    // Gerar conteúdo AFD
    const afdContent = await generateAFDContent(empresaData, marcacoesQuery.docs);

    const afdBuffer = Buffer.from(afdContent, "utf8");
    const hash = createArtifactHash(afdBuffer);

    // Salvar no Storage
    const fileName = `afd_${sanitizeDocId(empresaId)}_${sanitizeDocId(startDate)}_${sanitizeDocId(endDate)}.txt`;
    const bucket = admin.storage().bucket();
    const file = bucket.file(`documentos/afd/${fileName}`);
    
    await file.save(afdBuffer, {
      metadata: {
        contentType: "text/plain; charset=utf-8",
        customMetadata: {
          hash,
          empresaId,
          startDate,
          endDate,
          legalSignatureStatus: "unsigned_source"
        }
      }
    });

    const signatureResult = await runLegalSignature({
      empresaId,
      artifact: {
        fileName,
        contentType: "text/plain; charset=utf-8",
        content: afdBuffer,
        hash,
        storagePath: file.name
      },
      documentType: "afd",
      signatureFormat: "cades-detached",
      requestedBy: auth.uid,
      metadata: {
        startDate,
        endDate,
        recordCount: marcacoesQuery.size
      }
    });

    if (signatureResult.status === "pending_external_signature") {
      res.status(202).json({
        success: true,
        signed: false,
        status: signatureResult.status,
        data: {
          fileName,
          hash,
          unsignedDocument: `gs://${bucket.name}/${file.name}`,
          jobId: signatureResult.jobId,
          actionRequired: signatureResult.actionRequired,
          recordCount: marcacoesQuery.size,
          generatedAt: new Date().toISOString()
        }
      });
      return;
    }

    if (!signatureResult.detachedSignature) {
      throw new HttpsError("failed-precondition", "Assinatura CAdES destacada não foi retornada.");
    }

    const signatureFileName = `${fileName}.p7s`;
    const signatureFile = bucket.file(`documentos/afd/${signatureFileName}`);
    await signatureFile.save(signatureResult.detachedSignature, {
      metadata: {
        contentType: signatureResult.detachedSignatureContentType || "application/pkcs7-signature",
        customMetadata: {
          originalDocument: file.name,
          hash,
          empresaId,
          signatureId: signatureResult.signatureId || "",
          providerRequestId: signatureResult.providerRequestId || ""
        }
      }
    });

    res.json({
      success: true,
      signed: true,
      status: signatureResult.status,
      data: {
        fileName,
        hash,
        signatureId: signatureResult.signatureId,
        signatureFileName,
        downloadUrl: `gs://${bucket.name}/${file.name}`,
        signatureDownloadUrl: `gs://${bucket.name}/${signatureFile.name}`,
        recordCount: marcacoesQuery.size,
        generatedAt: new Date().toISOString(),
        signedAt: signatureResult.signedAt
      }
    });

  } catch (error) {
    if (error instanceof HttpsError) {
      sendHttpsError(res, error);
      return;
    }

    console.error("Erro na geração AFD:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno na geração do AFD"
    });
  }
});

/**
 * Endpoint legado /sign/pdf.
 * Bloqueado para nao emitir falso positivo de assinatura legal.
 */
export const signPdf = onRequest(LEGAL_SIGNATURE_REQUEST_OPTIONS, async (req, res) => {
  try {
    if (handleCorsPreflight(req, res, "POST, OPTIONS")) {
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Método não permitido" });
      return;
    }

    const auth = await requireAdminRequest(req);

    const { documentPath, signerInfo } = req.body;
    const empresaId = sanitizeScalarText(
      req.body?.empresaId ||
      req.body?.companyId ||
      signerInfo?.empresaId ||
      signerInfo?.companyId,
      128
    );

    if (!documentPath) {
      res.status(400).json({ 
        success: false, 
        error: "Parâmetro obrigatório: documentPath" 
      });
      return;
    }

    if (!empresaId) {
      res.status(400).json({
        success: false,
        error: "Parâmetro obrigatório: empresaId"
      });
      return;
    }

    // Buscar documento no Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(documentPath);
    
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).json({ success: false, error: "Documento não encontrado" });
      return;
    }

    // Baixar conteúdo do arquivo
    const [fileBuffer] = await file.download();

    const documentHash = createArtifactHash(fileBuffer);
    const originalFileName = documentPath.split("/").pop() || `documento_${Date.now()}.pdf`;
    const signatureResult = await runLegalSignature({
      empresaId,
      artifact: {
        fileName: originalFileName,
        contentType: "application/pdf",
        content: fileBuffer,
        hash: documentHash,
        storagePath: documentPath
      },
      documentType: "pdf",
      signatureFormat: "pades",
      requestedBy: auth.uid,
      metadata: {
        documentPath,
        signerInfo: signerInfo || null
      }
    });

    if (signatureResult.status === "pending_external_signature") {
      res.status(202).json({
        success: true,
        signed: false,
        status: signatureResult.status,
        data: {
          originalDocument: documentPath,
          documentHash,
          jobId: signatureResult.jobId,
          actionRequired: signatureResult.actionRequired,
          generatedAt: new Date().toISOString()
        }
      });
      return;
    }

    if (!signatureResult.signedContent) {
      throw new HttpsError("failed-precondition", "PDF assinado PAdES não foi retornado.");
    }

    // Criar nome do arquivo assinado
    const signedFileName = documentPath.replace(/\.(\w+)$/, "_signed.$1");
    const signedFile = bucket.file(signedFileName);

    await signedFile.save(signatureResult.signedContent, {
      metadata: {
        contentType: signatureResult.signedContentType || "application/pdf",
        customMetadata: {
          originalDocument: documentPath,
          signatureId: signatureResult.signatureId || "",
          providerRequestId: signatureResult.providerRequestId || "",
          documentHash,
          empresaId
        }
      }
    });

    res.json({
      success: true,
      signed: true,
      status: signatureResult.status,
      data: {
        signatureId: signatureResult.signatureId,
        originalDocument: documentPath,
        signedDocument: signedFileName,
        documentHash,
        signedAt: signatureResult.signedAt || new Date().toISOString()
      }
    });

  } catch (error) {
    if (error instanceof HttpsError) {
      sendHttpsError(res, error);
      return;
    }

    console.error("Erro na assinatura PDF:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno na assinatura do PDF"
    });
  }
});

/**
 * Webhook para integração com sistemas externos
 */
export const timeRecordWebhook = onRequest(WEBHOOK_REQUEST_OPTIONS, async (req, res) => {
  if (handleCorsPreflight(req, res, "POST, OPTIONS")) {
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }

  try {
    await requireAppCheckRequest(req);

    const configuredSecret = getTimeRecordWebhookSecret();
    const providedSecret = req.headers["x-webhook-secret"];
    const webhookTimestamp = req.headers["x-webhook-timestamp"] as string | undefined;
    const webhookNonce = req.headers["x-webhook-nonce"] as string | undefined;

    if (!configuredSecret || typeof providedSecret !== "string" || !providedSecret) {
      throw new HttpsError("permission-denied", "Webhook sem segredo válido");
    }
    if (webhookTimestamp) {
      const ts = Number(webhookTimestamp);
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
        throw new HttpsError("permission-denied", "Timestamp do webhook fora da janela permitida (5min)");
      }
    }
    if (webhookNonce) {
      const nonceCheck = await db.collection("webhookLogs").where("nonce", "==", webhookNonce).limit(1).get();
      if (!nonceCheck.empty) {
        throw new HttpsError("already-exists", "Nonce já utilizado — possível replay");
      }
    }
    {
      const a = Buffer.from(String(providedSecret));
      const b = Buffer.from(configuredSecret);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new HttpsError("permission-denied", "Webhook sem segredo válido");
      }
    }

    const { action, data } = req.body;
    const sanitizedAction = sanitizeText(action, 80);

    if (!sanitizedAction) {
      throw new HttpsError("invalid-argument", "Ação do webhook obrigatória");
    }

    // Log do webhook sem PII — ip hasheado, sem biométrico
    await db.collection("webhookLogs").add({
      action: sanitizedAction,
      data: redactWebhookPayload(data),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      source: (req.headers["user-agent"] as string) || "unknown",
      ipHash: typeof req.ip === "string" ? createHash("sha256").update(req.ip).digest("hex").slice(0, 16) : "unknown",
      ...(webhookNonce ? { nonce: webhookNonce } : {}),
      ...(webhookTimestamp ? { webhookTimestamp: Number(webhookTimestamp) } : {})
    });

    // Processar diferentes tipos de ação
    switch (sanitizedAction) {
      case "sync_employee":
        {
          const employeeData = sanitizeWebhookEmployeeData(data);
          await db.collection("employees").doc(String(employeeData.id)).set(employeeData, { merge: true });
        }
        break;
      
      case "export_records":
        {
          if (!isPlainObject(data)) {
            throw new HttpsError("invalid-argument", "Payload de exportação inválido");
          }

          const userId = sanitizeText(data.userId, 128);
          const startTimestamp = Date.parse(String(data.startDate || ""));
          const endTimestamp = Date.parse(String(data.endDate || ""));

          if (!userId || !Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
            throw new HttpsError("invalid-argument", "Parâmetros obrigatórios: userId, startDate, endDate");
          }

          const records = await db
            .collection("timeRecords")
            .where("userId", "==", userId)
            .where("timestamp", ">=", startTimestamp)
            .where("timestamp", "<=", endTimestamp)
          .get();

          res.json({
            success: true,
            records: records.docs.map(doc => {
              const record = doc.data();
              return {
                id: doc.id,
                userId: record.userId,
                type: record.type,
                timestamp: record.timestamp,
                dataHoraTZ: record.dataHoraTZ,
                nsr: record.nsr,
                status: record.status,
                geofence: record.geofence,
                hasPhotoEvidence: record.hasPhotoEvidence === true,
                hasFacialRecognition: record.hasFacialRecognition === true
              };
            })
          });
          return;
        }
      
      default:
        res.status(400).json({ error: "Ação não reconhecida" });
        return;
    }

    res.json({ success: true, message: "Webhook processado com sucesso" });
  } catch (error) {
    if (error instanceof HttpsError) {
      sendHttpsError(res, error);
      return;
    }

    console.error("Erro no webhook:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// P1-1: AFD agora reserva bloco único de NSR — 1 transação vs N (Menos é Mais, sem race/gap)
async function generateAFDContent(empresaData: any, marcacoes: any[]): Promise<string> {
  const lines: string[] = [];
  const totalNSR = 2 + marcacoes.length; // cabeçalho + marcações + rodapé
  const startNSR = await reserveNSR(totalNSR);
  let offset = 0;
  lines.push(`1${(startNSR + offset++).toString().padStart(9, '0')}${empresaData.cnpj.replace(/\D/g, '').padStart(14, '0')}${empresaData.razaoSocial.padEnd(150, ' ')}${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`);
  for (const marcacao of marcacoes) {
    const data = marcacao.data();
    const dataHora = new Date(data.dataHoraTZ.toDate()).toISOString().slice(0, 19).replace(/[-:T]/g, '');
    lines.push(`3${(startNSR + offset++).toString().padStart(9, '0')}${data.usuarioId.padEnd(12, ' ')}${dataHora}`);
  }
  lines.push(`9${(startNSR + offset).toString().padStart(9, '0')}${lines.length.toString().padStart(9, '0')}`);
  return lines.join('\r\n');
}

// Função auxiliar para obter próximo NSR (único ponto) — mantida para API externa e testes
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getNextNSR(): Promise<number> {
  return reserveNSR(1);
}

// P1-1: Reserva atômica de bloco de NSR — evita N transações e duplicatas sob concorrência
async function reserveNSR(count: number): Promise<number> {
  if (count <= 0) throw new HttpsError("invalid-argument", "count NSR inválido");
  const nsrDoc = db.collection('sequences').doc('nsr');
  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(nsrDoc);
    const currentNSR = doc.exists ? (doc.data()?.value || 0) : 0;
    const nextNSR = currentNSR + count;
    transaction.set(nsrDoc, { value: nextNSR }, { merge: true });
    return currentNSR + 1; // primeiro do bloco
  });
}
