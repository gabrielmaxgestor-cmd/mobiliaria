import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebaseAuth, getFirebaseFirestore } from "./firebase";
import { UserProfile, UserRole } from "../types/auth";

export interface RegisterParams {
  nome: string;
  email: string;
  password: string;
  telefone?: string;
}

export async function registerCliente({
  nome,
  email,
  password,
  telefone,
}: RegisterParams): Promise<{ user: User; profile: UserProfile }> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();

  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // Atualiza displayName no Auth
  await updateProfile(user, { displayName: nome });

  // Documento na coleção Firestore "usuarios"
  const userDocRef = doc(db, "usuarios", user.uid);
  const profileData = {
    uid: user.uid,
    nome: nome.trim(),
    email: email.trim().toLowerCase(),
    role: "cliente" as UserRole,
    telefone: telefone ? telefone.trim() : "",
    criadoEm: serverTimestamp(),
  };

  await setDoc(userDocRef, profileData);

  return {
    user,
    profile: {
      ...profileData,
      criadoEm: new Date(),
    },
  };
}

export async function loginUser(email: string, password: string): Promise<{ user: User; profile: UserProfile | null }> {
  const auth = getFirebaseAuth();
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  const profile = await getUserProfile(user.uid);
  return { user, profile };
}

export async function logoutUser(): Promise<void> {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const db = getFirebaseFirestore();
  const userDocRef = doc(db, "usuarios", uid);
  const docSnap = await getDoc(userDocRef);

  if (docSnap.exists()) {
    return docSnap.data() as UserProfile;
  }
  return null;
}

export function subscribeToAuthState(
  callback: (user: User | null, profile: UserProfile | null) => void
): () => void {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const profile = await getUserProfile(user.uid);
      callback(user, profile);
    } else {
      callback(null, null);
    }
  });
}
