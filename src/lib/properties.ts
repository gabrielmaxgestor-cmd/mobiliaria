import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  QueryConstraint,
} from "firebase/firestore";
import { getFirebaseFirestore } from "./firebase";
import { Property, PropertyCreateInput, PropertyUpdateInput } from "../types/property";

const COLLECTION_NAME = "imoveis";

/**
 * Busca todos os imóveis com filtros opcionais (Leitura pública)
 */
export async function getProperties(filters?: {
  tipo?: string;
  status?: string;
  bairro?: string;
}): Promise<Property[]> {
  const db = getFirebaseFirestore();
  const constraints: QueryConstraint[] = [];

  if (filters?.tipo) {
    constraints.push(where("tipo", "==", filters.tipo));
  }
  if (filters?.status) {
    constraints.push(where("status", "==", filters.status));
  }
  if (filters?.bairro) {
    constraints.push(where("endereco.bairro", "==", filters.bairro));
  }

  // Ordenação por mais recentes
  constraints.push(orderBy("criadoEm", "desc"));

  const q = query(collection(db, COLLECTION_NAME), ...constraints);
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Property, "id">),
  }));
}

/**
 * Busca um imóvel específico pelo ID (Leitura pública)
 */
export async function getPropertyById(id: string): Promise<Property | null> {
  const db = getFirebaseFirestore();
  const docRef = doc(db, COLLECTION_NAME, id);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return {
      id: docSnap.id,
      ...(docSnap.data() as Omit<Property, "id">),
    };
  }
  return null;
}

/**
 * Criação de imóvel no Firestore (Apenas corretores)
 */
export async function createProperty(data: PropertyCreateInput): Promise<string> {
  const db = getFirebaseFirestore();
  const propertyData = {
    ...data,
    status: data.status || "disponivel",
    imagens: data.imagens || [],
    plantaBaixaUrl: data.plantaBaixaUrl || null,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, COLLECTION_NAME), propertyData);
  return docRef.id;
}

/**
 * Atualização de dados de um imóvel (Apenas corretor responsável)
 */
export async function updateProperty(id: string, data: PropertyUpdateInput): Promise<void> {
  const db = getFirebaseFirestore();
  const docRef = doc(db, COLLECTION_NAME, id);

  await updateDoc(docRef, {
    ...data,
    atualizadoEm: serverTimestamp(),
  });
}

/**
 * Exclusão de imóvel (Apenas corretor responsável)
 */
export async function deleteProperty(id: string): Promise<void> {
  const db = getFirebaseFirestore();
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
}

/**
 * Cria documentos de exemplo de imóveis para teste de schema
 */
export async function seedSampleProperties(corretorId: string): Promise<string[]> {
  const samples: PropertyCreateInput[] = [
    {
      titulo: "Casa do Bosque",
      descricao: "Onde o silêncio da floresta encontra o design contemporâneo. Ampla área verde privativa e acabamentos nobres.",
      tipo: "casa",
      preco: 2800000,
      status: "disponivel",
      endereco: {
        bairro: "Jardim Europa",
        cidade: "Valença",
        estado: "RJ",
        cep: "27600-000",
        rua: "Alameda dos Bosques, 120"
      },
      caracteristicas: {
        areaM2: 420,
        quartos: 4,
        banheiros: 5,
        vagas: 4,
        suites: 4
      },
      imagens: [
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80",
        "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&q=80"
      ],
      plantaBaixaUrl: null,
      corretorId
    },
    {
      titulo: "Loft Horizonte",
      descricao: "Pé-direito duplo, alma artística e vista panorâmica espetacular no ponto mais nobre da cidade.",
      tipo: "apartamento",
      preco: 1500000,
      status: "disponivel",
      endereco: {
        bairro: "Centro Histórico",
        cidade: "Valença",
        estado: "RJ",
        cep: "27600-000",
        rua: "Rua do Rosário, 45"
      },
      caracteristicas: {
        areaM2: 180,
        quartos: 2,
        banheiros: 3,
        vagas: 2,
        suites: 2
      },
      imagens: [
        "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&q=80",
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80"
      ],
      plantaBaixaUrl: null,
      corretorId
    },
    {
      titulo: "Studio Moderno UNIFAA",
      descricao: "Imóvel pensado sob medida para a rotina universitária, a apenas 5 minutos a pé do campus da UNIFAA.",
      tipo: "apartamento",
      preco: 350000,
      status: "disponivel",
      endereco: {
        bairro: "Universitário",
        cidade: "Valença",
        estado: "RJ",
        cep: "27600-000",
        rua: "Rua das Acácias, 88"
      },
      caracteristicas: {
        areaM2: 45,
        quartos: 1,
        banheiros: 1,
        vagas: 1,
        suites: 1
      },
      imagens: [
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80"
      ],
      plantaBaixaUrl: null,
      corretorId
    }
  ];

  const createdIds: string[] = [];
  for (const sample of samples) {
    const id = await createProperty(sample);
    createdIds.push(id);
  }
  return createdIds;
}
