# Sistema de Ponto Facial

![Versão](https://img.shields.io/badge/versão-1.0.0-blue)
![Licença](https://img.shields.io/badge/licença-MIT-green)

Sistema PWA (Progressive Web App) para registro de ponto eletrônico com reconhecimento facial, compatível com as normas da Portaria MTE 671/2021 (PTRP).

## 📋 Características

- ✅ Reconhecimento facial em tempo real
- ✅ Funcionamento offline (PWA)
- ✅ Compatível com normas PTRP/FGTS
- ✅ Geração de arquivos AFD e AEJ
- ✅ Suporte a múltiplos navegadores (Chrome, Firefox, Edge, Safari)
- ✅ Interface responsiva para desktop e dispositivos móveis

## 🚀 Tecnologias

- **Frontend**: Next.js, React, TailwindCSS
- **Backend**: Firebase (Firestore, Authentication, Storage, Hosting)
- **ML/AI**: TensorFlow.js, face-api.js (reconhecimento facial)
- **PWA**: Service Workers, IndexedDB (Dexie.js)

## 📦 Estrutura do Projeto

```
pontofacial/
├── apps/
│   └── pwa/                   # Aplicação PWA principal
│       ├── public/            # Arquivos estáticos e Service Worker
│       │   ├── models/        # Modelos de ML para reconhecimento facial
│       │   └── sw.js          # Service Worker para funcionalidades offline
│       └── src/
│           ├── app/           # Rotas da aplicação (Next.js App Router)
│           ├── components/    # Componentes React reutilizáveis
│           ├── hooks/         # React Hooks personalizados
│           └── lib/           # Bibliotecas e utilitários
│               ├── face-recognition.ts  # Serviço de reconhecimento facial
│               └── face-worker.ts       # Web Worker para processamento ML
└── packages/
    └── core-legal/            # Biblioteca para conformidade legal (AFD/AEJ)
```

## 🔧 Instalação e Configuração

### Pré-requisitos

- Node.js 18+ e npm/pnpm
- Conta no Firebase

### Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/nelsonnedes/pontofacial.git
   cd pontofacial
   ```

2. Instale as dependências:
   ```bash
   pnpm install
   ```

3. Configure o Firebase:
   ```bash
   firebase login
   firebase use --add
   ```

4. Baixe os modelos de ML:
   ```bash
   cd apps/pwa
   pnpm run download-models
   ```

5. Execute o ambiente de desenvolvimento:
   ```bash
   pnpm run dev
   ```

## 📱 Compatibilidade com Navegadores

O sistema foi testado e é compatível com:

- Chrome 90+ (Desktop e Android)
- Firefox 90+ (Desktop)
- Edge 90+ (Desktop)
- Safari 14+ (iOS e macOS)

## 🛠️ Desenvolvimento

### Comandos Úteis

- `pnpm run dev` - Inicia o servidor de desenvolvimento
- `pnpm run build` - Compila o projeto para produção
- `pnpm run test` - Executa os testes unitários
- `firebase deploy` - Implanta a aplicação no Firebase Hosting

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo LICENSE para detalhes.

## 👥 Contribuidores

- [@nelsonnedes](https://github.com/nelsonnedes) - Desenvolvedor principal
- [@frasico](https://github.com/frasico) - Contribuidor

## 📞 Contato

Para questões e suporte, entre em contato através das issues do GitHub ou pelo email: contato@exemplo.com