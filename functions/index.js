/**
 * Living Canvas - Firebase Cloud Functions
 * Triggers de monitoramento da coleção 'imoveis' (onCreate, onUpdate e onWrite)
 * e motor de matching automático contra 'buscasDesejadas' para gerar 'notificacoes'.
 */

const functions = require("firebase-functions");
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const DATABASE_ID = "ai-studio-imobiliariabase-9b8dd04f-184a-4ea2-acf4-aadee30e202e";

/**
 * Obtém a instância correta do Firestore (com suporte ao databaseId específico do projeto)
 */
function getFirestoreDb() {
  try {
    if (DATABASE_ID && DATABASE_ID !== "(default)") {
      return admin.firestore(DATABASE_ID);
    }
    return admin.firestore();
  } catch (e) {
    return admin.firestore();
  }
}

const db = getFirestoreDb();

/**
 * Normaliza strings para comparação flexível (remove acentos e espaços extras)
 */
function normalizeText(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Valida se um imóvel cumpre os critérios configurados em uma busca desejada ativa
 * - Se um critério não foi preenchido na busca, ele atua como curinga (match universal)
 */
function matchesProperty(property, search) {
  if (!property || !search) return false;

  // 1. Tipo de imóvel (se informado na busca, deve ser compatível com o imóvel)
  if (search.tipo && typeof search.tipo === "string" && search.tipo.trim() !== "") {
    const searchTipo = normalizeText(search.tipo);
    const propTipo = normalizeText(property.tipo || "");
    if (searchTipo !== propTipo) {
      return false;
    }
  }

  // 2. Bairros (se houver lista com ao menos 1 bairro, o bairro do imóvel deve coincidir com um deles)
  if (Array.isArray(search.bairros) && search.bairros.length > 0) {
    const propBairro = normalizeText(
      property.endereco?.bairro || property.bairro || ""
    );

    if (!propBairro) {
      return false;
    }

    const matchesBairro = search.bairros.some((b) => {
      const searchBairro = normalizeText(b);
      return (
        searchBairro &&
        (propBairro.includes(searchBairro) || searchBairro.includes(propBairro))
      );
    });

    if (!matchesBairro) {
      return false;
    }
  }

  // 3. Faixa de Preço (Preço Mínimo e Preço Máximo)
  const propPrice = typeof property.preco === "number" ? property.preco : Number(property.preco) || 0;

  if (search.precoMin != null && search.precoMin !== "" && !isNaN(Number(search.precoMin))) {
    const minVal = Number(search.precoMin);
    if (minVal > 0 && propPrice < minVal) {
      return false;
    }
  }

  if (search.precoMax != null && search.precoMax !== "" && !isNaN(Number(search.precoMax))) {
    const maxVal = Number(search.precoMax);
    if (maxVal > 0 && propPrice > maxVal) {
      return false;
    }
  }

  // 4. Mínimo de Quartos (se preenchido na busca)
  if (search.quartosMin != null && search.quartosMin !== "" && !isNaN(Number(search.quartosMin))) {
    const minQuartos = Number(search.quartosMin);
    if (minQuartos > 0) {
      const propQuartos = Number(
        property.caracteristicas?.quartos ??
        property.characteristics?.quartos ??
        property.quartos ??
        0
      );
      if (propQuartos < minQuartos) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Motor central de matching: busca todas as buscas ativas e cria notificações no Firestore
 */
async function processPropertyMatching(imovelId, imovelData, contextInfo = "Trigger") {
  if (!imovelData || imovelData.status !== "disponivel") {
    console.log(`[Cloud Functions - ${contextInfo}] Imóvel ${imovelId} ignorado: status "${imovelData?.status}" != "disponivel"`);
    return { matchesCount: 0 };
  }

  console.log(`[Cloud Functions - ${contextInfo}] Executando matching para imóvel ${imovelId}: "${imovelData.titulo || ''}" (R$ ${imovelData.preco})`);

  // Busca todas as buscas desejadas ativas cadastradas por clientes
  const searchesSnapshot = await db
    .collection("buscasDesejadas")
    .where("ativa", "==", true)
    .get();

  if (searchesSnapshot.empty) {
    console.log(`[Cloud Functions - ${contextInfo}] Nenhuma busca desejada ativa encontrada.`);
    return { matchesCount: 0 };
  }

  let createdCount = 0;

  for (const docSnap of searchesSnapshot.docs) {
    const search = { id: docSnap.id, ...docSnap.data() };
    const usuarioId = search.usuarioId;

    if (!usuarioId) continue;

    // Valida se o imóvel cumpre os critérios do cliente
    if (matchesProperty(imovelData, search)) {
      // Chave determinística de deduplicação por usuário + imóvel + busca
      const notifDocId = `${usuarioId}_${imovelId}_${search.id}`;
      const notifRef = db.collection("notificacoes").doc(notifDocId);
      const notifSnap = await notifRef.get();

      if (!notifSnap.exists) {
        const notifPayload = {
          usuarioId: usuarioId,
          imovelId: imovelId,
          buscaId: search.id,
          buscaNome: search.nome || "Imóvel dos Sonhos",
          imovelTitulo: imovelData.titulo || "Novo Imóvel Disponível",
          imovelPreco: typeof imovelData.preco === "number" ? imovelData.preco : Number(imovelData.preco) || 0,
          imovelTipo: imovelData.tipo || "",
          imovelBairro: imovelData.endereco?.bairro || imovelData.bairro || "",
          imovelFoto: Array.isArray(imovelData.imagens) && imovelData.imagens.length > 0 ? imovelData.imagens[0] : null,
          lida: false,
          criadoEm: admin.firestore.FieldValue.serverTimestamp()
        };

        await notifRef.set(notifPayload);
        createdCount++;
        console.log(`[Cloud Functions - ${contextInfo}] Notificação ${notifDocId} criada com sucesso para o usuário ${usuarioId}`);
      } else {
        console.log(`[Cloud Functions - ${contextInfo}] Notificação ${notifDocId} já existia. Ignorando duplicata.`);
      }
    }
  }

  console.log(`[Cloud Functions - ${contextInfo}] Matching concluído para imóvel ${imovelId}: ${createdCount} notificações criadas.`);
  return { matchesCount: createdCount };
}

// =========================================================================
// TRIGGERS FIREBASE FUNCTIONS V1 (Compatibilidade Padrão)
// =========================================================================

/**
 * Trigger onCreate: disparado ao cadastrar um novo imóvel
 */
const onPropertyCreated = functions.firestore
  .document("imoveis/{imovelId}")
  .onCreate(async (snapshot, context) => {
    const imovelId = context.params.imovelId;
    const data = snapshot.data();
    return await processPropertyMatching(imovelId, data, "onCreate v1");
  });

/**
 * Trigger onUpdate: disparado ao atualizar um imóvel existente
 */
const onPropertyUpdated = functions.firestore
  .document("imoveis/{imovelId}")
  .onUpdate(async (change, context) => {
    const imovelId = context.params.imovelId;
    const afterData = change.after.data();
    const beforeData = change.before.data();

    // Se o status acabou de se tornar disponível ou se já é disponível
    if (afterData && afterData.status === "disponivel") {
      return await processPropertyMatching(imovelId, afterData, "onUpdate v1");
    }

    return null;
  });

/**
 * Trigger onWrite: listener unificado para criação/atualização
 */
const onPropertyWritten = functions.firestore
  .document("imoveis/{imovelId}")
  .onWrite(async (change, context) => {
    const imovelId = context.params.imovelId;
    const afterData = change.after.exists ? change.after.data() : null;

    if (!afterData || afterData.status !== "disponivel") {
      return null;
    }

    return await processPropertyMatching(imovelId, afterData, "onWrite v1");
  });

// =========================================================================
// TRIGGERS FIREBASE FUNCTIONS V2 (2nd Generation)
// =========================================================================

const onPropertyCreatedV2 = onDocumentCreated(
  {
    document: "imoveis/{imovelId}",
    database: DATABASE_ID || "(default)"
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const imovelId = event.params.imovelId;
    const data = snapshot.data();
    return await processPropertyMatching(imovelId, data, "onCreate v2");
  }
);

const onPropertyUpdatedV2 = onDocumentUpdated(
  {
    document: "imoveis/{imovelId}",
    database: DATABASE_ID || "(default)"
  },
  async (event) => {
    const change = event.data;
    if (!change) return;
    const imovelId = event.params.imovelId;
    const afterData = change.after.data();

    if (afterData && afterData.status === "disponivel") {
      return await processPropertyMatching(imovelId, afterData, "onUpdate v2");
    }
    return null;
  }
);

const onPropertyWrittenV2 = onDocumentWritten(
  {
    document: "imoveis/{imovelId}",
    database: DATABASE_ID || "(default)"
  },
  async (event) => {
    const change = event.data;
    if (!change) return;
    const imovelId = event.params.imovelId;
    const afterData = change.after ? change.after.data() : null;

    if (!afterData || afterData.status !== "disponivel") {
      return null;
    }

    return await processPropertyMatching(imovelId, afterData, "onWrite v2");
  }
);

// Exportações
module.exports = {
  // Triggers v1
  onPropertyCreated,
  onPropertyUpdated,
  onPropertyWritten,

  // Triggers v2
  onPropertyCreatedV2,
  onPropertyUpdatedV2,
  onPropertyWrittenV2,

  // Funções Utilitárias & Motor
  matchesProperty,
  processPropertyMatching,
  normalizeText
};
