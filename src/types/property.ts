import { Timestamp } from "firebase/firestore";

export type PropertyType = "apartamento" | "casa" | "terreno" | "comercial";
export type PropertyStatus = "disponivel" | "reservado" | "vendido";

export interface PropertyAddress {
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  rua?: string;
}

export interface PropertyFeatures {
  areaM2: number;
  quartos: number;
  banheiros: number;
  vagas: number;
  suites?: number;
}

export interface Property {
  id?: string;
  titulo: string;
  descricao: string;
  tipo: PropertyType;
  preco: number;
  status: PropertyStatus;
  endereco: PropertyAddress;
  caracteristicas: PropertyFeatures;
  imagens: string[];
  plantaBaixaUrl?: string | null;
  corretorId: string;
  criadoEm: Timestamp | string | Date;
  atualizadoEm: Timestamp | string | Date;
}

export type PropertyCreateInput = Omit<Property, "id" | "criadoEm" | "atualizadoEm">;
export type PropertyUpdateInput = Partial<Omit<Property, "id" | "corretorId" | "criadoEm" | "atualizadoEm">>;
