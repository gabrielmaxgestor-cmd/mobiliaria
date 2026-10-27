/**
 * Living Canvas - Dashboard do Cliente: Configurações & Central LGPD (P13)
 * 
 * Gerencia os dados do perfil, preferências de notificação e direitos do titular:
 * - Edição de perfil (nome, telefone) preservando estritamente uid e role no Firestore
 * - Preferências de comunicação (WhatsApp, e-mail, push) e consentimento de curadoria
 * - Central LGPD:
 *   * Exportação completa de dados em JSON estruturado
 *   * Solicitação de exclusão definitiva de conta registrada em solicitacoesLgpd
 */

import { registerView } from './panel-shell.js';
import LivingCanvasAuth from './auth.js';
import LivingCanvasData from './lc-data.js';
import LivingCanvasFavorites from './favorites.js';
import LivingCanvasSavedSearches from './savedSearches.js';
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

const db = LivingCanvasAuth.db;

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

async function renderConfiguracoesView(section, user) {
  const card = section.querySelector('.panel-card');
  if (!card) return;

  card.innerHTML = '<div class="panel-skeleton" style="height: 300px;"></div>';

  try {
    // Busca dados atualizados do documento em usuarios/{uid}
    const userDocRef = doc(db, 'usuarios', user.uid);
    const snap = await getDoc(userDocRef);
    const userData = snap.exists() ? snap.data() : {};

    const nome = userData.nome || user.displayName || '';
    const telefone = userData.telefone || '';
    const email = user.email || '';
    const prefsNotif = userData.preferenciasNotif || { whatsapp: true, email: true, app: true };
    const compartilhar = userData.compartilharPreferencias !== false;

    card.innerHTML = `
      <div class="panel-card-header">
        <div>
          <h3 class="panel-card-title">⚙️ Configurações & Privacidade</h3>
          <p class="panel-card-subtitle">Gerencie seus dados de contato, canais preferidos e direitos de titular LGPD</p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;">
        
        <!-- COLUNA 1: DADOS CADASTRAIS -->
        <div>
          <h4 style="font-family:'Playfair Display',serif; color:var(--gold); font-size:1.15rem; margin-bottom:1rem; border-bottom:1px solid var(--glass-border); padding-bottom:0.5rem;">
            👤 Dados do Titular
          </h4>

          <form id="formPerfilCliente">
            <div class="panel-form-group">
              <label class="panel-form-label" for="cfgInputNome">Nome Completo <span style="color:var(--gold);">*</span></label>
              <input type="text" class="panel-form-input" id="cfgInputNome" value="${escapeHtml(nome)}" required maxlength="80">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label" for="cfgInputTelefone">Telefone / WhatsApp</label>
              <input type="tel" class="panel-form-input" id="cfgInputTelefone" value="${escapeHtml(telefone)}" placeholder="(11) 99999-9999" maxlength="20">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label">E-mail Cadastrado</label>
              <input type="email" class="panel-form-input" value="${escapeHtml(email)}" readonly style="opacity:0.75; cursor:not-allowed;">
              <small style="color:var(--text-muted); font-size:0.75rem;">Para alterar seu e-mail de acesso, contate o suporte.</small>
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label">Papel na Plataforma</label>
              <input type="text" class="panel-form-input" value="Cliente Privado" readonly style="opacity:0.75; cursor:not-allowed;">
            </div>

            <button type="submit" class="panel-btn panel-btn-primary panel-btn-sm" id="btnSalvarPerfil" style="margin-top:0.5rem;">
              Salvar Alterações
            </button>
          </form>
        </div>

        <!-- COLUNA 2: PREFERÊNCIAS DE COMUNICAÇÃO -->
        <div>
          <h4 style="font-family:'Playfair Display',serif; color:var(--gold); font-size:1.15rem; margin-bottom:1rem; border-bottom:1px solid var(--glass-border); padding-bottom:0.5rem;">
            🔔 Canais de Comunicação
          </h4>

          <form id="formPreferenciasNotif">
            <div style="display: flex; flex-direction: column; gap: 0.85rem; margin-bottom: 1.5rem;">
              
              <label style="display:flex; align-items:center; gap:0.75rem; color:var(--cream); font-size:0.88rem; cursor:pointer;">
                <input type="checkbox" id="prefWhatsapp" ${prefsNotif.whatsapp !== false ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--gold);">
                <span>Receber avisos e novidades via <strong>WhatsApp</strong></span>
              </label>

              <label style="display:flex; align-items:center; gap:0.75rem; color:var(--cream); font-size:0.88rem; cursor:pointer;">
                <input type="checkbox" id="prefEmail" ${prefsNotif.email !== false ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--gold);">
                <span>Receber relatórios e novidades por <strong>E-mail</strong></span>
              </label>

              <label style="display:flex; align-items:center; gap:0.75rem; color:var(--cream); font-size:0.88rem; cursor:pointer;">
                <input type="checkbox" id="prefApp" ${prefsNotif.app !== false ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--gold);">
                <span>Alertas em tempo real no <strong>Painel do Cliente</strong></span>
              </label>

              <div style="border-top:1px solid var(--glass-border); padding-top:1rem; margin-top:0.5rem;">
                <label style="display:flex; align-items:flex-start; gap:0.75rem; color:var(--cream); font-size:0.85rem; cursor:pointer; line-height:1.4;">
                  <input type="checkbox" id="prefCompartilhar" ${compartilhar ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--gold); margin-top:2px;">
                  <span>
                    <strong>Curadoria Personalizada:</strong> Autorizo a equipe de corretores a visualizar meus imóveis favoritos e buscas salvas para me apresentar oportunidades off-market.
                  </span>
                </label>
              </div>

            </div>

            <button type="submit" class="panel-btn panel-btn-secondary panel-btn-sm" id="btnSalvarPrefs">
              Atualizar Preferências
            </button>
          </form>
        </div>

      </div>

      <!-- SEÇÃO LGPD E PRIVACIDADE -->
      <div style="margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--glass-border);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
          <div>
            <h4 style="font-family:'Playfair Display',serif; color:var(--gold); font-size:1.15rem; margin-bottom:0.25rem;">
              🛡️ Central de Privacidade e Direitos do Titular (LGPD)
            </h4>
            <p style="font-size:0.83rem; color:var(--text-light); margin:0;">
              Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode solicitar a portabilidade ou a eliminação dos seus dados.
            </p>
          </div>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:1rem; align-items:center;">
          <!-- Botão Exportar Dados -->
          <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" id="btnExportarLgpd" style="display:flex; align-items:center; gap:0.5rem;">
            <span>📥</span>
            <span>Exportar Meus Dados (JSON)</span>
          </button>

          <!-- Botão Solicitar Exclusão -->
          <button type="button" class="panel-btn panel-btn-danger panel-btn-sm" id="btnAbrirModalExclusao" style="display:flex; align-items:center; gap:0.5rem;">
            <span>⚠️</span>
            <span>Solicitar Exclusão da Conta</span>
          </button>
        </div>
      </div>
    `;

    // 1. Handler Form Perfil
    const formPerfil = document.getElementById('formPerfilCliente');
    if (formPerfil) {
      formPerfil.addEventListener('submit', async (e) => {
        e.preventDefault();
        const novoNome = document.getElementById('cfgInputNome').value.trim();
        const novoTel = document.getElementById('cfgInputTelefone').value.trim();

        if (!novoNome) {
          showToast('Por favor, informe seu nome.', 'error');
          return;
        }

        const btn = document.getElementById('btnSalvarPerfil');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
          await updateDoc(userDocRef, {
            nome: novoNome,
            telefone: novoTel,
            atualizadoEm: serverTimestamp()
          });

          // Atualiza saudação e topo se existirem
          const topName = document.getElementById('welcomeUserName');
          const chipName = document.getElementById('profileUserName');
          if (topName) topName.textContent = novoNome.split(' ')[0];
          if (chipName) chipName.textContent = novoNome;

          showToast('Perfil atualizado com sucesso!', 'success');
        } catch (err) {
          console.error('Erro ao atualizar perfil:', err);
          showToast('Erro ao salvar perfil: ' + (err.message || 'Tente novamente.'), 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Salvar Alterações';
        }
      });
    }

    // 2. Handler Form Preferências
    const formPrefs = document.getElementById('formPreferenciasNotif');
    if (formPrefs) {
      formPrefs.addEventListener('submit', async (e) => {
        e.preventDefault();
        const whats = document.getElementById('prefWhatsapp').checked;
        const mail = document.getElementById('prefEmail').checked;
        const app = document.getElementById('prefApp').checked;
        const share = document.getElementById('prefCompartilhar').checked;

        const btn = document.getElementById('btnSalvarPrefs');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
          await updateDoc(userDocRef, {
            preferenciasNotif: {
              whatsapp: whats,
              email: mail,
              app: app
            },
            compartilharPreferencias: share,
            atualizadoEm: serverTimestamp()
          });

          showToast('Preferências de comunicação salvas!', 'success');
        } catch (err) {
          console.error('Erro ao salvar preferências:', err);
          showToast('Erro ao atualizar preferências.', 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Atualizar Preferências';
        }
      });
    }

    // 3. Handler Exportar Dados LGPD
    const btnExport = document.getElementById('btnExportarLgpd');
    if (btnExport) {
      btnExport.addEventListener('click', async () => {
        btnExport.disabled = true;
        btnExport.textContent = 'Gerando arquivo...';

        try {
          const [favs, buscas, visitas, propostas, sims] = await Promise.allSettled([
            LivingCanvasFavorites.getFavoriteProperties(),
            LivingCanvasSavedSearches.getSavedSearches(),
            LivingCanvasData.Visitas.listarDoUsuario(user.uid),
            LivingCanvasData.Propostas.listarDoUsuario(user.uid),
            getDocs(query(collection(db, 'simulacoes'), where('usuarioId', '==', user.uid)))
          ]);

          const simList = [];
          if (sims.status === 'fulfilled') {
            sims.value.forEach(d => simList.push({ id: d.id, ...d.data() }));
          }

          const exportPayload = {
            metadata: {
              plataforma: 'Living Canvas',
              tipo: 'Exportação de Dados Pessoais do Titular (LGPD)',
              dataExportacao: new Date().toISOString(),
              versao: '1.0'
            },
            titular: {
              uid: user.uid,
              email: user.email,
              nome: userData.nome || user.displayName || '',
              telefone: userData.telefone || '',
              criadoEm: userData.criadoEm || null,
              preferenciasNotif: userData.preferenciasNotif || {},
              compartilharPreferencias: userData.compartilharPreferencias !== false
            },
            dados: {
              favoritos: favs.status === 'fulfilled' ? favs.value : [],
              buscasDesejadas: buscas.status === 'fulfilled' ? buscas.value : [],
              visitasAgendadas: visitas.status === 'fulfilled' ? visitas.value : [],
              propostasFormais: propostas.status === 'fulfilled' ? propostas.value : [],
              simulacoesFinanciamento: simList
            }
          };

          const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
          const downloadAnchor = document.createElement('a');
          downloadAnchor.setAttribute('href', dataStr);
          downloadAnchor.setAttribute('download', `meus-dados-living-canvas-${user.uid.slice(0, 8)}.json`);
          document.body.appendChild(downloadAnchor);
          downloadAnchor.click();
          downloadAnchor.remove();

          showToast('Arquivo de dados gerado com sucesso!', 'success');
        } catch (err) {
          console.error('Erro na exportação LGPD:', err);
          showToast('Falha ao exportar dados.', 'error');
        } finally {
          btnExport.disabled = false;
          btnExport.innerHTML = '<span>📥</span> <span>Exportar Meus Dados (JSON)</span>';
        }
      });
    }

    // 4. Modal Exclusão de Conta LGPD
    const btnExcluir = document.getElementById('btnAbrirModalExclusao');
    if (btnExcluir) {
      btnExcluir.addEventListener('click', () => {
        abrirModalExclusaoLgpd(user);
      });
    }

  } catch (err) {
    console.error('Erro ao renderizar configurações:', err);
    card.innerHTML = `<div class="panel-empty-state"><p style="color:var(--danger)">Erro ao carregar dados: ${escapeHtml(err.message)}</p></div>`;
  }
}

function abrirModalExclusaoLgpd(user) {
  let modalBackdrop = document.getElementById('modalExclusaoLgpd');
  if (!modalBackdrop) {
    modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'modalExclusaoLgpd';
    modalBackdrop.className = 'panel-modal-backdrop';
    modalBackdrop.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px);
      z-index: 10001; display: flex; align-items: center; justify-content: center; padding: 1.5rem;
    `;
    document.body.appendChild(modalBackdrop);
  }

  modalBackdrop.innerHTML = `
    <div class="panel-modal-dialog" style="max-width: 520px; background: #0a2e2a; border: 1px solid var(--danger, #ef4444); border-radius: 16px; padding: 1.75rem; color: var(--cream);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
        <div>
          <span style="font-size:0.75rem; color:#fca5a5; text-transform:uppercase; letter-spacing:1px; font-weight:700;">Direito de Eliminação LGPD</span>
          <h3 style="font-family:'Playfair Display',serif; color:#fee2e2; font-size:1.35rem; margin-top:0.2rem;">
            ⚠️ Solicitar Exclusão da Conta
          </h3>
        </div>
        <button type="button" id="fecharModalExclusao" style="background:none; border:none; color:var(--text-muted); font-size:1.5rem; cursor:pointer;">×</button>
      </div>

      <div style="font-size:0.86rem; color:#fecaca; line-height:1.5; background:rgba(239,68,68,0.12); padding:1rem; border-radius:10px; border-left:3px solid #ef4444; margin-bottom:1.25rem;">
        <strong>Atenção: esta ação é irreversível.</strong><br>
        Ao confirmar, uma solicitação oficial será aberta para que a equipe de privacidade elimine seus dados cadastrais, favoritos, preferências e históricos de atendimento, conforme art. 18 da LGPD.
      </div>

      <div class="panel-form-group">
        <label class="panel-form-label" for="confirmTextLgpd" style="color:var(--cream);">
          Para confirmar, digite <strong>EXCLUIR</strong> abaixo:
        </label>
        <input type="text" id="confirmTextLgpd" class="panel-form-input" placeholder="Digite EXCLUIR" autocomplete="off">
      </div>

      <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:1.5rem;">
        <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" id="cancelarExclusaoBtn">Cancelar</button>
        <button type="button" class="panel-btn panel-btn-danger panel-btn-sm" id="confirmarExclusaoBtn" disabled>
          Confirmar Solicitação de Exclusão
        </button>
      </div>
    </div>
  `;

  modalBackdrop.style.display = 'flex';

  const fechar = () => {
    modalBackdrop.style.display = 'none';
  };

  document.getElementById('fecharModalExclusao')?.addEventListener('click', fechar);
  document.getElementById('cancelarExclusaoBtn')?.addEventListener('click', fechar);

  const inputConfirm = document.getElementById('confirmTextLgpd');
  const btnConfirm = document.getElementById('confirmarExclusaoBtn');

  if (inputConfirm && btnConfirm) {
    inputConfirm.addEventListener('input', () => {
      btnConfirm.disabled = inputConfirm.value.trim() !== 'EXCLUIR';
    });

    btnConfirm.addEventListener('click', async () => {
      btnConfirm.disabled = true;
      btnConfirm.textContent = 'Enviando solicitação...';

      try {
        await addDoc(collection(db, 'solicitacoesLgpd'), {
          usuarioId: user.uid,
          email: user.email || '',
          tipo: 'exclusao_titular',
          status: 'pendente',
          motivo: 'Solicitação direta do titular via painel de configurações',
          criadoEm: serverTimestamp()
        });

        modalBackdrop.innerHTML = `
          <div class="panel-modal-dialog" style="max-width: 480px; background: #0a2e2a; border: 1px solid var(--gold); border-radius: 16px; padding: 2rem; text-align: center; color: var(--cream);">
            <div style="font-size:2.5rem; margin-bottom:0.75rem;">🛡️</div>
            <h3 style="font-family:'Playfair Display',serif; color:var(--gold); font-size:1.35rem; margin-bottom:0.5rem;">
              Solicitação Registrada
            </h3>
            <p style="font-size:0.88rem; color:var(--text-light); line-height:1.5; margin-bottom:1.5rem;">
              Sua solicitação de exclusão (protocolo LGPD) foi formalizada com sucesso. Você será desconectado da sessão em instantes.
            </p>
            <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" id="btnOkDesconectar">
              Desconectar Agora
            </button>
          </div>
        `;

        document.getElementById('btnOkDesconectar')?.addEventListener('click', async () => {
          await LivingCanvasAuth.logout();
          window.location.href = 'home.html';
        });

        setTimeout(async () => {
          await LivingCanvasAuth.logout();
          window.location.href = 'home.html';
        }, 3500);

      } catch (err) {
        console.error('Erro ao enviar solicitação LGPD:', err);
        showToast('Erro ao processar solicitação: ' + err.message, 'error');
        btnConfirm.disabled = false;
        btnConfirm.textContent = 'Confirmar Solicitação de Exclusão';
      }
    });
  }
}

// =========================================================================
// REGISTRO DA VIEW CONFIGURAÇÕES
// =========================================================================
registerView('configuracoes', {
  titulo: 'Configurações da Conta',
  mount: async (section, user) => {
    if (user) {
      await renderConfiguracoesView(section, user);
    }
  }
});
