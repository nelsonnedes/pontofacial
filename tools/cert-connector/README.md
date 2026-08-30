# Conector Local de Certificados

Este conector permite que a PWA do Ponto Facial carregue metadados dos certificados instalados no Windows do computador do administrador.

Ele não lê nem envia chave privada, senha, PIN, PFX ou PEM. O retorno contém apenas dados de conferência: titular, CNPJ detectado, emissor, validade, número de série, thumbprint, origem do repositório e uma heurística de A1/A3.

## Como iniciar

```powershell
cd C:\ponto-facial
pnpm cert:connector
```

Depois abra `https://pontofacial.web.app/admin/empresas`, edite ou crie a empresa, marque a opção de certificado ICP-Brasil e clique em `Detectar certificados deste PC`.

## Observações

- No Windows, certificados A1 instalados no repositório pessoal aparecem em `CurrentUser\My` ou `LocalMachine\My`.
- Tokens/cartões A3 aparecem quando o driver/minidriver do fabricante está instalado e o dispositivo está conectado.
- A seleção do certificado preenche o cadastro da empresa com metadados seguros, mas a assinatura oficial ainda depende do provedor/HSM ou da estação de assinatura A3 configurada.
- Se a porta `8765` estiver ocupada, use:

```powershell
$env:PONTO_FACIAL_CERT_PORT="8766"
pnpm cert:connector
```

