/**
 * Living Canvas - Painel do Corretor: Módulo Agenda de Visitas (P8)
 * Gestão de visitas em tempo real com calendário mensal e semanal em JS puro,
 * detecção de conflito de horários, confirmação, reagendamento, recusa,
 * anotações pós-visita, integração com WhatsApp e atualização de badges.
 */

import { registerView, escapeHtml, formatData, showToast } from './panel-shell.js';
import { Visitas, Atividades, auth, db } from './lc-data.js';
import { collection, query, where, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

let currentCorretor = null;
let unsubscribeVisitas = null;
let allVisitas = [];
let selectedDate = null; // YYYY-MM-DD
let currentCalendarDate = new Date(); // Mês/ano exibido no calendário
let calendarViewMode = 'month'; // 'month' | 'week'
let currentFilterStatus = 'todas'; // 'todas' | 'pendente' | 'confirmada' | 'reagendada' | 'realizada' | 'cancelada'
let searchQuery = '';

/**
 * Formata número de telefone para link WhatsApp (E.164 Brasil)
 */
function getWhatsAppUrl(phone, clientName, visitData) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  const fullNum = digits.startsWith('55') ? digits : `55${digits}`;
  const greeting = encodeURIComponent(
    `Olá ${clientName || 'Cliente'}, tudo bem? Sou o seu corretor da Living Canvas a respeito da visita ao imóvel ${visitData?.imovelTitulo || ''} agendada para ${visitData?.data || ''} às ${visitData?.horario || ''}.`
  );
  return `https://wa.me/${fullNum}?text=${greeting}`;
}

/**
 * Normaliza data para YYYY-MM-DD
 */
function toDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Detecta conflito de horário entre visitas confirmadas
 */
function checkScheduleConflict(visitaId, targetData, targetHorario) {
  if (!targetData || !targetHorario) return null;
  return allVisitas.find(v => {
    if (v.id === visitaId) return false;
    if (v.status !== 'confirmada') return false;
    if (v.data !== targetData) return false;
    // Se o horário for o mesmo ou estiver muito próximo
    return v.horario === targetHorario;
  });
}

/**
 * Atualiza o badge do menu lateral (#corretorNavVisitasBadge)
 */
function updateVisitasBadge(count) {
  const badge = document.getElementById('corretorNavVisitasBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

/**
 * Renderiza o Calendário Mensal
 */
function renderMonthGrid(container, visitsByDate) {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Dom, 1 = Seg...
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const todayStr = toDateString(new Date());

  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let html = weekdays.map(w => `<div class="calendar-weekday">${w}</div>`).join('');

  // Dias do mês anterior para completar a primeira semana
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const prevDate = new Date(year, month - 1, dayNum);
    const dateStr = toDateString(prevDate);
    const visits = visitsByDate[dateStr] || [];
    html += `
      <div class="calendar-day-cell other-month" data-date="${dateStr}">
        <div class="calendar-day-header">
          <span class="calendar-day-number">${dayNum}</span>
          ${visits.length > 0 ? `<span class="calendar-day-badge">${visits.length}</span>` : ''}
        </div>
      </div>
    `;
  }

  // Dias do mês atual
  for (let day = 1; day <= daysInMonth; day++) {
    const currentDayDate = new Date(year, month, day);
    const dateStr = toDateString(currentDayDate);
    const visits = visitsByDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === selectedDate;

    let eventsHtml = '';
    if (visits.length > 0) {
      eventsHtml = '<div class="calendar-day-events">';
      visits.slice(0, 2).forEach(v => {
        const pClass = v.status === 'pendente' ? 'pending' : (v.status === 'confirmada' ? 'confirmed' : '');
        eventsHtml += `
          <div class="calendar-event-pill ${pClass}" title="${escapeHtml(v.horario || '')} - ${escapeHtml(v.clienteNome || 'Cliente')} (${escapeHtml(v.imovelTitulo || '')})">
            ${escapeHtml(v.horario || '')} ${escapeHtml(v.clienteNome ? v.clienteNome.split(' ')[0] : 'Visita')}
          </div>
        `;
      });
      if (visits.length > 2) {
        eventsHtml += `<div class="calendar-event-pill" style="border:none; text-align:center; font-size:0.65rem;">+${visits.length - 2} mais</div>`;
      }
      eventsHtml += '</div>';
    }

    html += `
      <div class="calendar-day-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${dateStr}">
        <div class="calendar-day-header">
          <span class="calendar-day-number">${day}</span>
          ${visits.length > 0 ? `<span class="calendar-day-badge">${visits.length}</span>` : ''}
        </div>
        ${eventsHtml}
      </div>
    `;
  }

  // Dias do próximo mês para fechar 35 ou 42 células
  const totalCells = firstDayIndex + daysInMonth;
  const nextDays = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= nextDays; d++) {
    const nextDate = new Date(year, month + 1, d);
    const dateStr = toDateString(nextDate);
    const visits = visitsByDate[dateStr] || [];
    html += `
      <div class="calendar-day-cell other-month" data-date="${dateStr}">
        <div class="calendar-day-header">
          <span class="calendar-day-number">${d}</span>
          ${visits.length > 0 ? `<span class="calendar-day-badge">${visits.length}</span>` : ''}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Eventos de clique nas células do calendário
  container.querySelectorAll('.calendar-day-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const d = cell.getAttribute('data-date');
      if (selectedDate === d) {
        selectedDate = null; // desmarca se clicar de novo
      } else {
        selectedDate = d;
      }
      renderCalendar();
      renderVisitasList();
    });
  });
}

/**
 * Renderiza o Calendário Semanal
 */
function renderWeekGrid(container, visitsByDate) {
  const current = new Date(currentCalendarDate);
  // Encontra o domingo inicial da semana
  const dayOfWeek = current.getDay();
  const startOfWeek = new Date(current);
  startOfWeek.setDate(current.getDate() - dayOfWeek);

  const todayStr = toDateString(new Date());
  const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  let html = '';

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(startOfWeek);
    dayDate.setDate(startOfWeek.getDate() + i);
    const dateStr = toDateString(dayDate);
    const visits = visitsByDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === selectedDate;

    let visitsCardsHtml = '';
    if (visits.length > 0) {
      visits.forEach(v => {
        const pClass = v.status === 'pendente' ? 'pending' : (v.status === 'confirmada' ? 'confirmed' : '');
        visitsCardsHtml += `
          <div class="calendar-event-pill ${pClass}" style="padding:0.4rem; white-space:normal;" data-visit-id="${v.id}">
            <div style="font-weight:700; font-size:0.75rem;">⏰ ${escapeHtml(v.horario || '—')}</div>
            <div style="font-weight:600; margin-top:2px;">${escapeHtml(v.clienteNome || 'Cliente')}</div>
            <div style="font-size:0.68rem; opacity:0.85; margin-top:2px;">${escapeHtml(v.imovelTitulo || 'Imóvel')}</div>
            <div style="margin-top:4px;">
              <span class="panel-badge ${v.tipoVisita === 'video' ? 'info' : 'success'}" style="font-size:0.6rem; padding:0.1rem 0.3rem;">
                ${v.tipoVisita === 'video' ? '📹 Vídeo' : '📍 Presencial'}
              </span>
            </div>
          </div>
        `;
      });
    } else {
      visitsCardsHtml = `<div style="font-size:0.75rem; color:var(--text-light); text-align:center; padding-top:1rem; opacity:0.5;">Sem visitas</div>`;
    }

    html += `
      <div class="calendar-week-col ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${dateStr}" style="cursor:pointer;">
        <div class="calendar-week-col-header">
          <div class="calendar-week-col-dayname">${weekdays[i]}</div>
          <div class="calendar-week-col-daynum">${dayDate.getDate()}</div>
        </div>
        <div class="calendar-week-events-list">
          ${visitsCardsHtml}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  container.querySelectorAll('.calendar-week-col').forEach(col => {
    col.addEventListener('click', (e) => {
      // Se clicou na pílula de evento, pode inspecionar ou apenas filtrar
      const d = col.getAttribute('data-date');
      selectedDate = selectedDate === d ? null : d;
      renderCalendar();
      renderVisitasList();
    });
  });
}

/**
 * Renderiza o widget completo do Calendário
 */
function renderCalendar() {
  const container = document.getElementById('visitasCalendarWidget');
  if (!container) return;

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  // Agrupa visitas por data
  const visitsByDate = {};
  allVisitas.forEach(v => {
    if (v.data) {
      if (!visitsByDate[v.data]) visitsByDate[v.data] = [];
      visitsByDate[v.data].push(v);
    }
  });

  let titleText = `${monthNames[month]} de ${year}`;
  if (calendarViewMode === 'week') {
    const cur = new Date(currentCalendarDate);
    const startOfWeek = new Date(cur);
    startOfWeek.setDate(cur.getDate() - cur.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    titleText = `Semana: ${startOfWeek.getDate()}/${startOfWeek.getMonth() + 1} a ${endOfWeek.getDate()}/${endOfWeek.getMonth() + 1}/${endOfWeek.getFullYear()}`;
  }

  container.innerHTML = `
    <div class="calendar-header">
      <div class="calendar-title-group">
        <h4 class="calendar-month-title">${titleText}</h4>
        ${selectedDate ? `
          <button class="panel-btn panel-btn-sm panel-btn-secondary" id="btnClearDateFilter" style="font-size:0.75rem; padding:0.25rem 0.6rem;">
            ✕ Ver todos os dias (Filtro: ${selectedDate.split('-').reverse().join('/')})
          </button>
        ` : ''}
      </div>

      <div class="calendar-controls">
        <div class="calendar-view-toggle">
          <button class="calendar-view-btn ${calendarViewMode === 'month' ? 'active' : ''}" id="btnCalViewMonth">Mês</button>
          <button class="calendar-view-btn ${calendarViewMode === 'week' ? 'active' : ''}" id="btnCalViewWeek">Semana</button>
        </div>

        <button class="calendar-btn-nav" id="btnCalPrev" title="Anterior">◀</button>
        <button class="calendar-btn-today" id="btnCalToday">Hoje</button>
        <button class="calendar-btn-nav" id="btnCalNext" title="Próximo">▶</button>
      </div>
    </div>

    <div id="calendarGridContent" class="${calendarViewMode === 'month' ? 'calendar-month-grid' : 'calendar-week-grid'}">
    </div>
  `;

  const gridContent = document.getElementById('calendarGridContent');
  if (calendarViewMode === 'month') {
    renderMonthGrid(gridContent, visitsByDate);
  } else {
    renderWeekGrid(gridContent, visitsByDate);
  }

  // Event Listeners dos Controles
  const btnPrev = document.getElementById('btnCalPrev');
  const btnNext = document.getElementById('btnCalNext');
  const btnToday = document.getElementById('btnCalToday');
  const btnViewMonth = document.getElementById('btnCalViewMonth');
  const btnViewWeek = document.getElementById('btnCalViewWeek');
  const btnClearDate = document.getElementById('btnClearDateFilter');

  if (btnClearDate) {
    btnClearDate.addEventListener('click', () => {
      selectedDate = null;
      renderCalendar();
      renderVisitasList();
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (calendarViewMode === 'month') {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
      } else {
        currentCalendarDate.setDate(currentCalendarDate.getDate() - 7);
      }
      renderCalendar();
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (calendarViewMode === 'month') {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
      } else {
        currentCalendarDate.setDate(currentCalendarDate.getDate() + 7);
      }
      renderCalendar();
    });
  }

  if (btnToday) {
    btnToday.addEventListener('click', () => {
      currentCalendarDate = new Date();
      selectedDate = toDateString(new Date());
      renderCalendar();
      renderVisitasList();
    });
  }

  if (btnViewMonth) {
    btnViewMonth.addEventListener('click', () => {
      calendarViewMode = 'month';
      renderCalendar();
    });
  }

  if (btnViewWeek) {
    btnViewWeek.addEventListener('click', () => {
      calendarViewMode = 'week';
      renderCalendar();
    });
  }
}

/**
 * Renderiza o Badge de Status
 */
function getStatusBadge(status) {
  const map = {
    pendente: { label: 'Aguardando Confirmação', class: 'warning' },
    confirmada: { label: 'Confirmada', class: 'success' },
    reagendada: { label: 'Reagendada (Aguardando Cliente)', class: 'info' },
    realizada: { label: 'Realizada', class: 'gold' },
    cancelada: { label: 'Cancelada', class: 'neutral' },
    recusada: { label: 'Recusada', class: 'danger' }
  };
  const item = map[status] || { label: status, class: 'neutral' };
  return `<span class="panel-badge ${item.class}">${item.label}</span>`;
}

/**
 * Renderiza a Lista "Próximas Visitas"
 */
function renderVisitasList() {
  const container = document.getElementById('visitasListContainer');
  if (!container) return;

  // Aplica filtros
  let filtered = [...allVisitas];

  if (selectedDate) {
    filtered = filtered.filter(v => v.data === selectedDate);
  }

  if (currentFilterStatus !== 'todas') {
    if (currentFilterStatus === 'cancelada') {
      filtered = filtered.filter(v => v.status === 'cancelada' || v.status === 'recusada');
    } else {
      filtered = filtered.filter(v => v.status === currentFilterStatus);
    }
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(v =>
      (v.clienteNome || '').toLowerCase().includes(q) ||
      (v.imovelTitulo || '').toLowerCase().includes(q) ||
      (v.clienteEmail || '').toLowerCase().includes(q) ||
      (v.clienteTelefone || '').toLowerCase().includes(q)
    );
  }

  // Ordenação: Pendentes primeiro, depois por data e horário
  filtered.sort((a, b) => {
    if (a.status === 'pendente' && b.status !== 'pendente') return -1;
    if (b.status === 'pendente' && a.status !== 'pendente') return 1;
    const dateCmp = (a.data || '').localeCompare(b.data || '');
    if (dateCmp !== 0) return dateCmp;
    return (a.horario || '').localeCompare(b.horario || '');
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="panel-empty-state">
        <div class="panel-empty-icon">📅</div>
        <h4 class="panel-empty-title">Nenhuma visita encontrada</h4>
        <p class="panel-empty-desc">
          ${selectedDate ? `Não há visitas programadas para o dia ${selectedDate.split('-').reverse().join('/')}.` : 'Nenhuma visita com os filtros selecionados no momento.'}
        </p>
      </div>
    `;
    return;
  }

  let html = '<div style="display:flex; flex-direction:column; gap:1rem;">';

  filtered.forEach(v => {
    const clientName = v.clienteNome || 'Cliente Interessado';
    const initials = clientName.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('') || 'CL';
    const whatsAppUrl = getWhatsAppUrl(v.clienteTelefone, clientName, v);

    // Formata exibição da data
    let dataFormatada = v.data || 'Data a definir';
    if (v.data && v.data.includes('-')) {
      dataFormatada = v.data.split('-').reverse().join('/');
    }

    // Ações disponíveis de acordo com status
    const isPendente = v.status === 'pendente';
    const isConfirmada = v.status === 'confirmada';
    const isReagendada = v.status === 'reagendada';
    const isRealizada = v.status === 'realizada';
    const isCancelada = v.status === 'cancelada' || v.status === 'recusada';

    html += `
      <div class="visit-card" id="visit-card-${v.id}">
        <div class="visit-card-header">
          <div class="visit-card-client">
            <div class="visit-avatar">${escapeHtml(initials)}</div>
            <div>
              <h5 class="visit-client-name">${escapeHtml(clientName)}</h5>
              <div class="visit-client-meta">
                ${v.clienteTelefone ? `<span>📞 ${escapeHtml(v.clienteTelefone)}</span>` : ''}
                ${v.clienteEmail ? `<span>✉️ ${escapeHtml(v.clienteEmail)}</span>` : ''}
              </div>
            </div>
          </div>
          <div>
            ${getStatusBadge(v.status)}
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; background:rgba(0,0,0,0.15); padding:0.6rem 0.85rem; border-radius:8px;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-light); text-transform:uppercase;">Imóvel Solicitado</div>
            <a href="imovel.html?id=${encodeURIComponent(v.imovelId || '')}" target="_blank" rel="noopener noreferrer" class="visit-property-link">
              🏡 ${escapeHtml(v.imovelTitulo || 'Ver Detalhes do Imóvel')} ↗
            </a>
          </div>

          <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
            <div class="visit-datetime-badge">
              <span>📅 ${escapeHtml(dataFormatada)}</span>
              <span>⏰ ${escapeHtml(v.horario || '—')}</span>
            </div>
            <span class="panel-badge ${v.tipoVisita === 'video' ? 'info' : 'success'}">
              ${v.tipoVisita === 'video' ? '📹 Videoconferência' : '📍 Presencial no Imóvel'}
            </span>
          </div>
        </div>

        ${v.observacao ? `
          <div style="font-size:0.82rem; color:var(--cream); background:rgba(245,241,232,0.03); border-left:3px solid var(--gold); padding:0.4rem 0.75rem; border-radius:4px;">
            <strong>Observação do Cliente:</strong> "${escapeHtml(v.observacao)}"
          </div>
        ` : ''}

        ${v.propostaData ? `
          <div style="font-size:0.82rem; color:#38bdf8; background:rgba(56,189,248,0.1); border-left:3px solid #38bdf8; padding:0.4rem 0.75rem; border-radius:4px;">
            <strong>Reagendamento proposto:</strong> ${escapeHtml(v.propostaData.split('-').reverse().join('/'))} às ${escapeHtml(v.propostoHorario || '')} (aguardando cliente aprovar)
          </div>
        ` : ''}

        ${v.motivoCancelamento ? `
          <div style="font-size:0.82rem; color:#ef4444; background:rgba(239,68,68,0.1); border-left:3px solid #ef4444; padding:0.4rem 0.75rem; border-radius:4px;">
            <strong>Motivo:</strong> "${escapeHtml(v.motivoCancelamento)}"
          </div>
        ` : ''}

        ${v.notaInterna ? `
          <div style="font-size:0.82rem; color:var(--gold); background:rgba(212,175,122,0.1); border-left:3px solid var(--gold); padding:0.4rem 0.75rem; border-radius:4px;">
            <strong>Anotação Interna:</strong> "${escapeHtml(v.notaInterna)}"
          </div>
        ` : ''}

        <div class="visit-actions-bar">
          ${whatsAppUrl ? `
            <a href="${whatsAppUrl}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp">
              <span>💬</span>
              <span>WhatsApp do Cliente</span>
            </a>
          ` : ''}

          ${(isPendente || isReagendada) ? `
            <button class="panel-btn panel-btn-sm panel-btn-primary btn-confirm-visit" data-id="${v.id}" data-date="${v.data}" data-time="${v.horario}" data-client="${escapeHtml(clientName)}">
              ✓ Confirmar Visita
            </button>
            <button class="panel-btn panel-btn-sm panel-btn-secondary btn-reschedule-visit" data-id="${v.id}" data-date="${v.data}" data-time="${v.horario}">
              🔄 Reagendar
            </button>
            <button class="panel-btn panel-btn-sm panel-btn-danger btn-refuse-visit" data-id="${v.id}">
              ✕ Recusar
            </button>
          ` : ''}

          ${isConfirmada ? `
            <button class="panel-btn panel-btn-sm panel-btn-primary btn-complete-visit" data-id="${v.id}">
              ⭐ Marcar como Realizada
            </button>
            <button class="panel-btn panel-btn-sm panel-btn-secondary btn-reschedule-visit" data-id="${v.id}" data-date="${v.data}" data-time="${v.horario}">
              🔄 Reagendar
            </button>
            <button class="panel-btn panel-btn-sm panel-btn-danger btn-cancel-visit" data-id="${v.id}">
              ✕ Cancelar Visita
            </button>
          ` : ''}

          ${isRealizada ? `
            <button class="panel-btn panel-btn-sm panel-btn-secondary btn-note-visit" data-id="${v.id}" data-note="${escapeHtml(v.notaInterna || '')}">
              📝 ${v.notaInterna ? 'Editar Anotação Interna' : 'Adicionar Anotação'}
            </button>
          ` : ''}
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;

  // Associa manipuladores de ação
  bindVisitasActionEvents(container);
}

/**
 * Associa eventos de clique nos botões de ação das visitas
 */
function bindVisitasActionEvents(container) {
  // 1. Confirmar Visita
  container.querySelectorAll('.btn-confirm-visit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const targetDate = btn.getAttribute('data-date');
      const targetTime = btn.getAttribute('data-time');
      const clientName = btn.getAttribute('data-client');

      // Verifica conflito de horário
      const conflict = checkScheduleConflict(id, targetDate, targetTime);
      if (conflict) {
        const proceed = confirm(
          `⚠️ CONFLITO DE HORÁRIO DETECTADO!\n\nVocê já possui uma visita CONFIRMADA para ${targetDate} às ${targetTime} com o cliente "${conflict.clienteNome || 'Cliente'}" no imóvel "${conflict.imovelTitulo || 'Imóvel'}".\n\nDeseja confirmar esta outra visita mesmo assim?`
        );
        if (!proceed) return;
      }

      btn.disabled = true;
      btn.textContent = 'Confirmando...';

      try {
        await Visitas.alterarStatus(id, 'confirmada');

        await Atividades.registrar({
          usuarioId: currentCorretor?.uid || 'corretor',
          tipo: 'visita',
          titulo: `Visita confirmada: ${clientName}`,
          descricao: `Visita de ${clientName} agendada para ${targetDate} às ${targetTime} foi confirmada pelo corretor.`,
          refTipo: 'visita',
          refId: id
        });

        showToast('Visita confirmada com sucesso!', 'success');
      } catch (err) {
        console.error('Erro ao confirmar visita:', err);
        showToast('Erro ao confirmar visita: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '✓ Confirmar Visita';
      }
    });
  });

  // 2. Reagendar Visita
  container.querySelectorAll('.btn-reschedule-visit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const oldDate = btn.getAttribute('data-date') || '';
      const oldTime = btn.getAttribute('data-time') || '';
      openRescheduleModal(id, oldDate, oldTime);
    });
  });

  // 3. Recusar Visita
  container.querySelectorAll('.btn-refuse-visit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openRefuseModal(id);
    });
  });

  // 4. Marcar como Realizada
  container.querySelectorAll('.btn-complete-visit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openCompleteModal(id);
    });
  });

  // 5. Cancelar Visita Confirmada
  container.querySelectorAll('.btn-cancel-visit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openCancelModal(id);
    });
  });

  // 6. Editar Anotação Interna
  container.querySelectorAll('.btn-note-visit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const existingNote = btn.getAttribute('data-note') || '';
      openNoteModal(id, existingNote);
    });
  });
}

/**
 * MODAL: Reagendar Visita
 */
function openRescheduleModal(visitaId, oldDate, oldTime) {
  let modal = document.getElementById('modalRescheduleVisita');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalRescheduleVisita';
    modal.className = 'panel-modal-overlay';
    document.body.appendChild(modal);
  }

  const today = toDateString(new Date());

  modal.innerHTML = `
    <div class="panel-modal" style="max-width: 480px;">
      <div class="panel-modal-header">
        <h3 class="panel-modal-title">🔄 Propor Reagendamento</h3>
        <button class="panel-modal-close" id="btnCloseRescheduleModal">✕</button>
      </div>
      <div class="panel-modal-body">
        <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:1rem;">
          Ao propor uma nova data e horário, a visita passará para o status <strong>"reagendada"</strong> e o cliente receberá a notificação em seu painel para aprovar ou recusar a proposta.
        </p>

        <div class="panel-form-group">
          <label class="panel-form-label">Nova Data Proposta *</label>
          <input type="date" id="inputRescheduleDate" class="panel-form-input" min="${today}" value="${oldDate || today}" required />
        </div>

        <div class="panel-form-group">
          <label class="panel-form-label">Novo Horário Proposto *</label>
          <input type="time" id="inputRescheduleTime" class="panel-form-input" value="${oldTime || '14:00'}" required />
        </div>

        <div class="panel-form-group">
          <label class="panel-form-label">Mensagem / Justificativa para o Cliente (Opcional)</label>
          <textarea id="inputRescheduleMotivo" class="panel-form-textarea" rows="3" placeholder="Ex: Tivemos um imprevisto na agenda matinal, sugiro remarcarmos para a tarde."></textarea>
        </div>
      </div>
      <div class="panel-modal-footer">
        <button class="panel-btn panel-btn-secondary" id="btnCancelReschedule">Cancelar</button>
        <button class="panel-btn panel-btn-primary" id="btnSubmitReschedule">Enviar Reagendamento</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const close = () => { modal.style.display = 'none'; };
  document.getElementById('btnCloseRescheduleModal').addEventListener('click', close);
  document.getElementById('btnCancelReschedule').addEventListener('click', close);

  document.getElementById('btnSubmitReschedule').addEventListener('click', async () => {
    const newDate = document.getElementById('inputRescheduleDate').value;
    const newTime = document.getElementById('inputRescheduleTime').value;
    const motivo = document.getElementById('inputRescheduleMotivo').value.trim();

    if (!newDate || !newTime) {
      alert('Por favor, informe a nova data e o novo horário.');
      return;
    }

    // Alerta conflito
    const conflict = checkScheduleConflict(visitaId, newDate, newTime);
    if (conflict) {
      const proceed = confirm(`Atenção: Você já tem visita confirmada em ${newDate} às ${newTime} (${conflict.clienteNome}). Deseja sugerir esse horário mesmo assim?`);
      if (!proceed) return;
    }

    const submitBtn = document.getElementById('btnSubmitReschedule');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    try {
      await Visitas.reagendar(visitaId, newDate, newTime);

      if (motivo) {
        await Visitas.alterarStatus(visitaId, 'reagendada', {
          motivoReagendamento: motivo
        });
      }

      await Atividades.registrar({
        usuarioId: currentCorretor?.uid || 'corretor',
        tipo: 'visita',
        titulo: 'Proposta de reagendamento de visita enviada',
        descricao: `Reagendamento proposto para ${newDate} às ${newTime}.`,
        refTipo: 'visita',
        refId: visitaId
      });

      close();
      showToast('Proposta de reagendamento enviada ao cliente com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao reagendar visita:', err);
      showToast('Erro ao reagendar: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar Reagendamento';
    }
  });
}

/**
 * MODAL: Recusar Visita
 */
function openRefuseModal(visitaId) {
  let modal = document.getElementById('modalRefuseVisita');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalRefuseVisita';
    modal.className = 'panel-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="panel-modal" style="max-width: 460px;">
      <div class="panel-modal-header">
        <h3 class="panel-modal-title">✕ Recusar Solicitação de Visita</h3>
        <button class="panel-modal-close" id="btnCloseRefuseModal">✕</button>
      </div>
      <div class="panel-modal-body">
        <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:1rem;">
          Informe o motivo da recusa. O cliente visualizará esta justificativa em seu painel.
        </p>

        <div class="panel-form-group">
          <label class="panel-form-label">Motivo da Recusa *</label>
          <textarea id="inputRefuseMotivo" class="panel-form-textarea" rows="3" placeholder="Ex: O proprietário do imóvel suspendeu as visitas presenciais nesta data." required></textarea>
        </div>
      </div>
      <div class="panel-modal-footer">
        <button class="panel-btn panel-btn-secondary" id="btnCancelRefuse">Voltar</button>
        <button class="panel-btn panel-btn-danger" id="btnSubmitRefuse">Confirmar Recusa</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const close = () => { modal.style.display = 'none'; };
  document.getElementById('btnCloseRefuseModal').addEventListener('click', close);
  document.getElementById('btnCancelRefuse').addEventListener('click', close);

  document.getElementById('btnSubmitRefuse').addEventListener('click', async () => {
    const motivo = document.getElementById('inputRefuseMotivo').value.trim();
    if (!motivo) {
      alert('Por favor, descreva o motivo da recusa.');
      return;
    }

    const submitBtn = document.getElementById('btnSubmitRefuse');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Recusando...';

    try {
      await Visitas.alterarStatus(visitaId, 'recusada', {
        motivoCancelamento: motivo,
        motivoRecusa: motivo
      });

      await Atividades.registrar({
        usuarioId: currentCorretor?.uid || 'corretor',
        tipo: 'visita',
        titulo: 'Visita recusada pelo corretor',
        descricao: `Motivo: ${motivo}`,
        refTipo: 'visita',
        refId: visitaId
      });

      close();
      showToast('Visita recusada.', 'info');
    } catch (err) {
      console.error('Erro ao recusar visita:', err);
      showToast('Erro ao recusar: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmar Recusa';
    }
  });
}

/**
 * MODAL: Cancelar Visita
 */
function openCancelModal(visitaId) {
  let modal = document.getElementById('modalCancelVisita');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalCancelVisita';
    modal.className = 'panel-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="panel-modal" style="max-width: 460px;">
      <div class="panel-modal-header">
        <h3 class="panel-modal-title">✕ Cancelar Visita Confirmada</h3>
        <button class="panel-modal-close" id="btnCloseCancelModal">✕</button>
      </div>
      <div class="panel-modal-body">
        <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:1rem;">
          Tem certeza de que deseja cancelar esta visita confirmada? Por favor, informe o motivo para registro.
        </p>

        <div class="panel-form-group">
          <label class="panel-form-label">Motivo do Cancelamento *</label>
          <textarea id="inputCancelMotivo" class="panel-form-textarea" rows="3" placeholder="Ex: Imprevisto com o acesso às chaves do imóvel." required></textarea>
        </div>
      </div>
      <div class="panel-modal-footer">
        <button class="panel-btn panel-btn-secondary" id="btnDismissCancel">Manter Visita</button>
        <button class="panel-btn panel-btn-danger" id="btnConfirmCancel">Sim, Cancelar Visita</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const close = () => { modal.style.display = 'none'; };
  document.getElementById('btnCloseCancelModal').addEventListener('click', close);
  document.getElementById('btnDismissCancel').addEventListener('click', close);

  document.getElementById('btnConfirmCancel').addEventListener('click', async () => {
    const motivo = document.getElementById('inputCancelMotivo').value.trim();
    if (!motivo) {
      alert('Por favor, informe o motivo do cancelamento.');
      return;
    }

    const submitBtn = document.getElementById('btnConfirmCancel');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Cancelando...';

    try {
      await Visitas.cancelar(visitaId, motivo);

      await Atividades.registrar({
        usuarioId: currentCorretor?.uid || 'corretor',
        tipo: 'visita',
        titulo: 'Visita cancelada pelo corretor',
        descricao: `Cancelamento: ${motivo}`,
        refTipo: 'visita',
        refId: visitaId
      });

      close();
      showToast('Visita cancelada.', 'info');
    } catch (err) {
      console.error('Erro ao cancelar visita:', err);
      showToast('Erro ao cancelar: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sim, Cancelar Visita';
    }
  });
}

/**
 * MODAL: Marcar como Realizada com Nota Interna
 */
function openCompleteModal(visitaId) {
  let modal = document.getElementById('modalCompleteVisita');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalCompleteVisita';
    modal.className = 'panel-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="panel-modal" style="max-width: 480px;">
      <div class="panel-modal-header">
        <h3 class="panel-modal-title">⭐ Concluir Visita Realizada</h3>
        <button class="panel-modal-close" id="btnCloseCompleteModal">✕</button>
      </div>
      <div class="panel-modal-body">
        <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:1rem;">
          A visita foi realizada com sucesso! Você pode registrar uma anotação interna sobre o feedback e interesse do cliente (visível apenas para você e corretores).
        </p>

        <div class="panel-form-group">
          <label class="panel-form-label">Anotação Interna Pós-Visita</label>
          <textarea id="inputCompleteNota" class="panel-form-textarea" rows="4" placeholder="Ex: Cliente adorou a iluminação da sala e a varanda gourmet. Ficou de conversar com a esposa e enviar uma proposta até sexta-feira."></textarea>
        </div>
      </div>
      <div class="panel-modal-footer">
        <button class="panel-btn panel-btn-secondary" id="btnCancelComplete">Cancelar</button>
        <button class="panel-btn panel-btn-primary" id="btnSubmitComplete">Marcar como Realizada</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const close = () => { modal.style.display = 'none'; };
  document.getElementById('btnCloseCompleteModal').addEventListener('click', close);
  document.getElementById('btnCancelComplete').addEventListener('click', close);

  document.getElementById('btnSubmitComplete').addEventListener('click', async () => {
    const nota = document.getElementById('inputCompleteNota').value.trim();
    const submitBtn = document.getElementById('btnSubmitComplete');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando...';

    try {
      await Visitas.alterarStatus(visitaId, 'realizada', {
        notaInterna: nota || null,
        realizadaEm: serverTimestamp()
      });

      await Atividades.registrar({
        usuarioId: currentCorretor?.uid || 'corretor',
        tipo: 'visita',
        titulo: 'Visita realizada com sucesso',
        descricao: nota ? `Visita realizada. Nota interna: "${nota}"` : 'Visita concluída com sucesso.',
        refTipo: 'visita',
        refId: visitaId
      });

      close();
      showToast('Visita marcada como realizada!', 'success');
    } catch (err) {
      console.error('Erro ao marcar visita como realizada:', err);
      showToast('Erro ao atualizar: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Marcar como Realizada';
    }
  });
}

/**
 * MODAL: Editar Anotação Interna
 */
function openNoteModal(visitaId, currentNote) {
  let modal = document.getElementById('modalNoteVisita');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalNoteVisita';
    modal.className = 'panel-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="panel-modal" style="max-width: 480px;">
      <div class="panel-modal-header">
        <h3 class="panel-modal-title">📝 Anotação Interna da Visita</h3>
        <button class="panel-modal-close" id="btnCloseNoteModal">✕</button>
      </div>
      <div class="panel-modal-body">
        <div class="panel-form-group">
          <label class="panel-form-label">Anotação Interna (Visível apenas a corretores)</label>
          <textarea id="inputEditNota" class="panel-form-textarea" rows="4" placeholder="Adicione notas sobre impressões, detalhes combinados ou objeções do cliente...">${escapeHtml(currentNote)}</textarea>
        </div>
      </div>
      <div class="panel-modal-footer">
        <button class="panel-btn panel-btn-secondary" id="btnCancelEditNote">Cancelar</button>
        <button class="panel-btn panel-btn-primary" id="btnSaveNote">Salvar Anotação</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const close = () => { modal.style.display = 'none'; };
  document.getElementById('btnCloseNoteModal').addEventListener('click', close);
  document.getElementById('btnCancelEditNote').addEventListener('click', close);

  document.getElementById('btnSaveNote').addEventListener('click', async () => {
    const novaNota = document.getElementById('inputEditNota').value.trim();
    const saveBtn = document.getElementById('btnSaveNote');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    try {
      await Visitas.alterarStatus(visitaId, 'realizada', {
        notaInterna: novaNota
      });
      close();
      showToast('Anotação interna atualizada com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao salvar nota:', err);
      showToast('Erro ao salvar anotação: ' + err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Salvar Anotação';
    }
  });
}

/**
 * Monta o layout da View de Visitas / Agenda
 */
function setupVisitasLayout(container) {
  container.innerHTML = `
    <!-- Topo: Título & Métricas de Visitas -->
    <div class="panel-card" style="margin-bottom: 1.5rem;">
      <div class="panel-card-header">
        <div>
          <h3 class="panel-card-title">📅 Agenda de Visitas</h3>
          <p class="panel-card-subtitle">Calendário interativo, controle de conflitos de horário e acompanhamento presencial / vídeo</p>
        </div>
      </div>

      <!-- Widget do Calendário Mensal / Semanal -->
      <div id="visitasCalendarWidget" class="calendar-widget"></div>

      <!-- Barra de Filtros e Busca de Visitas -->
      <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; margin-top:1rem; padding-top:1rem; border-top:1px solid var(--glass-border);">
        <div style="display:flex; gap:0.4rem; flex-wrap:wrap;" id="visitasStatusFilterTabs">
          <button class="panel-btn panel-btn-sm ${currentFilterStatus === 'todas' ? 'panel-btn-primary' : 'panel-btn-secondary'}" data-status="todas">Todas</button>
          <button class="panel-btn panel-btn-sm ${currentFilterStatus === 'pendente' ? 'panel-btn-primary' : 'panel-btn-secondary'}" data-status="pendente">Pendentes</button>
          <button class="panel-btn panel-btn-sm ${currentFilterStatus === 'confirmada' ? 'panel-btn-primary' : 'panel-btn-secondary'}" data-status="confirmada">Confirmadas</button>
          <button class="panel-btn panel-btn-sm ${currentFilterStatus === 'reagendada' ? 'panel-btn-primary' : 'panel-btn-secondary'}" data-status="reagendada">Reagendadas</button>
          <button class="panel-btn panel-btn-sm ${currentFilterStatus === 'realizada' ? 'panel-btn-primary' : 'panel-btn-secondary'}" data-status="realizada">Realizadas</button>
          <button class="panel-btn panel-btn-sm ${currentFilterStatus === 'cancelada' ? 'panel-btn-primary' : 'panel-btn-secondary'}" data-status="cancelada">Canceladas</button>
        </div>

        <div style="flex:1; max-width:320px; min-width:200px;">
          <input type="text" id="inputSearchVisitas" class="panel-form-input" placeholder="🔍 Buscar por cliente ou imóvel..." style="padding:0.45rem 0.85rem; font-size:0.85rem;" />
        </div>
      </div>
    </div>

    <!-- Lista de Visitas Filtradas -->
    <div class="panel-card">
      <div class="panel-card-header">
        <div>
          <h4 class="panel-card-title" id="visitasListTitle">📋 Próximas Visitas</h4>
          <p class="panel-card-subtitle">Solicitações de agendamento e visitas confirmadas da sua carteira</p>
        </div>
      </div>
      <div id="visitasListContainer">
        <div class="panel-empty-state">
          <div class="panel-empty-icon">⏳</div>
          <p class="panel-empty-desc">Carregando visitas...</p>
        </div>
      </div>
    </div>
  `;

  // Filtros por Status (Tabs)
  const filterTabs = document.getElementById('visitasStatusFilterTabs');
  if (filterTabs) {
    filterTabs.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilterStatus = btn.getAttribute('data-status');
        filterTabs.querySelectorAll('button').forEach(b => {
          b.className = 'panel-btn panel-btn-sm panel-btn-secondary';
        });
        btn.className = 'panel-btn panel-btn-sm panel-btn-primary';
        renderVisitasList();
      });
    });
  }

  // Busca em tempo real
  const searchInput = document.getElementById('inputSearchVisitas');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderVisitasList();
    });
  }
}

/**
 * Registra a View 'visitas' no Panel Shell
 */
registerView('visitas', {
  titulo: 'Agenda de Visitas',
  mount(container, user) {
    currentCorretor = user || auth.currentUser;
    setupVisitasLayout(container);

    // Conecta escuta em tempo real às visitas
    if (unsubscribeVisitas) {
      unsubscribeVisitas();
      unsubscribeVisitas = null;
    }

    // Consulta do Firestore: corretores têm permissão geral de leitura em /visitas
    const q = collection(db, 'visitas');
    unsubscribeVisitas = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      // Se houver corretorId no documento, prioriza filtrar pelo corretor autenticado
      // Mas se não houver corretorId vinculado ainda na visita (lead geral do site), exibe para que ele possa assumir/atender
      allVisitas = items.filter(v => !v.corretorId || v.corretorId === currentCorretor?.uid);

      // Atualiza badge de visitas pendentes
      const pendingCount = allVisitas.filter(v => v.status === 'pendente').length;
      updateVisitasBadge(pendingCount);

      // Renderiza calendário e lista
      renderCalendar();
      renderVisitasList();
    }, (err) => {
      console.warn('Erro ao escutar visitas em tempo real:', err.message);
      // Fallback: tenta sem escuta contínua
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
    if (unsubscribeVisitas) {
      unsubscribeVisitas();
      unsubscribeVisitas = null;
    }
  }
});
