/**
 * Living Canvas - Panel Shell JavaScript Module
 * Gerenciamento centralizado de Views com ciclo de vida (mount / unmount),
 * Roteamento por Hash, atualização de títulos e navegação (aria-current),
 * Toasts globais, modais e utilitários compartilhados.
 */

// Registro de views
const views = new Map();
let currentViewId = null;
let currentUnmountCleanup = null;
const routeAliases = new Map([
  ['#historico', '#jornada'],
  ['historico', 'jornada'],
  ['#imoveis', '#meus-imoveis'],
  ['imoveis', 'meus-imoveis'],
  ['#agenda', '#visitas'],
  ['agenda', 'visitas'],
  ['#desempenho', '#relatorios'],
  ['desempenho', 'relatorios'],
  ['#perfil', '#configuracoes'],
  ['perfil', 'configuracoes']
]);

/**
 * Utilitários de escape e formatação
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatMoeda(val) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
}

export function formatData(timestampOrDate, showTime = false) {
  if (!timestampOrDate) return '—';
  let date;
  if (typeof timestampOrDate?.toDate === 'function') {
    date = timestampOrDate.toDate();
  } else if (timestampOrDate?.seconds) {
    date = new Date(timestampOrDate.seconds * 1000);
  } else {
    date = new Date(timestampOrDate);
  }
  if (isNaN(date.getTime())) return '—';

  const options = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  };
  if (showTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return new Intl.DateTimeFormat('pt-BR', options).format(date);
}

export function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Sistema de Toasts
 */
export function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('panelToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'panelToastContainer';
    container.className = 'panel-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `panel-toast ${type === 'error' ? 'error' : (type === 'success' ? 'success' : '')}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✓';
  if (type === 'error') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Modal e Drawer Helpers
 */
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => {
      if (!modal.classList.contains('open')) {
        modal.style.display = 'none';
      }
    }, 250);
  }
}

/**
 * Registro de View
 * @param {string} id - Nome identificador da view (ex: 'visao-geral', sem o hash)
 * @param {Object} config - { titulo: string, mount: (container, user) => cleanupFn|void, unmount: () => void }
 */
export function registerView(id, config) {
  const cleanId = id.replace(/^#/, '');
  views.set(cleanId, {
    titulo: config.titulo || 'Painel',
    mount: config.mount || (() => {}),
    unmount: config.unmount || null
  });
}

/**
 * Resolve o hash atual (respeitando aliases)
 */
function resolveHash() {
  let hash = window.location.hash || '';
  if (routeAliases.has(hash)) {
    hash = routeAliases.get(hash);
  }
  const clean = hash.replace(/^#/, '');
  return clean;
}

/**
 * Navega para uma View pelo ID
 */
export async function navigateToView(rawId, user = null) {
  const resolvedId = routeAliases.get(rawId) || rawId;
  const cleanId = resolvedId.replace(/^#/, '');
  const viewConfig = views.get(cleanId);

  // Executa unmount da view anterior
  if (currentUnmountCleanup) {
    try {
      if (typeof currentUnmountCleanup === 'function') {
        currentUnmountCleanup();
      }
    } catch (e) {
      console.warn('Erro ao desmontar view anterior:', e);
    }
    currentUnmountCleanup = null;
  }

  if (currentViewId && views.has(currentViewId)) {
    const prev = views.get(currentViewId);
    if (typeof prev.unmount === 'function') {
      try { prev.unmount(); } catch (e) { console.warn(e); }
    }
  }

  // Oculta todas as seções de view no DOM
  document.querySelectorAll('[data-view-section]').forEach(el => {
    el.style.display = 'none';
  });

  currentViewId = cleanId;

  // Atualiza nav items ativos
  document.querySelectorAll('.panel-nav-item, .nav-item').forEach(link => {
    const href = link.getAttribute('href') || '';
    const linkHash = href.includes('#') ? href.substring(href.indexOf('#') + 1) : href;
    const isTarget = linkHash === cleanId || routeAliases.get(linkHash) === cleanId;
    if (isTarget) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    }
  });

  // Atualiza título da página
  if (viewConfig && viewConfig.titulo) {
    const baseTitle = document.body.dataset.panelTitle || 'Living Canvas';
    document.title = `${viewConfig.titulo} — ${baseTitle}`;
    const pageTitleEl = document.getElementById('panelCurrentPageTitle');
    if (pageTitleEl) pageTitleEl.textContent = viewConfig.titulo;
  }

  // Exibe a seção alvo
  const targetSection = document.getElementById(`view-${cleanId}`) || document.querySelector(`[data-view-section="${cleanId}"]`);
  if (targetSection) {
    targetSection.style.display = 'block';
  }

  // Executa mount da view
  if (viewConfig && typeof viewConfig.mount === 'function') {
    try {
      const cleanup = await viewConfig.mount(targetSection, user);
      if (typeof cleanup === 'function') {
        currentUnmountCleanup = cleanup;
      }
    } catch (err) {
      console.error(`Erro ao montar view "${cleanId}":`, err);
      showToast(`Não foi possível carregar a seção ${cleanId}`, 'error');
    }
  }

  // Fecha sidebar mobile se aberta
  const sidebar = document.querySelector('.panel-sidebar, .sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
  }
}

/**
 * Inicializador do Shell de Painel
 */
export function initPanelShell({ defaultView = 'visao-geral', user = null } = {}) {
  // Mobile sidebar toggle
  const toggleBtn = document.getElementById('panelToggleBtn') || document.getElementById('sidebarToggleBtn');
  const sidebar = document.querySelector('.panel-sidebar') || document.querySelector('.sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target) && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
    });
  }

  // Escuta mudanças de hash na URL
  window.addEventListener('hashchange', () => {
    const nextView = resolveHash() || defaultView;
    if (views.has(nextView)) {
      navigateToView(nextView, user);
    } else if (views.has(defaultView)) {
      navigateToView(defaultView, user);
    }
  });

  // Rota inicial
  const initialView = resolveHash() || defaultView;
  if (views.has(initialView)) {
    navigateToView(initialView, user);
  } else if (views.has(defaultView)) {
    navigateToView(defaultView, user);
  }
}

// Expõe globalmente
window.LivingCanvasPanel = {
  registerView,
  navigateToView,
  initPanelShell,
  escapeHtml,
  formatMoeda,
  formatData,
  debounce,
  showToast,
  openModal,
  closeModal
};

export default window.LivingCanvasPanel;
