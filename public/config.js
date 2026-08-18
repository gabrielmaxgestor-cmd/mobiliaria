/**
 * SITE_CONFIG — dados que mudam por cliente/imobiliária.
 * Edite este arquivo para reconfigurar a marca sem tocar no HTML.
 */
window.SITE_CONFIG = {
  brandName: "Living Canvas",
  tagline: "Imóveis de Alto Padrão",
  logoUrl: "",
  whatsappNumber: "5511999999999",
  whatsappMessageDefault: "Olá! Vim pelo site e gostaria de mais informações.",
  phone: "(11) 99999-9999",
  email: "contato@livingcanvas.com.br",
  address: {
    street: "Av. Brigadeiro Faria Lima, 1000",
    neighborhood: "Itaim Bibi",
    city: "São Paulo",
    state: "SP",
    zip: "01451-000"
  },
  socialLinks: {
    instagram: "https://instagram.com/livingcanvas",
    facebook: "https://facebook.com/livingcanvas"
  },
  creci: "CRECI-SP 12345-J",
  primaryColor: "#0a0a0a",
  accentColor: "#c9a961"
};

(function () {
  const cfg = window.SITE_CONFIG;

  function get(path) {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), cfg);
  }

  function buildWaLink(customMessage) {
    const msg = encodeURIComponent(customMessage || cfg.whatsappMessageDefault);
    return `https://wa.me/${cfg.whatsappNumber}?text=${msg}`;
  }

  function applyConfig() {
    // 1) CSS vars com cores da marca
    const root = document.documentElement;
    if (cfg.primaryColor) root.style.setProperty("--brand-primary", cfg.primaryColor);
    if (cfg.accentColor) root.style.setProperty("--brand-accent", cfg.accentColor);

    // 2) Elementos com data-config="chave" recebem textContent
    document.querySelectorAll("[data-config]").forEach((el) => {
      const val = get(el.getAttribute("data-config"));
      if (val != null) el.textContent = val;
    });

    // 3) Elementos com data-config-href="chave" recebem href
    document.querySelectorAll("[data-config-href]").forEach((el) => {
      const val = get(el.getAttribute("data-config-href"));
      if (val != null) el.setAttribute("href", val);
    });

    // 4) Substitui "Living Canvas" em todos os text nodes pelo brandName
    if (cfg.brandName && cfg.brandName !== "Living Canvas") {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) {
        if (n.nodeValue && n.nodeValue.indexOf("Living Canvas") !== -1) nodes.push(n);
      }
      nodes.forEach((node) => {
        node.nodeValue = node.nodeValue.split("Living Canvas").join(cfg.brandName);
      });
    }

    // 5) Reescreve todos os links wa.me / api.whatsapp.com com o número configurado
    document.querySelectorAll('a[href*="wa.me/"], a[href*="api.whatsapp.com"]').forEach((a) => {
      const href = a.getAttribute("href") || "";
      // preserva ?text=... quando existir; caso contrário usa a mensagem padrão
      let customMsg = null;
      const m = href.match(/[?&]text=([^&]+)/);
      if (m) {
        try {
          customMsg = decodeURIComponent(m[1].replace(/\+/g, " "));
        } catch (_) {
          customMsg = null;
        }
      }
      a.setAttribute("href", buildWaLink(customMsg));
    });

    // 6) Meta tags e title: substitui "Living Canvas" se marca mudou
    if (cfg.brandName && cfg.brandName !== "Living Canvas") {
      if (document.title.indexOf("Living Canvas") !== -1) {
        document.title = document.title.split("Living Canvas").join(cfg.brandName);
      }
      document
        .querySelectorAll(
          'meta[property="og:title"], meta[name="twitter:title"], meta[property="og:site_name"], meta[property="og:description"], meta[name="twitter:description"], meta[name="description"], meta[name="author"]'
        )
        .forEach((m) => {
          const c = m.getAttribute("content") || "";
          if (c.indexOf("Living Canvas") !== -1) {
            m.setAttribute("content", c.split("Living Canvas").join(cfg.brandName));
          }
        });
    }

    // 7) Links sociais e contato marcados por data-config-social / data-config-contact
    document.querySelectorAll("[data-config-social]").forEach((el) => {
      const key = el.getAttribute("data-config-social");
      const val = cfg.socialLinks && cfg.socialLinks[key];
      if (val) el.setAttribute("href", val);
    });
    document.querySelectorAll("[data-config-contact]").forEach((el) => {
      const key = el.getAttribute("data-config-contact");
      const val = key === "phone" ? cfg.phone : key === "email" ? cfg.email : null;
      if (val) {
        el.textContent = val;
        if (el.tagName === "A") {
          el.setAttribute("href", key === "phone" ? `tel:${val.replace(/\D/g, "")}` : `mailto:${val}`);
        }
      }
    });
  }

  window.applySiteConfig = applyConfig;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyConfig);
  } else {
    applyConfig();
  }
})();
