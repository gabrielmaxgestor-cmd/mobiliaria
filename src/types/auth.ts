import { Timestamp } from "firebase/firestore";

export type UserRole = "cliente" | "corretor" | "admin";

export interface UserProfile {
  uid: string;
  nome: string;
  email: string;
  role: UserRole;
  telefone?: string;
  criadoEm: Timestamp | string | Date;
}
