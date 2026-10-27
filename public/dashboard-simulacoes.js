/**
 * Living Canvas - Dashboard do Cliente: Simulações de Financiamento (P13)
 * 
 * Gerencia o histórico de simulações financeiras salvas pelo cliente:
 * - Listagem de cenários (valor, entrada, prazo, amortização SAC/PRICE, taxas e bancos)
 * - Estimativas de parcelas e juros
 * - Ação "Refazer Simulação" pré-carregando financiamento.html
 * - Ação "Falar com Especialista de Crédito" via WhatsApp / Contato
 * - Exclusão segura de simulações salvas no Firestore
 */

import { registerView } from './panel-shell.js';
import LivingCanvasAuth from './auth.js';
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

const db = LivingCanvasAuth.db;
const COLLECTION_SIMULACOES = 'simulacoes';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoeda(val) {
  if (val == null || isNaN(val)) return 'R$ 0';
  return 'R$ ' + Number(val).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function formatData(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function showToast(message, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  const toast = document.createElement('div');
  toast.className = `panel-toast panel-toast-${type}`;
  toast.style.cssText = `
    position: fixed; bottom: 2rem; right: 2rem; z-index: 10000;
    padding: 0.85rem 1.25rem; border-radius: 8px; font-size: 0.88rem;
    background: ${type === 'error' ? '#7f1d1d' : type === 'success' ? '#064e3b' : '#0a2e2a'};
    border: 1px solid var(--gold); color: var(--cream); box-shadow: 0 10px 25px rgba(0,0,0,0.5);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

async function carregarSimulacoes(user) {
  const container = document.getElementById('clientSimulacoesContainer');
  if (!container) return;

  container.innerHTML = '<div class="panel-skeleton" style="height: 180px; margin-bottom: 1rem;"></div>';

  try {
    const q = query(
      collection(db, COLLECTION_SIMULACOES),
      where('usuarioId', '==', user.uid)
    );
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => {
      list.push({ id: d.id, ...d.data() });
    });

    // Ordenar pelas mais recentes
    list.sort((a, b) => {
      const tA = a.criadoEm?.toMillis ? a.criadoEm.toMillis() : new Date(a.criadoEm || 0).getTime();
      const tB = b.criadoEm?.toMillis ? b.criadoEm.toMillis() : new Date(b.criadoEm || 0).getTime();
      return tB - tA;
    });

    if (list.length === 0) {
      container.innerHTML = `
        <div class="panel-empty-state">
          <div class="panel-empty-icon">🧮</div>
          <h4 class="panel-empty-title">Nenhuma simulação salva ainda</h4>
          <p class="panel-empty-desc">
            Use nosso simulador interativo para estimar fluxos de financiamento com taxas atualizadas dos principais bancos e salve seus cenários aqui.
          </p>
          <a href="financiamento.html" class="panel-btn panel-btn-primary panel-btn-sm">+ Simular Financiamento</a>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem;">
        ${list.map(sim => {
          const valor = Number(sim.valor) || 0;
          const entradaValor = Number(sim.entradaValor) || 0;
          const entradaPct = Number(sim.entradaPct) || 20;
          const prazoAnos = Number(sim.prazoAnos) || 30;
          const meses = prazoAnos * 12;
          const amort = (sim.amortType || 'sac').toUpperCase();
          const bancoNome = sim.banco ? sim.banco.toUpperCase() : 'MÉDIA DE MERCADO';
          const taxa = Number(sim.taxaAnual) || 10.2;
          const financiado = valor - entradaValor;

          const paramStr = new URLSearchParams({
            valor: valor,
            entrada: entradaPct,
            prazo: prazoAnos,
            taxa: taxa,
            banco: (sim.banco || 'caixa').toLowerCase(),
            amort: (sim.amortType || 'sac').toLowerCase()
          }).toString();

          const redoUrl = `financiamento.html?${paramStr}`;
          const whatsMsg = encodeURIComponent(`Olá! Salvei uma simulação no Living Canvas para um imóvel de ${formatMoeda(valor)} (${prazoAnos} anos via ${bancoNome}) e gostaria de uma assessoria de crédito.`);
          const whatsUrl = `https://wa.me/5511999999999?text=${whatsMsg}`;

          return `
            <div class="panel-card" style="margin-bottom:0; display:flex; flex-direction:column; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:14px; padding:1.25rem;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
                <div>
                  <span class="panel-badge panel-badge-ganho" style="font-size:0.75rem;">${escapeHtml(bancoNome)} • ${taxa.toFixed(2)}% a.a.</span>
                  <h4 style="font-family:'Playfair Display',serif; font-size:1.3rem; color:var(--gold); margin-top:0.4rem;">
                    ${formatMoeda(valor)}
                  </h4>
                  <span style="font-size:0.78rem; color:var(--text-muted);">${formatData(sim.criadoEm)}</span>
                </div>
                <button type="button" class="btn-delete-sim" data-sim-id="${escapeHtml(sim.id)}" title="Excluir simulação" style="background:none; border:none; color:var(--danger, #ef4444); font-size:1.1rem; cursor:pointer;">
                  🗑️
                </button>
              </div>

              <!-- Detalhes do Financiamento -->
              <div style="background:rgba(0,0,0,0.25); border-radius:10px; padding:0.9rem; margin-bottom:1rem; font-size:0.83rem;">
                <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem;">
                  <span style="color:var(--text-muted);">Entrada (${entradaPct}%):</span>
                  <span style="color:var(--cream); font-weight:600;">${formatMoeda(entradaValor)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem;">
                  <span style="color:var(--text-muted);">Financiado:</span>
                  <span style="color:var(--cream); font-weight:600;">${formatMoeda(financiado)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem;">
                  <span style="color:var(--text-muted);">Prazo:</span>
                  <span style="color:var(--cream); font-weight:600;">${prazoAnos} anos (${meses} meses)</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem;">
                  <span style="color:var(--text-muted);">Sistema:</span>
                  <span class="panel-badge" style="background:rgba(212,175,122,0.15); color:var(--gold); padding:2px 6px;">${escapeHtml(amort)}</span>
                </div>
                ${sim.primeiraParcela ? `
                  <div style="display:flex; justify-content:space-between; margin-top:0.5rem; padding-top:0.5rem; border-top:1px dashed var(--glass-border);">
                    <span style="color:var(--text-muted);">${amort === 'SAC' ? '1ª Parcela:' : 'Parcela Fixa:'}</span>
                    <span style="color:var(--gold); font-weight:700; font-size:0.95rem;">${formatMoeda(sim.primeiraParcela)}</span>
                  </div>
                ` : ''}
                ${sim.ultimaParcela && amort === 'SAC' ? `
                  <div style="display:flex; justify-content:space-between;">
                    <span style="color:var(--text-muted);">Última Parcela:</span>
                    <span style="color:var(--cream);">${formatMoeda(sim.ultimaParcela)}</span>
                  </div>
                ` : ''}
              </div>

              <!-- Ações da Simulação -->
              <div style="margin-top:auto; display:flex; flex-direction:column; gap:0.5rem;">
                <a href="${redoUrl}" class="panel-btn panel-btn-primary panel-btn-sm" style="text-align:center; text-decoration:none;">
                  🔄 Refazer / Ajustar Cenário
                </a>
                <a href="${whatsUrl}" target="_blank" rel="noopener noreferrer" class="panel-btn panel-btn-secondary panel-btn-sm" style="text-align:center; text-decoration:none;">
                  💬 Falar com Especialista
                </a>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Handler de exclusão
    container.querySelectorAll('.btn-delete-sim').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const simId = e.currentTarget.getAttribute('data-sim-id');
        if (!simId) return;
        if (!confirm('Deseja excluir esta simulação salva?')) return;
        try {
          await deleteDoc(doc(db, COLLECTION_SIMULACOES, simId));
          showToast('Simulação removida com sucesso.', 'info');
          await carregarSimulacoes(user);
        } catch (err) {
          console.error('Erro ao excluir simulação:', err);
          showToast('Erro ao remover simulação.', 'error');
        }
      });
    });

  } catch (err) {
    console.error('Erro ao listar simulações:', err);
    container.innerHTML = `
      <div class="panel-empty-state">
        <p style="color:var(--danger)">Erro ao carregar simulações: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

// =========================================================================
// REGISTRO DA VIEW SIMULAÇÕES
// =========================================================================
registerView('simulacoes', {
  titulo: 'Simulações de Financiamento',
  mount: async (section, user) => {
    // Garante cabeçalho com CTA de nova simulação
    const header = section.querySelector('.panel-card-header');
    if (header && !header.querySelector('.btn-nova-sim')) {
      const btnNova = document.createElement('a');
      btnNova.href = 'financiamento.html';
      btnNova.className = 'panel-btn panel-btn-primary panel-btn-sm btn-nova-sim';
      btnNova.textContent = '+ Nova Simulação';
      header.appendChild(btnNova);
    }

    let container = document.getElementById('clientSimulacoesContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'clientSimulacoesContainer';
      const card = section.querySelector('.panel-card');
      if (card) {
        // Remove eventual empty-state estático
        const staticEmpty = card.querySelector('.panel-empty-state');
        if (staticEmpty) staticEmpty.remove();
        card.appendChild(container);
      }
    }

    if (user) {
      await carregarSimulacoes(user);
    }
  }
});
