/**
 * Living Canvas - Dashboard do Cliente: Mensagens & Chat (P12)
 * 
 * Implementa o canal seguro de atendimento em tempo real entre cliente e corretores:
 * - Listagem de canais organizados por imóvel / corretor
 * - Indicador visual de mensagens não lidas e última atividade
 * - Chat em tempo real via onSnapshot (Firestore) com cancelamento no unmount
 * - Balões de diálogo alinhados: cliente à direita, corretor à esquerda
 * - Envio ágil via Enter (com suporte a Shift+Enter para quebra de linha)
 * - Marcação automática de mensagens lidas pelo cliente
 * - Estado vazio elegante com CTA para o catálogo de imóveis
 */

import {
  registerView,
  escapeHtml,
  formatData,
  showToast
} from "/panel-shell.js";

import {
  Conversas
} from "/lc-data.js";

import LivingCanvasAuth from "/auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

const db = LivingCanvasAuth.db;

// Estado local da view de mensagens
let activeUnsubscribes = [];
let conversaAtivaId = null;
let mensagensUnsubscribe = null;
let cacheCorretores = new Map();
let cacheImoveis = new Map();

async function buscarInfoCorretor(corretorId) {
  if (!corretorId) return null;
  if (cacheCorretores.has(corretorId)) return cacheCorretores.get(corretorId);

  try {
    const snap = await getDoc(doc(db, "corretoresPublicos", corretorId));
    if (snap.exists()) {
      const data = snap.data();
      cacheCorretores.set(corretorId, data);
      return data;
    }
  } catch (e) {
    console.warn("Aviso ao buscar corretor:", e.message);
  }
  return null;
}

async function buscarInfoImovel(imovelId) {
  if (!imovelId) return null;
  if (cacheImoveis.has(imovelId)) return cacheImoveis.get(imovelId);

  try {
    const snap = await getDoc(doc(db, "imoveis", imovelId));
    if (snap.exists()) {
      const data = snap.data();
      cacheImoveis.set(imovelId, data);
      return data;
    }
  } catch (e) {
    console.warn("Aviso ao buscar imóvel da conversa:", e.message);
  }
  return null;
}

function formatarHoraMsg(timestamp) {
  if (!timestamp) return "";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function scrollToBottomMessages() {
  const container = document.getElementById("chatMessagesScrollArea");
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// Renderiza a lista de mensagens dentro da conversa ativa
function renderizarMensagensNoChat(mensagens = [], currentUser) {
  const container = document.getElementById("chatMessagesScrollArea");
  if (!container) return;

  if (mensagens.length === 0) {
    container.innerHTML = `
      <div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:2rem; color:var(--text-muted);">
        <div style="font-size:2.5rem; margin-bottom:0.75rem;">👋</div>
        <h5 style="color:var(--cream, #f5f1e8); margin-bottom:0.4rem; font-size:1.05rem;">Inicie esta conversa</h5>
        <p style="font-size:0.85rem; max-width:320px; margin:0;">
          Envie suas dúvidas sobre valores, agendamento de visitas ou detalhes do imóvel.
        </p>
      </div>
    `;
    return;
  }

  let html = "";
  let ultimaDataTexto = "";

  mensagens.forEach((msg) => {
    const isMe = msg.remetenteId === currentUser.uid || msg.autorId === currentUser.uid;
    const hora = formatarHoraMsg(msg.enviadaEm);
    const d = msg.enviadaEm?.toDate ? msg.enviadaEm.toDate() : (msg.enviadaEm ? new Date(msg.enviadaEm) : new Date());
    const dataTexto = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

    // Separador de dia
    if (dataTexto !== ultimaDataTexto) {
      html += `
        <div style="text-align:center; margin:1rem 0 0.75rem 0;">
          <span style="display:inline-block; font-size:0.7rem; color:var(--text-muted); background:rgba(255,255,255,0.05); padding:0.2rem 0.65rem; border-radius:9999px; text-transform:uppercase; letter-spacing:0.04em;">
            ${escapeHtml(dataTexto)}
          </span>
        </div>
      `;
      ultimaDataTexto = dataTexto;
    }

    if (isMe) {
      // Mensagem do CLIENTE (alinhada à direita com tom verde esmeralda / marca)
      html += `
        <div style="display:flex; justify-content:flex-end; margin-bottom:0.75rem;">
          <div style="max-width:75%; background:rgba(10, 46, 42, 0.95); border:1px solid rgba(212, 175, 122, 0.3); border-radius:14px 14px 2px 14px; padding:0.65rem 0.9rem; color:var(--cream, #f5f1e8); box-shadow:0 2px 6px rgba(0,0,0,0.25);">
            <p style="margin:0; font-size:0.9rem; line-height:1.45; white-space:pre-wrap; word-break:break-word;">${escapeHtml(msg.texto || "")}</p>
            <div style="display:flex; justify-content:flex-end; align-items:center; gap:0.35rem; margin-top:0.3rem;">
              <span style="font-size:0.68rem; color:rgba(245, 241, 232, 0.6);">${escapeHtml(hora)}</span>
              <span style="font-size:0.68rem; color:var(--gold, #d4af7a);">${msg.lidaEm ? "✓✓" : "✓"}</span>
            </div>
          </div>
        </div>
      `;
    } else {
      // Mensagem do CORRETOR (alinhada à esquerda com tom escuro e borda suave)
      const nomeRemetente = msg.remetenteNome || "Corretor";
      html += `
        <div style="display:flex; justify-content:flex-start; margin-bottom:0.75rem; gap:0.5rem; align-items:flex-end;">
          <div style="width:28px; height:28px; border-radius:50%; background:var(--gold, #d4af7a); color:#0a2e2a; font-weight:700; font-size:0.75rem; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${escapeHtml(nomeRemetente.slice(0, 1).toUpperCase())}
          </div>
          <div style="max-width:75%; background:rgba(255, 255, 255, 0.06); border:1px solid rgba(255, 255, 255, 0.1); border-radius:14px 14px 14px 2px; padding:0.65rem 0.9rem; color:var(--cream, #f5f1e8); box-shadow:0 2px 6px rgba(0,0,0,0.2);">
            <div style="font-size:0.72rem; font-weight:600; color:var(--gold, #d4af7a); margin-bottom:0.2rem;">
              ${escapeHtml(nomeRemetente)}
            </div>
            <p style="margin:0; font-size:0.9rem; line-height:1.45; white-space:pre-wrap; word-break:break-word;">${escapeHtml(msg.texto || "")}</p>
            <div style="display:flex; justify-content:flex-end; align-items:center; margin-top:0.3rem;">
              <span style="font-size:0.68rem; color:var(--text-muted);">${escapeHtml(hora)}</span>
            </div>
          </div>
        </div>
      `;
    }
  });

  container.innerHTML = html;
  scrollToBottomMessages();
}

// Seleciona e abre uma conversa específica
async function abrirConversa(conversa, currentUser) {
  conversaAtivaId = conversa.id;

  // Atualiza classe ativa na barra lateral
  document.querySelectorAll(".item-conversa-canal").forEach(el => {
    el.style.background = el.dataset.id === conversa.id ? "rgba(212, 175, 122, 0.12)" : "transparent";
    el.style.borderColor = el.dataset.id === conversa.id ? "rgba(212, 175, 122, 0.35)" : "transparent";
  });

  const chatContainer = document.getElementById("chatActiveArea");
  if (!chatContainer) return;

  const imovel = await buscarInfoImovel(conversa.imovelId);
  const corretor = await buscarInfoCorretor(conversa.corretorId);

  const tituloImovel = imovel?.titulo || conversa.imovelTitulo || (conversa.imovelId ? `Imóvel #${conversa.imovelId.slice(0, 8)}` : "Atendimento Geral");
  const fotoImovel = imovel?.fotos?.[0] || "assets/images/placeholder-property.jpg";
  const nomeCorretor = corretor?.nome || (conversa.corretorId ? "Equipe de Atendimento" : "Consultor Imobiliário");

  chatContainer.innerHTML = `
    <!-- Topbar do Chat -->
    <div style="padding:0.85rem 1.25rem; border-bottom:1px solid rgba(255,255,255,0.08); background:rgba(0,0,0,0.25); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
      <div style="display:flex; align-items:center; gap:0.85rem;">
        <img 
          src="${escapeHtml(fotoImovel)}" 
          alt="${escapeHtml(tituloImovel)}" 
          style="width:42px; height:42px; border-radius:8px; object-fit:cover; border:1px solid rgba(212,175,122,0.3);"
          onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'42\\' height=\\'42\\'%3E%3Crect width=\\'42\\' height=\\'42\\' fill=\\'%230a2e2a\\'/%3E%3C/svg%3E';"
        />
        <div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <strong style="color:var(--cream, #f5f1e8); font-size:0.95rem;">${escapeHtml(tituloImovel)}</strong>
            ${conversa.imovelId ? `
              <a href="imovel.html?id=${encodeURIComponent(conversa.imovelId)}" target="_blank" rel="noopener noreferrer" style="font-size:0.75rem; color:var(--gold, #d4af7a); text-decoration:none;" title="Ver detalhes do imóvel">
                ↗ Detalhes
              </a>
            ` : ""}
          </div>
          <span style="font-size:0.78rem; color:var(--text-muted); display:flex; align-items:center; gap:0.35rem;">
            👤 Corretor: <strong style="color:var(--text-light);">${escapeHtml(nomeCorretor)}</strong>
          </span>
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:0.5rem;">
        ${conversa.imovelId ? `
          <a href="agendar.html?imovelId=${encodeURIComponent(conversa.imovelId)}" class="panel-btn panel-btn-secondary panel-btn-sm" style="font-size:0.75rem; padding:0.35rem 0.65rem;">
            📅 Agendar Visita
          </a>
        ` : ""}
      </div>
    </div>

    <!-- Área de Mensagens (Scrollable) -->
    <div id="chatMessagesScrollArea" style="flex:1; overflow-y:auto; padding:1.25rem; min-height:360px; max-height:480px; display:flex; flex-direction:column;">
      <div style="text-align:center; padding:2rem; color:var(--text-muted);">
        <div class="panel-skeleton" style="height:60px; margin-bottom:0.75rem;"></div>
        <div class="panel-skeleton" style="height:60px;"></div>
      </div>
    </div>

    <!-- Barra de Input e Envio -->
    <div style="padding:0.85rem 1.25rem; border-top:1px solid rgba(255,255,255,0.08); background:rgba(0,0,0,0.3);">
      <form id="formChatEnviar" onsubmit="window.enviarMensagemCliente(event)" style="display:flex; gap:0.65rem; align-items:flex-end;">
        <div style="flex:1; position:relative;">
          <textarea 
            id="chatInputTexto" 
            rows="1" 
            placeholder="Escreva sua mensagem... (Enter para enviar, Shift+Enter para nova linha)"
            style="width:100%; resize:none; padding:0.65rem 0.85rem; font-size:0.9rem; line-height:1.4; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); color:var(--cream, #f5f1e8); outline:none; font-family:inherit;"
            onkeydown="window.handleChatKeydown(event)"
          ></textarea>
        </div>
        <button type="submit" id="btnChatEnviar" class="panel-btn panel-btn-primary" style="padding:0.65rem 1.1rem; height:42px; display:flex; align-items:center; justify-content:center; gap:0.35rem;">
          <span>Enviar</span>
          <span style="font-size:1.1rem;">➤</span>
        </button>
      </form>
    </div>
  `;

  // Marca conversa como lida pelo cliente
  try {
    await Conversas.marcarLidas(conversa.id, "cliente");
  } catch (err) {
    console.warn("Aviso ao marcar conversa lida:", err.message);
  }

  // Cancela escuta anterior e inicia escuta em tempo real da subcoleção de mensagens
  if (typeof mensagensUnsubscribe === "function") {
    mensagensUnsubscribe();
  }

  mensagensUnsubscribe = Conversas.escutarMensagens(conversa.id, (lista) => {
    renderizarMensagensNoChat(lista, currentUser);
  });
  activeUnsubscribes.push(mensagensUnsubscribe);
}

// Renderiza a casca da view de mensagens com layout Split (Canais | Chat Ativo)
function inicializarViewMensagens(container, user) {
  if (!container || !user) return;

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: minmax(280px, 340px) 1fr; gap:1.25rem; min-height:540px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:12px; overflow:hidden;" id="layoutMensagensSplit">
      
      <!-- Coluna da Esquerda: Canais / Conversas -->
      <div style="border-right:1px solid rgba(255,255,255,0.08); background:rgba(0,0,0,0.15); display:flex; flex-direction:column;">
        <div style="padding:1rem; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h4 style="margin:0; font-size:1rem; color:var(--cream, #f5f1e8); font-weight:600;">Canais de Atendimento</h4>
            <span style="font-size:0.75rem; color:var(--text-muted);">Suas conversas diretas</span>
          </div>
          <a href="imoveis.html" class="panel-btn panel-btn-secondary panel-btn-sm" style="font-size:0.75rem; padding:0.3rem 0.55rem;" title="Explorar mais imóveis">
            + Novo Canal
          </a>
        </div>
        
        <div id="chatCanaisLista" style="flex:1; overflow-y:auto; padding:0.5rem; display:flex; flex-direction:column; gap:0.35rem;">
          <div class="panel-skeleton" style="height:65px; border-radius:8px; margin-bottom:0.5rem;"></div>
          <div class="panel-skeleton" style="height:65px; border-radius:8px;"></div>
        </div>
      </div>

      <!-- Coluna da Direita: Área do Chat Ativo -->
      <div id="chatActiveArea" style="display:flex; flex-direction:column; background:rgba(255,255,255,0.01);">
        <div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:3rem 1.5rem; color:var(--text-muted);">
          <div style="font-size:3rem; margin-bottom:1rem;">💬</div>
          <h4 style="color:var(--cream, #f5f1e8); margin-bottom:0.5rem;">Selecione uma conversa</h4>
          <p style="font-size:0.88rem; max-width:380px; margin:0;">
            Escolha um canal à esquerda para visualizar as mensagens trocadas ou tirar dúvidas com seu corretor.
          </p>
        </div>
      </div>

    </div>
  `;

  // Escuta lista de conversas do usuário em tempo real
  const unsubConversas = Conversas.listar({ usuarioId: user.uid }, async (conversas) => {
    const listaContainer = document.getElementById("chatCanaisLista");
    if (!listaContainer) return;

    if (!conversas || conversas.length === 0) {
      listaContainer.innerHTML = `
        <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted);">
          <div style="font-size:2rem; margin-bottom:0.5rem;">📭</div>
          <p style="font-size:0.85rem; margin-bottom:1rem; line-height:1.4;">
            Você ainda não iniciou nenhuma conversa com nossos corretores.
          </p>
          <a href="imoveis.html" class="panel-btn panel-btn-primary panel-btn-sm" style="display:inline-block; font-size:0.78rem;">
            Explorar Imóveis
          </a>
        </div>
      `;

      const activeArea = document.getElementById("chatActiveArea");
      if (activeArea) {
        activeArea.innerHTML = `
          <div class="panel-empty-state" style="padding:4rem 2rem; text-align:center; margin:auto;">
            <div class="panel-empty-icon" style="font-size:3rem; margin-bottom:1rem;">💬</div>
            <h4 class="panel-empty-title" style="color:var(--cream, #f5f1e8); font-size:1.2rem; font-family:'Playfair Display', serif; margin-bottom:0.5rem;">
              Nenhum canal ativo
            </h4>
            <p class="panel-empty-desc" style="max-width:440px; margin:0 auto 1.5rem auto; font-size:0.9rem; color:var(--text-light); line-height:1.5;">
              Para conversar com o corretor responsável por um imóvel, acesse a página de detalhes do imóvel no catálogo e clique em <strong>Falar com o Corretor</strong>.
            </p>
            <a href="imoveis.html" class="panel-btn panel-btn-primary" style="text-decoration:none;">
              Ver Imóveis Disponíveis &rarr;
            </a>
          </div>
        `;
      }
      return;
    }

    // Busca detalhes dos imóveis para os canais
    const imoveisData = await Promise.all(conversas.map(c => buscarInfoImovel(c.imovelId)));

    listaContainer.innerHTML = conversas.map((c, idx) => {
      const imovel = imoveisData[idx];
      const titulo = imovel?.titulo || c.imovelTitulo || (c.imovelId ? `Imóvel #${c.imovelId.slice(0, 8)}` : "Atendimento Geral");
      const foto = imovel?.fotos?.[0] || "assets/images/placeholder-property.jpg";
      const naoLidas = Number(c.naoLidasCliente) || 0;
      const textoUltima = c.ultimaMensagemTexto || c.ultimaMensagem || "Conversa iniciada.";
      const isAtiva = c.id === conversaAtivaId;

      return `
        <div 
          class="item-conversa-canal" 
          data-id="${c.id}"
          onclick="window.selecionarCanalConversa('${c.id}')"
          style="display:flex; gap:0.75rem; align-items:center; padding:0.65rem 0.75rem; border-radius:8px; cursor:pointer; transition:all 0.15s ease; border:1px solid ${isAtiva ? 'rgba(212, 175, 122, 0.35)' : 'transparent'}; background:${isAtiva ? 'rgba(212, 175, 122, 0.12)' : 'transparent'};"
        >
          <img 
            src="${escapeHtml(foto)}" 
            alt="${escapeHtml(titulo)}" 
            style="width:42px; height:42px; border-radius:6px; object-fit:cover; flex-shrink:0; border:1px solid rgba(255,255,255,0.1);"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'42\\' height=\\'42\\'%3E%3Crect width=\\'42\\' height=\\'42\\' fill=\\'%230a2e2a\\'/%3E%3C/svg%3E';"
          />
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:0.15rem;">
              <strong style="font-size:0.85rem; color:var(--cream, #f5f1e8); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;">
                ${escapeHtml(titulo)}
              </strong>
              ${naoLidas > 0 ? `
                <span style="font-size:0.68rem; font-weight:700; background:var(--gold, #d4af7a); color:#0a2e2a; padding:0.1rem 0.4rem; border-radius:9999px;">
                  ${naoLidas}
                </span>
              ` : ""}
            </div>
            <p style="margin:0; font-size:0.78rem; color:${naoLidas > 0 ? 'var(--cream)' : 'var(--text-muted)'}; font-weight:${naoLidas > 0 ? '600' : '400'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${escapeHtml(textoUltima)}
            </p>
          </div>
        </div>
      `;
    }).join("");

    // Se nenhuma conversa estiver aberta, abre a primeira automaticamente
    if (!conversaAtivaId && conversas.length > 0) {
      abrirConversa(conversas[0], user);
    }
  });

  activeUnsubscribes.push(unsubConversas);
}

// Handlers no escopo global para o formulário de mensagens e cliques
window.selecionarCanalConversa = async function(conversaId) {
  const user = LivingCanvasAuth.auth.currentUser;
  if (!user || !conversaId) return;

  try {
    const snap = await getDoc(doc(db, "conversas", conversaId));
    if (snap.exists()) {
      abrirConversa({ id: snap.id, ...snap.data() }, user);
    }
  } catch (err) {
    console.error("Erro ao selecionar conversa:", err);
    showToast("Erro ao abrir canal selecionado.", "error");
  }
};

window.handleChatKeydown = function(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    window.enviarMensagemCliente(event);
  }
};

window.enviarMensagemCliente = async function(event) {
  if (event && event.preventDefault) event.preventDefault();

  const input = document.getElementById("chatInputTexto");
  const btn = document.getElementById("btnChatEnviar");
  const texto = input?.value?.trim() || "";

  if (!texto) return;
  if (!conversaAtivaId) {
    showToast("Nenhuma conversa selecionada.", "warning");
    return;
  }

  try {
    if (btn) btn.disabled = true;
    input.value = "";
    input.focus();

    await Conversas.enviar(conversaAtivaId, texto);
    scrollToBottomMessages();
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);
    showToast(`Erro ao enviar: ${err.message}`, "error");
    // Restaura o texto para o usuário não perder
    if (input) input.value = texto;
  } finally {
    if (btn) btn.disabled = false;
  }
};

// Registra a View 'mensagens' no shell do dashboard
registerView("mensagens", {
  titulo: "Mensagens & Atendimento",
  mount: (section, user) => {
    const container = document.getElementById("clientConversasContainer") || section;
    inicializarViewMensagens(container, user);
  },
  unmount: () => {
    // Cancela todos os listeners ativos de Firestore para prevenir memory leaks
    if (typeof mensagensUnsubscribe === "function") {
      mensagensUnsubscribe();
      mensagensUnsubscribe = null;
    }
    activeUnsubscribes.forEach(unsub => {
      if (typeof unsub === "function") {
        try { unsub(); } catch (e) {}
      }
    });
    activeUnsubscribes = [];
    conversaAtivaId = null;
  }
});
