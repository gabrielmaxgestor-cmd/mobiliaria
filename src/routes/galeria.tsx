import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { ImageGallery, type ImageData } from "@/components/ui/carousel-circular-image-gallery";
import {
  Calendar,
  MapPin,
  Home,
  ArrowLeft,
  ExternalLink,
  Sparkles,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface Property {
  id: string;
  name: string;
  location: string;
  type: string;
  price: string;
  specs: { bedrooms: number; area: string; garage: number };
  images: (ImageData & { description: string; tag: string })[];
}

const PROPERTIES: Property[] = [
  {
    id: "mansao-vale",
    name: "Mansão Vista do Vale",
    location: "Bairro do Vale, Valença - RJ",
    type: "Casa de Luxo",
    price: "R$ 3.850.000",
    specs: { bedrooms: 5, area: "620m²", garage: 4 },
    images: [
      {
        title: "Fachada & Paisagismo",
        url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=800&h=800&fit=crop",
        description: "Fachada neoclássica com iluminação cênica integrada e paisagismo assinado.",
        tag: "Exterior",
      },
      {
        title: "Living com Lareira",
        url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&h=800&fit=crop",
        description: "Pé-direito duplo de 6m com grandes aberturas em vidro para ventilação natural.",
        tag: "Sala de Estar",
      },
      {
        title: "Cozinha Gourmet",
        url: "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?q=80&w=800&h=800&fit=crop",
        description: "Bancadas em mármore calacatta, armários planejados e ilha central de cocção.",
        tag: "Cozinha",
      },
      {
        title: "Suíte Master com Hidro",
        url: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?q=80&w=800&h=800&fit=crop",
        description: "Suíte presidencial com closet privativo duplo e hidromassagem aquecida.",
        tag: "Suíte",
      },
      {
        title: "Piscina Infinita & Deck",
        url: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=800&h=800&fit=crop",
        description: "Deck em madeira cumaru com borda infinita voltada para a serra de Valença.",
        tag: "Lazer",
      },
      {
        title: "Vista Panorâmica ao Entardecer",
        url: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?q=80&w=800&h=800&fit=crop",
        description: "Pôr do sol cinematográfico visualizado de todos os níveis da residência.",
        tag: "Vista Panorama",
      },
    ],
  },
  {
    id: "cobertura-jardins",
    name: "Cobertura Duplex Jardins",
    location: "Jardins, Valença - RJ",
    type: "Cobertura",
    price: "R$ 2.400.000",
    specs: { bedrooms: 4, area: "380m²", garage: 3 },
    images: [
      {
        title: "Terraço Privativo com SPA",
        url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=800&h=800&fit=crop",
        description: "Espaço gourmet superior com banheira de hidromassagem e pergolado solar.",
        tag: "Terraço",
      },
      {
        title: "Sala de Jantar Integrada",
        url: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=800&h=800&fit=crop",
        description: "Ambientes sociais fluídos com piso em porcelanato em grandes formatos.",
        tag: "Jantar",
      },
      {
        title: "Varanda Gourmet",
        url: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=800&h=800&fit=crop",
        description: "Churrasqueira a carvão embutida com exaustão individual e fechamento em cortina de vidro.",
        tag: "Varanda",
      },
      {
        title: "Dormitório Conceito Aberto",
        url: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?q=80&w=800&h=800&fit=crop",
        description: "Quartos amplos com automação de cortinas e ar condicionado cassete.",
        tag: "Quarto",
      },
      {
        title: "Home Cinema Customizado",
        url: "https://images.unsplash.com/photo-1593696140826-c58b021acf8b?q=80&w=800&h=800&fit=crop",
        description: "Isolamento acústico profissional e sistema Dolby Atmos para entretenimento.",
        tag: "Home Theater",
      },
      {
        title: "Fachada Noturna Iluminada",
        url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=800&h=800&fit=crop",
        description: "Edifício moderno com portaria blindada 24h e gerador completo.",
        tag: "Fachada",
      },
    ],
  },
  {
    id: "casa-campo-serra",
    name: "Refúgio da Serra",
    location: "Conservatória, Valença - RJ",
    type: "Chácara de Alto Padrão",
    price: "R$ 1.950.000",
    specs: { bedrooms: 4, area: "1.200m²", garage: 6 },
    images: [
      {
        title: "Entrada em Pedra Natural",
        url: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?q=80&w=800&h=800&fit=crop",
        description: "Arquitetura orgânica que combina madeira nobre, pedras locais e vidro.",
        tag: "Entrada",
      },
      {
        title: "Salão Rústico Chic",
        url: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=800&h=800&fit=crop",
        description: "Lareira central em pedra de sabão com vista para as colinas verdejantes.",
        tag: "Salão",
      },
      {
        title: "Fogo de Chão & Lounges",
        url: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?q=80&w=800&h=800&fit=crop",
        description: "Praça do fogo para noites agradáveis em família apreciando as estrelas.",
        tag: "Lazer Exterior",
      },
      {
        title: "Suíte com Vista para Mata",
        url: "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?q=80&w=800&h=800&fit=crop",
        description: "Despertar com o canto dos pássaros e brisa fresca da serra da Mantiqueira.",
        tag: "Suíte",
      },
      {
        title: "Pomar & Jardins Botânicos",
        url: "https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?q=80&w=800&h=800&fit=crop",
        description: "Árvores frutíferas produtivas e horta orgânica irrigada.",
        tag: "Natureza",
      },
      {
        title: "Varanda das Redes",
        url: "https://images.unsplash.com/photo-1600585152220-90363fe7e115?q=80&w=800&h=800&fit=crop",
        description: "Espaço de relaxamento com brisa constante e vista contínua do vale.",
        tag: "Varanda",
      },
    ],
  },
];

export const Route = createFileRoute("/galeria")({
  component: GaleriaPage,
  head: () => ({
    meta: [
      { title: "Galeria Circular de Fotos | Imobiliária Valença" },
      {
        name: "description",
        content:
          "Explore os detalhes e ambientes dos melhores imóveis em Valença-RJ através da nossa galeria circular interativa.",
      },
      { property: "og:title", content: "Galeria Circular de Imóveis | Imobiliária Valença" },
      {
        property: "og:description",
        content:
          "Explore os detalhes e ambientes dos melhores imóveis em Valença-RJ através da nossa galeria circular interativa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function GaleriaPage() {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(PROPERTIES[0].id);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const currentProperty = PROPERTIES.find((p) => p.id === selectedPropertyId) || PROPERTIES[0];
  const activeImage = currentProperty.images[activeIndex] || currentProperty.images[0];
  const lightboxImage = currentProperty.images[lightboxIndex] || currentProperty.images[0];

  const handleActiveChange = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const handlePropertySelect = (id: string) => {
    setSelectedPropertyId(id);
    setActiveIndex(0);
  };

  const openLightbox = (index?: number) => {
    const idx = typeof index === "number" ? index : activeIndex;
    setLightboxIndex(idx);
    setZoomLevel(1);
    setIsLightboxOpen(true);
  };

  const closeLightbox = () => {
    setIsLightboxOpen(false);
    setZoomLevel(1);
  };

  const nextLightboxImage = useCallback(() => {
    setLightboxIndex((prev) => (prev + 1 >= currentProperty.images.length ? 0 : prev + 1));
    setZoomLevel(1);
  }, [currentProperty.images.length]);

  const prevLightboxImage = useCallback(() => {
    setLightboxIndex((prev) => (prev - 1 < 0 ? currentProperty.images.length - 1 : prev - 1));
    setZoomLevel(1);
  }, [currentProperty.images.length]);

  const zoomIn = useCallback(() => setZoomLevel((z) => Math.min(z + 0.5, 3)), []);
  const zoomOut = useCallback(() => setZoomLevel((z) => Math.max(z - 0.5, 1)), []);
  const resetZoom = useCallback(() => setZoomLevel(1), []);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (!isLightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") nextLightboxImage();
      if (e.key === "ArrowLeft") prevLightboxImage();
      if (e.key === "+" || e.key === "=") zoomIn();
      if (e.key === "-") zoomOut();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen, nextLightboxImage, prevLightboxImage, zoomIn, zoomOut]);

  return (
    <div className="min-h-screen bg-[#071d1a] text-[#f8f5ef] antialiased">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-30 border-b border-[#d4af7a]/20 bg-[#071d1a]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <a
            href="/home.html"
            className="group flex items-center gap-2 text-sm font-medium text-[#e8e2d4]/80 transition-colors hover:text-[#d4af7a]"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            <span>Voltar ao Início</span>
          </a>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af7a]/30 bg-[#d4af7a]/10 px-3 py-1 text-xs font-semibold text-[#d4af7a]">
              <Sparkles className="h-3.5 w-3.5" />
              Galeria Circular Interativa
            </span>
          </div>

          <a
            href="/agendar.html"
            className="hidden rounded-lg bg-[#d4af7a] px-4 py-2 text-xs font-semibold text-[#071d1a] transition-all hover:bg-[#e2bd88] sm:inline-flex"
          >
            Agendar Visita
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Title Section */}
        <section className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[#d4af7a]">
            Experiência Imersiva
          </p>
          <h1
            className="mt-2 text-3xl font-extrabold text-[#f8f5ef] sm:text-4xl lg:text-5xl"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Galeria de Fotos dos Imóveis
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-[#e8e2d4]/70 sm:text-base">
            Selecione um imóvel, navegue na galeria circular ou clique em qualquer imagem para expandir em tela cheia com zoom detalhado.
          </p>
        </section>

        {/* Property Selector Tabs */}
        <div className="mb-10 flex flex-wrap justify-center gap-2 sm:gap-3">
          {PROPERTIES.map((prop) => {
            const isSelected = prop.id === selectedPropertyId;
            return (
              <button
                key={prop.id}
                onClick={() => handlePropertySelect(prop.id)}
                type="button"
                className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                  isSelected
                    ? "border-[#d4af7a] bg-[#d4af7a] text-[#071d1a] shadow-lg shadow-[#d4af7a]/20"
                    : "border-[#d4af7a]/30 bg-[#0c2a26] text-[#e8e2d4]/80 hover:border-[#d4af7a]/60 hover:bg-[#123833]"
                }`}
              >
                <Home className="h-4 w-4" />
                <span>{prop.name}</span>
              </button>
            );
          })}
        </div>

        {/* Gallery + Details Grid */}
        <div className="grid items-center gap-8 lg:grid-cols-12">
          {/* Left / Center: Interactive Circular Image Gallery Component */}
          <div className="flex flex-col items-center justify-center lg:col-span-7">
            <div className="relative w-full max-w-[440px] rounded-2xl border border-[#d4af7a]/20 bg-[#0a2723]/60 p-4 shadow-2xl backdrop-blur-sm sm:p-6">
              <ImageGallery
                key={selectedPropertyId}
                images={currentProperty.images}
                onActiveChange={handleActiveChange}
                onExpandImage={(idx) => openLightbox(idx)}
                className="w-full"
              />
            </div>
          </div>

          {/* Right: Active Photo & Property Details Card */}
          <div className="flex flex-col gap-6 lg:col-span-5">
            <div className="rounded-2xl border border-[#d4af7a]/30 bg-[#0a2723] p-6 shadow-xl">
              {/* Header Badge & Title */}
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-[#d4af7a]/20 px-3 py-1 text-xs font-bold text-[#d4af7a]">
                  {activeImage?.tag || "Ambiente"}
                </span>
                <span className="text-xs font-medium text-[#e8e2d4]/60">
                  {activeIndex + 1} de {currentProperty.images.length}
                </span>
              </div>

              <h2
                className="mt-4 text-2xl font-bold text-[#f8f5ef]"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {activeImage?.title}
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-[#e8e2d4]/80">
                {activeImage?.description}
              </p>

              {/* Action: Expand Photo Button */}
              <button
                type="button"
                onClick={() => openLightbox(activeIndex)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d4af7a]/50 bg-[#d4af7a]/10 py-2.5 text-xs font-bold text-[#d4af7a] transition-all hover:border-[#d4af7a] hover:bg-[#d4af7a]/20 active:scale-[0.99]"
              >
                <Maximize2 className="h-4 w-4" />
                <span>Expandir Foto em Tela Cheia (Zoom)</span>
              </button>

              {/* Property Meta Info */}
              <div className="mt-6 border-t border-[#d4af7a]/20 pt-6">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#d4af7a]">
                  <MapPin className="h-4 w-4" />
                  <span>{currentProperty.location}</span>
                </div>

                <h3 className="mt-1 text-lg font-bold text-[#f8f5ef]">
                  {currentProperty.name}
                </h3>

                <p className="mt-1 text-xl font-extrabold text-[#d4af7a]">
                  {currentProperty.price}
                </p>

                {/* Specs List */}
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#061816] p-3 text-center text-xs">
                  <div>
                    <span className="block text-[#e8e2d4]/60">Quartos</span>
                    <strong className="text-[#f8f5ef]">{currentProperty.specs.bedrooms} suítes</strong>
                  </div>
                  <div>
                    <span className="block text-[#e8e2d4]/60">Área</span>
                    <strong className="text-[#f8f5ef]">{currentProperty.specs.area}</strong>
                  </div>
                  <div>
                    <span className="block text-[#e8e2d4]/60">Vagas</span>
                    <strong className="text-[#f8f5ef]">{currentProperty.specs.garage} carros</strong>
                  </div>
                </div>
              </div>

              {/* CTAs */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <a
                  href="/agendar.html"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#d4af7a] px-4 py-3 text-center text-xs font-bold text-[#071d1a] transition-transform hover:scale-[1.02] hover:bg-[#e2bd88]"
                >
                  <Calendar className="h-4 w-4" />
                  <span>Agendar Visita</span>
                </a>
                <a
                  href={`https://wa.me/5524999999999?text=Ol%C3%A1!%20Gostaria%20de%20saber%20mais%20sobre%20o%20im%C3%B3vel%20${encodeURIComponent(currentProperty.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-[#d4af7a]/40 bg-transparent px-4 py-3 text-xs font-bold text-[#e8e2d4] transition-colors hover:border-[#d4af7a] hover:bg-[#d4af7a]/10"
                >
                  <ExternalLink className="h-4 w-4 text-[#d4af7a]" />
                  <span>Atendimento WhatsApp</span>
                </a>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="rounded-xl border border-[#d4af7a]/10 bg-[#08211e]/50 p-4 text-xs text-[#e8e2d4]/70">
              💡 <strong>Dica:</strong> Clique na imagem da galeria circular ou no botão <strong>Expandir Foto</strong> para visualizar em alta resolução.
            </div>
          </div>
        </div>

        {/* Thumbnail Grid Section */}
        <section className="mt-16 border-t border-[#d4af7a]/20 pt-12">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#d4af7a]">
                Visão Geral dos Cômodos
              </p>
              <h2
                className="text-2xl font-bold text-[#f8f5ef]"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                Todas as Fotos de {currentProperty.name}
              </h2>
            </div>
            <p className="text-xs text-[#e8e2d4]/60">
              Clique em qualquer foto para abrir o visualizador expandido.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {currentProperty.images.map((img, idx) => {
              const isActive = idx === activeIndex;
              return (
                <div
                  key={img.url + idx}
                  onClick={() => {
                    setActiveIndex(idx);
                    openLightbox(idx);
                  }}
                  className={`group relative aspect-square cursor-pointer overflow-hidden rounded-xl border transition-all ${
                    isActive
                      ? "border-[#d4af7a] ring-2 ring-[#d4af7a]/50 shadow-lg"
                      : "border-[#d4af7a]/20 opacity-80 hover:opacity-100 hover:border-[#d4af7a]/60 hover:scale-[1.02]"
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2.5 flex flex-col justify-between opacity-90 group-hover:opacity-100">
                    <span className="self-start rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-[#d4af7a]">
                      {img.tag}
                    </span>
                    <div className="flex items-center justify-between text-white">
                      <span className="truncate text-xs font-medium">{img.title}</span>
                      <Maximize2 className="h-3.5 w-3.5 shrink-0 text-[#d4af7a] opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* FULLSCREEN LIGHTBOX MODAL */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-between bg-black/95 p-4 sm:p-6 backdrop-blur-xl animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          {/* Lightbox Header Bar */}
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 text-white">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-[#d4af7a]/20 px-3 py-1 text-xs font-bold text-[#d4af7a]">
                {lightboxImage?.tag || "Ambiente"}
              </span>
              <div>
                <h3 className="text-sm font-bold text-white sm:text-base">{lightboxImage?.title}</h3>
                <p className="text-xs text-white/60">
                  {currentProperty.name} ({lightboxIndex + 1} de {currentProperty.images.length})
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1 rounded-lg border border-white/15 bg-white/5 p-1 sm:flex">
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={zoomLevel <= 1}
                  title="Diminuir zoom (-)"
                  className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={resetZoom}
                  title="Resetar zoom (100%)"
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold hover:bg-white/10"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>{Math.round(zoomLevel * 100)}%</span>
                </button>
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={zoomLevel >= 3}
                  title="Aumentar zoom (+)"
                  className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={closeLightbox}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20 active:scale-95"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Fechar (ESC)</span>
              </button>
            </div>
          </div>

          {/* Lightbox Main Image Area */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden py-4">
            {/* Previous Arrow */}
            <button
              type="button"
              onClick={prevLightboxImage}
              aria-label="Foto anterior"
              className="absolute left-2 z-20 rounded-full bg-black/60 p-3 text-white backdrop-blur-md transition-all hover:bg-[#d4af7a] hover:text-[#071d1a] hover:scale-110 active:scale-95 sm:left-6"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            {/* Main Image */}
            <div className="relative max-h-[75vh] max-w-[90vw] overflow-auto rounded-xl">
              <img
                src={lightboxImage?.url}
                alt={lightboxImage?.title}
                onDoubleClick={() => (zoomLevel > 1 ? resetZoom() : zoomIn())}
                style={{ transform: `scale(${zoomLevel})` }}
                className="max-h-[75vh] max-w-[90vw] object-contain transition-transform duration-300 cursor-zoom-in"
                title="Clique duas vezes para dar zoom"
              />
            </div>

            {/* Next Arrow */}
            <button
              type="button"
              onClick={nextLightboxImage}
              aria-label="Próxima foto"
              className="absolute right-2 z-20 rounded-full bg-black/60 p-3 text-white backdrop-blur-md transition-all hover:bg-[#d4af7a] hover:text-[#071d1a] hover:scale-110 active:scale-95 sm:right-6"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>

          {/* Lightbox Footer & Thumbnail Strip */}
          <div className="border-t border-white/10 pt-3">
            <p className="mb-3 text-center text-xs text-white/80 max-w-2xl mx-auto truncate sm:whitespace-normal">
              {lightboxImage?.description}
            </p>

            {/* Thumbnail Navigation Strip */}
            <div className="flex items-center justify-center gap-2 overflow-x-auto pb-1">
              {currentProperty.images.map((img, idx) => {
                const isCurrent = idx === lightboxIndex;
                return (
                  <button
                    key={img.url + "lb" + idx}
                    type="button"
                    onClick={() => {
                      setLightboxIndex(idx);
                      setZoomLevel(1);
                    }}
                    className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border transition-all ${
                      isCurrent
                        ? "border-[#d4af7a] ring-2 ring-[#d4af7a] scale-105"
                        : "border-white/20 opacity-50 hover:opacity-100"
                    }`}
                  >
                    <img src={img.url} alt={img.title} className="h-full w-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

