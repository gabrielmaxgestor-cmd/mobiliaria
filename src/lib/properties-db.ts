export interface Property {
  id: string;
  title: string;
  type: string;
  neighborhood: string;
  price: number;
  priceFormatted: string;
  area: number;
  bedrooms: number;
  suites: number;
  parking: number;
  description: string;
  tags: string[];
  vibeTags: string[];
  imageUrl: string;
  gallery: string[];
  walkScore: number;
  sunOrientation: string;
  noiseLevel: string;
}

export const PROPERTIES_CATALOG: Property[] = [
  {
    id: "casa-do-bosque",
    title: "Casa do Bosque",
    type: "Casa Residencial",
    neighborhood: "Jardim Europa",
    price: 4800000,
    priceFormatted: "R$ 4.800.000",
    area: 420,
    bedrooms: 4,
    suites: 4,
    parking: 4,
    description: "Espaçosa residência cercada por mata nativa com iluminação natural perfeita, jardim privativo amplo, piscina aquecida e escritório com isolamento acústico.",
    tags: ["Silencioso", "Luz Natural", "Jardim Privativo", "Pet-Friendly", "Home Office"],
    vibeTags: ["Tranquilidade", "Natureza", "Família", "Privacidade"],
    imageUrl: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80"
    ],
    walkScore: 78,
    sunOrientation: "Norte / Leste",
    noiseLevel: "Ultra Silencioso"
  },
  {
    id: "loft-horizonte",
    title: "Loft Horizonte",
    type: "Loft Duplex",
    neighborhood: "Vila Madalena",
    price: 2150000,
    priceFormatted: "R$ 2.150.000",
    area: 180,
    bedrooms: 2,
    suites: 2,
    parking: 2,
    description: "Loft contemporâneo com pé-direito duplo, janelas de fora a fora, ateliê de criação integrado e cercado por galerias de arte, cafés artesanais e livrarias.",
    tags: ["Pé-Direito Duplo", "Cafés Próximos", "Design Moderno", "Luz Abundante"],
    vibeTags: ["Criativo", "Urbano", "Cultura", "Home Office"],
    imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80"
    ],
    walkScore: 95,
    sunOrientation: "Leste",
    noiseLevel: "Moderado / Cultural"
  },
  {
    id: "penthouse-urbano",
    title: "Penthouse Urbano",
    type: "Cobertura Triplex",
    neighborhood: "Itaim Bibi",
    price: 6900000,
    priceFormatted: "R$ 6.900.000",
    area: 320,
    bedrooms: 3,
    suites: 3,
    parking: 3,
    description: "Penthouse com vista panorâmica 360° para o skyline da cidade, terraço com jacuzzi privativa, automação residencial inteligente e acabamentos de altíssimo padrão.",
    tags: ["Vista 360°", "Jacuzzi", "Automação", "Alto Padrão", "Segurança 24h"],
    vibeTags: ["Luxo", "Exclusividade", "Networking", "Investimento"],
    imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80"
    ],
    walkScore: 92,
    sunOrientation: "360° Sol o dia todo",
    noiseLevel: "Silencioso nas alturas"
  },
  {
    id: "studio-artistico",
    title: "Studio Artístico",
    type: "Studio Boutique",
    neighborhood: "Pinheiros",
    price: 980000,
    priceFormatted: "R$ 980.000",
    area: 95,
    bedrooms: 1,
    suites: 1,
    parking: 1,
    description: "Studio compacto inteligente com varanda envidraçada, iluminação natural privilegiada, fácil acesso a estações de metrô e feiras orgânicas locais.",
    tags: ["Próximo ao Metrô", "Varanda Envidraçada", "Walkability", "Baixo Condomínio"],
    vibeTags: ["Praticidade", "Jovem", "Mobilidade", "Custo-Benefício"],
    imageUrl: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80"
    ],
    walkScore: 98,
    sunOrientation: "Manhã (Leste)",
    noiseLevel: "Moderado"
  },
  {
    id: "refugio-dos-passaros",
    title: "Refúgio dos Pássaros",
    type: "Casa de Vila",
    neighborhood: "Alto de Pinheiros",
    price: 3600000,
    priceFormatted: "R$ 3.600.000",
    area: 280,
    bedrooms: 3,
    suites: 3,
    parking: 2,
    description: "Charmosa casa de vila fechada com arborização intensa, praça interna privativa, som de pássaros ao amanhecer e rua extremamente tranquila para caminhadas.",
    tags: ["Vila Fechada", "Área Verde", "Extremamente Seguro", "Silencioso"],
    vibeTags: ["Refúgio", "Segurança", "Comunidade", "Família"],
    imageUrl: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80"
    ],
    walkScore: 82,
    sunOrientation: "Norte",
    noiseLevel: "Extremamente Silencioso"
  },
  {
    id: "residencia-jardins",
    title: "Residência Jardins",
    type: "Apartamento de Alto Padrão",
    neighborhood: "Jardins",
    price: 5200000,
    priceFormatted: "R$ 5.200.000",
    area: 260,
    bedrooms: 4,
    suites: 4,
    parking: 3,
    description: "Apartamento um por andar com piso de madeira nobre, varanda integrada com churrasqueira, janelas antirruído duplas e serviço de concierge 24h.",
    tags: ["1 por Andar", "Churrasqueira", "Janelas Antirruído", "Concierge"],
    vibeTags: ["Sofisticação", "Tradição", "Conforto", "Gastronomia"],
    imageUrl: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=800&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=800&q=80"
    ],
    walkScore: 94,
    sunOrientation: "Leste / Oeste",
    noiseLevel: "Silencioso (Acústico)"
  }
];
