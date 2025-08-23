# @ponto/core-legal

Geração e validação do AFD (Portaria 671/2021).

## Testes

```bash
cd packages/core-legal
pnpm i
pnpm test
```

- `afd-structure.test.ts` cobre tamanho por tipo, CRC 1..5, SHA-256 encadeado para reg. 7, trailer e linha de assinatura (100A).
