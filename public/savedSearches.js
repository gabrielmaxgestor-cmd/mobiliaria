/**
 * Living Canvas - Data Access Layer para Buscas Desejadas ("Meu Imóvel dos Sonhos")
 * Gestão e persistência de critérios de busca personalizada no Firestore
 */

import { 
  collection, 
  doc, 
  addDoc,
  getDocs, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import LivingCanvasAuth from "./auth.js";

const db = LivingCanvasAuth.db;
const COLLECTION_BUSCAS = "buscasDesejadas";

/**
 * Busca todas as buscas desejadas cadastradas pelo usuário atualmente logado
 */
export async function getSavedSearches() {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser) {
    const { user } = await LivingCanvasAuth.getCurrentUser();
    if (!user) return [];
  }

  const uid = LivingCanvasAuth.auth.currentUser?.uid;
  if (!uid) return [];

  try {
    const q = query(
      collection(db, COLLECTION_BUSCAS),
      where("usuarioId", "==", uid)
    );

    const snapshot = await getDocs(q);
    const searches = [];
    snapshot.forEach((docSnap) => {
      searches.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    // Ordenar em memória pelas mais recentes
    searches.sort((a, b) => {
      const timeA = a.atualizadoEm?.toMillis ? a.atualizadoEm.toMillis() : (new Date(a.atualizadoEm || a.criadoEm || 0).getTime());
      const timeB = b.atualizadoEm?.toMillis ? b.atualizadoEm.toMillis() : (new Date(b.atualizadoEm || b.criadoEm || 0).getTime());
      return timeB - timeA;
    });

    return searches;
  } catch (err) {
    console.error("Erro ao buscar buscas desejadas no Firestore:", err);
    throw err;
  }
}

/**
 * Cadastra uma nova busca desejada para o usuário autenticado
 * @param {Object} data
 * @param {string} data.nome - Nome identificador (obrigatório)
 * @param {string} [data.tipo] - Tipo do imóvel ou vazio
 * @param {string[]} [data.bairros] - Array de bairros de interesse
 * @param {number|null} [data.precoMin] - Preço mínimo
 * @param {number|null} [data.precoMax] - Preço máximo
 * @param {number|null} [data.quartosMin] - Quantidade mínima de quartos
 * @param {string} [data.observacoes] - Notas e observações livres
 * @param {boolean} [data.ativa=true] - Se a busca está ativa
 */
export async function createSavedSearch(data) {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser) {
    throw new Error("Você precisa estar autenticado para salvar uma busca.");
  }

  if (!data.nome || !data.nome.trim()) {
    throw new Error("O nome da busca desejada é obrigatório.");
  }

  const payload = {
    usuarioId: currentUser.uid,
    nome: data.nome.trim(),
    tipo: (data.tipo || "").trim().toLowerCase(),
    bairros: Array.isArray(data.bairros) 
      ? data.bairros.map(b => b.trim()).filter(Boolean)
      : [],
    precoMin: data.precoMin ? Number(data.precoMin) : null,
    precoMax: data.precoMax ? Number(data.precoMax) : null,
    quartosMin: data.quartosMin ? Number(data.quartosMin) : null,
    observacoes: (data.observacoes || "").trim(),
    ativa: data.ativa !== undefined ? Boolean(data.ativa) : true,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp()
  };

  try {
    const docRef = await addDoc(collection(db, COLLECTION_BUSCAS), payload);
    return {
      id: docRef.id,
      ...payload
    };
  } catch (err) {
    console.error("Erro ao criar busca desejada:", err);
    throw err;
  }
}

/**
 * Atualiza os critérios de uma busca desejada existente
 * @param {string} searchId 
 * @param {Object} data 
 */
export async function updateSavedSearch(searchId, data) {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser) {
    throw new Error("Você precisa estar autenticado para editar uma busca.");
  }

  if (!searchId) throw new Error("ID da busca não fornecido.");

  const docRef = doc(db, COLLECTION_BUSCAS, searchId);

  const updates = {
    atualizadoEm: serverTimestamp()
  };

  if (data.nome !== undefined) {
    if (!data.nome.trim()) throw new Error("O nome da busca não pode ficar vazio.");
    updates.nome = data.nome.trim();
  }

  if (data.tipo !== undefined) {
    updates.tipo = (data.tipo || "").trim().toLowerCase();
  }

  if (data.bairros !== undefined) {
    updates.bairros = Array.isArray(data.bairros) 
      ? data.bairros.map(b => b.trim()).filter(Boolean)
      : [];
  }

  if (data.precoMin !== undefined) {
    updates.precoMin = data.precoMin ? Number(data.precoMin) : null;
  }

  if (data.precoMax !== undefined) {
    updates.precoMax = data.precoMax ? Number(data.precoMax) : null;
  }

  if (data.quartosMin !== undefined) {
    updates.quartosMin = data.quartosMin ? Number(data.quartosMin) : null;
  }

  if (data.observacoes !== undefined) {
    updates.observacoes = (data.observacoes || "").trim();
  }

  if (data.ativa !== undefined) {
    updates.ativa = Boolean(data.ativa);
  }

  try {
    await updateDoc(docRef, updates);
    return true;
  } catch (err) {
    console.error("Erro ao atualizar busca desejada:", err);
    throw err;
  }
}

/**
 * Alterna o status (ativa/inativa) de uma busca desejada
 * @param {string} searchId 
 * @param {boolean} currentStatus 
 */
export async function toggleSavedSearchStatus(searchId, currentStatus) {
  return updateSavedSearch(searchId, { ativa: !currentStatus });
}

/**
 * Exclui uma busca desejada do cliente
 * @param {string} searchId 
 */
export async function deleteSavedSearch(searchId) {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser) {
    throw new Error("Você precisa estar autenticado para excluir uma busca.");
  }

  if (!searchId) throw new Error("ID da busca não fornecido.");

  try {
    const docRef = doc(db, COLLECTION_BUSCAS, searchId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error("Erro ao excluir busca desejada:", err);
    throw err;
  }
}

/**
 * Formata os critérios em uma descrição legível e elegante
 */
export function formatSearchCriteria(search) {
  const parts = [];

  if (search.tipo) {
    const tipoCapitalized = search.tipo.charAt(0).toUpperCase() + search.tipo.slice(1);
    parts.push(`Tipo: ${tipoCapitalized}`);
  } else {
    parts.push("Qualquer tipo");
  }

  if (search.quartosMin) {
    parts.push(`Min. ${search.quartosMin} quarto${search.quartosMin > 1 ? 's' : ''}`);
  }

  if (search.precoMin && search.precoMax) {
    parts.push(`R$ ${(search.precoMin / 1000000).toFixed(1)}M – R$ ${(search.precoMax / 1000000).toFixed(1)}M`);
  } else if (search.precoMin) {
    parts.push(`A partir de R$ ${(search.precoMin / 1000000).toFixed(1)}M`);
  } else if (search.precoMax) {
    parts.push(`Até R$ ${(search.precoMax / 1000000).toFixed(1)}M`);
  }

  return parts;
}

const LivingCanvasSavedSearches = {
  getSavedSearches,
  createSavedSearch,
  updateSavedSearch,
  toggleSavedSearchStatus,
  deleteSavedSearch,
  formatSearchCriteria
};

window.LivingCanvasSavedSearches = LivingCanvasSavedSearches;
export default LivingCanvasSavedSearches;
