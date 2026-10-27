/**
 * Living Canvas - Dashboard do Cliente: Minha Jornada & Histórico (P11)
 * 
 * Centraliza o progresso da jornada do cliente na aquisição/locação:
 * - Funil visual interativo: Descoberta -> Visitas -> Proposta -> Documentação -> Conclusão
 * - Determinação dinâmica da etapa atual com base no estado real do Firestore
 * - Checklist do processo (compra financiada, à vista ou locação) com cálculo real de progresso percentual
 * - Linha do tempo unificada de atividades registradas na coleção 'atividades'
 */

import { registerView, escapeHtml, formatData, showToast } from "./panel-shell.js";
import { Atividades, Documentos, Propostas, Visitas, CHECKLISTS } from "./lc-data.js";
import * as LivingCanvasFavorites from "./favorites.js";

let currentProcesso = "compra_financiada";

export function initDashboardJornada() {
  registerView("jornada", {
    titulo: "Minha Jornada",
    mount: async (section, user) => {
      const container = document.getElementById("view-jornada");
      if (!container || !user) return;

      container.innerHTML = `
        <div class="panel-skeleton" style="height: 120px; margin-bottom: 1.5rem; border-radius: 12px;"></div>
        <div class="panel-skeleton" style="height: 200px; margin-bottom: 1.5rem; border-radius: 12px;"></div>
        <div class="panel-skeleton" style="height: 300px; border-radius: 12px;"></div>
      `;

      try {
        // Carrega dados em paralelo para determinar o funil
        const [
          atividadesRes,
          documentosRes,
          propostasRes,
          visitasRes,
          favoritosRes
        ] = await Promise.allSettled([
          Atividades.listar(user.uid, 50),
          Documentos.listarDoCliente(user.uid),
          Propostas.listarDoUsuario(user.uid),
          Visitas.listarDoCliente(user.uid),
          LivingCanvasFavorites.getFavoriteProperties()
        ]);

        const atividades = atividadesRes.status === "fulfilled" ? (atividadesRes.value || []) : [];
        const documentos = documentosRes.status === "fulfilled" ? (documentosRes.value || []) : [];
        const propostas = propostasRes.status === "fulfilled" ? (propostasRes.value || []) : [];
        const visitas = visitasRes.status === "fulfilled" ? (visitasRes.value || []) : [];
        const favoritos = favoritosRes.status === "fulfilled" ? (favoritosRes.value || []) : [];

        // Determina a etapa atual do funil
        const etapaAtual = calcularEtapaAtual({
          visitas,
          propostas,
          documentos,
          favoritos
        });

        // Detecta se há um processo predominante nos documentos
        if (documentos.length > 0 && documentos[0].processo && CHECKLISTS[documentos[0].processo]) {
          currentProcesso = documentos[0].processo;
        }

        renderJornadaContent(container, user, {
          etapaAtual,
          atividades,
          documentos,
          propostas,
          visitas,
          favoritos
        });

      } catch (err) {
        console.error("Erro ao carregar Jornada:", err);
        container.innerHTML = `
          <div class="panel-empty-state" style="padding: 3rem 1.5rem;">
            <div class="panel-empty-icon">⚠️</div>
            <h4 class="panel-empty-title">Não foi possível carregar sua Jornada</h4>
            <p class="panel-empty-desc">${escapeHtml(err.message || 'Erro de conexão com o banco de dados.')}</p>
            <button class="panel-btn panel-btn-primary" onclick="window.location.reload()">Tentar Novamente</button>
          </div>
        `;
      }
    },
    unmount: () => {}
  });
}

/**
 * Heurística de cálculo da etapa ativa no funil
 */
function calcularEtapaAtual({ visitas, propostas, documentos, favoritos }) {
  // 5. Conclusão / Chaves: se há proposta ganha/concluída ou docs todos aprovados
  const temPropostaAceita = propostas.some(p => p.status === "aceita" || p.status === "ganho" || p.status === "concluida");
  const temDocsAprovados = documentos.length > 0 && documentos.every(d => d.status === "aprovado");
  if (temPropostaAceita && temDocsAprovados) {
    return 5; // Conclusão / Escritura
  }

  // 4. Documentação: se há documentos enviados/solicitados ou proposta aceita
  if (documentos.length > 0 || temPropostaAceita) {
    return 4; // Documentação
  }

  // 3. Proposta: se possui propostas em aberto ou em análise
  if (propostas.length > 0) {
    return 3; // Proposta
  }

  // 2. Visitas: se já solicitou, agendou ou realizou alguma visita
  if (visitas.length > 0) {
    return 2; // Visitas
  }

  // 1. Descoberta: etapa inicial
  return 1; // Descoberta
}

/**
 * Renderiza todo o conteúdo da Jornada
 */
function renderJornadaContent(container, user, dados) {
  const { etapaAtual, atividades, documentos, propostas, visitas, favoritos } = dados;

  const etapasInfo = [
    { num: 1, nome: "Descoberta", icone: "🔍", desc: "Seleção de imóveis prediletos e buscas desejadas" },
    { num: 2, nome: "Visitas", icone: "📅", desc: "Experiência no local ou tour por videoconferência" },
    { num: 3, nome: "Proposta", icone: "📝", desc: "Negociação de valores e condições de pagamento" },
    { num: 4, nome: "Documentação", icone: "📁", desc: "Análise de certidões, renda e conformidade jurídica" },
    { num: 5, nome: "Conclusão", icone: "🔑", desc: "Assinatura do contrato e entrega das chaves" }
  ];

  // Checklist do processo atual
  const checklistDef = CHECKLISTS[currentProcesso] || CHECKLISTS.compra_financiada;
  const docsNecessarios = checklistDef.documentos || [];
  
  // Mapeia o status de cada item do checklist com os documentos reais enviados pelo cliente
  const checklistStatus = docsNecessarios.map(item => {
    // Procura por documento correspondente
    const correspondente = documentos.find(d => {
      const matchTipo = (d.tipo || "").toLowerCase() === (item.id || "").toLowerCase();
      const matchTitulo = (d.nomeOriginal || d.tipo || "").toLowerCase().includes(item.rotulo.toLowerCase().split(' ')[0]);
      return matchTipo || matchTitulo;
    });

    return {
      ...item,
      docEnviado: correspondente || null,
      status: correspondente ? correspondente.status : "pendente"
    };
  });

  const concluidosCount = checklistStatus.filter(i => i.status === "aprovado" || i.status === "enviado").length;
  const percentual = docsNecessarios.length > 0 ? Math.round((concluidosCount / docsNecessarios.length) * 100) : 0;

  container.innerHTML = `
    <!-- HEADER EXPLICATIVO -->
    <div style="background: linear-gradient(135deg, rgba(10, 46, 42, 0.95), rgba(6, 26, 24, 0.98)); border: 1px solid var(--glass-border); border-radius: 16px; padding: 1.5rem 1.8rem; margin-bottom: 2rem; box-shadow: 0 10px 30px rgba(0,0,0,0.25);">
      <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(212, 175, 122, 0.12); border: 1px solid rgba(212, 175, 122, 0.3); padding: 0.25rem 0.75rem; border-radius: 50px; font-size: 0.75rem; color: var(--gold); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
        <span>🚀</span> Linha de Evolução Imobiliária
      </div>
      <h2 style="font-family: 'Playfair Display', serif; font-size: 1.6rem; color: var(--cream); margin: 0 0 0.35rem 0;">
        Sua Jornada de Conquista
      </h2>
      <p style="color: var(--text-light); font-size: 0.88rem; margin: 0; max-width: 650px;">
        Acompanhe exatamente em que etapa do processo você está, quais providências já foram concluídas e o checklist transparente para o recebimento das chaves.
      </p>
    </div>

    <!-- FUNIL INTERATIVO DE ETAPAS -->
    <div class="panel-card" style="margin-bottom: 2rem; overflow-x: auto;">
      <div class="panel-card-header">
        <div>
          <h3 class="panel-card-title">🧭 Fases do Processo</h3>
          <p class="panel-card-subtitle">Etapa atual destacada em tempo real</p>
        </div>
        <span class="panel-badge panel-badge-ganho" style="font-size: 0.8rem; padding: 0.35rem 0.8rem;">
          Etapa Ativa: ${etapasInfo[etapaAtual - 1]?.nome}
        </span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(5, minmax(170px, 1fr)); gap: 1rem; padding: 0.5rem 0 1rem 0; min-width: 860px;">
        ${etapasInfo.map(etapa => {
          const isPassada = etapa.num < etapaAtual;
          const isAtiva = etapa.num === etapaAtual;
          const isFutura = etapa.num > etapaAtual;

          let bg = "var(--glass-bg)";
          let border = "var(--glass-border)";
          let badgeText = "Aguardando";
          let badgeColor = "var(--text-muted)";

          if (isPassada) {
            bg = "rgba(10, 46, 42, 0.6)";
            border = "rgba(212, 175, 122, 0.4)";
            badgeText = "Concluída ✓";
            badgeColor = "var(--gold)";
          } else if (isAtiva) {
            bg = "rgba(212, 175, 122, 0.12)";
            border = "var(--gold)";
            badgeText = "Em Andamento";
            badgeColor = "var(--gold)";
          }

          return `
            <div style="background: ${bg}; border: 1px solid ${border}; border-radius: 12px; padding: 1.2rem; display: flex; flex-direction: column; justify-content: space-between; position: relative; box-shadow: ${isAtiva ? '0 0 15px rgba(212, 175, 122, 0.2)' : 'none'};">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
                  <span style="font-size: 1.4rem;">${etapa.icone}</span>
                  <span style="font-size: 0.75rem; font-weight: 700; color: ${badgeColor}; text-transform: uppercase;">
                    ${badgeText}
                  </span>
                </div>
                <h4 style="font-family: 'Playfair Display', serif; font-size: 1.05rem; color: ${isAtiva ? 'var(--gold)' : 'var(--cream)'}; margin: 0 0 0.35rem 0;">
                  ${etapa.num}. ${escapeHtml(etapa.nome)}
                </h4>
                <p style="font-size: 0.78rem; color: var(--text-light); margin: 0; line-height: 1.35;">
                  ${escapeHtml(etapa.desc)}
                </p>
              </div>

              <div style="margin-top: 1rem; border-top: 1px solid rgba(245, 241, 232, 0.08); padding-top: 0.6rem; font-size: 0.75rem; color: var(--text-muted);">
                ${isAtiva ? '👉 Sua etapa presente' : (isPassada ? 'Etapa superada' : 'Próxima fase')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- SELEÇÃO DE PROCESSO & CHECKLIST INTERATIVO -->
    <div class="panel-card" style="margin-bottom: 2rem;">
      <div class="panel-card-header" style="flex-wrap: wrap; gap: 1rem;">
        <div>
          <h3 class="panel-card-title" style="display: flex; align-items: center; gap: 0.5rem;">
            <span>📋</span> Checklist de Documentos do Processo
          </h3>
          <p class="panel-card-subtitle">Exigências formais para validar a aquisição com tranquilidade</p>
        </div>

        <!-- SELETOR DE MODALIDADE -->
        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
          <span style="font-size: 0.8rem; color: var(--text-muted);">Processo:</span>
          <select id="selectTipoProcesso" class="panel-input" style="padding: 0.35rem 0.75rem; font-size: 0.82rem;">
            <option value="compra_financiada" ${currentProcesso === 'compra_financiada' ? 'selected' : ''}>Compra Financiada</option>
            <option value="compra_a_vista" ${currentProcesso === 'compra_a_vista' ? 'selected' : ''}>Compra à Vista</option>
            <option value="locacao" ${currentProcesso === 'locacao' ? 'selected' : ''}>Locação Residencial</option>
          </select>
        </div>
      </div>

      <!-- BARRA DE PROGRESSO PERCENTUAL -->
      <div style="background: rgba(10, 46, 42, 0.4); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
          <span style="font-size: 0.88rem; color: var(--cream); font-weight: 600;">
            Progresso Geral da Documentação
          </span>
          <span style="font-size: 1.1rem; color: var(--gold); font-weight: 700; font-family: 'Playfair Display', serif;">
            ${percentual}% Concluído (${concluidosCount}/${docsNecessarios.length})
          </span>
        </div>
        <div style="height: 10px; background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden; border: 1px solid var(--glass-border);">
          <div style="width: ${percentual}%; height: 100%; background: linear-gradient(90deg, var(--gold), #f3e5ab); transition: width 0.4s ease; border-radius: 10px;"></div>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.6rem 0 0 0;">
          ${escapeHtml(checklistDef.descricao || '')}
        </p>
      </div>

      <!-- TABELA / LISTA DO CHECKLIST -->
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${checklistStatus.map(item => {
          const isAprovado = item.status === "aprovado";
          const isEnviado = item.status === "enviado";
          const isReprovado = item.status === "reprovado";
          const isPendente = item.status === "pendente" || item.status === "solicitado";

          let statusBadge = `<span class="panel-badge panel-badge-solicitada">Pendente</span>`;
          if (isAprovado) statusBadge = `<span class="panel-badge panel-badge-ganho">✓ Aprovado</span>`;
          if (isEnviado) statusBadge = `<span class="panel-badge panel-badge-em_analise">Em Revisão</span>`;
          if (isReprovado) statusBadge = `<span class="panel-badge panel-badge-perdido">Ajuste Necessário</span>`;

          return `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.9rem 1.2rem; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 10px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 240px;">
                <span style="font-size: 1.2rem;">${isAprovado ? '✅' : (isEnviado ? '⏳' : (isReprovado ? '⚠️' : '📄'))}</span>
                <div>
                  <div style="color: var(--cream); font-size: 0.92rem; font-weight: 500;">
                    ${escapeHtml(item.rotulo)}
                    ${item.obrigatorio ? '<span style="color:var(--gold); font-size:0.75rem; margin-left:0.3rem;">(Obrigatório)</span>' : '<span style="color:var(--text-muted); font-size:0.75rem; margin-left:0.3rem;">(Opcional)</span>'}
                  </div>
                  ${item.docEnviado ? `
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">
                      Enviado: ${escapeHtml(item.docEnviado.nomeOriginal || item.docEnviado.tipo)} • ${formatData(item.docEnviado.criadoEm)}
                    </div>
                  ` : ''}
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 0.75rem;">
                ${statusBadge}
                ${item.docEnviado?.url ? `
                  <a href="${encodeURI(item.docEnviado.url)}" target="_blank" rel="noopener" class="panel-btn panel-btn-secondary panel-btn-sm" style="font-size: 0.75rem;">
                    Baixar
                  </a>
                ` : `
                  <a href="#documentos" class="panel-btn panel-btn-primary panel-btn-sm" style="font-size: 0.75rem;">
                    Enviar Arquivo
                  </a>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- LINHA DO TEMPO UNIFICADA DE ATIVIDADES -->
    <div class="panel-card" style="margin-bottom: 2rem;">
      <div class="panel-card-header">
        <div>
          <h3 class="panel-card-title" style="display: flex; align-items: center; gap: 0.5rem;">
            <span>📜</span> Histórico Unificado de Acontecimentos
          </h3>
          <p class="panel-card-subtitle">Registro cronológico de todas as suas interações e novidades</p>
        </div>
      </div>

      ${atividades.length === 0 ? `
        <div class="panel-empty-state" style="padding: 2.5rem 1rem;">
          <div class="panel-empty-icon" style="font-size: 2.2rem; margin-bottom: 0.5rem;">🧭</div>
          <h4 class="panel-empty-title">Nenhum evento registrado ainda</h4>
          <p class="panel-empty-desc">
            Assim que você favoritar imóveis, solicitar visitas ou receber mensagens, seu histórico transparente será consolidado aqui.
          </p>
        </div>
      ` : `
        <div style="position: relative; padding-left: 2rem; border-left: 2px solid rgba(212, 175, 122, 0.3); margin-left: 1rem; display: flex; flex-direction: column; gap: 1.5rem;">
          ${atividades.map(ativ => {
            let icone = "📌";
            if (ativ.tipo === "visita") icone = "📅";
            if (ativ.tipo === "proposta") icone = "📝";
            if (ativ.tipo === "documento") icone = "📁";
            if (ativ.tipo === "favorito") icone = "❤️";
            if (ativ.tipo === "mensagem") icone = "💬";

            return `
              <div style="position: relative;">
                <!-- Marcador de nó na linha do tempo -->
                <div style="position: absolute; left: -2.7rem; top: 0.1rem; width: 24px; height: 24px; border-radius: 50%; background: var(--emerald-deep); border: 2px solid var(--gold); display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">
                  ${icone}
                </div>

                <div style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 10px; padding: 1rem 1.25rem;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.3rem;">
                    <h5 style="color: var(--cream); font-size: 0.95rem; margin: 0; font-weight: 600;">
                      ${escapeHtml(ativ.titulo || 'Atividade')}
                    </h5>
                    <span style="font-size: 0.75rem; color: var(--gold); white-space: nowrap;">
                      ${formatData(ativ.criadoEm, true)}
                    </span>
                  </div>
                  ${ativ.descricao ? `
                    <p style="color: var(--text-light); font-size: 0.84rem; margin: 0; line-height: 1.4;">
                      ${escapeHtml(ativ.descricao)}
                    </p>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;

  // Listener para mudança de processo no checklist
  const selectProc = container.querySelector("#selectTipoProcesso");
  selectProc?.addEventListener("change", (e) => {
    currentProcesso = e.target.value;
    renderJornadaContent(container, user, dados);
  });
}

// Inicialização automática do módulo
initDashboardJornada();
