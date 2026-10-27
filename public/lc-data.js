/**
 * Living Canvas - Shared Data Access Layer (lc-data.js)
 * 
 * Camada de dados central compartilhada entre o portal público, painel do cliente
 * (dashboard.html) e painel do corretor (painel-corretor.html).
 * 
 * Integração direta com Firestore e Firebase Storage (sem dependência de localStorage para regras de negócio).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-storage.js";

import LivingCanvasAuth from "./auth.js";

// Reuso estrito do Firestore inicializado via LivingCanvasAuth
// Utiliza o database ID customizado (firestoreDatabaseId) configurado no applet
const db = LivingCanvasAuth.db;
const auth = LivingCanvasAuth.auth;
const storage = getStorage(auth.app);
const firestoreDatabaseId = LivingCanvasAuth.config?.firestoreDatabaseId || "ai-studio-imobiliariabase-9b8dd04f-184a-4ea2-acf4-aadee30e202e";

// Utilitários internos
function getCurrentUserOrThrow(mensagem = "Usuário não autenticado. Faça login para continuar.") {
  const user = auth.currentUser;
  if (!user) {
    throw new Error(mensagem);
  }
  return user;
}

function sanitizeFileName(fileName) {
  const clean = (fileName || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
  const timestamp = Date.now();
  return `${timestamp}_${clean}`;
}

function timestampToDate(val) {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  if (val.seconds) return new Date(val.seconds * 1000);
  if (val instanceof Date) return val;
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ============================================================================
// 1. CHECKLISTS DE DOCUMENTOS
// ============================================================================
export const CHECKLISTS = {
  compra_financiada: {
    processo: "compra_financiada",
    titulo: "Compra Financiada",
    descricao: "Sugestão padrão de documentação para processo de aquisição via financiamento bancário (ajustável pelo corretor).",
    documentos: [
      { id: "rg_cnh", rotulo: "Documento de Identidade (RG ou CNH)", obrigatorio: true },
      { id: "cpf", rotulo: "Cadastro de Pessoa Física (CPF)", obrigatorio: true },
      { id: "comprovante_residencia", rotulo: "Comprovante de Residência Atualizado", obrigatorio: true },
      { id: "certidao_estado_civil", rotulo: "Certidão de Estado Civil (Nascimento ou Casamento)", obrigatorio: true },
      { id: "comprovante_renda", rotulo: "Comprovante de Renda (3 últimos holerites ou Declaração de IR)", obrigatorio: true },
      { id: "extrato_bancario", rotulo: "Extratos Bancários dos últimos 3 meses", obrigatorio: true },
      { id: "carteira_trabalho_fgts", rotulo: "Extrato do FGTS e Carteira de Trabalho (opcional para uso do saldo)", obrigatorio: false }
    ]
  },
  compra_a_vista: {
    processo: "compra_a_vista",
    titulo: "Compra à Vista",
    descricao: "Sugestão padrão de documentação para processo de aquisição à vista (ajustável pelo corretor).",
    documentos: [
      { id: "rg_cnh", rotulo: "Documento de Identidade (RG ou CNH)", obrigatorio: true },
      { id: "cpf", rotulo: "Cadastro de Pessoa Física (CPF)", obrigatorio: true },
      { id: "comprovante_residencia", rotulo: "Comprovante de Residência Atualizado", obrigatorio: true },
      { id: "certidao_estado_civil", rotulo: "Certidão de Estado Civil (Nascimento ou Casamento)", obrigatorio: true },
      { id: "declaracao_origem_recursos", rotulo: "Declaração de Origem dos Recursos / Declaração de IR", obrigatorio: false }
    ]
  },
  locacao: {
    processo: "locacao",
    titulo: "Locação Residencial",
    descricao: "Sugestão padrão de documentação para locação de imóvel residencial (ajustável pelo corretor).",
    documentos: [
      { id: "rg_cnh", rotulo: "Documento de Identidade (RG ou CNH)", obrigatorio: true },
      { id: "cpf", rotulo: "Cadastro de Pessoa Física (CPF)", obrigatorio: true },
      { id: "comprovante_residencia", rotulo: "Comprovante de Residência Atual", obrigatorio: true },
      { id: "comprovante_renda", rotulo: "Comprovante de Renda (comprovação de pelo menos 3x o aluguel)", obrigatorio: true },
      { id: "garantia_locaticia", rotulo: "Comprovante de Garantia Locatícia (Seguro Fiança, Fiador ou Caução)", obrigatorio: true }
    ]
  }
};

// ============================================================================
// 2. ATIVIDADES
// ============================================================================
export const Atividades = {
  async registrar({ usuarioId, tipo = "sistema", titulo, descricao = "", refTipo = null, refId = null }) {
    if (!usuarioId) {
      const user = auth.currentUser;
      usuarioId = user ? user.uid : null;
    }
    if (!usuarioId || !titulo) return null;

    try {
      const docRef = await addDoc(collection(db, "atividades"), {
        usuarioId,
        tipo,
        titulo,
        descricao,
        refTipo: refTipo || null,
        refId: refId || null,
        criadoEm: serverTimestamp()
      });
      return docRef.id;
    } catch (err) {
      console.warn("Aviso ao registrar atividade:", err.message);
      return null;
    }
  },

  async listar(usuarioId, limite = 20) {
    if (!usuarioId) {
      const user = getCurrentUserOrThrow();
      usuarioId = user.uid;
    }

    try {
      const q = query(
        collection(db, "atividades"),
        where("usuarioId", "==", usuarioId),
        orderBy("criadoEm", "desc"),
        limit(limite)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      // Fallback sem ordenação composta caso índices estejam sincronizando
      const fallbackQuery = query(
        collection(db, "atividades"),
        where("usuarioId", "==", usuarioId),
        limit(limite)
      );
      const snap = await getDocs(fallbackQuery);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
        const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
        return timeB - timeA;
      });
      return list;
    }
  }
};

// ============================================================================
// 3. LEADS (CRM)
// ============================================================================
export const Leads = {
  listar(filtros = {}, onChange = null) {
    let q = collection(db, "leads");
    const constraints = [];

    if (filtros.etapa) {
      constraints.push(where("etapa", "==", filtros.etapa));
    }
    if (filtros.corretorId) {
      constraints.push(where("corretorId", "==", filtros.corretorId));
    }
    if (filtros.usuarioId) {
      constraints.push(where("usuarioId", "==", filtros.usuarioId));
    }

    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }

    if (typeof onChange === "function") {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => {
          const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
          const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
          return timeB - timeA;
        });
        onChange(items);
      }, (err) => {
        console.warn("Aviso ao escutar leads em tempo real:", err.message);
      });
      return unsubscribe;
    }

    return (async () => {
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => {
        const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
        const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
        return timeB - timeA;
      });
      return items;
    })();
  },

  async atualizar(id, patch = {}) {
    if (!id) throw new Error("ID do lead não informado.");
    const docRef = doc(db, "leads", id);
    const data = {
      ...patch,
      atualizadoEm: serverTimestamp()
    };
    await updateDoc(docRef, data);
    return true;
  },

  async mover(id, etapa) {
    if (!id || !etapa) throw new Error("ID e etapa do lead são obrigatórios.");
    
    // Coerência com status legado
    let statusLegado = "em_atendimento";
    if (etapa === "novo") {
      statusLegado = "novo";
    } else if (etapa === "ganho" || etapa === "perdido") {
      statusLegado = "concluido";
    }

    const docRef = doc(db, "leads", id);
    const snap = await getDoc(docRef);
    const leadData = snap.exists() ? snap.data() : null;

    await updateDoc(docRef, {
      etapa,
      status: statusLegado,
      atualizadoEm: serverTimestamp()
    });

    if (leadData?.usuarioId) {
      await Atividades.registrar({
        usuarioId: leadData.usuarioId,
        tipo: "lead",
        titulo: `Lead atualizado para etapa: ${etapa}`,
        descricao: `O lead #${id.substring(0, 6)} avançou no funil de atendimento.`,
        refTipo: "lead",
        refId: id
      });
    }

    return true;
  },

  async moverEtapa(id, etapa, observacao = "") {
    return this.mover(id, etapa);
  },

  async adicionarNota(id, texto) {
    if (!id || !texto?.trim()) throw new Error("ID do lead e texto da anotação são obrigatórios.");
    const user = getCurrentUserOrThrow();
    const notasRef = collection(db, "leads", id, "notas");
    const docRef = await addDoc(notasRef, {
      texto: texto.trim(),
      autorId: user.uid,
      autorNome: user.displayName || user.email || "Corretor",
      criadoEm: serverTimestamp()
    });
    return docRef.id;
  },

  async listarNotas(id) {
    if (!id) throw new Error("ID do lead não informado.");
    const notasRef = collection(db, "leads", id, "notas");
    const q = query(notasRef, orderBy("criadoEm", "asc"));
    try {
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {
      const snap = await getDocs(notasRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
        const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
        return timeA - timeB;
      });
      return list;
    }
  }
};

// ============================================================================
// 4. VISITAS
// ============================================================================
export const Visitas = {
  async solicitar({ imovelId, data, horario, tipoVisita = "presencial", observacao = "", imovelTitulo = "", corretorId = null }) {
    const user = getCurrentUserOrThrow("Faça login para agendar uma visita.");
    if (!imovelId || !data || !horario) {
      throw new Error("Imóvel, data e horário são obrigatórios para agendar visita.");
    }

    const docRef = await addDoc(collection(db, "visitas"), {
      imovelId,
      imovelTitulo: imovelTitulo || "Imóvel Selecionado",
      usuarioId: user.uid,
      clienteNome: user.displayName || "Cliente",
      clienteEmail: user.email || "",
      clienteTelefone: user.phoneNumber || "",
      corretorId: corretorId || null,
      data,
      horario,
      tipoVisita,
      status: "pendente",
      observacao: observacao || "",
      motivoCancelamento: null,
      propostaData: null,
      propostoHorario: null,
      avaliacao: null,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    await Atividades.registrar({
      usuarioId: user.uid,
      tipo: "visita",
      titulo: `Visita solicitada: ${imovelTitulo || "Imóvel"}`,
      descricao: `Agendamento solicitado para ${data} às ${horario} (${tipoVisita}).`,
      refTipo: "visita",
      refId: docRef.id
    });

    return docRef.id;
  },

  async listarDoCliente(uid) {
    const targetUid = uid || getCurrentUserOrThrow().uid;
    const q = query(
      collection(db, "visitas"),
      where("usuarioId", "==", targetUid)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
      const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
      return timeB - timeA;
    });
    return list;
  },

  listarDoCorretor(filtros = {}, onChange = null) {
    let q = collection(db, "visitas");
    const constraints = [];

    if (filtros.corretorId) {
      constraints.push(where("corretorId", "==", filtros.corretorId));
    }
    if (filtros.status) {
      constraints.push(where("status", "==", filtros.status));
    }

    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }

    if (typeof onChange === "function") {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (a.data || "").localeCompare(b.data || ""));
        onChange(items);
      }, (err) => {
        console.warn("Aviso ao escutar visitas do corretor:", err.message);
      });
      return unsubscribe;
    }

    return (async () => {
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (a.data || "").localeCompare(b.data || ""));
      return items;
    })();
  },

  async alterarStatus(id, status, extra = {}) {
    if (!id || !status) throw new Error("ID e status são obrigatórios.");
    const docRef = doc(db, "visitas", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("Visita não encontrada.");
    const visita = snap.data();

    await updateDoc(docRef, {
      status,
      ...extra,
      atualizadoEm: serverTimestamp()
    });

    if (visita.usuarioId) {
      await Atividades.registrar({
        usuarioId: visita.usuarioId,
        tipo: "visita",
        titulo: `Status da visita atualizado: ${status}`,
        descricao: `Visita para ${visita.data || ""} foi atualizada para "${status}".`,
        refTipo: "visita",
        refId: id
      });
    }

    return true;
  },

  async cancelar(id, motivo = "Cancelamento solicitado") {
    return this.alterarStatus(id, "cancelada", {
      motivoCancelamento: motivo
    });
  },

  async reagendar(id, novaData, novoHorario) {
    if (!novaData || !novoHorario) throw new Error("Nova data e novo horário são obrigatórios.");
    return this.alterarStatus(id, "reagendada", {
      data: novaData,
      horario: novoHorario,
      propostaData: novaData,
      propostoHorario: novoHorario
    });
  },

  async avaliar(id, nota, comentario = "") {
    if (!id || !nota) throw new Error("ID da visita e nota são obrigatórios.");
    if (nota < 1 || nota > 5) throw new Error("A nota deve ser entre 1 e 5.");
    const docRef = doc(db, "visitas", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("Visita não encontrada.");
    const visita = snap.data();

    await updateDoc(docRef, {
      avaliacao: {
        nota: Number(nota),
        comentario: comentario || "",
        avaliadoEm: serverTimestamp()
      },
      atualizadoEm: serverTimestamp()
    });

    if (visita.usuarioId) {
      await Atividades.registrar({
        usuarioId: visita.usuarioId,
        tipo: "visita",
        titulo: "Visita avaliada",
        descricao: `Você avaliou a visita em ${visita.imovelTitulo || "imóvel"} com nota ${nota} estrelas.`,
        refTipo: "visita",
        refId: id
      });
    }

    return true;
  }
};

// ============================================================================
// 5. PROPOSTAS
// ============================================================================
export const Propostas = {
  async criar({ imovelId, valor, formaPagamento = "financiamento", condicoes = "", validade = "", imovelTitulo = "", corretorId = null }) {
    const user = getCurrentUserOrThrow("Faça login para enviar uma proposta.");
    const numValor = Number(valor);
    if (!imovelId || isNaN(numValor) || numValor <= 0) {
      throw new Error("Imóvel e valor válido são obrigatórios para proposta.");
    }

    const primeiraRodada = {
      autor: "cliente",
      valor: numValor,
      condicoes: condicoes || "",
      em: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, "propostas"), {
      imovelId,
      imovelTitulo: imovelTitulo || "Imóvel",
      usuarioId: user.uid,
      clienteNome: user.displayName || "Cliente",
      clienteEmail: user.email || "",
      corretorId: corretorId || null,
      valor: numValor,
      formaPagamento,
      condicoes: condicoes || "",
      validade: validade || "",
      status: "enviada",
      rodadas: [primeiraRodada],
      motivoRecusa: null,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    await Atividades.registrar({
      usuarioId: user.uid,
      tipo: "proposta",
      titulo: `Proposta enviada: ${imovelTitulo || "Imóvel"}`,
      descricao: `Proposta no valor de R$ ${numValor.toLocaleString("pt-BR")} via ${formaPagamento}.`,
      refTipo: "proposta",
      refId: docRef.id
    });

    return docRef.id;
  },

  async listarDoCliente(uid) {
    const targetUid = uid || getCurrentUserOrThrow().uid;
    const q = query(
      collection(db, "propostas"),
      where("usuarioId", "==", targetUid)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
      const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
      return timeB - timeA;
    });
    return list;
  },

  listarDoCorretor(filtros = {}, onChange = null) {
    let q = collection(db, "propostas");
    const constraints = [];

    if (filtros.corretorId) {
      constraints.push(where("corretorId", "==", filtros.corretorId));
    }
    if (filtros.status) {
      constraints.push(where("status", "==", filtros.status));
    }

    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }

    if (typeof onChange === "function") {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => {
          const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
          const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
          return timeB - timeA;
        });
        onChange(items);
      }, (err) => {
        console.warn("Aviso ao escutar propostas do corretor:", err.message);
      });
      return unsubscribe;
    }

    return (async () => {
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => {
        const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
        const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
        return timeB - timeA;
      });
      return items;
    })();
  },

  async responder(id, acao, dados = {}) {
    const acoesValidas = ["aceitar", "recusar", "contraproposta", "cancelar"];
    if (!id || !acoesValidas.includes(acao)) {
      throw new Error(`Ação inválida. Escolha entre: ${acoesValidas.join(", ")}`);
    }

    const docRef = doc(db, "propostas", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("Proposta não encontrada.");
    const proposta = snap.data();

    const rodadasAtuais = Array.isArray(proposta.rodadas) ? [...proposta.rodadas] : [];
    const updateData = {
      atualizadoEm: serverTimestamp()
    };

    const isCorretor = dados.autor === "corretor" || (auth.currentUser?.email?.includes("corretor"));

    if (acao === "aceitar") {
      updateData.status = "aceita";
    } else if (acao === "recusar") {
      updateData.status = "recusada";
      if (isCorretor && dados.motivo) {
        updateData.motivoRecusa = dados.motivo;
      }
    } else if (acao === "cancelar") {
      updateData.status = "cancelada";
      if (isCorretor && dados.motivo) {
        updateData.motivoRecusa = dados.motivo;
      }
    } else if (acao === "contraproposta") {
      const novoValor = Number(dados.valor);
      if (isNaN(novoValor) || novoValor <= 0) {
        throw new Error("Valor válido é obrigatório para contraproposta.");
      }
      updateData.status = "contraproposta";
      updateData.valorAtual = novoValor;
      rodadasAtuais.push({
        autor: dados.autor || (isCorretor ? "corretor" : "cliente"),
        valor: novoValor,
        condicoes: dados.condicoes || "",
        em: new Date().toISOString()
      });
      updateData.rodadas = rodadasAtuais;
    }

    await updateDoc(docRef, updateData);

    if (proposta.usuarioId) {
      await Atividades.registrar({
        usuarioId: proposta.usuarioId,
        tipo: "proposta",
        titulo: `Proposta ${acao}: ${proposta.imovelTitulo || "Imóvel"}`,
        descricao: `Ação "${acao}" registrada na proposta de R$ ${(proposta.valor || 0).toLocaleString("pt-BR")}.`,
        refTipo: "proposta",
        refId: id
      });
    }

    return true;
  }
};

// ============================================================================
// 6. CONVERSAS E MENSAGENS
// ============================================================================
export const Conversas = {
  async abrirOuObter(usuarioId, imovelId = null) {
    const user = getCurrentUserOrThrow();
    const targetUserId = usuarioId || user.uid;

    const q = query(
      collection(db, "conversas"),
      where("usuarioId", "==", targetUserId)
    );
    const snap = await getDocs(q);
    const existentes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const encontrada = imovelId
      ? existentes.find(c => c.imovelId === imovelId)
      : existentes[0];

    if (encontrada) {
      return encontrada.id;
    }

    const docRef = await addDoc(collection(db, "conversas"), {
      usuarioId: targetUserId,
      corretorId: null,
      imovelId: imovelId || null,
      imovelTitulo: null,
      ultimaMensagem: "",
      ultimaAtividade: serverTimestamp(),
      naoLidasCliente: 0,
      naoLidasCorretor: 0,
      criadaEm: serverTimestamp(),
      atualizadaEm: serverTimestamp()
    });

    return docRef.id;
  },

  listar(escopo = {}, onChange = null) {
    let q = collection(db, "conversas");
    const constraints = [];

    if (escopo.usuarioId) {
      constraints.push(where("usuarioId", "==", escopo.usuarioId));
    }
    if (escopo.corretorId) {
      constraints.push(where("corretorId", "==", escopo.corretorId));
    }

    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }

    if (typeof onChange === "function") {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const timeA = a.ultimaAtividade?.toMillis ? a.ultimaAtividade.toMillis() : (a.ultimaAtividade?.seconds ? a.ultimaAtividade.seconds * 1000 : 0);
          const timeB = b.ultimaAtividade?.toMillis ? b.ultimaAtividade.toMillis() : (b.ultimaAtividade?.seconds ? b.ultimaAtividade.seconds * 1000 : 0);
          return timeB - timeA;
        });
        onChange(list);
      }, (err) => {
        console.warn("Aviso ao escutar conversas:", err.message);
      });
      return unsubscribe;
    }

    return (async () => {
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.ultimaAtividade?.toMillis ? a.ultimaAtividade.toMillis() : (a.ultimaAtividade?.seconds ? a.ultimaAtividade.seconds * 1000 : 0);
        const timeB = b.ultimaAtividade?.toMillis ? b.ultimaAtividade.toMillis() : (b.ultimaAtividade?.seconds ? b.ultimaAtividade.seconds * 1000 : 0);
        return timeB - timeA;
      });
      return list;
    })();
  },

  escutarMensagens(conversaId, callback) {
    if (!conversaId) throw new Error("ID da conversa não informado.");
    if (typeof callback !== "function") throw new Error("Callback de escuta deve ser uma função.");

    const msgsRef = collection(db, "conversas", conversaId, "mensagens");
    const q = query(msgsRef, orderBy("enviadaEm", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(list);
    }, (err) => {
      console.warn("Aviso ao escutar mensagens:", err.message);
      // Fallback sem orderBy em caso de índice em sincronização
      const fallbackSnap = getDocs(msgsRef).then(snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => {
          const timeA = a.enviadaEm?.toMillis ? a.enviadaEm.toMillis() : (a.enviadaEm?.seconds ? a.enviadaEm.seconds * 1000 : 0);
          const timeB = b.enviadaEm?.toMillis ? b.enviadaEm.toMillis() : (b.enviadaEm?.seconds ? b.enviadaEm.seconds * 1000 : 0);
          return timeA - timeB;
        });
        callback(items);
      }).catch(() => {});
    });

    return unsubscribe;
  },

  async enviar(conversaId, texto) {
    const user = getCurrentUserOrThrow("Faça login para enviar mensagens.");
    const textoLimpo = (texto || "").trim();
    if (!conversaId || !textoLimpo) {
      throw new Error("Conversa e texto da mensagem são obrigatórios.");
    }

    const conversaRef = doc(db, "conversas", conversaId);
    const convSnap = await getDoc(conversaRef);
    if (!convSnap.exists()) throw new Error("Conversa não encontrada.");
    const conv = convSnap.data();

    const isCorretor = user.uid === conv.corretorId || user.email?.includes("corretor");
    const remetentePapel = isCorretor ? "corretor" : "cliente";

    const msgsRef = collection(db, "conversas", conversaId, "mensagens");
    await addDoc(msgsRef, {
      conversaId,
      autorId: user.uid,
      remetenteId: user.uid,
      remetentePapel,
      remetenteNome: user.displayName || user.email || "Usuário",
      texto: textoLimpo,
      enviadaEm: serverTimestamp(),
      lidaEm: null
    });

    const updateConv = {
      ultimaMensagem: textoLimpo,
      ultimaAtividade: serverTimestamp(),
      atualizadaEm: serverTimestamp()
    };

    if (remetentePapel === "cliente") {
      updateConv.naoLidasCorretor = (conv.naoLidasCorretor || 0) + 1;
    } else {
      updateConv.naoLidasCliente = (conv.naoLidasCliente || 0) + 1;
    }

    await updateDoc(conversaRef, updateConv);
    return true;
  },

  async marcarLidas(conversaId, papel = "cliente") {
    if (!conversaId) return;
    const conversaRef = doc(db, "conversas", conversaId);

    try {
      if (papel === "cliente") {
        await updateDoc(conversaRef, { naoLidasCliente: 0 });
      } else {
        await updateDoc(conversaRef, { naoLidasCorretor: 0 });
      }
      return true;
    } catch (err) {
      console.warn("Aviso ao marcar mensagens lidas na conversa:", err.message);
      return false;
    }
  },

  async abrirOuObterComCliente(clienteUid, clienteNome = "Cliente", imovelId = null, imovelTitulo = null) {
    const user = getCurrentUserOrThrow("Faça login para abrir conversa.");
    if (!clienteUid) throw new Error("UID do cliente é obrigatório.");

    // Procura se já existe conversa entre este corretor e este cliente
    try {
      const q = query(
        collection(db, "conversas"),
        where("corretorId", "==", user.uid),
        where("clienteId", "==", clienteUid)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs[0].id;
      }
    } catch (err) {
      console.warn("Aviso ao buscar conversa existente:", err.message);
    }

    // Se não encontrou, cria uma nova conversa
    const novaRef = await addDoc(collection(db, "conversas"), {
      clienteId: clienteUid,
      clienteNome,
      corretorId: user.uid,
      corretorNome: user.displayName || user.email || "Corretor",
      imovelId: imovelId || null,
      imovelTitulo: imovelTitulo || null,
      ultimaMensagem: "",
      naoLidasCliente: 0,
      naoLidasCorretor: 0,
      criadaEm: serverTimestamp(),
      ultimaAtividade: serverTimestamp(),
      atualizadaEm: serverTimestamp()
    });

    return novaRef.id;
  }
};

// ============================================================================
// 7. DOCUMENTOS E STORAGE
// ============================================================================
export const Documentos = {
  async solicitar(usuarioId, processo, tipo, extra = {}) {
    if (!usuarioId || !processo || !tipo) {
      throw new Error("Usuário, processo e tipo do documento são obrigatórios.");
    }

    const docRef = await addDoc(collection(db, "documentos"), {
      usuarioId,
      clienteNome: extra.clienteNome || "Cliente",
      processo,
      tipo,
      nomeOriginal: null,
      storagePath: null,
      url: null,
      tamanhoBytes: null,
      mimeType: null,
      status: "pendente",
      motivoReprovacao: null,
      revisadoEm: null,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    await Atividades.registrar({
      usuarioId,
      tipo: "documento",
      titulo: `Documento solicitado: ${tipo}`,
      descricao: `O corretor solicitou o envio do documento para o processo "${processo}".`,
      refTipo: "documento",
      refId: docRef.id
    });

    return docRef.id;
  },

  async enviar(file, { processo = "compra_financiada", tipo = "identidade", usuarioId = null, onProgress = null } = {}) {
    const user = getCurrentUserOrThrow("Faça login para enviar documentos.");
    const targetUid = usuarioId || user.uid;

    if (!file) throw new Error("Arquivo não selecionado.");

    // Validação estrita de tamanho (máximo 15 MB)
    const MAX_SIZE = 15 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      throw new Error("Arquivo excede o limite máximo de 15 MB.");
    }

    // Validação de formato (apenas imagens e PDF)
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp"
    ];
    if (!allowedTypes.includes(file.type)) {
      throw new Error("Formato não suportado. Envie imagens (JPG, PNG, WEBP) ou PDF.");
    }

    const cleanName = sanitizeFileName(file.name);
    const storagePath = `documentos/${targetUid}/${processo}/${cleanName}`;
    const storageReference = ref(storage, storagePath);

    // Upload no Storage com suporte a progresso
    if (typeof onProgress === "function") {
      await new Promise((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageReference, file, {
          contentType: file.type
        });
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              onProgress(pct);
            }
          },
          (err) => reject(err),
          () => resolve()
        );
      });
    } else {
      await uploadBytes(storageReference, file, {
        contentType: file.type
      });
    }

    const downloadUrl = await getDownloadURL(storageReference);

    // Registro no Firestore
    const docRef = await addDoc(collection(db, "documentos"), {
      usuarioId: targetUid,
      clienteNome: user.displayName || "Cliente",
      processo,
      tipo,
      nomeOriginal: file.name,
      storagePath,
      url: downloadUrl,
      tamanhoBytes: file.size,
      mimeType: file.type,
      status: "enviado",
      motivoReprovacao: null,
      revisadoEm: null,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    await Atividades.registrar({
      usuarioId: targetUid,
      tipo: "documento",
      titulo: `Documento enviado: ${file.name}`,
      descricao: `Upload realizado para o processo "${processo}".`,
      refTipo: "documento",
      refId: docRef.id
    });

    return {
      id: docRef.id,
      url: downloadUrl,
      storagePath
    };
  },

  listar(escopo = {}, onChange = null) {
    let q = collection(db, "documentos");
    const constraints = [];

    if (escopo.usuarioId) {
      constraints.push(where("usuarioId", "==", escopo.usuarioId));
    }
    if (escopo.processo) {
      constraints.push(where("processo", "==", escopo.processo));
    }
    if (escopo.status) {
      constraints.push(where("status", "==", escopo.status));
    }

    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }

    if (typeof onChange === "function") {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
          const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
          return timeB - timeA;
        });
        onChange(list);
      }, (err) => {
        console.warn("Aviso ao escutar documentos:", err.message);
      });
      return unsubscribe;
    }

    return (async () => {
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
        const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
        return timeB - timeA;
      });
      return list;
    })();
  },

  async aprovar(id) {
    if (!id) throw new Error("ID do documento não informado.");
    const docRef = doc(db, "documentos", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("Documento não encontrado.");
    const docData = snap.data();

    await updateDoc(docRef, {
      status: "aprovado",
      motivoReprovacao: null,
      revisadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    if (docData.usuarioId) {
      await Atividades.registrar({
        usuarioId: docData.usuarioId,
        tipo: "documento",
        titulo: `Documento aprovado: ${docData.nomeOriginal || docData.tipo}`,
        descricao: "O documento enviado foi aprovado pela equipe de corretores.",
        refTipo: "documento",
        refId: id
      });
    }

    return true;
  },

  async reprovar(id, motivo) {
    if (!id || !motivo?.trim()) throw new Error("ID e motivo da reprovação são obrigatórios.");
    const docRef = doc(db, "documentos", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("Documento não encontrado.");
    const docData = snap.data();

    await updateDoc(docRef, {
      status: "reprovado",
      motivoReprovacao: motivo.trim(),
      revisadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    if (docData.usuarioId) {
      await Atividades.registrar({
        usuarioId: docData.usuarioId,
        tipo: "documento",
        titulo: `Documento reprovado: ${docData.nomeOriginal || docData.tipo}`,
        descricao: `Motivo: ${motivo.trim()}`,
        refTipo: "documento",
        refId: id
      });
    }

    return true;
  },

  async remover(id) {
    if (!id) throw new Error("ID do documento não informado.");
    const docRef = doc(db, "documentos", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return true;
    const data = snap.data();

    // Se possui arquivo no Storage, tenta remover
    if (data.storagePath) {
      try {
        const fileRef = ref(storage, data.storagePath);
        await deleteObject(fileRef);
      } catch (err) {
        console.warn("Aviso ao remover arquivo do Storage:", err.message);
      }
    }

    await deleteDoc(docRef);
    return true;
  },

  async urlDownload(id) {
    if (!id) throw new Error("ID do documento não informado.");
    const docRef = doc(db, "documentos", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("Documento não encontrado.");
    const data = snap.data();

    if (data.url) return data.url;
    if (data.storagePath) {
      const fileRef = ref(storage, data.storagePath);
      return await getDownloadURL(fileRef);
    }
    throw new Error("Arquivo não possui URL ou caminho associado.");
  },

  async listarDoCliente(uid) {
    const user = auth.currentUser;
    const targetUid = uid || (user ? user.uid : null);
    if (!targetUid) return [];
    return this.listar({ usuarioId: targetUid });
  }
};

// ============================================================================
// 8. SIMULAÇÕES
// ============================================================================
export const Simulacoes = {
  async salvar(dados = {}) {
    const user = getCurrentUserOrThrow("Faça login para salvar simulações.");
    const docRef = await addDoc(collection(db, "simulacoes"), {
      usuarioId: user.uid,
      tipo: dados.tipo || "financiamento",
      valorImovel: Number(dados.valorImovel) || 0,
      entrada: Number(dados.entrada) || 0,
      prazoMeses: Number(dados.prazoMeses) || 360,
      taxaJurosAnual: Number(dados.taxaJurosAnual) || 9.5,
      sistemaAmortizacao: dados.sistemaAmortizacao || "PRICE",
      primeiraParcela: Number(dados.primeiraParcela) || 0,
      ultimaParcela: Number(dados.ultimaParcela) || 0,
      totalPago: Number(dados.totalPago) || 0,
      criadoEm: serverTimestamp()
    });
    return docRef.id;
  },

  async listar(usuarioId) {
    const targetUid = usuarioId || getCurrentUserOrThrow().uid;
    const q = query(
      collection(db, "simulacoes"),
      where("usuarioId", "==", targetUid)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
      const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
      return timeB - timeA;
    });
    return list;
  },

  async excluir(id) {
    if (!id) throw new Error("ID da simulação não informado.");
    await deleteDoc(doc(db, "simulacoes", id));
    return true;
  }
};

// ============================================================================
// 9. CLIENTES (EXCLUSIVO PARA CORRETOR)
// ============================================================================
export const Clientes = {
  async listarClientes() {
    const q = query(
      collection(db, "usuarios"),
      where("role", "==", "cliente")
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async obterPerfilCompleto(uid) {
    if (!uid) throw new Error("UID do cliente não informado.");

    const userSnap = await getDoc(doc(db, "usuarios", uid));
    if (!userSnap.exists()) {
      throw new Error("Perfil de cliente não encontrado.");
    }
    const usuario = { id: userSnap.id, ...userSnap.data() };

    // Carregamento paralelo das coleções vinculadas
    const [visitasSnap, propostasSnap, docsSnap, ativSnap] = await Promise.all([
      getDocs(query(collection(db, "visitas"), where("usuarioId", "==", uid))),
      getDocs(query(collection(db, "propostas"), where("usuarioId", "==", uid))),
      getDocs(query(collection(db, "documentos"), where("usuarioId", "==", uid))),
      getDocs(query(collection(db, "atividades"), where("usuarioId", "==", uid), limit(30)))
    ]);

    const visitas = visitasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const propostas = propostasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const documentos = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const atividades = ativSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Notas internas do corretor sobre este cliente
    let notasCorretor = [];
    try {
      const notasSnap = await getDocs(collection(db, "usuarios", uid, "notasCorretor"));
      notasCorretor = notasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {
      // Ignora caso subcoleção esteja vazia
    }

    // Preferências compartilhadas (se o cliente tiver consentido)
    let favoritos = [];
    let buscasDesejadas = [];
    if (usuario.compartilharPreferencias === true) {
      try {
        const [favSnap, busSnap] = await Promise.all([
          getDocs(query(collection(db, "favoritos"), where("usuarioId", "==", uid))),
          getDocs(query(collection(db, "buscasDesejadas"), where("usuarioId", "==", uid)))
        ]);
        favoritos = favSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        buscasDesejadas = busSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (err) {
        console.warn("Aviso ao carregar preferências compartilhadas do cliente:", err.message);
      }
    }

    return {
      usuario,
      visitas,
      propostas,
      documentos,
      atividades,
      notasCorretor,
      favoritos,
      buscasDesejadas
    };
  },

  async adicionarNota(uid, texto) {
    const user = getCurrentUserOrThrow("Faça login para adicionar notas.");
    const textoLimpo = (texto || "").trim();
    if (!uid || !textoLimpo) {
      throw new Error("UID do cliente e texto da nota são obrigatórios.");
    }

    const notasRef = collection(db, "usuarios", uid, "notasCorretor");
    const docRef = await addDoc(notasRef, {
      corretorId: user.uid,
      corretorNome: user.displayName || user.email || "Corretor",
      texto: textoLimpo,
      criadoEm: serverTimestamp()
    });

    return docRef.id;
  },

  async listarNotas(uid) {
    if (!uid) return [];
    try {
      const notasRef = collection(db, "usuarios", uid, "notasCorretor");
      const snap = await getDocs(notasRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : (a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : 0);
        const timeB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : (b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : 0);
        return timeB - timeA;
      });
      return list;
    } catch (err) {
      console.warn("Aviso ao listar notas:", err.message);
      return [];
    }
  }
};

// ============================================================================
// 10. CORRETORES PÚBLICOS
// ============================================================================
export const CorretoresPublicos = {
  async obter(idOuSlug) {
    if (!idOuSlug) throw new Error("ID ou slug do corretor é obrigatório.");

    // Tenta primeiro por ID direto
    const docRef = doc(db, "corretoresPublicos", idOuSlug);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }

    // Tenta por slug
    const q = query(
      collection(db, "corretoresPublicos"),
      where("slug", "==", idOuSlug),
      limit(1)
    );
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const item = querySnap.docs[0];
      return { id: item.id, ...item.data() };
    }

    throw new Error("Corretor público não encontrado.");
  },

  async listarVisiveis() {
    const q = query(
      collection(db, "corretoresPublicos"),
      where("ativo", "==", true)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async obterOuCriarPerfil(uid, dadosIniciais = {}) {
    if (!uid) throw new Error("UID do corretor é obrigatório.");
    const docRef = doc(db, "corretoresPublicos", uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }

    // Cria perfil base se ainda não existir
    let userData = {};
    try {
      const userDocRef = doc(db, "usuarios", uid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) userData = userSnap.data();
    } catch (e) {
      console.warn("Aviso ao ler usuarios/{uid}:", e.message);
    }

    const perfilBase = {
      nome: userData.nome || dadosIniciais.nome || "Corretor(a) Living Canvas",
      email: userData.email || dadosIniciais.email || "",
      telefone: userData.telefone || dadosIniciais.telefone || "",
      whatsapp: userData.whatsapp || userData.telefone || dadosIniciais.telefone || "",
      creci: userData.creci || dadosIniciais.creci || "CRECI-SP 000000-F",
      bio: userData.bio || dadosIniciais.bio || "Especialista em imóveis residenciais de alto padrão e consultoria imobiliária personalizada.",
      fotoURL: userData.fotoURL || dadosIniciais.fotoURL || "",
      slug: (userData.nome || dadosIniciais.nome || "corretor").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "-"),
      especialidades: dadosIniciais.especialidades || ["Alto Padrão", "Lançamentos", "Investimentos"],
      bairros: dadosIniciais.bairros || ["Jardins", "Itaim Bibi", "Vila Nova Conceição", "Pinheiros"],
      redes: {
        instagram: dadosIniciais.instagram || "",
        linkedin: dadosIniciais.linkedin || ""
      },
      horarios: dadosIniciais.horarios || {
        diasSemana: ["seg", "ter", "qua", "qui", "sex"],
        inicioSemana: "09:00",
        fimSemana: "18:00",
        atendeSabado: true,
        inicioSabado: "09:00",
        fimSabado: "13:00",
        intervaloMinutos: 60
      },
      ativo: true,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    };

    await setDoc(docRef, perfilBase, { merge: true });
    return { id: uid, ...perfilBase };
  },

  async salvarPerfil(uid, patch = {}) {
    if (!uid) throw new Error("UID do corretor é obrigatório.");
    const docRef = doc(db, "corretoresPublicos", uid);
    const payload = {
      ...patch,
      atualizadoEm: serverTimestamp()
    };
    await setDoc(docRef, payload, { merge: true });

    // Atualiza espelho em usuarios/{uid} de forma segura
    try {
      const userDocRef = doc(db, "usuarios", uid);
      const userPatch = { atualizadoEm: serverTimestamp() };
      if (patch.nome) userPatch.nome = patch.nome;
      if (patch.telefone) userPatch.telefone = patch.telefone;
      if (patch.whatsapp) userPatch.whatsapp = patch.whatsapp;
      if (patch.fotoURL) userPatch.fotoURL = patch.fotoURL;
      if (patch.creci) userPatch.creci = patch.creci;
      if (patch.notificacoes) userPatch.notificacoes = patch.notificacoes;
      await updateDoc(userDocRef, userPatch);
    } catch (err) {
      console.warn("Aviso ao espelhar em usuarios/{uid}:", err.message);
    }

    return true;
  },

  async comprimirImagem(file, maxWidth = 800, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Erro ao comprimir imagem"));
            }
          }, "image/jpeg", quality);
        };
        img.onerror = () => reject(new Error("Arquivo de imagem inválido"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
      reader.readAsDataURL(file);
    });
  },

  async uploadAvatar(uid, file) {
    if (!uid) throw new Error("UID do corretor não informado.");
    if (!file) throw new Error("Nenhum arquivo selecionado.");

    if (!file.type.startsWith("image/")) {
      throw new Error("O arquivo precisa ser uma imagem (JPG, PNG, WebP).");
    }

    const blob = await this.comprimirImagem(file, 800, 0.82);
    if (blob.size > 2 * 1024 * 1024) {
      throw new Error("A imagem comprimida ultrapassa o limite de 2MB. Escolha uma foto menor.");
    }

    const fileName = `avatar_${Date.now()}.jpg`;
    const storageRef = ref(storage, `corretores/${uid}/${fileName}`);

    await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
    const downloadURL = await getDownloadURL(storageRef);

    await this.salvarPerfil(uid, { fotoURL: downloadURL });
    return downloadURL;
  }
};

// ============================================================================
// 11. CONTADORES PARA BADGES DE NOTIFICAÇÃO
// ============================================================================
export const Contadores = {
  async contarNaoLidas(papel = "cliente") {
    const user = auth.currentUser;
    if (!user) return 0;

    let total = 0;
    try {
      if (papel === "cliente") {
        // Notificações não lidas do cliente
        const qNotif = query(
          collection(db, "notificacoes"),
          where("usuarioId", "==", user.uid),
          where("lida", "==", false)
        );
        const snapNotif = await getDocs(qNotif);
        total += snapNotif.size;

        // Mensagens não lidas em conversas do cliente
        const qConv = query(
          collection(db, "conversas"),
          where("usuarioId", "==", user.uid)
        );
        const snapConv = await getDocs(qConv);
        snapConv.forEach(d => {
          total += (d.data().naoLidasCliente || 0);
        });
      } else {
        // Painel do corretor: mensagens não lidas pendentes
        const qConv = query(collection(db, "conversas"));
        const snapConv = await getDocs(qConv);
        snapConv.forEach(d => {
          total += (d.data().naoLidasCorretor || 0);
        });
      }
    } catch (err) {
      console.warn("Aviso ao contar não lidas:", err.message);
    }

    return total;
  },

  async contarVisitasPendentes(papel = "corretor") {
    const user = auth.currentUser;
    if (!user) return 0;

    try {
      if (papel === "corretor") {
        const q = query(
          collection(db, "visitas"),
          where("status", "==", "pendente")
        );
        const snap = await getDocs(q);
        return snap.size;
      } else {
        const q = query(
          collection(db, "visitas"),
          where("usuarioId", "==", user.uid),
          where("status", "==", "pendente")
        );
        const snap = await getDocs(q);
        return snap.size;
      }
    } catch (err) {
      console.warn("Aviso ao contar visitas pendentes:", err.message);
      return 0;
    }
  },

  async contarLeadsNovos() {
    try {
      const q = query(
        collection(db, "leads"),
        where("etapa", "==", "novo")
      );
      const snap = await getDocs(q);
      return snap.size;
    } catch (err) {
      console.warn("Aviso ao contar leads novos:", err.message);
      return 0;
    }
  }
};

// ============================================================================
// OBJETO UNIFICADO E EXPOSIÇÃO GLOBAL
// ============================================================================
export const LivingCanvasData = {
  db,
  auth,
  storage,
  firestoreDatabaseId,
  CHECKLISTS,
  Leads,
  Visitas,
  Propostas,
  Conversas,
  Documentos,
  Atividades,
  Simulacoes,
  Clientes,
  CorretoresPublicos,
  Contadores
};

if (typeof window !== "undefined") {
  window.LivingCanvasData = LivingCanvasData;
}

export default LivingCanvasData;
