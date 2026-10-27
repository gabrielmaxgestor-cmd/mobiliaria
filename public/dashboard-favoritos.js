/**
 * Living Canvas - Dashboard do Cliente: Favoritos & Comparador (P13)
 * 
 * Gerencia a coleção particular de imóveis favoritos:
 * - Filtros dinâmicos (disponibilidade, tipo de imóvel, busca por texto)
 * - Ordenação (preço crescente/decrescente, mais recentes, maior área)
 * - Selos informativos de status atual (vendido, reservado, alugado)
 * - Ações contextuais por card: Agendar Visita, Fazer Proposta, Contato e Remover
 * - Seleção múltipla para comparação lado a lado (máx. 3) -> comparador.html?ids=a,b,c
 */

import { registerView } from './panel-shell.js';
import LivingCanvasFavorites from './favorites.js';
import LivingCanvasAuth from './auth.js';

let allFavorites = [];
let selectedForComparison = new Set();
let currentFilter = {
  status: 'all',
  tipo: 'all',
  ordem: 'recentes',
  busca: ''
};

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoeda(val) {
  if (val == null || isNaN(val)) return 'Consulte';
  return 'R$ ' + Number(val).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function showToast(message, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  const toastContainer = document.getElementById('living-canvas-toast-container') || document.body;
  const toast = document.createElement('div');
  toast.className = `panel-toast panel-toast-${type}`;
  toast.style.cssText = `
    position: fixed; bottom: 2rem; right: 2rem; z-index: 10000;
    padding: 0.85rem 1.25rem; border-radius: 8px; font-size: 0.88rem;
    background: ${type === 'error' ? '#7f1d1d' : type === 'success' ? '#064e3b' : '#0a2e2a'};
    border: 1px solid var(--gold); color: var(--cream); box-shadow: 0 10px 25px rgba(0,0,0,0.5);
  `;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function filtrarEOrdenarFavoritos() {
  let list = [...allFavorites];

  // Busca textual
  if (currentFilter.busca.trim()) {
    const q = currentFilter.busca.trim().toLowerCase();
    list = list.filter(p => {
      const tit = (p.titulo || '').toLowerCase();
      const bai = (p.endereco?.bairro || '').toLowerCase();
      const cid = (p.endereco?.cidade || '').toLowerCase();
      return tit.includes(q) || bai.includes(q) || cid.includes(q);
    });
  }

  // Filtro por status
  if (currentFilter.status === 'disponivel') {
    list = list.filter(p => !p.status || p.status === 'disponivel');
  } else if (currentFilter.status === 'indisponivel') {
    list = list.filter(p => p.status && p.status !== 'disponivel');
  }

  // Filtro por tipo
  if (currentFilter.tipo !== 'all') {
    list = list.filter(p => (p.tipo || '').toLowerCase() === currentFilter.tipo);
  }

  // Ordenação
  if (currentFilter.ordem === 'menor-preco') {
    list.sort((a, b) => (Number(a.preco) || 0) - (Number(b.preco) || 0));
  } else if (currentFilter.ordem === 'maior-preco') {
    list.sort((a, b) => (Number(b.preco) || 0) - (Number(a.preco) || 0));
  } else if (currentFilter.ordem === 'area') {
    list.sort((a, b) => (Number(b.caracteristicas?.areaM2) || 0) - (Number(a.caracteristicas?.areaM2) || 0));
  } else {
    // Recentes por padrão
    list.sort((a, b) => {
      const tA = a.favoritadoEm?.toMillis ? a.favoritadoEm.toMillis() : new Date(a.favoritadoEm || 0).getTime();
      const tB = b.favoritadoEm?.toMillis ? b.favoritadoEm.toMillis() : new Date(b.favoritadoEm || 0).getTime();
      return tB - tA;
    });
  }

  return list;
}

function renderFavoritosGrid() {
  const grid = document.getElementById('dashboardFavoritesGrid');
  if (!grid) return;

  const filtered = filtrarEOrdenarFavoritos();

  if (allFavorites.length === 0) {
    grid.innerHTML = `
      <div class="panel-empty-state" style="grid-column: 1/-1;">
        <div class="panel-empty-icon">🤍</div>
        <h4 class="panel-empty-title">Nenhum imóvel favoritado</h4>
        <p class="panel-empty-desc">Explore nossa seleção exclusiva e marque os imóveis com o coração para salvá-los aqui.</p>
        <a href="imoveis.html" class="panel-btn panel-btn-primary panel-btn-sm">Explorar Catálogo de Imóveis</a>
      </div>
    `;
    atualizarBarraComparacao();
    return;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="panel-empty-state" style="grid-column: 1/-1;">
        <div class="panel-empty-icon">🔍</div>
        <h4 class="panel-empty-title">Nenhum imóvel com os filtros aplicados</h4>
        <p class="panel-empty-desc">Altere ou limpe os filtros acima para visualizar seus imóveis salvos.</p>
        <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" id="btnResetFavFilters">Limpar Filtros</button>
      </div>
    `;
    const btnReset = document.getElementById('btnResetFavFilters');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        currentFilter = { status: 'all', tipo: 'all', ordem: 'recentes', busca: '' };
        sincronizarFiltrosUI();
        renderFavoritosGrid();
      });
    }
    atualizarBarraComparacao();
    return;
  }

  grid.innerHTML = filtered.map(prop => {
    const isSelected = selectedForComparison.has(prop.id);
    const img = (prop.imagens && prop.imagens[0]) || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80';
    const bairro = prop.endereco?.bairro || 'Localização Nobre';
    const cidade = prop.endereco?.cidade || 'SP';
    const area = prop.caracteristicas?.areaM2 || 0;
    const quartos = prop.caracteristicas?.quartos || 0;
    const suites = prop.caracteristicas?.suites || 0;
    const vagas = prop.caracteristicas?.vagas || 0;
    const status = (prop.status || 'disponivel').toLowerCase();
    const isAvailable = status === 'disponivel';

    let statusBadge = '';
    if (status === 'vendido') {
      statusBadge = '<span class="panel-badge panel-badge-danger" style="position:absolute; top:12px; left:12px; z-index:2; font-weight:700;">VENDIDO</span>';
    } else if (status === 'reservado') {
      statusBadge = '<span class="panel-badge panel-badge-warning" style="position:absolute; top:12px; left:12px; z-index:2; font-weight:700;">RESERVADO</span>';
    } else if (status === 'alugado') {
      statusBadge = '<span class="panel-badge panel-badge-warning" style="position:absolute; top:12px; left:12px; z-index:2; font-weight:700;">ALUGADO</span>';
    }

    return `
      <div class="fav-card ${!isAvailable ? 'fav-card-indisponivel' : ''}" id="fav-card-${prop.id}" style="position:relative; display:flex; flex-direction:column; background:var(--glass-bg); border:1px solid ${isSelected ? 'var(--gold)' : 'var(--glass-border)'}; border-radius:14px; overflow:hidden; transition:all 0.25s ease;">
        ${statusBadge}

        <!-- Checkbox de Comparação -->
        <label style="position:absolute; top:12px; right:48px; z-index:3; background:rgba(10,46,42,0.85); backdrop-filter:blur(8px); padding:4px 8px; border-radius:6px; border:1px solid var(--glass-border); display:flex; align-items:center; gap:5px; font-size:0.75rem; color:var(--cream); cursor:pointer;">
          <input type="checkbox" class="chk-compare" data-imovel-id="${escapeHtml(prop.id)}" ${isSelected ? 'checked' : ''} style="accent-color:var(--gold); cursor:pointer;">
          <span>Comparar</span>
        </label>

        <!-- Botão Remover dos Favoritos -->
        <button type="button" class="fav-remove" data-action="remove" data-imovel-id="${escapeHtml(prop.id)}" title="Remover dos favoritos" style="position:absolute; top:12px; right:12px; z-index:3; width:30px; height:30px; border-radius:50%; background:rgba(0,0,0,0.65); border:1px solid rgba(255,255,255,0.2); color:#fff; font-size:1.1rem; cursor:pointer; display:flex; align-items:center; justify-content:center;">×</button>

        <!-- Imagem -->
        <div class="fav-image" style="height:190px; background-image:url('${encodeURI(img)}'); background-size:cover; background-position:center; position:relative;">
          ${!isAvailable ? '<div style="position:absolute; inset:0; background:rgba(0,0,0,0.45); backdrop-filter:grayscale(60%);"></div>' : ''}
        </div>

        <!-- Conteúdo do Card -->
        <div class="fav-content" style="padding:1.25rem; display:flex; flex-direction:column; flex:1;">
          <div style="font-size:0.75rem; color:var(--gold); text-transform:uppercase; letter-spacing:1px; margin-bottom:0.25rem;">
            ${escapeHtml(prop.tipo || 'Imóvel')} • ${escapeHtml(bairro)}
          </div>
          <h4 class="fav-title" style="font-family:'Playfair Display',serif; font-size:1.2rem; color:var(--cream); margin-bottom:0.4rem; line-height:1.3;">
            <a href="imovel.html?id=${encodeURIComponent(prop.id)}" style="color:inherit; text-decoration:none;">${escapeHtml(prop.titulo || 'Imóvel Exclusivo')}</a>
          </h4>
          <p class="fav-location" style="font-size:0.83rem; color:var(--text-light); margin-bottom:0.8rem;">
            📍 ${escapeHtml(bairro)}, ${escapeHtml(cidade)}
            ${area > 0 ? ` • ${area}m²` : ''}
            ${quartos > 0 ? ` • ${quartos} qtos${suites > 0 ? ` (${suites} suítes)` : ''}` : ''}
            ${vagas > 0 ? ` • ${vagas} vag.` : ''}
          </p>

          <div style="margin-top:auto; padding-top:0.75rem; border-top:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:baseline; margin-bottom:1rem;">
            <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Valor</span>
            <span style="font-size:1.2rem; font-weight:700; color:var(--gold); font-family:'Playfair Display',serif;">
              ${formatMoeda(prop.preco)}
            </span>
          </div>

          <!-- Ações por Card -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
            ${isAvailable ? `
              <a href="agendar.html?id=${encodeURIComponent(prop.id)}" class="panel-btn panel-btn-secondary panel-btn-sm" style="text-align:center; text-decoration:none;" title="Agendar Visita">
                📅 Agendar
              </a>
              <a href="imovel.html?id=${encodeURIComponent(prop.id)}#proposta" class="panel-btn panel-btn-primary panel-btn-sm" style="text-align:center; text-decoration:none;" title="Fazer Proposta">
                📝 Proposta
              </a>
            ` : `
              <a href="imovel.html?id=${encodeURIComponent(prop.id)}" class="panel-btn panel-btn-secondary panel-btn-sm" style="grid-column:1/-1; text-align:center; text-decoration:none;">
                Ver Imóvel Indisponível
              </a>
            `}
          </div>

          <!-- Link Falar com Corretor -->
          <div style="margin-top:0.6rem; text-align:center;">
            <a href="#mensagens" class="panel-link" style="font-size:0.78rem; color:var(--gold); text-decoration:underline;">
              💬 Falar com corretor sobre este imóvel
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Event Listeners dos checkboxes e botões de remover
  grid.querySelectorAll('.chk-compare').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const imovelId = e.target.getAttribute('data-imovel-id');
      if (e.target.checked) {
        if (selectedForComparison.size >= 3) {
          e.target.checked = false;
          showToast('Você pode comparar até 3 imóveis simultaneamente.', 'warning');
          return;
        }
        selectedForComparison.add(imovelId);
      } else {
        selectedForComparison.delete(imovelId);
      }
      renderFavoritosGrid();
      atualizarBarraComparacao();
    });
  });

  grid.querySelectorAll('[data-action="remove"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const imovelId = e.currentTarget.getAttribute('data-imovel-id');
      if (!imovelId) return;
      try {
        await LivingCanvasFavorites.removeFavorite(imovelId);
        allFavorites = allFavorites.filter(p => p.id !== imovelId);
        selectedForComparison.delete(imovelId);
        showToast('Imóvel removido dos favoritos.', 'info');
        renderFavoritosGrid();
        // Atualiza contadores globais
        const navFavBadge = document.getElementById('navFavBadge');
        const vgFavEl = document.getElementById('vgFavCount');
        if (navFavBadge) {
          navFavBadge.textContent = allFavorites.length;
          navFavBadge.style.display = allFavorites.length > 0 ? 'inline-block' : 'none';
        }
        if (vgFavEl) vgFavEl.textContent = allFavorites.length;
      } catch (err) {
        showToast('Erro ao remover favorito.', 'error');
      }
    });
  });

  atualizarBarraComparacao();
}

function sincronizarFiltrosUI() {
  const searchInput = document.getElementById('favFilterSearch');
  const statusSelect = document.getElementById('favFilterStatus');
  const tipoSelect = document.getElementById('favFilterTipo');
  const orderSelect = document.getElementById('favFilterOrder');

  if (searchInput) searchInput.value = currentFilter.busca;
  if (statusSelect) statusSelect.value = currentFilter.status;
  if (tipoSelect) tipoSelect.value = currentFilter.tipo;
  if (orderSelect) orderSelect.value = currentFilter.ordem;
}

function renderBarraFiltros(container) {
  let bar = document.getElementById('favFiltersBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'favFiltersBar';
    bar.style.cssText = `
      display: flex; flex-wrap: wrap; gap: 0.85rem; align-items: center;
      margin-bottom: 1.5rem; padding: 1rem 1.25rem;
      background: var(--glass-bg); border: 1px solid var(--glass-border);
      border-radius: 12px;
    `;
    container.insertBefore(bar, document.getElementById('dashboardFavoritesGrid'));
  }

  bar.innerHTML = `
    <!-- Busca por texto -->
    <div style="flex: 1 1 200px; min-width: 180px;">
      <input type="text" id="favFilterSearch" class="panel-form-input" placeholder="Buscar por título ou bairro..." value="${escapeHtml(currentFilter.busca)}" style="padding: 0.5rem 0.8rem; font-size: 0.85rem; height: 38px;">
    </div>

    <!-- Status -->
    <div style="flex: 0 1 160px;">
      <select id="favFilterStatus" class="panel-form-select" style="padding: 0.5rem 0.8rem; font-size: 0.85rem; height: 38px;">
        <option value="all" ${currentFilter.status === 'all' ? 'selected' : ''}>Todos os Status</option>
        <option value="disponivel" ${currentFilter.status === 'disponivel' ? 'selected' : ''}>Apenas Disponíveis</option>
        <option value="indisponivel" ${currentFilter.status === 'indisponivel' ? 'selected' : ''}>Vendidos / Reservados</option>
      </select>
    </div>

    <!-- Tipo de imóvel -->
    <div style="flex: 0 1 150px;">
      <select id="favFilterTipo" class="panel-form-select" style="padding: 0.5rem 0.8rem; font-size: 0.85rem; height: 38px;">
        <option value="all" ${currentFilter.tipo === 'all' ? 'selected' : ''}>Todos os Tipos</option>
        <option value="apartamento" ${currentFilter.tipo === 'apartamento' ? 'selected' : ''}>Apartamentos</option>
        <option value="casa" ${currentFilter.tipo === 'casa' ? 'selected' : ''}>Casas</option>
        <option value="cobertura" ${currentFilter.tipo === 'cobertura' ? 'selected' : ''}>Coberturas</option>
        <option value="studio" ${currentFilter.tipo === 'studio' ? 'selected' : ''}>Studios</option>
      </select>
    </div>

    <!-- Ordenação -->
    <div style="flex: 0 1 170px;">
      <select id="favFilterOrder" class="panel-form-select" style="padding: 0.5rem 0.8rem; font-size: 0.85rem; height: 38px;">
        <option value="recentes" ${currentFilter.ordem === 'recentes' ? 'selected' : ''}>Mais Recentes</option>
        <option value="menor-preco" ${currentFilter.ordem === 'menor-preco' ? 'selected' : ''}>Menor Preço</option>
        <option value="maior-preco" ${currentFilter.ordem === 'maior-preco' ? 'selected' : ''}>Maior Preço</option>
        <option value="area" ${currentFilter.ordem === 'area' ? 'selected' : ''}>Maior Área (m²)</option>
      </select>
    </div>
  `;

  // Attach handlers
  const searchInput = document.getElementById('favFilterSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilter.busca = e.target.value;
      renderFavoritosGrid();
    });
  }

  const statusSelect = document.getElementById('favFilterStatus');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      currentFilter.status = e.target.value;
      renderFavoritosGrid();
    });
  }

  const tipoSelect = document.getElementById('favFilterTipo');
  if (tipoSelect) {
    tipoSelect.addEventListener('change', (e) => {
      currentFilter.tipo = e.target.value;
      renderFavoritosGrid();
    });
  }

  const orderSelect = document.getElementById('favFilterOrder');
  if (orderSelect) {
    orderSelect.addEventListener('change', (e) => {
      currentFilter.ordem = e.target.value;
      renderFavoritosGrid();
    });
  }
}

function atualizarBarraComparacao() {
  let bar = document.getElementById('favCompareFloatingBar');
  const count = selectedForComparison.size;

  if (count === 0) {
    if (bar) bar.style.display = 'none';
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'favCompareFloatingBar';
    bar.style.cssText = `
      position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
      z-index: 9999; display: flex; align-items: center; gap: 1.25rem;
      background: rgba(10, 46, 42, 0.95); backdrop-filter: blur(16px);
      border: 1px solid var(--gold); border-radius: 50px;
      padding: 0.75rem 1.75rem; box-shadow: 0 12px 36px rgba(0,0,0,0.6);
      color: var(--cream); font-size: 0.9rem;
    `;
    document.body.appendChild(bar);
  }

  bar.style.display = 'flex';
  bar.innerHTML = `
    <span>⚖️ <strong>${count}</strong> de 3 imóveis selecionados</span>
    <button type="button" id="btnGoToComparator" class="panel-btn panel-btn-primary panel-btn-sm" style="border-radius:20px; font-weight:600;">
      Comparar Agora →
    </button>
    <button type="button" id="btnClearComparison" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:0.8rem; text-decoration:underline;">
      Limpar
    </button>
  `;

  document.getElementById('btnGoToComparator')?.addEventListener('click', () => {
    const ids = Array.from(selectedForComparison);
    if (ids.length === 0) return;
    window.location.href = `comparador.html?ids=${encodeURIComponent(ids.join(','))}`;
  });

  document.getElementById('btnClearComparison')?.addEventListener('click', () => {
    selectedForComparison.clear();
    renderFavoritosGrid();
    atualizarBarraComparacao();
  });
}

// =========================================================================
// REGISTRO DA VIEW FAVORITOS
// =========================================================================
registerView('favoritos', {
  titulo: 'Meus Favoritos',
  mount: async (section, user) => {
    const cardContainer = section.querySelector('.panel-card');
    const grid = document.getElementById('dashboardFavoritesGrid');
    if (!grid) return;

    if (cardContainer) {
      renderBarraFiltros(cardContainer);
    }

    grid.innerHTML = '<div class="panel-skeleton" style="height: 240px; grid-column: 1/-1;"></div>';

    try {
      allFavorites = await LivingCanvasFavorites.getFavoriteProperties();
      renderFavoritosGrid();
    } catch (err) {
      console.error('Erro ao carregar favoritos:', err);
      grid.innerHTML = `<div class="panel-empty-state" style="grid-column: 1/-1;"><p style="color:var(--danger)">Erro: ${escapeHtml(err.message)}</p></div>`;
    }
  },
  unmount: () => {
    const bar = document.getElementById('favCompareFloatingBar');
    if (bar) bar.style.display = 'none';
  }
});
