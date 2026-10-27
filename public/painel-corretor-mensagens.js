// public/painel-corretor-mensagens.js
// Living Canvas - Mensagens e Chat em Tempo Real do Corretor
// View #mensagens: listagem por última atividade, chat com onSnapshot, respostas rápidas, anexar imóvel e contexto lateral

import { registerView, escapeHtml, formatData, openModal, showToast } from "./panel-shell.js";
import { Conversas, getDb, getCurrentUserOrThrow } from "./lc-data.js";
import { collection, query, where, onSnapshot, getDoc, doc } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

let state = {
  conversas: [],
  conversaAtiva: null,
  mensagens: [],
  termoBusca: "",
  unsubConversas: null,
  unsubMensagens: null,
  contextoCliente: null
};

// 5 Modelos de respostas rápidas padrão
const RESPOSTAS_RAPIDAS = [
  "Olá! Obrigado pelo interesse. Como posso te ajudar hoje?",
  "O imóvel está disponível para visitas esta semana. Qual o melhor dia e horário para você?",
  "Recebemos sua proposta e entraremos em contato com o proprietário para resposta.",
  "Documentação recebida e encaminhada para conferência com nossa equipe jurídica.",
  "Seguem as fotos e os detalhes atualizados do imóvel que você solicitou!"
];

export function initMensagensView() {
  registerView("mensagens", {
    title: "Mensagens",
    async mount(container) {
      container.innerHTML = `
        <div class="panel-section-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem;">
          <div>
            <h2 class="panel-section-title" style="margin:0;">Mensagens</h2>
            <p class="panel-section-subtitle" style="margin:0.25rem 0 0 0;">Atendimento em tempo real aos clientes e proponentes</p>
          </div>
        </div>

        <div class="chat-container" id="chatContainer">
          <!-- SIDEBAR: LISTA DE CONVERSAS -->
          <div class="chat-sidebar">
            <div class="chat-sidebar-header">
              <input type="text" id="inputBuscaConversa" class="chat-search-input" placeholder="Buscar conversas...">
            </div>
            <div class="conversas-list" id="conversasList">
              <div class="panel-empty-state" style="padding:2rem 1rem;">
                <p style="color:var(--text-light); font-size:0.85rem;">Carregando conversas...</p>
              </div>
            </div>
          </div>

          <!-- ÁREA PRINCIPAL DO CHAT -->
          <div class="chat-main" id="chatMain">
            <div id="chatVazioPlaceholder" class="panel-empty-state" style="margin:auto; max-width:360px;">
              <div style="font-size:3rem; margin-bottom:0.75rem;">💬</div>
              <h4 style="color:var(--cream); margin-bottom:0.4rem;">Nenhuma conversa selecionada</h4>
              <p style="color:var(--text-light); font-size:0.85rem;">Escolha um cliente na lista lateral para visualizar e responder as mensagens.</p>
            </div>

            <!-- CHAT ATIVO (OCULTO POR PADRÃO) -->
            <div id="chatAtivoContent" style="display:none; flex-direction:column; height:100%;">
              <div class="chat-header">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                  <button id="btnVoltarConversas" class="panel-btn-ghost" style="display:none; padding:0.4rem 0.6rem; font-size:0.8rem;">
                    ← Voltar
                  </button>
                  <div>
                    <h4 id="chatHeaderNome" style="margin:0; font-size:1.05rem; color:var(--cream);">Cliente</h4>
                    <p id="chatHeaderMeta" style="margin:0.15rem 0 0 0; font-size:0.75rem; color:var(--gold);"></p>
                  </div>
                </div>
                <div>
                  <button id="btnVerFichaDoChat" class="panel-btn-ghost" style="font-size:0.8rem; padding:0.4rem 0.75rem;">
                    Ver Ficha
                  </button>
                </div>
              </div>

              <!-- MENSAGENS -->
              <div class="chat-messages" id="chatMessages">
                <!-- Bolhas inseridas em tempo real -->
              </div>

              <!-- RESPOSTAS RÁPIDAS -->
              <div class="chat-quick-replies" id="chatQuickReplies">
                <!-- Chips inseridos via script -->
              </div>

              <!-- BARRA DE INPUT -->
              <div class="chat-input-area">
                <button id="btnAnexarImovel" class="panel-btn-ghost" title="Anexar link de imóvel" style="padding:0.6rem 0.85rem; font-size:0.9rem;">
                  🏠 Anexar
                </button>
                <input type="text" id="inputTextoMensagem" placeholder="Digite sua mensagem..." autocomplete="off">
                <button id="btnEnviarMensagem" class="panel-btn-primary" style="padding:0.65rem 1.25rem; font-size:0.88rem;">
                  Enviar
                </button>
              </div>
            </div>
          </div>

          <!-- PAINEL LATERAL DE CONTEXTO DO CLIENTE / IMÓVEL -->
          <div class="chat-context-panel" id="chatContextPanel">
            <h5 style="color:var(--gold); font-size:0.82rem; text-transform:uppercase; letter-spacing:0.04em; margin:0 0 0.85rem 0;">Contexto</h5>
            <div id="chatContextContent" style="font-size:0.85rem; color:var(--text-light);">
              Selecione uma conversa para ver o resumo do cliente e do imóvel em negociação.
            </div>
          </div>
        </div>
      `;

      setupQuickReplies(container);
      setupChatEventListeners(container);
      escutarTodasConversas(container);

      // Verifica se a URL já possui parâmetro de conversa ex: #mensagens?conversa=xyz
      verificarParametroUrl(container);
    },
    unmount() {
      // Limpeza estrita de listeners para evitar memory leaks
      if (typeof state.unsubConversas === "function") {
        state.unsubConversas();
        state.unsubConversas = null;
      }
      if (typeof state.unsubMensagens === "function") {
        state.unsubMensagens();
        state.unsubMensagens = null;
      }
      state.conversaAtiva = null;
      state.mensagens = [];
    }
  });
}

function setupQuickReplies(container) {
  const repliesContainer = container.querySelector("#chatQuickReplies");
  if (!repliesContainer) return;

  repliesContainer.innerHTML = RESPOSTAS_RAPIDAS.map(texto => `
    <button class="quick-reply-chip" title="${escapeHtml(texto)}">
      ${escapeHtml(texto.length > 32 ? texto.substring(0, 30) + "..." : texto)}
    </button>
  `).join("");

  repliesContainer.querySelectorAll(".quick-reply-chip").forEach((chip, index) => {
    chip.addEventListener("click", () => {
      const input = container.querySelector("#inputTextoMensagem");
      if (input) {
        input.value = RESPOSTAS_RAPIDAS[index];
        input.focus();
      }
    });
  });
}

function setupChatEventListeners(container) {
  const inputBusca = container.querySelector("#inputBuscaConversa");
  if (inputBusca) {
    inputBusca.addEventListener("input", (e) => {
      state.termoBusca = e.target.value.toLowerCase().trim();
      renderizarListaConversas(container);
    });
  }

  const inputMensagem = container.querySelector("#inputTextoMensagem");
  const btnEnviar = container.querySelector("#btnEnviarMensagem");

  const acaoEnviar = async () => {
    if (!state.conversaAtiva) return;
    const texto = inputMensagem.value.trim();
    if (!texto) return;

    inputMensagem.value = "";
    try {
      await Conversas.enviar(state.conversaAtiva.id, texto);
    } catch (err) {
      showToast("Erro ao enviar mensagem: " + err.message, "erro");
    }
  };

  if (btnEnviar) btnEnviar.addEventListener("click", acaoEnviar);
  if (inputMensagem) {
    inputMensagem.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        acaoEnviar();
      }
    });
  }

  const btnAnexar = container.querySelector("#btnAnexarImovel");
  if (btnAnexar) {
    btnAnexar.addEventListener("click", () => {
      if (!state.conversaAtiva) return;
      openModal({
        title: "Anexar Imóvel na Conversa",
        bodyHtml: `
          <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:0.75rem;">
            Informe o identificador do imóvel para anexar link direto na conversa:
          </p>
          <input type="text" id="inputAnexarImovelId" class="chat-search-input" placeholder="ex: imovel-01">
        `,
        confirmText: "Inserir no Envio",
        async onConfirm() {
          const id = document.getElementById("inputAnexarImovelId")?.value.trim();
          if (id && inputMensagem) {
            inputMensagem.value += ` Confira o imóvel: imovel.html?id=${encodeURIComponent(id)}`;
            inputMensagem.focus();
          }
          return true;
        }
      });
    });
  }

  const btnVoltar = container.querySelector("#btnVoltarConversas");
  if (btnVoltar) {
    btnVoltar.addEventListener("click", () => {
      const chatContainer = container.querySelector("#chatContainer");
      if (chatContainer) chatContainer.classList.remove("active-conversa");
    });
  }

  const btnVerFicha = container.querySelector("#btnVerFichaDoChat");
  if (btnVerFicha) {
    btnVerFicha.addEventListener("click", () => {
      if (state.conversaAtiva?.clienteId) {
        location.hash = `#clientes`;
      }
    });
  }
}

function escutarTodasConversas(container) {
  try {
    const db = getDb();
    const user = getCurrentUserOrThrow();
    
    // Escuta conversas onde o corretor atua
    const q = query(
      collection(db, "conversas"),
      where("corretorId", "==", user.uid)
    );

    state.unsubConversas = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      // Ordena por última atividade decrescente
      list.sort((a, b) => {
        const timeA = a.ultimaAtividade?.toMillis ? a.ultimaAtividade.toMillis() : (a.ultimaAtividade?.seconds ? a.ultimaAtividade.seconds * 1000 : 0);
        const timeB = b.ultimaAtividade?.toMillis ? b.ultimaAtividade.toMillis() : (b.ultimaAtividade?.seconds ? b.ultimaAtividade.seconds * 1000 : 0);
        return timeB - timeA;
      });

      state.conversas = list;
      renderizarListaConversas(container);
      atualizarBadgeMensagens(list);

      // Se há conversa ativa, atualiza seus dados
      if (state.conversaAtiva) {
        const atual = list.find(c => c.id === state.conversaAtiva.id);
        if (atual) state.conversaAtiva = atual;
      }
    }, (err) => {
      console.warn("Aviso ao escutar conversas:", err.message);
      // Fallback: busca única se snapshot falhar por regras/índices
      Conversas.listarDoUsuario(user.uid, "corretor").then(list => {
        state.conversas = list;
        renderizarListaConversas(container);
      }).catch(() => {});
    });

  } catch (err) {
    console.warn("Erro ao configurar escuta de conversas:", err.message);
  }
}

function atualizarBadgeMensagens(conversas) {
  const totalNaoLidas = conversas.reduce((acc, c) => acc + (c.naoLidasCorretor || 0), 0);
  const badgeEl = document.getElementById("corretorNavMensagensBadge");
  if (badgeEl) {
    if (totalNaoLidas > 0) {
      badgeEl.textContent = totalNaoLidas;
      badgeEl.style.display = "inline-block";
    } else {
      badgeEl.style.display = "none";
    }
  }
}

function renderizarListaConversas(container) {
  const listEl = container.querySelector("#conversasList");
  if (!listEl) return;

  let filtradas = state.conversas;
  if (state.termoBusca) {
    filtradas = filtradas.filter(c => 
      (c.clienteNome || "").toLowerCase().includes(state.termoBusca) ||
      (c.ultimaMensagem || "").toLowerCase().includes(state.termoBusca) ||
      (c.imovelTitulo || "").toLowerCase().includes(state.termoBusca)
    );
  }

  if (filtradas.length === 0) {
    listEl.innerHTML = `
      <div class="panel-empty-state" style="padding:2.5rem 1rem;">
        <p style="color:var(--text-light); font-size:0.85rem;">Nenhuma conversa encontrada.</p>
      </div>
    `;
    return;
  }

  let html = "";
  filtradas.forEach(c => {
    const isAtiva = state.conversaAtiva && state.conversaAtiva.id === c.id;
    const initial = (c.clienteNome || "C").charAt(0).toUpperCase();
    const naoLidas = c.naoLidasCorretor || 0;

    let horaStr = "";
    if (c.ultimaAtividade) {
      horaStr = formatData(c.ultimaAtividade);
    }

    html += `
      <div class="conversa-item ${isAtiva ? "active" : ""}" data-id="${escapeHtml(c.id)}">
        <div class="client-avatar-badge" style="width:36px; height:36px; font-size:0.9rem; flex-shrink:0;">
          ${escapeHtml(initial)}
        </div>
        <div class="conversa-meta">
          <div class="conversa-top">
            <span class="conversa-nome">${escapeHtml(c.clienteNome || "Cliente")}</span>
            <span class="conversa-hora">${escapeHtml(horaStr)}</span>
          </div>
          <div class="conversa-preview">
            ${escapeHtml(c.ultimaMensagem || "Nenhuma mensagem ainda")}
          </div>
          ${c.imovelTitulo ? `
            <div style="font-size:0.72rem; color:var(--gold); margin-top:0.2rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              🏷️ ${escapeHtml(c.imovelTitulo)}
            </div>
          ` : ""}
        </div>
        ${naoLidas > 0 ? `<span class="conversa-unread-badge">${naoLidas}</span>` : ""}
      </div>
    `;
  });

  listEl.innerHTML = html;

  listEl.querySelectorAll(".conversa-item").forEach(item => {
    item.addEventListener("click", () => {
      const id = item.dataset.id;
      const conv = state.conversas.find(c => c.id === id);
      if (conv) selecionarConversa(container, conv);
    });
  });
}

async function selecionarConversa(container, conversa) {
  state.conversaAtiva = conversa;

  // Marca conversa como selecionada visualmente
  const chatContainer = container.querySelector("#chatContainer");
  if (chatContainer) chatContainer.classList.add("active-conversa");

  const vazioPlaceholder = container.querySelector("#chatVazioPlaceholder");
  const ativoContent = container.querySelector("#chatAtivoContent");
  const headerNome = container.querySelector("#chatHeaderNome");
  const headerMeta = container.querySelector("#chatHeaderMeta");
  const btnVoltar = container.querySelector("#btnVoltarConversas");

  if (vazioPlaceholder) vazioPlaceholder.style.display = "none";
  if (ativoContent) ativoContent.style.display = "flex";
  if (btnVoltar) btnVoltar.style.display = "inline-block";

  if (headerNome) headerNome.textContent = conversa.clienteNome || "Cliente";
  if (headerMeta) headerMeta.textContent = conversa.imovelTitulo ? `Imóvel: ${conversa.imovelTitulo}` : "Atendimento Geral";

  renderizarListaConversas(container);
  carregarContextoLateral(container, conversa);

  // Marcar como lida pelo corretor
  if (conversa.naoLidasCorretor > 0) {
    await Conversas.marcarLidas(conversa.id, "corretor");
  }

  // Desinscreve da conversa anterior se houver
  if (typeof state.unsubMensagens === "function") {
    state.unsubMensagens();
    state.unsubMensagens = null;
  }

  // Escuta as mensagens da conversa selecionada em tempo real
  const messagesContainer = container.querySelector("#chatMessages");
  if (messagesContainer) {
    messagesContainer.innerHTML = `
      <div style="text-align:center; padding:1.5rem; color:var(--text-light); font-size:0.85rem;">
        Carregando mensagens...
      </div>
    `;
  }

  state.unsubMensagens = Conversas.escutarMensagens(conversa.id, (mensagens) => {
    state.mensagens = mensagens;
    renderizarMensagens(container);
  });
}

function renderizarMensagens(container) {
  const messagesContainer = container.querySelector("#chatMessages");
  if (!messagesContainer) return;

  if (state.mensagens.length === 0) {
    messagesContainer.innerHTML = `
      <div style="text-align:center; padding:2rem; color:var(--text-light); font-size:0.85rem;">
        Nenhuma mensagem trocada ainda. Inicie a conversa abaixo!
      </div>
    `;
    return;
  }

  let html = "";
  state.mensagens.forEach(msg => {
    const isCorretor = msg.remetentePapel === "corretor";
    const horaStr = msg.enviadaEm ? formatData(msg.enviadaEm) : "";

    // Formata links em texto caso contenha "imovel.html?id="
    let textoFormatado = escapeHtml(msg.texto || "");
    textoFormatado = textoFormatado.replace(
      /(imovel\.html\?id=[\w-]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--gold); text-decoration:underline; font-weight:600;">$1</a>'
    );

    html += `
      <div class="chat-bubble ${isCorretor ? "from-corretor" : "from-cliente"}">
        <div>${textoFormatado}</div>
        <span class="chat-bubble-time">${escapeHtml(horaStr)}</span>
      </div>
    `;
  });

  messagesContainer.innerHTML = html;
  // Scroll automático para a mensagem mais recente
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function carregarContextoLateral(container, conversa) {
  const panel = container.querySelector("#chatContextContent");
  if (!panel) return;

  panel.innerHTML = `
    <div style="padding:0.5rem 0;">
      <h6 style="color:var(--cream); margin:0 0 0.5rem 0; font-size:0.9rem;">${escapeHtml(conversa.clienteNome || "Cliente")}</h6>
      <p style="font-size:0.8rem; color:var(--text-light); margin:0 0 0.75rem 0;">ID: ${escapeHtml(conversa.clienteId || "—")}</p>
      
      ${conversa.imovelTitulo ? `
        <div style="background:rgba(245,241,232,0.03); border:1px solid rgba(245,241,232,0.08); border-radius:8px; padding:0.75rem; margin-top:0.75rem;">
          <strong style="color:var(--gold); font-size:0.8rem; text-transform:uppercase;">Imóvel de Interesse</strong>
          <p style="margin:0.25rem 0 0.5rem 0; color:var(--cream); font-size:0.85rem;">${escapeHtml(conversa.imovelTitulo)}</p>
          ${conversa.imovelId ? `
            <a href="imovel.html?id=${encodeURIComponent(conversa.imovelId)}" target="_blank" rel="noopener noreferrer" style="font-size:0.78rem; color:var(--gold); text-decoration:none;">
              Ver anúncio público &rarr;
            </a>
          ` : ""}
        </div>
      ` : ""}
    </div>
  `;
}

function verificarParametroUrl(container) {
  const hash = window.location.hash || "";
  const match = hash.match(/conversa=([\w-]+)/);
  if (match && match[1]) {
    const conversaId = match[1];
    setTimeout(() => {
      const conv = state.conversas.find(c => c.id === conversaId);
      if (conv) {
        selecionarConversa(container, conv);
      }
    }, 500);
  }
}
