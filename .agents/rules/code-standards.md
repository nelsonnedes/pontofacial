# Padrões de Código e Convenções - Ponto Facial

## Tecnologias e Frameworks
- **Frontend:** Next.js 15, React 18, Tailwind CSS, TypeScript.
- **Backend:** Firebase (Auth, Firestore, Functions Node 22, Storage).
- **Gerenciador de Pacotes:** `pnpm` (pnpm-workspace.yaml).

## Práticas de Desenvolvimento e Qualidade
1. **Tipagem TypeScript Estrita:**
   - Evite o uso de `any` sempre que possível. Defina interfaces claras para payloads, registros de ponto e estados.
   
2. **Build sem Ignores:**
   - Nunca configure o build do Next.js para ignorar erros de lint ou TypeScript (`ignoreBuildErrors` / `ignoreDuringBuilds` devem ser `false`).
   
3. **Organização do Monorepo:**
   - Código de regras CLT deve residir em `packages/core-rules`.
   - Schemas de validação legal de AFD/AEJ residem em `packages/core-legal`.
