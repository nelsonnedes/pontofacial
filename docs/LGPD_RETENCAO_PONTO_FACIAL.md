# Documentação de Governança de Dados (LGPD) & Política de Retenção

Este documento detalha as diretrizes de governança de dados pessoais, o tratamento de biometria facial e a política de retenção e descarte de dados do sistema **Ponto Facial SaaS**, assegurando total conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018) e a Portaria nº 671/2021 do Ministério do Trabalho e Emprego (MTE).

---

## ⚖️ 1. Enquadramento Legal (Bases Legais da LGPD)

O tratamento de dados pessoais no Ponto Facial SaaS apoia-se em duas bases legais fundamentais da LGPD:

1.  **Cumprimento de Obrigação Legal ou Regulatória (Art. 7º, II e Art. 11, II, 'a' da LGPD):**
    *   O empregador é legalmente obrigado a registrar a jornada de trabalho de seus colaboradores (Art. 74 da CLT).
    *   O sistema REP-P segue as diretrizes da Portaria MTE 671/2021, que rege a especificação técnica do controle de ponto no Brasil.
2.  **Consentimento do Titular (Art. 11, I da LGPD) para Dados Sensíveis:**
    *   Como a biometria facial é classificada como **dado pessoal sensível**, o sistema exige o aceite explícito do colaborador no primeiro acesso (Termo de Consentimento Biométrico) antes de capturar ou registrar qualquer representação facial (embedding).

---

## 🎯 2. Finalidade e Minimização de Dados Faciais

A coleta da imagem do colaborador possui a finalidade exclusiva de **autenticação e prevenção a fraudes** no registro de jornada de trabalho (garantindo que o próprio funcionário está registrando seu ponto).

Para seguir o princípio de **Minimização de Dados** (Art. 6º, III da LGPD):
*   O sistema **não armazena a imagem da foto do colaborador** em banco de dados de produção após a extração das características faciais distintivas.
*   A foto capturada no momento da marcação é processada localmente para extrair um vetor numérico unidirecional (embedding de 512 dimensões).
*   A imagem original é imediatamente descartada do fluxo de memória.
*   O vetor numérico (embedding) é encriptado localmente (AES-GCM WebCrypto) e enviado por canal seguro (HTTPS/TLS) para o servidor, onde é persistido de forma protegida contra leitura direta por usuários comuns.

---

## ⏱️ 3. Política de Retenção e Descarte

| Categoria do Dado | Período de Retenção | Justificativa Legal / Operacional | Procedimento de Descarte |
| :--- | :--- | :--- | :--- |
| **Embeddings Faciais (Modelos)** | Enquanto durar o vínculo empregatício do colaborador. | Necessário para a autenticação diária de marcações de ponto. | Exclusão definitiva e irrecuperável do documento do funcionário no Firestore no momento da rescisão/desativação. |
| **Logs da Fila Offline (IndexedDB)** | Até a sincronização com o servidor (janela máxima de 30 dias). | Armazenamento temporário para resiliência offline do aplicativo. | Expurgo automático do campo `faceEmbedding` da tabela local no IndexedDB imediatamente após a confirmação de sync bem-sucedida. |
| **Registros de Ponto (AFD/AEJ)** | 5 anos após a rescisão contratual. | Art. 11 da CLT (prescrição quinquenal de créditos trabalhistas) e fiscalização do MTE. | Arquivamento offline frio e posterior exclusão lógica/física após o decurso do prazo prescricional. |
| **Logs de Auditoria Interna** | 90 dias. | Rastreabilidade de segurança da informação e auditoria operacional. | Função automatizada (`cleanupOldRecords`) executada diariamente às 2:00 AM para purgar registros anteriores a 90 dias. |

---

## 🔒 4. Salvaguardas de Segurança e Criptografia

1.  **Criptografia na Fila Local:** Os dados na fila offline (IndexedDB) são protegidos de acesso não autorizado por outros aplicativos do dispositivo através do sandbox do navegador (Origin isolation) e rotinas de criptografia simétrica local.
2.  **Trilha de Auditoria Imutável (REP-P):** As marcações no AFD geram um hash encadeado (SHA-256) com base no registro anterior, inviabilizando qualquer adulteração retrospectiva por administradores de sistema, em total conformidade com os requisitos da Portaria 671/2021.
3.  **Segregação de Papéis (RBAC):** Regras restritas no Firestore (`firestore.rules`) garantem que apenas administradores do RH têm acesso aos relatórios do AFD/AEJ, e colaboradores comuns só conseguem ler suas próprias marcações históricas.
