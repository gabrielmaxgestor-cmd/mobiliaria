/**
 * Living Canvas - Lead Capture & Management Service
 * Integração direta com Firestore para captação de leads dos formulários:
 * - contato.html (origem: 'contato')
 * - vender.html (origem: 'vender')
 * - agendar.html (origem: 'agendar')
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

// Configuração padrão do Firebase
const firebaseConfig = {
  projectId: "climbing-starlight-m8gvj",
  appId: "1:371500905682:web:c04d452d25ac0343a9290b",
  apiKey: "AIzaSyBAUZyQSC8Bf3GswNTS-DArmLsrdNC-pW4",
  authDomain: "climbing-starlight-m8gvj.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-imobiliariabase-9b8dd04f-184a-4ea2-acf4-aadee30e202e",
  storageBucket: "climbing-starlight-m8gvj.firebasestorage.app",
  messagingSenderId: "371500905682",
  oAuthClientId: "371500905682-36c10kb8uhkojpcicu0pnr1ib12jq0e0.apps.googleusercontent.com"
};

// Inicialização do Firebase App e Firestore
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
let db;
try {
  if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } else {
    db = getFirestore(app);
  }
} catch (e) {
  console.warn("Inicializando Firestore de leads no modo padrão:", e);
  db = getFirestore(app);
}

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
  msgDiv.textContent = message;

  toast.appendChild(iconSpan);
  toast.appendChild(msgDiv);
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = "translateY(0)";
    toast.style.opacity = "1";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 5000);
}

/**
 * Validação básica de e-mail
 */
function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Salva um novo lead diretamente na coleção 'leads' no Firestore
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

  // Montagem do payload sem campos undefined
  const payload = {
    nome,
    email,
    telefone,
    origem,
    status: "novo",
    criadoEm: serverTimestamp()
  };

  if (data.assunto) payload.assunto = String(data.assunto).trim();
  if (data.mensagem) payload.mensagem = String(data.mensagem).trim();
  if (data.tipoImovel) payload.tipoImovel = String(data.tipoImovel).trim();
  if (data.enderecoImovel) payload.enderecoImovel = String(data.enderecoImovel).trim();
  if (data.valorEstimado != null && !isNaN(Number(data.valorEstimado))) {
    payload.valorEstimado = Number(data.valorEstimado);
  }
  if (data.imovelId) payload.imovelId = String(data.imovelId).trim();
  if (data.dataPreferida) payload.dataPreferida = String(data.dataPreferida).trim();
  if (data.horarioPreferido) payload.horarioPreferido = String(data.horarioPreferido).trim();
  if (data.tipoVisita) payload.tipoVisita = String(data.tipoVisita).trim();

  const docRef = await addDoc(collection(db, LEADS_COLLECTION), payload);
  return { id: docRef.id, ...payload };
}

/**
 * Configuração dos listeners de formulário na inicialização da página
 */
export function initLeadForms() {
  // 1. FORMULÁRIO DE CONTATO (contato.html)
  const formContato = document.getElementById("form-contato");
  if (formContato) {
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

        showToast("Sua mensagem foi enviada com sucesso! Nossa equipe entrará em contato em breve.", "success");
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
  if (formVender) {
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
          mensagem: `Solicitação de avaliação gratuita para imóvel do tipo '${tipoImovel}' localizado no bairro/endereço '${enderecoImovel}'.`
        });

        showToast("Solicitação de avaliação recebida com sucesso! Em até 48h você receberá nosso estudo completo.", "success");
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
  const formAgendar = document.getElementById("form-agendar");
  if (formAgendar) {
    formAgendar.addEventListener("submit", async (e) => {
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
          throw new Error("Por favor, selecione uma data e um horário no calendário acima antes de confirmar.");
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = "Confirmando visita...";
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

        showToast("Agendamento confirmado com sucesso! Enviamos os detalhes para o seu e-mail e WhatsApp.", "success");
        formAgendar.reset();

        // Reset dos seletores do calendário se existirem
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
  showToast,
  initLeadForms
};

export default window.LivingCanvasLeads;
