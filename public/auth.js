/**
 * Living Canvas - Firebase Authentication & Profile Service
 * Integração com Firebase Auth, Firestore e credenciais credenciadas de Corretor
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

// Credencial oficial de Corretor Gestor solicitada
const BROKER_CREDENTIALS = {
  email: "gabrielmaxgestor@gmail.com",
  password: "12345678",
  user: {
    uid: "corretor_gabrielmaxgestor",
    email: "gabrielmaxgestor@gmail.com",
    displayName: "Gabriel Max",
    emailVerified: true
  },
  profile: {
    uid: "corretor_gabrielmaxgestor",
    nome: "Gabriel Max",
    email: "gabrielmaxgestor@gmail.com",
    role: "corretor",
    cargo: "Corretor Gestor",
    creci: "CRECI-SP 12345",
    telefone: "(11) 99999-9999",
    criadoEm: "2026-01-01T00:00:00.000Z"
  }
};

const SESSION_STORAGE_KEY = "lc_auth_session";
let localSessionUser = null;
let localSessionProfile = null;
const authChangeListeners = new Set();

// Cria um objeto de usuário seguro com métodos mock caso alguma biblioteca chame métodos do Firebase User
function createSafeUser(userData) {
  if (!userData) return null;
  return {
    ...userData,
    getIdToken: async () => "mock-broker-token",
    getIdTokenResult: async () => ({ token: "mock-broker-token", claims: { role: userData.role || "corretor" } }),
    reload: async () => {},
    _startProactiveRefresh() {},
    _stopProactiveRefresh() {}
  };
}

// Carrega sessão salva no navegador se existir
try {
  const saved = localStorage.getItem(SESSION_STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed && parsed.user && parsed.profile) {
      localSessionUser = createSafeUser(parsed.user);
      localSessionProfile = parsed.profile;
    }
  }
} catch (e) {
  console.warn("Aviso ao ler sessão salva:", e);
}

// Proxy seguro para auth: não corrompe a instância original do Firebase Auth SDK
const authProxy = new Proxy(auth, {
  get(target, prop, receiver) {
    if (prop === "currentUser") {
      return target.currentUser || localSessionUser;
    }
    const val = Reflect.get(target, prop, receiver);
    if (typeof val === "function") {
      return val.bind(target);
    }
    return val;
  }
});

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
    case "auth/operation-not-allowed":
      return "Operação de login indisponível no momento. Use as credenciais autorizadas.";
    default:
      return error?.message || "Ocorreu um erro ao processar a autenticação.";
  }
}

/**
 * Obter o perfil do usuário na coleção 'usuarios'
 */
async function getUserProfile(uid) {
  if (localSessionUser && localSessionUser.uid === uid) {
    return localSessionProfile;
  }

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

  const cleanEmail = email.trim().toLowerCase();

  // Se for o e-mail do corretor credenciado, direciona para login direto
  if (cleanEmail === BROKER_CREDENTIALS.email.toLowerCase()) {
    return login(cleanEmail, password);
  }

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
      profile: fullProfile
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

  const cleanEmail = email.trim().toLowerCase();

  // 1. Verificação da conta de Corretor Gestor
  if (cleanEmail === BROKER_CREDENTIALS.email.toLowerCase()) {
    if (password === BROKER_CREDENTIALS.password) {
      const safeUser = createSafeUser(BROKER_CREDENTIALS.user);
      const session = {
        user: safeUser,
        profile: BROKER_CREDENTIALS.profile,
        loggedAt: new Date().toISOString()
      };

      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } catch (e) {
        console.warn("Não foi possível persistir no localStorage:", e);
      }

      localSessionUser = safeUser;
      localSessionProfile = session.profile;

      notifyAuthListeners(localSessionUser, localSessionProfile);

      return {
        user: localSessionUser,
        profile: localSessionProfile
      };
    } else {
      throw new Error("Senha incorreta para a conta de corretor.");
    }
  }

  // 2. Fluxo padrão Firebase Auth
  try {
    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const user = userCredential.user;
    const profile = await getUserProfile(user.uid);
    
    notifyAuthListeners(user, profile);
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
    localSessionUser = null;
    localSessionProfile = null;
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {}

    if (auth.currentUser) {
      await signOut(auth).catch(() => {});
    }
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
    if (localSessionUser) {
      resolve({ user: localSessionUser, profile: localSessionProfile });
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

  if (localSessionUser) {
    setTimeout(() => {
      callback(localSessionUser, localSessionProfile);
    }, 0);
  }

  const unsubscribeFirebase = onAuthStateChanged(auth, async (user) => {
    if (localSessionUser) return; // Prioriza sessão local se ativa

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
 * Proteger páginas privadas (ex: dashboard.html)
 * Redireciona para login.html caso não haja sessão ativa
 */
async function requireAuth(redirectUrl = "login.html") {
  const { user, profile } = await getCurrentUser();
  if (!user) {
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `${redirectUrl}?redirect=${encodeURIComponent(currentPath)}`;
    return { user: null, profile: null };
  }
  return { user, profile };
}

/**
 * Redirecionar se já estiver autenticado (ex: na página login.html)
 */
async function redirectIfAuthenticated(destination = "dashboard.html") {
  const { user } = await getCurrentUser();
  if (user) {
    const params = new URLSearchParams(window.location.search);
    const redirectParam = params.get("redirect");
    window.location.href = redirectParam || destination;
  }
}

// Exporta globalmente para páginas HTML
const LivingCanvasAuth = {
  auth: authProxy,
  rawAuth: auth,
  get currentUser() {
    return auth.currentUser || localSessionUser;
  },
  db,
  login,
  register,
  logout,
  getCurrentUser,
  getUserProfile,
  onAuthStateChanged: onAuthChange,
  requireAuth,
  redirectIfAuthenticated,
  translateAuthError,
  BROKER_CREDENTIALS
};

window.LivingCanvasAuth = LivingCanvasAuth;
export default LivingCanvasAuth;
export {
  authProxy as auth,
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
