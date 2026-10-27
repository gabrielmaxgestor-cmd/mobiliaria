/**
 * Living Canvas - Lead Capture & Management Service
 * Integração direta com Firestore via LivingCanvasAuth e LivingCanvasData:
 * - contato.html (origem: 'contato')
 * - vender.html (origem: 'vender')
 * - agendar.html (origem: 'agendar')
 * - dashboard.html / painel-corretor.html (gestão de leads)
 */

import { 
  collection, 
  addDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import LivingCanvasAuth from "./auth.js";
import LivingCanvasData from "./lc-data.js";

const db = LivingCanvasAuth.db;
const auth = LivingCanvasAuth.auth;
const LEADS_COLLECTION = "leads";

/**
 * Exibe notificação visual estilo toast personalizada para o tema Living Canvas
 */
export function showToast(message, type = "success") {
  let toastContainer = document.getElementById("living-canvas-toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "living-canvas-toast-container";
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      pointer-events: none;
      max-width: 90vw;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement("div");
  const isSuccess = type === "success";
  toast.style.cssText = `
    min-width: 280px;
    max-width: 420px;
    padding: 1rem 1.4rem;
    border-radius: 12px;
    background: ${isSuccess ? "rgba(10, 28, 21, 0.96)" : "rgba(45, 12, 12, 0.96)"};
    border: 1px solid ${isSuccess ? "var(--gold, #D4AF37)" : "#E53935"};
    color: ${isSuccess ? "#F5F1E8" : "#FFCDD2"};
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(16px);
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.9rem;
    line-height: 1.5;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    transform: translateY(20px);
    opacity: 0;
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  const icon = isSuccess ? "✨" : "⚠️";
  const iconSpan = document.createElement("span");
  iconSpan.style.fontSize = "1.3rem";
  iconSpan.textContent = icon;

  const msgDiv = document.createElement("div");
  msgDiv.innerHTML = message; // Permite links formatados de retorno

  toast.appendChild(iconSpan);
  toast.appendChild(msgDiv);
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = "translateY(0)";
    toast.style.opacity = "1";
  });

  const duration = message.includes("<a") ? 8000 : 5000;
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, duration);
}

/**
 * Validação básica de e-mail
 */
function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Salva um novo lead na coleção 'leads' no Firestore com validação estrita das regras
 */
export async function saveLead(data) {
  // Validações obrigatórias client-side
  const nome = (data.nome || "").trim();
  const email = (data.email || "").trim();
  const telefone = (data.telefone || "").trim();
  const origem = (data.origem || "").trim();

  if (!nome || nome.length < 2) {
    throw new Error("Por favor, informe seu nome completo.");
  }
  if (!email || !isValidEmail(email)) {
    throw new Error("Por favor, informe um endereço de e-mail válido.");
  }
  if (!telefone || telefone.length < 8) {
    throw new Error("Por favor, informe um telefone ou WhatsApp para contato.");
  }
  if (!["contato", "vender", "agendar"].includes(origem)) {
    throw new Error("Origem de formulário inválida.");
  }

  // Montagem estrita do payload conforme firestore.rules
  const payload = {
    nome,
    email,
    telefone,
    origem,
    status: "novo",
    etapa: "novo",
    criadoEm: serverTimestamp()
  };

  // Se o usuário estiver autenticado, vincula usuarioId de forma estrita
  const currentUser = auth?.currentUser;
  if (currentUser && currentUser.uid) {
    payload.usuarioId = currentUser.uid;
  }

  // Chaves opcionais autorizadas pelas regras
  if (data.corretorId && typeof data.corretorId === "string" && data.corretorId.trim()) {
    payload.corretorId = data.corretorId.trim();
  }
  if (data.imovelId && typeof data.imovelId === "string" && data.imovelId.trim()) {
    payload.imovelId = data.imovelId.trim();
  }
  if (data.visitaId && typeof data.visitaId === "string" && data.visitaId.trim()) {
    payload.visitaId = data.visitaId.trim();
  }
  if (data.assunto && typeof data.assunto === "string" && data.assunto.trim()) {
    payload.assunto = data.assunto.trim();
  }
  if (data.mensagem && typeof data.mensagem === "string" && data.mensagem.trim()) {
    payload.mensagem = data.mensagem.trim();
  }
  if (data.dataPreferida && typeof data.dataPreferida === "string" && data.dataPreferida.trim()) {
    payload.dataPreferida = data.dataPreferida.trim();
  }
  if (data.horarioPreferido && typeof data.horarioPreferido === "string" && data.horarioPreferido.trim()) {
    payload.horarioPreferido = data.horarioPreferido.trim();
  }
  if (data.tipoVisita && typeof data.tipoVisita === "string" && data.tipoVisita.trim()) {
    payload.tipoVisita = data.tipoVisita.trim();
  }
  if (data.tipoImovel && typeof data.tipoImovel === "string" && data.tipoImovel.trim()) {
    payload.tipoImovel = data.tipoImovel.trim();
  }
  if (data.enderecoImovel && typeof data.enderecoImovel === "string" && data.enderecoImovel.trim()) {
    payload.enderecoImovel = data.enderecoImovel.trim();
  }
  if (data.valorEstimado != null && !isNaN(Number(data.valorEstimado))) {
    payload.valorEstimado = Number(data.valorEstimado);
  }

  try {
    const docRef = await addDoc(collection(db, LEADS_COLLECTION), payload);
    return {
      id: docRef.id,
      ...payload
    };
  } catch (err) {
    console.error("Erro ao salvar lead no Firestore:", err);
    throw new Error(err.message || "Erro ao conectar com o servidor para registrar o lead. Tente novamente.");
  }
}

/**
 * Retorna todos os leads (delega para LivingCanvasData.Leads)
 */
export async function getLeads(filtros = {}) {
  return LivingCanvasData.Leads.listar(filtros);
}

/**
 * Atualiza o status do lead (delega para LivingCanvasData.Leads)
 */
export async function updateLeadStatus(leadId, newStatus) {
  return LivingCanvasData.Leads.atualizar(leadId, { status: newStatus });
}

/**
 * Configuração dos listeners de formulário na inicialização da página
 */
export function initLeadForms() {
  // 1. FORMULÁRIO DE CONTATO (contato.html)
  const formContato = document.getElementById("form-contato");
  if (formContato && !formContato.dataset.bound) {
    formContato.dataset.bound = "true";
    formContato.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = formContato.querySelector("button[type='submit']");
      const originalText = submitBtn ? submitBtn.innerHTML : "Enviar Mensagem";

      try {
        const formData = new FormData(formContato);
        const nome = formData.get("nome");
        const email = formData.get("email");
        const telefone = formData.get("telefone");
        const assunto = formData.get("assunto");
        const mensagem = formData.get("mensagem");

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = "Enviando mensagem...";
        }

        await saveLead({
          nome,
          email,
          telefone,
          origem: "contato",
          assunto,
          mensagem
        });

        const isUserLoggedIn = Boolean(auth?.currentUser);
        const feedbackHtml = isUserLoggedIn
          ? `Mensagem enviada com sucesso! <a href="/dashboard.html" style="color: var(--gold, #d4af7a); text-decoration: underline; margin-left: 0.5rem; font-weight: 600;">Acompanhar no meu painel →</a>`
          : "Sua mensagem foi enviada com sucesso! Nossa equipe entrará em contato em breve.";

        showToast(feedbackHtml, "success");
        formContato.reset();

        if (submitBtn) {
          submitBtn.innerHTML = "✓ Mensagem Enviada!";
          setTimeout(() => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
          }, 3000);
        }
      } catch (err) {
        console.error("Erro ao enviar formulário de contato:", err);
        showToast(err.message || "Ocorreu um erro ao enviar sua mensagem. Por favor, tente novamente.", "error");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    });
  }

  // 2. FORMULÁRIO DE VENDER/AVALIAÇÃO (vender.html)
  const formVender = document.getElementById("form-vender");
  if (formVender && !formVender.dataset.bound) {
    formVender.dataset.bound = "true";
    formVender.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = formVender.querySelector("button[type='submit']");
      const originalText = submitBtn ? submitBtn.innerHTML : "Solicitar Avaliação Gratuita";

      try {
        const formData = new FormData(formVender);
        const nome = formData.get("nome");
        const telefone = formData.get("telefone");
        const email = formData.get("email");
        const tipoImovel = formData.get("tipoImovel");
        const enderecoImovel = formData.get("enderecoImovel");

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = "Processando avaliação...";
        }

        await saveLead({
          nome,
          telefone,
          email,
          tipoImovel,
          enderecoImovel,
          origem: "vender",
          assunto: "Avaliação de Imóvel para Venda",
          mensagem: `Solicitação de avaliação gratuita para imóvel do tipo '${tipoImovel}' localizado em '${enderecoImovel}'.`
        });

        const isUserLoggedIn = Boolean(auth?.currentUser);
        const feedbackHtml = isUserLoggedIn
          ? `Solicitação recebida com sucesso! <a href="/dashboard.html" style="color: var(--gold, #d4af7a); text-decoration: underline; margin-left: 0.5rem; font-weight: 600;">Acompanhar no meu painel →</a>`
          : "Solicitação de avaliação recebida com sucesso! Em até 48h você receberá nosso estudo completo.";

        showToast(feedbackHtml, "success");
        formVender.reset();

        if (submitBtn) {
          submitBtn.innerHTML = "✓ Solicitação Enviada!";
          setTimeout(() => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
          }, 3000);
        }
      } catch (err) {
        console.error("Erro ao enviar formulário de avaliação:", err);
        showToast(err.message || "Ocorreu um erro ao registrar sua solicitação. Por favor, tente novamente.", "error");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    });
  }

  // 3. FORMULÁRIO DE AGENDAMENTO (agendar.html)
  // agendar.html tem seu fluxo especializado acoplado à criação de visitas e leads
  const formAgendar = document.getElementById("form-agendar");
  if (formAgendar && !formAgendar.dataset.bound && !window._agendarCustomHandlerAttached) {
    formAgendar.dataset.bound = "true";
    formAgendar.addEventListener("submit", async (e) => {
      // Se agendar.html definiu seu próprio handler especializado, não duplica
      if (window._agendarHandlesSubmitInternally) return;

      e.preventDefault();
      const submitBtn = formAgendar.querySelector("button[type='submit']") || document.getElementById("bookingSubmit");
      const originalText = submitBtn ? submitBtn.innerHTML : "Confirmar Agendamento";

      try {
        const formData = new FormData(formAgendar);
        const nome = formData.get("nome");
        const telefone = formData.get("telefone");
        const email = formData.get("email");
        const mensagem = formData.get("mensagem");
        const imovelId = formData.get("imovelId") || (new URLSearchParams(window.location.search)).get("id") || "";
        const dataPreferida = formData.get("dataPreferida") || "";
        const horarioPreferido = formData.get("horarioPreferido") || "";
        const tipoVisita = formData.get("tipoVisita") || "presencial";

        if (!dataPreferida || !horarioPreferido) {
          throw new Error("Por favor, selecione uma data e um horário no calendário antes de confirmar.");
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = "Confirmando agendamento...";
        }

        await saveLead({
          nome,
          telefone,
          email,
          mensagem: mensagem || `Agendamento de visita (${tipoVisita}) para ${dataPreferida} às ${horarioPreferido}.`,
          imovelId,
          dataPreferida,
          horarioPreferido,
          tipoVisita,
          origem: "agendar",
          assunto: "Agendamento de Visita"
        });

        showToast("Agendamento confirmado com sucesso! Entraremos em contato com você.", "success");
        formAgendar.reset();

        if (typeof window.updateSummary === "function") {
          window.selectedDate = null;
          window.selectedTime = null;
          window.updateSummary();
        }

        if (submitBtn) {
          submitBtn.innerHTML = "✓ Agendamento Confirmado!";
          setTimeout(() => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
          }, 3000);
        }
      } catch (err) {
        console.error("Erro ao confirmar agendamento:", err);
        showToast(err.message || "Ocorreu um erro ao confirmar o agendamento. Por favor, tente novamente.", "error");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    });
  }
}

// Auto-inicialização quando o DOM estiver pronto
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLeadForms);
} else {
  initLeadForms();
}

window.LivingCanvasLeads = {
  saveLead,
  getLeads,
  updateLeadStatus,
  showToast,
  initLeadForms
};

export default window.LivingCanvasLeads;
