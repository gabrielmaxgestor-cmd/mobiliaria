/**
 * JSON-LD (schema.org) injection using window.SITE_CONFIG.
 * Runs per page based on location.pathname.
 */
(function () {
  function cfg() {
    return window.SITE_CONFIG || {};
  }

  function inject(obj) {
    try {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.textContent = JSON.stringify(obj);
      document.head.appendChild(s);
    } catch (e) {
      /* noop */
    }
  }

  function agent() {
    const c = cfg();
    const addr = c.address || {};
    const sameAs = [];
    if (c.socialLinks) {
      if (c.socialLinks.instagram) sameAs.push(c.socialLinks.instagram);
      if (c.socialLinks.facebook) sameAs.push(c.socialLinks.facebook);
    }
    const obj = {
      "@context": "https://schema.org",
      "@type": "RealEstateAgent",
      name: c.brandName || "",
      description: c.tagline || undefined,
      url: location.origin + "/",
      telephone: c.phone || undefined,
      email: c.email || undefined,
      image: c.logoUrl || undefined,
      address: {
        "@type": "PostalAddress",
        streetAddress: addr.street || undefined,
        addressLocality: addr.city || undefined,
        addressRegion: addr.state || undefined,
        postalCode: addr.zip || undefined,
        addressCountry: "BR",
      },
      sameAs: sameAs.length ? sameAs : undefined,
    };
    // remove undefined
    Object.keys(obj).forEach((k) => obj[k] === undefined && delete obj[k]);
    Object.keys(obj.address).forEach(
      (k) => obj.address[k] === undefined && delete obj.address[k]
    );
    return obj;
  }

  function textOf(el) {
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function parsePriceBRL(str) {
    if (!str) return null;
    const m = str.replace(/\s/g, "").match(/R\$?\s*([\d\.]+(?:,\d+)?)/i);
    if (!m) return null;
    return m[1].replace(/\./g, "").replace(",", ".");
  }

  function listingSchema() {
    const c = cfg();
    const titleEl = document.querySelector(".property-title");
    const locEl = document.querySelector(".property-location");
    const priceEl = document.querySelector(".property-price");
    const descEl = document.querySelector(".property-description, .description-text");
    const heroImg = document.querySelector(".property-hero img, .hero img, .gallery img, img");

    const name = textOf(titleEl) || document.title;
    const locText = textOf(locEl);
    const priceRaw = textOf(priceEl);
    const price = parsePriceBRL(priceRaw);

    // extract floor size (first m² number)
    let floorSize;
    const m2 = locText.match(/(\d+[\d\.]*)\s*m²/);
    if (m2) floorSize = parseFloat(m2[1].replace(/\./g, ""));

    // rooms — try to find "Quartos" stat
    let rooms;
    document.querySelectorAll(".stat-label, .quick-stat, .amenity-label").forEach((el) => {
      const t = textOf(el).toLowerCase();
      if (!rooms && /quartos?|suítes?|dormitórios?/.test(t)) {
        const sib = el.previousElementSibling || el.nextElementSibling;
        const num = (textOf(sib) || t).match(/(\d+)/);
        if (num) rooms = parseInt(num[1], 10);
      }
    });

    const addr = c.address || {};
    const obj = {
      "@context": "https://schema.org",
      "@type": "Residence",
      name: name,
      description: textOf(descEl) || undefined,
      url: location.href,
      image: heroImg ? heroImg.src : undefined,
      address: {
        "@type": "PostalAddress",
        streetAddress: locText || undefined,
        addressLocality: addr.city || undefined,
        addressRegion: addr.state || undefined,
        addressCountry: "BR",
      },
      floorSize: floorSize
        ? { "@type": "QuantitativeValue", value: floorSize, unitCode: "MTK" }
        : undefined,
      numberOfRooms: rooms || undefined,
    };
    if (price) {
      obj.offers = {
        "@type": "Offer",
        price: price,
        priceCurrency: "BRL",
        availability: "https://schema.org/InStock",
        url: location.href,
      };
    }
    Object.keys(obj).forEach((k) => obj[k] === undefined && delete obj[k]);
    Object.keys(obj.address).forEach(
      (k) => obj.address[k] === undefined && delete obj.address[k]
    );
    return obj;
  }

  function faqSchema() {
    const items = [];
    document.querySelectorAll(".faq-item").forEach((it) => {
      const q = textOf(it.querySelector(".faq-question span") || it.querySelector(".faq-question"));
      const a = textOf(it.querySelector(".faq-answer-content") || it.querySelector(".faq-answer"));
      if (q && a) {
        items.push({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        });
      }
    });
    if (!items.length) return null;
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items,
    };
  }

  function run() {
    const path = location.pathname.replace(/\/$/, "").split("/").pop() || "home.html";
    if (["home.html", "sobre.html", "contato.html", ""].includes(path)) {
      inject(agent());
    } else if (path === "imovel.html") {
      inject(listingSchema());
    } else if (path === "faq.html") {
      const s = faqSchema();
      if (s) inject(s);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
