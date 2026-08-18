/**
 * Aplica texturas orgânicas:
 *  - .lc-grain em heros e seções com fundo escuro
 *  - .lc-mesh atrás de seções de estatísticas / depoimentos
 * Idempotente: só adiciona classes, nunca duplica.
 */
(function () {
  if (typeof window === "undefined") return;

  function isDarkBg(el) {
    const bg = getComputedStyle(el).backgroundColor;
    const m = bg.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const [r, g, b, a = 1] = m[1].split(",").map((v) => parseFloat(v));
    if (a < 0.2) return false;
    // luminância percebida
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum < 90;
  }

  function apply() {
    // Heros
    document
      .querySelectorAll(
        ".hero, .hero-section, .page-hero, [class*='hero-']"
      )
      .forEach((el) => {
        el.classList.add("lc-grain");
        if (isDarkBg(el)) el.classList.add("lc-grain--dark");
      });

    // Seções com fundo escuro genéricas
    document.querySelectorAll("section, header, footer").forEach((el) => {
      if (el.classList.contains("lc-grain")) return;
      if (isDarkBg(el)) {
        el.classList.add("lc-grain", "lc-grain--dark");
      }
    });

    // Mesh atrás de estatísticas e depoimentos
    const meshTargets = [
      ".stats",
      ".stats-section",
      ".stats-bar",
      "#stats",
      ".testimonials",
      ".testimonials-section",
      "#depoimentos",
      "[data-section='stats']",
      "[data-section='testimonials']",
    ];
    document.querySelectorAll(meshTargets.join(",")).forEach((el) => {
      // Sobe pro <section> mais próximo se for um container interno
      const target = el.closest("section") || el;
      target.classList.add("lc-mesh");
      if (!isDarkBg(target)) target.classList.add("lc-mesh--light");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
})();
