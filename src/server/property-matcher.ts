import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PROJECT_ID = "climbing-starlight-m8gvj";
const DATABASE_ID = "ai-studio-imobiliariabase-9b8dd04f-184a-4ea2-acf4-aadee30e202e";

let adminApp: ReturnType<typeof initializeApp> | null = null;
let adminDb: ReturnType<typeof getFirestore> | null = null;

function getAdminFirestore() {
  if (!adminDb) {
    try {
      if (getApps().length === 0) {
        adminApp = initializeApp({
          projectId: PROJECT_ID,
        });
      } else {
        adminApp = getApps()[0];
      }

      if (DATABASE_ID && DATABASE_ID !== "(default)") {
        adminDb = getFirestore(adminApp, DATABASE_ID);
      } else {
        adminDb = getFirestore(adminApp);
      }
    } catch (err) {
      console.warn("[Property Matcher] Erro ao inicializar Firestore Admin direto:", err);
    }
  }
  return adminDb;
}

/**
 * Normaliza textos para comparação flexível
 */
function normalizeText(text: unknown): string {
  if (!text || typeof text !== "string") return "";
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export interface MatchingResult {
  success: boolean;
  imovelId: string;
  matchesCount: number;
  matchedSearches: Array<{
    usuarioId: string;
    buscaId: string;
    buscaNome: string;
  }>;
  error?: string;
}

/**
 * Verifica se os dados de um imóvel cumprem os critérios de uma busca desejada ativa
 */
export function propertyMatchesSearch(property: any, search: any): boolean {
  if (!property || !search) return false;

  // 1. Tipo de imóvel (se preenchido na busca, precisa bater com o do imóvel)
  if (search.tipo && typeof search.tipo === "string" && search.tipo.trim() !== "") {
    const searchTipo = normalizeText(search.tipo);
    const propTipo = normalizeText(property.tipo);
    if (searchTipo !== propTipo) {
      return false;
    }
  }

  // 2. Bairros (se a lista não estiver vazia, o bairro do imóvel precisa estar nela)
  if (Array.isArray(search.bairros) && search.bairros.length > 0) {
    const propBairro = normalizeText(
      property.endereco?.bairro || property.bairro || ""
    );

    if (!propBairro) {
      return false;
    }

    const matchesBairro = search.bairros.some((b: string) => {
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

  // 3. Faixa de Preço (precoMin e precoMax se preenchidos)
  const propPrice =
    typeof property.preco === "number"
      ? property.preco
      : Number(property.preco) || 0;

  if (
    search.precoMin != null &&
    search.precoMin !== "" &&
    !isNaN(Number(search.precoMin))
  ) {
    const minVal = Number(search.precoMin);
    if (minVal > 0 && propPrice < minVal) {
      return false;
    }
  }

  if (
    search.precoMax != null &&
    search.precoMax !== "" &&
    !isNaN(Number(search.precoMax))
  ) {
    const maxVal = Number(search.precoMax);
    if (maxVal > 0 && propPrice > maxVal) {
      return false;
    }
  }

  // 4. Mínimo de Quartos (quartosMin se preenchido)
  if (
    search.quartosMin != null &&
    search.quartosMin !== "" &&
    !isNaN(Number(search.quartosMin))
  ) {
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
 * Executa o matching de um imóvel contra todas as buscas ativas e persiste notificações
 */
export async function matchAndNotifyProperty(
  imovelId: string,
  providedPropertyData?: any
): Promise<MatchingResult> {
  const result: MatchingResult = {
    success: true,
    imovelId,
    matchesCount: 0,
    matchedSearches: [],
  };

  try {
    const db = getAdminFirestore();
    let propertyData = providedPropertyData;

    // Se os dados do imóvel não foram passados diretamente, busca no Firestore
    if (!propertyData && db) {
      const docSnap = await db.collection("imoveis").doc(imovelId).get();
      if (docSnap.exists) {
        propertyData = { id: docSnap.id, ...docSnap.data() };
      }
    }

    if (!propertyData) {
      return {
        ...result,
        success: false,
        error: `Imóvel com ID ${imovelId} não foi encontrado.`,
      };
    }

    // Disparar apenas quando o imóvel resultante tem status == "disponivel"
    if (propertyData.status !== "disponivel") {
      console.log(
        `[Property Matcher] Imóvel ${imovelId} ignorado pois status é '${propertyData.status}'`
      );
      return result;
    }

    if (!db) {
      throw new Error("Não foi possível inicializar conexão com Firestore Admin.");
    }

    // Buscar todas as buscas desejadas ativas
    const searchesSnap = await db
      .collection("buscasDesejadas")
      .where("ativa", "==", true)
      .get();

    if (searchesSnap.empty) {
      console.log("[Property Matcher] Nenhuma busca desejada ativa encontrada.");
      return result;
    }

    for (const docSnap of searchesSnap.docs) {
      const search = { id: docSnap.id, ...docSnap.data() } as any;
      const usuarioId = search.usuarioId;

      if (!usuarioId) continue;

      if (propertyMatchesSearch(propertyData, search)) {
        // Chave de deduplicação composta
        const notifDocId = `${usuarioId}_${imovelId}_${search.id}`;
        const notifRef = db.collection("notificacoes").doc(notifDocId);
        const notifSnap = await notifRef.get();

        if (!notifSnap.exists) {
          await notifRef.set({
            usuarioId,
            imovelId,
            buscaId: search.id,
            buscaNome: search.nome || "Imóvel dos Sonhos",
            imovelTitulo: propertyData.titulo || "Novo Imóvel Disponível",
            imovelPreco:
              typeof propertyData.preco === "number"
                ? propertyData.preco
                : Number(propertyData.preco) || 0,
            imovelTipo: propertyData.tipo || "",
            imovelBairro:
              propertyData.endereco?.bairro || propertyData.bairro || "",
            imovelFoto:
              Array.isArray(propertyData.imagens) &&
              propertyData.imagens.length > 0
                ? propertyData.imagens[0]
                : null,
            lida: false,
            criadoEm: FieldValue.serverTimestamp(),
          });

          result.matchesCount++;
          result.matchedSearches.push({
            usuarioId,
            buscaId: search.id,
            buscaNome: search.nome || "Imóvel dos Sonhos",
          });
          console.log(
            `[Property Matcher] Notificação criada para ${usuarioId} (busca "${search.nome}", doc: ${notifDocId})`
          );
        } else {
          console.log(
            `[Property Matcher] Notificação ${notifDocId} já existente. Ignorando duplicata.`
          );
        }
      }
    }

    return result;
  } catch (err: any) {
    console.error("[Property Matcher] Erro no processamento de matching:", err);
    return {
      ...result,
      success: false,
      error: err.message || "Erro desconhecido durante matching.",
    };
  }
}
