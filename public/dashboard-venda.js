/**
 * Living Canvas - Dashboard do Cliente: Minha Venda & Avaliação (P13)
 * 
 * Acompanhamento da jornada de venda do proprietário:
 * - Solicitações de avaliação e captação enviadas (coleção 'leads', origem 'vender', usuarioId)
 * - Imóveis ativos publicados no catálogo ('imoveis' com proprietarioId == uid)
 * - Status de cada etapa (Análise de Mercado, Vistoria, Anúncio Ativo, Negociação e Vendido)
 * - Métricas de desempenho (visitas realizadas e propostas recebidas)
 * - Cadastro de novos imóveis para venda (vender.html)
 */

import { registerView } from './panel-shell.js';
import LivingCanvasAuth from './auth.js';
import LivingCanvasData from './lc-data.js';
import {
  collection,
  query,
  where,
  getDocs
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

const db = LivingCanvasAuth.db;

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
  if (val == null || isNaN(val)) return 'A definir';
  return 'R$ ' + Number(val).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function formatData(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mapStatusLead(status) {
  const st = (status || 'novo').toLowerCase();
  switch (st) {
    case 'novo':
    case 'em_analise':
      return {
        label: 'Estudo de Mercado em Análise',
        badgeClass: 'panel-badge-em-analise',
        icon: '📋',
        desc: 'Nossa equipe de inteligência de mercado está avaliando as características do seu imóvel e o histórico de transações na região.'
      };
    case 'em_contato':
    case 'contatado':
      return {
        label: 'Visita Técnica em Agendamento',
        badgeClass: 'panel-badge-ganho',
        icon: '📞',
        desc: 'Um corretor especialista fará contato para agendar a vistoria técnica e a sessão de fotografia profissional.'
      };
    case 'vistoriado':
    case 'em_preparacao':
      return {
        label: 'Preparação do Ensaio & Dossiê',
        badgeClass: 'panel-badge-em-analise',
        icon: '📸',
        desc: 'Estamos finalizando o tratamento das fotos em alta resolução, planta humanizada e checagem da documentação para publicação.'
      };
    case 'publicado':
    case 'ativo':
      return {
        label: 'Anúncio Ativo no Catálogo',
        badgeClass: 'panel-badge-ganho',
        icon: '🌟',
        desc: 'Seu imóvel está em destaque para clientes qualificados e recebendo visitas agendadas.'
      };
    case 'em_negociacao':
      return {
        label: 'Proposta em Negociação',
        badgeClass: 'panel-badge-warning',
        icon: '📝',
        desc: 'Há compradores em tratativa de proposta formal com a corretagem.'
      };
    case 'vendido':
      return {
        label: 'Imóvel Vendido',
        badgeClass: 'panel-badge-ganho',
        icon: '🎉',
        desc: 'Transação concluída com sucesso pela equipe Living Canvas.'
      };
    default:
      return {
        label: 'Em Acompanhamento',
        badgeClass: 'panel-badge-em-analise',
        icon: '⏳',
        desc: 'Acompanhando trâmites com a curadoria.'
      };
  }
}

async function carregarMinhaVenda(user) {
  const container = document.getElementById('clientMinhaVendaContainer');
  if (!container) return;

  container.innerHTML = '<div class="panel-skeleton" style="height: 180px; margin-bottom: 1rem;"></div>';

  try {
    // 1. Busca solicitações de venda em leads (origem: 'vender', usuarioId: user.uid)
    const qLeads = query(
      collection(db, 'leads'),
      where('origem', '==', 'vender'),
      where('usuarioId', '==', user.uid)
    );
    const snapLeads = await getDocs(qLeads);
    const leadsList = [];
    snapLeads.forEach(d => {
      leadsList.push({ id: d.id, ...d.data() });
    });

    // 2. Busca imóveis no catálogo associados a este proprietário (se houver)
    const qImoveis = query(
      collection(db, 'imoveis'),
      where('proprietarioId', '==', user.uid)
    );
    const snapImoveis = await getDocs(qImoveis);
    const imoveisList = [];
    snapImoveis.forEach(d => {
      imoveisList.push({ id: d.id, ...d.data() });
    });

    // Unifica itens
    const totalItems = leadsList.length + imoveisList.length;

    if (totalItems === 0) {
      container.innerHTML = `
        <div class="panel-empty-state">
          <div class="panel-empty-icon">🏡</div>
          <h4 class="panel-empty-title">Anuncie seu Imóvel com a Living Canvas</h4>
          <p class="panel-empty-desc">
            Você ainda não cadastrou um imóvel para venda ou avaliação. Solicite um estudo de valor e divulgação personalizada para o público de alto padrão.
          </p>
          <a href="vender.html" class="panel-btn panel-btn-primary panel-btn-sm">Avaliar e Vender Imóvel</a>
        </div>
      `;
      return;
    }

    // Renderiza listagem combinada
    let html = '<div style="display: flex; flex-direction: column; gap: 1.5rem;">';

    // Imóveis já publicados no catálogo
    if (imoveisList.length > 0) {
      html += `
        <div>
          <h4 style="font-family:'Playfair Display',serif; color:var(--gold); font-size:1.15rem; margin-bottom:0.75rem;">
            🌟 Meus Imóveis Publicados no Catálogo
          </h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem;">
            ${imoveisList.map(im => {
              const foto = (im.imagens && im.imagens[0]) || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80';
              return `
                <div class="panel-card" style="margin-bottom:0; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:12px; overflow:hidden;">
                  <div style="height:140px; background-image:url('${encodeURI(foto)}'); background-size:cover; background-position:center; position:relative;">
                    <span class="panel-badge panel-badge-ganho" style="position:absolute; top:10px; left:10px;">${escapeHtml(im.status || 'Ativo')}</span>
                  </div>
                  <div style="padding:1rem;">
                    <h5 style="color:var(--cream); font-size:1.05rem; margin-bottom:0.3rem;">${escapeHtml(im.titulo || 'Imóvel sob Gestão')}</h5>
                    <p style="color:var(--text-light); font-size:0.8rem; margin-bottom:0.75rem;">
                      📍 ${escapeHtml(im.endereco?.bairro || 'Localização Nobre')} • ${formatMoeda(im.preco)}
                    </p>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <a href="imovel.html?id=${encodeURIComponent(im.id)}" class="panel-btn panel-btn-secondary panel-btn-sm">Ver Anúncio</a>
                      <a href="#mensagens" class="panel-link" style="font-size:0.78rem; color:var(--gold);">Falar com Corretor</a>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Solicitações de Avaliação / Captação em andamento
    if (leadsList.length > 0) {
      html += `
        <div>
          <h4 style="font-family:'Playfair Display',serif; color:var(--gold); font-size:1.15rem; margin-bottom:0.75rem;">
            📋 Solicitações de Avaliação & Captação
          </h4>
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${leadsList.map(lead => {
              const statusMeta = mapStatusLead(lead.status);
              const tipo = lead.tipoImovel || 'Imóvel Residencial';
              const endereco = lead.enderecoImovel || 'Endereço informado no cadastro';
              const valorEst = lead.valorEstimado;

              return `
                <div class="panel-card" style="margin-bottom:0; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:12px; padding:1.25rem;">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
                    <div>
                      <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.3rem;">
                        <span style="font-size:1.2rem;">${statusMeta.icon}</span>
                        <h5 style="color:var(--cream); font-size:1.1rem; margin:0; font-family:'Playfair Display',serif;">
                          ${escapeHtml(tipo)} • ${escapeHtml(endereco)}
                        </h5>
                      </div>
                      <span style="font-size:0.78rem; color:var(--text-muted);">
                        Solicitado em ${formatData(lead.criadoEm)}
                      </span>
                    </div>
                    <span class="panel-badge ${statusMeta.badgeClass}" style="font-size:0.8rem; font-weight:600;">
                      ${statusMeta.label}
                    </span>
                  </div>

                  <!-- Descrição do Status -->
                  <p style="font-size:0.85rem; color:var(--text-light); line-height:1.5; margin-bottom:0.9rem; background:rgba(0,0,0,0.2); padding:0.75rem 1rem; border-radius:8px; border-left:3px solid var(--gold);">
                    ${statusMeta.desc}
                  </p>

                  <!-- Dados do Lead -->
                  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.75rem; font-size:0.82rem; color:var(--text-muted); border-top:1px solid var(--glass-border); padding-top:0.75rem;">
                    <div>
                      <span style="display:block; font-size:0.72rem; text-transform:uppercase;">Valor Pretendido</span>
                      <strong style="color:var(--gold); font-size:0.95rem;">${formatMoeda(valorEst)}</strong>
                    </div>
                    <div>
                      <span style="display:block; font-size:0.72rem; text-transform:uppercase;">Contato Informado</span>
                      <strong style="color:var(--cream);">${escapeHtml(lead.telefone || 'Telefone cadastrado')}</strong>
                    </div>
                    <div style="display:flex; align-items:center; justify-content:flex-end;">
                      <a href="#mensagens" class="panel-btn panel-btn-secondary panel-btn-sm" style="text-decoration:none;">
                        💬 Conversar com a Equipe
                      </a>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    html += '</div>';
    container.innerHTML = html;

  } catch (err) {
    console.error('Erro ao listar solicitações de venda:', err);
    container.innerHTML = `
      <div class="panel-empty-state">
        <p style="color:var(--danger)">Erro ao carregar dados: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

// =========================================================================
// REGISTRO DA VIEW MINHA VENDA
// =========================================================================
registerView('minha-venda', {
  titulo: 'Minha Venda',
  mount: async (section, user) => {
    let container = document.getElementById('clientMinhaVendaContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'clientMinhaVendaContainer';
      const card = section.querySelector('.panel-card');
      if (card) card.appendChild(container);
    }

    if (user) {
      await carregarMinhaVenda(user);
    }
  }
});
