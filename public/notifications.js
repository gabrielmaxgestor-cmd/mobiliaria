/**
 * Living Canvas - Notification Service (Firestore Client DAL)
 * Gerencia notificações de correspondência entre buscas desejadas e imóveis disponíveis
 */

import { 
  collection, 
  doc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import LivingCanvasAuth from "./auth.js";

const db = LivingCanvasAuth.db;
const NOTIFICATIONS_COLLECTION = "notificacoes";

/**
 * Retorna apenas as notificações não lidas do usuário logado (lida == false)
 */
export async function getUnreadNotifications(limitCount = 30) {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser) return [];

  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where("usuarioId", "==", currentUser.uid),
      where("lida", "==", false),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    const list = querySnapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    list.sort((a, b) => {
      const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
      const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
      return timeB - timeA;
    });

    return list;
  } catch (error) {
    console.warn("Consulta direta de não lidas gerou aviso, executando consulta segura:", error);
    try {
      const fallbackQuery = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where("usuarioId", "==", currentUser.uid)
      );
      const snapshot = await getDocs(fallbackQuery);
      const items = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(n => n.lida === false);

      items.sort((a, b) => {
        const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
        const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
        return timeB - timeA;
      });

      return items.slice(0, limitCount);
    } catch (fallbackErr) {
      console.error("Erro ao carregar notificações não lidas:", fallbackErr);
      return [];
    }
  }
}

/**
 * Escuta notificações não lidas em tempo real (lida == false)
 */
export function subscribeToUnreadNotifications(callback) {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser || typeof callback !== "function") return () => {};

  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where("usuarioId", "==", currentUser.uid),
      where("lida", "==", false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      list.sort((a, b) => {
        const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
        const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
        return timeB - timeA;
      });

      callback(list);
    }, (error) => {
      console.warn("Aviso na assinatura em tempo real de não lidas:", error);
      // Fallback para listener padrão
      return subscribeToNotifications((all) => {
        callback(all.filter(n => !n.lida));
      });
    });

    return unsubscribe;
  } catch (err) {
    console.warn("Erro ao configurar listener de notificações não lidas:", err);
    return () => {};
  }
}

/**
 * Retorna as notificações do usuário logado (ordenadas por data decrescente)
 */
export async function getNotifications(limitCount = 30) {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser) return [];

  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where("usuarioId", "==", currentUser.uid),
      orderBy("criadoEm", "desc"),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  } catch (error) {
    // Se índice composto ainda não estiver gerado, faz query simples com filtro/ordenação em memória
    console.warn("Consulta indexada de notificações gerou aviso, executando consulta segura:", error);
    try {
      const fallbackQuery = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where("usuarioId", "==", currentUser.uid)
      );
      const snapshot = await getDocs(fallbackQuery);
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => {
        const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
        const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
        return timeB - timeA;
      });
      return items.slice(0, limitCount);
    } catch (fallbackErr) {
      console.error("Erro ao carregar notificações do Firestore:", fallbackErr);
      return [];
    }
  }
}

/**
 * Retorna a contagem de notificações não lidas
 */
export async function getUnreadCount() {
  const list = await getNotifications(50);
  return list.filter(item => !item.lida).length;
}

/**
 * Marca uma notificação individual como lida
 */
export async function markAsRead(notificationId) {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser || !notificationId) return;

  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
    await updateDoc(docRef, {
      lida: true
    });
    return true;
  } catch (err) {
    console.error(`Erro ao marcar notificação ${notificationId} como lida:`, err);
    throw err;
  }
}

/**
 * Marca todas as notificações não lidas do usuário logado como lidas
 */
export async function markAllAsRead() {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser) return;

  try {
    const notifications = await getNotifications(50);
    const unread = notifications.filter(n => !n.lida);

    await Promise.all(
      unread.map(n => {
        const docRef = doc(db, NOTIFICATIONS_COLLECTION, n.id);
        return updateDoc(docRef, { lida: true });
      })
    );

    return true;
  } catch (err) {
    console.error("Erro ao marcar todas as notificações como lidas:", err);
    throw err;
  }
}

/**
 * Remove uma notificação do usuário
 */
export async function deleteNotification(notificationId) {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser || !notificationId) return;

  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error(`Erro ao excluir notificação ${notificationId}:`, err);
    throw err;
  }
}

/**
 * Cria listener em tempo real para atualizações de notificações do usuário
 */
export function subscribeToNotifications(callback) {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser || typeof callback !== "function") return () => {};

  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where("usuarioId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      list.sort((a, b) => {
        const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
        const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
        return timeB - timeA;
      });

      callback(list);
    }, (error) => {
      console.warn("Aviso na assinatura em tempo real de notificações:", error);
    });

    return unsubscribe;
  } catch (err) {
    console.warn("Erro ao configurar listener de notificações:", err);
    return () => {};
  }
}

window.LivingCanvasNotifications = {
  getNotifications,
  getUnreadNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  subscribeToNotifications,
  subscribeToUnreadNotifications
};

export default window.LivingCanvasNotifications;
