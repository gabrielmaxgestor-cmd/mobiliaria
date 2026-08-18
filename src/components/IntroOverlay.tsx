import { useState, useEffect } from 'react';
import InfiniteGallery from '@/components/ui/3d-gallery-photography';

const PROPERTY_IMAGES = [
  { src: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80', alt: 'Casa do Bosque — Jardim Europa' },
  { src: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80', alt: 'Living Neoclássico — Monet Imóveis' },
  { src: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80', alt: 'Loft Horizonte — Vila Madalena' },
  { src: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80', alt: 'Design Contemporâneo' },
  { src: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80', alt: 'Refúgio Oceano — Riviera' },
  { src: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80', alt: 'Cozinha Gourmet Integrada' },
  { src: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80', alt: 'Residência Jardins' },
  { src: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80', alt: 'Mansão Vista do Vale' },
  { src: 'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=800&q=80', alt: 'Bancadas Calacatta' },
  { src: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&q=80', alt: 'Cobertura Duplex' },
  { src: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&q=80', alt: 'Varanda Gourmet com SPA' },
  { src: 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=800&q=80', alt: 'Refúgio da Serra' },
  { src: 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=800&q=80', alt: 'Salão Rústico Chic' },
  { src: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=800&q=80', alt: 'Suíte Presidencial' },
  { src: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80', alt: 'Villa Toscana' },
  { src: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800&q=80', alt: 'Penthouse Exclusiva' },
];

export function IntroOverlay() {
  const [progress, setProgress] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const totalDuration = 5000; // Total 5 segundos
    const fadeOutDuration = 600; // Fade out final
    const progressDuration = totalDuration - fadeOutDuration; // 4.4s de progresso ativo
    const startTime = performance.now();

    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const pct = Math.min(100, (elapsed / progressDuration) * 100);
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        handleFinish();
      }
    }, 20);

    return () => clearInterval(interval);
  }, []);

  const handleFinish = () => {
    setIsEnding(true);
    setTimeout(() => {
      setIsDone(true);
      window.location.href = '/home.html';
    }, 600);
  };

  if (isDone) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-[#071d1a] flex flex-col justify-between overflow-hidden transition-all duration-1000 ${
        isEnding ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* 3D Infinite Canvas Background */}
      <div className="absolute inset-0 z-0">
        <InfiniteGallery
          images={PROPERTY_IMAGES}
          speed={1.0}
          visibleCount={7}
          className="h-full w-full"
        />
      </div>

      {/* Dark Gradient Overlay for Contrast */}
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-[#071d1a]/80 via-[#071d1a]/30 to-[#071d1a]/90 pointer-events-none" />

      {/* Header Overlay - Only Skip button */}
      <div className="relative z-20 flex items-center justify-end p-6 md:p-10 pointer-events-none">
        <button
          onClick={handleFinish}
          type="button"
          className="pointer-events-auto rounded-full border border-[#d4af7a]/40 bg-[#071d1a]/80 px-6 py-2.5 text-xs font-bold tracking-wider text-[#d4af7a] uppercase transition-all hover:bg-[#d4af7a] hover:text-[#071d1a] hover:scale-105 active:scale-95 shadow-lg backdrop-blur-md"
        >
          Entrar
        </button>
      </div>

      {/* Center Logo & Branding Only */}
      <div className="relative z-20 flex flex-col items-center text-center px-4 pointer-events-none my-auto">
        <div className="w-12 h-12 mb-4 rounded-full border border-[#d4af7a]/40 bg-[#071d1a]/80 flex items-center justify-center shadow-lg backdrop-blur-md">
          <div className="w-4 h-4 rotate-45 border-2 border-[#d4af7a]" />
        </div>
        <h1
          className="text-4xl md:text-7xl font-light text-[#f8f5ef] tracking-tight max-w-3xl drop-shadow-lg"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          MONET <span className="italic text-[#d4af7a]">Imóveis</span>
        </h1>
      </div>

      {/* Footer Progress Line Only (No Text) */}
      <div className="relative z-20 p-6 md:p-10 flex flex-col items-center pointer-events-none">
        <div className="w-full max-w-xs h-0.5 bg-white/10 rounded-full overflow-hidden border border-[#d4af7a]/20">
          <div
            className="h-full bg-gradient-to-r from-[#d4af7a] to-[#e8c9a0] transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
