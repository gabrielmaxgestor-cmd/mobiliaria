/**
 * Living Canvas - Firebase Authentication & Profile Service
 * Integração com Firebase Auth e Firestore para as páginas públicas HTML
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

// Configuração padrão do Firebase obtida da infraestrutura do projeto
const firebaseConfig = {
  projectId: "climbing-starlight-m8gvj",
  appId: "1:371500905682:web:c04d452d25ac0343a9290b",
  apiKey: "AIzaSyBAUZyQSC8Bf3GswNTS-DArmLsrdNC-pW4",
  authDomain: "climbing-starlight-m8gvj.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-imobiliariabase-9b8dd04f-184a-4ea2-acf4-aadee30e202e",
  storageBucket: "climbing-starlight-m8gvj.firebasestorage.app",
  messagingSenderId: "371500905682",
  oAuthClientId: "371500905682-36c10kb8uhkojpcicu0pnr1ib12jq0e0.apps.googleusercontent.com"
};

// Inicialização do Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Inicialização do Firestore com o databaseId configurado
let db;
try {
  if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } else {
    db = getFirestore(app);
  }
} catch (e) {
  console.warn("Inicializando Firestore no modo padrão:", e);
  db = getFirestore(app);
}

/**
 * Tradutor de códigos de erro do Firebase Auth para português
 */
function translateAuthError(error) {
  const code = error?.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "O endereço de e-mail informado não é válido.";
    case "auth/user-disabled":
      return "Esta conta foi desativada temporariamente.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "E-mail ou senha incorretos. Verifique suas credenciais.";
    case "auth/email-already-in-use":
      return "Este e-mail já está cadastrado. Tente fazer login ou recuperar a senha.";
    case "auth/weak-password":
      return "A senha é muito fraca. Utilize pelo menos 6 caracteres.";
    case "auth/network-request-failed":
      return "Falha de conexão. Verifique sua internet e tente novamente.";
    case "auth/too-many-requests":
      return "Muitas tentativas sem sucesso. Tente novamente mais tarde.";
    default:
      return error?.message || "Ocorreu um erro ao processar a autenticação.";
  }
}

/**
 * Obter o perfil do usuário na coleção 'usuarios'
 */
async function getUserProfile(uid) {
  try {
    const userDocRef = doc(db, "usuarios", uid);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (err) {
    console.error("Erro ao buscar perfil do usuário no Firestore:", err);
    return null;
  }
}

/**
 * Cadastrar novo cliente
 */
async function register({ nome, email, password, telefone }) {
  if (!nome || !email || !password) {
    throw new Error("Por favor, preencha todos os campos obrigatórios.");
  }
  if (password.length < 6) {
    throw new Error("A senha deve ter pelo menos 6 caracteres.");
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const user = userCredential.user;

    // Atualiza nome de exibição no Firebase Auth
    try {
      await updateProfile(user, { displayName: nome.trim() });
    } catch (profileErr) {
      console.warn("Aviso ao atualizar displayName no Auth:", profileErr);
    }

    // Cria documento na coleção "usuarios" no Firestore
    const userDocRef = doc(db, "usuarios", user.uid);
    const profileData = {
      uid: user.uid,
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      role: "cliente",
      telefone: telefone ? telefone.trim() : "",
      criadoEm: serverTimestamp()
    };

    await setDoc(userDocRef, profileData);

    return {
      user,
      profile: {
        ...profileData,
        criadoEm: new Date()
      }
    };
  } catch (error) {
    throw new Error(translateAuthError(error));
  }
}

/**
 * Realizar login com e-mail e senha
 */
async function login(email, password) {
  if (!email || !password) {
    throw new Error("Informe seu e-mail e senha.");
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const user = userCredential.user;
    const profile = await getUserProfile(user.uid);
    return { user, profile };
  } catch (error) {
    throw new Error(translateAuthError(error));
  }
}

/**
 * Fazer logout da sessão
 */
async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Erro ao deslogar:", error);
    throw error;
  }
}

/**
 * Obter usuário atual de forma assíncrona garantida
 */
function getCurrentUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        const profile = await getUserProfile(user.uid);
        resolve({ user, profile });
      } else {
        resolve({ user: null, profile: null });
      }
    });
  });
}

/**
 * Escutar mudanças no estado de autenticação
 */
function onAuthChange(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const profile = await getUserProfile(user.uid);
      callback(user, profile);
    } else {
      callback(null, null);
    }
  });
}

/**
 * Proteger páginas privadas (ex: dashboard.html)
 * Redireciona para login.html caso não haja sessão ativa
 */
function requireAuth(redirectUrl = "login.html") {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) {
        const currentPath = window.location.pathname + window.location.search;
        window.location.href = `${redirectUrl}?redirect=${encodeURIComponent(currentPath)}`;
      } else {
        const profile = await getUserProfile(user.uid);
        resolve({ user, profile });
      }
    });
  });
}

/**
 * Redirecionar se já estiver autenticado (ex: na página login.html)
 */
function redirectIfAuthenticated(destination = "dashboard.html") {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (user) {
        const params = new URLSearchParams(window.location.search);
        const redirectParam = params.get("redirect");
        window.location.href = redirectParam || destination;
      } else {
        resolve(null);
      }
    });
  });
}

// Exporta globalmente para páginas HTML
const LivingCanvasAuth = {
  auth,
  db,
  login,
  register,
  logout,
  getCurrentUser,
  getUserProfile,
  onAuthStateChanged: onAuthChange,
  requireAuth,
  redirectIfAuthenticated,
  translateAuthError
};

window.LivingCanvasAuth = LivingCanvasAuth;
export default LivingCanvasAuth;
export {
  auth,
  db,
  login,
  register,
  logout,
  getCurrentUser,
  getUserProfile,
  onAuthChange as onAuthStateChanged,
  requireAuth,
  redirectIfAuthenticated
};
