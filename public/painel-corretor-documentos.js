// public/painel-corretor-documentos.js
// Living Canvas - Fila e Gestão de Documentos do Corretor
// View #documentos: fila de triagem (enviados primeiro), visualização, aprovação, reprovação com justificativa obrigatória e solicitação via CHECKLISTS

import { registerView, escapeHtml, formatData, openModal, showToast } from "./panel-shell.js";
import { Documentos, Clientes, CHECKLISTS, Atividades } from "./lc-data.js";

let state = {
  documentos: [],
  filtroStatus: "todos", // "todos" | "enviado" | "pendente" | "aprovado" | "reprovado"
  termoBusca: "",
  clientesMap: new Map(),
  unsubDocs: null,
  carregando: false
};

export function initDocumentosView() {
  registerView("documentos", {
    title: "Documentos",
    async mount(container) {
      container.innerHTML = `
        <div class="panel-section-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
          <div>
            <h2 class="panel-section-title" style="margin:0;">Fila de Documentos</h2>
            <p class="panel-section-subtitle" style="margin:0.25rem 0 0 0;">Triagem, aprovação e solicitação de documentos cadastrais e de compra</p>
          </div>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button id="btnSolicitarDoc" class="panel-btn-primary" style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.6rem 1.1rem; font-size:0.88rem;">
              <span>➕</span> Solicitar Documento
            </button>
          </div>
        </div>

        <!-- STATS BAR -->
        <div class="doc-stats-bar">
          <div class="doc-stat-pill">
            <span>📥 Enviados para Revisão:</span>
            <strong id="statEnviados" style="color:#38bdf8;">0</strong>
          </div>
          <div class="doc-stat-pill">
            <span>⏳ Aguardando Envio:</span>
            <strong id="statPendentes" style="color:#facc15;">0</strong>
          </div>
          <div class="doc-stat-pill">
            <span>✅ Aprovados:</span>
            <strong id="statAprovados" style="color:#4ade80;">0</strong>
          </div>
          <div class="doc-stat-pill">
            <span>❌ Reprovados:</span>
            <strong id="statReprovados" style="color:#fb7185;">0</strong>
          </div>
        </div>

        <!-- BUSCA E FILTROS -->
        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.25rem; align-items:center;">
          <div style="flex:1; min-width:240px; position:relative;">
            <input type="text" id="inputBuscaDoc" class="chat-search-input" placeholder="Buscar por cliente, documento ou processo..." style="padding-left:2.4rem;">
            <span style="position:absolute; left:0.85rem; top:50%; transform:translateY(-50%); opacity:0.6;">🔍</span>
          </div>

          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;" id="filtrosDocBar">
            <button class="panel-filter-chip active" data-status="todos">Todos</button>
            <button class="panel-filter-chip" data-status="enviado">Para Revisão</button>
            <button class="panel-filter-chip" data-status="pendente">Pendentes</button>
            <button class="panel-filter-chip" data-status="aprovado">Aprovados</button>
            <button class="panel-filter-chip" data-status="reprovado">Reprovados</button>
          </div>
        </div>

        <!-- TABELA DA FILA DE DOCUMENTOS -->
        <div class="doc-queue-table-wrapper" id="docQueueTableWrapper">
          <div class="panel-empty-state" style="padding:3rem 1rem;">
            <div class="panel-spinner" style="margin:0 auto 1rem auto; width:36px; height:36px; border:3px solid rgba(212,175,122,0.2); border-top-color:var(--gold); border-radius:50%; animation:spin 1s linear infinite;"></div>
            <p style="color:var(--text-light);">Carregando fila de documentos...</p>
          </div>
        </div>
      `;

      setupEventListeners(container);
      await carregarClientesECadastro(container);
      escutarDocumentos(container);
    },
    unmount() {
      if (typeof state.unsubDocs === "function") {
        state.unsubDocs();
        state.unsubDocs = null;
      }
      state.documentos = [];
    }
  });
}

function setupEventListeners(container) {
  const inputBusca = container.querySelector("#inputBuscaDoc");
  if (inputBusca) {
    inputBusca.addEventListener("input", (e) => {
      state.termoBusca = e.target.value.toLowerCase().trim();
      renderizarTabela(container);
    });
  }

  const filtroChips = container.querySelectorAll("#filtrosDocBar .panel-filter-chip");
  filtroChips.forEach(chip => {
    chip.addEventListener("click", () => {
      filtroChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.filtroStatus = chip.dataset.status;
      renderizarTabela(container);
    });
  });

  const btnSolicitar = container.querySelector("#btnSolicitarDoc");
  if (btnSolicitar) {
    btnSolicitar.addEventListener("click", () => abrirModalSolicitarDocumento());
  }
}

async function carregarClientesECadastro(container) {
  try {
    const lista = await Clientes.listarClientes();
    state.clientesMap = new Map();
    lista.forEach(c => {
      state.clientesMap.set(c.id, c);
    });
  } catch (err) {
    console.warn("Aviso ao carregar mapa de clientes:", err.message);
  }
}

function escutarDocumentos(container) {
  try {
    state.unsubDocs = Documentos.listar({}, (docs) => {
      // Ordenação inteligente: 'enviado' primeiro (fila de revisão), depois por data de envio/criação decrescente
      docs.sort((a, b) => {
        if (a.status === "enviado" && b.status !== "enviado") return -1;
        if (b.status === "enviado" && a.status !== "enviado") return 1;

        const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
        const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
        return timeB - timeA;
      });

      state.documentos = docs;
      atualizarContadoresStats(container, docs);
      renderizarTabela(container);
    });
  } catch (err) {
    console.error("Erro ao iniciar escuta de documentos:", err);
  }
}

function atualizarContadoresStats(container, docs) {
  const enviados = docs.filter(d => d.status === "enviado").length;
  const pendentes = docs.filter(d => d.status === "pendente").length;
  const aprovados = docs.filter(d => d.status === "aprovado").length;
  const reprovados = docs.filter(d => d.status === "reprovado").length;

  const setVal = (id, val) => {
    const el = container.querySelector(id);
    if (el) el.textContent = val;
  };

  setVal("#statEnviados", enviados);
  setVal("#statPendentes", pendentes);
  setVal("#statAprovados", aprovados);
  setVal("#statReprovados", reprovados);
}

function renderizarTabela(container) {
  const wrapper = container.querySelector("#docQueueTableWrapper");
  if (!wrapper) return;

  let filtrados = state.documentos;

  if (state.filtroStatus !== "todos") {
    filtrados = filtrados.filter(d => d.status === state.filtroStatus);
  }

  if (state.termoBusca) {
    filtrados = filtrados.filter(d => {
      const clienteNome = (d.clienteNome || "").toLowerCase();
      const tipo = (d.tipo || "").toLowerCase();
      const nomeOriginal = (d.nomeOriginal || "").toLowerCase();
      const processo = (d.processo || "").toLowerCase();
      return clienteNome.includes(state.termoBusca) || tipo.includes(state.termoBusca) || nomeOriginal.includes(state.termoBusca) || processo.includes(state.termoBusca);
    });
  }

  if (filtrados.length === 0) {
    wrapper.innerHTML = `
      <div class="panel-empty-state" style="padding:3rem 1rem;">
        <div style="font-size:2.5rem; margin-bottom:0.75rem;">📁</div>
        <h4 style="color:var(--cream); margin-bottom:0.4rem;">Nenhum documento encontrado</h4>
        <p style="color:var(--text-light); max-width:420px; margin:0 auto;">
          Nenhum documento coincide com os filtros atuais da fila de triagem.
        </p>
      </div>
    `;
    return;
  }

  let html = `
    <table class="doc-table">
      <thead>
        <tr>
          <th>Documento / Tipo</th>
          <th>Cliente</th>
          <th>Processo</th>
          <th>Data</th>
          <th>Status</th>
          <th style="text-align:right;">Ações</th>
        </tr>
      </thead>
      <tbody>
  `;

  filtrados.forEach(docItem => {
    const status = docItem.status || "pendente";
    const dataStr = docItem.criadoEm ? formatData(docItem.criadoEm) : "—";
    const nomeExibicao = docItem.nomeOriginal || docItem.tipo || "Documento";

    html += `
      <tr>
        <td>
          <div style="font-weight:600; color:var(--cream);">${escapeHtml(nomeExibicao)}</div>
          <div style="font-size:0.75rem; color:var(--text-light);">${escapeHtml(docItem.tipo || "")}</div>
          ${docItem.motivoReprovacao ? `
            <div style="font-size:0.72rem; color:#fb7185; margin-top:0.25rem;">
              <strong>Motivo recusa:</strong> ${escapeHtml(docItem.motivoReprovacao)}
            </div>
          ` : ""}
        </td>
        <td>
          <div style="font-weight:500;">${escapeHtml(docItem.clienteNome || "Cliente")}</div>
        </td>
        <td>
          <span style="font-size:0.78rem; color:var(--gold);">${escapeHtml(docItem.processo || "Geral")}</span>
        </td>
        <td style="font-size:0.8rem; color:var(--text-light);">
          ${escapeHtml(dataStr)}
        </td>
        <td>
          <span class="status-badge-doc ${escapeHtml(status)}">
            ${escapeHtml(status)}
          </span>
        </td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:0.4rem; justify-content:flex-end;">
            ${(docItem.url || docItem.storagePath) ? `
              <button class="panel-btn-ghost btn-abrir-doc" data-id="${escapeHtml(docItem.id)}" title="Visualizar / Baixar Documento" style="padding:0.35rem 0.65rem; font-size:0.78rem;">
                👁️ Abrir
              </button>
            ` : ""}

            ${status === "enviado" ? `
              <button class="panel-btn-primary btn-aprovar-doc" data-id="${escapeHtml(docItem.id)}" title="Aprovar Documento" style="padding:0.35rem 0.65rem; font-size:0.78rem; background:#16a34a; border-color:#22c55e;">
                ✅ Aprovar
              </button>
              <button class="panel-btn-ghost btn-reprovar-doc" data-id="${escapeHtml(docItem.id)}" title="Reprovar Documento" style="padding:0.35rem 0.65rem; font-size:0.78rem; color:#f87171; border-color:rgba(248,113,113,0.3);">
                ❌ Reprovar
              </button>
            ` : ""}
          </div>
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  wrapper.innerHTML = html;

  // Event Listeners das Ações da Tabela
  wrapper.querySelectorAll(".btn-abrir-doc").forEach(btn => {
    btn.addEventListener("click", () => abrirDocumento(btn.dataset.id));
  });

  wrapper.querySelectorAll(".btn-aprovar-doc").forEach(btn => {
    btn.addEventListener("click", () => aprovarDocumento(btn.dataset.id));
  });

  wrapper.querySelectorAll(".btn-reprovar-doc").forEach(btn => {
    btn.addEventListener("click", () => abrirModalReprovar(btn.dataset.id));
  });
}

async function abrirDocumento(docId) {
  try {
    showToast("Carregando arquivo do documento...", "info");
    const url = await Documentos.urlDownload(docId);
    if (url) {
      // Abre o documento em nova aba
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      showToast("URL de visualização não encontrada.", "erro");
    }
  } catch (err) {
    showToast("Erro ao abrir documento: " + err.message, "erro");
  }
}

async function aprovarDocumento(docId) {
  try {
    await Documentos.aprovar(docId);
    showToast("Documento aprovado com sucesso!", "sucesso");
  } catch (err) {
    showToast("Erro ao aprovar documento: " + err.message, "erro");
  }
}

function abrirModalReprovar(docId) {
  openModal({
    title: "Reprovar Documento",
    bodyHtml: `
      <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:1rem;">
        Informe o motivo da reprovação documental. Esta justificativa é obrigatória e ficará visível ao cliente para que ele faça o reenvio correto.
      </p>
      <div>
        <label style="display:block; font-size:0.82rem; color:var(--cream); margin-bottom:0.35rem;">
          Motivo da Reprovação (obrigatório) *
        </label>
        <textarea id="modalMotivoReprovacao" class="chat-search-input" rows="4" placeholder="Ex: Documento ilegível, certidão vencida ou faltam páginas..." style="resize:vertical;"></textarea>
      </div>
    `,
    confirmText: "Reprovar Documento",
    async onConfirm() {
      const motivoInput = document.getElementById("modalMotivoReprovacao");
      const motivo = motivoInput ? motivoInput.value.trim() : "";

      if (!motivo) {
        showToast("O motivo da reprovação é estritamente obrigatório.", "aviso");
        return false;
      }

      try {
        await Documentos.reprovar(docId, motivo);
        showToast("Documento reprovado e cliente notificado.", "sucesso");
        return true;
      } catch (err) {
        showToast("Erro ao reprovar: " + err.message, "erro");
        return false;
      }
    }
  });
}

function abrirModalSolicitarDocumento() {
  const clientesArray = Array.from(state.clientesMap.values());
  const optionsClientes = clientesArray.map(c => `
    <option value="${escapeHtml(c.id)}">${escapeHtml(c.nome || c.displayName || c.email)}</option>
  `).join("");

  openModal({
    title: "Solicitar Novo Documento ao Cliente",
    bodyHtml: `
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div>
          <label style="display:block; font-size:0.82rem; color:var(--cream); margin-bottom:0.35rem;">Selecione o Cliente *</label>
          <select id="modalSolicitarClienteId" class="chat-search-input" style="background:#0a2e2a;">
            <option value="">Selecione um cliente cadastrado...</option>
            ${optionsClientes}
          </select>
        </div>

        <div>
          <label style="display:block; font-size:0.82rem; color:var(--cream); margin-bottom:0.35rem;">Processo / Finalidade *</label>
          <select id="modalSolicitarProcesso" class="chat-search-input" style="background:#0a2e2a;">
            <option value="cadastro">Cadastro Inicial</option>
            <option value="proposta">Análise de Proposta</option>
            <option value="financiamento">Financiamento Imobiliário</option>
            <option value="locacao">Locação</option>
          </select>
        </div>

        <div>
          <label style="display:block; font-size:0.82rem; color:var(--cream); margin-bottom:0.35rem;">Tipo do Documento *</label>
          <select id="modalSolicitarTipo" class="chat-search-input" style="background:#0a2e2a;">
            <option value="RG / CNH">RG / CNH (Documento de Identidade)</option>
            <option value="CPF">CPF</option>
            <option value="Comprovante de Renda">Comprovante de Renda (Holerite / IRPF)</option>
            <option value="Comprovante de Residência">Comprovante de Residência Atualizado</option>
            <option value="Certidão de Estado Civil">Certidão de Estado Civil (Nascimento/Casamento)</option>
            <option value="outro">Outro (especificar abaixo)</option>
          </select>
        </div>

        <div id="wrapperOutroTipo" style="display:none;">
          <label style="display:block; font-size:0.82rem; color:var(--cream); margin-bottom:0.35rem;">Nome do Documento Personalizado *</label>
          <input type="text" id="modalSolicitarOutroTipo" class="chat-search-input" placeholder="ex: Procuração, Carta de Crédito...">
        </div>
      </div>
    `,
    confirmText: "Enviar Solicitação",
    async onConfirm() {
      const clienteId = document.getElementById("modalSolicitarClienteId")?.value;
      const processo = document.getElementById("modalSolicitarProcesso")?.value;
      let tipo = document.getElementById("modalSolicitarTipo")?.value;
      const outroTipo = document.getElementById("modalSolicitarOutroTipo")?.value.trim();

      if (!clienteId) {
        showToast("Selecione um cliente para solicitar o documento.", "aviso");
        return false;
      }

      if (tipo === "outro") {
        if (!outroTipo) {
          showToast("Informe o nome do documento personalizado.", "aviso");
          return false;
        }
        tipo = outroTipo;
      }

      const cliente = state.clientesMap.get(clienteId);
      const clienteNome = cliente ? (cliente.nome || cliente.displayName || "Cliente") : "Cliente";

      try {
        await Documentos.solicitar(clienteId, processo, tipo, { clienteNome });
        showToast(`Documento "${tipo}" solicitado com sucesso!`, "sucesso");
        return true;
      } catch (err) {
        showToast("Erro ao solicitar documento: " + err.message, "erro");
        return false;
      }
    }
  });

  // Habilita campo personalizado se 'outro' for selecionado
  setTimeout(() => {
    const selectTipo = document.getElementById("modalSolicitarTipo");
    const wrapperOutro = document.getElementById("wrapperOutroTipo");
    if (selectTipo && wrapperOutro) {
      selectTipo.addEventListener("change", () => {
        wrapperOutro.style.display = selectTipo.value === "outro" ? "block" : "none";
      });
    }
  }, 100);
}
