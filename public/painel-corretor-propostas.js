/**
 * Living Canvas - Painel do Corretor: Módulo Propostas e Mesa de Negociação (P8)
 * Acompanhamento em tempo real de propostas recebidas dos clientes,
 * comparativo financeiro x preço anunciado, histórico de rodadas,
 * aceite com opção de reserva de imóvel e disparo automático na conversa do cliente,
 * recusa justificada e envio de contrapropostas.
 */

import { registerView, escapeHtml, formatMoeda, formatData, showToast } from './panel-shell.js';
import { Propostas, Atividades, Conversas, auth, db } from './lc-data.js';
import {
  collection,
  query,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

let currentCorretor = null;
let unsubscribePropostas = null;
let allPropostas = [];
let propertiesCache = new Map(); // imovelId -> imovelData
let currentFilterStatus = 'todas'; // 'todas' | 'enviada' | 'contraproposta' | 'aceita' | 'recusada' | 'cancelada'
let searchQuery = '';

/**
 * Atualiza o badge do menu lateral (#corretorNavPropostasBadge)
 */
function updatePropostasBadge(count) {
  const badge = document.getElementById('corretorNavPropostasBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

/**
 * Busca dados do imóvel no Firestore para obter preço anunciado
 */
async function getPropertyInfo(imovelId) {
  if (!imovelId) return null;
  if (propertiesCache.has(imovelId)) {
    return propertiesCache.get(imovelId);
  }
  try {
    const propRef = doc(db, 'imoveis', imovelId);
    const snap = await getDoc(propRef);
    if (snap.exists()) {
      const data = { id: snap.id, ...snap.data() };
      propertiesCache.set(imovelId, data);
      return data;
    }
  } catch (err) {
    console.warn('Não foi possível obter dados do imóvel:', imovelId, err.message);
  }
  return null;
}

/**
 * Retorna badge e estilo de status da proposta
 */
function getProposalStatusBadge(status) {
  const map = {
    enviada: { label: 'Nova Proposta (Aguardando Resposta)', class: 'warning' },
    contraproposta: { label: 'Em Contraproposta', class: 'info' },
    aceita: { label: 'Proposta Aceita', class: 'success' },
    recusada: { label: 'Recusada', class: 'danger' },
    cancelada: { label: 'Cancelada', class: 'neutral' }
  };
  const item = map[status] || { label: status, class: 'neutral' };
  return `<span class="panel-badge ${item.class}">${item.label}</span>`;
}

/**
 * Calcula a diferença percentual entre o valor proposto e o preço anunciado
 */
function calculatePriceDiff(valorProposto, precoAnunciado) {
  const numProp = Number(valorProposto) || 0;
  const numAnunc = Number(precoAnunciado) || 0;
  if (numAnunc <= 0 || numProp <= 0) return null;

  const diffPercent = ((numProp - numAnunc) / numAnunc) * 100;
  const isPositive = diffPercent > 0;
  const isNegative = diffPercent < 0;

  return {
    percent: Math.abs(diffPercent).toFixed(1),
    isPositive,
    isNegative,
    isEqual: diffPercent === 0,
    text: isNegative
      ? `-${Math.abs(diffPercent).toFixed(1)}% abaixo do anunciado`
      : (isPositive ? `+${diffPercent.toFixed(1)}% acima do anunciado` : 'Igual ao preço de anúncio')
  };
}

/**
 * Renderiza o histórico de rodadas da proposta
 */
function renderRoundsHtml(rodadas) {
  if (!Array.isArray(rodadas) || rodadas.length === 0) {
    return '';
  }

  let html = `
    <div class="negotiation-rounds-wrap">
      <div class="negotiation-rounds-title">
        <span>🔄</span>
        <span>Histórico de Rodadas (${rodadas.length} rodada${rodadas.length > 1 ? 's' : ''})</span>
      </div>
      <div class="rounds-timeline">
  `;

  rodadas.forEach((rodada, idx) => {
    const isCorretor = rodada.autor === 'corretor';
    const authorLabel = isCorretor ? 'Corretor (Você)' : 'Cliente';
    const dateFormatted = rodada.em ? formatData(rodada.em, true) : 'Data registrada';

    html += `
      <div class="round-item ${isCorretor ? 'is-corretor' : ''}">
        <div>
          <div>
            <span class="round-author ${isCorretor ? 'corretor-badge' : ''}">${escapeHtml(authorLabel)}</span>
            <span class="round-meta">• Rodada #${idx + 1} • ${escapeHtml(dateFormatted)}</span>
          </div>
          <div class="round-details">
            <strong>Oferta:</strong> ${formatMoeda(rodada.valor)}
            ${rodada.condicoes ? `<div style="font-size:0.8rem; color:var(--text-light); margin-top:2px;">Condições: "${escapeHtml(rodada.condicoes)}"</div>` : ''}
          </div>
        </div>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  return html;
}

/**
 * Renderiza a lista de propostas filtradas
 */
async function renderPropostasList() {
  const container = document.getElementById('propostasListContainer');
  if (!container) return;

  let filtered = [...allPropostas];

  if (currentFilterStatus !== 'todas') {
    filtered = filtered.filter(p => p.status === currentFilterStatus);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      (p.clienteNome || '').toLowerCase().includes(q) ||
      (p.imovelTitulo || '').toLowerCase().includes(q) ||
      (p.clienteEmail || '').toLowerCase().includes(q) ||
      (p.formaPagamento || '').toLowerCase().includes(q)
    );
  }

  // Ordenação: 'enviada' e 'contraproposta' primeiro, depois por data de atualização/criação
  filtered.sort((a, b) => {
    const isPendingA = a.status === 'enviada' || a.status === 'contraproposta';
    const isPendingB = b.status === 'enviada' || b.status === 'contraproposta';
    if (isPendingA && !isPendingB) return -1;
    if (!isPendingA && isPendingB) return 1;

    const timeA = a.atualizadoEm?.toMillis ? a.atualizadoEm.toMillis() : (a.criadoEm?.toMillis ? a.criadoEm.toMillis() : 0);
    const timeB = b.atualizadoEm?.toMillis ? b.atualizadoEm.toMillis() : (b.criadoEm?.toMillis ? b.criadoEm.toMillis() : 0);
    return timeB - timeA;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="panel-empty-state">
        <div class="panel-empty-icon">📝</div>
        <h4 class="panel-empty-title">Nenhuma proposta encontrada</h4>
        <p class="panel-empty-desc">Não há propostas cadastradas com os filtros selecionados.</p>
      </div>
    `;
    return;
  }

  // Carrega informações dos imóveis ausentes no cache
  const imovelIdsToFetch = [...new Set(filtered.map(p => p.imovelId).filter(id => id && !propertiesCache.has(id)))];
  if (imovelIdsToFetch.length > 0) {
    await Promise.all(imovelIdsToFetch.map(id => getPropertyInfo(id)));
  }

  let html = '<div style="display:flex; flex-direction:column; gap:1.25rem;">';

  filtered.forEach(p => {
    const propInfo = propertiesCache.get(p.imovelId);
    const precoAnunciado = propInfo?.preco || propInfo?.valor || null;
    const diff = calculatePriceDiff(p.valor, precoAnunciado);

    const clientName = p.clienteNome || 'Cliente Interessado';
    const isPendingAction = p.status === 'enviada' || p.status === 'contraproposta';
    const isAccepted = p.status === 'aceita';
    const isRefused = p.status === 'recusada';

    // WhatsApp do cliente
    let whatsAppUrl = null;
    if (p.clienteTelefone) {
      const digits = String(p.clienteTelefone).replace(/\D/g, '');
      if (digits.length >= 8) {
        const fullNum = digits.startsWith('55') ? digits : `55${digits}`;
        const greeting = encodeURIComponent(
          `Olá ${clientName}, tudo bem? Sou seu corretor Living Canvas a respeito da proposta de ${formatMoeda(p.valor)} para o imóvel "${p.imovelTitulo || ''}".`
        );
        whatsAppUrl = `https://wa.me/${fullNum}?text=${greeting}`;
      }
    }

    html += `
      <div class="proposal-card" id="proposal-card-${p.id}">
        <!-- Cabeçalho -->
        <div class="proposal-header">
          <div>
            <div style="font-size:0.75rem; color:var(--gold); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.2rem;">
              Imóvel Vinculado
            </div>
            <a href="imovel.html?id=${encodeURIComponent(p.imovelId || '')}" target="_blank" rel="noopener noreferrer" class="visit-property-link" style="font-size:1.05rem;">
              🏡 ${escapeHtml(p.imovelTitulo || 'Ver Imóvel no Catálogo')} ↗
            </a>
            <div style="font-size:0.82rem; color:var(--text-light); margin-top:0.35rem;">
              Proponente: <strong>${escapeHtml(clientName)}</strong>
              ${p.clienteEmail ? `• ✉️ ${escapeHtml(p.clienteEmail)}` : ''}
              ${p.clienteTelefone ? `• 📞 ${escapeHtml(p.clienteTelefone)}` : ''}
            </div>
          </div>

          <div style="text-align:right;">
            ${getProposalStatusBadge(p.status)}
            <div style="font-size:0.75rem; color:var(--text-light); margin-top:0.4rem;">
              Recebida em: ${formatData(p.criadoEm, true)}
            </div>
          </div>
        </div>

        <!-- Caixa de Valores: Proposto x Anunciado -->
        <div class="proposal-values-box">
          <div>
            <div class="proposal-val-label">Valor Ofertado</div>
            <div class="proposal-val-number" style="color:var(--gold);">${formatMoeda(p.valor)}</div>
            ${diff ? `
              <div class="proposal-val-diff ${diff.isNegative ? 'diff-negative' : (diff.isPositive ? 'diff-positive' : 'diff-neutral')}">
                <span>${diff.isNegative ? '📉' : (diff.isPositive ? '📈' : '⚖️')}</span>
                <span>${escapeHtml(diff.text)}</span>
              </div>
            ` : ''}
          </div>

          ${precoAnunciado ? `
            <div>
              <div class="proposal-val-label">Preço Anunciado</div>
              <div class="proposal-val-number">${formatMoeda(precoAnunciado)}</div>
              <div style="font-size:0.75rem; color:var(--text-light); margin-top:0.25rem;">Valor de tabela</div>
            </div>
          ` : ''}

          <div>
            <div class="proposal-val-label">Forma de Pagamento</div>
            <div style="font-weight:600; color:var(--cream); font-size:0.95rem; text-transform:capitalize;">
              ${escapeHtml(p.formaPagamento || 'A combinar')}
            </div>
            ${p.validade ? `<div style="font-size:0.75rem; color:var(--text-light); margin-top:0.25rem;">Validade: ${escapeHtml(p.validade)}</div>` : ''}
          </div>
        </div>

        <!-- Condições Especiais -->
        ${p.condicoes ? `
          <div style="font-size:0.85rem; color:var(--cream); background:rgba(245,241,232,0.03); border-left:3px solid var(--gold); padding:0.5rem 0.85rem; border-radius:4px; margin-bottom:0.75rem;">
            <strong>Condições Propostas:</strong> "${escapeHtml(p.condicoes)}"
          </div>
        ` : ''}

        <!-- Motivo de Recusa (se houver) -->
        ${p.motivoRecusa ? `
          <div style="font-size:0.85rem; color:#ef4444; background:rgba(239,68,68,0.1); border-left:3px solid #ef4444; padding:0.5rem 0.85rem; border-radius:4px; margin-bottom:0.75rem;">
            <strong>Motivo da Recusa:</strong> "${escapeHtml(p.motivoRecusa)}"
          </div>
        ` : ''}

        <!-- Histórico de Rodadas -->
        ${renderRoundsHtml(p.rodadas)}

        <!-- Barra de Ações -->
        <div class="visit-actions-bar" style="margin-top:1rem;">
          ${whatsAppUrl ? `
            <a href="${whatsAppUrl}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp">
              <span>💬</span>
              <span>Conversar no WhatsApp</span>
            </a>
          ` : ''}

          ${isPendingAction ? `
            <button class="panel-btn panel-btn-sm panel-btn-primary btn-accept-proposal" data-id="${p.id}" data-imovel-id="${p.imovelId || ''}" data-valor="${p.valor}" data-client-id="${p.usuarioId || ''}" data-client-name="${escapeHtml(clientName)}" data-imovel-titulo="${escapeHtml(p.imovelTitulo || 'Imóvel')}">
              ✓ Aceitar Proposta
            </button>
            <button class="panel-btn panel-btn-sm panel-btn-secondary btn-counter-proposal" data-id="${p.id}" data-valor="${p.valor}" data-imovel-titulo="${escapeHtml(p.imovelTitulo || 'Imóvel')}">
              🔄 Fazer Contraproposta
            </button>
            <button class="panel-btn panel-btn-sm panel-btn-danger btn-refuse-proposal" data-id="${p.id}">
              ✕ Recusar Proposta
            </button>
          ` : ''}

          ${isAccepted ? `
            <span style="font-size:0.82rem; color:#22c55e; font-weight:600; display:inline-flex; align-items:center; gap:0.3rem;">
              ✓ Negociação concluída com sucesso
            </span>
          ` : ''}

          ${isRefused ? `
            <span style="font-size:0.82rem; color:#ef4444; font-weight:600; display:inline-flex; align-items:center; gap:0.3rem;">
              ✕ Proposta encerrada como recusada
            </span>
          ` : ''}
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;

  bindPropostasActionEvents(container);
}

/**
 * Associa manipuladores de evento das propostas
 */
function bindPropostasActionEvents(container) {
  // 1. Aceitar Proposta
  container.querySelectorAll('.btn-accept-proposal').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const imovelId = btn.getAttribute('data-imovel-id');
      const valor = btn.getAttribute('data-valor');
      const clienteId = btn.getAttribute('data-client-id');
      const clienteNome = btn.getAttribute('data-client-name');
      const imovelTitulo = btn.getAttribute('data-imovel-titulo');

      openAcceptProposalModal({
        id,
        imovelId,
        valor,
        clienteId,
        clienteNome,
        imovelTitulo
      });
    });
  });

  // 2. Fazer Contraproposta
  container.querySelectorAll('.btn-counter-proposal').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const currentVal = btn.getAttribute('data-valor');
      const imovelTitulo = btn.getAttribute('data-imovel-titulo');
      openCounterProposalModal(id, currentVal, imovelTitulo);
    });
  });

  // 3. Recusar Proposta
  container.querySelectorAll('.btn-refuse-proposal').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openRefuseProposalModal(id);
    });
  });
}

/**
 * MODAL: Aceitar Proposta com Confirmação de Reserva e Envio de Mensagem Automática
 */
function openAcceptProposalModal({ id, imovelId, valor, clienteId, clienteNome, imovelTitulo }) {
  let modal = document.getElementById('modalAcceptProposal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalAcceptProposal';
    modal.className = 'panel-modal-overlay';
    document.body.appendChild(modal);
  }

  const valorFormatado = formatMoeda(valor);

  modal.innerHTML = `
    <div class="panel-modal" style="max-width: 520px;">
      <div class="panel-modal-header">
        <h3 class="panel-modal-title">✓ Aceitar Proposta</h3>
        <button class="panel-modal-close" id="btnCloseAcceptModal">✕</button>
      </div>
      <div class="panel-modal-body">
        <p style="font-size:0.9rem; color:var(--cream); margin-bottom:1rem;">
          Você está prestes a aceitar a proposta de <strong>${escapeHtml(valorFormatado)}</strong> do cliente <strong>${escapeHtml(clienteNome)}</strong> para o imóvel <strong>${escapeHtml(imovelTitulo)}</strong>.
        </p>

        <div style="background:rgba(212,175,122,0.08); border:1px solid rgba(212,175,122,0.25); border-radius:10px; padding:1rem; margin-bottom:1.25rem;">
          <label style="display:flex; align-items:flex-start; gap:0.6rem; cursor:pointer;">
            <input type="checkbox" id="checkMarcarReservado" checked style="margin-top:0.25rem; accent-color:var(--gold);" />
            <div style="font-size:0.85rem; color:var(--cream);">
              <strong>Marcar o imóvel como "Reservado"?</strong>
              <div style="font-size:0.78rem; color:var(--text-light); margin-top:2px;">
                Isso atualizará o status do imóvel no catálogo público, sinalizando que uma negociação está em fase final de fechamento.
              </div>
            </div>
          </label>
        </div>

        <div class="panel-form-group">
          <label class="panel-form-label">Mensagem Automática para o Chat do Cliente</label>
          <textarea id="inputAcceptChatMsg" class="panel-form-textarea" rows="3">Olá ${clienteNome}! Temos o prazer de informar que sua proposta de ${valorFormatado} para o imóvel "${imovelTitulo}" foi formalmente ACEITA. Vamos prosseguir com os trâmites contratuais!</textarea>
          <div style="font-size:0.75rem; color:var(--text-light); margin-top:0.25rem;">
            Esta mensagem será enviada automaticamente na conversa direta do cliente na plataforma.
          </div>
        </div>
      </div>
      <div class="panel-modal-footer">
        <button class="panel-btn panel-btn-secondary" id="btnCancelAcceptProposal">Cancelar</button>
        <button class="panel-btn panel-btn-primary" id="btnConfirmAcceptProposal">Confirmar e Aceitar Proposta</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const close = () => { modal.style.display = 'none'; };
  document.getElementById('btnCloseAcceptModal').addEventListener('click', close);
  document.getElementById('btnCancelAcceptProposal').addEventListener('click', close);

  document.getElementById('btnConfirmAcceptProposal').addEventListener('click', async () => {
    const marcarReservado = document.getElementById('checkMarcarReservado').checked;
    const msgChat = document.getElementById('inputAcceptChatMsg').value.trim();

    const submitBtn = document.getElementById('btnConfirmAcceptProposal');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processando aceite...';

    try {
      // 1. Responde a proposta como aceita
      await Propostas.responder(id, 'aceitar');

      // 2. Se marcado, atualiza o status do imóvel para "reservado"
      if (marcarReservado && imovelId) {
        try {
          const imovelRef = doc(db, 'imoveis', imovelId);
          await updateDoc(imovelRef, {
            status: 'reservado',
            atualizadoEm: serverTimestamp()
          });
        } catch (propErr) {
          console.warn('Aviso ao marcar imóvel como reservado:', propErr.message);
        }
      }

      // 3. Registra atividade na coleção 'atividades'
      await Atividades.registrar({
        usuarioId: currentCorretor?.uid || 'corretor',
        tipo: 'proposta',
        titulo: `Proposta aceita: ${imovelTitulo}`,
        descricao: `Proposta de ${valorFormatado} para o cliente ${clienteNome} foi aceita.${marcarReservado ? ' Imóvel marcado como reservado.' : ''}`,
        refTipo: 'proposta',
        refId: id
      });

      // 4. Envia mensagem automática na conversa do cliente
      if (clienteId && msgChat) {
        try {
          const conversaId = await Conversas.abrirOuObter(clienteId, imovelId);
          await Conversas.enviar(conversaId, msgChat);
        } catch (chatErr) {
          console.warn('Aviso ao enviar mensagem automática no chat:', chatErr.message);
        }
      }

      close();
      showToast('Proposta aceita com sucesso! Notificação registrada.', 'success');
    } catch (err) {
      console.error('Erro ao aceitar proposta:', err);
      showToast('Erro ao aceitar proposta: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmar e Aceitar Proposta';
    }
  });
}

/**
 * MODAL: Enviar Contraproposta com Valor e Condições
 */
function openCounterProposalModal(propostaId, currentVal, imovelTitulo) {
  let modal = document.getElementById('modalCounterProposal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalCounterProposal';
    modal.className = 'panel-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="panel-modal" style="max-width: 480px;">
      <div class="panel-modal-header">
        <h3 class="panel-modal-title">🔄 Enviar Contraproposta</h3>
        <button class="panel-modal-close" id="btnCloseCounterModal">✕</button>
      </div>
      <div class="panel-modal-body">
        <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:1rem;">
          Defina o novo valor e as condições comerciais para contrapropor ao cliente sobre o imóvel <strong>${escapeHtml(imovelTitulo)}</strong>.
        </p>

        <div class="panel-form-group">
          <label class="panel-form-label">Valor Atual Ofertado</label>
          <input type="text" class="panel-form-input" value="${formatMoeda(currentVal)}" disabled style="opacity:0.75;" />
        </div>

        <div class="panel-form-group">
          <label class="panel-form-label">Novo Valor da Contraproposta (R$) *</label>
          <input type="number" id="inputCounterValor" class="panel-form-input" min="1" step="1000" placeholder="Ex: 850000" required />
        </div>

        <div class="panel-form-group">
          <label class="panel-form-label">Novas Condições ou Observações Comerciais</label>
          <textarea id="inputCounterCondicoes" class="panel-form-textarea" rows="3" placeholder="Ex: Aceitamos a pedida mediante entrada mínima de 30% em sinal à vista e saldo parcelado via financiamento bancário."></textarea>
        </div>
      </div>
      <div class="panel-modal-footer">
        <button class="panel-btn panel-btn-secondary" id="btnCancelCounter">Cancelar</button>
        <button class="panel-btn panel-btn-primary" id="btnSubmitCounter">Enviar Contraproposta</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const close = () => { modal.style.display = 'none'; };
  document.getElementById('btnCloseCounterModal').addEventListener('click', close);
  document.getElementById('btnCancelCounter').addEventListener('click', close);

  document.getElementById('btnSubmitCounter').addEventListener('click', async () => {
    const novoValor = Number(document.getElementById('inputCounterValor').value);
    const condicoes = document.getElementById('inputCounterCondicoes').value.trim();

    if (!novoValor || isNaN(novoValor) || novoValor <= 0) {
      alert('Por favor, informe um valor numérico válido para a contraproposta.');
      return;
    }

    const submitBtn = document.getElementById('btnSubmitCounter');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando contraproposta...';

    try {
      await Propostas.responder(propostaId, 'contraproposta', {
        valor: novoValor,
        condicoes,
        autor: 'corretor'
      });

      await Atividades.registrar({
        usuarioId: currentCorretor?.uid || 'corretor',
        tipo: 'proposta',
        titulo: 'Contraproposta enviada',
        descricao: `Contraproposta no valor de ${formatMoeda(novoValor)} enviada ao cliente.`,
        refTipo: 'proposta',
        refId: propostaId
      });

      close();
      showToast('Contraproposta enviada com sucesso! O cliente receberá em seu painel.', 'success');
    } catch (err) {
      console.error('Erro ao enviar contraproposta:', err);
      showToast('Erro ao enviar: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar Contraproposta';
    }
  });
}

/**
 * MODAL: Recusar Proposta com Justificativa
 */
function openRefuseProposalModal(propostaId) {
  let modal = document.getElementById('modalRefuseProposal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalRefuseProposal';
    modal.className = 'panel-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="panel-modal" style="max-width: 460px;">
      <div class="panel-modal-header">
        <h3 class="panel-modal-title">✕ Recusar Proposta Comercial</h3>
        <button class="panel-modal-close" id="btnCloseRefuseProposalModal">✕</button>
      </div>
      <div class="panel-modal-body">
        <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:1rem;">
          Descreva o motivo da recusa desta proposta. O proponente visualizará esta justificativa em seu painel de negociações.
        </p>

        <div class="panel-form-group">
          <label class="panel-form-label">Motivo da Recusa *</label>
          <textarea id="inputRefuseProposalMotivo" class="panel-form-textarea" rows="3" placeholder="Ex: Valor ofertado muito abaixo da margem de negociação estipulada pelo proprietário." required></textarea>
        </div>
      </div>
      <div class="panel-modal-footer">
        <button class="panel-btn panel-btn-secondary" id="btnCancelRefuseProposal">Voltar</button>
        <button class="panel-btn panel-btn-danger" id="btnSubmitRefuseProposal">Confirmar Recusa</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const close = () => { modal.style.display = 'none'; };
  document.getElementById('btnCloseRefuseProposalModal').addEventListener('click', close);
  document.getElementById('btnCancelRefuseProposal').addEventListener('click', close);

  document.getElementById('btnSubmitRefuseProposal').addEventListener('click', async () => {
    const motivo = document.getElementById('inputRefuseProposalMotivo').value.trim();
    if (!motivo) {
      alert('Por favor, descreva o motivo da recusa.');
      return;
    }

    const submitBtn = document.getElementById('btnSubmitRefuseProposal');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Recusando...';

    try {
      await Propostas.responder(propostaId, 'recusar', { motivo });

      await Atividades.registrar({
        usuarioId: currentCorretor?.uid || 'corretor',
        tipo: 'proposta',
        titulo: 'Proposta recusada pelo corretor',
        descricao: `Justificativa: "${motivo}"`,
        refTipo: 'proposta',
        refId: propostaId
      });

      close();
      showToast('Proposta recusada.', 'info');
    } catch (err) {
      console.error('Erro ao recusar proposta:', err);
      showToast('Erro ao recusar: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmar Recusa';
    }
  });
}

/**
 * Monta o layout da View de Propostas (#propostas)
 */
function setupPropostasLayout(container) {
  container.innerHTML = `
    <!-- Topo: Título & Filtros -->
    <div class="panel-card" style="margin-bottom: 1.5rem;">
      <div class="panel-card-header">
        <div>
          <h3 class="panel-card-title">📝 Mesa de Propostas & Negociações</h3>
          <p class="panel-card-subtitle">Acompanhe ofertas de compra e locação, envie contrapropostas e gerencie as rodadas de negociação</p>
        </div>
      </div>

      <!-- Barra de Filtros e Busca de Propostas -->
      <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; margin-top:0.5rem;">
        <div style="display:flex; gap:0.4rem; flex-wrap:wrap;" id="propostasStatusFilterTabs">
          <button class="panel-btn panel-btn-sm ${currentFilterStatus === 'todas' ? 'panel-btn-primary' : 'panel-btn-secondary'}" data-status="todas">Todas</button>
          <button class="panel-btn panel-btn-sm ${currentFilterStatus === 'enviada' ? 'panel-btn-primary' : 'panel-btn-secondary'}" data-status="enviada">Novas (Enviadas)</button>
          <button class="panel-btn panel-btn-sm ${currentFilterStatus === 'contraproposta' ? 'panel-btn-primary' : 'panel-btn-secondary'}" data-status="contraproposta">Em Contraproposta</button>
          <button class="panel-btn panel-btn-sm ${currentFilterStatus === 'aceita' ? 'panel-btn-primary' : 'panel-btn-secondary'}" data-status="aceita">Aceitas</button>
          <button class="panel-btn panel-btn-sm ${currentFilterStatus === 'recusada' ? 'panel-btn-primary' : 'panel-btn-secondary'}" data-status="recusada">Recusadas</button>
          <button class="panel-btn panel-btn-sm ${currentFilterStatus === 'cancelada' ? 'panel-btn-primary' : 'panel-btn-secondary'}" data-status="cancelada">Canceladas</button>
        </div>

        <div style="flex:1; max-width:320px; min-width:200px;">
          <input type="text" id="inputSearchPropostas" class="panel-form-input" placeholder="🔍 Buscar por cliente ou imóvel..." style="padding:0.45rem 0.85rem; font-size:0.85rem;" />
        </div>
      </div>
    </div>

    <!-- Lista de Propostas -->
    <div id="propostasListContainer">
      <div class="panel-empty-state">
        <div class="panel-empty-icon">⏳</div>
        <p class="panel-empty-desc">Carregando propostas...</p>
      </div>
    </div>
  `;

  // Filtros por Status (Tabs)
  const filterTabs = document.getElementById('propostasStatusFilterTabs');
  if (filterTabs) {
    filterTabs.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilterStatus = btn.getAttribute('data-status');
        filterTabs.querySelectorAll('button').forEach(b => {
          b.className = 'panel-btn panel-btn-sm panel-btn-secondary';
        });
        btn.className = 'panel-btn panel-btn-sm panel-btn-primary';
        renderPropostasList();
      });
    });
  }

  // Busca em tempo real
  const searchInput = document.getElementById('inputSearchPropostas');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderPropostasList();
    });
  }
}

/**
 * Registra a View 'propostas' no Panel Shell
 */
registerView('propostas', {
  titulo: 'Mesa de Propostas',
  mount(container, user) {
    currentCorretor = user || auth.currentUser;
    setupPropostasLayout(container);

    if (unsubscribePropostas) {
      unsubscribePropostas();
      unsubscribePropostas = null;
    }

    // Escuta em tempo real da coleção /propostas
    const q = collection(db, 'propostas');
    unsubscribePropostas = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      // Filtra por corretor responsável quando houver corretorId, ou exibe todas as novas da imobiliária
      allPropostas = items.filter(p => !p.corretorId || p.corretorId === currentCorretor?.uid);

      // Atualiza badge com propostas abertas ('enviada' ou 'contraproposta')
      const pendingCount = allPropostas.filter(p => p.status === 'enviada' || p.status === 'contraproposta').length;
      updatePropostasBadge(pendingCount);

      renderPropostasList();
    }, (err) => {
      console.warn('Erro ao escutar propostas:', err.message);
      container.innerHTML = `
        <div class="panel-empty-state">
          <div class="panel-empty-icon">⚠️</div>
          <h4 class="panel-empty-title">Aviso na sincronização</h4>
          <p class="panel-empty-desc">${escapeHtml(err.message)}</p>
        </div>
      `;
    });
  },
  unmount() {
    if (unsubscribePropostas) {
      unsubscribePropostas();
      unsubscribePropostas = null;
    }
  }
});
