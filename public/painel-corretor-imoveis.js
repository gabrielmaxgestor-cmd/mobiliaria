/**
 * Living Canvas - Painel do Corretor: Módulo Meus Imóveis (P7)
 * Permite cadastrar, editar, duplicar, gerenciar mídias e status dos imóveis do corretor.
 * Consulta exclusivamente o Firestore (corretorId == uid) sem nunca exibir SAMPLE_PROPERTIES.
 */

import LivingCanvasAuth from '/auth.js';
import LivingCanvasProperties, {
  createProperty,
  updateProperty,
  uploadPropertyPhoto,
  uploadPropertyFloorPlan,
  triggerPropertyMatching
} from '/properties.js';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  getCountFromServer,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import {
  registerView,
  escapeHtml,
  formatMoeda,
  formatData,
  showToast
} from '/panel-shell.js';

const db = LivingCanvasAuth.db;

// Cache local de imóveis do corretor
let myPropertiesCache = [];
let currentEditingProperty = null;
let currentPhotosList = [];
let currentFloorPlanUrl = null;

// Filtros da listagem
const listFilters = {
  termo: '',
  status: '',
  ordem: 'recentes' // 'recentes' | 'preco_desc' | 'preco_asc'
};

// Tags de diferenciais recomendadas
const DIFERENCIAIS_OPCOES = [
  'Piscina',
  'Varanda Gourmet',
  'Vista Panorâmica',
  'Academia',
  'Mobiliado',
  'Ar-Condicionado',
  'Segurança 24h',
  'Churrasqueira',
  'Elevador Privativo',
  'Jardim',
  'Adega',
  'Quadra de Tênis',
  'Spa / Sauna',
  'Home Theater',
  'Carregador Veicular'
];

/**
 * Utilitário de redimensionamento e compressão de imagem no cliente (Canvas)
 * Redimensiona para no máximo 1600px mantendo proporção e salva como JPEG 0.85
 */
export async function comprimirImagem(file, maxDimension = 1600, quality = 0.85) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Arquivo selecionado não é uma imagem.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erro ao ler arquivo da imagem.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Não foi possível processar a imagem.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Falha ao comprimir imagem.'));
            return;
          }
          resolve(blob);
        }, 'image/jpeg', quality);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Consulta contagens reais de favoritos e leads por ID de imóvel
 */
async function obterContagensImovel(imovelId) {
  let favoritosCount = 0;
  let leadsCount = 0;

  try {
    const qFav = query(collection(db, "favoritos"), where("imovelId", "==", imovelId));
    const snapFav = await getCountFromServer(qFav);
    favoritosCount = snapFav.data().count;
  } catch (e) {
    // Fallback silencioso caso índice esteja indisponível
  }

  try {
    const qLeads = query(collection(db, "leads"), where("imovelId", "==", imovelId));
    const snapLeads = await getCountFromServer(qLeads);
    leadsCount = snapLeads.data().count;
  } catch (e) {
    // Fallback silencioso
  }

  return { favoritosCount, leadsCount };
}

/**
 * Carrega todos os imóveis criados pelo corretor autenticado
 */
async function carregarImoveisDoCorretor(corretorUid) {
  if (!corretorUid) return [];

  try {
    const q = query(
      collection(db, "imoveis"),
      where("corretorId", "==", corretorUid)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Ordenação inicial por data
    list.sort((a, b) => {
      const tA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
      const tB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
      return tB - tA;
    });

    return list;
  } catch (err) {
    console.error("Erro ao buscar imóveis do corretor:", err);
    throw err;
  }
}

/**
 * Aplica filtros em memória
 */
function filtrarEOrdenarImoveis(lista) {
  let res = lista.filter(item => {
    if (listFilters.status && item.status !== listFilters.status) {
      return false;
    }
    if (listFilters.termo) {
      const q = listFilters.termo.toLowerCase();
      const titulo = (item.titulo || '').toLowerCase();
      const bairro = (item.endereco?.bairro || '').toLowerCase();
      const cidade = (item.endereco?.cidade || '').toLowerCase();
      if (!titulo.includes(q) && !bairro.includes(q) && !cidade.includes(q)) {
        return false;
      }
    }
    return true;
  });

  if (listFilters.ordem === 'preco_desc') {
    res.sort((a, b) => (b.preco || 0) - (a.preco || 0));
  } else if (listFilters.ordem === 'preco_asc') {
    res.sort((a, b) => (a.preco || 0) - (b.preco || 0));
  } else {
    // mais recentes
    res.sort((a, b) => {
      const tA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
      const tB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
      return tB - tA;
    });
  }

  return res;
}

// ============================================================================
// REGISTRO DA VIEW: MEUS IMÓVEIS (#meus-imoveis e alias #imoveis)
// ============================================================================
registerView('meus-imoveis', {
  titulo: 'Meus Imóveis',
  mount: async (section, user) => {
    if (!section) return;

    renderEstruturaImoveis(section);
    await atualizarListaImoveis(user?.uid);
  }
});

/**
 * Renderiza o esqueleto inicial com toolbar e container de listagem
 */
function renderEstruturaImoveis(section) {
  section.innerHTML = `
    <div class="panel-card">
      <div class="panel-card-header">
        <div>
          <h3 class="panel-card-title">🏡 Meus Imóveis Atribuídos</h3>
          <p class="panel-card-subtitle">Cadastre, edite e gerencie o catálogo de alta liquidez sob sua responsabilidade</p>
        </div>
        <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" onclick="window.abrirDrawerNovoImovel()">
          + Cadastrar Novo Imóvel
        </button>
      </div>

      <!-- BARRA DE FILTROS & BUSCA -->
      <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; display: flex; flex-wrap: wrap; gap: 0.85rem; align-items: flex-end;">
        <div style="flex: 1; min-width: 200px;">
          <label class="panel-form-label" style="font-size: 0.78rem;">Buscar por Título ou Bairro</label>
          <input type="text" id="filtroImovelTermo" class="panel-form-input" style="padding: 0.5rem 0.8rem; font-size: 0.85rem;" placeholder="Ex: Casa do Bosque, Itaim Bibi..." value="${escapeHtml(listFilters.termo)}" oninput="window.handleFilterImovel('termo', this.value)">
        </div>

        <div style="min-width: 150px;">
          <label class="panel-form-label" style="font-size: 0.78rem;">Status</label>
          <select id="filtroImovelStatus" class="panel-form-select" style="padding: 0.5rem 0.8rem; font-size: 0.85rem;" onchange="window.handleFilterImovel('status', this.value)">
            <option value="">Todos os status</option>
            <option value="disponivel" ${listFilters.status === 'disponivel' ? 'selected' : ''}>Disponível</option>
            <option value="reservado" ${listFilters.status === 'reservado' ? 'selected' : ''}>Reservado</option>
            <option value="vendido" ${listFilters.status === 'vendido' ? 'selected' : ''}>Vendido</option>
            <option value="alugado" ${listFilters.status === 'alugado' ? 'selected' : ''}>Alugado</option>
            <option value="arquivado" ${listFilters.status === 'arquivado' ? 'selected' : ''}>Arquivado</option>
          </select>
        </div>

        <div style="min-width: 150px;">
          <label class="panel-form-label" style="font-size: 0.78rem;">Ordenação</label>
          <select id="filtroImovelOrdem" class="panel-form-select" style="padding: 0.5rem 0.8rem; font-size: 0.85rem;" onchange="window.handleFilterImovel('ordem', this.value)">
            <option value="recentes" ${listFilters.ordem === 'recentes' ? 'selected' : ''}>Mais Recentes</option>
            <option value="preco_desc" ${listFilters.ordem === 'preco_desc' ? 'selected' : ''}>Maior Preço</option>
            <option value="preco_asc" ${listFilters.ordem === 'preco_asc' ? 'selected' : ''}>Menor Preço</option>
          </select>
        </div>
      </div>

      <!-- CONTAINER DE LISTAGEM DE IMÓVEIS -->
      <div id="corretorImoveisContainer">
        <div class="panel-skeleton" style="height: 250px;"></div>
      </div>
    </div>
  `;
}

/**
 * Atualiza os cards/linhas dos imóveis do corretor
 */
async function atualizarListaImoveis(corretorUid) {
  const container = document.getElementById('corretorImoveisContainer');
  if (!container) return;

  try {
    myPropertiesCache = await carregarImoveisDoCorretor(corretorUid);

    // Atualiza badge na barra lateral
    const badge = document.getElementById('corretorNavImoveisBadge');
    if (badge) {
      badge.textContent = myPropertiesCache.length.toString();
      badge.style.display = myPropertiesCache.length > 0 ? 'inline-block' : 'none';
    }

    const filtrados = filtrarEOrdenarImoveis(myPropertiesCache);

    if (filtrados.length === 0) {
      container.innerHTML = `
        <div class="panel-empty-state">
          <div class="panel-empty-icon">🏡</div>
          <h4 class="panel-empty-title">Nenhum imóvel encontrado</h4>
          <p class="panel-empty-desc">${myPropertiesCache.length === 0 ? 'Você ainda não cadastrou nenhum imóvel no seu catálogo particular. Comece agora mesmo!' : 'Nenhum imóvel corresponde aos filtros aplicados.'}</p>
          <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" onclick="window.abrirDrawerNovoImovel()">
            + Cadastrar Primeiro Imóvel
          </button>
        </div>
      `;
      return;
    }

    // Renderiza grid rica com métricas reais
    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem;">
        ${filtrados.map(prop => {
          const capa = (prop.imagens && prop.imagens[0]) || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80';
          const bairro = prop.endereco?.bairro || 'Localização não informada';
          const cidade = prop.endereco?.cidade || '';
          const area = prop.caracteristicas?.areaM2 || 0;
          const status = prop.status || 'disponivel';
          const isDestaque = !!prop.destaque;
          const statusBadgeClass = status === 'disponivel' ? 'panel-badge-ganho' : (status === 'arquivado' ? 'panel-badge-perdido' : 'panel-badge-contatado');

          return `
            <div class="panel-card" style="margin-bottom:0; display:flex; flex-direction:column; padding:1.25rem;" id="prop-card-${prop.id}">
              <div style="position:relative; height:180px; border-radius:10px; overflow:hidden; background-image:url('${encodeURI(capa)}'); background-size:cover; background-position:center; margin-bottom:1rem;">
                <span class="panel-badge ${statusBadgeClass}" style="position:absolute; top:10px; left:10px; text-transform:uppercase;">
                  ${escapeHtml(status)}
                </span>
                ${isDestaque ? '<span class="panel-badge panel-badge-proposta" style="position:absolute; top:10px; right:10px;">⭐ Destaque</span>' : ''}
              </div>

              <div style="flex:1;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.25rem;">
                  <h4 style="color:var(--cream); font-family:'Playfair Display',serif; font-size:1.15rem; margin:0;">
                    ${escapeHtml(prop.titulo || 'Imóvel sem título')}
                  </h4>
                </div>
                <p style="font-size:0.8rem; color:var(--text-light); margin-bottom:0.6rem;">
                  📍 ${escapeHtml(bairro)}${cidade ? ` • ${escapeHtml(cidade)}` : ''} • ${escapeHtml(area)}m²
                </p>

                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(245,241,232,0.08); padding-top:0.75rem; margin-top:0.5rem;">
                  <span style="color:var(--gold); font-weight:700; font-size:1.1rem;">${formatMoeda(prop.preco)}</span>
                  <div style="font-size:0.75rem; color:var(--text-muted); display:flex; gap:0.6rem;" id="stats-imovel-${prop.id}">
                    <span>Carregando métricas...</span>
                  </div>
                </div>
              </div>

              <!-- AÇÕES RÁPIDAS -->
              <div style="display:flex; flex-wrap:wrap; gap:0.4rem; margin-top:1rem; border-top:1px solid rgba(245,241,232,0.08); padding-top:0.75rem;">
                <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" style="flex:1;" onclick="window.editarImovel('${prop.id}')">✏️ Editar</button>
                <a href="imovel.html?id=${encodeURIComponent(prop.id)}" target="_blank" rel="noopener noreferrer" class="panel-btn panel-btn-secondary panel-btn-sm" title="Ver ficha no site público">Ver ↗</a>
                
                <select style="background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:var(--gold); border-radius:8px; padding:0.2rem 0.5rem; font-size:0.75rem;" onchange="window.alterarStatusRapido('${prop.id}', this.value)">
                  <option value="disponivel" ${status === 'disponivel' ? 'selected' : ''}>Disponível</option>
                  <option value="reservado" ${status === 'reservado' ? 'selected' : ''}>Reservado</option>
                  <option value="vendido" ${status === 'vendido' ? 'selected' : ''}>Vendido</option>
                  <option value="alugado" ${status === 'alugado' ? 'selected' : ''}>Alugado</option>
                  <option value="arquivado" ${status === 'arquivado' ? 'selected' : ''}>Arquivar</option>
                </select>

                <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="window.duplicarImovel('${prop.id}')" title="Duplicar cadastro">📋</button>
                <button type="button" class="panel-btn panel-btn-danger panel-btn-sm" onclick="window.excluirImovelComConfirmacao('${prop.id}')" title="Excluir imóvel">🗑️</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Carrega métricas em background para cada card
    filtrados.forEach(async (prop) => {
      const el = document.getElementById(`stats-imovel-${prop.id}`);
      if (!el) return;
      const { favoritosCount, leadsCount } = await obterContagensImovel(prop.id);
      el.innerHTML = `
        <span title="Usuários que favoritaram">❤️ ${favoritosCount}</span>
        <span title="Leads gerados">💼 ${leadsCount}</span>
      `;
    });

  } catch (err) {
    container.innerHTML = `
      <div class="panel-empty-state">
        <div class="panel-empty-icon">⚠️</div>
        <h4 class="panel-empty-title">Erro ao carregar seus imóveis</h4>
        <p class="panel-empty-desc">${escapeHtml(err.message)}</p>
        <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" onclick="window.LivingCanvasPanel.navigateToView('meus-imoveis')">Tentar de novo</button>
      </div>
    `;
  }
}

// Handlers de Filtro
window.handleFilterImovel = (campo, valor) => {
  listFilters[campo] = valor;
  const user = LivingCanvasAuth.auth.currentUser;
  const filtrados = filtrarEOrdenarImoveis(myPropertiesCache);
  atualizarListaImoveis(user?.uid);
};

// ============================================================================
// AÇÕES POR IMÓVEL (STATUS, DUPLICAR, EXCLUIR)
// ============================================================================
window.alterarStatusRapido = async (imovelId, novoStatus) => {
  try {
    await updateProperty(imovelId, { status: novoStatus });
    showToast(`Status atualizado para "${novoStatus}".`, 'success');
    const user = LivingCanvasAuth.auth.currentUser;
    await atualizarListaImoveis(user?.uid);
  } catch (err) {
    showToast(`Erro ao alterar status: ${err.message}`, 'error');
  }
};

window.duplicarImovel = async (imovelId) => {
  const original = myPropertiesCache.find(p => p.id === imovelId);
  if (!original) return;

  try {
    const cloneData = {
      ...original,
      titulo: `${original.titulo || 'Imóvel'} (Cópia)`,
      status: 'disponivel'
    };
    delete cloneData.id;
    delete cloneData.criadoEm;
    delete cloneData.atualizadoEm;

    await createProperty(cloneData);
    showToast('Imóvel duplicado com sucesso!', 'success');
    const user = LivingCanvasAuth.auth.currentUser;
    await atualizarListaImoveis(user?.uid);
  } catch (err) {
    showToast(`Erro ao duplicar: ${err.message}`, 'error');
  }
};

window.excluirImovelComConfirmacao = async (imovelId) => {
  const prop = myPropertiesCache.find(p => p.id === imovelId);
  const titulo = prop?.titulo || 'este imóvel';
  const confirmou = confirm(`Tem certeza que deseja excluir permanentemente o cadastro de "${titulo}"?`);
  if (!confirmou) return;

  try {
    await deleteDoc(doc(db, "imoveis", imovelId));
    showToast('Imóvel excluído.', 'info');
    const user = LivingCanvasAuth.auth.currentUser;
    await atualizarListaImoveis(user?.uid);
  } catch (err) {
    showToast(`Erro ao excluir imóvel: ${err.message}`, 'error');
  }
};

// ============================================================================
// FORMULÁRIO EM DRAWER COM ETAPAS (CADASTRO E EDIÇÃO COMPLETA)
// ============================================================================
window.abrirDrawerNovoImovel = () => {
  currentEditingProperty = null;
  currentPhotosList = [];
  currentFloorPlanUrl = null;
  abrirDrawerComDados({});
};

window.editarImovel = (imovelId) => {
  const prop = myPropertiesCache.find(p => p.id === imovelId);
  if (!prop) return;
  currentEditingProperty = prop;
  currentPhotosList = Array.isArray(prop.imagens) ? [...prop.imagens] : [];
  currentFloorPlanUrl = prop.plantaBaixaUrl || null;
  abrirDrawerComDados(prop);
};

function abrirDrawerComDados(prop = {}) {
  let drawer = document.getElementById('propertyDrawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'propertyDrawer';
    drawer.className = 'panel-drawer panel-drawer-wide';
    document.body.appendChild(drawer);
  }

  const isEdicao = !!prop.id;
  const c = prop.caracteristicas || {};
  const end = prop.endereco || {};
  const tagsExistentes = Array.isArray(prop.diferenciais) ? prop.diferenciais : [];

  drawer.innerHTML = `
    <div class="panel-drawer-header">
      <div>
        <span class="panel-badge panel-badge-proposta" style="font-size:0.7rem;">
          ${isEdicao ? 'Edição de Imóvel' : 'Novo Cadastro'}
        </span>
        <h3 style="color:var(--cream); font-family:'Playfair Display',serif; font-size:1.35rem; margin-top:0.2rem;">
          ${isEdicao ? escapeHtml(prop.titulo || 'Editar Imóvel') : 'Cadastrar Imóvel'}
        </h3>
      </div>
      <button type="button" class="panel-modal-close" onclick="window.fecharDrawerImovel()">×</button>
    </div>

    <div class="panel-drawer-body">
      <form id="formCadastroImovel" onsubmit="window.salvarFormularioImovel(event)">
        <input type="hidden" id="propDocId" value="${escapeHtml(prop.id || '')}">

        <!-- NAVEGAÇÃO ENTRE ETAPAS -->
        <div style="display:flex; gap:0.5rem; overflow-x:auto; margin-bottom:1.5rem; padding-bottom:0.5rem; border-bottom:1px solid var(--glass-border);">
          <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm btn-etapa is-active" id="tabEtapa1" onclick="window.trocarEtapaFormulario(1)">1. Básico</button>
          <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm btn-etapa" id="tabEtapa2" onclick="window.trocarEtapaFormulario(2)">2. Localização</button>
          <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm btn-etapa" id="tabEtapa3" onclick="window.trocarEtapaFormulario(3)">3. Características</button>
          <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm btn-etapa" id="tabEtapa4" onclick="window.trocarEtapaFormulario(4)">4. Descrição</button>
          <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm btn-etapa" id="tabEtapa5" onclick="window.trocarEtapaFormulario(5)">5. Mídia</button>
        </div>

        <!-- ETAPA 1: BÁSICO -->
        <div id="secaoEtapa1" class="secao-etapa">
          <div class="panel-form-group">
            <label class="panel-form-label" for="propTitulo">Título de Destaque <span style="color:var(--gold)">*</span></label>
            <input type="text" id="propTitulo" class="panel-form-input" placeholder="Ex: Casa do Bosque, Cobertura Horizonte" required value="${escapeHtml(prop.titulo || '')}">
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
            <div class="panel-form-group">
              <label class="panel-form-label" for="propTipo">Tipo de Imóvel <span style="color:var(--gold)">*</span></label>
              <select id="propTipo" class="panel-form-select" required>
                <option value="apartamento" ${prop.tipo === 'apartamento' ? 'selected' : ''}>Apartamento</option>
                <option value="casa" ${prop.tipo === 'casa' || !prop.tipo ? 'selected' : ''}>Casa Residencial</option>
                <option value="cobertura" ${prop.tipo === 'cobertura' ? 'selected' : ''}>Cobertura</option>
                <option value="studio" ${prop.tipo === 'studio' ? 'selected' : ''}>Studio / Loft</option>
                <option value="terreno" ${prop.tipo === 'terreno' ? 'selected' : ''}>Terreno</option>
                <option value="comercial" ${prop.tipo === 'comercial' ? 'selected' : ''}>Comercial</option>
              </select>
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label" for="propFinalidade">Finalidade <span style="color:var(--gold)">*</span></label>
              <select id="propFinalidade" class="panel-form-select" required>
                <option value="venda" ${prop.finalidade !== 'aluguel' ? 'selected' : ''}>Venda</option>
                <option value="aluguel" ${prop.finalidade === 'aluguel' ? 'selected' : ''}>Locação</option>
              </select>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.75rem;">
            <div class="panel-form-group">
              <label class="panel-form-label" for="propPreco">Preço (R$) <span style="color:var(--gold)">*</span></label>
              <input type="number" id="propPreco" class="panel-form-input" placeholder="Ex: 2800000" min="0" required value="${prop.preco || ''}">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label" for="propCondominio">Condomínio (R$)</label>
              <input type="number" id="propCondominio" class="panel-form-input" placeholder="Ex: 1200" min="0" value="${prop.condominio || ''}">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label" for="propIptu">IPTU (R$)</label>
              <input type="number" id="propIptu" class="panel-form-input" placeholder="Ex: 850" min="0" value="${prop.iptu || ''}">
            </div>
          </div>

          <div style="display:flex; gap:1.5rem; align-items:center; margin-top:0.5rem; padding:0.5rem 0;">
            <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; color:var(--cream); cursor:pointer;">
              <input type="checkbox" id="propDestaque" style="accent-color:var(--gold); width:18px; height:18px;" ${prop.destaque ? 'checked' : ''}>
              Marcar como Imóvel em Destaque
            </label>
          </div>
        </div>

        <!-- ETAPA 2: LOCALIZAÇÃO -->
        <div id="secaoEtapa2" class="secao-etapa" style="display:none;">
          <div style="display:grid; grid-template-columns:1fr 2fr; gap:1rem;">
            <div class="panel-form-group">
              <label class="panel-form-label" for="propCep">CEP (opcional)</label>
              <div style="display:flex; gap:0.5rem;">
                <input type="text" id="propCep" class="panel-form-input" placeholder="00000-000" value="${escapeHtml(end.cep || '')}">
                <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="window.consultarViaCep()">Buscar</button>
              </div>
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label" for="propBairro">Bairro <span style="color:var(--gold)">*</span></label>
              <input type="text" id="propBairro" class="panel-form-input" placeholder="Ex: Jardim Europa" required value="${escapeHtml(end.bairro || '')}">
            </div>
          </div>

          <div style="display:grid; grid-template-columns:2fr 1fr; gap:1rem;">
            <div class="panel-form-group">
              <label class="panel-form-label" for="propCidade">Cidade <span style="color:var(--gold)">*</span></label>
              <input type="text" id="propCidade" class="panel-form-input" placeholder="Ex: São Paulo" required value="${escapeHtml(end.cidade || 'São Paulo')}">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label" for="propEstado">UF <span style="color:var(--gold)">*</span></label>
              <input type="text" id="propEstado" class="panel-form-input" placeholder="SP" maxlength="2" required value="${escapeHtml(end.estado || 'SP')}">
            </div>
          </div>

          <div class="panel-form-group">
            <label class="panel-form-label" for="propRua">Endereço Completo / Logradouro</label>
            <input type="text" id="propRua" class="panel-form-input" placeholder="Ex: Alameda dos Bosques, 120" value="${escapeHtml(end.rua || '')}">
          </div>
        </div>

        <!-- ETAPA 3: CARACTERÍSTICAS -->
        <div id="secaoEtapa3" class="secao-etapa" style="display:none;">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:0.75rem;">
            <div class="panel-form-group">
              <label class="panel-form-label" for="propArea">Área Útil (m²)</label>
              <input type="number" id="propArea" class="panel-form-input" placeholder="320" min="0" value="${c.areaM2 || ''}">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label" for="propTerreno">Terreno (m²)</label>
              <input type="number" id="propTerreno" class="panel-form-input" placeholder="600" min="0" value="${c.terrenoM2 || ''}">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label" for="propQuartos">Quartos</label>
              <input type="number" id="propQuartos" class="panel-form-input" placeholder="3" min="0" value="${c.quartos || ''}">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label" for="propSuites">Suítes</label>
              <input type="number" id="propSuites" class="panel-form-input" placeholder="3" min="0" value="${c.suites || ''}">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label" for="propBanheiros">Banheiros</label>
              <input type="number" id="propBanheiros" class="panel-form-input" placeholder="4" min="0" value="${c.banheiros || ''}">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label" for="propVagas">Vagas</label>
              <input type="number" id="propVagas" class="panel-form-input" placeholder="2" min="0" value="${c.vagas || ''}">
            </div>
          </div>

          <div style="margin-top:1rem;">
            <label class="panel-form-label">Diferenciais & Atributos</label>
            <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.4rem;" id="diferenciaisTagsContainer">
              ${DIFERENCIAIS_OPCOES.map(tag => {
                const checked = tagsExistentes.includes(tag);
                return `
                  <label class="panel-badge ${checked ? 'panel-badge-ganho' : 'panel-badge-novo'}" style="cursor:pointer; padding:0.35rem 0.75rem; font-size:0.75rem;">
                    <input type="checkbox" name="diferenciais" value="${escapeHtml(tag)}" ${checked ? 'checked' : ''} style="display:none;" onchange="this.parentElement.className = 'panel-badge ' + (this.checked ? 'panel-badge-ganho' : 'panel-badge-novo')">
                    ${escapeHtml(tag)}
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- ETAPA 4: DESCRIÇÃO -->
        <div id="secaoEtapa4" class="secao-etapa" style="display:none;">
          <div class="panel-form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
              <label class="panel-form-label" for="propDescricao" style="margin:0;">História & Descrição Sensorial <span style="color:var(--gold)">*</span></label>
              <span style="font-size:0.75rem; color:var(--text-muted);" id="contadorCaracteresDescricao">0 caracteres</span>
            </div>
            <textarea id="propDescricao" class="panel-form-textarea" rows="6" placeholder="Descreva os detalhes arquitetônicos, a iluminação natural, vista, acabamentos e o estilo de vida que o imóvel proporciona..." required oninput="window.atualizarContadorDescricao(this.value)">${escapeHtml(prop.descricao || '')}</textarea>
            <p style="font-size:0.75rem; color:var(--text-muted); margin-top:0.3rem;">Recomendado: entre 120 e 800 caracteres para maior engajamento dos compradores.</p>
          </div>
        </div>

        <!-- ETAPA 5: MÍDIA & FOTOS -->
        <div id="secaoEtapa5" class="secao-etapa" style="display:none;">
          
          <!-- UPLOAD DE FOTOS MÚLTIPLAS -->
          <div class="panel-form-group">
            <label class="panel-form-label">Galeria de Fotos (compressão automática até 1600px)</label>
            <input type="file" id="inputFotosImovel" accept="image/*" multiple style="display:none;" onchange="window.handleUploadMultiplasFotos(event)">
            <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="document.getElementById('inputFotosImovel').click()">
              📷 Adicionar Fotos da Galeria
            </button>
            <span style="font-size:0.75rem; color:var(--text-muted); margin-left:0.5rem;" id="uploadPhotosProgressText"></span>

            <div class="property-photos-grid" id="containerPreviewFotos">
              <!-- Fotos renderizadas dinamicamente -->
            </div>
          </div>

          <!-- PLANTA BAIXA -->
          <div class="panel-form-group" style="margin-top:1.5rem; border-top:1px solid var(--glass-border); padding-top:1.25rem;">
            <label class="panel-form-label">Planta Baixa (PDF ou Imagem - máx. 15MB)</label>
            <input type="file" id="inputPlantaBaixa" accept="image/*,application/pdf" style="display:none;" onchange="window.handleUploadPlanta(event)">
            <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="document.getElementById('inputPlantaBaixa').click()">
              📐 Selecionar Arquivo da Planta
            </button>
            <span style="font-size:0.75rem; color:var(--text-muted); margin-left:0.5rem;" id="uploadPlantaProgressText"></span>

            <div id="containerPreviewPlanta" style="margin-top:0.75rem;">
              <!-- Planta atual se houver -->
            </div>
          </div>

        </div>

        <!-- RODAPÉ DE AÇÕES DO FORMULÁRIO -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2rem; padding-top:1.25rem; border-top:1px solid var(--glass-border);">
          <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="window.fecharDrawerImovel()">Cancelar</button>
          <div style="display:flex; gap:0.6rem;">
            <button type="submit" class="panel-btn panel-btn-primary panel-btn-sm" id="btnSalvarImovel">
              <span id="btnSalvarImovelTexto">${isEdicao ? 'Salvar Alterações' : 'Concluir Cadastro'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  `;

  drawer.classList.add('open');
  renderizarGaleriaFotosDrawer();
  renderizarPlantaDrawer();
  window.atualizarContadorDescricao(prop.descricao || '');
}

window.fecharDrawerImovel = () => {
  const drawer = document.getElementById('propertyDrawer');
  if (drawer) drawer.classList.remove('open');
  currentEditingProperty = null;
  currentPhotosList = [];
  currentFloorPlanUrl = null;
};

// Alternância entre as 5 etapas do formulário
window.trocarEtapaFormulario = (etapaNum) => {
  for (let i = 1; i <= 5; i++) {
    const sec = document.getElementById(`secaoEtapa${i}`);
    const tab = document.getElementById(`tabEtapa${i}`);
    if (sec) sec.style.display = i === etapaNum ? 'block' : 'none';
    if (tab) {
      if (i === etapaNum) {
        tab.style.background = 'var(--gold)';
        tab.style.color = 'var(--emerald-deep)';
        tab.style.fontWeight = '600';
      } else {
        tab.style.background = 'var(--glass-bg)';
        tab.style.color = 'var(--cream)';
        tab.style.fontWeight = 'normal';
      }
    }
  }
};

window.atualizarContadorDescricao = (texto) => {
  const el = document.getElementById('contadorCaracteresDescricao');
  if (el) el.textContent = `${(texto || '').length} caracteres`;
};

// ============================================================================
// CONSULTA VIACEP COM FALLBACK
// ============================================================================
window.consultarViaCep = async () => {
  const cepInput = document.getElementById('propCep');
  const cleanCep = (cepInput?.value || '').replace(/\D/g, '');

  if (cleanCep.length !== 8) {
    showToast('Informe um CEP válido com 8 dígitos.', 'error');
    return;
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!res.ok) throw new Error('Não foi possível consultar o CEP.');
    const data = await res.json();
    if (data.erro) {
      showToast('CEP não encontrado. Preencha manualmente os campos.', 'info');
      return;
    }

    if (data.bairro) document.getElementById('propBairro').value = data.bairro;
    if (data.localidade) document.getElementById('propCidade').value = data.localidade;
    if (data.uf) document.getElementById('propEstado').value = data.uf;
    if (data.logradouro) document.getElementById('propRua').value = data.logradouro;

    showToast('Endereço preenchido com sucesso!', 'success');
  } catch (e) {
    showToast('Serviço de CEP temporariamente indisponível. Preencha os campos abaixo manualmente.', 'info');
  }
};

// ============================================================================
// UPLOAD DE FOTOS MÚLTIPLAS COM COMPRESSÃO E REORDENAÇÃO
// ============================================================================
window.handleUploadMultiplasFotos = async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  const tempId = currentEditingProperty?.id || `temp_${Date.now()}`;
  const progressText = document.getElementById('uploadPhotosProgressText');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Validação de tipo e tamanho
    if (!file.type.startsWith('image/')) {
      showToast(`O arquivo "${file.name}" não é uma imagem válida.`, 'error');
      continue;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast(`A foto "${file.name}" excede o limite de 15MB.`, 'error');
      continue;
    }

    try {
      if (progressText) progressText.textContent = `Comprimindo foto ${i + 1} de ${files.length}...`;
      const compressedBlob = await comprimirImagem(file, 1600, 0.85);

      if (progressText) progressText.textContent = `Enviando foto ${i + 1} de ${files.length}...`;
      const downloadUrl = await uploadPropertyPhoto(tempId, compressedBlob, file.name);
      currentPhotosList.push(downloadUrl);
    } catch (err) {
      console.error("Erro no upload de foto:", err);
      showToast(`Falha ao subir foto "${file.name}": ${err.message}`, 'error');
    }
  }

  if (progressText) progressText.textContent = '';
  e.target.value = '';
  renderizarGaleriaFotosDrawer();
};

function renderizarGaleriaFotosDrawer() {
  const container = document.getElementById('containerPreviewFotos');
  if (!container) return;

  if (currentPhotosList.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 1.5rem; text-align: center; background: rgba(0,0,0,0.2); border: 1px dashed var(--glass-border); border-radius: 8px;">
        <span style="font-size: 0.8rem; color: var(--text-muted);">Nenhuma foto adicionada ainda. Adicione pelo menos uma imagem para o anúncio.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = currentPhotosList.map((url, idx) => {
    const isCover = idx === 0;
    return `
      <div class="property-photo-card ${isCover ? 'is-cover' : ''}" style="background-image: url('${encodeURI(url)}');">
        ${isCover ? '<span class="property-photo-badge">CAPA</span>' : '<span></span>'}
        <div class="property-photo-actions">
          ${!isCover ? `<button type="button" class="property-photo-btn" onclick="window.definirFotoCapa(${idx})" title="Definir como capa">⭐</button>` : ''}
          ${idx > 0 ? `<button type="button" class="property-photo-btn" onclick="window.moverFoto(${idx}, -1)" title="Mover para esquerda">◀</button>` : ''}
          ${idx < currentPhotosList.length - 1 ? `<button type="button" class="property-photo-btn" onclick="window.moverFoto(${idx}, 1)" title="Mover para direita">▶</button>` : ''}
          <button type="button" class="property-photo-btn" style="color:#fca5a5;" onclick="window.removerFoto(${idx})" title="Remover foto">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

window.definirFotoCapa = (idx) => {
  if (idx < 0 || idx >= currentPhotosList.length) return;
  const item = currentPhotosList.splice(idx, 1)[0];
  currentPhotosList.unshift(item);
  renderizarGaleriaFotosDrawer();
};

window.moverFoto = (idx, direcao) => {
  const novoIdx = idx + direcao;
  if (novoIdx < 0 || novoIdx >= currentPhotosList.length) return;
  const item = currentPhotosList.splice(idx, 1)[0];
  currentPhotosList.splice(novoIdx, 0, item);
  renderizarGaleriaFotosDrawer();
};

window.removerFoto = (idx) => {
  currentPhotosList.splice(idx, 1);
  renderizarGaleriaFotosDrawer();
};

// ============================================================================
// UPLOAD DE PLANTA BAIXA
// ============================================================================
window.handleUploadPlanta = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 15 * 1024 * 1024) {
    showToast('A planta baixa deve ter no máximo 15MB.', 'error');
    return;
  }

  const tempId = currentEditingProperty?.id || `temp_${Date.now()}`;
  const progressText = document.getElementById('uploadPlantaProgressText');

  try {
    if (progressText) progressText.textContent = 'Enviando arquivo da planta...';
    let fileToUpload = file;
    if (file.type.startsWith('image/')) {
      fileToUpload = await comprimirImagem(file, 2000, 0.9);
    }
    currentFloorPlanUrl = await uploadPropertyFloorPlan(tempId, fileToUpload, file.name);
    if (progressText) progressText.textContent = '';
    renderizarPlantaDrawer();
    showToast('Planta baixa anexada!', 'success');
  } catch (err) {
    console.error("Erro no upload da planta:", err);
    if (progressText) progressText.textContent = '';
    showToast(`Erro ao subir planta: ${err.message}`, 'error');
  }
};

function renderizarPlantaDrawer() {
  const container = document.getElementById('containerPreviewPlanta');
  if (!container) return;

  if (!currentFloorPlanUrl) {
    container.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted);">Nenhuma planta baixa anexada.</span>`;
    return;
  }

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.25); border:1px solid var(--glass-border); padding:0.6rem 0.8rem; border-radius:8px;">
      <a href="${encodeURI(currentFloorPlanUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--gold); font-size:0.82rem; text-decoration:none;">📄 Visualizar Planta Anexada ↗</a>
      <button type="button" class="panel-btn panel-btn-danger panel-btn-sm" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="window.removerPlanta()">Remover</button>
    </div>
  `;
}

window.removerPlanta = () => {
  currentFloorPlanUrl = null;
  renderizarPlantaDrawer();
};

// ============================================================================
// PERSISTÊNCIA DO FORMULÁRIO (CREATE / UPDATE)
// ============================================================================
window.salvarFormularioImovel = async (e) => {
  e.preventDefault();

  const docId = document.getElementById('propDocId')?.value.trim();
  const titulo = document.getElementById('propTitulo')?.value.trim();
  const tipo = document.getElementById('propTipo')?.value.trim();
  const finalidade = document.getElementById('propFinalidade')?.value.trim();
  const precoVal = document.getElementById('propPreco')?.value.trim();
  const condominioVal = document.getElementById('propCondominio')?.value.trim();
  const iptuVal = document.getElementById('propIptu')?.value.trim();
  const destaque = document.getElementById('propDestaque')?.checked || false;

  const cep = document.getElementById('propCep')?.value.trim();
  const bairro = document.getElementById('propBairro')?.value.trim();
  const cidade = document.getElementById('propCidade')?.value.trim();
  const estado = document.getElementById('propEstado')?.value.trim().toUpperCase();
  const rua = document.getElementById('propRua')?.value.trim();

  const areaVal = document.getElementById('propArea')?.value.trim();
  const terrenoVal = document.getElementById('propTerreno')?.value.trim();
  const quartosVal = document.getElementById('propQuartos')?.value.trim();
  const suitesVal = document.getElementById('propSuites')?.value.trim();
  const banheirosVal = document.getElementById('propBanheiros')?.value.trim();
  const vagasVal = document.getElementById('propVagas')?.value.trim();

  const descricao = document.getElementById('propDescricao')?.value.trim();

  // Coleta checkboxes de diferenciais
  const diferenciais = [];
  document.querySelectorAll('input[name="diferenciais"]:checked').forEach(cb => {
    diferenciais.push(cb.value);
  });

  // Validações obrigatórias
  if (!titulo) {
    showToast('Informe o título do imóvel.', 'error');
    window.trocarEtapaFormulario(1);
    return;
  }
  if (!precoVal || Number(precoVal) <= 0) {
    showToast('Informe um valor de preço válido.', 'error');
    window.trocarEtapaFormulario(1);
    return;
  }
  if (!bairro || !cidade || !estado) {
    showToast('Preencha os campos obrigatórios de localização (Bairro, Cidade e UF).', 'error');
    window.trocarEtapaFormulario(2);
    return;
  }
  if (!descricao) {
    showToast('Informe a descrição do imóvel.', 'error');
    window.trocarEtapaFormulario(4);
    return;
  }

  const submitBtn = document.getElementById('btnSalvarImovel');
  const submitText = document.getElementById('btnSalvarImovelTexto');

  const payload = {
    titulo,
    tipo,
    finalidade,
    preco: Number(precoVal),
    condominio: condominioVal ? Number(condominioVal) : 0,
    iptu: iptuVal ? Number(iptuVal) : 0,
    destaque,
    status: currentEditingProperty?.status || 'disponivel',
    endereco: {
      bairro,
      cidade,
      estado,
      cep: cep || '',
      rua: rua || ''
    },
    caracteristicas: {
      areaM2: areaVal ? Number(areaVal) : 0,
      terrenoM2: terrenoVal ? Number(terrenoVal) : 0,
      quartos: quartosVal ? Number(quartosVal) : 0,
      suites: suitesVal ? Number(suitesVal) : 0,
      banheiros: banheirosVal ? Number(banheirosVal) : 0,
      vagas: vagasVal ? Number(vagasVal) : 0
    },
    diferenciais,
    descricao,
    imagens: currentPhotosList,
    plantaBaixaUrl: currentFloorPlanUrl
  };

  try {
    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.textContent = 'Salvando imóvel...';

    if (docId) {
      await updateProperty(docId, payload);
      showToast('Imóvel atualizado com sucesso!', 'success');
    } else {
      await createProperty(payload);
      showToast('Imóvel cadastrado com sucesso!', 'success');
    }

    window.fecharDrawerImovel();
    const user = LivingCanvasAuth.auth.currentUser;
    await atualizarListaImoveis(user?.uid);
  } catch (err) {
    console.error("Erro ao salvar imóvel:", err);
    showToast(`Erro ao gravar imóvel: ${err.message}`, 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.textContent = docId ? 'Salvar Alterações' : 'Concluir Cadastro';
  }
};
