"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeRecordWebhook = exports.signPdf = exports.signAfd = exports.cleanupOldRecords = exports.auditTimeRecord = exports.signTimeRecord = exports.timeNtp = exports.getNTPTime = exports.setAdminClaims = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const admin = require("firebase-admin");
const forge = require("node-forge");
const dgram_1 = require("dgram");
// Configurar região global
(0, v2_1.setGlobalOptions)({ region: 'us-east1' });
// Inicializar Firebase Admin
admin.initializeApp();
const db = admin.firestore();
/**
 * Função para definir claims de administrador
 * Apenas para uso em desenvolvimento/setup inicial
 */
exports.setAdminClaims = (0, https_1.onCall)(async (request) => {
    try {
        // Verificar se o usuário está autenticado
        if (!request.auth) {
            throw new https_1.HttpsError('unauthenticated', 'Usuário não autenticado');
        }
        const { email } = request.data;
        if (!email) {
            throw new https_1.HttpsError('invalid-argument', 'Email é obrigatório');
        }
        // Buscar usuário pelo email
        const userRecord = await admin.auth().getUserByEmail(email);
        // Definir claims de administrador
        await admin.auth().setCustomUserClaims(userRecord.uid, {
            admin: true
        });
        console.log(`Claims de administrador definidos para: ${email}`);
        return {
            success: true,
            message: `Claims de administrador definidos para ${email}`,
            uid: userRecord.uid
        };
    }
    catch (error) {
        console.error('Erro ao definir claims de admin:', error);
        throw new https_1.HttpsError('internal', 'Erro ao definir claims de administrador');
    }
});
/**
 * Endpoint NTP para sincronização de tempo
 * Retorna o timestamp atual do servidor NTP
 */
exports.getNTPTime = (0, https_1.onRequest)(async (req, res) => {
    try {
        // Configurar CORS
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }
        // Implementação simples de NTP usando UDP
        const ntpTime = await getNTPTimeFromServer();
        res.json({
            timestamp: ntpTime.getTime(),
            iso: ntpTime.toISOString(),
            source: "ntp"
        });
    }
    catch (error) {
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
exports.timeNtp = (0, https_1.onRequest)(async (req, res) => {
    try {
        // Configurar CORS
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }
        if (req.method !== "GET") {
            res.status(405).json({ error: "Método não permitido" });
            return;
        }
        // Obter tempo NTP com fallback para tempo local
        let ntpTime;
        try {
            ntpTime = await getNTPTimeFromServer();
        }
        catch (error) {
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
    }
    catch (error) {
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
async function getNTPTimeFromServer() {
    return new Promise((resolve, reject) => {
        const socket = (0, dgram_1.createSocket)("udp4");
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
 * Função para assinatura digital CAdES
 * Assina digitalmente os dados de ponto eletrônico
 */
exports.signTimeRecord = (0, https_1.onCall)(async (request) => {
    // Verificar autenticação
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Usuário deve estar autenticado");
    }
    try {
        const { userId, timestamp, location, photoHash, type // "entrada" ou "saida"
         } = request.data;
        // Criar dados para assinatura
        const recordData = {
            userId,
            timestamp,
            location,
            photoHash,
            type,
            serverTimestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        // Gerar hash dos dados
        const dataString = JSON.stringify(recordData);
        const md = forge.md.sha256.create();
        md.update(dataString, "utf8");
        const hash = md.digest().toHex();
        // Simular assinatura digital (em produção, usar certificado real)
        const signature = forge.util.encode64(hash);
        // Salvar no Firestore com assinatura
        const docRef = await db.collection("timeRecords").add(Object.assign(Object.assign({}, recordData), { digitalSignature: {
                hash,
                signature,
                algorithm: "SHA-256",
                signedAt: admin.firestore.FieldValue.serverTimestamp()
            } }));
        return {
            success: true,
            recordId: docRef.id,
            signature,
            hash
        };
    }
    catch (error) {
        console.error("Erro na assinatura digital:", error);
        throw new https_1.HttpsError("internal", "Erro ao processar assinatura digital");
    }
});
/**
 * Função de auditoria - executada quando um registro é criado
 */
exports.auditTimeRecord = (0, firestore_1.onDocumentCreated)("timeRecords/{recordId}", async (event) => {
    var _a;
    const recordData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
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
    }
    catch (error) {
        console.error("Erro na auditoria:", error);
    }
});
/**
 * Função agendada para limpeza de dados antigos
 * Executa diariamente às 2:00 AM
 */
exports.cleanupOldRecords = (0, scheduler_1.onSchedule)("0 2 * * *", async (event) => {
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
    }
    catch (error) {
        console.error("Erro na limpeza:", error);
        throw error;
    }
});
/**
 * Endpoint /sign/afd - Geração e assinatura de arquivo AFD
 */
exports.signAfd = (0, https_1.onRequest)(async (req, res) => {
    try {
        // Configurar CORS
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }
        if (req.method !== "POST") {
            res.status(405).json({ error: "Método não permitido" });
            return;
        }
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
        // Gerar hash SHA-256 do conteúdo
        const md = forge.md.sha256.create();
        md.update(afdContent, "utf8");
        const hash = md.digest().toHex();
        // Simular assinatura digital CAdES
        const signature = forge.util.encode64(hash);
        // Salvar no Storage
        const fileName = `afd_${empresaId}_${startDate}_${endDate}.txt`;
        const bucket = admin.storage().bucket();
        const file = bucket.file(`documentos/afd/${fileName}`);
        await file.save(afdContent, {
            metadata: {
                contentType: "text/plain; charset=utf-8",
                customMetadata: {
                    hash,
                    signature,
                    empresaId,
                    startDate,
                    endDate
                }
            }
        });
        res.json({
            success: true,
            data: {
                fileName,
                hash,
                signature,
                downloadUrl: `gs://${bucket.name}/${file.name}`,
                recordCount: marcacoesQuery.size,
                generatedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error("Erro na geração AFD:", error);
        res.status(500).json({
            success: false,
            error: "Erro interno na geração do AFD"
        });
    }
});
/**
 * Endpoint /sign/pdf - Assinatura digital de documentos PDF
 */
exports.signPdf = (0, https_1.onRequest)(async (req, res) => {
    try {
        // Configurar CORS
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }
        if (req.method !== "POST") {
            res.status(405).json({ error: "Método não permitido" });
            return;
        }
        const { documentPath, signerInfo } = req.body;
        if (!documentPath) {
            res.status(400).json({
                success: false,
                error: "Parâmetro obrigatório: documentPath"
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
        // Gerar hash do documento
        const md = forge.md.sha256.create();
        md.update(fileBuffer.toString("binary"));
        const documentHash = md.digest().toHex();
        // Criar dados da assinatura
        const signatureData = {
            documentPath,
            documentHash,
            signerInfo: signerInfo || {
                name: "Sistema Ponto Facial",
                email: "sistema@pontofacial.com",
                timestamp: new Date().toISOString()
            },
            algorithm: "SHA-256",
            signedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        // Simular assinatura PAdES (em produção, usar biblioteca específica)
        const signatureString = JSON.stringify(signatureData);
        const signatureMd = forge.md.sha256.create();
        signatureMd.update(signatureString, "utf8");
        const signature = forge.util.encode64(signatureMd.digest().toHex());
        // Salvar metadados da assinatura
        const signatureDoc = await db.collection("documentSignatures").add(Object.assign(Object.assign({}, signatureData), { signature, status: "signed" }));
        // Criar nome do arquivo assinado
        const signedFileName = documentPath.replace(/\.(\w+)$/, "_signed.$1");
        const signedFile = bucket.file(signedFileName);
        // Salvar documento "assinado" (em produção, aplicar assinatura real)
        await signedFile.save(fileBuffer, {
            metadata: {
                contentType: "application/pdf",
                customMetadata: {
                    originalDocument: documentPath,
                    signatureId: signatureDoc.id,
                    signature,
                    documentHash
                }
            }
        });
        res.json({
            success: true,
            data: {
                signatureId: signatureDoc.id,
                originalDocument: documentPath,
                signedDocument: signedFileName,
                signature,
                documentHash,
                signedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
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
exports.timeRecordWebhook = (0, https_1.onRequest)(async (req, res) => {
    // Configurar CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ error: "Método não permitido" });
        return;
    }
    try {
        const { action, data } = req.body;
        // Log do webhook
        await db.collection("webhookLogs").add({
            action,
            data,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            source: req.headers["user-agent"] || "unknown",
            ip: req.ip
        });
        // Processar diferentes tipos de ação
        switch (action) {
            case "sync_employee":
                // Sincronizar dados do funcionário
                await db.collection("employees").doc(data.id).set(data, { merge: true });
                break;
            case "export_records":
                // Exportar registros para sistema externo
                const records = await db
                    .collection("timeRecords")
                    .where("userId", "==", data.userId)
                    .where("timestamp", ">=", new Date(data.startDate))
                    .where("timestamp", "<=", new Date(data.endDate))
                    .get();
                res.json({
                    success: true,
                    records: records.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())))
                });
                return;
            default:
                res.status(400).json({ error: "Ação não reconhecida" });
                return;
        }
        res.json({ success: true, message: "Webhook processado com sucesso" });
    }
    catch (error) {
        console.error("Erro no webhook:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});
// Função auxiliar para gerar conteúdo AFD
async function generateAFDContent(empresaData, marcacoes) {
    const lines = [];
    // Registro tipo 1 - Cabeçalho
    const nsr = await getNextNSR();
    lines.push(`1${nsr.toString().padStart(9, '0')}${empresaData.cnpj.replace(/\D/g, '').padStart(14, '0')}${empresaData.razaoSocial.padEnd(150, ' ')}${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`);
    // Registros tipo 3 - Marcações
    for (const marcacao of marcacoes) {
        const data = marcacao.data();
        const nsrMarcacao = await getNextNSR();
        const dataHora = new Date(data.dataHoraTZ.toDate()).toISOString().slice(0, 19).replace(/[-:T]/g, '');
        lines.push(`3${nsrMarcacao.toString().padStart(9, '0')}${data.usuarioId.padEnd(12, ' ')}${dataHora}`);
    }
    // Registro tipo 9 - Rodapé
    const nsrRodape = await getNextNSR();
    lines.push(`9${nsrRodape.toString().padStart(9, '0')}${lines.length.toString().padStart(9, '0')}`);
    return lines.join('\r\n');
}
// Função auxiliar para obter próximo NSR
async function getNextNSR() {
    const nsrDoc = db.collection('sequences').doc('nsr');
    return db.runTransaction(async (transaction) => {
        var _a;
        const doc = await transaction.get(nsrDoc);
        const currentNSR = doc.exists ? ((_a = doc.data()) === null || _a === void 0 ? void 0 : _a.value) || 0 : 0;
        const nextNSR = currentNSR + 1;
        transaction.set(nsrDoc, { value: nextNSR }, { merge: true });
        return nextNSR;
    });
}
//# sourceMappingURL=index.js.map