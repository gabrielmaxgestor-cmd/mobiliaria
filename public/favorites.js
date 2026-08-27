/**
 * Living Canvas - Data Access Layer para Favoritos (Firestore)
 * Gerenciamento de lista privada de imóveis favoritados pelo cliente
 */

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import LivingCanvasAuth from "./auth.js";
import { getPropertyById } from "./properties.js";

const db = LivingCanvasAuth.db;
const COLLECTION_FAVORITOS = "favoritos";

// Cache em memória dos IDs favoritados do usuário atual
let cachedFavoriteIds = new Set();
let currentUserId = null;
const listeners = new Set();

/**
 * Notifica ouvintes registrados quando a lista de favoritos muda
 */
function notifyListeners() {
  const ids = Array.from(cachedFavoriteIds);
  listeners.forEach(cb => {
    try { cb(ids); } catch (e) { console.warn("Erro no listener de favoritos:", e); }
  });
}

/**
 * Gera o ID do documento determinístico para garantir unicidade: {usuarioId}_{imovelId}
 */
function getFavoriteDocId(userId, imovelId) {
  const cleanImovelId = String(imovelId).trim();
  return `${userId}_${cleanImovelId}`;
}

/**
 * Inicializa e carrega os favoritos do usuário conectado
 */
export async function initUserFavorites() {
  try {
    const { user } = await LivingCanvasAuth.getCurrentUser();
    if (!user) {
      currentUserId = null;
      cachedFavoriteIds = new Set();
      notifyListeners();
      return cachedFavoriteIds;
    }

    currentUserId = user.uid;
    const q = query(
      collection(db, COLLECTION_FAVORITOS),
      where("usuarioId", "==", user.uid)
    );

    const snapshot = await getDocs(q);
    const set = new Set();
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.imovelId) {
        set.add(data.imovelId);
      }
    });

    cachedFavoriteIds = set;
    notifyListeners();
    return cachedFavoriteIds;
  } catch (err) {
    console.warn("Aviso ao carregar favoritos do Firestore:", err);
    return cachedFavoriteIds;
  }
}

/**
 * Escuta mudanças de autenticação para recarregar favoritos
 */
LivingCanvasAuth.onAuthStateChanged((user) => {
  if (user) {
    initUserFavorites();
  } else {
    currentUserId = null;
    cachedFavoriteIds.clear();
    notifyListeners();
  }
});

/**
 * Verifica se um imóvel específico está favoritado
 */
export function isPropertyFavorited(imovelId) {
  if (!imovelId) return false;
  return cachedFavoriteIds.has(String(imovelId).trim());
}

/**
 * Alterna o estado de favorito de um imóvel
 * Se o usuário não estiver logado, redireciona para login.html com retorno automático
 * Retorna true se agora está favoritado, false se foi removido
 */
export async function toggleFavorite(imovelId) {
  if (!imovelId) throw new Error("ID do imóvel inválido.");

  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser) {
    // Redireciona para o login mantendo o destino de retorno
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `login.html?redirect=${encodeURIComponent(currentPath)}`;
    return false;
  }

  const userId = currentUser.uid;
  const docId = getFavoriteDocId(userId, imovelId);
  const favDocRef = doc(db, COLLECTION_FAVORITOS, docId);
  const alreadyFav = cachedFavoriteIds.has(String(imovelId).trim());

  if (alreadyFav) {
    // Remover dos favoritos
    try {
      await deleteDoc(favDocRef);
      cachedFavoriteIds.delete(String(imovelId).trim());
      notifyListeners();
      return false;
    } catch (err) {
      console.error("Erro ao remover favorito:", err);
      throw err;
    }
  } else {
    // Adicionar aos favoritos com unicidade garantida
    try {
      const favData = {
        usuarioId: userId,
        imovelId: String(imovelId).trim(),
        criadoEm: serverTimestamp()
      };
      await setDoc(favDocRef, favData);
      cachedFavoriteIds.add(String(imovelId).trim());
      notifyListeners();
      return true;
    } catch (err) {
      console.error("Erro ao adicionar favorito:", err);
      throw err;
    }
  }
}

/**
 * Remove um favorito diretamente pelo ID do imóvel
 */
export async function removeFavorite(imovelId) {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser || !imovelId) return false;

  const docId = getFavoriteDocId(currentUser.uid, imovelId);
  const favDocRef = doc(db, COLLECTION_FAVORITOS, docId);

  try {
    await deleteDoc(favDocRef);
    cachedFavoriteIds.delete(String(imovelId).trim());
    notifyListeners();
    return true;
  } catch (err) {
    console.error("Erro ao remover favorito:", err);
    throw err;
  }
}

/**
 * Busca a lista completa de imóveis favoritados pelo cliente conectado (com dados completos de cada imóvel)
 */
export async function getFavoriteProperties() {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser) {
    const { user } = await LivingCanvasAuth.getCurrentUser();
    if (!user) return [];
  }

  const uid = LivingCanvasAuth.auth.currentUser?.uid;
  if (!uid) return [];

  try {
    const q = query(
      collection(db, COLLECTION_FAVORITOS),
      where("usuarioId", "==", uid)
    );

    const snapshot = await getDocs(q);
    const favoriteEntries = [];
    snapshot.forEach(d => {
      favoriteEntries.push({ id: d.id, ...d.data() });
    });

    // Atualiza cache de IDs
    cachedFavoriteIds = new Set(favoriteEntries.map(f => f.imovelId));

    // Carrega os dados detalhados de cada imóvel em paralelo
    const propertiesPromises = favoriteEntries.map(async (fav) => {
      const propData = await getPropertyById(fav.imovelId);
      if (propData) {
        return {
          ...propData,
          favoriteDocId: fav.id,
          favoritadoEm: fav.criadoEm
        };
      }
      return null;
    });

    const results = await Promise.all(propertiesPromises);
    return results.filter(Boolean);
  } catch (err) {
    console.error("Erro ao obter lista de imóveis favoritos:", err);
    return [];
  }
}

/**
 * Registra um callback para ser notificado de alterações nos favoritos
 */
export function onFavoritesChanged(callback) {
  if (typeof callback === 'function') {
    listeners.add(callback);
    // Notifica imediatamente com o estado atual
    callback(Array.from(cachedFavoriteIds));
  }
  return () => listeners.delete(callback);
}

// Exposição global para uso nos scripts HTML
const LivingCanvasFavorites = {
  initUserFavorites,
  isPropertyFavorited,
  toggleFavorite,
  removeFavorite,
  getFavoriteProperties,
  onFavoritesChanged,
  getFavoriteIds: () => Array.from(cachedFavoriteIds)
};

window.LivingCanvasFavorites = LivingCanvasFavorites;
export default LivingCanvasFavorites;
