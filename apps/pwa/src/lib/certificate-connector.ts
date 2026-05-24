export type DetectedCertificateType = 'ecnpj_a1' | 'ecnpj_a3_token' | 'ecnpj_a3_card';
export type DetectedIntegrationMode = 'a1_secure_backend' | 'a3_external_workstation';

export interface LocalCertificateUsage {
  friendlyName: string;
  oid: string;
}

export interface LocalCertificate {
  thumbprint: string;
  subject: string;
  subjectName: string;
  issuer: string;
  issuerName: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  friendlyName: string;
  store: string;
  hasPrivateKey: boolean;
  holderCnpj: string;
  detectedCertificateType: DetectedCertificateType;
  integrationMode: DetectedIntegrationMode;
  privateKeyProvider: string;
  hardwareBacked: boolean;
  keyAlgorithm: string;
  enhancedKeyUsages: LocalCertificateUsage[];
}

interface CertificateConnectorResponse {
  ok: boolean;
  service?: string;
  version?: string;
  generatedAt?: string;
  certificates?: LocalCertificate[];
  warnings?: string[];
  error?: string;
}

export const DEFAULT_CERTIFICATE_CONNECTOR_PORT = 8765;

function normalizeCertificate(value: Partial<LocalCertificate>): LocalCertificate | null {
  if (!value.thumbprint) return null;

  const detectedCertificateType =
    value.detectedCertificateType === 'ecnpj_a3_card' ||
    value.detectedCertificateType === 'ecnpj_a3_token' ||
    value.detectedCertificateType === 'ecnpj_a1'
      ? value.detectedCertificateType
      : 'ecnpj_a1';

  return {
    thumbprint: value.thumbprint,
    subject: value.subject || '',
    subjectName: value.subjectName || '',
    issuer: value.issuer || '',
    issuerName: value.issuerName || '',
    serialNumber: value.serialNumber || '',
    notBefore: value.notBefore || '',
    notAfter: value.notAfter || '',
    friendlyName: value.friendlyName || '',
    store: value.store || '',
    hasPrivateKey: value.hasPrivateKey === true,
    holderCnpj: (value.holderCnpj || '').replace(/\D/g, ''),
    detectedCertificateType,
    integrationMode: detectedCertificateType === 'ecnpj_a1' ? 'a1_secure_backend' : 'a3_external_workstation',
    privateKeyProvider: value.privateKeyProvider || '',
    hardwareBacked: value.hardwareBacked === true,
    keyAlgorithm: value.keyAlgorithm || '',
    enhancedKeyUsages: Array.isArray(value.enhancedKeyUsages) ? value.enhancedKeyUsages : []
  };
}

function getConnectorUrl(port: number): string {
  const safePort = Number.isInteger(port) && port > 0 ? port : DEFAULT_CERTIFICATE_CONNECTOR_PORT;
  return `http://127.0.0.1:${safePort}`;
}

export async function fetchLocalCertificates(port = DEFAULT_CERTIFICATE_CONNECTOR_PORT): Promise<{
  certificates: LocalCertificate[];
  connectorUrl: string;
  warnings: string[];
}> {
  const baseUrl = getConnectorUrl(port);

  try {
    const response = await fetch(`${baseUrl}/certificates`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      headers: {
        Accept: 'application/json'
      }
    });

    const payload = (await response.json()) as CertificateConnectorResponse;

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `Conector respondeu HTTP ${response.status}.`);
    }

    const certificates = (payload.certificates || [])
      .map(normalizeCertificate)
      .filter((certificate): certificate is LocalCertificate => Boolean(certificate));

    return {
      certificates,
      connectorUrl: baseUrl,
      warnings: payload.warnings || []
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Não foi possível falar com o conector local.';

    throw new Error(
      `${detail} Inicie no terminal: cd C:\\ponto-facial && pnpm cert:connector. ` +
      `Se usou outra porta, selecione a porta correta nesta tela.`
    );
  }
}

export function formatCertificateValidity(value: string): string {
  if (!value) return 'validade não informada';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'validade inválida';
  return date.toLocaleDateString('pt-BR');
}

export function getLocalCertificateLabel(certificate: LocalCertificate): string {
  const name = certificate.subjectName || certificate.friendlyName || certificate.subject || 'Certificado sem titular';
  const type = certificate.detectedCertificateType === 'ecnpj_a1' ? 'A1' : 'A3';
  return `${name} | ${type} | vence em ${formatCertificateValidity(certificate.notAfter)}`;
}
