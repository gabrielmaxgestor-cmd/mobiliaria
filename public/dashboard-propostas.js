/**
 * Living Canvas - Dashboard do Cliente: Propostas Formais (P12)
 * 
 * Gerencia as propostas de compra e locação enviadas pelo cliente:
 * - Listagem detalhada com dados do imóvel (foto, título, preço anunciado)
 * - Valor proposto inicial e valor atual em negociação
 * - Histórico completo de rodadas de contrapropostas
 * - Ações interativas para contrapropostas: Aceitar, Recusar, Nova Contraproposta
 * - Cancelamento de propostas abertas (enviada, em_analise, contraproposta)
 * - Estado vazio elegante com orientação de que novas propostas nascem no catálogo
 */

import {
  registerView,
  escapeHtml,
  formatMoeda,
  formatData,
  showToast
} from "/panel-shell.js";

import {
  Propostas,
  Atividades
} from "/lc-data.js";

import LivingCanvasAuth from "/auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

const db = LivingCanvasAuth.db;

// Cache em memória de dados do imóvel para enriquecimento dos cards
const imoveisCache = new Map();

async function obterDadosImovel(imovelId) {
  if (!imovelId) return null;
  if (imoveisCache.has(imovelId)) {
    return imoveisCache.get(imovelId);
  }

  try {
    const docSnap = await getDoc(doc(db, "imoveis", imovelId));
    if (docSnap.exists()) {
      const data = { id: docSnap.id, ...docSnap.data() };
      imoveisCache.set(imovelId, data);
      return data;
    }
  } catch (err) {
    console.warn("Aviso ao buscar dados do imóvel para a proposta:", err.message);
  }
  return null;
}

function renderStatusBadge(status) {
  const map = {
    enviada: { label: "Enviada", bg: "rgba(59, 130, 246, 0.15)", color: "#93c5fd", border: "rgba(59, 130, 246, 0.3)" },
    em_analise: { label: "Em Análise", bg: "rgba(212, 175, 122, 0.15)", color: "var(--gold, #d4af7a)", border: "rgba(212, 175, 122, 0.3)" },
    contraproposta: { label: "Contraproposta Recebida", bg: "rgba(245, 158, 11, 0.15)", color: "#fcd34d", border: "rgba(245, 158, 11, 0.35)" },
    aceita: { label: "Proposta Aceita", bg: "rgba(16, 185, 129, 0.15)", color: "#6ee7b7", border: "rgba(16, 185, 129, 0.35)" },
    recusada: { label: "Não Aceita", bg: "rgba(239, 68, 68, 0.15)", color: "#fca5a5", border: "rgba(239, 68, 68, 0.3)" },
    cancelada: { label: "Cancelada", bg: "rgba(107, 114, 128, 0.15)", color: "#d1d5db", border: "rgba(107, 114, 128, 0.3)" }
  };

  const info = map[status] || { label: status || "Pendente", bg: "rgba(255, 255, 255, 0.08)", color: "#fff", border: "transparent" };
  return `
    <span style="display:inline-flex; align-items:center; gap:0.35rem; padding:0.25rem 0.65rem; border-radius:9999px; font-size:0.75rem; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; background:${info.bg}; color:${info.color}; border:1px solid ${info.border};">
      <span style="width:6px; height:6px; border-radius:50%; background:${info.color};"></span>
      ${escapeHtml(info.label)}
    </span>
  `;
}

function renderHistoricoRodadas(rodadas = [], valorInicial = 0) {
  if (!Array.isArray(rodadas) || rodadas.length === 0) {
    return `<p style="font-size:0.85rem; color:var(--text-muted); margin:0.5rem 0;">Nenhuma rodada adicional de negociação registrada.</p>`;
  }

  return `
    <div style="margin-top:1rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,0.07);">
      <h5 style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--gold, #d4af7a); margin-bottom:0.75rem;">
        📜 Histórico de Rodadas da Negociação (${rodadas.length})
      </h5>
      <div style="display:flex; flex-direction:column; gap:0.6rem;">
        ${rodadas.map((r, idx) => {
          const isCliente = r.autor === "cliente";
          const autorNome = isCliente ? "Você (Proponente)" : "Corretor / Proprietário";
          const autorBadgeBg = isCliente ? "rgba(10, 46, 42, 0.8)" : "rgba(212, 175, 122, 0.18)";
          const autorBadgeColor = isCliente ? "var(--gold, #d4af7a)" : "#fff";
          const dataHora = r.em ? new Date(r.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Data não informada";

          return `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem; padding:0.65rem 0.85rem; border-radius:8px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05);">
              <div>
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                  <span style="font-size:0.7rem; font-weight:600; padding:0.15rem 0.45rem; border-radius:4px; background:${autorBadgeBg}; color:${autorBadgeColor};">
                    ${escapeHtml(autorNome)}
                  </span>
                  <span style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(dataHora)}</span>
                </div>
                ${r.condicoes ? `<p style="font-size:0.82rem; color:var(--cream, #f5f1e8); margin:0.25rem 0 0 0;">${escapeHtml(r.condicoes)}</p>` : ""}
              </div>
              <div style="text-align:right;">
                <span style="font-size:0.7rem; color:var(--text-muted); display:block;">Valor Ofertado</span>
                <strong style="color:var(--gold, #d4af7a); font-size:0.95rem;">${formatMoeda(r.valor)}</strong>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

// Renderiza a view principal de propostas
async function carregarPropostas(container, user) {
  if (!container || !user) return;

  container.innerHTML = `
    <div style="padding: 2rem 0; text-align: center;">
      <div class="panel-skeleton" style="height: 140px; margin-bottom: 1rem; border-radius: 12px;"></div>
      <div class="panel-skeleton" style="height: 140px; border-radius: 12px;"></div>
    </div>
  `;

  try {
    const propostas = await Propostas.listarDoCliente(user.uid);

    if (!propostas || propostas.length === 0) {
      container.innerHTML = `
        <div class="panel-empty-state" style="padding: 3rem 1.5rem; text-align:center;">
          <div class="panel-empty-icon" style="font-size:3rem; margin-bottom:1rem;">📝</div>
          <h4 class="panel-empty-title" style="font-size:1.25rem; font-family:'Playfair Display', serif; color:var(--cream, #f5f1e8); margin-bottom:0.5rem;">
            Nenhuma proposta formal enviada
          </h4>
          <p class="panel-empty-desc" style="max-width:520px; margin:0 auto 1.5rem auto; color:var(--text-light, #a0aec0); font-size:0.9rem; line-height:1.6;">
            Você ainda não enviou propostas de compra ou locação. Para formalizar uma proposta com valores e prazos personalizados, escolha um imóvel no catálogo e clique no botão <strong>Fazer Proposta</strong>.
          </p>
          <a href="imoveis.html" class="panel-btn panel-btn-primary" style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.75rem 1.5rem; text-decoration:none;">
            <span>Explorar Catálogo de Imóveis</span>
            <span>&rarr;</span>
          </a>
        </div>
      `;
      return;
    }

    // Carrega dados complementares dos imóveis
    const imoveisPromessas = propostas.map(p => obterDadosImovel(p.imovelId));
    const imoveisData = await Promise.all(imoveisPromessas);

    const propostasCardsHtml = propostas.map((p, index) => {
      const imovel = imoveisData[index] || {};
      const fotoCapa = imovel.fotos?.[0] || p.imovelFoto || "assets/images/placeholder-property.jpg";
      const tituloImovel = imovel.titulo || p.imovelTitulo || `Imóvel #${p.imovelId ? p.imovelId.slice(0, 8) : "Sem ID"}`;
      const precoOriginal = imovel.preco ? formatMoeda(imovel.preco) : (p.imovelPreco ? formatMoeda(p.imovelPreco) : "Sob Consulta");
      const localizacao = [imovel.bairro, imovel.cidade].filter(Boolean).join(", ") || "Localização privilegiada";
      const valorOfertado = p.valor ? formatMoeda(p.valor) : "R$ 0,00";
      const valorAtualNegociacao = p.valorAtual ? formatMoeda(p.valorAtual) : valorOfertado;
      const temContraproposta = p.status === "contraproposta";
      const podeCancelar = ["enviada", "em_analise", "contraproposta"].includes(p.status);

      return `
        <div class="panel-card" style="margin-bottom:1.5rem; padding:1.25rem; border:1px solid rgba(255,255,255,0.08); border-radius:12px; background:rgba(255,255,255,0.02); transition:transform 0.2s, border-color 0.2s;" id="card-proposta-${p.id}">
          <!-- Cabeçalho do Card: Imóvel + Status -->
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem;">
            <div style="display:flex; gap:1rem; align-items:center;">
              <img 
                src="${escapeHtml(fotoCapa)}" 
                alt="${escapeHtml(tituloImovel)}" 
                style="width:80px; height:80px; border-radius:10px; object-fit:cover; border:1px solid rgba(212,175,122,0.25);"
                onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'80\\' height=\\'80\\' viewBox=\\'0 0 80 80\\'%3E%3Crect width=\\'80\\' height=\\'80\\' fill=\\'%230a2e2a\\'/ %3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%23d4af7a\\' font-family=\\'sans-serif\\' font-size=\\'12\\'%3EImóvel%3C/text%3E%3C/svg%3E';"
              />
              <div>
                <a href="imovel.html?id=${encodeURIComponent(p.imovelId || '')}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:var(--cream, #f5f1e8); font-weight:600; font-size:1.05rem; display:inline-block; margin-bottom:0.25rem;">
                  ${escapeHtml(tituloImovel)} ↗
                </a>
                <p style="font-size:0.8rem; color:var(--text-muted, #718096); margin:0 0 0.25rem 0;">
                  📍 ${escapeHtml(localizacao)}
                </p>
                <div style="font-size:0.8rem; color:var(--text-muted);">
                  Anunciado por: <span style="color:var(--text-light);">${precoOriginal}</span>
                </div>
              </div>
            </div>

            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.35rem;">
              ${renderStatusBadge(p.status)}
              <span style="font-size:0.75rem; color:var(--text-muted);">
                Criada em ${formatData(p.criadoEm)}
              </span>
            </div>
          </div>

          <!-- Métricas da Proposta em Grid -->
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:0.75rem; background:rgba(0,0,0,0.2); padding:0.85rem; border-radius:8px; border:1px solid rgba(255,255,255,0.04); margin-bottom:1rem;">
            <div>
              <span style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; display:block;">Valor Inicial Proposto</span>
              <strong style="color:var(--cream, #f5f1e8); font-size:1rem;">${valorOfertado}</strong>
            </div>
            <div>
              <span style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; display:block;">Valor em Negociação</span>
              <strong style="color:var(--gold, #d4af7a); font-size:1.05rem;">${valorAtualNegociacao}</strong>
            </div>
            <div>
              <span style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; display:block;">Forma de Pagamento</span>
              <span style="color:var(--text-light); font-size:0.88rem; font-weight:500;">${escapeHtml(p.formaPagamento || "À vista")}</span>
            </div>
            <div>
              <span style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; display:block;">Validade da Oferta</span>
              <span style="color:var(--text-light); font-size:0.88rem;">${escapeHtml(p.validade || "Até análise do proprietário")}</span>
            </div>
          </div>

          <!-- Observações ou condições gerais -->
          ${p.condicoes ? `
            <div style="margin-bottom:1rem; padding:0.65rem 0.85rem; border-radius:6px; background:rgba(212,175,122,0.05); border-left:3px solid var(--gold, #d4af7a);">
              <span style="font-size:0.72rem; color:var(--gold); font-weight:600; text-transform:uppercase; display:block; margin-bottom:0.2rem;">Suas Condições Iniciais:</span>
              <p style="font-size:0.85rem; color:var(--cream, #f5f1e8); margin:0;">${escapeHtml(p.condicoes)}</p>
            </div>
          ` : ""}

          <!-- Motivo de recusa se houver -->
          ${p.motivoRecusa ? `
            <div style="margin-bottom:1rem; padding:0.65rem 0.85rem; border-radius:6px; background:rgba(239,68,68,0.08); border-left:3px solid #ef4444;">
              <span style="font-size:0.72rem; color:#fca5a5; font-weight:600; text-transform:uppercase; display:block; margin-bottom:0.2rem;">Motivo Informado:</span>
              <p style="font-size:0.85rem; color:#fee2e2; margin:0;">${escapeHtml(p.motivoRecusa)}</p>
            </div>
          ` : ""}

          <!-- Painel Interativo de Contraproposta Recebida -->
          ${temContraproposta ? `
            <div style="padding:1rem; border-radius:10px; background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.25); margin-bottom:1rem;" id="box-contraproposta-${p.id}">
              <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
                <span style="font-size:1.2rem;">⚖️</span>
                <strong style="color:#fcd34d; font-size:0.95rem;">O proprietário enviou uma contraproposta!</strong>
              </div>
              <p style="font-size:0.85rem; color:var(--cream, #f5f1e8); margin:0 0 0.85rem 0; line-height:1.5;">
                Novo valor sugerido: <strong style="color:var(--gold, #d4af7a); font-size:1.05rem;">${valorAtualNegociacao}</strong>. Você pode aceitar os novos termos para fechar o negócio, recusar ou enviar uma nova contraoferta.
              </p>
              
              <!-- Ações da contraproposta -->
              <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;" id="botoes-contra-${p.id}">
                <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" style="background:#10b981; border-color:#059669; color:#fff;" onclick="window.responderContrapropostaCliente('${p.id}', 'aceitar')">
                  ✓ Aceitar Contraproposta (${valorAtualNegociacao})
                </button>
                <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="window.abrirModalNovaContraproposta('${p.id}', '${p.valorAtual || p.valor || 0}')">
                  🔄 Enviar Nova Contraoferta
                </button>
                <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" style="color:#fca5a5;" onclick="window.responderContrapropostaCliente('${p.id}', 'recusar')">
                  ✕ Recusar
                </button>
              </div>

              <!-- Formulário inline recolhível para nova contraoferta -->
              <div id="form-nova-contra-${p.id}" style="display:none; margin-top:1rem; padding:0.85rem; border-radius:8px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08);">
                <h6 style="color:var(--gold); margin-bottom:0.5rem; font-size:0.85rem;">Sua Nova Contraproposta</h6>
                <div style="display:grid; grid-template-columns: 1fr 2fr; gap:0.75rem; margin-bottom:0.75rem;">
                  <div>
                    <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:0.25rem;">Novo Valor (R$)*</label>
                    <input type="number" step="1000" id="input-novo-valor-${p.id}" class="panel-input" placeholder="Ex: 850000" style="width:100%; font-size:0.85rem;" />
                  </div>
                  <div>
                    <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:0.25rem;">Observações / Condições</label>
                    <input type="text" id="input-novas-cond-${p.id}" class="panel-input" placeholder="Ex: Entrada à vista + saldo financiado" style="width:100%; font-size:0.85rem;" />
                  </div>
                </div>
                <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
                  <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="document.getElementById('form-nova-contra-${p.id}').style.display='none'">
                    Cancelar
                  </button>
                  <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" onclick="window.enviarNovaContrapropostaCliente('${p.id}')">
                    Confirmar e Enviar
                  </button>
                </div>
              </div>
            </div>
          ` : ""}

          <!-- Histórico de Rodadas -->
          ${renderHistoricoRodadas(p.rodadas, p.valor)}

          <!-- Rodapé do Card com Ações Gerais -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-top:1.25rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,0.06);">
            <div style="display:flex; gap:0.5rem; align-items:center;">
              <a href="imovel.html?id=${encodeURIComponent(p.imovelId || '')}" target="_blank" rel="noopener noreferrer" class="panel-btn panel-btn-secondary panel-btn-sm" style="text-decoration:none;">
                Visualizar Imóvel Completo
              </a>
              <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="window.location.hash='#mensagens'">
                💬 Falar com Corretor
              </button>
            </div>

            <div>
              ${podeCancelar ? `
                <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" style="color:#ef4444; border-color:rgba(239,68,68,0.25);" onclick="window.cancelarPropostaCliente('${p.id}')">
                  Cancelar Proposta
                </button>
              ` : `
                <span style="font-size:0.78rem; color:var(--text-muted);">
                  Processo ${p.status === "aceita" ? "finalizado com sucesso" : "encerrado"}
                </span>
              `}
            </div>
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = `
      <div style="margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; padding-bottom:1rem; border-bottom:1px solid rgba(255,255,255,0.07);">
        <div>
          <span style="font-size:0.85rem; color:var(--text-light);">
            Você possui <strong>${propostas.length}</strong> ${propostas.length === 1 ? "proposta registrada" : "propostas registradas"}.
          </span>
          <p style="font-size:0.78rem; color:var(--text-muted); margin:0.2rem 0 0 0;">
            Novas propostas formais são originadas diretamente a partir do catálogo de imóveis.
          </p>
        </div>
        <a href="imoveis.html" class="panel-btn panel-btn-primary panel-btn-sm" style="text-decoration:none;">
          + Fazer Nova Proposta em um Imóvel
        </a>
      </div>
      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        ${propostasCardsHtml}
      </div>
    `;

  } catch (err) {
    console.error("Erro ao carregar propostas do cliente:", err);
    container.innerHTML = `
      <div class="panel-empty-state" style="padding:2rem; text-align:center;">
        <p style="color:var(--danger, #ef4444); margin-bottom:1rem;">Falha ao carregar propostas: ${escapeHtml(err.message)}</p>
        <button class="panel-btn panel-btn-secondary panel-btn-sm" onclick="window.recarregarPropostasCliente()">
          Tentar Novamente
        </button>
      </div>
    `;
  }
}

// Handlers globais para ações interativas do cliente
window.abrirModalNovaContraproposta = function(propostaId, valorAtual) {
  const form = document.getElementById(`form-nova-contra-${propostaId}`);
  const inputValor = document.getElementById(`input-novo-valor-${propostaId}`);
  if (form) {
    form.style.display = form.style.display === "none" ? "block" : "none";
    if (inputValor && valorAtual) {
      inputValor.value = Number(valorAtual) || "";
      inputValor.focus();
    }
  }
};

window.responderContrapropostaCliente = async function(propostaId, acao) {
  const confirmMsg = acao === "aceitar"
    ? "Deseja realmente aceitar os termos da contraproposta recebida? O negócio avançará para a fase de documentação e contrato."
    : "Deseja recusar a contraproposta recebida?";

  if (!window.confirm(confirmMsg)) return;

  try {
    showToast(acao === "aceitar" ? "Aceitando contraproposta..." : "Registrando resposta...", "info");
    await Propostas.responder(propostaId, acao, { autor: "cliente" });
    showToast(acao === "aceitar" ? "Proposta aceita com sucesso!" : "Contraproposta recusada.", "success");
    
    // Atualiza a view
    const container = document.getElementById("clientPropostasContainer");
    const user = LivingCanvasAuth.auth.currentUser;
    if (container && user) {
      carregarPropostas(container, user);
    }
  } catch (err) {
    console.error("Erro ao responder contraproposta:", err);
    showToast(`Erro: ${err.message}`, "error");
  }
};

window.enviarNovaContrapropostaCliente = async function(propostaId) {
  const inputValor = document.getElementById(`input-novo-valor-${propostaId}`);
  const inputCond = document.getElementById(`input-novas-cond-${propostaId}`);
  
  const novoValor = Number(inputValor?.value);
  if (!novoValor || novoValor <= 0) {
    showToast("Informe um valor numérico válido para a contraproposta.", "warning");
    return;
  }

  const condicoes = inputCond?.value?.trim() || "";

  try {
    showToast("Enviando contraproposta...", "info");
    await Propostas.responder(propostaId, "contraproposta", {
      autor: "cliente",
      valor: novoValor,
      condicoes
    });
    showToast("Sua contraproposta foi enviada com sucesso!", "success");

    const container = document.getElementById("clientPropostasContainer");
    const user = LivingCanvasAuth.auth.currentUser;
    if (container && user) {
      carregarPropostas(container, user);
    }
  } catch (err) {
    console.error("Erro ao enviar contraproposta:", err);
    showToast(`Erro ao enviar: ${err.message}`, "error");
  }
};

window.cancelarPropostaCliente = async function(propostaId) {
  if (!window.confirm("Tem certeza que deseja cancelar esta proposta? Essa ação é definitiva e encerrará a negociação.")) {
    return;
  }

  try {
    showToast("Cancelando proposta...", "info");
    await Propostas.responder(propostaId, "cancelar", { autor: "cliente" });
    showToast("Proposta cancelada com sucesso.", "success");

    const container = document.getElementById("clientPropostasContainer");
    const user = LivingCanvasAuth.auth.currentUser;
    if (container && user) {
      carregarPropostas(container, user);
    }
  } catch (err) {
    console.error("Erro ao cancelar proposta:", err);
    showToast(`Erro ao cancelar: ${err.message}`, "error");
  }
};

window.recarregarPropostasCliente = function() {
  const container = document.getElementById("clientPropostasContainer");
  const user = LivingCanvasAuth.auth.currentUser;
  if (container && user) {
    carregarPropostas(container, user);
  }
};

// Registra a View 'propostas' no shell
registerView("propostas", {
  titulo: "Minhas Propostas Formais",
  mount: async (section, user) => {
    const container = document.getElementById("clientPropostasContainer") || section;
    await carregarPropostas(container, user);
  },
  unmount: () => {
    // Limpeza de estado se necessário
  }
});
