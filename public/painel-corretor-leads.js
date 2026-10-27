/**
 * Living Canvas - Painel do Corretor: Módulo Visão Geral & CRM de Leads (P6)
 * Gerencia as views #visao-geral e #leads com dados reais do Firestore,
 * escuta em tempo real, Kanban com drag-and-drop, filtros combinados,
 * alternância para tabela, drawer lateral de detalhes, notas internas e exportação CSV.
 */

import LivingCanvasAuth from '/auth.js';
import LivingCanvasData from '/lc-data.js';
import { 
  registerView, 
  escapeHtml, 
  formatMoeda, 
  formatData, 
  showToast 
} from '/panel-shell.js';

// Constantes de Etapas do Pipeline
export const ETAPAS = [
  { id: 'novo', rotulo: 'Novos', emoji: '🆕', badgeClass: 'panel-badge-novo' },
  { id: 'contatado', rotulo: 'Contatados', emoji: '📞', badgeClass: 'panel-badge-contatado' },
  { id: 'visita', rotulo: 'Visitas', emoji: '📅', badgeClass: 'panel-badge-solicitada' },
  { id: 'proposta', rotulo: 'Em Proposta', emoji: '📝', badgeClass: 'panel-badge-proposta' },
  { id: 'ganho', rotulo: 'Ganhos / Fechados', emoji: '🎉', badgeClass: 'panel-badge-ganho' },
  { id: 'perdido', rotulo: 'Perdidos', emoji: '❌', badgeClass: 'panel-badge-perdido' }
];

// Estado global em memória do módulo
let leadsCache = [];
let leadsUnsubscribe = null;
let currentLeadInDrawer = null;
let currentViewMode = 'kanban'; // 'kanban' | 'tabela'

// Filtros ativos
const activeFilters = {
  termoBusca: '',
  origem: '',
  etapa: '',
  periodo: 'todos', // 'todos' | 'hoje' | '7dias' | '30dias'
  atribuidoAMim: false
};

/**
 * Utilitário de Data para Comparações
 */
function toJsDate(val) {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (val.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Normaliza etapa do lead para uma das 6 permitidas
 */
export function normalizarEtapa(lead) {
  const e = (lead.etapa || '').toLowerCase();
  if (e === 'novo') return 'novo';
  if (e === 'contatado' || e === 'qualificado') return 'contatado';
  if (e === 'visita' || e === 'visita_agendada' || e === 'agendada') return 'visita';
  if (e === 'proposta' || e === 'em_negociacao') return 'proposta';
  if (e === 'ganho' || e === 'fechado' || lead.status === 'concluido' && !lead.motivoPerda) return 'ganho';
  if (e === 'perdido' || lead.motivoPerda) return 'perdido';

  // Fallback baseado no status legado
  if (lead.status === 'novo') return 'novo';
  if (lead.status === 'em_atendimento') return 'contatado';
  return 'novo';
}

/**
 * Aplica os filtros em memória sobre a lista de leads
 */
function filtrarLeads(lista, corretorUid) {
  const agora = new Date();

  return lista.filter(lead => {
    // Busca textual (nome, e-mail, telefone)
    if (activeFilters.termoBusca) {
      const q = activeFilters.termoBusca.toLowerCase();
      const nome = (lead.nome || '').toLowerCase();
      const email = (lead.email || '').toLowerCase();
      const tel = (lead.telefone || '').replace(/\D/g, '');
      const termoLimpo = activeFilters.termoBusca.replace(/\D/g, '');
      const matchTexto = nome.includes(q) || email.includes(q) || (termoLimpo && tel.includes(termoLimpo));
      if (!matchTexto) return false;
    }

    // Origem (contato / vender / agendar)
    if (activeFilters.origem && lead.origem !== activeFilters.origem) {
      return false;
    }

    // Etapa
    const etapaLead = normalizarEtapa(lead);
    if (activeFilters.etapa && etapaLead !== activeFilters.etapa) {
      return false;
    }

    // Atribuído a mim
    if (activeFilters.atribuidoAMim && corretorUid) {
      if (lead.corretorId !== corretorUid) return false;
    }

    // Período
    if (activeFilters.periodo !== 'todos') {
      const dataLead = toJsDate(lead.criadoEm);
      if (!dataLead) return false;
      const diffHoras = (agora - dataLead) / (1000 * 60 * 60);

      if (activeFilters.periodo === 'hoje' && diffHoras > 24) return false;
      if (activeFilters.periodo === '7dias' && diffHoras > (24 * 7)) return false;
      if (activeFilters.periodo === '30dias' && diffHoras > (24 * 30)) return false;
    }

    return true;
  });
}

// ============================================================================
// 1. REGISTRO DA VIEW: VISÃO GERAL (#visao-geral)
// ============================================================================
registerView('visao-geral', {
  titulo: 'Visão Geral do Corretor',
  mount: async (section, user) => {
    if (!section) return;

    // Renderiza Skeleton inicial
    section.innerHTML = `
      <div class="panel-skeleton" style="height: 140px; margin-bottom: 2rem;"></div>
      <div class="panel-skeleton" style="height: 280px; margin-bottom: 2rem;"></div>
    `;

    try {
      const corretorUid = user?.uid;
      const agora = new Date();

      // Carrega dados agregados do sistema em paralelo
      const [leadsRes, visitasRes, propostasRes, conversasRes, imoveisRes, atividadesRes] = await Promise.allSettled([
        LivingCanvasData.Leads.listar({ limite: 150 }),
        LivingCanvasData.Visitas.listarDoCorretor ? LivingCanvasData.Visitas.listarDoCorretor(corretorUid) : Promise.resolve([]),
        LivingCanvasData.Propostas.listarDoCorretor ? LivingCanvasData.Propostas.listarDoCorretor(corretorUid) : Promise.resolve([]),
        LivingCanvasData.Conversas.listarDoCorretor ? LivingCanvasData.Conversas.listarDoCorretor(corretorUid) : Promise.resolve([]),
        LivingCanvasData.Contadores.obterTotalCatalogo ? LivingCanvasData.Contadores.obterTotalCatalogo() : Promise.resolve(0),
        LivingCanvasData.Atividades.listarRecentes ? LivingCanvasData.Atividades.listarRecentes(10) : Promise.resolve([])
      ]);

      const leads = leadsRes.status === 'fulfilled' ? leadsRes.value : [];
      const visitas = visitasRes.status === 'fulfilled' ? visitasRes.value : [];
      const propostas = propostasRes.status === 'fulfilled' ? propostasRes.value : [];
      const conversas = conversasRes.status === 'fulfilled' ? conversasRes.value : [];
      const totalImoveis = imoveisRes.status === 'fulfilled' ? imoveisRes.value : 0;
      const atividades = atividadesRes.status === 'fulfilled' ? atividadesRes.value : [];

      // Cálculos dos KPIs
      const leadsHoje = leads.filter(l => {
        const d = toJsDate(l.criadoEm);
        return d && (agora - d) <= (24 * 60 * 60 * 1000);
      }).length;

      const leadsSemana = leads.filter(l => {
        const d = toJsDate(l.criadoEm);
        return d && (agora - d) <= (7 * 24 * 60 * 60 * 1000);
      }).length;

      const leadsSemContato24h = leads.filter(l => {
        const etapa = normalizarEtapa(l);
        if (etapa !== 'novo') return false;
        const d = toJsDate(l.criadoEm);
        return d && (agora - d) > (24 * 60 * 60 * 1000);
      });

      // Visitas hoje e próximos 7 dias
      const hojeStr = agora.toISOString().split('T')[0];
      const daqui7Dias = new Date();
      daqui7Dias.setDate(agora.getDate() + 7);
      const daqui7DiasStr = daqui7Dias.toISOString().split('T')[0];

      const visitasHoje = visitas.filter(v => v.data === hojeStr);
      const visitas7Dias = visitas.filter(v => v.data >= hojeStr && v.data <= daqui7DiasStr);

      // Propostas abertas
      const propostasAbertas = propostas.filter(p => ['enviada', 'em_analise', 'contraproposta'].includes(p.status));

      // Mensagens não lidas
      const msgsNaoLidas = conversas.reduce((acc, c) => acc + (c.naoLidasCorretor || 0), 0);

      // Contagem do funil por etapa
      const contagemFunil = {
        novo: leads.filter(l => normalizarEtapa(l) === 'novo').length,
        contatado: leads.filter(l => normalizarEtapa(l) === 'contatado').length,
        visita: leads.filter(l => normalizarEtapa(l) === 'visita').length,
        proposta: leads.filter(l => normalizarEtapa(l) === 'proposta').length,
        ganho: leads.filter(l => normalizarEtapa(l) === 'ganho').length,
        perdido: leads.filter(l => normalizarEtapa(l) === 'perdido').length
      };
      const totalFunil = leads.length || 1;

      // Renderiza Interface Completa da Visão Geral
      section.innerHTML = `
        <!-- GRID DE KPIS SUPERIORES -->
        <div class="panel-grid-stats">
          <a href="#leads" class="panel-stat-card" style="text-decoration:none;">
            <div class="panel-stat-header">
              <span class="panel-stat-icon">🆕</span>
              <span class="panel-stat-trend">+${leadsHoje} hoje</span>
            </div>
            <div class="panel-stat-value">${leadsSemana}</div>
            <div class="panel-stat-label">Leads Novos na Semana</div>
          </a>

          <a href="#leads" class="panel-stat-card" style="text-decoration:none; ${leadsSemContato24h.length > 0 ? 'border-color: rgba(239, 68, 68, 0.4);' : ''}">
            <div class="panel-stat-header">
              <span class="panel-stat-icon">⚠️</span>
              <span class="panel-stat-trend" style="${leadsSemContato24h.length > 0 ? 'color: var(--danger); background: rgba(239,68,68,0.15);' : ''}">Atenção</span>
            </div>
            <div class="panel-stat-value" style="${leadsSemContato24h.length > 0 ? 'color: #fca5a5;' : ''}">${leadsSemContato24h.length}</div>
            <div class="panel-stat-label">Leads Sem Contato (+24h)</div>
          </a>

          <a href="#visitas" class="panel-stat-card" style="text-decoration:none;">
            <div class="panel-stat-header">
              <span class="panel-stat-icon">📅</span>
              <span class="panel-stat-trend">${visitasHoje.length} para hoje</span>
            </div>
            <div class="panel-stat-value">${visitas7Dias.length}</div>
            <div class="panel-stat-label">Visitas nos Próximos 7 Dias</div>
          </a>

          <a href="#propostas" class="panel-stat-card" style="text-decoration:none;">
            <div class="panel-stat-header">
              <span class="panel-stat-icon">📝</span>
              <span class="panel-stat-trend">Em aberto</span>
            </div>
            <div class="panel-stat-value">${propostasAbertas.length}</div>
            <div class="panel-stat-label">Propostas em Análise</div>
          </a>

          <a href="#mensagens" class="panel-stat-card" style="text-decoration:none;">
            <div class="panel-stat-header">
              <span class="panel-stat-icon">💬</span>
              <span class="panel-stat-trend">Chat direto</span>
            </div>
            <div class="panel-stat-value">${msgsNaoLidas}</div>
            <div class="panel-stat-label">Mensagens Não Lidas</div>
          </a>

          <a href="#meus-imoveis" class="panel-stat-card" style="text-decoration:none;">
            <div class="panel-stat-header">
              <span class="panel-stat-icon">🏡</span>
              <span class="panel-stat-trend">Catálogo</span>
            </div>
            <div class="panel-stat-value">${totalImoveis}</div>
            <div class="panel-stat-label">Imóveis Ativos</div>
          </a>
        </div>

        <!-- BLOCO "HOJE" (PRIORIDADES IMEDIATAS) -->
        <div class="panel-card" style="border-left: 4px solid var(--gold);">
          <div class="panel-card-header">
            <div>
              <h3 class="panel-card-title">⚡ Prioridades de Hoje</h3>
              <p class="panel-card-subtitle">Ações recomendadas e atendimentos urgentes para o seu dia</p>
            </div>
            <span class="panel-badge panel-badge-proposta">${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(agora)}</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
            <!-- Follow-ups vencidos -->
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1.25rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                <strong style="color: #fca5a5; font-size: 0.9rem;">⚠️ Follow-up Pendente</strong>
                <span class="panel-badge panel-badge-perdido">${leadsSemContato24h.length}</span>
              </div>
              ${leadsSemContato24h.length === 0 ? `
                <p style="color: var(--text-light); font-size: 0.85rem;">Nenhum lead com contato atrasado. Excelente!</p>
              ` : `
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                  ${leadsSemContato24h.slice(0, 3).map(l => `
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.4rem;">
                      <div>
                        <strong>${escapeHtml(l.nome)}</strong>
                        <div style="color: var(--text-muted); font-size: 0.75rem;">Origem: ${escapeHtml(l.origem || 'site')}</div>
                      </div>
                      <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="window.abrirDetalhesLead('${l.id}')">Atender</button>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- Visitas do Dia -->
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1.25rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                <strong style="color: var(--gold); font-size: 0.9rem;">📅 Visitas Agendadas Hoje</strong>
                <span class="panel-badge panel-badge-solicitada">${visitasHoje.length}</span>
              </div>
              ${visitasHoje.length === 0 ? `
                <p style="color: var(--text-light); font-size: 0.85rem;">Nenhuma visita presencial programada para hoje.</p>
              ` : `
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                  ${visitasHoje.map(v => `
                    <div style="font-size: 0.82rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.4rem;">
                      <strong>${escapeHtml(v.clienteNome || 'Cliente')}</strong> — 🕐 ${escapeHtml(v.horario || '—')}
                      <div style="color: var(--gold); font-size: 0.75rem;">${escapeHtml(v.imovelTitulo || 'Imóvel')}</div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- Propostas aguardando resposta -->
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1.25rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                <strong style="color: #93c5fd; font-size: 0.9rem;">📝 Propostas em Negociação</strong>
                <span class="panel-badge panel-badge-novo">${propostasAbertas.length}</span>
              </div>
              ${propostasAbertas.length === 0 ? `
                <p style="color: var(--text-light); font-size: 0.85rem;">Nenhuma proposta formal aguardando decisão no momento.</p>
              ` : `
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                  ${propostasAbertas.slice(0, 3).map(p => `
                    <div style="font-size: 0.82rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.4rem;">
                      <div style="color: var(--gold); font-weight:600;">${formatMoeda(p.valor)}</div>
                      <div style="color: var(--text-muted); font-size: 0.75rem;">Status: ${escapeHtml(p.status)}</div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        </div>

        <!-- FUNIL DE VENDAS & FEED DE ATIVIDADE -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
          
          <!-- FUNIL POR ETAPA (BARRAS CSS) -->
          <div class="panel-card" style="margin-bottom:0;">
            <div class="panel-card-header">
              <div>
                <h3 class="panel-card-title">📊 Funil de Captação & Vendas</h3>
                <p class="panel-card-subtitle">Volume de leads em cada estágio de negociação</p>
              </div>
              <a href="#leads" class="panel-btn panel-btn-secondary panel-btn-sm">Abrir CRM →</a>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.85rem; padding: 0.5rem 0;">
              ${ETAPAS.map(et => {
                const count = contagemFunil[et.id] || 0;
                const percent = Math.min(100, Math.round((count / totalFunil) * 100));
                return `
                  <div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.3rem;">
                      <span style="display: flex; align-items: center; gap: 0.4rem;">
                        <span>${et.emoji}</span>
                        <strong>${et.rotulo}</strong>
                      </span>
                      <span style="color: var(--gold); font-weight: 600;">${count} (${percent}%)</span>
                    </div>
                    <div style="background: rgba(245,241,232,0.08); border-radius: 8px; height: 10px; overflow: hidden;">
                      <div style="width: ${percent}%; height: 100%; background: ${et.id === 'ganho' ? 'var(--success)' : (et.id === 'perdido' ? 'var(--danger)' : 'var(--gold)')}; border-radius: 8px; transition: width 0.4s ease;"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- FEED DE ATIVIDADE RECENTE -->
          <div class="panel-card" style="margin-bottom:0;">
            <div class="panel-card-header">
              <div>
                <h3 class="panel-card-title">⏱️ Atividade Recente</h3>
                <p class="panel-card-subtitle">Histórico de ações no site e no CRM</p>
              </div>
            </div>

            <div style="max-height: 320px; overflow-y: auto;">
              ${atividades.length === 0 ? `
                <div class="panel-empty-state" style="padding: 2rem 1rem;">
                  <p style="font-size: 0.85rem; color: var(--text-light); margin:0;">Nenhum registro de atividade recente.</p>
                </div>
              ` : `
                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                  ${atividades.map(a => `
                    <div style="display: flex; gap: 0.8rem; font-size: 0.82rem; padding: 0.6rem 0.8rem; background: var(--glass-bg); border-radius: 10px;">
                      <span style="font-size: 1.1rem;">📌</span>
                      <div style="flex:1;">
                        <div style="font-weight: 600; color: var(--cream);">${escapeHtml(a.titulo || 'Atividade')}</div>
                        <div style="color: var(--text-light); font-size: 0.75rem;">${escapeHtml(a.descricao || '')}</div>
                        <span style="color: var(--gold); font-size: 0.7rem;">${formatData(a.criadoEm, true)}</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>

        </div>
      `;
    } catch (err) {
      console.error('Erro ao renderizar visão geral do corretor:', err);
      section.innerHTML = `
        <div class="panel-empty-state">
          <div class="panel-empty-icon">⚠️</div>
          <h4 class="panel-empty-title">Não foi possível carregar a Visão Geral</h4>
          <p class="panel-empty-desc">${escapeHtml(err.message)}</p>
          <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" onclick="window.LivingCanvasPanel.navigateToView('visao-geral')">Tentar de novo</button>
        </div>
      `;
    }
  }
});

// ============================================================================
// 2. REGISTRO DA VIEW: LEADS & CRM (#leads)
// ============================================================================
registerView('leads', {
  titulo: 'Leads & CRM',
  mount: (section, user) => {
    if (!section) return;

    // Renderiza a estrutura da barra de ferramentas e containers
    renderLeadsStructure(section);

    // Inicia assinatura em tempo real via onSnapshot
    leadsUnsubscribe = LivingCanvasData.Leads.listar({}, (items) => {
      leadsCache = items || [];
      renderLeadsViewContent(user?.uid);
    });

    // Retorna função de desmontagem (unmount) para cancelar o listener
    return () => {
      if (leadsUnsubscribe) {
        leadsUnsubscribe();
        leadsUnsubscribe = null;
      }
      fecharDrawerDetalhes();
    };
  }
});

/**
 * Renderiza o esqueleto de ferramentas, controles e contêineres da tela de leads
 */
function renderLeadsStructure(section) {
  section.innerHTML = `
    <div class="panel-card">
      <div class="panel-card-header">
        <div>
          <h3 class="panel-card-title">💼 Gestão de Leads (CRM)</h3>
          <p class="panel-card-subtitle">Acompanhamento e funil de conversão de contatos recebidos</p>
        </div>

        <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
          <!-- Alternância Kanban / Tabela -->
          <div style="display: inline-flex; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 8px; padding: 2px;">
            <button type="button" id="btnViewKanban" class="panel-btn panel-btn-sm" style="background: var(--gold); color: var(--emerald-deep); border-radius: 6px; font-weight:600;" onclick="window.setLeadsViewMode('kanban')">
              📊 Kanban
            </button>
            <button type="button" id="btnViewTabela" class="panel-btn panel-btn-sm" style="background: transparent; color: var(--cream); border-radius: 6px;" onclick="window.setLeadsViewMode('tabela')">
              📋 Tabela
            </button>
          </div>

          <!-- Exportar CSV -->
          <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="window.exportarLeadsCSV()" title="Baixar planilha dos leads filtrados">
            📥 Exportar CSV
          </button>
        </div>
      </div>

      <!-- BARRA DE FILTROS COMBINADOS -->
      <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; display: flex; flex-wrap: wrap; gap: 0.85rem; align-items: flex-end;">
        
        <!-- Busca por texto -->
        <div style="flex: 1; min-width: 220px;">
          <label class="panel-form-label" style="font-size: 0.78rem;">Buscar Contato</label>
          <input type="text" id="filtroTexto" class="panel-form-input" style="padding: 0.5rem 0.8rem; font-size: 0.85rem;" placeholder="Nome, e-mail ou telefone..." value="${escapeHtml(activeFilters.termoBusca)}" oninput="window.handleFilterChange('termoBusca', this.value)">
        </div>

        <!-- Origem -->
        <div style="min-width: 140px;">
          <label class="panel-form-label" style="font-size: 0.78rem;">Origem</label>
          <select id="filtroOrigem" class="panel-form-select" style="padding: 0.5rem 0.8rem; font-size: 0.85rem;" onchange="window.handleFilterChange('origem', this.value)">
            <option value="">Todas</option>
            <option value="contato" ${activeFilters.origem === 'contato' ? 'selected' : ''}>Contato</option>
            <option value="agendar" ${activeFilters.origem === 'agendar' ? 'selected' : ''}>Agendamento</option>
            <option value="vender" ${activeFilters.origem === 'vender' ? 'selected' : ''}>Venda / Avaliação</option>
          </select>
        </div>

        <!-- Etapa -->
        <div style="min-width: 140px;">
          <label class="panel-form-label" style="font-size: 0.78rem;">Etapa</label>
          <select id="filtroEtapa" class="panel-form-select" style="padding: 0.5rem 0.8rem; font-size: 0.85rem;" onchange="window.handleFilterChange('etapa', this.value)">
            <option value="">Todas</option>
            ${ETAPAS.map(e => `<option value="${e.id}" ${activeFilters.etapa === e.id ? 'selected' : ''}>${e.rotulo}</option>`).join('')}
          </select>
        </div>

        <!-- Período -->
        <div style="min-width: 130px;">
          <label class="panel-form-label" style="font-size: 0.78rem;">Período</label>
          <select id="filtroPeriodo" class="panel-form-select" style="padding: 0.5rem 0.8rem; font-size: 0.85rem;" onchange="window.handleFilterChange('periodo', this.value)">
            <option value="todos" ${activeFilters.periodo === 'todos' ? 'selected' : ''}>Todo o histórico</option>
            <option value="hoje" ${activeFilters.periodo === 'hoje' ? 'selected' : ''}>Últimas 24h</option>
            <option value="7dias" ${activeFilters.periodo === '7dias' ? 'selected' : ''}>Últimos 7 dias</option>
            <option value="30dias" ${activeFilters.periodo === '30dias' ? 'selected' : ''}>Últimos 30 dias</option>
          </select>
        </div>

        <!-- Atribuído a mim -->
        <div style="display: flex; align-items: center; gap: 0.4rem; padding-bottom: 0.5rem;">
          <input type="checkbox" id="filtroAtribuidoAMim" style="accent-color: var(--gold); width: 16px; height: 16px; cursor: pointer;" ${activeFilters.atribuidoAMim ? 'checked' : ''} onchange="window.handleFilterChange('atribuidoAMim', this.checked)">
          <label for="filtroAtribuidoAMim" style="font-size: 0.82rem; color: var(--cream); cursor: pointer;">Meus Leads</label>
        </div>

        <!-- Limpar Filtros -->
        <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" style="margin-left: auto;" onclick="window.limparFiltrosLeads()">Limpar</button>
      </div>

      <!-- CONTÊINER PRINCIPAL (KANBAN OU TABELA) -->
      <div id="leadsMainContainer">
        <div class="panel-skeleton" style="height: 380px;"></div>
      </div>
    </div>
  `;
}

/**
 * Renderiza o conteúdo (Kanban ou Tabela) conforme o modo ativo
 */
function renderLeadsViewContent(corretorUid) {
  const container = document.getElementById('leadsMainContainer');
  if (!container) return;

  const leadsFiltrados = filtrarLeads(leadsCache, corretorUid);

  if (currentViewMode === 'kanban') {
    renderKanbanBoard(container, leadsFiltrados);
  } else {
    renderTabelaLeads(container, leadsFiltrados);
  }
}

/**
 * Renderiza o Quadro Kanban com as 6 colunas e Drag-and-Drop
 */
function renderKanbanBoard(container, leads) {
  container.innerHTML = `
    <div class="lead-kanban-board" style="display: grid; grid-template-columns: repeat(6, minmax(260px, 1fr)); gap: 1rem; overflow-x: auto; padding-bottom: 1rem;">
      ${ETAPAS.map(et => `
        <div class="lead-column" data-etapa-id="${et.id}" ondragover="window.handleKanbanDragOver(event)" ondragleave="window.handleKanbanDragLeave(event)" ondrop="window.handleKanbanDrop(event, '${et.id}')" style="background: rgba(10, 46, 42, 0.45); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1rem; min-height: 520px; display: flex; flex-direction: column;">
          
          <div class="lead-column-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--glass-border);">
            <span class="lead-column-title" style="font-size: 0.9rem; font-weight: 600; color: var(--cream); display: flex; align-items: center; gap: 0.4rem;">
              <span>${et.emoji}</span>
              <span>${et.rotulo}</span>
            </span>
            <span class="lead-column-count" id="count-etapa-${et.id}" style="background: var(--glass-bg); padding: 0.15rem 0.5rem; border-radius: 50px; font-size: 0.72rem; color: var(--gold); font-weight: 700;">0</span>
          </div>

          <div class="lead-column-cards" id="cards-etapa-${et.id}" style="display: flex; flex-direction: column; gap: 0.75rem; flex: 1;">
            <!-- Cards injetados aqui -->
          </div>

        </div>
      `).join('')}
    </div>
  `;

  // Contadores por coluna
  const contadores = {};
  ETAPAS.forEach(e => { contadores[e.id] = 0; });

  leads.forEach(lead => {
    const etapa = normalizarEtapa(lead);
    const colCards = document.getElementById(`cards-etapa-${etapa}`);
    if (!colCards) return;

    contadores[etapa] = (contadores[etapa] || 0) + 1;

    const card = document.createElement('div');
    card.className = 'lead-card-item';
    card.id = `lead-card-${lead.id}`;
    card.draggable = true;
    card.ondragstart = (e) => window.handleKanbanDragStart(e, lead.id, etapa);

    const cleanPhone = (lead.telefone || '').replace(/\D/g, '');
    const whatsAppLink = cleanPhone ? `https://wa.me/55${cleanPhone}` : null;
    const prioridade = lead.prioridade || 'morno';
    const prioridadeBadge = prioridade === 'quente' ? '🔥 Quente' : (prioridade === 'frio' ? '❄️ Frio' : '⚡ Morno');

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem;">
        <strong style="color: var(--cream); font-size: 0.92rem;">${escapeHtml(lead.nome || 'Lead')}</strong>
        <span class="panel-badge ${prioridade === 'quente' ? 'panel-badge-ganho' : 'panel-badge-novo'}" style="font-size: 0.65rem; padding: 0.1rem 0.45rem;">
          ${prioridadeBadge}
        </span>
      </div>

      <div style="font-size: 0.78rem; color: var(--text-light); margin-bottom: 0.5rem; line-height: 1.4;">
        <span style="color: var(--gold);">🏷️ ${escapeHtml(lead.origem || 'site')}</span>
        ${lead.assunto ? ` • <span>${escapeHtml(lead.assunto)}</span>` : ''}
      </div>

      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.65rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
        ${escapeHtml(lead.mensagem || 'Sem mensagem adicional.')}
      </p>

      <!-- Ações e seletor mobile -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(245,241,232,0.08); padding-top: 0.5rem; font-size: 0.75rem;">
        <span style="color: var(--text-muted);">${formatData(lead.criadoEm)}</span>

        <div style="display: flex; gap: 0.35rem; align-items: center;">
          ${whatsAppLink ? `
            <a href="${whatsAppLink}" target="_blank" rel="noopener noreferrer" class="panel-btn panel-btn-primary panel-btn-sm" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;" title="Abrir WhatsApp">💬</a>
          ` : ''}
          <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;" onclick="window.abrirDetalhesLead('${lead.id}')">Ver</button>

          <!-- Select para Acessibilidade e Mobile -->
          <select style="background: rgba(0,0,0,0.3); border: 1px solid var(--glass-border); color: var(--gold); border-radius: 6px; padding: 0.15rem 0.3rem; font-size: 0.7rem;" onchange="window.moverEtapaLeadComValidacao('${lead.id}', this.value, '${etapa}')" title="Mudar etapa">
            ${ETAPAS.map(op => `<option value="${op.id}" ${op.id === etapa ? 'selected' : ''}>${op.rotulo}</option>`).join('')}
          </select>
        </div>
      </div>
    `;

    colCards.appendChild(card);
  });

  // Atualiza crachás numéricos
  ETAPAS.forEach(e => {
    const el = document.getElementById(`count-etapa-${e.id}`);
    if (el) el.textContent = contadores[e.id] || 0;
  });
}

/**
 * Renderiza a Lista em Tabela
 */
function renderTabelaLeads(container, leads) {
  if (leads.length === 0) {
    container.innerHTML = `
      <div class="panel-empty-state">
        <div class="panel-empty-icon">💼</div>
        <h4 class="panel-empty-title">Nenhum lead encontrado</h4>
        <p class="panel-empty-desc">Nenhum contato corresponde aos filtros selecionados.</p>
        <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="window.limparFiltrosLeads()">Limpar Filtros</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="panel-table-responsive">
      <table class="panel-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Origem</th>
            <th>Contato</th>
            <th>Etapa</th>
            <th>Prioridade</th>
            <th>Data</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${leads.map(lead => {
            const etapa = normalizarEtapa(lead);
            const prioridade = lead.prioridade || 'morno';
            const cleanPhone = (lead.telefone || '').replace(/\D/g, '');
            const whatsAppLink = cleanPhone ? `https://wa.me/55${cleanPhone}` : null;

            return `
              <tr>
                <td><strong>${escapeHtml(lead.nome || 'Lead')}</strong></td>
                <td><span class="panel-badge panel-badge-proposta">${escapeHtml(lead.origem || 'site')}</span></td>
                <td>
                  <div>${escapeHtml(lead.telefone || '—')}</div>
                  <small style="color: var(--text-muted);">${escapeHtml(lead.email || '')}</small>
                </td>
                <td>
                  <select style="background: rgba(0,0,0,0.3); border: 1px solid var(--glass-border); color: var(--gold); border-radius: 6px; padding: 0.2rem 0.4rem; font-size: 0.75rem;" onchange="window.moverEtapaLeadComValidacao('${lead.id}', this.value, '${etapa}')">
                    ${ETAPAS.map(op => `<option value="${op.id}" ${op.id === etapa ? 'selected' : ''}>${op.rotulo}</option>`).join('')}
                  </select>
                </td>
                <td>
                  <span class="panel-badge ${prioridade === 'quente' ? 'panel-badge-ganho' : 'panel-badge-novo'}">
                    ${escapeHtml(prioridade)}
                  </span>
                </td>
                <td>${formatData(lead.criadoEm)}</td>
                <td>
                  <div style="display: flex; gap: 0.4rem;">
                    ${whatsAppLink ? `<a href="${whatsAppLink}" target="_blank" rel="noopener noreferrer" class="panel-btn panel-btn-primary panel-btn-sm">WhatsApp</a>` : ''}
                    <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="window.abrirDetalhesLead('${lead.id}')">Detalhes</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================================================
// 3. DRAG AND DROP KANBAN (DESKTOP)
// ============================================================================
window.handleKanbanDragStart = (e, leadId, etapaOrigem) => {
  e.dataTransfer.setData('text/plain', JSON.stringify({ leadId, etapaOrigem }));
  e.dataTransfer.effectAllowed = 'move';
};

window.handleKanbanDragOver = (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const col = e.currentTarget;
  col.style.background = 'rgba(212, 175, 122, 0.15)';
};

window.handleKanbanDragLeave = (e) => {
  const col = e.currentTarget;
  col.style.background = 'rgba(10, 46, 42, 0.45)';
};

window.handleKanbanDrop = (e, etapaDestino) => {
  e.preventDefault();
  const col = e.currentTarget;
  col.style.background = 'rgba(10, 46, 42, 0.45)';

  try {
    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;
    const { leadId, etapaOrigem } = JSON.parse(rawData);
    if (!leadId || etapaOrigem === etapaDestino) return;

    window.moverEtapaLeadComValidacao(leadId, etapaDestino, etapaOrigem);
  } catch (err) {
    console.warn('Erro no drop do kanban:', err);
  }
};

/**
 * Move a etapa validando se for 'perdido' (exige modal de motivo)
 */
window.moverEtapaLeadComValidacao = async (leadId, novaEtapa, etapaOrigem) => {
  if (novaEtapa === 'perdido') {
    abrirModalMotivoPerda(leadId, etapaOrigem);
    return;
  }

  try {
    await LivingCanvasData.Leads.mover(leadId, novaEtapa);
    showToast(`Lead movido para ${novaEtapa}!`, 'success');
  } catch (err) {
    showToast(`Erro ao mover lead: ${err.message}`, 'error');
  }
};

// ============================================================================
// 4. MODAL DE MOTIVO DE PERDA
// ============================================================================
function abrirModalMotivoPerda(leadId, etapaOrigem) {
  let modal = document.getElementById('modalMotivoPerda');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalMotivoPerda';
    modal.className = 'panel-modal-backdrop';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="panel-modal-dialog">
      <div class="panel-modal-header">
        <h3 class="panel-modal-title" style="color: var(--danger);">Motivo da Perda do Lead</h3>
        <button type="button" class="panel-modal-close" onclick="window.fecharModalMotivoPerda()">×</button>
      </div>
      <form id="formMotivoPerda">
        <input type="hidden" id="perdaLeadId" value="${escapeHtml(leadId)}">
        <div class="panel-form-group">
          <label class="panel-form-label">Por que esta oportunidade foi perdida? <span style="color:var(--danger)">*</span></label>
          <select id="selectMotivoPerda" class="panel-form-select" required>
            <option value="">Selecione o motivo...</option>
            <option value="Preço / Orçamento fora do perfil">Preço / Orçamento fora do perfil</option>
            <option value="Comprou / Alugou com outra imobiliária">Comprou / Alugou com outra imobiliária</option>
            <option value="Desistiu do projeto de mudança">Desistiu do projeto de mudança</option>
            <option value="Sem contato / Não atende">Sem contato / Não atende</option>
            <option value="Localização ou imóvel incompatível">Localização ou imóvel incompatível</option>
            <option value="Outro motivo">Outro motivo</option>
          </select>
        </div>
        <div class="panel-form-group">
          <label class="panel-form-label">Detalhes Adicionais (opcional)</label>
          <textarea id="textoDetalhesPerda" class="panel-form-textarea" rows="3" placeholder="Informações relevantes para futuras abordagens..."></textarea>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 0.8rem; margin-top: 1.5rem;">
          <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="window.fecharModalMotivoPerda()">Cancelar</button>
          <button type="submit" class="panel-btn panel-btn-danger panel-btn-sm">Confirmar Perda</button>
        </div>
      </form>
    </div>
  `;

  modal.classList.add('open');

  const form = document.getElementById('formMotivoPerda');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const motivo = document.getElementById('selectMotivoPerda').value;
    const detalhes = document.getElementById('textoDetalhesPerda').value.trim();
    const motivoCompleto = detalhes ? `${motivo}: ${detalhes}` : motivo;

    try {
      await LivingCanvasData.Leads.atualizar(leadId, {
        etapa: 'perdido',
        status: 'concluido',
        motivoPerda: motivoCompleto
      });
      showToast('Lead marcado como perdido.', 'info');
      window.fecharModalMotivoPerda();
    } catch (err) {
      showToast(`Erro ao registrar perda: ${err.message}`, 'error');
    }
  };
}

window.fecharModalMotivoPerda = () => {
  const modal = document.getElementById('modalMotivoPerda');
  if (modal) modal.classList.remove('open');
};

// ============================================================================
// 5. DRAWER DE DETALHES DO LEAD (NOTAS, AÇÕES RÁPIDAS & CONTATO)
// ============================================================================
window.abrirDetalhesLead = async (leadId) => {
  const lead = leadsCache.find(l => l.id === leadId);
  if (!lead) return;
  currentLeadInDrawer = lead;

  let drawer = document.getElementById('leadDetailDrawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'leadDetailDrawer';
    drawer.className = 'panel-drawer';
    document.body.appendChild(drawer);
  }

  const cleanPhone = (lead.telefone || '').replace(/\D/g, '');
  const config = window.SITE_CONFIG || {};
  const brokerName = config.brokerName || 'Living Canvas';
  const msgWhatsPadrao = encodeURIComponent(`Olá ${lead.nome}, sou da equipe ${brokerName}. Recebi seu contato sobre ${lead.assunto || 'imóveis'} e estou à disposição!`);
  const whatsAppLink = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${msgWhatsPadrao}` : null;

  drawer.innerHTML = `
    <div class="panel-drawer-header">
      <div>
        <span class="panel-badge panel-badge-proposta" style="font-size:0.7rem;">${escapeHtml(lead.origem || 'contato')}</span>
        <h3 style="color: var(--cream); font-family: 'Playfair Display', serif; font-size: 1.35rem; margin-top: 0.2rem;">
          ${escapeHtml(lead.nome || 'Lead')}
        </h3>
      </div>
      <button type="button" class="panel-modal-close" onclick="window.fecharDrawerDetalhes()">×</button>
    </div>

    <div class="panel-drawer-body">
      
      <!-- AÇÕES RÁPIDAS -->
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem;">
        ${whatsAppLink ? `
          <a href="${whatsAppLink}" target="_blank" rel="noopener noreferrer" class="panel-btn panel-btn-primary panel-btn-sm" style="flex:1;">
            💬 WhatsApp
          </a>
        ` : ''}
        ${lead.telefone ? `
          <a href="tel:${escapeHtml(lead.telefone)}" class="panel-btn panel-btn-secondary panel-btn-sm">
            📞 Ligar
          </a>
        ` : ''}
        ${lead.email ? `
          <a href="mailto:${escapeHtml(lead.email)}" class="panel-btn panel-btn-secondary panel-btn-sm">
            ✉️ E-mail
          </a>
        ` : ''}
      </div>

      <!-- DADOS DE CONTATO & ORIGEM -->
      <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem;">
        <div style="font-size: 0.85rem; margin-bottom: 0.4rem;"><strong>E-mail:</strong> ${escapeHtml(lead.email || 'Não informado')}</div>
        <div style="font-size: 0.85rem; margin-bottom: 0.4rem;"><strong>Telefone:</strong> ${escapeHtml(lead.telefone || 'Não informado')}</div>
        <div style="font-size: 0.85rem; margin-bottom: 0.4rem;"><strong>Data de Criação:</strong> ${formatData(lead.criadoEm, true)}</div>
        ${lead.dataPreferida ? `<div style="font-size: 0.85rem; color: var(--gold);"><strong>📅 Data/Horário Desejado:</strong> ${escapeHtml(lead.dataPreferida)} às ${escapeHtml(lead.horarioPreferido || '')}</div>` : ''}
        ${lead.valorEstimado ? `<div style="font-size: 0.85rem; color: var(--gold);"><strong>💰 Valor Estimado:</strong> ${formatMoeda(lead.valorEstimado)}</div>` : ''}
        ${lead.imovelId ? `<div style="font-size: 0.85rem; margin-top: 0.5rem;"><a href="imovel.html?id=${encodeURIComponent(lead.imovelId)}" target="_blank" rel="noopener noreferrer" class="panel-btn panel-btn-secondary panel-btn-sm">Ver Imóvel de Interesse ↗</a></div>` : ''}
      </div>

      <!-- MENSAGEM ORIGINAL -->
      <div style="margin-bottom: 1.25rem;">
        <label class="panel-form-label">Mensagem do Lead</label>
        <div style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 10px; padding: 0.85rem; font-size: 0.88rem; color: var(--cream); font-style: italic;">
          "${escapeHtml(lead.mensagem || lead.assunto || 'Sem mensagem cadastrada.')}"
        </div>
      </div>

      <!-- GESTÃO DO CORRETOR (PRIORIDADE & PRÓXIMO CONTATO) -->
      <div style="background: rgba(10,46,42,0.7); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
        <h4 style="color: var(--gold); font-size: 0.95rem; margin-bottom: 0.85rem;">Status e Agendamento</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div>
            <label class="panel-form-label" style="font-size: 0.75rem;">Prioridade</label>
            <select id="drawerPrioridade" class="panel-form-select" style="font-size: 0.82rem; padding: 0.4rem;" onchange="window.atualizarPrioridadeLead('${lead.id}', this.value)">
              <option value="quente" ${lead.prioridade === 'quente' ? 'selected' : ''}>🔥 Quente</option>
              <option value="morno" ${lead.prioridade === 'morno' || !lead.prioridade ? 'selected' : ''}>⚡ Morno</option>
              <option value="frio" ${lead.prioridade === 'frio' ? 'selected' : ''}>❄️ Frio</option>
            </select>
          </div>
          <div>
            <label class="panel-form-label" style="font-size: 0.75rem;">Próximo Contato</label>
            <input type="date" id="drawerDataContato" class="panel-form-input" style="font-size: 0.82rem; padding: 0.35rem;" value="${lead.proximoContato || ''}" onchange="window.atualizarDataContatoLead('${lead.id}', this.value)">
          </div>
        </div>

        ${lead.usuarioId ? `
          <div style="margin-top: 1rem; border-top: 1px solid var(--glass-border); padding-top: 0.75rem;">
            <a href="#clientes" class="panel-btn panel-btn-secondary panel-btn-sm" style="width: 100%;">
              👤 Abrir Ficha do Cliente Cadastrado
            </a>
          </div>
        ` : ''}
      </div>

      <!-- SUBCOLEÇÃO DE NOTAS INTERNAS -->
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h4 style="color: var(--cream); font-size: 0.95rem;">📝 Notas Internas</h4>
          <span style="font-size: 0.72rem; color: var(--text-muted);">Equipe restrita</span>
        </div>

        <!-- Formulário para adicionar nota -->
        <form id="formNovaNotaLead" onsubmit="window.salvarNovaNotaLead(event, '${lead.id}')" style="margin-bottom: 1rem;">
          <textarea id="textoNovaNota" class="panel-form-textarea" rows="2" placeholder="Escreva uma anotação sobre esta conversa..." required style="font-size: 0.82rem;"></textarea>
          <div style="display: flex; justify-content: flex-end; margin-top: 0.4rem;">
            <button type="submit" class="panel-btn panel-btn-primary panel-btn-sm">Adicionar Nota</button>
          </div>
        </form>

        <!-- Lista de Notas Carregadas -->
        <div id="listaNotasContainer" style="display: flex; flex-direction: column; gap: 0.65rem;">
          <div class="panel-skeleton" style="height: 60px;"></div>
        </div>
      </div>

    </div>
  `;

  drawer.classList.add('open');

  // Carrega as notas da subcoleção
  carregarNotasLead(lead.id);
};

window.fecharDrawerDetalhes = () => {
  const drawer = document.getElementById('leadDetailDrawer');
  if (drawer) drawer.classList.remove('open');
  currentLeadInDrawer = null;
};

async function carregarNotasLead(leadId) {
  const container = document.getElementById('listaNotasContainer');
  if (!container) return;

  try {
    const notas = await LivingCanvasData.Leads.listarNotas(leadId);
    if (notas.length === 0) {
      container.innerHTML = `
        <div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; background: rgba(0,0,0,0.15); border-radius: 8px;">
          Nenhuma nota interna adicionada ainda.
        </div>
      `;
      return;
    }

    container.innerHTML = notas.map(n => `
      <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--glass-border); border-radius: 8px; padding: 0.75rem;">
        <p style="font-size: 0.82rem; color: var(--cream); margin-bottom: 0.35rem;">${escapeHtml(n.texto)}</p>
        <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted);">
          <span>Por: ${escapeHtml(n.autorNome || 'Corretor')}</span>
          <span>${formatData(n.criadoEm, true)}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger); font-size:0.8rem;">Erro ao carregar notas: ${escapeHtml(err.message)}</p>`;
  }
}

window.salvarNovaNotaLead = async (e, leadId) => {
  e.preventDefault();
  const textarea = document.getElementById('textoNovaNota');
  const texto = textarea?.value?.trim();
  if (!texto) return;

  try {
    await LivingCanvasData.Leads.adicionarNota(leadId, texto);
    textarea.value = '';
    showToast('Nota adicionada com sucesso!', 'success');
    await carregarNotasLead(leadId);
  } catch (err) {
    showToast(`Erro ao gravar nota: ${err.message}`, 'error');
  }
};

window.atualizarPrioridadeLead = async (leadId, prioridade) => {
  try {
    await LivingCanvasData.Leads.atualizar(leadId, { prioridade });
    showToast('Prioridade atualizada.', 'info');
  } catch (err) {
    showToast('Erro ao atualizar prioridade.', 'error');
  }
};

window.atualizarDataContatoLead = async (leadId, proximoContato) => {
  try {
    await LivingCanvasData.Leads.atualizar(leadId, { proximoContato });
    showToast('Próximo contato agendado.', 'info');
  } catch (err) {
    showToast('Erro ao agendar contato.', 'error');
  }
};

// ============================================================================
// 6. CONTROLES DE FILTROS & EXPORTAÇÃO CSV
// ============================================================================
window.handleFilterChange = (campo, valor) => {
  activeFilters[campo] = valor;
  const user = LivingCanvasAuth.auth?.currentUser;
  renderLeadsViewContent(user?.uid);
};

window.limparFiltrosLeads = () => {
  activeFilters.termoBusca = '';
  activeFilters.origem = '';
  activeFilters.etapa = '';
  activeFilters.periodo = 'todos';
  activeFilters.atribuidoAMim = false;

  const txt = document.getElementById('filtroTexto');
  if (txt) txt.value = '';
  const ori = document.getElementById('filtroOrigem');
  if (ori) ori.value = '';
  const eta = document.getElementById('filtroEtapa');
  if (eta) eta.value = '';
  const per = document.getElementById('filtroPeriodo');
  if (per) per.value = 'todos';
  const ckb = document.getElementById('filtroAtribuidoAMim');
  if (ckb) ckb.checked = false;

  const user = LivingCanvasAuth.auth?.currentUser;
  renderLeadsViewContent(user?.uid);
};

window.setLeadsViewMode = (modo) => {
  currentViewMode = modo;
  const btnK = document.getElementById('btnViewKanban');
  const btnT = document.getElementById('btnViewTabela');

  if (btnK && btnT) {
    if (modo === 'kanban') {
      btnK.style.background = 'var(--gold)';
      btnK.style.color = 'var(--emerald-deep)';
      btnT.style.background = 'transparent';
      btnT.style.color = 'var(--cream)';
    } else {
      btnT.style.background = 'var(--gold)';
      btnT.style.color = 'var(--emerald-deep)';
      btnK.style.background = 'transparent';
      btnK.style.color = 'var(--cream)';
    }
  }

  const user = LivingCanvasAuth.auth?.currentUser;
  renderLeadsViewContent(user?.uid);
};

/**
 * Exporta os leads atualmente filtrados em CSV limpo
 */
window.exportarLeadsCSV = () => {
  const user = LivingCanvasAuth.auth?.currentUser;
  const leads = filtrarLeads(leadsCache, user?.uid);

  if (leads.length === 0) {
    showToast('Nenhum lead para exportar com os filtros atuais.', 'info');
    return;
  }

  const colunas = ['Nome', 'Email', 'Telefone', 'Origem', 'Etapa', 'Prioridade', 'Data Criacao', 'Mensagem'];
  const linhas = leads.map(l => [
    `"${(l.nome || '').replace(/"/g, '""')}"`,
    `"${(l.email || '').replace(/"/g, '""')}"`,
    `"${(l.telefone || '').replace(/"/g, '""')}"`,
    `"${(l.origem || '').replace(/"/g, '""')}"`,
    `"${normalizarEtapa(l)}"`,
    `"${l.prioridade || 'morno'}"`,
    `"${formatData(l.criadoEm)}"`,
    `"${(l.mensagem || l.assunto || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [colunas.join(','), ...linhas.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `leads_living_canvas_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Download do CSV iniciado com sucesso!', 'success');
};
