// public/painel-corretor-clientes.js
// Living Canvas - Carteira de Clientes do Corretor
// View #clientes: listagem unificada, busca, filtros e ficha em drawer

import { registerView, escapeHtml, formatData, formatMoeda, openModal, showToast } from "./panel-shell.js";
import { Clientes, Conversas, Visitas, Propostas, Documentos, Atividades, getDb, getAuth } from "./lc-data.js";
import { collection, query, getDocs } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

let state = {
  clientes: [],
  filtroAtual: "todos", // "todos" | "visita" | "proposta" | "docs" | "inativos"
  termoBusca: "",
  clienteSelecionado: null,
  carregando: false
};

export function initClientesView() {
  registerView("clientes", {
    title: "Carteira de Clientes",
    async mount(container) {
      container.innerHTML = `
        <div class="panel-section-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
          <div>
            <h2 class="panel-section-title" style="margin:0;">Carteira de Clientes</h2>
            <p class="panel-section-subtitle" style="margin:0.25rem 0 0 0;">Gestão unificada de clientes cadastrados e leads em atendimento</p>
          </div>
          <button id="btnAtualizarClientes" class="panel-btn-primary" style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.6rem 1.1rem; font-size:0.88rem;">
            <span>🔄</span> Atualizar Carteira
          </button>
        </div>

        <!-- BARRA DE BUSCA E FILTROS -->
        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.5rem; align-items:center;">
          <div style="flex:1; min-width:260px; position:relative;">
            <input type="text" id="inputBuscaCliente" class="chat-search-input" placeholder="Buscar por nome, e-mail ou telefone..." style="padding-left:2.4rem;">
            <span style="position:absolute; left:0.85rem; top:50%; transform:translateY(-50%); opacity:0.6;">🔍</span>
          </div>

          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;" id="filtrosClienteBar">
            <button class="panel-filter-chip active" data-filtro="todos">Todos (<span id="countTodos">0</span>)</button>
            <button class="panel-filter-chip" data-filtro="visita">Com Visita (<span id="countVisita">0</span>)</button>
            <button class="panel-filter-chip" data-filtro="proposta">Com Proposta (<span id="countProposta">0</span>)</button>
            <button class="panel-filter-chip" data-filtro="docs">Docs Pendentes (<span id="countDocs">0</span>)</button>
            <button class="panel-filter-chip" data-filtro="inativos">Sem contato +30d (<span id="countInativos">0</span>)</button>
          </div>
        </div>

        <!-- GRID DE CLIENTES -->
        <div id="clientesGridContainer">
          <div class="panel-empty-state" style="padding:3rem 1rem;">
            <div class="panel-spinner" style="margin:0 auto 1rem auto; width:36px; height:36px; border:3px solid rgba(212,175,122,0.2); border-top-color:var(--gold); border-radius:50%; animation:spin 1s linear infinite;"></div>
            <p style="color:var(--text-light);">Carregando carteira de clientes...</p>
          </div>
        </div>

        <!-- BACKDROP E DRAWER DE DETALHES -->
        <div id="clientDrawerBackdrop" class="client-drawer-backdrop"></div>
        <div id="clientDrawer" class="client-drawer">
          <div class="client-drawer-header">
            <div>
              <h3 id="drawerClienteNome" style="margin:0; font-size:1.2rem; color:var(--cream);">Ficha do Cliente</h3>
              <p id="drawerClienteMeta" style="margin:0.2rem 0 0 0; font-size:0.82rem; color:var(--text-light);"></p>
            </div>
            <button id="btnCloseDrawer" style="background:transparent; border:none; color:var(--text-light); font-size:1.5rem; cursor:pointer; line-height:1;">&times;</button>
          </div>
          <div id="clientDrawerBody" class="client-drawer-body">
            <!-- Conteúdo carregado dinamicamente -->
          </div>
        </div>
      `;

      setupEventListeners(container);
      await carregarDadosCarteira(container);
    },
    unmount() {
      // Fecha o drawer caso aberto ao trocar de view
      const drawer = document.getElementById("clientDrawer");
      const backdrop = document.getElementById("clientDrawerBackdrop");
      if (drawer) drawer.classList.remove("active");
      if (backdrop) backdrop.classList.remove("active");
      state.clienteSelecionado = null;
    }
  });
}

function setupEventListeners(container) {
  const inputBusca = container.querySelector("#inputBuscaCliente");
  if (inputBusca) {
    inputBusca.addEventListener("input", (e) => {
      state.termoBusca = e.target.value.toLowerCase().trim();
      renderizarGrid(container);
    });
  }

  const filtroChips = container.querySelectorAll("#filtrosClienteBar .panel-filter-chip");
  filtroChips.forEach(chip => {
    chip.addEventListener("click", () => {
      filtroChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.filtroAtual = chip.dataset.filtro;
      renderizarGrid(container);
    });
  });

  const btnAtualizar = container.querySelector("#btnAtualizarClientes");
  if (btnAtualizar) {
    btnAtualizar.addEventListener("click", () => carregarDadosCarteira(container));
  }

  const backdrop = container.querySelector("#clientDrawerBackdrop");
  const btnClose = container.querySelector("#btnCloseDrawer");
  if (backdrop) backdrop.addEventListener("click", fecharDrawer);
  if (btnClose) btnClose.addEventListener("click", fecharDrawer);
}

function fecharDrawer() {
  const drawer = document.getElementById("clientDrawer");
  const backdrop = document.getElementById("clientDrawerBackdrop");
  if (drawer) drawer.classList.remove("active");
  if (backdrop) backdrop.classList.remove("active");
  state.clienteSelecionado = null;
}

async function carregarDadosCarteira(container) {
  state.carregando = true;
  const gridContainer = container.querySelector("#clientesGridContainer");

  try {
    const db = getDb();

    // 1. Carrega todos os usuários com papel cliente ou em usuarios/
    let usuarios = [];
    try {
      usuarios = await Clientes.listarClientes();
    } catch (err) {
      console.warn("Aviso ao carregar usuários clientes:", err.message);
    }

    // 2. Carrega visitas, propostas e documentos para contextualizar contatos
    const [visitasSnap, propostasSnap, docsSnap] = await Promise.all([
      getDocs(collection(db, "visitas")).catch(() => ({ docs: [] })),
      getDocs(collection(db, "propostas")).catch(() => ({ docs: [] })),
      getDocs(collection(db, "documentos")).catch(() => ({ docs: [] }))
    ]);

    const todasVisitas = visitasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const todasPropostas = propostasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const todosDocs = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 3. Monta mapa de clientes registrados por UID e e-mail
    const clientesMap = new Map();

    usuarios.forEach(u => {
      const email = (u.email || "").toLowerCase().trim();
      clientesMap.set(u.id, {
        id: u.id,
        uid: u.id,
        nome: u.nome || u.displayName || "Cliente Sem Nome",
        email: u.email || "",
        telefone: u.telefone || "",
        isLead: false,
        criadoEm: u.criadoEm || null,
        compartilharPreferencias: u.compartilharPreferencias === true,
        visitas: [],
        propostas: [],
        documentos: [],
        ultimaInteracao: u.criadoEm || null
      });
    });

    // 4. Agrega leads vindos de visitas ou propostas sem conta registrada
    const agoraMillis = Date.now();
    const trintaDiasMillis = 30 * 24 * 60 * 60 * 1000;

    todasVisitas.forEach(v => {
      const uid = v.usuarioId;
      const email = (v.clienteEmail || "").toLowerCase().trim();

      if (uid && clientesMap.has(uid)) {
        clientesMap.get(uid).visitas.push(v);
        atualizarUltimaInteracao(clientesMap.get(uid), v.criadoEm || v.data);
      } else if (email) {
        // Encontra ou cria lead agrupado por e-mail
        let lead = Array.from(clientesMap.values()).find(c => c.email && c.email.toLowerCase() === email);
        if (!lead) {
          lead = {
            id: `lead_${email}`,
            uid: null,
            nome: v.clienteNome || "Lead Visitante",
            email: v.clienteEmail || "",
            telefone: v.clienteTelefone || "",
            isLead: true,
            criadoEm: v.criadoEm || null,
            compartilharPreferencias: false,
            visitas: [],
            propostas: [],
            documentos: [],
            ultimaInteracao: v.criadoEm || null
          };
          clientesMap.set(lead.id, lead);
        }
        lead.visitas.push(v);
        atualizarUltimaInteracao(lead, v.criadoEm || v.data);
      }
    });

    todasPropostas.forEach(p => {
      const uid = p.usuarioId;
      const email = (p.clienteEmail || "").toLowerCase().trim();

      if (uid && clientesMap.has(uid)) {
        clientesMap.get(uid).propostas.push(p);
        atualizarUltimaInteracao(clientesMap.get(uid), p.criadoEm);
      } else if (email) {
        let lead = Array.from(clientesMap.values()).find(c => c.email && c.email.toLowerCase() === email);
        if (!lead) {
          lead = {
            id: `lead_${email}`,
            uid: null,
            nome: p.clienteNome || "Lead Proponente",
            email: p.clienteEmail || "",
            telefone: p.clienteTelefone || "",
            isLead: true,
            criadoEm: p.criadoEm || null,
            compartilharPreferencias: false,
            visitas: [],
            propostas: [],
            documentos: [],
            ultimaInteracao: p.criadoEm || null
          };
          clientesMap.set(lead.id, lead);
        }
        lead.propostas.push(p);
        atualizarUltimaInteracao(lead, p.criadoEm);
      }
    });

    todosDocs.forEach(d => {
      const uid = d.usuarioId;
      if (uid && clientesMap.has(uid)) {
        clientesMap.get(uid).documentos.push(d);
        atualizarUltimaInteracao(clientesMap.get(uid), d.criadoEm);
      }
    });

    // 5. Calcula indicadores adicionais
    state.clientes = Array.from(clientesMap.values()).map(cli => {
      const temVisitaMarcada = cli.visitas.some(v => v.status === "agendada" || v.status === "confirmada");
      const temPropostaAtiva = cli.propostas.some(p => p.status === "enviada" || p.status === "contraproposta");
      const temDocPendente = cli.documentos.some(d => d.status === "pendente" || d.status === "enviado");

      let diasSemContato = 0;
      if (cli.ultimaInteracao) {
        const time = cli.ultimaInteracao.toMillis ? cli.ultimaInteracao.toMillis() : (cli.ultimaInteracao.seconds ? cli.ultimaInteracao.seconds * 1000 : agoraMillis);
        diasSemContato = Math.floor((agoraMillis - time) / (1000 * 60 * 60 * 24));
      } else {
        diasSemContato = 999;
      }

      return {
        ...cli,
        temVisitaMarcada,
        temPropostaAtiva,
        temDocPendente,
        diasSemContato,
        isSemContato30d: diasSemContato >= 30
      };
    });

    // Ordena por atividade mais recente
    state.clientes.sort((a, b) => (b.diasSemContato === 999 ? -1 : a.diasSemContato - b.diasSemContato));

    atualizarContadoresFiltros(container);
    renderizarGrid(container);

  } catch (err) {
    console.error("Erro ao carregar carteira:", err);
    gridContainer.innerHTML = `
      <div class="panel-empty-state">
        <p style="color:#f87171;">Erro ao carregar clientes: ${escapeHtml(err.message)}</p>
        <button class="panel-btn-primary" onclick="location.hash='#clientes'">Tentar Novamente</button>
      </div>
    `;
  } finally {
    state.carregando = false;
  }
}

function atualizarUltimaInteracao(cliente, timestamp) {
  if (!timestamp) return;
  const tAtual = cliente.ultimaInteracao?.toMillis ? cliente.ultimaInteracao.toMillis() : (cliente.ultimaInteracao?.seconds ? cliente.ultimaInteracao.seconds * 1000 : 0);
  const tNovo = timestamp.toMillis ? timestamp.toMillis() : (timestamp.seconds ? timestamp.seconds * 1000 : 0);
  if (tNovo > tAtual) {
    cliente.ultimaInteracao = timestamp;
  }
}

function atualizarContadoresFiltros(container) {
  const total = state.clientes.length;
  const visitas = state.clientes.filter(c => c.temVisitaMarcada).length;
  const propostas = state.clientes.filter(c => c.temPropostaAtiva).length;
  const docs = state.clientes.filter(c => c.temDocPendente).length;
  const inativos = state.clientes.filter(c => c.isSemContato30d).length;

  const setEl = (id, val) => {
    const el = container.querySelector(id);
    if (el) el.textContent = val;
  };

  setEl("#countTodos", total);
  setEl("#countVisita", visitas);
  setEl("#countProposta", propostas);
  setEl("#countDocs", docs);
  setEl("#countInativos", inativos);
}

function renderizarGrid(container) {
  const gridContainer = container.querySelector("#clientesGridContainer");
  if (!gridContainer) return;

  let filtrados = state.clientes;

  // Filtro de status
  if (state.filtroAtual === "visita") {
    filtrados = filtrados.filter(c => c.temVisitaMarcada);
  } else if (state.filtroAtual === "proposta") {
    filtrados = filtrados.filter(c => c.temPropostaAtiva);
  } else if (state.filtroAtual === "docs") {
    filtrados = filtrados.filter(c => c.temDocPendente);
  } else if (state.filtroAtual === "inativos") {
    filtrados = filtrados.filter(c => c.isSemContato30d);
  }

  // Filtro de texto de busca
  if (state.termoBusca) {
    filtrados = filtrados.filter(c => 
      c.nome.toLowerCase().includes(state.termoBusca) ||
      c.email.toLowerCase().includes(state.termoBusca) ||
      c.telefone.toLowerCase().includes(state.termoBusca)
    );
  }

  if (filtrados.length === 0) {
    gridContainer.innerHTML = `
      <div class="panel-empty-state">
        <div style="font-size:2.5rem; margin-bottom:0.75rem;">👥</div>
        <h4 style="color:var(--cream); margin-bottom:0.4rem;">Nenhum cliente encontrado</h4>
        <p style="color:var(--text-light); max-width:400px; margin:0 auto;">Não encontramos nenhum contato com os filtros e termos de busca informados.</p>
      </div>
    `;
    return;
  }

  let html = `<div class="clients-grid">`;

  filtrados.forEach(c => {
    const initial = (c.nome || "C").charAt(0).toUpperCase();
    const tagTipo = c.isLead 
      ? `<span class="client-tag is-lead">Lead em Atendimento</span>`
      : `<span class="client-tag">Cliente Cadastrado</span>`;

    const tagVisita = c.temVisitaMarcada ? `<span class="client-tag has-visit">📅 Visita Marcada</span>` : "";
    const tagProposta = c.temPropostaAtiva ? `<span class="client-tag has-proposal">📄 Proposta Ativa</span>` : "";
    const tagDocs = c.temDocPendente ? `<span class="client-tag" style="background:rgba(234,179,8,0.15); color:#facc15;">📁 Doc Pendente</span>` : "";
    const tagInativo = c.isSemContato30d ? `<span class="client-tag inactive">⚠️ Sem contato (+30d)</span>` : "";

    html += `
      <div class="client-card" data-client-id="${escapeHtml(c.id)}">
        <div>
          <div class="client-header">
            <div class="client-avatar-badge">${escapeHtml(initial)}</div>
            <div class="client-info">
              <h4>${escapeHtml(c.nome)}</h4>
              <p>${escapeHtml(c.email || "Sem e-mail cadastrado")}</p>
              ${c.telefone ? `<p style="font-size:0.78rem; opacity:0.8;">📱 ${escapeHtml(c.telefone)}</p>` : ""}
            </div>
          </div>

          <div class="client-tags" style="margin-top:0.85rem;">
            ${tagTipo}
            ${tagVisita}
            ${tagProposta}
            ${tagDocs}
            ${tagInativo}
          </div>
        </div>

        <div class="client-actions">
          <button class="panel-btn-primary btn-ver-ficha" data-id="${escapeHtml(c.id)}" style="flex:1; padding:0.5rem; font-size:0.82rem; text-align:center;">
            Ver Ficha Completa
          </button>
          ${c.telefone ? `
            <a href="https://wa.me/${encodeURIComponent(c.telefone.replace(/\D/g, ""))}" target="_blank" rel="noopener noreferrer" class="panel-btn-ghost" title="Conversar no WhatsApp" style="padding:0.5rem 0.75rem; text-decoration:none;">
              💬
            </a>
          ` : ""}
          ${c.uid ? `
            <button class="panel-btn-ghost btn-iniciar-chat" data-uid="${escapeHtml(c.uid)}" data-nome="${escapeHtml(c.nome)}" title="Abrir Chat no Painel" style="padding:0.5rem 0.75rem;">
              ✉️
            </button>
          ` : ""}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  gridContainer.innerHTML = html;

  // Event listeners dos cards
  gridContainer.querySelectorAll(".btn-ver-ficha").forEach(btn => {
    btn.addEventListener("click", () => abrirFichaCliente(btn.dataset.id));
  });

  gridContainer.querySelectorAll(".btn-iniciar-chat").forEach(btn => {
    btn.addEventListener("click", () => iniciarConversaComCliente(btn.dataset.uid, btn.dataset.nome));
  });
}

async function abrirFichaCliente(clienteId) {
  const cliente = state.clientes.find(c => c.id === clienteId);
  if (!cliente) return;

  state.clienteSelecionado = cliente;
  const drawer = document.getElementById("clientDrawer");
  const backdrop = document.getElementById("clientDrawerBackdrop");
  const drawerNome = document.getElementById("drawerClienteNome");
  const drawerMeta = document.getElementById("drawerClienteMeta");
  const drawerBody = document.getElementById("clientDrawerBody");

  if (!drawer || !drawerBody) return;

  drawerNome.textContent = cliente.nome;
  drawerMeta.textContent = `${cliente.email || "Sem e-mail"} • ${cliente.telefone || "Sem telefone"}`;

  drawerBody.innerHTML = `
    <div style="text-align:center; padding:2rem;">
      <div class="panel-spinner" style="margin:0 auto 1rem auto; width:32px; height:32px; border:3px solid rgba(212,175,122,0.2); border-top-color:var(--gold); border-radius:50%; animation:spin 1s linear infinite;"></div>
      <p style="color:var(--text-light); font-size:0.88rem;">Carregando dados completos do cliente...</p>
    </div>
  `;

  drawer.classList.add("active");
  backdrop.classList.add("active");

  try {
    let perfilCompleto = {
      usuario: cliente,
      visitas: cliente.visitas,
      propostas: cliente.propostas,
      documentos: cliente.documentos,
      atividades: [],
      notasCorretor: [],
      favoritos: [],
      buscasDesejadas: []
    };

    if (cliente.uid) {
      perfilCompleto = await Clientes.obterPerfilCompleto(cliente.uid);
    }

    renderizarConteudoDrawer(drawerBody, perfilCompleto);

  } catch (err) {
    console.error("Erro ao carregar detalhes:", err);
    drawerBody.innerHTML = `
      <div class="panel-empty-state">
        <p style="color:#f87171;">Erro ao carregar detalhes: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function renderizarConteudoDrawer(body, dados) {
  const { usuario, visitas, propostas, documentos, atividades, notasCorretor, favoritos, buscasDesejadas } = dados;

  let html = `
    <!-- CONTATO E AÇÕES RÁPIDAS -->
    <div class="drawer-section">
      <h5>📞 Contato e Ações</h5>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; font-size:0.85rem; margin-bottom:1rem;">
        <div><strong>E-mail:</strong> ${escapeHtml(usuario.email || "—")}</div>
        <div><strong>Telefone:</strong> ${escapeHtml(usuario.telefone || "—")}</div>
        <div><strong>Tipo:</strong> ${usuario.isLead ? "Lead em Atendimento" : "Cliente com Conta"}</div>
        <div><strong>Cadastro:</strong> ${usuario.criadoEm ? formatData(usuario.criadoEm) : "—"}</div>
      </div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        ${usuario.id && !usuario.isLead ? `
          <button id="btnDrawerChat" class="panel-btn-primary" style="font-size:0.82rem; padding:0.45rem 0.85rem;">
            ✉️ Abrir Conversa
          </button>
        ` : ""}
        <button id="btnDrawerEnviarImovel" class="panel-btn-ghost" style="font-size:0.82rem; padding:0.45rem 0.85rem;">
          🔗 Enviar Link de Imóvel
        </button>
        ${usuario.telefone ? `
          <a href="https://wa.me/${encodeURIComponent(usuario.telefone.replace(/\D/g, ""))}" target="_blank" rel="noopener noreferrer" class="panel-btn-ghost" style="font-size:0.82rem; padding:0.45rem 0.85rem; text-decoration:none;">
            💬 WhatsApp
          </a>
        ` : ""}
      </div>
    </div>

    <!-- PREFERÊNCIAS (BUSCAS E FAVORITOS) -->
    <div class="drawer-section">
      <h5>❤️ Preferências do Cliente</h5>
      ${usuario.compartilharPreferencias === true ? `
        <div style="margin-bottom:1rem;">
          <h6 style="color:var(--cream); font-size:0.82rem; margin:0 0 0.5rem 0; text-transform:uppercase;">Favoritos (${favoritos.length})</h6>
          ${favoritos.length > 0 ? `
            <div style="display:flex; flex-direction:column; gap:0.4rem;">
              ${favoritos.map(f => `
                <div style="font-size:0.82rem; display:flex; justify-content:space-between; background:rgba(245,241,232,0.03); padding:0.4rem 0.6rem; border-radius:6px;">
                  <a href="imovel.html?id=${encodeURIComponent(f.imovelId || f.id)}" target="_blank" style="color:var(--gold); text-decoration:none;">${escapeHtml(f.titulo || f.imovelTitulo || "Ver Imóvel")}</a>
                  <span style="color:var(--text-light);">${f.preco ? formatMoeda(f.preco) : ""}</span>
                </div>
              `).join("")}
            </div>
          ` : `<p style="font-size:0.8rem; color:var(--text-light); margin:0;">Nenhum imóvel favoritado até o momento.</p>`}
        </div>

        <div>
          <h6 style="color:var(--cream); font-size:0.82rem; margin:0 0 0.5rem 0; text-transform:uppercase;">Buscas Salvas (${buscasDesejadas.length})</h6>
          ${buscasDesejadas.length > 0 ? `
            <div style="display:flex; flex-direction:column; gap:0.4rem;">
              ${buscasDesejadas.map(b => `
                <div style="font-size:0.82rem; background:rgba(245,241,232,0.03); padding:0.4rem 0.6rem; border-radius:6px;">
                  <strong style="color:var(--cream);">${escapeHtml(b.titulo || b.nome || "Busca")}</strong>
                  <div style="font-size:0.75rem; color:var(--text-light); margin-top:0.2rem;">
                    ${b.cidade ? `Cidade: ${escapeHtml(b.cidade)} • ` : ""}${b.tipo ? `Tipo: ${escapeHtml(b.tipo)} • ` : ""}${b.precoMax ? `Até ${formatMoeda(b.precoMax)}` : ""}
                  </div>
                </div>
              `).join("")}
            </div>
          ` : `<p style="font-size:0.8rem; color:var(--text-light); margin:0;">Nenhuma busca salva até o momento.</p>`}
        </div>
      ` : `
        <div style="background:rgba(245,241,232,0.03); border:1px dashed rgba(245,241,232,0.12); padding:0.85rem; border-radius:8px; font-size:0.82rem; color:var(--text-light);">
          🔒 O cliente optou por não compartilhar preferências e favoritos com o corretor.
        </div>
      `}
    </div>

    <!-- NOTAS INTERNAS DO CORRETOR -->
    <div class="drawer-section">
      <h5>📝 Notas Internas Privadas</h5>
      <p style="font-size:0.78rem; color:var(--text-light); margin:-0.4rem 0 0.85rem 0;">Apenas visíveis para os corretores da imobiliária.</p>
      
      <div id="drawerNotasList" style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:0.85rem; max-height:160px; overflow-y:auto;">
        ${notasCorretor && notasCorretor.length > 0 ? notasCorretor.map(n => `
          <div style="background:rgba(245,241,232,0.04); border-left:3px solid var(--gold); padding:0.5rem 0.75rem; border-radius:4px; font-size:0.82rem;">
            <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
              <strong style="color:var(--gold); font-size:0.75rem;">${escapeHtml(n.corretorNome || "Corretor")}</strong>
              <span style="color:var(--text-light); font-size:0.7rem;">${n.criadoEm ? formatData(n.criadoEm) : ""}</span>
            </div>
            <p style="margin:0; color:var(--cream);">${escapeHtml(n.texto)}</p>
          </div>
        `).join("") : `<p id="drawerNotasVazio" style="font-size:0.8rem; color:var(--text-light); margin:0;">Nenhuma nota interna registrada.</p>`}
      </div>

      ${usuario.id && !usuario.isLead ? `
        <div style="display:flex; gap:0.5rem;">
          <input type="text" id="inputNovaNota" class="chat-search-input" placeholder="Adicionar nota rápida sobre este cliente..." style="font-size:0.82rem;">
          <button id="btnSalvarNota" class="panel-btn-primary" style="padding:0.45rem 0.85rem; font-size:0.82rem;">Salvar</button>
        </div>
      ` : `
        <p style="font-size:0.75rem; color:var(--text-light); margin:0;">Notas internas requerem que o cliente possua cadastro vinculado.</p>
      `}
    </div>

    <!-- VISITAS DO CLIENTE -->
    <div class="drawer-section">
      <h5>📅 Visitas (${visitas.length})</h5>
      ${visitas.length > 0 ? `
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          ${visitas.map(v => `
            <div style="background:rgba(245,241,232,0.03); padding:0.6rem 0.8rem; border-radius:8px; font-size:0.82rem; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong style="color:var(--cream);">${escapeHtml(v.imovelTitulo || "Imóvel")}</strong>
                <div style="font-size:0.75rem; color:var(--text-light);">${v.data ? formatData(v.data) : "Data a definir"} às ${escapeHtml(v.horario || "—")} (${escapeHtml(v.tipo || "presencial")})</div>
              </div>
              <span class="status-badge status-${escapeHtml(v.status || "agendada")}" style="font-size:0.72rem;">${escapeHtml(v.status)}</span>
            </div>
          `).join("")}
        </div>
      ` : `<p style="font-size:0.8rem; color:var(--text-light); margin:0;">Nenhuma visita vinculada.</p>`}
    </div>

    <!-- PROPOSTAS DO CLIENTE -->
    <div class="drawer-section">
      <h5>📄 Propostas (${propostas.length})</h5>
      ${propostas.length > 0 ? `
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          ${propostas.map(p => `
            <div style="background:rgba(245,241,232,0.03); padding:0.6rem 0.8rem; border-radius:8px; font-size:0.82rem; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong style="color:var(--cream);">${escapeHtml(p.imovelTitulo || "Imóvel")}</strong>
                <div style="font-size:0.75rem; color:var(--gold); font-weight:600;">${formatMoeda(p.valorProposto || 0)}</div>
              </div>
              <span class="status-badge status-${escapeHtml(p.status || "enviada")}" style="font-size:0.72rem;">${escapeHtml(p.status)}</span>
            </div>
          `).join("")}
        </div>
      ` : `<p style="font-size:0.8rem; color:var(--text-light); margin:0;">Nenhuma proposta vinculada.</p>`}
    </div>

    <!-- DOCUMENTOS DO CLIENTE -->
    <div class="drawer-section">
      <h5>📁 Documentos (${documentos.length})</h5>
      ${documentos.length > 0 ? `
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          ${documentos.map(d => `
            <div style="background:rgba(245,241,232,0.03); padding:0.6rem 0.8rem; border-radius:8px; font-size:0.82rem; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong style="color:var(--cream);">${escapeHtml(d.nomeOriginal || d.tipo || "Documento")}</strong>
                <div style="font-size:0.75rem; color:var(--text-light);">${escapeHtml(d.processo || "Processo")}</div>
              </div>
              <span class="status-badge-doc ${escapeHtml(d.status || "pendente")}">${escapeHtml(d.status)}</span>
            </div>
          `).join("")}
        </div>
      ` : `<p style="font-size:0.8rem; color:var(--text-light); margin:0;">Nenhum documento solicitado ou enviado.</p>`}
    </div>

    <!-- LINHA DO TEMPO / ATIVIDADES -->
    <div class="drawer-section">
      <h5>⏱️ Histórico de Atividades</h5>
      ${atividades && atividades.length > 0 ? `
        <div style="display:flex; flex-direction:column; gap:0.6rem;">
          ${atividades.map(a => `
            <div style="font-size:0.8rem; border-left:2px solid rgba(212,175,122,0.3); padding-left:0.65rem;">
              <strong style="color:var(--cream);">${escapeHtml(a.titulo || "Atividade")}</strong>
              <p style="margin:0.15rem 0 0 0; color:var(--text-light);">${escapeHtml(a.descricao || "")}</p>
              <span style="font-size:0.7rem; color:var(--gold);">${a.criadoEm ? formatData(a.criadoEm) : ""}</span>
            </div>
          `).join("")}
        </div>
      ` : `<p style="font-size:0.8rem; color:var(--text-light); margin:0;">Nenhuma atividade recente registrada.</p>`}
    </div>
  `;

  body.innerHTML = html;

  // Ações do drawer
  const btnChat = body.querySelector("#btnDrawerChat");
  if (btnChat) {
    btnChat.addEventListener("click", () => {
      fecharDrawer();
      iniciarConversaComCliente(usuario.id, usuario.nome);
    });
  }

  const btnEnviarImovel = body.querySelector("#btnDrawerEnviarImovel");
  if (btnEnviarImovel) {
    btnEnviarImovel.addEventListener("click", () => {
      solicitarEnvioImovelModal(usuario);
    });
  }

  const btnSalvarNota = body.querySelector("#btnSalvarNota");
  const inputNovaNota = body.querySelector("#inputNovaNota");
  if (btnSalvarNota && inputNovaNota) {
    btnSalvarNota.addEventListener("click", async () => {
      const texto = inputNovaNota.value.trim();
      if (!texto) {
        showToast("Digite o conteúdo da nota.", "aviso");
        return;
      }
      btnSalvarNota.disabled = true;
      btnSalvarNota.textContent = "...";
      try {
        await Clientes.adicionarNota(usuario.id, texto);
        showToast("Nota interna registrada!", "sucesso");
        inputNovaNota.value = "";
        
        // Atualiza a lista de notas
        const notasAtualizadas = await Clientes.listarNotas(usuario.id);
        const listaEl = body.querySelector("#drawerNotasList");
        if (listaEl) {
          listaEl.innerHTML = notasAtualizadas.map(n => `
            <div style="background:rgba(245,241,232,0.04); border-left:3px solid var(--gold); padding:0.5rem 0.75rem; border-radius:4px; font-size:0.82rem;">
              <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
                <strong style="color:var(--gold); font-size:0.75rem;">${escapeHtml(n.corretorNome || "Corretor")}</strong>
                <span style="color:var(--text-light); font-size:0.7rem;">${n.criadoEm ? formatData(n.criadoEm) : ""}</span>
              </div>
              <p style="margin:0; color:var(--cream);">${escapeHtml(n.texto)}</p>
            </div>
          `).join("");
        }
      } catch (err) {
        showToast("Erro ao salvar nota: " + err.message, "erro");
      } finally {
        btnSalvarNota.disabled = false;
        btnSalvarNota.textContent = "Salvar";
      }
    });
  }
}

async function iniciarConversaComCliente(clienteUid, clienteNome) {
  try {
    showToast("Abrindo conversa...", "info");
    const conversaId = await Conversas.abrirOuObterComCliente(clienteUid, clienteNome);
    location.hash = `#mensagens?conversa=${conversaId}`;
  } catch (err) {
    showToast("Erro ao abrir conversa: " + err.message, "erro");
  }
}

function solicitarEnvioImovelModal(usuario) {
  openModal({
    title: `Enviar Imóvel para ${escapeHtml(usuario.nome)}`,
    bodyHtml: `
      <p style="font-size:0.88rem; color:var(--text-light); margin-bottom:1rem;">
        Informe o código ou ID do imóvel para inserir o link direto de recomendação na conversa deste cliente:
      </p>
      <div style="margin-bottom:1rem;">
        <label style="display:block; font-size:0.82rem; color:var(--cream); margin-bottom:0.35rem;">ID do Imóvel</label>
        <input type="text" id="modalInputImovelId" class="chat-search-input" placeholder="ex: imovel-01 ou ID do Firestore">
      </div>
    `,
    confirmText: "Inserir na Conversa",
    async onConfirm() {
      const imovelId = document.getElementById("modalInputImovelId")?.value.trim();
      if (!imovelId) {
        showToast("Informe o ID do imóvel.", "aviso");
        return false;
      }
      fecharDrawer();
      try {
        const conversaId = await Conversas.abrirOuObterComCliente(usuario.id, usuario.nome);
        const link = `imovel.html?id=${encodeURIComponent(imovelId)}`;
        await Conversas.enviar(conversaId, `Olá, ${usuario.nome}! Gostaria de te recomendar este imóvel: ${link}`);
        showToast("Link do imóvel enviado na conversa!", "sucesso");
        location.hash = `#mensagens?conversa=${conversaId}`;
        return true;
      } catch (err) {
        showToast("Erro ao enviar imóvel: " + err.message, "erro");
        return false;
      }
    }
  });
}
