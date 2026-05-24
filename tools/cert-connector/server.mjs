import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SERVICE_NAME = 'ponto-facial-cert-connector';
const VERSION = '1.0.0';
const HOST = process.env.PONTO_FACIAL_CERT_HOST || '127.0.0.1';
const PORT = Number(process.env.PONTO_FACIAL_CERT_PORT || 8765);
const DEFAULT_ALLOWED_ORIGINS = [
  'https://pontofacial.web.app',
  'https://dbponto-facial.web.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const allowedOrigins = new Set(
  (process.env.PONTO_FACIAL_CERT_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);

function sendJson(req, res, statusCode, payload) {
  applyCors(req, res);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function applyCors(req, res) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function isOriginAllowed(req) {
  const origin = req.headers.origin;
  return !origin || allowedOrigins.has(origin);
}

function normalizeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCertificate(value) {
  const holderCnpj = normalizeString(value.holderCnpj).replace(/\D/g, '');
  const detectedCertificateType = normalizeString(value.detectedCertificateType);
  const safeType =
    detectedCertificateType === 'ecnpj_a3_card' ||
    detectedCertificateType === 'ecnpj_a3_token' ||
    detectedCertificateType === 'ecnpj_a1'
      ? detectedCertificateType
      : 'ecnpj_a1';

  return {
    thumbprint: normalizeString(value.thumbprint),
    subject: normalizeString(value.subject),
    subjectName: normalizeString(value.subjectName),
    issuer: normalizeString(value.issuer),
    issuerName: normalizeString(value.issuerName),
    serialNumber: normalizeString(value.serialNumber),
    notBefore: normalizeDate(value.notBefore),
    notAfter: normalizeDate(value.notAfter),
    friendlyName: normalizeString(value.friendlyName),
    store: normalizeString(value.store),
    hasPrivateKey: value.hasPrivateKey === true,
    holderCnpj: holderCnpj.length === 14 ? holderCnpj : '',
    detectedCertificateType: safeType,
    integrationMode: safeType === 'ecnpj_a1' ? 'a1_secure_backend' : 'a3_external_workstation',
    privateKeyProvider: normalizeString(value.privateKeyProvider),
    hardwareBacked: value.hardwareBacked === true,
    keyAlgorithm: normalizeString(value.keyAlgorithm),
    enhancedKeyUsages: Array.isArray(value.enhancedKeyUsages)
      ? value.enhancedKeyUsages.map(usage => ({
          friendlyName: normalizeString(usage.friendlyName),
          oid: normalizeString(usage.oid)
        }))
      : []
  };
}

async function listWindowsCertificates() {
  if (process.platform !== 'win32') {
    return {
      certificates: [],
      warnings: ['Este conector lista certificados automaticamente apenas no Windows.']
    };
  }

  const psScript = String.raw`
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Get-SafeText($value) {
  if ($null -eq $value) { return "" }
  return ([string]$value).Trim()
}

function Get-CommonName($distinguishedName) {
  $text = Get-SafeText $distinguishedName
  $match = [regex]::Match($text, "(?:^|,\s*)CN\s*=\s*([^,]+)", "IgnoreCase")
  if ($match.Success) { return $match.Groups[1].Value.Trim() }
  return ""
}

function Get-CnpjFromText($text) {
  $safeText = Get-SafeText $text
  $matches = [regex]::Matches($safeText, "\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}")
  foreach ($match in $matches) {
    $digits = [regex]::Replace($match.Value, "\D", "")
    if ($digits.Length -eq 14) { return $digits }
  }
  return ""
}

function Get-DetectedCertificateType($cert, $providerName, $hardwareBacked) {
  $haystack = "$(Get-SafeText $cert.Subject) $(Get-SafeText $cert.Issuer) $(Get-SafeText $cert.FriendlyName) $(Get-SafeText $providerName)"

  if ($hardwareBacked -or $haystack -match "(?i)smart\s*card|cart[aã]o|leitora|token|safenet|gemalto|aladdin|oberthur|feitian|watchdata|epass|giesecke|bit4id|athena|a3") {
    return "ecnpj_a3_token"
  }

  return "ecnpj_a1"
}

function Convert-Certificate($cert, $storeName) {
  $privateKeyProvider = ""
  $hardwareBacked = $false
  $keyAlgorithm = ""
  $enhancedKeyUsages = @()

  try { $keyAlgorithm = Get-SafeText $cert.PublicKey.Oid.FriendlyName } catch {}

  try {
    if ($cert.PrivateKey -and $cert.PrivateKey.CspKeyContainerInfo) {
      $privateKeyProvider = Get-SafeText $cert.PrivateKey.CspKeyContainerInfo.ProviderName
      $hardwareBacked = [bool]$cert.PrivateKey.CspKeyContainerInfo.HardwareDevice
    }
  } catch {}

  try {
    foreach ($usage in $cert.EnhancedKeyUsageList) {
      $enhancedKeyUsages += [PSCustomObject]@{
        friendlyName = Get-SafeText $usage.FriendlyName
        oid = Get-SafeText $usage.ObjectId.Value
      }
    }
  } catch {}

  $subject = Get-SafeText $cert.Subject
  $issuer = Get-SafeText $cert.Issuer
  $friendlyName = Get-SafeText $cert.FriendlyName
  $holderCnpj = Get-CnpjFromText "$subject $friendlyName"
  $detectedType = Get-DetectedCertificateType $cert $privateKeyProvider $hardwareBacked

  [PSCustomObject]@{
    thumbprint = Get-SafeText $cert.Thumbprint
    subject = $subject
    subjectName = Get-CommonName $subject
    issuer = $issuer
    issuerName = Get-CommonName $issuer
    serialNumber = Get-SafeText $cert.SerialNumber
    notBefore = $cert.NotBefore.ToUniversalTime().ToString("o")
    notAfter = $cert.NotAfter.ToUniversalTime().ToString("o")
    friendlyName = $friendlyName
    store = $storeName
    hasPrivateKey = [bool]$cert.HasPrivateKey
    holderCnpj = $holderCnpj
    detectedCertificateType = $detectedType
    privateKeyProvider = $privateKeyProvider
    hardwareBacked = $hardwareBacked
    keyAlgorithm = $keyAlgorithm
    enhancedKeyUsages = $enhancedKeyUsages
  }
}

$stores = @(
  @{ Path = "Cert:\CurrentUser\My"; Store = "CurrentUser\My" },
  @{ Path = "Cert:\LocalMachine\My"; Store = "LocalMachine\My" }
)

$now = Get-Date
$items = New-Object System.Collections.Generic.List[object]

foreach ($store in $stores) {
  if (Test-Path $store.Path) {
    Get-ChildItem -Path $store.Path | Where-Object {
      $_.HasPrivateKey -and $_.NotAfter -gt $now.AddDays(-30)
    } | ForEach-Object {
      $items.Add((Convert-Certificate $_ $store.Store))
    }
  }
}

$items | Sort-Object notAfter -Descending | ConvertTo-Json -Depth 8 -Compress
`;

  const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');
  const { stdout, stderr } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
    {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30000,
      windowsHide: true
    }
  );

  const rawOutput = stdout.trim();
  const parsed = rawOutput ? JSON.parse(rawOutput) : [];
  const rawCertificates = Array.isArray(parsed) ? parsed : [parsed];
  const certificates = rawCertificates
    .filter(item => item && typeof item === 'object')
    .map(normalizeCertificate)
    .filter(item => item.thumbprint);

  return {
    certificates,
    warnings: stderr.trim() ? [stderr.trim()] : []
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    applyCors(req, res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (!isOriginAllowed(req)) {
    sendJson(req, res, 403, {
      ok: false,
      error: 'Origem não autorizada para acessar o conector local.',
      allowedOrigins: Array.from(allowedOrigins)
    });
    return;
  }

  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(req, res, 200, {
      ok: true,
      service: SERVICE_NAME,
      version: VERSION,
      platform: process.platform,
      generatedAt: new Date().toISOString()
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/certificates') {
    try {
      const result = await listWindowsCertificates();
      sendJson(req, res, 200, {
        ok: true,
        service: SERVICE_NAME,
        version: VERSION,
        generatedAt: new Date().toISOString(),
        ...result
      });
    } catch (error) {
      sendJson(req, res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro ao listar certificados locais.'
      });
    }
    return;
  }

  sendJson(req, res, 404, {
    ok: false,
    error: 'Endpoint não encontrado.'
  });
});

server.listen(PORT, HOST, () => {
  console.log(`${SERVICE_NAME} ${VERSION} ouvindo em http://${HOST}:${PORT}`);
  console.log(`Origens permitidas: ${Array.from(allowedOrigins).join(', ')}`);
  console.log('Mantenha esta janela aberta enquanto usa Admin > Empresas > Certificado ICP-Brasil.');
});

