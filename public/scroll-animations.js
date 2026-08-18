/**
 * Animações de entrada sutis via Intersection Observer.
 * - fade + translateY(16px) -> 0
 * - easing cubic-bezier(0.16, 1, 0.3, 1), 700ms
 * - cascata entre irmãos (80ms)
 * - respeita prefers-reduced-motion
 * - não anima elementos já visíveis no primeiro paint (above the fold)
 */
(function () {
  if (typeof window === "undefined") return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  // Injeta estilos base
  const style = document.createElement("style");
  style.textContent = `
    .lc-reveal {
      opacity: 0;
      transform: translateY(16px);
      transition: opacity 700ms cubic-bezier(0.16, 1, 0.3, 1),
                  transform 700ms cubic-bezier(0.16, 1, 0.3, 1);
      will-change: opacity, transform;
    }
    .lc-reveal.is-visible {
      opacity: 1;
      transform: translateY(0);
    }
    @media (prefers-reduced-motion: reduce) {
      .lc-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
    }
  `;
  document.head.appendChild(style);

  // Seletores candidatos a animar
  const SELECTORS = [
    "section .section-header",
    "section .section-title",
    ".property-card",
    ".neighborhood-card",
    ".uni-card",
    ".uni-stat",
    ".testimonial-card",
    ".stat-card",
    ".value-card",
    ".team-card",
    ".timeline-item",
    ".feature-card",
    ".highlight-card",
    "section > .container > h2",
    "section > .container > p",
  ];

  function init() {
    const viewportH = window.innerHeight || document.documentElement.clientHeight;

    const candidates = new Set();
    SELECTORS.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => candidates.add(el));
    });

    // Agrupa irmãos por parent para calcular delay em cascata
    const parents = new Map();
    candidates.forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Above the fold: já visível no primeiro paint -> não anima
      if (rect.top < viewportH * 0.9) return;

      const parent = el.parentElement || document.body;
      if (!parents.has(parent)) parents.set(parent, []);
      parents.get(parent).push(el);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const delay = parseInt(el.dataset.lcDelay || "0", 10);
          el.style.transitionDelay = delay + "ms";
          el.classList.add("is-visible");
          observer.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );

    parents.forEach((siblings) => {
      siblings.forEach((el, i) => {
        el.classList.add("lc-reveal");
        // Escalona até 6 itens para não segurar muito o último
        el.dataset.lcDelay = String(Math.min(i, 6) * 90);
        observer.observe(el);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
