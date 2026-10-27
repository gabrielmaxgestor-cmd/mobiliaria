/**
 * Living Canvas - Firebase Authentication & Role-Based Access Service
 * Integração 100% nativa com Firebase Auth e Firestore (sem mocks ou credenciais fixas)
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

// Configuração oficial do Firebase obtida da infraestrutura do projeto
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

// Inicialização segura do Firebase App (evita duplicação)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Inicialização do Firestore com o databaseId customizado configurado
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

const authChangeListeners = new Set();

function notifyAuthListeners(user, profile) {
  authChangeListeners.forEach((callback) => {
    try {
      callback(user, profile);
    } catch (err) {
      console.error("Erro no ouvinte de autenticação:", err);
    }
  });
}

/**
 * Tradutor de códigos de erro do Firebase Auth para português com mensagens neutras
 * (evita enumeração de e-mails de usuários)
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
    case "auth/invalid-login-credentials":
      return "E-mail ou senha incorretos. Verifique suas credenciais.";
    case "auth/email-already-in-use":
      return "Este e-mail já está cadastrado. Tente fazer login ou recuperar a senha.";
    case "auth/weak-password":
      return "A senha é muito fraca. Utilize pelo menos 6 caracteres.";
    case "auth/network-request-failed":
      return "Falha de conexão. Verifique sua internet e tente novamente.";
    case "auth/too-many-requests":
      return "Muitas tentativas sem sucesso. Tente novamente mais tarde.";
    case "auth/operation-not-allowed":
      return "Operação de login indisponível no momento.";
    default:
      return "Ocorreu um erro ao processar a autenticação. Tente novamente.";
  }
}

/**
 * Validador estrito contra Open Redirect
 * Aceita somente caminhos relativos do mesmo site (ex: 'dashboard.html', '/painel-corretor.html?filtro=novo#leads')
 * Rejeita '//', '\', qualquer '://', 'javascript:', 'data:', 'vbscript:' e retorna fallback seguro.
 */
function safeRedirect(valor, fallback = "dashboard.html") {
  if (!valor || typeof valor !== "string") {
    return fallback;
  }
  const trimmed = valor.trim();
  if (!trimmed) {
    return fallback;
  }

  // Rejeita barras duplas iniciais, barras invertidas, protocolos e esquemas arbitrários
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("\\") ||
    trimmed.includes("\\") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ||
    trimmed.toLowerCase().includes("javascript:") ||
    trimmed.toLowerCase().includes("data:") ||
    trimmed.toLowerCase().includes("vbscript:")
  ) {
    return fallback;
  }

  // Aceita apenas caminhos relativos internos
  const relativePattern = /^(\/?[a-zA-Z0-9_\-][a-zA-Z0-9_\-\.\/]*)(?:\?([^#]*))?(?:#(.*))?$/;
  if (!relativePattern.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

/**
 * Obter o perfil do usuário na coleção 'usuarios'
 */
async function getUserProfile(uid) {
  if (!uid) return null;
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
 * Determina o papel do usuário:
 * 1. Leitura de custom claims no token JWT (getIdTokenResult(true))
 * 2. Fallback para campo 'role' em usuarios/{uid}
 * 3. Fallback final 'cliente'
 */
async function getRole(user) {
  if (!user || !user.uid) {
    return "cliente";
  }

  // 1. Tenta obter o papel pelo custom claim no token JWT (força refresh para obter claims recém-atribuídos)
  try {
    if (typeof user.getIdTokenResult === "function") {
      const tokenResult = await user.getIdTokenResult(true);
      if (tokenResult?.claims?.role) {
        return tokenResult.claims.role;
      }
    }
  } catch (err) {
    console.warn("Aviso ao ler custom claims do token:", err);
  }

  // 2. Fallback: consulta documento em usuarios/{uid} no Firestore
  try {
    const profile = await getUserProfile(user.uid);
    if (profile?.role) {
      return profile.role;
    }
  } catch (err) {
    console.warn("Aviso ao ler perfil do Firestore para obter role:", err);
  }

  // 3. Fallback final padrão
  return "cliente";
}

/**
 * Mapeia o papel para sua rota de painel correspondente
 * - 'corretor' -> 'painel-corretor.html'
 * - qualquer outro -> 'dashboard.html'
 */
function routeForRole(role) {
  if (role === "corretor") {
    return "painel-corretor.html";
  }
  return "dashboard.html";
}

/**
 * Guarda de rota baseada em papel
 * Se não logado -> redireciona para login.html?redirect=<destino seguro>
 * Se logado com papel diferente dos permitidos -> redireciona para routeForRole(papel real)
 */
async function requireRole(rolesPermitidos = ["cliente"], opts = {}) {
  const allowed = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];
  const loginUrl = opts.loginUrl || "login.html";

  const { user, profile } = await getCurrentUser();
  if (!user) {
    const currentPath = window.location.pathname.split("/").pop() || "dashboard.html";
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    const fullCurrent = safeRedirect(currentPath + search + hash, "dashboard.html");
    const target = `${loginUrl}?redirect=${encodeURIComponent(fullCurrent)}`;
    window.location.href = target;
    return { user: null, role: null, profile: null };
  }

  const role = await getRole(user);
  if (!allowed.includes(role)) {
    const correctRoute = routeForRole(role);
    window.location.href = correctRoute;
    return { user, role, profile };
  }

  return { user, role, profile };
}

/**
 * Cadastrar novo cliente
 * Sempre atribui o papel 'cliente' na coleção 'usuarios'
 */
async function register({ nome, email, password, telefone }) {
  if (!nome || !email || !password) {
    throw new Error("Por favor, preencha todos os campos obrigatórios.");
  }
  if (password.length < 6) {
    throw new Error("A senha deve ter pelo menos 6 caracteres.");
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
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
      email: cleanEmail,
      role: "cliente",
      telefone: telefone ? telefone.trim() : "",
      criadoEm: serverTimestamp()
    };

    await setDoc(userDocRef, profileData);

    const fullProfile = {
      ...profileData,
      criadoEm: new Date()
    };

    notifyAuthListeners(user, fullProfile);

    return {
      user,
      profile: fullProfile,
      role: "cliente"
    };
  } catch (error) {
    throw new Error(translateAuthError(error));
  }
}

/**
 * Realizar login com e-mail e senha exclusivamente via Firebase Auth
 */
async function login(email, password) {
  if (!email || !password) {
    throw new Error("Informe seu e-mail e senha.");
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const user = userCredential.user;
    const profile = await getUserProfile(user.uid);
    const role = await getRole(user);

    notifyAuthListeners(user, profile);
    return { user, profile, role };
  } catch (error) {
    throw new Error(translateAuthError(error));
  }
}

/**
 * Fazer logout da sessão no Firebase Auth
 */
async function logout() {
  try {
    await signOut(auth);
    notifyAuthListeners(null, null);
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
    if (auth.currentUser) {
      getUserProfile(auth.currentUser.uid).then((profile) => {
        resolve({ user: auth.currentUser, profile });
      }).catch(() => {
        resolve({ user: auth.currentUser, profile: null });
      });
      return;
    }

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
  authChangeListeners.add(callback);

  const unsubscribeFirebase = onAuthStateChanged(auth, async (user) => {
    if (user) {
      const profile = await getUserProfile(user.uid);
      callback(user, profile);
    } else {
      callback(null, null);
    }
  });

  return () => {
    authChangeListeners.delete(callback);
    unsubscribeFirebase();
  };
}

/**
 * Proteger páginas privadas (mantida para compatibilidade geral)
 * Redireciona para login.html caso não haja sessão ativa
 */
async function requireAuth(redirectUrl = "login.html") {
  const { user, profile } = await getCurrentUser();
  if (!user) {
    const currentPath = window.location.pathname.split("/").pop() || "dashboard.html";
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    const fullCurrent = safeRedirect(currentPath + search + hash, "dashboard.html");
    window.location.href = `${redirectUrl}?redirect=${encodeURIComponent(fullCurrent)}`;
    return { user: null, profile: null };
  }
  return { user, profile };
}

/**
 * Redirecionar se já estiver autenticado (ex: na página login.html)
 * Valida o destino solicitado com safeRedirect e routeForRole de acordo com o papel real
 */
async function redirectIfAuthenticated(destination) {
  const { user } = await getCurrentUser();
  if (!user) return;

  const role = await getRole(user);
  const defaultRoute = routeForRole(role);

  const params = new URLSearchParams(window.location.search);
  const rawRedirect = params.get("redirect");

  if (rawRedirect) {
    const sanitized = safeRedirect(rawRedirect, defaultRoute);
    // Destino deve ser compatível com o papel:
    if (role === "cliente" && sanitized.includes("painel-corretor.html")) {
      window.location.href = defaultRoute;
      return;
    }
    if (role === "corretor" && sanitized === "dashboard.html") {
      window.location.href = defaultRoute;
      return;
    }
    window.location.href = sanitized;
  } else {
    window.location.href = destination ? safeRedirect(destination, defaultRoute) : defaultRoute;
  }
}

// Objeto singleton unificado exportado para window e módulos ES
const LivingCanvasAuth = {
  auth,
  db,
  login,
  register,
  logout,
  getCurrentUser,
  getUserProfile,
  getRole,
  routeForRole,
  requireRole,
  safeRedirect,
  onAuthStateChanged: onAuthChange,
  requireAuth,
  redirectIfAuthenticated,
  translateAuthError
};

if (typeof window !== "undefined") {
  window.LivingCanvasAuth = LivingCanvasAuth;
}
export default LivingCanvasAuth;
export {
  auth,
  db,
  login,
  register,
  logout,
  getCurrentUser,
  getUserProfile,
  getRole,
  routeForRole,
  requireRole,
  safeRedirect,
  onAuthChange as onAuthStateChanged,
  requireAuth,
  redirectIfAuthenticated,
  translateAuthError
};
