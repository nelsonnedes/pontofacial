# Segurança do Sistema Ponto Facial

## Tratamento de Dados Pessoais e Sensíveis (LGPD)
1. **Biometria e Embeddings:**
   - Embeddings faciais (`faceEmbedding` / `faceEvidence`) e imagens nunca devem ser logados ou expostos em respostas públicas.
   - Em produção, toda biometria local deve servir apenas para validação preliminar do cliente. A validação final autoritativa deve ser confirmada contra o servidor/provider configurado.
   
2. **PII em Logs:**
   - Nunca insira emails, CPFs, nomes completos ou localizações exatas em mensagens de erro genéricas ou logs do console.

## Autorização no Backend
1. **Firestore Rules:**
   - O cliente PWA nunca deve ter permissão de criar registros de ponto (`marcacoes` e `timeRecords`) diretamente. Toda criação deve ser mediada por Cloud Functions seguras.
   - As coleções de dados de funcionários devem ser restritas aos próprios usuários e aos administradores.

2. **Cloud Functions:**
   - Endpoints sensíveis devem validar a autenticação do usuário, conferir claims (`admin`, `employee`, etc.) e verificar o token App Check (`ENFORCE_APP_CHECK=true`) em produção.
