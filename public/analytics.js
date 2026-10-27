/**
 * public/analytics.js
 * 
 * Gerenciador dinâmico do Google Analytics 4 (GA4) com proteção estrita de privacidade e conformidade LGPD.
 * Lê o ID de rastreamento de window.SITE_CONFIG.gaTrackingId (ou window.SITE_CONFIG.gaMeasurementId).
 * 
 * DIRETRIZES DE PRIVACIDADE:
 * 1. Não dispara tags nem envia eventos de medição (page_view) até que o consentimento seja explicitamente manipulado.
 * 2. Implementa Google Consent Mode v2 com estado inicial estritamente 'denied'.
 * 3. Respeita a diretiva global Do Not Track (DNT) do navegador do visitante.
 * 4. Ativa anonimização de IP e restrição de processamento de dados (restricted_data_processing).
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'lc_ga_consent';

  /**
   * Obtém o Tracking ID configurado no SITE_CONFIG.
   * @returns {string|null}
   */
  function getTrackingId() {
    if (!window.SITE_CONFIG) return null;
    const id = window.SITE_CONFIG.gaTrackingId || window.SITE_CONFIG.gaMeasurementId;
    if (typeof id === 'string' && id.trim().length > 0) {
      return id.trim();
    }
    return null;
  }

  /**
   * Verifica se o navegador do visitante está com Do Not Track (DNT) ativado.
   * @returns {boolean}
   */
  function isDoNotTrackEnabled() {
    const privacyCfg = (window.SITE_CONFIG && window.SITE_CONFIG.analyticsPrivacy) || {};
    if (privacyCfg.respectDoNotTrack === false) return false;
    return (
      navigator.doNotTrack === '1' ||
      window.doNotTrack === '1' ||
      navigator.msDoNotTrack === '1'
    );
  }

  /**
   * Recupera o estado de consentimento armazenado pelo usuário.
   * @returns {'granted'|'denied'|null}
   */
  function getStoredConsent() {
    try {
      const val = localStorage.getItem(STORAGE_KEY);
      if (val === 'granted' || val === 'denied') return val;
      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Inicializa o dataLayer e a função gtag() do Google com Consent Mode v2.
   */
  function ensureGtag() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
    }
  }

  /**
   * Carrega a tag do gtag.js dinamicamente e de forma assíncrona.
   * @param {string} trackingId
   */
  function loadGtagScript(trackingId) {
    const scriptSrc = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(trackingId)}`;
    if (document.querySelector(`script[src*="googletagmanager.com/gtag/js?id="]`)) {
      return;
    }
    const script = document.createElement('script');
    script.async = true;
    script.src = scriptSrc;
    document.head.appendChild(script);
  }

  /**
   * Configura o GA4 e dispara o page_view inicial apenas após o consentimento ser concedido.
   * @param {string} trackingId
   */
  function startTracking(trackingId) {
    ensureGtag();

    // Atualiza o Consent Mode v2 para analytics_storage: granted
    window.gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });

    // Injeta o script se ainda não estiver presente no DOM
    loadGtagScript(trackingId);

    // Inicializa gtag com anonimização de IP e restrições de privacidade LGPD
    window.gtag('js', new Date());
    window.gtag('config', trackingId, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      restricted_data_processing: true,
      cookie_flags: 'SameSite=None;Secure',
      send_page_view: true
    });
  }

  /**
   * Manipula o consentimento do usuário (concedido ou negado).
   * @param {boolean} granted
   */
  function handleConsent(granted) {
    const trackingId = getTrackingId();
    const state = granted ? 'granted' : 'denied';

    try {
      localStorage.setItem(STORAGE_KEY, state);
    } catch (_) {}

    ensureGtag();

    if (granted && trackingId && !isDoNotTrackEnabled()) {
      startTracking(trackingId);
    } else {
      window.gtag('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
    }

    // Dispara evento para integração com outros módulos
    window.dispatchEvent(new CustomEvent('lc-ga-consent-changed', {
      detail: { granted, trackingId }
    }));
  }

  /**
   * Renderiza a barra discreta e elegante de consentimento de privacidade.
   */
  function renderConsentModal() {
    if (document.getElementById('lc-ga-consent-dialog')) return;

    function build() {
      if (document.getElementById('lc-ga-consent-dialog')) return;

      const dialog = document.createElement('div');
      dialog.id = 'lc-ga-consent-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-label', 'Preferências de cookies e privacidade');
      dialog.innerHTML = `
        <div class="lc-ga-consent-inner">
          <div class="lc-ga-consent-text">
            <span class="lc-ga-badge">Privacidade</span>
            <p>Utilizamos cookies e métricas anônimas com dados anonimizados para aprimorar sua experiência de navegação, em estrito respeito à LGPD. Nenhuma métrica é coletada sem a sua autorização.</p>
          </div>
          <div class="lc-ga-consent-actions">
            <button type="button" id="lc-ga-btn-reject" class="lc-ga-btn lc-ga-btn-ghost">Apenas Essenciais</button>
            <button type="button" id="lc-ga-btn-accept" class="lc-ga-btn lc-ga-btn-gold">Aceitar Métricas</button>
          </div>
        </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
        #lc-ga-consent-dialog {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          width: calc(100% - 32px);
          max-width: 760px;
          background: rgba(10, 46, 42, 0.96);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(212, 175, 122, 0.38);
          border-radius: 14px;
          padding: 16px 20px;
          color: #f5f1e8;
          font-family: 'Inter', -apple-system, sans-serif;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
          z-index: 999999;
          animation: lcGaFadeUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes lcGaFadeUp {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .lc-ga-consent-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
        }
        .lc-ga-consent-text {
          flex: 1 1 320px;
        }
        .lc-ga-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #0a2e2a;
          background: #d4af7a;
          padding: 2px 8px;
          border-radius: 4px;
          margin-bottom: 6px;
        }
        .lc-ga-consent-text p {
          margin: 0;
          font-size: 13px;
          line-height: 1.45;
          color: #e6ded3;
        }
        .lc-ga-consent-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-shrink: 0;
        }
        .lc-ga-btn {
          font-family: 'Inter', sans-serif;
          font-size: 12.5px;
          font-weight: 500;
          padding: 9px 16px;
          border-radius: 7px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          min-height: 38px;
        }
        .lc-ga-btn-gold {
          background: linear-gradient(135deg, #d4af7a 0%, #b89758 100%);
          color: #0a2e2a;
          font-weight: 600;
        }
        .lc-ga-btn-gold:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        .lc-ga-btn-ghost {
          background: rgba(255, 255, 255, 0.08);
          color: #f5f1e8;
          border: 1px solid rgba(212, 175, 122, 0.28);
        }
        .lc-ga-btn-ghost:hover {
          background: rgba(255, 255, 255, 0.16);
        }
        @media (max-width: 640px) {
          #lc-ga-consent-dialog { bottom: 12px; padding: 14px; }
          .lc-ga-consent-actions { width: 100%; justify-content: flex-end; }
          .lc-ga-btn { flex: 1; text-align: center; }
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(dialog);

      const btnAccept = document.getElementById('lc-ga-btn-accept');
      const btnReject = document.getElementById('lc-ga-btn-reject');

      function dismiss() {
        dialog.style.opacity = '0';
        dialog.style.transform = 'translate(-50%, 15px)';
        dialog.style.transition = 'all 0.25s ease';
        setTimeout(() => {
          if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        }, 260);
      }

      if (btnAccept) {
        btnAccept.addEventListener('click', () => {
          handleConsent(true);
          dismiss();
        });
      }

      if (btnReject) {
        btnReject.addEventListener('click', () => {
          handleConsent(false);
          dismiss();
        });
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', build);
    } else {
      build();
    }
  }

  /**
   * Ponto de entrada principal:
   * Valida ID, aplica o Google Consent Mode v2 com 'denied' inicial, e só dispara tags após consentimento.
   */
  function init() {
    const trackingId = getTrackingId();

    // Se nenhum Tracking ID estiver presente em SITE_CONFIG, sai sem carregar nada
    if (!trackingId) return;

    // Garante que gtag esteja definido
    ensureGtag();

    // Define o estado padrão obrigatório de consentimento como NEGADO (Consent Mode v2)
    window.gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: 500
    });

    // Se o usuário estiver com Do Not Track (DNT) habilitado no navegador, respeita a privacidade e encerra
    if (isDoNotTrackEnabled()) {
      return;
    }

    const storedConsent = getStoredConsent();

    if (storedConsent === 'granted') {
      // Consentimento já foi previamente concedido pelo usuário: inicia rastreamento respeitoso
      startTracking(trackingId);
    } else if (storedConsent === 'denied') {
      // Consentimento já foi negado pelo usuário: não carrega script e não envia eventos
      return;
    } else {
      // Consentimento AINDA NÃO FOI MANIPULADO:
      // O script NÃO dispara qualquer tag ou evento até que o usuário responda.
      renderConsentModal();
    }
  }

  // Expõe API no objeto window
  window.handleAnalyticsConsent = handleConsent;
  window.getAnalyticsTrackingId = getTrackingId;
  window.hasAnalyticsConsent = function () {
    return getStoredConsent() === 'granted';
  };
  window.initGoogleAnalytics = init;

  // Inicializa o script
  init();
})();
