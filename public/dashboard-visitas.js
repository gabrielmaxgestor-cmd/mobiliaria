/**
 * Living Canvas - Dashboard do Cliente: Minhas Visitas (P11)
 * 
 * Gerencia a agenda do cliente com dados reais do Firestore:
 * - Filtros por status: Todas, Agendadas/Confirmadas, Realizadas, Canceladas
 * - Cards detalhados com informações do imóvel, modalidade (vídeo/presencial) e corretor
 * - Ações reais: Reagendar data/hora, Cancelar com motivo e Avaliar visita com estrelas e comentário
 * - Modal interativo para reagendamento, cancelamento e avaliação
 */

import { registerView, escapeHtml, formatData, showToast } from "./panel-shell.js";
import { Visitas, CorretoresPublicos } from "./lc-data.js";
import { getPropertyById } from "./properties.js";

let currentVisitasList = [];
let activeFilter = "todas"; // todas | agendadas | realizadas | canceladas
let cachedBrokers = new Map();
let currentModalContext = null;

export function initDashboardVisitas() {
  registerView("visitas", {
    titulo: "Minhas Visitas",
    mount: async (section, user) => {
      const container = document.getElementById("clientVisitsContainer");
      if (!container || !user) return;

      container.innerHTML = `
        <div class="panel-skeleton" style="height: 50px; margin-bottom: 1.5rem; border-radius: 8px;"></div>
        <div class="panel-skeleton" style="height: 140px; margin-bottom: 1rem; border-radius: 12px;"></div>
        <div class="panel-skeleton" style="height: 140px; border-radius: 12px;"></div>
      `;

      try {
        // Pré-carrega corretores para exibir contato direto
        try {
          const corretores = await CorretoresPublicos.listarVisiveis();
          corretores.forEach(c => cachedBrokers.set(c.id, c));
        } catch (e) {
          console.warn("Aviso ao carregar corretores para visitas:", e);
        }

        // Carrega as visitas do cliente
        currentVisitasList = await Visitas.listarDoCliente(user.uid);
        renderVisitasInterface(container, user);
      } catch (err) {
        console.error("Erro ao carregar visitas:", err);
        container.innerHTML = `
          <div class="panel-empty-state" style="padding: 3rem 1.5rem;">
            <div class="panel-empty-icon">⚠️</div>
            <h4 class="panel-empty-title">Não foi possível carregar suas visitas</h4>
            <p class="panel-empty-desc">${escapeHtml(err.message || 'Erro de conexão com o banco de dados.')}</p>
            <button class="panel-btn panel-btn-primary" onclick="window.location.reload()">Tentar Novamente</button>
          </div>
        `;
      }
    },
    unmount: () => {
      fecharModalVisita();
    }
  });
}

/**
 * Renderiza o cabeçalho de filtros, estatísticas e listagem
 */
function renderVisitasInterface(container, user) {
  // Filtra de acordo com a aba selecionada
  const filtered = currentVisitasList.filter(v => {
    const st = (v.status || "").toLowerCase();
    if (activeFilter === "agendadas") {
      return st === "pendente" || st === "solicitada" || st === "confirmada" || st === "reagendada";
    }
    if (activeFilter === "realizadas") {
      return st === "realizada" || st === "concluida";
    }
    if (activeFilter === "canceladas") {
      return st === "cancelada" || st === "recusada";
    }
    return true; // "todas"
  });

  const agendadasCount = currentVisitasList.filter(v => ["pendente", "solicitada", "confirmada", "reagendada"].includes((v.status || "").toLowerCase())).length;
  const realizadasCount = currentVisitasList.filter(v => ["realizada", "concluida"].includes((v.status || "").toLowerCase())).length;
  const canceladasCount = currentVisitasList.filter(v => ["cancelada", "recusada"].includes((v.status || "").toLowerCase())).length;

  container.innerHTML = `
    <!-- BARRA DE FILTROS & AÇÃO RÁPIDA -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 1.25rem;">
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;" role="tablist">
        <button type="button" class="panel-btn ${activeFilter === 'todas' ? 'panel-btn-primary' : 'panel-btn-secondary'} panel-btn-sm" data-filter="todas">
          Todas (${currentVisitasList.length})
        </button>
        <button type="button" class="panel-btn ${activeFilter === 'agendadas' ? 'panel-btn-primary' : 'panel-btn-secondary'} panel-btn-sm" data-filter="agendadas">
          📅 Agendadas (${agendadasCount})
        </button>
        <button type="button" class="panel-btn ${activeFilter === 'realizadas' ? 'panel-btn-primary' : 'panel-btn-secondary'} panel-btn-sm" data-filter="realizadas">
          ✓ Realizadas (${realizadasCount})
        </button>
        <button type="button" class="panel-btn ${activeFilter === 'canceladas' ? 'panel-btn-primary' : 'panel-btn-secondary'} panel-btn-sm" data-filter="canceladas">
          ✕ Canceladas (${canceladasCount})
        </button>
      </div>

      <a href="imoveis.html" class="panel-btn panel-btn-primary panel-btn-sm" style="display: inline-flex; align-items: center; gap: 0.4rem;">
        <span>+</span> Agendar Nova Visita
      </a>
    </div>

    <!-- LISTA DE VISITAS OU ESTADO VAZIO -->
    ${filtered.length === 0 ? renderEmptyState(activeFilter) : `
      <div style="display: flex; flex-direction: column; gap: 1.25rem;">
        ${filtered.map(v => renderVisitaCard(v)).join('')}
      </div>
    `}

    <!-- MODAL DE DETALHES / AÇÃO DA VISITA -->
    <div id="visitaActionModalBackdrop" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.75); backdrop-filter:blur(6px); z-index:9999; align-items:center; justify-content:center; padding:1rem;">
      <div id="visitaActionModalContent" style="background:var(--emerald-deep); border:1px solid var(--gold); border-radius:16px; width:100%; max-width:540px; max-height:90vh; overflow-y:auto; padding:1.8rem; box-shadow:0 20px 50px rgba(0,0,0,0.6); position:relative;">
        <!-- Injetado dinamicamente -->
      </div>
    </div>
  `;

  // Listeners de filtro
  container.querySelectorAll('button[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.getAttribute('data-filter') || 'todas';
      renderVisitasInterface(container, user);
    });
  });

  // Listeners de ações
  attachActionListeners(container, user);
}

/**
 * Renderiza o card individual de visita com visual premium
 */
function renderVisitaCard(visita) {
  const isAgendada = ["pendente", "solicitada", "confirmada", "reagendada"].includes((visita.status || "").toLowerCase());
  const isRealizada = ["realizada", "concluida"].includes((visita.status || "").toLowerCase());
  const isCancelada = ["cancelada", "recusada"].includes((visita.status || "").toLowerCase());

  // Dados do corretor
  const corretor = visita.corretorId ? cachedBrokers.get(visita.corretorId) : null;
  const corretorNome = corretor?.nome || (window.SITE_CONFIG?.corretorPadrao?.nome) || "Equipe de Relacionamento";
  const corretorWhats = corretor?.whatsapp || (window.SITE_CONFIG?.telefoneLimpo) || "";

  return `
    <div class="panel-card" style="margin-bottom:0; border: 1px solid var(--glass-border); transition: border-color 0.2s; position: relative;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;">
        
        <!-- CABEÇALHO DO IMÓVEL & STATUS -->
        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          <span class="panel-badge panel-badge-${visita.status || 'solicitada'}" style="font-size: 0.78rem;">
            ● ${(visita.status || 'SOLICITADA').toUpperCase()}
          </span>
          <span style="font-size: 0.8rem; color: var(--gold); background: rgba(212, 175, 122, 0.1); padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 500;">
            ${visita.tipoVisita === 'video' ? '📹 Videoconferência' : '📍 Visita Presencial'}
          </span>
          <span style="font-size: 0.78rem; color: var(--text-muted);">
            Solicitada em ${formatData(visita.criadoEm)}
          </span>
        </div>

        <!-- DROPDOWN OU BOTÕES DE AÇÃO -->
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" data-action="ver-detalhes" data-id="${visita.id}">
            Ver Detalhes
          </button>
        </div>
      </div>

      <!-- CORPO DA VISITA -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; background: rgba(10, 46, 42, 0.35); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem;">
        
        <!-- COLUNA 1: IMÓVEL E HORÁRIO -->
        <div>
          <h4 style="font-family: 'Playfair Display', serif; font-size: 1.2rem; color: var(--cream); margin: 0 0 0.4rem 0;">
            ${escapeHtml(visita.imovelTitulo || 'Imóvel Exclusivo')}
          </h4>
          <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--gold); font-size: 0.95rem; font-weight: 600; margin-bottom: 0.5rem;">
            <span>🗓️</span>
            <span>${escapeHtml(visita.data || 'Data a definir')} às ${escapeHtml(visita.horario || '—')}</span>
          </div>
          ${visita.observacao ? `
            <p style="font-size: 0.82rem; color: var(--text-light); margin: 0.4rem 0 0 0; font-style: italic;">
              “${escapeHtml(visita.observacao)}”
            </p>
          ` : ''}
          ${visita.motivoCancelamento ? `
            <p style="font-size: 0.82rem; color: var(--danger); margin: 0.4rem 0 0 0; background: rgba(255, 107, 107, 0.08); padding: 0.4rem 0.6rem; border-radius: 6px;">
              <strong>Motivo do cancelamento:</strong> ${escapeHtml(visita.motivoCancelamento)}
            </p>
          ` : ''}
        </div>

        <!-- COLUNA 2: CORRETOR E ATENDIMENTO -->
        <div style="display: flex; flex-direction: column; justify-content: space-between; border-left: 1px solid rgba(245, 241, 232, 0.08); padding-left: 1.25rem;">
          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 0.25rem;">
              Corretor Responsável
            </div>
            <div style="color: var(--cream); font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem;">
              👤 ${escapeHtml(corretorNome)}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-light);">
              Acompanhamento dedicado
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap;">
            ${corretorWhats ? `
              <a href="https://wa.me/${corretorWhats.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Gostaria de falar sobre a visita do imóvel "${visita.imovelTitulo || ''}" agendada para ${visita.data}.`)}" target="_blank" rel="noopener" class="panel-btn panel-btn-secondary panel-btn-sm" style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem;">
                <span>💬</span> WhatsApp
              </a>
            ` : ''}
            <a href="imovel.html?id=${encodeURIComponent(visita.imovelId || '')}" class="panel-btn panel-btn-secondary panel-btn-sm" style="font-size: 0.78rem;">
              Página do Imóvel ↗
            </a>
          </div>
        </div>

      </div>

      <!-- LINK DE VÍDEO SE HOUVER -->
      ${visita.tipoVisita === 'video' && visita.linkVideo ? `
        <div style="background: rgba(212, 175, 122, 0.1); border: 1px dashed var(--gold); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; color: var(--cream);">
            <span>📹</span> <strong>Link da Sala Virtual:</strong> ${escapeHtml(visita.linkVideo)}
          </div>
          <a href="${encodeURI(visita.linkVideo)}" target="_blank" rel="noopener" class="panel-btn panel-btn-primary panel-btn-sm">
            Entrar na Chamada ↗
          </a>
        </div>
      ` : ''}

      <!-- RODAPÉ COM AÇÕES REAIS -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; border-top: 1px solid rgba(245, 241, 232, 0.08); padding-top: 0.85rem;">
        
        <!-- AVALIAÇÃO DA VISITA -->
        <div>
          ${isRealizada ? (
            visita.avaliacao ? `
              <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--gold);">
                <span>${'★'.repeat(visita.avaliacao.nota)}${'☆'.repeat(5 - visita.avaliacao.nota)}</span>
                <span style="color: var(--text-light); font-size: 0.8rem;">“${escapeHtml(visita.avaliacao.comentario || 'Avaliada')}”</span>
              </div>
            ` : `
              <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" data-action="avaliar" data-id="${visita.id}">
                ⭐ Avaliar Experiência
              </button>
            `
          ) : ''}
        </div>

        <!-- AÇÕES DE CANCELAR / REAGENDAR PARA VISITAS ATIVAS -->
        <div style="display: flex; gap: 0.5rem; align-items: center; margin-left: auto;">
          ${isAgendada ? `
            <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" data-action="reagendar" data-id="${visita.id}">
              🗓️ Reagendar
            </button>
            <button type="button" class="panel-btn panel-btn-danger panel-btn-sm" data-action="cancelar" data-id="${visita.id}">
              ✕ Cancelar
            </button>
          ` : ''}
        </div>

      </div>

    </div>
  `;
}

/**
 * Empty states conforme filtro
 */
function renderEmptyState(filtro) {
  const mensagens = {
    todas: {
      titulo: "Nenhuma visita cadastrada",
      desc: "Quando você agendar uma visita presencial ou por chamada de vídeo para qualquer imóvel do portfólio, ela aparecerá aqui com confirmações e links em tempo real."
    },
    agendadas: {
      titulo: "Nenhuma visita futura agendada",
      desc: "Você não possui visitas programadas no momento. Escolha um dos seus imóveis favoritos e reserve uma data conveniente."
    },
    realizadas: {
      titulo: "Nenhuma visita realizada ainda",
      desc: "Após a conclusão das suas visitas agendadas, seu histórico de visitas e formulários de avaliação serão reunidos aqui."
    },
    canceladas: {
      titulo: "Nenhuma visita cancelada",
      desc: "Seus agendamentos cancelados ou que precisaram de alteração de rota serão mantidos aqui para auditoria."
    }
  };

  const item = mensagens[filtro] || mensagens.todas;

  return `
    <div class="panel-empty-state" style="padding: 3rem 1.5rem;">
      <div class="panel-empty-icon" style="font-size: 2.5rem; margin-bottom: 0.6rem;">📅</div>
      <h4 class="panel-empty-title">${item.titulo}</h4>
      <p class="panel-empty-desc" style="max-width: 480px; margin: 0 auto 1.5rem auto;">${item.desc}</p>
      <a href="imoveis.html" class="panel-btn panel-btn-primary panel-btn-sm">
        + Explorar Imóveis e Agendar
      </a>
    </div>
  `;
}

/**
 * Conecta os listeners para os botões de ação
 */
function attachActionListeners(container, user) {
  // Reagendar
  container.querySelectorAll('button[data-action="reagendar"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const visita = currentVisitasList.find(v => v.id === id);
      if (visita) abrirModalReagendar(visita, user, container);
    });
  });

  // Cancelar
  container.querySelectorAll('button[data-action="cancelar"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const visita = currentVisitasList.find(v => v.id === id);
      if (visita) abrirModalCancelar(visita, user, container);
    });
  });

  // Avaliar
  container.querySelectorAll('button[data-action="avaliar"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const visita = currentVisitasList.find(v => v.id === id);
      if (visita) abrirModalAvaliar(visita, user, container);
    });
  });

  // Ver Detalhes
  container.querySelectorAll('button[data-action="ver-detalhes"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const visita = currentVisitasList.find(v => v.id === id);
      if (visita) abrirModalDetalhes(visita);
    });
  });
}

/**
 * Modal: Reagendar Visita
 */
function abrirModalReagendar(visita, user, mainContainer) {
  const backdrop = document.getElementById("visitaActionModalBackdrop");
  const content = document.getElementById("visitaActionModalContent");
  if (!backdrop || !content) return;

  // Data mínima: hoje
  const hoje = new Date().toISOString().split("T")[0];

  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
      <h3 style="font-family:'Playfair Display',serif; color:var(--cream); font-size:1.35rem; margin:0;">
        🗓️ Reagendar Visita
      </h3>
      <button type="button" class="panel-btn-close" id="btnFecharModalVisita" style="background:transparent; border:none; color:var(--cream); font-size:1.4rem; cursor:pointer;">&times;</button>
    </div>

    <p style="font-size:0.88rem; color:var(--text-light); margin-bottom:1.2rem;">
      Solicite uma nova data e horário para a visita ao imóvel <strong>${escapeHtml(visita.imovelTitulo || 'selecionado')}</strong>.
    </p>

    <form id="formReagendarVisita" style="display:flex; flex-direction:column; gap:1rem;">
      <div>
        <label style="display:block; font-size:0.82rem; color:var(--gold); margin-bottom:0.35rem; font-weight:600;">Nova Data:</label>
        <input type="date" id="novaDataVisita" min="${hoje}" value="${visita.data || ''}" required class="panel-input" style="width:100%;" />
      </div>

      <div>
        <label style="display:block; font-size:0.82rem; color:var(--gold); margin-bottom:0.35rem; font-weight:600;">Novo Horário:</label>
        <select id="novoHorarioVisita" required class="panel-input" style="width:100%;">
          <option value="">Selecione um horário</option>
          <option value="09:00">09:00</option>
          <option value="10:00">10:00</option>
          <option value="11:00">11:00</option>
          <option value="14:00">14:00</option>
          <option value="15:00">15:00</option>
          <option value="16:00">16:00</option>
          <option value="17:00">17:00</option>
        </select>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:1rem;">
        <button type="button" class="panel-btn panel-btn-secondary" id="btnCancelarReagendamento">Voltar</button>
        <button type="submit" class="panel-btn panel-btn-primary" id="btnSalvarReagendamento">Confirmar Reagendamento</button>
      </div>
    </form>
  `;

  backdrop.style.display = "flex";

  const btnClose = document.getElementById("btnFecharModalVisita");
  const btnCancel = document.getElementById("btnCancelarReagendamento");
  btnClose?.addEventListener("click", fecharModalVisita);
  btnCancel?.addEventListener("click", fecharModalVisita);

  const form = document.getElementById("formReagendarVisita");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const novaData = document.getElementById("novaDataVisita")?.value;
    const novoHorario = document.getElementById("novoHorarioVisita")?.value;

    if (!novaData || !novoHorario) {
      showToast("Selecione data e horário.", "error");
      return;
    }

    const btnSubmit = document.getElementById("btnSalvarReagendamento");
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = "Atualizando...";
    }

    try {
      await Visitas.reagendar(visita.id, novaData, novoHorario);
      showToast("Solicitação de reagendamento enviada!", "success");
      fecharModalVisita();

      // Atualiza localmente
      visita.data = novaData;
      visita.horario = novoHorario;
      visita.status = "reagendada";
      renderVisitasInterface(mainContainer, user);
    } catch (err) {
      showToast(err.message || "Erro ao reagendar.", "error");
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Confirmar Reagendamento";
      }
    }
  });
}

/**
 * Modal: Cancelar Visita
 */
function abrirModalCancelar(visita, user, mainContainer) {
  const backdrop = document.getElementById("visitaActionModalBackdrop");
  const content = document.getElementById("visitaActionModalContent");
  if (!backdrop || !content) return;

  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
      <h3 style="font-family:'Playfair Display',serif; color:#FF6B6B; font-size:1.35rem; margin:0;">
        ✕ Cancelar Visita
      </h3>
      <button type="button" class="panel-btn-close" id="btnFecharModalVisita" style="background:transparent; border:none; color:var(--cream); font-size:1.4rem; cursor:pointer;">&times;</button>
    </div>

    <p style="font-size:0.88rem; color:var(--text-light); margin-bottom:1.2rem;">
      Tem certeza que deseja cancelar a visita ao imóvel <strong>${escapeHtml(visita.imovelTitulo || 'selecionado')}</strong> marcada para <strong>${escapeHtml(visita.data)} às ${escapeHtml(visita.horario)}</strong>?
    </p>

    <form id="formCancelarVisita" style="display:flex; flex-direction:column; gap:1rem;">
      <div>
        <label style="display:block; font-size:0.82rem; color:var(--gold); margin-bottom:0.35rem; font-weight:600;">Motivo do Cancelamento:</label>
        <select id="motivoCancelamentoVisita" required class="panel-input" style="width:100%; margin-bottom:0.5rem;">
          <option value="Imprevisto de agenda">Imprevisto de agenda</option>
          <option value="Já fechei outro imóvel">Já fechei outro imóvel</option>
          <option value="Não tenho mais interesse no imóvel">Não tenho mais interesse no imóvel</option>
          <option value="Desejo remarcar para mais adiante">Desejo remarcar para mais adiante</option>
          <option value="Outro motivo">Outro motivo</option>
        </select>
        <textarea id="motivoCancelamentoExtra" class="panel-input" style="width:100%; min-height:70px; resize:vertical;" placeholder="Observações adicionais (opcional)..."></textarea>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:1rem;">
        <button type="button" class="panel-btn panel-btn-secondary" id="btnVoltarCancelamento">Manter Visita</button>
        <button type="submit" class="panel-btn panel-btn-danger" id="btnConfirmarCancelamento">Confirmar Cancelamento</button>
      </div>
    </form>
  `;

  backdrop.style.display = "flex";

  const btnClose = document.getElementById("btnFecharModalVisita");
  const btnBack = document.getElementById("btnVoltarCancelamento");
  btnClose?.addEventListener("click", fecharModalVisita);
  btnBack?.addEventListener("click", fecharModalVisita);

  const form = document.getElementById("formCancelarVisita");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const motivoPadrao = document.getElementById("motivoCancelamentoVisita")?.value || "Imprevisto";
    const extra = document.getElementById("motivoCancelamentoExtra")?.value?.trim();
    const motivoFinal = extra ? `${motivoPadrao} - ${extra}` : motivoPadrao;

    const btnSubmit = document.getElementById("btnConfirmarCancelamento");
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = "Cancelando...";
    }

    try {
      await Visitas.cancelar(visita.id, motivoFinal);
      showToast("Visita cancelada com sucesso.", "info");
      fecharModalVisita();

      visita.status = "cancelada";
      visita.motivoCancelamento = motivoFinal;
      renderVisitasInterface(mainContainer, user);
    } catch (err) {
      showToast(err.message || "Erro ao cancelar.", "error");
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Confirmar Cancelamento";
      }
    }
  });
}

/**
 * Modal: Avaliar Visita Realizada
 */
function abrirModalAvaliar(visita, user, mainContainer) {
  const backdrop = document.getElementById("visitaActionModalBackdrop");
  const content = document.getElementById("visitaActionModalContent");
  if (!backdrop || !content) return;

  let notaSelecionada = 5;

  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
      <h3 style="font-family:'Playfair Display',serif; color:var(--cream); font-size:1.35rem; margin:0;">
        ⭐ Avaliar Visita
      </h3>
      <button type="button" class="panel-btn-close" id="btnFecharModalVisita" style="background:transparent; border:none; color:var(--cream); font-size:1.4rem; cursor:pointer;">&times;</button>
    </div>

    <p style="font-size:0.88rem; color:var(--text-light); margin-bottom:1.2rem;">
      Como foi sua experiência na visita ao imóvel <strong>${escapeHtml(visita.imovelTitulo || 'selecionado')}</strong>?
    </p>

    <form id="formAvaliarVisita" style="display:flex; flex-direction:column; gap:1.25rem;">
      <div style="text-align:center;">
        <label style="display:block; font-size:0.85rem; color:var(--gold); margin-bottom:0.5rem; font-weight:600;">Sua Nota:</label>
        <div id="starContainer" style="display:inline-flex; gap:0.4rem; font-size:2.2rem; cursor:pointer; color:var(--gold);">
          <span data-star="1">★</span>
          <span data-star="2">★</span>
          <span data-star="3">★</span>
          <span data-star="4">★</span>
          <span data-star="5">★</span>
        </div>
      </div>

      <div>
        <label style="display:block; font-size:0.82rem; color:var(--gold); margin-bottom:0.35rem; font-weight:600;">Comentário ou Impressões:</label>
        <textarea id="comentarioAvaliacao" class="panel-input" style="width:100%; min-height:85px; resize:vertical;" placeholder="O que achou do imóvel, da pontualidade e do atendimento do corretor?"></textarea>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:0.5rem;">
        <button type="button" class="panel-btn panel-btn-secondary" id="btnFecharAval">Voltar</button>
        <button type="submit" class="panel-btn panel-btn-primary" id="btnSalvarAvaliacao">Enviar Avaliação</button>
      </div>
    </form>
  `;

  backdrop.style.display = "flex";

  const updateStars = (rating) => {
    notaSelecionada = rating;
    const stars = content.querySelectorAll("#starContainer span");
    stars.forEach(s => {
      const val = parseInt(s.getAttribute("data-star"), 10);
      s.textContent = val <= rating ? "★" : "☆";
    });
  };

  content.querySelectorAll("#starContainer span").forEach(star => {
    star.addEventListener("click", () => {
      const val = parseInt(star.getAttribute("data-star"), 10);
      updateStars(val);
    });
  });

  const btnClose = document.getElementById("btnFecharModalVisita");
  const btnBack = document.getElementById("btnFecharAval");
  btnClose?.addEventListener("click", fecharModalVisita);
  btnBack?.addEventListener("click", fecharModalVisita);

  const form = document.getElementById("formAvaliarVisita");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const comentario = document.getElementById("comentarioAvaliacao")?.value?.trim() || "";

    const btnSubmit = document.getElementById("btnSalvarAvaliacao");
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = "Gravando...";
    }

    try {
      await Visitas.avaliar(visita.id, notaSelecionada, comentario);
      showToast("Obrigado pelo seu feedback!", "success");
      fecharModalVisita();

      visita.avaliacao = {
        nota: notaSelecionada,
        comentario
      };
      renderVisitasInterface(mainContainer, user);
    } catch (err) {
      showToast(err.message || "Erro ao salvar avaliação.", "error");
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Enviar Avaliação";
      }
    }
  });
}

/**
 * Modal: Ficha Completa de Detalhes da Visita
 */
function abrirModalDetalhes(visita) {
  const backdrop = document.getElementById("visitaActionModalBackdrop");
  const content = document.getElementById("visitaActionModalContent");
  if (!backdrop || !content) return;

  const corretor = visita.corretorId ? cachedBrokers.get(visita.corretorId) : null;
  const corretorNome = corretor?.nome || (window.SITE_CONFIG?.corretorPadrao?.nome) || "Equipe de Relacionamento";
  const corretorWhats = corretor?.whatsapp || (window.SITE_CONFIG?.telefoneLimpo) || "";

  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
      <h3 style="font-family:'Playfair Display',serif; color:var(--cream); font-size:1.35rem; margin:0;">
        📋 Detalhes da Visita
      </h3>
      <button type="button" class="panel-btn-close" id="btnFecharModalVisita" style="background:transparent; border:none; color:var(--cream); font-size:1.4rem; cursor:pointer;">&times;</button>
    </div>

    <div style="display:flex; flex-direction:column; gap:1rem; font-size:0.9rem;">
      <div style="background:rgba(10, 46, 42, 0.5); padding:1rem; border-radius:10px; border:1px solid var(--glass-border);">
        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Imóvel</div>
        <h4 style="color:var(--cream); margin:0.2rem 0 0.5rem 0; font-family:'Playfair Display',serif; font-size:1.15rem;">
          ${escapeHtml(visita.imovelTitulo || 'Imóvel Selecionado')}
        </h4>
        <a href="imovel.html?id=${encodeURIComponent(visita.imovelId || '')}" class="panel-btn panel-btn-secondary panel-btn-sm">
          Ver Ficha do Imóvel ↗
        </a>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
        <div style="background:var(--glass-bg); padding:0.85rem; border-radius:8px; border:1px solid var(--glass-border);">
          <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Data & Horário</div>
          <div style="color:var(--gold); font-weight:600; margin-top:0.2rem;">
            ${escapeHtml(visita.data || '—')} às ${escapeHtml(visita.horario || '—')}
          </div>
        </div>
        <div style="background:var(--glass-bg); padding:0.85rem; border-radius:8px; border:1px solid var(--glass-border);">
          <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Modalidade</div>
          <div style="color:var(--cream); font-weight:600; margin-top:0.2rem;">
            ${visita.tipoVisita === 'video' ? '📹 Vídeo' : '📍 Presencial'}
          </div>
        </div>
      </div>

      <div style="background:var(--glass-bg); padding:0.85rem; border-radius:8px; border:1px solid var(--glass-border);">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Status Atual</div>
        <div style="margin-top:0.3rem;">
          <span class="panel-badge panel-badge-${visita.status || 'solicitada'}">
            ● ${escapeHtml(visita.status || 'solicitada').toUpperCase()}
          </span>
        </div>
      </div>

      <div style="background:var(--glass-bg); padding:0.85rem; border-radius:8px; border:1px solid var(--glass-border);">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Corretor Responsável</div>
        <div style="color:var(--cream); font-weight:600; margin-top:0.2rem;">
          ${escapeHtml(corretorNome)}
        </div>
        ${corretorWhats ? `
          <div style="margin-top:0.5rem;">
            <a href="https://wa.me/${corretorWhats.replace(/\D/g, '')}" target="_blank" rel="noopener" class="panel-btn panel-btn-primary panel-btn-sm">
              Falar via WhatsApp
            </a>
          </div>
        ` : ''}
      </div>

      ${visita.observacao ? `
        <div style="background:var(--glass-bg); padding:0.85rem; border-radius:8px; border:1px solid var(--glass-border);">
          <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Observação do Agendamento</div>
          <p style="color:var(--text-light); margin:0.3rem 0 0 0; font-style:italic;">“${escapeHtml(visita.observacao)}”</p>
        </div>
      ` : ''}
    </div>

    <div style="display:flex; justify-content:flex-end; margin-top:1.5rem;">
      <button type="button" class="panel-btn panel-btn-secondary" id="btnFecharDetalhes">Fechar</button>
    </div>
  `;

  backdrop.style.display = "flex";

  const btnClose = document.getElementById("btnFecharModalVisita");
  const btnCloseBottom = document.getElementById("btnFecharDetalhes");
  btnClose?.addEventListener("click", fecharModalVisita);
  btnCloseBottom?.addEventListener("click", fecharModalVisita);
}

function fecharModalVisita() {
  const backdrop = document.getElementById("visitaActionModalBackdrop");
  if (backdrop) backdrop.style.display = "none";
}

// Inicialização automática do módulo
initDashboardVisitas();
