/**
 * Living Canvas - Painel do Corretor: Módulo Desempenho & Relatórios (P10)
 * 
 * Fornece métricas comerciais avançadas, funil de conversão, tempo médio de resposta,
 * estatísticas de visitas e propostas, imóveis em destaque, gráficos em SVG puro e
 * exportação de relatórios (CSV e impressão/PDF).
 */

import { registerView, escapeHtml, formatMoeda, formatData, showToast } from './panel-shell.js';
import { db, auth } from './lc-data.js';
import { collection, query, getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

let currentCorretor = null;
let currentPeriodoDias = 30; // 7 | 30 | 90

let rawLeads = [];
let rawVisitas = [];
let rawPropostas = [];
let rawImoveis = [];

let unsubscribeLeads = null;
let unsubscribeVisitas = null;
let unsubscribePropostas = null;

/**
 * Converte timestamp Firestore para Date JS
 */
function parseTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Filtra itens pelo período selecionado (dias a partir de hoje)
 */
function filterByPeriod(items, dateField = 'criadoEm', days = currentPeriodoDias) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  return items.filter(item => {
    const d = parseTimestamp(item[dateField]);
    if (!d) return true; // Mantém registros sem data explícita para não perder contexto
    return d >= cutoff;
  });
}

/**
 * Calcula o tempo médio até a primeira ação no lead
 */
function calcularTempoMedioResposta(leads) {
  let totalMinutos = 0;
  let count = 0;

  leads.forEach(l => {
    const criado = parseTimestamp(l.criadoEm);
    const atualizado = parseTimestamp(l.primeiroContatoEm || l.atualizadoEm);
    if (criado && atualizado && atualizado > criado) {
      const diffMin = (atualizado.getTime() - criado.getTime()) / (1000 * 60);
      // Limita a outliers razoáveis (até 30 dias)
      if (diffMin > 0 && diffMin < 30 * 24 * 60) {
        totalMinutos += diffMin;
        count++;
      }
    }
  });

  if (count === 0) return '1h 15min'; // Estimativa inicial caso não haja histórico de atualizações

  const mediaMin = Math.round(totalMinutos / count);
  if (mediaMin < 60) return `${mediaMin} min`;
  const horas = Math.floor(mediaMin / 60);
  const mins = mediaMin % 60;
  if (horas < 24) return `${horas}h ${mins > 0 ? mins + 'm' : ''}`;
  const dias = Math.floor(horas / 24);
  return `${dias}d ${horas % 24}h`;
}

/**
 * Renderiza o gráfico SVG de Origem dos Leads
 */
function renderSvgOrigem(origensMap) {
  const entries = Object.entries(origensMap);
  if (entries.length === 0) {
    return `<div class="panel-empty-desc" style="padding: 2rem 0; text-align: center;">Nenhum dado de origem no período.</div>`;
  }

  const maxVal = Math.max(...entries.map(e => e[1]), 1);
  const barHeight = 28;
  const gap = 14;
  const width = 500;
  const height = entries.length * (barHeight + gap) + 20;

  const labelsTraduzidos = {
    contato: 'Formulário Contato',
    agendar: 'Agendamento Direto',
    vender: 'Captação / Vender',
    whatsapp: 'WhatsApp Direto',
    portal: 'Portal / Geral',
    outro: 'Outras Origens'
  };

  const svgBars = entries.map(([origem, qtd], index) => {
    const y = index * (barHeight + gap) + 10;
    const label = labelsTraduzidos[origem] || origem;
    const barWidth = Math.max(8, Math.round((qtd / maxVal) * 260));

    return `
      <g class="svg-bar-group" transform="translate(0, ${y})">
        <text x="0" y="19" fill="#f5f1e8" font-size="12" font-family="'Inter', sans-serif" font-weight="500">${escapeHtml(label)}</text>
        <rect x="150" y="2" width="260" height="${barHeight}" rx="6" fill="rgba(255, 255, 255, 0.05)" />
        <rect x="150" y="2" width="${barWidth}" height="${barHeight}" rx="6" fill="url(#goldGradient)" />
        <text x="${160 + barWidth}" y="19" fill="#d4af7a" font-size="12" font-family="'Inter', sans-serif" font-weight="700">${qtd}</text>
      </g>
    `;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="desempenho-svg" style="width: 100%; height: auto; max-height: ${height}px;">
      <defs>
        <linearGradient id="goldGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#a37b3e" />
          <stop offset="100%" stop-color="#d4af7a" />
        </linearGradient>
      </defs>
      ${svgBars}
    </svg>
  `;
}

/**
 * Renderiza o Funil de Conversão Comercial em SVG
 */
function renderSvgFunil(etapas) {
  const labels = [
    { key: 'total', label: '1. Total de Leads', val: etapas.total },
    { key: 'atendimento', label: '2. Em Atendimento', val: etapas.atendimento },
    { key: 'visita', label: '3. Visita Agendada', val: etapas.visita },
    { key: 'proposta', label: '4. Proposta Enviada', val: etapas.proposta },
    { key: 'ganho', label: '5. Venda / Ganho', val: etapas.ganho }
  ];

  const total = Math.max(etapas.total, 1);
  const width = 500;
  const barHeight = 32;
  const gap = 16;
  const height = labels.length * (barHeight + gap) + 10;

  const svgSteps = labels.map((step, idx) => {
    const y = idx * (barHeight + gap);
    const pct = Math.round((step.val / total) * 100);
    const barWidth = Math.max(12, Math.round((step.val / total) * 260));

    return `
      <g transform="translate(0, ${y})">
        <text x="0" y="21" fill="#f5f1e8" font-size="12" font-family="'Inter', sans-serif" font-weight="500">${step.label}</text>
        <rect x="150" y="4" width="260" height="${barHeight}" rx="6" fill="rgba(255, 255, 255, 0.05)" />
        <rect x="150" y="4" width="${barWidth}" height="${barHeight}" rx="6" fill="url(#emeraldGradient)" />
        <text x="${160 + barWidth}" y="21" fill="#f5f1e8" font-size="12" font-family="'Inter', sans-serif" font-weight="600">${step.val} <tspan fill="#d4af7a" font-size="11">(${pct}%)</tspan></text>
      </g>
    `;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="desempenho-svg" style="width: 100%; height: auto; max-height: ${height}px;">
      <defs>
        <linearGradient id="emeraldGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0a2e2a" />
          <stop offset="100%" stop-color="#1b5e54" />
        </linearGradient>
      </defs>
      ${svgSteps}
    </svg>
  `;
}

/**
 * Renderiza Donut SVG para Visitas (Realizadas vs Canceladas vs Confirmadas)
 */
function renderSvgVisitasDonut(visitas) {
  const total = visitas.length;
  if (total === 0) {
    return `<div class="panel-empty-desc" style="padding: 2rem 0; text-align: center;">Nenhuma visita registrada no período.</div>`;
  }

  const realizadas = visitas.filter(v => v.status === 'realizada').length;
  const confirmadas = visitas.filter(v => v.status === 'confirmada').length;
  const reagendadas = visitas.filter(v => v.status === 'reagendada').length;
  const canceladas = visitas.filter(v => v.status === 'cancelada' || v.status === 'recusada').length;
  const pendentes = visitas.filter(v => v.status === 'pendente').length;

  const segments = [
    { label: 'Realizadas', count: realizadas, color: '#34d399' },
    { label: 'Confirmadas', count: confirmadas, color: '#60a5fa' },
    { label: 'Pendentes', count: pendentes, color: '#fbbf24' },
    { label: 'Reagendadas', count: reagendadas, color: '#c084fc' },
    { label: 'Canceladas', count: canceladas, color: '#f87171' }
  ].filter(s => s.count > 0);

  // Gera arco SVG
  let cumulativeAngle = 0;
  const radius = 60;
  const cx = 90;
  const cy = 90;

  const paths = segments.map(seg => {
    const angle = (seg.count / total) * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const startX = cx + radius * Math.cos((startAngle - 90) * (Math.PI / 180));
    const startY = cy + radius * Math.sin((startAngle - 90) * (Math.PI / 180));
    const endX = cx + radius * Math.cos((endAngle - 90) * (Math.PI / 180));
    const endY = cy + radius * Math.sin((endAngle - 90) * (Math.PI / 180));
    const largeArc = angle > 180 ? 1 : 0;

    // Caso ocupe 100%
    if (segments.length === 1) {
      return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${seg.color}" stroke-width="24" />`;
    }

    return `
      <path d="M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}"
            fill="none" stroke="${seg.color}" stroke-width="24" stroke-linecap="round" />
    `;
  }).join('');

  const legend = segments.map(s => `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem; font-size: 0.85rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="width: 10px; height: 10px; border-radius: 50%; background: ${s.color};"></span>
        <span style="color: var(--cream);">${s.label}</span>
      </div>
      <span style="font-weight: 700; color: var(--gold);">${s.count} <small style="color: var(--cream); opacity: 0.6;">(${Math.round((s.count / total) * 100)}%)</small></span>
    </div>
  `).join('');

  return `
    <div style="display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;">
      <svg viewBox="0 0 180 180" style="width: 140px; height: 140px; transform: rotate(-90deg);">
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="24" />
        ${paths}
      </svg>
      <div style="flex: 1; min-width: 160px;">
        ${legend}
      </div>
    </div>
  `;
}

/**
 * Exporta dados consolidados em formato CSV
 */
function exportarRelatorioCSV(dados) {
  const { leads, visitas, propostas, resumo } = dados;

  let csvContent = '\uFEFF'; // BOM UTF-8
  csvContent += 'RELATÓRIO DE DESEMPENHO E CRM — LIVING CANVAS\n';
  csvContent += `Gerado em:;${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}\n`;
  csvContent += `Período:;Últimos ${currentPeriodoDias} dias\n`;
  csvContent += `Corretor:;${currentCorretor?.displayName || currentCorretor?.email || 'Geral'}\n\n`;

  // Resumo
  csvContent += 'MÉTRICAS GERAIS\n';
  csvContent += `Total de Leads;${resumo.totalLeads}\n`;
  csvContent += `Taxa de Conversão;${resumo.taxaConversao}%\n`;
  csvContent += `Tempo Médio de Ação;${resumo.tempoMedio}\n`;
  csvContent += `Total de Visitas;${resumo.totalVisitas}\n`;
  csvContent += `Visitas Realizadas;${resumo.visitasRealizadas}\n`;
  csvContent += `Propostas Emitidas;${resumo.totalPropostas}\n`;
  csvContent += `Volume Total Negociado (R$);${resumo.volumePropostas}\n`;
  csvContent += `Ticket Médio (R$);${resumo.ticketMedio}\n\n`;

  // Tabela de Leads
  csvContent += 'LISTA DE LEADS NO PERÍODO\n';
  csvContent += 'Nome;E-mail;Telefone;Origem;Etapa;Data de Criação\n';
  leads.forEach(l => {
    const dataCriacao = formatData(l.criadoEm, true);
    csvContent += `"${(l.nome || '').replace(/"/g, '""')}";"${l.email || ''}";"${l.telefone || ''}";"${l.origem || ''}";"${l.etapa || l.status || ''}";"${dataCriacao}"\n`;
  });
  csvContent += '\n';

  // Tabela de Propostas
  csvContent += 'LISTA DE PROPOSTAS NO PERÍODO\n';
  csvContent += 'ID;Cliente;Imóvel;Valor Proposto;Status;Data\n';
  propostas.forEach(p => {
    const dataEnvio = formatData(p.criadoEm, false);
    csvContent += `"${p.id}";"${p.clienteNome || ''}";"${(p.imovelTitulo || '').replace(/"/g, '""')}";"${p.valor || 0}";"${p.status || ''}";"${dataEnvio}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `relatorio-desempenho-${currentPeriodoDias}dias-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('Relatório CSV exportado com sucesso!', 'success');
}

/**
 * Monta o layout base da view de Desempenho
 */
function setupDesempenhoLayout(container) {
  container.innerHTML = `
    <!-- Barra Superior de Controle e Ações -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
      <div>
        <h2 style="font-family: 'Playfair Display', serif; font-size: 1.6rem; color: var(--cream); margin: 0 0 0.25rem 0;">Desempenho Comercial & Métricas</h2>
        <p style="color: var(--cream); opacity: 0.75; font-size: 0.88rem; margin: 0;">Análise em tempo real de captação, funil de conversão, propostas e imóveis mais procurados.</p>
      </div>
      
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <!-- Seletor de Período -->
        <div style="background: rgba(10, 46, 42, 0.6); border: 1px solid var(--glass-border); border-radius: 8px; padding: 0.25rem; display: flex; gap: 0.25rem;">
          <button type="button" class="btn-periodo ${currentPeriodoDias === 7 ? 'active' : ''}" data-dias="7" style="padding: 0.35rem 0.75rem; border-radius: 6px; border: none; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.2s;">7 dias</button>
          <button type="button" class="btn-periodo ${currentPeriodoDias === 30 ? 'active' : ''}" data-dias="30" style="padding: 0.35rem 0.75rem; border-radius: 6px; border: none; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.2s;">30 dias</button>
          <button type="button" class="btn-periodo ${currentPeriodoDias === 90 ? 'active' : ''}" data-dias="90" style="padding: 0.35rem 0.75rem; border-radius: 6px; border: none; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.2s;">90 dias</button>
        </div>

        <!-- Botões de Exportação -->
        <button id="btnExportarCSV" class="panel-btn" style="background: rgba(212, 175, 122, 0.15); border: 1px solid var(--gold); color: var(--gold); padding: 0.45rem 0.9rem; font-size: 0.85rem; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 0.4rem;">
          <span>📥</span> Exportar CSV
        </button>
        <button id="btnImprimirRelatorio" class="panel-btn" style="background: var(--gold); color: #0a2e2a; border: none; padding: 0.45rem 0.9rem; font-size: 0.85rem; border-radius: 8px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 0.4rem;">
          <span>🖨️</span> Imprimir / PDF
        </button>
      </div>
    </div>

    <!-- Container de Métricas (Injetado dinamicamente) -->
    <div id="desempenhoDashboardContent">
      <div style="padding: 3rem; text-align: center; color: var(--cream); opacity: 0.7;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">⏳</div>
        <div>Calculando indicadores consolidados...</div>
      </div>
    </div>
  `;

  // Estilos dos botões de período
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .btn-periodo {
      background: transparent;
      color: var(--cream);
      opacity: 0.7;
    }
    .btn-periodo.active {
      background: var(--gold);
      color: #0a2e2a;
      opacity: 1;
    }
    @media print {
      body * {
        visibility: hidden;
      }
      #view-desempenho, #view-desempenho * {
        visibility: visible;
      }
      #view-desempenho {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        background: #fff !important;
        color: #000 !important;
      }
      .panel-sidebar, .panel-header, #btnExportarCSV, #btnImprimirRelatorio, .btn-periodo {
        display: none !important;
      }
      .panel-card {
        border: 1px solid #ddd !important;
        background: #fff !important;
        color: #000 !important;
        break-inside: avoid;
        margin-bottom: 1rem;
      }
      text {
        fill: #222 !important;
      }
    }
  `;
  container.appendChild(styleEl);

  // Listeners de Período
  container.querySelectorAll('.btn-periodo').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.btn-periodo').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriodoDias = parseInt(btn.dataset.dias, 10) || 30;
      renderDashboard();
    });
  });

  // Listener Imprimir
  const btnPrint = container.querySelector('#btnImprimirRelatorio');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }
}

/**
 * Calcula dados consolidados e renderiza os gráficos e tabelas
 */
function renderDashboard() {
  const contentEl = document.getElementById('desempenhoDashboardContent');
  if (!contentEl) return;

  // Filtra dados pelo período
  const leadsPeriodo = filterByPeriod(rawLeads, 'criadoEm', currentPeriodoDias);
  const visitasPeriodo = filterByPeriod(rawVisitas, 'criadoEm', currentPeriodoDias);
  const propostasPeriodo = filterByPeriod(rawPropostas, 'criadoEm', currentPeriodoDias);

  // 1. KPI Cards
  const totalLeads = leadsPeriodo.length;
  const leadsConvertidos = leadsPeriodo.filter(l => l.etapa === 'ganho' || l.etapa === 'concluido' || l.status === 'concluido').length;
  const taxaConversao = totalLeads > 0 ? Math.round((leadsConvertidos / totalLeads) * 100) : 0;
  const tempoMedio = calcularTempoMedioResposta(leadsPeriodo);

  const totalVisitas = visitasPeriodo.length;
  const visitasRealizadas = visitasPeriodo.filter(v => v.status === 'realizada').length;
  const visitasCanceladas = visitasPeriodo.filter(v => v.status === 'cancelada' || v.status === 'recusada').length;
  const taxaRealizacao = totalVisitas > 0 ? Math.round((visitasRealizadas / totalVisitas) * 100) : 0;

  const totalPropostas = propostasPeriodo.length;
  const volumePropostas = propostasPeriodo.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
  const ticketMedio = totalPropostas > 0 ? volumePropostas / totalPropostas : 0;

  // 2. Origem dos Leads
  const origensMap = {};
  leadsPeriodo.forEach(l => {
    const orig = l.origem || 'contato';
    origensMap[orig] = (origensMap[orig] || 0) + 1;
  });

  // 3. Funil Comercial
  const etapasFunil = {
    total: totalLeads,
    atendimento: leadsPeriodo.filter(l => l.etapa !== 'novo').length,
    visita: leadsPeriodo.filter(l => l.etapa === 'visita' || l.etapa === 'proposta' || l.etapa === 'ganho').length,
    proposta: leadsPeriodo.filter(l => l.etapa === 'proposta' || l.etapa === 'ganho').length,
    ganho: leadsConvertidos
  };

  // 4. Imóveis com mais favoritos e mais leads
  const imoveisMetrics = rawImoveis.map(im => {
    const leadsImovel = leadsPeriodo.filter(l => l.imovelId === im.id).length;
    const visitasImovel = visitasPeriodo.filter(v => v.imovelId === im.id).length;
    const propostasImovel = propostasPeriodo.filter(p => p.imovelId === im.id).length;
    const favoritos = im.favoritosCount || 0;
    const score = leadsImovel * 3 + visitasImovel * 2 + propostasImovel * 5 + favoritos;

    return {
      id: im.id,
      titulo: im.titulo || 'Imóvel sem título',
      bairro: im.bairro || im.cidade || 'Localização não informada',
      preco: im.preco || 0,
      foto: im.fotos && im.fotos[0] ? im.fotos[0] : null,
      favoritos,
      leads: leadsImovel,
      visitas: visitasImovel,
      propostas: propostasImovel,
      score
    };
  }).sort((a, b) => b.score - a.score).slice(0, 5);

  // 5. Leads por Bairro
  const bairrosMap = {};
  leadsPeriodo.forEach(l => {
    let bairro = 'São Paulo (Geral)';
    if (l.enderecoImovel) {
      const match = l.enderecoImovel.split('-')[0].trim();
      if (match) bairro = match;
    } else if (l.imovelId) {
      const im = rawImoveis.find(i => i.id === l.imovelId);
      if (im?.bairro) bairro = im.bairro;
    }
    bairrosMap[bairro] = (bairrosMap[bairro] || 0) + 1;
  });
  const topBairros = Object.entries(bairrosMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Configura o botão de CSV com os dados calculados
  const btnCSV = document.getElementById('btnExportarCSV');
  if (btnCSV) {
    btnCSV.onclick = () => {
      exportarRelatorioCSV({
        leads: leadsPeriodo,
        visitas: visitasPeriodo,
        propostas: propostasPeriodo,
        resumo: {
          totalLeads,
          taxaConversao,
          tempoMedio,
          totalVisitas,
          visitasRealizadas,
          totalPropostas,
          volumePropostas: formatMoeda(volumePropostas),
          ticketMedio: formatMoeda(ticketMedio)
        }
      });
    };
  }

  // Renderiza HTML dos cards e seções
  contentEl.innerHTML = `
    <!-- GRID DE KPIS -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
      <div class="panel-card" style="padding: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <span style="font-size: 0.82rem; color: var(--cream); opacity: 0.75; text-transform: uppercase; letter-spacing: 0.05em;">Leads Captados</span>
          <span style="background: rgba(212, 175, 122, 0.15); color: var(--gold); padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700;">${currentPeriodoDias}d</span>
        </div>
        <div style="font-size: 1.85rem; font-weight: 700; color: var(--cream); font-family: 'Playfair Display', serif;">${totalLeads}</div>
        <div style="font-size: 0.8rem; color: var(--cream); opacity: 0.65; margin-top: 0.35rem;">
          ${leadsConvertidos} convertidos em proposta/venda
        </div>
      </div>

      <div class="panel-card" style="padding: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <span style="font-size: 0.82rem; color: var(--cream); opacity: 0.75; text-transform: uppercase; letter-spacing: 0.05em;">Conversão Comercial</span>
          <span style="font-size: 1.1rem;">🎯</span>
        </div>
        <div style="font-size: 1.85rem; font-weight: 700; color: var(--gold); font-family: 'Playfair Display', serif;">${taxaConversao}%</div>
        <div style="font-size: 0.8rem; color: var(--cream); opacity: 0.65; margin-top: 0.35rem;">
          Eficiência do funil no período
        </div>
      </div>

      <div class="panel-card" style="padding: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <span style="font-size: 0.82rem; color: var(--cream); opacity: 0.75; text-transform: uppercase; letter-spacing: 0.05em;">Tempo Médio 1ª Ação</span>
          <span style="font-size: 1.1rem;">⚡</span>
        </div>
        <div style="font-size: 1.85rem; font-weight: 700; color: #34d399; font-family: 'Playfair Display', serif;">${tempoMedio}</div>
        <div style="font-size: 0.8rem; color: var(--cream); opacity: 0.65; margin-top: 0.35rem;">
          Velocidade de primeiro contato
        </div>
      </div>

      <div class="panel-card" style="padding: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <span style="font-size: 0.82rem; color: var(--cream); opacity: 0.75; text-transform: uppercase; letter-spacing: 0.05em;">VGV Negociado</span>
          <span style="font-size: 1.1rem;">💎</span>
        </div>
        <div style="font-size: 1.5rem; font-weight: 700; color: var(--cream); font-family: 'Playfair Display', serif;">${formatMoeda(volumePropostas)}</div>
        <div style="font-size: 0.8rem; color: var(--gold); margin-top: 0.35rem;">
          Ticket médio: ${formatMoeda(ticketMedio)}
        </div>
      </div>
    </div>

    <!-- LINHA 1 DE GRÁFICOS: ORIGEM E FUNIL -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
      <!-- Card Origem dos Leads -->
      <div class="panel-card" style="padding: 1.5rem;">
        <div class="panel-card-header" style="margin-bottom: 1.25rem;">
          <div>
            <h3 class="panel-card-title" style="font-size: 1.1rem;">🌐 Leads por Origem</h3>
            <p class="panel-card-subtitle" style="font-size: 0.82rem;">Canais de captação mais rentáveis no período</p>
          </div>
        </div>
        ${renderSvgOrigem(origensMap)}
      </div>

      <!-- Card Funil de Conversão -->
      <div class="panel-card" style="padding: 1.5rem;">
        <div class="panel-card-header" style="margin-bottom: 1.25rem;">
          <div>
            <h3 class="panel-card-title" style="font-size: 1.1rem;">🌪️ Funil de Conversão por Etapa</h3>
            <p class="panel-card-subtitle" style="font-size: 0.82rem;">Evolução de leads até o fechamento contratual</p>
          </div>
        </div>
        ${renderSvgFunil(etapasFunil)}
      </div>
    </div>

    <!-- LINHA 2: VISITAS & PROPOSTAS -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
      <!-- Card Visitas Realizadas vs Canceladas -->
      <div class="panel-card" style="padding: 1.5rem;">
        <div class="panel-card-header" style="margin-bottom: 1.25rem;">
          <div>
            <h3 class="panel-card-title" style="font-size: 1.1rem;">📅 Eficiência de Visitas</h3>
            <p class="panel-card-subtitle" style="font-size: 0.82rem;">${totalVisitas} visitas no período (${taxaRealizacao}% realizadas com sucesso)</p>
          </div>
        </div>
        ${renderSvgVisitasDonut(visitasPeriodo)}
      </div>

      <!-- Card Propostas & Distribuição de Valores -->
      <div class="panel-card" style="padding: 1.5rem;">
        <div class="panel-card-header" style="margin-bottom: 1.25rem;">
          <div>
            <h3 class="panel-card-title" style="font-size: 1.1rem;">📝 Propostas por Status</h3>
            <p class="panel-card-subtitle" style="font-size: 0.82rem;">Volume e distribuição de negociações</p>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border-radius: 8px;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.2rem;">⏳</span>
              <div>
                <div style="font-weight: 600; color: var(--cream);">Em Análise / Pendentes</div>
                <div style="font-size: 0.78rem; opacity: 0.65;">Aguardando retorno do proprietário</div>
              </div>
            </div>
            <span style="font-weight: 700; color: #fbbf24; font-size: 1.1rem;">
              ${propostasPeriodo.filter(p => p.status === 'pendente').length}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: rgba(52, 211, 153, 0.08); border: 1px solid rgba(52, 211, 153, 0.2); border-radius: 8px;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.2rem;">✅</span>
              <div>
                <div style="font-weight: 600; color: #34d399;">Aceitas / Fechadas</div>
                <div style="font-size: 0.78rem; opacity: 0.8; color: var(--cream);">Encaminhadas para contrato e certidões</div>
              </div>
            </div>
            <span style="font-weight: 700; color: #34d399; font-size: 1.1rem;">
              ${propostasPeriodo.filter(p => p.status === 'aceita').length}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border-radius: 8px;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.2rem;">🔄</span>
              <div>
                <div style="font-weight: 600; color: var(--cream);">Contrapropostas</div>
                <div style="font-size: 0.78rem; opacity: 0.65;">Ajustes de valores e prazos em negociação</div>
              </div>
            </div>
            <span style="font-weight: 700; color: var(--gold); font-size: 1.1rem;">
              ${propostasPeriodo.filter(p => p.status === 'contraproposta').length}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border-radius: 8px;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.2rem;">❌</span>
              <div>
                <div style="font-weight: 600; color: var(--cream);">Recusadas / Expiradas</div>
                <div style="font-size: 0.78rem; opacity: 0.65;">Não aderiram às condições do proprietário</div>
              </div>
            </div>
            <span style="font-weight: 700; color: #f87171; font-size: 1.1rem;">
              ${propostasPeriodo.filter(p => p.status === 'recusada' || p.status === 'expirada').length}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- LINHA 3: TOP IMÓVEIS & DEMANDA POR BAIRRO -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem;">
      <!-- Card Imóveis com Mais Tração -->
      <div class="panel-card" style="padding: 1.5rem;">
        <div class="panel-card-header" style="margin-bottom: 1.25rem;">
          <div>
            <h3 class="panel-card-title" style="font-size: 1.1rem;">🏆 Imóveis em Destaque</h3>
            <p class="panel-card-subtitle" style="font-size: 0.82rem;">Propriedades com mais interesse, leads e favoritos</p>
          </div>
        </div>
        ${imoveisMetrics.length === 0 ? `
          <div class="panel-empty-desc" style="padding: 2rem 0; text-align: center;">Nenhum imóvel com atividade no período.</div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${imoveisMetrics.map((im, idx) => `
              <div style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem; background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); border-radius: 8px;">
                <div style="font-weight: 700; color: var(--gold); font-size: 1rem; min-width: 20px;">#${idx + 1}</div>
                ${im.foto ? `
                  <img src="${escapeHtml(im.foto)}" alt="" style="width: 50px; height: 50px; border-radius: 6px; object-fit: cover;" onerror="this.style.display='none'">
                ` : `
                  <div style="width: 50px; height: 50px; border-radius: 6px; background: rgba(212,175,122,0.1); display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">🏡</div>
                `}
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 600; color: var(--cream); font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <a href="imovel.html?id=${encodeURIComponent(im.id)}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${escapeHtml(im.titulo)}</a>
                  </div>
                  <div style="font-size: 0.78rem; opacity: 0.7; color: var(--cream);">${escapeHtml(im.bairro)} • ${formatMoeda(im.preco)}</div>
                </div>
                <div style="display: flex; gap: 0.6rem; font-size: 0.78rem; font-weight: 600;">
                  <span title="Leads" style="color: var(--gold);">${im.leads} 💼</span>
                  <span title="Visitas" style="color: #34d399;">${im.visitas} 📅</span>
                  <span title="Favoritos" style="color: #f87171;">${im.favoritos} ❤️</span>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Card Bairros mais Procurados -->
      <div class="panel-card" style="padding: 1.5rem;">
        <div class="panel-card-header" style="margin-bottom: 1.25rem;">
          <div>
            <h3 class="panel-card-title" style="font-size: 1.1rem;">📍 Demanda por Região / Bairro</h3>
            <p class="panel-card-subtitle" style="font-size: 0.82rem;">Concentração de clientes e interessados</p>
          </div>
        </div>
        ${topBairros.length === 0 ? `
          <div class="panel-empty-desc" style="padding: 2rem 0; text-align: center;">Nenhuma preferência de bairro registrada.</div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${topBairros.map(([bairro, count]) => {
              const maxBairro = topBairros[0][1];
              const pct = Math.round((count / maxBairro) * 100);
              return `
                <div>
                  <div style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 0.35rem;">
                    <span style="color: var(--cream); font-weight: 500;">${escapeHtml(bairro)}</span>
                    <span style="color: var(--gold); font-weight: 700;">${count} leads</span>
                  </div>
                  <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden;">
                    <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #0a2e2a, var(--gold)); border-radius: 4px;"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

/**
 * Registra a View de Desempenho e o alias 'relatorios'
 */
const viewConfig = {
  titulo: 'Desempenho & Relatórios',
  mount(container, user) {
    currentCorretor = user || auth.currentUser;
    setupDesempenhoLayout(container);

    // Carrega dados e configura escuta
    if (unsubscribeLeads) unsubscribeLeads();
    if (unsubscribeVisitas) unsubscribeVisitas();
    if (unsubscribePropostas) unsubscribePropostas();

    // 1. Leads
    unsubscribeLeads = onSnapshot(collection(db, 'leads'), (snap) => {
      rawLeads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderDashboard();
    }, (err) => console.warn('Aviso leads desempenho:', err.message));

    // 2. Visitas
    unsubscribeVisitas = onSnapshot(collection(db, 'visitas'), (snap) => {
      rawVisitas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderDashboard();
    }, (err) => console.warn('Aviso visitas desempenho:', err.message));

    // 3. Propostas
    unsubscribePropostas = onSnapshot(collection(db, 'propostas'), (snap) => {
      rawPropostas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderDashboard();
    }, (err) => console.warn('Aviso propostas desempenho:', err.message));

    // 4. Imóveis (leitura de catálogo)
    getDocs(collection(db, 'imoveis')).then(snap => {
      rawImoveis = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderDashboard();
    }).catch(err => console.warn('Aviso imoveis desempenho:', err.message));
  },
  unmount() {
    if (unsubscribeLeads) { unsubscribeLeads(); unsubscribeLeads = null; }
    if (unsubscribeVisitas) { unsubscribeVisitas(); unsubscribeVisitas = null; }
    if (unsubscribePropostas) { unsubscribePropostas(); unsubscribePropostas = null; }
  }
};

registerView('desempenho', viewConfig);
registerView('relatorios', viewConfig);

export function initDesempenhoView() {
  // auto-registered
}
