/**
 * Living Canvas - Data Access Layer para Imóveis (Firestore & Storage)
 */

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
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-storage.js";
import LivingCanvasAuth from "./auth.js";

const db = LivingCanvasAuth.db;
const storage = getStorage(LivingCanvasAuth.auth.app);
const COLLECTION_NAME = "imoveis";

// Dados base de amostra caso o Firestore esteja em estado inicial
const SAMPLE_PROPERTIES = [
  {
    id: "casa-do-bosque",
    titulo: "Casa do Bosque",
    descricao: "Onde o silêncio da floresta encontra o design contemporâneo. Cada amanhecer aqui é um convite à calma, cada entardecer, um espetáculo particular. Arquitetura autoral integrada à natureza exuberante.",
    tipo: "casa",
    preco: 2800000,
    status: "disponivel",
    tag: "Exclusivo",
    destaque: true,
    condominio: 1200,
    iptu: 1800,
    endereco: {
      bairro: "Jardim Europa",
      cidade: "São Paulo",
      estado: "SP",
      cep: "01449-000",
      rua: "Alameda dos Bosques, 120"
    },
    caracteristicas: {
      areaM2: 420,
      terrenoM2: 1220,
      quartos: 4,
      banheiros: 5,
      vagas: 4,
      suites: 4,
      jardimM2: 800,
      piscina: true,
      homeTheater: true,
      seguranca24h: true
    },
    imagens: [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&q=80",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&q=80",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
      "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200&q=80",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80"
    ],
    plantaBaixaUrl: null,
    corretor: {
      nome: "Ana Carolina Silva",
      creci: "CRECI 12345-SP",
      cargo: "Corretora Sênior",
      telefone: "(11) 99999-9999",
      foto: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&q=80"
    }
  },
  {
    id: "loft-horizonte",
    titulo: "Loft Horizonte",
    descricao: "Pé-direito duplo, alma artística e o pôr do sol como testemunha. Um refúgio urbano para quem busca inspiração diária no coração da Vila Madalena.",
    tipo: "apartamento",
    preco: 1500000,
    status: "disponivel",
    tag: "Novo",
    universitario: true,
    destaque: true,
    condominio: 850,
    iptu: 620,
    endereco: {
      bairro: "Vila Madalena",
      cidade: "São Paulo",
      estado: "SP",
      cep: "05435-000",
      rua: "Rua Girassol, 340"
    },
    caracteristicas: {
      areaM2: 180,
      quartos: 2,
      banheiros: 3,
      vagas: 2,
      suites: 2,
      atelie: true,
      vistaPanoramica: true
    },
    imagens: [
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&q=80",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&q=80"
    ],
    plantaBaixaUrl: null,
    corretor: {
      nome: "Gabriel Mendes",
      creci: "CRECI 54321-SP",
      cargo: "Especialista em Imóveis de Arte",
      telefone: "(11) 98888-7777",
      foto: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80"
    }
  },
  {
    id: "refugio-oceano",
    titulo: "Refúgio Oceano",
    descricao: "Acordar com o som das ondas não tem preço — mas tem endereço. Mansão contemporânea com acesso privativo e vista infinita para o mar.",
    tipo: "casa",
    preco: 4200000,
    status: "disponivel",
    tag: "Assinatura",
    destaque: true,
    condominio: 2200,
    iptu: 3100,
    endereco: {
      bairro: "Riviera",
      cidade: "Bertioga",
      estado: "SP",
      cep: "11250-000",
      rua: "Av. da Praia, 800"
    },
    caracteristicas: {
      areaM2: 560,
      quartos: 5,
      banheiros: 6,
      vagas: 4,
      suites: 5,
      piscina: true,
      frenteMar: true
    },
    imagens: [
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=80",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&q=80",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"
    ],
    plantaBaixaUrl: null,
    corretor: {
      nome: "Ana Carolina Silva",
      creci: "CRECI 12345-SP",
      cargo: "Corretora Sênior",
      telefone: "(11) 99999-9999",
      foto: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&q=80"
    }
  },
  {
    id: "penthouse-urbano",
    titulo: "Penthouse Urbano",
    descricao: "No coração pulsante da cidade, um oásis de tranquilidade e sofisticação nas alturas com vista panorâmica de 360 graus.",
    tipo: "cobertura",
    preco: 3100000,
    status: "disponivel",
    tag: "Destaque",
    destaque: true,
    condominio: 2600,
    iptu: 2400,
    endereco: {
      bairro: "Itaim Bibi",
      cidade: "São Paulo",
      estado: "SP",
      cep: "04538-000",
      rua: "Rua Joaquim Floriano, 920"
    },
    caracteristicas: {
      areaM2: 320,
      quartos: 3,
      banheiros: 4,
      vagas: 3,
      suites: 3,
      vista360: true,
      chefKitchen: true
    },
    imagens: [
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"
    ],
    plantaBaixaUrl: null,
    corretor: {
      nome: "Gabriel Mendes",
      creci: "CRECI 54321-SP",
      cargo: "Especialista em Imóveis de Luxo",
      telefone: "(11) 98888-7777",
      foto: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80"
    }
  },
  {
    id: "villa-tropical",
    titulo: "Villa Tropical",
    descricao: "Privacidade absoluta em meio à natureza exuberante. Condomínio fechado de altíssimo padrão com segurança 24h e clube privativo.",
    tipo: "casa",
    preco: 5500000,
    status: "disponivel",
    tag: "Premium",
    destaque: true,
    condominio: 3200,
    iptu: 4500,
    endereco: {
      bairro: "Alphaville",
      cidade: "Barueri",
      estado: "SP",
      cep: "06472-000",
      rua: "Residencial Zero, 150"
    },
    caracteristicas: {
      areaM2: 680,
      quartos: 6,
      banheiros: 7,
      vagas: 6,
      suites: 6,
      piscina: true,
      cinema: true,
      jardimM2: 1200
    },
    imagens: [
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&q=80"
    ],
    plantaBaixaUrl: null,
    corretor: {
      nome: "Ana Carolina Silva",
      creci: "CRECI 12345-SP",
      cargo: "Corretora Sênior",
      telefone: "(11) 99999-9999",
      foto: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&q=80"
    }
  },
  {
    id: "studio-artistico",
    titulo: "Studio Artístico Pinheiros",
    descricao: "Criatividade, luz natural e funcionalidade em cada metro quadrado. A passos das melhores galerias e cafés de Pinheiros.",
    tipo: "studio",
    preco: 1900000,
    status: "disponivel",
    tag: "Exclusivo",
    universitario: true,
    destaque: false,
    condominio: 650,
    iptu: 480,
    endereco: {
      bairro: "Pinheiros",
      cidade: "São Paulo",
      estado: "SP",
      cep: "05414-000",
      rua: "Rua dos Pinheiros, 512"
    },
    caracteristicas: {
      areaM2: 95,
      quartos: 1,
      banheiros: 2,
      vagas: 1,
      suites: 1,
      varanda: true,
      mobiliado: true
    },
    imagens: [
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&q=80"
    ],
    plantaBaixaUrl: null,
    corretor: {
      nome: "Gabriel Mendes",
      creci: "CRECI 54321-SP",
      cargo: "Especialista em Imóveis de Arte",
      telefone: "(11) 98888-7777",
      foto: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80"
    }
  }
];

/**
 * Buscar todos os imóveis (Leitura pública do Firestore)
 */
export async function getProperties(filters = {}) {
  try {
    const constraints = [];

    if (filters.status) {
      constraints.push(where("status", "==", filters.status));
    } else {
      // Por padrão, buscar imóveis disponíveis para o público
      constraints.push(where("status", "==", "disponivel"));
    }

    if (filters.tipo) {
      constraints.push(where("tipo", "==", filters.tipo.toLowerCase()));
    }
    if (filters.bairro) {
      constraints.push(where("endereco.bairro", "==", filters.bairro));
    }

    const q = query(collection(db, COLLECTION_NAME), ...constraints);
    const querySnapshot = await getDocs(q);

    let firestoreProperties = querySnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    // Se o Firestore não tiver nenhum imóvel gravado ainda, retorna os dados modelo
    if (firestoreProperties.length === 0 && (!filters.status || filters.status === "disponivel")) {
      firestoreProperties = [...SAMPLE_PROPERTIES];
      
      // Aplicar filtros nos dados de fallback se existirem
      if (filters.tipo) {
        firestoreProperties = firestoreProperties.filter(p => p.tipo.toLowerCase() === filters.tipo.toLowerCase());
      }
      if (filters.bairro) {
        firestoreProperties = firestoreProperties.filter(p => p.endereco?.bairro?.toLowerCase().includes(filters.bairro.toLowerCase()));
      }
    }

    return firestoreProperties;
  } catch (error) {
    console.warn("Aviso ao buscar imóveis do Firestore (usando catálogo seguro):", error);
    return [...SAMPLE_PROPERTIES];
  }
}

/**
 * Buscar imóvel por ID (Leitura pública do Firestore com fallback enriquecido)
 */
export async function getPropertyById(id) {
  if (!id) return null;

  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      let corretorInfo = data.corretor || {
        nome: "Ana Carolina Silva",
        creci: "CRECI 12345-SP",
        cargo: "Corretora Sênior",
        telefone: "(11) 99999-9999",
        foto: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&q=80"
      };

      // Se tiver corretorId e não tiver objeto corretor embutido, tenta buscar dados públicos
      if (data.corretorId && !data.corretor) {
        try {
          const userDocRef = doc(db, "usuarios", data.corretorId);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const uData = userSnap.data();
            corretorInfo = {
              nome: uData.nome || corretorInfo.nome,
              creci: uData.creci || corretorInfo.creci,
              cargo: "Corretor Responsável",
              telefone: uData.telefone || corretorInfo.telefone,
              foto: uData.foto || corretorInfo.foto
            };
          }
        } catch (e) {
          // Mantém o corretor padrão se houver restrição de segurança
        }
      }

      return {
        id: docSnap.id,
        ...data,
        corretor: corretorInfo
      };
    }
  } catch (err) {
    console.warn("Erro ao buscar imóvel por ID no Firestore:", err);
  }

  // Fallback nos dados de amostra
  const found = SAMPLE_PROPERTIES.find(p => p.id === id || p.titulo.toLowerCase().replace(/\s+/g, '-') === id.toLowerCase());
  if (found) return found;

  // Se nenhum específico foi encontrado, retorna o primeiro como fallback seguro
  return SAMPLE_PROPERTIES[0];
}

/**
 * Dispara matching assíncrono no backend para geração de notificações
 */
export async function triggerPropertyMatching(imovelId, propertyData) {
  try {
    const res = await fetch("/api/match-properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imovelId,
        propertyData: propertyData || undefined,
      }),
    });
    if (!res.ok) {
      console.warn("[LivingCanvas] Falha no retorno do matching de imóveis:", await res.text());
    } else {
      const data = await res.json();
      console.log("[LivingCanvas] Resultado do matching:", data);
    }
  } catch (err) {
    console.warn("[LivingCanvas] Não foi possível contatar serviço de matching:", err);
  }
}

/**
 * Cadastrar imóvel (Apenas corretores autenticados)
 */
export async function createProperty(propertyData) {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser) {
    throw new Error("Apenas usuários autenticados podem cadastrar imóveis.");
  }

  const dataToSave = {
    ...propertyData,
    status: propertyData.status || "disponivel",
    imagens: propertyData.imagens || [],
    plantaBaixaUrl: propertyData.plantaBaixaUrl || null,
    corretorId: currentUser.uid,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, COLLECTION_NAME), dataToSave);
  const newId = docRef.id;

  // Se o imóvel estiver disponível, dispara matching assíncrono
  if (dataToSave.status === "disponivel") {
    triggerPropertyMatching(newId, dataToSave).catch(() => {});
  }

  return newId;
}

/**
 * Atualizar dados/status de imóvel existente (Apenas o corretor proprietário)
 */
export async function updateProperty(imovelId, propertyData) {
  const currentUser = LivingCanvasAuth.auth.currentUser;
  if (!currentUser) {
    throw new Error("Apenas usuários autenticados podem atualizar imóveis.");
  }

  const docRef = doc(db, COLLECTION_NAME, imovelId);
  const dataToUpdate = {
    ...propertyData,
    atualizadoEm: serverTimestamp()
  };

  await updateDoc(docRef, dataToUpdate);

  // Se o status resultante for "disponivel", dispara matching
  if (dataToUpdate.status === "disponivel" || propertyData.status === "disponivel") {
    triggerPropertyMatching(imovelId, { ...propertyData, id: imovelId }).catch(() => {});
  }

  return true;
}

/**
 * Upload de foto para /imoveis/{imovelId}/fotos/{arquivo}
 */
export async function uploadPropertyPhoto(imovelId, file, fileName) {
  const safeName = `${Date.now()}_${fileName.replace(/\s+/g, "_")}`;
  const fileRef = ref(storage, `imoveis/${imovelId}/fotos/${safeName}`);
  const snapshot = await uploadBytes(fileRef, file);
  return await getDownloadURL(snapshot.ref);
}

/**
 * Upload de planta baixa para /imoveis/{imovelId}/planta/{arquivo}
 */
export async function uploadPropertyFloorPlan(imovelId, file, fileName) {
  const safeName = `${Date.now()}_${fileName.replace(/\s+/g, "_")}`;
  const fileRef = ref(storage, `imoveis/${imovelId}/planta/${safeName}`);
  const snapshot = await uploadBytes(fileRef, file);
  return await getDownloadURL(snapshot.ref);
}

/**
 * Funções utilitárias de formatação
 */
export function formatCurrency(value) {
  if (typeof value !== "number" || isNaN(value)) return "Sob Consulta";
  if (value >= 1000000) {
    const millions = (value / 1000000).toFixed(1).replace(".0", "").replace(".", ",");
    return `R$ ${millions}M`;
  }
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function formatFullCurrency(value) {
  if (typeof value !== "number" || isNaN(value)) return "Sob Consulta";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

window.LivingCanvasProperties = {
  getProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  triggerPropertyMatching,
  uploadPropertyPhoto,
  uploadPropertyFloorPlan,
  formatCurrency,
  formatFullCurrency,
  SAMPLE_PROPERTIES
};

export default window.LivingCanvasProperties;

