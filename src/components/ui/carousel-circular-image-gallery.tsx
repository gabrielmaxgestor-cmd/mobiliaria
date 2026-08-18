"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";

export interface ImageData {
  title: string;
  url: string;
}

declare global {
  interface Window {
    gsap?: any;
    MotionPathPlugin?: any;
  }
}

const defaultImages: ImageData[] = [
  {
    title: "Casa contemporânea",
    url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=800&h=800&fit=crop",
  },
  {
    title: "Sala integrada",
    url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&h=800&fit=crop",
  },
  {
    title: "Cozinha gourmet",
    url: "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?q=80&w=800&h=800&fit=crop",
  },
  {
    title: "Suíte master",
    url: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?q=80&w=800&h=800&fit=crop",
  },
  {
    title: "Área de lazer",
    url: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=800&h=800&fit=crop",
  },
  {
    title: "Fachada ao entardecer",
    url: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?q=80&w=800&h=800&fit=crop",
  },
];

const WIDTH = 400;
const HEIGHT = 400;
const GAP = 10;
const CIRCLE_RADIUS = 7;

export function ImageGallery({
  images = defaultImages,
  className = "",
  onActiveChange,
  onExpandImage,
}: {
  images?: ImageData[];
  className?: string;
  onActiveChange?: (index: number) => void;
  onExpandImage?: (index: number) => void;
}) {
  const [opened, setOpened] = useState(0);
  const [inPlace, setInPlace] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const [gsapReady, setGsapReady] = useState(false);
  const autoplayTimer = useRef<number | null>(null);

  useEffect(() => {
    onActiveChange?.(opened);
  }, [opened, onActiveChange]);

  useEffect(() => {
    let cancelled = false;

    const register = () => {
      if (cancelled) return;
      if (window.gsap && window.MotionPathPlugin) {
        window.gsap.registerPlugin(window.MotionPathPlugin);
        setGsapReady(true);
      }
    };

    const load = (src: string) =>
      new Promise<void>((resolve) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
        if (existing) {
          if (existing.dataset["loaded"] === "true") resolve();
          else existing.addEventListener("load", () => resolve());
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => {
          s.dataset["loaded"] = "true";
          resolve();
        };
        document.body.appendChild(s);
      });

    if (window.gsap && window.MotionPathPlugin) {
      register();
    } else {
      load("https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js")
        // prettier-ignore
        .then(() => load("https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/MotionPathPlugin.min.js"))
        .then(register);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const onClick = (index: number) => {
    if (!disabled) setOpened(index);
  };

  const onInPlace = useCallback((index: number) => setInPlace(index), []);

  const next = useCallback(() => {
    setOpened((current) => (current + 1 >= images.length ? 0 : current + 1));
  }, [images.length]);

  const prev = useCallback(() => {
    setOpened((current) => (current - 1 < 0 ? images.length - 1 : current - 1));
  }, [images.length]);

  useEffect(() => setDisabled(true), [opened]);
  useEffect(() => setDisabled(false), [inPlace]);

  useEffect(() => {
    if (!gsapReady) return;
    if (autoplayTimer.current) clearInterval(autoplayTimer.current);
    autoplayTimer.current = window.setInterval(next, 4500);
    return () => {
      if (autoplayTimer.current) clearInterval(autoplayTimer.current);
    };
  }, [opened, gsapReady, next]);

  return (
    <div className={`relative mx-auto aspect-square w-full max-w-[400px] select-none ${className}`}>
      {onExpandImage && (
        <button
          type="button"
          aria-label="Expandir foto em tela cheia"
          title="Expandir foto em tela cheia (Clique para ver em tamanho original)"
          onClick={() => onExpandImage(opened)}
          className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-full border border-[#d4af7a]/40 bg-[#071d1a]/80 px-3 py-1.5 text-xs font-semibold text-[#f8f5ef] shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:border-[#d4af7a] hover:bg-[#071d1a] active:scale-95"
        >
          <Maximize2 className="h-3.5 w-3.5 text-[#d4af7a]" />
          <span>Expandir</span>
        </button>
      )}

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full overflow-visible">
        {gsapReady &&
          images.map((image, i) => (
            <GalleryImage
              key={image.url + i}
              id={i}
              url={image.url}
              title={image.title}
              total={images.length}
              open={opened === i}
              inPlace={inPlace === i}
              onInPlace={onInPlace}
              onExpand={onExpandImage}
            />
          ))}
        <Tabs images={images} onSelect={onClick} active={opened} />
      </svg>

      <button
        type="button"
        aria-label="Imagem anterior"
        onClick={prev}
        className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-2 text-foreground shadow-md backdrop-blur transition-transform duration-300 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        aria-label="Próxima imagem"
        onClick={next}
        className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-2 text-foreground shadow-md backdrop-blur transition-transform duration-300 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

interface GalleryImageProps {
  url: string;
  title: string;
  open: boolean;
  inPlace: boolean;
  id: number;
  onInPlace: (id: number) => void;
  total: number;
  onExpand?: (id: number) => void;
}

function GalleryImage({ url, title, open, id, onInPlace, total, onExpand }: GalleryImageProps) {
  const firstLoad = useRef(true);
  const clip = useRef<SVGCircleElement | null>(null);

  const gap = GAP;
  const circleRadius = CIRCLE_RADIUS;
  const defaults = { transformOrigin: "center center" };
  const duration = 0.4;
  const width = WIDTH;
  const height = HEIGHT;
  const scale = 700;

  const bigSize = circleRadius * scale;
  const overlap = 0;

  const getPosSmall = () => ({
    cx: width / 2 - (total * (circleRadius * 2 + gap) - gap) / 2 + id * (circleRadius * 2 + gap),
    cy: height - 30,
    r: circleRadius,
  });
  const getPosSmallAbove = () => ({
    cx: width / 2 - (total * (circleRadius * 2 + gap) - gap) / 2 + id * (circleRadius * 2 + gap),
    cy: height / 2,
    r: circleRadius * 2,
  });
  const getPosCenter = () => ({ cx: width / 2, cy: height / 2, r: circleRadius * 7 });
  const getPosEnd = () => ({ cx: width / 2 - bigSize + overlap, cy: height / 2, r: bigSize });
  const getPosStart = () => ({ cx: width / 2 + bigSize - overlap, cy: height / 2, r: bigSize });

  useEffect(() => {
    const gsap = window.gsap;
    if (!gsap || !clip.current) return;

    const isFirst = firstLoad.current;
    firstLoad.current = false;

    const flipDuration = isFirst ? 0 : duration;
    const upDuration = isFirst ? 0 : 0.2;
    const bounceDuration = isFirst ? 0.01 : 1;
    const delay = isFirst ? 0 : flipDuration + upDuration;

    if (open) {
      gsap
        .timeline()
        .set(clip.current, { ...defaults, ...getPosSmall() })
        .to(clip.current, {
          ...defaults,
          ...getPosCenter(),
          duration: upDuration,
          ease: "power3.inOut",
        })
        .to(clip.current, {
          ...defaults,
          ...getPosEnd(),
          duration: flipDuration,
          ease: "power4.in",
          onComplete: () => onInPlace(id),
        });
    } else {
      gsap
        .timeline({ overwrite: true })
        .set(clip.current, { ...defaults, ...getPosStart() })
        .to(clip.current, {
          ...defaults,
          ...getPosCenter(),
          delay,
          duration: flipDuration,
          ease: "power4.out",
        })
        .to(clip.current, {
          ...defaults,
          motionPath: { path: [getPosSmallAbove(), getPosSmall()], curviness: 1 },
          duration: bounceDuration,
          ease: "bounce.out",
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const clipId = `circular-gallery-clip-${id}`;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <circle ref={clip} cx={width / 2} cy={height / 2} r={circleRadius} />
        </clipPath>
      </defs>
      <g
        clipPath={`url(#${clipId})`}
        onClick={() => {
          if (open && onExpand) {
            onExpand(id);
          }
        }}
        className={open && onExpand ? "cursor-pointer" : ""}
      >
        <image
          href={url}
          x={0}
          y={0}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid slice"
        />
        <title>{title}{open && onExpand ? " (Clique para expandir em tela cheia)" : ""}</title>
      </g>
    </g>
  );
}

interface TabsProps {
  images: ImageData[];
  onSelect: (index: number) => void;
  active: number;
}

function Tabs({ images, onSelect, active }: TabsProps) {
  const gap = GAP;
  const circleRadius = CIRCLE_RADIUS;
  const width = WIDTH;
  const height = HEIGHT;

  const getPosX = (i: number) =>
    width / 2 - (images.length * (circleRadius * 2 + gap) - gap) / 2 + i * (circleRadius * 2 + gap);
  const getPosY = () => height - 30;

  return (
    <g>
      {images.map((image, i) => (
        <circle
          key={image.url + i}
          onClick={() => onSelect(i)}
          className={`cursor-pointer fill-white/0 transition-all ${
            active === i ? "stroke-white" : "stroke-white/60 hover:stroke-white"
          }`}
          strokeWidth="2"
          cx={getPosX(i)}
          cy={getPosY()}
          r={circleRadius + 2}
        >
          <title>{image.title}</title>
        </circle>
      ))}
    </g>
  );
}

export default ImageGallery;
