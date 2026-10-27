/**
 * Living Canvas - Painel do Corretor: Módulo Perfil Público & Configurações (P10)
 * 
 * Permite ao corretor gerenciar seus dados públicos (nome, CRECI, bio, WhatsApp, redes,
 * slug), upload de avatar com compressão no browser para o Firebase Storage,
 * tags de especialidades e bairros, disponibilidade de horários e preferências de notificação.
 * Inclui preview em tempo real e atalho para corretor.html?id={uid}.
 */

import { registerView, escapeHtml, showToast } from './panel-shell.js';
import { db, auth, CorretoresPublicos } from './lc-data.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

let currentCorretor = null;
let perfilData = null;

// Tags default para sugestões rápidas
const SUGESTOES_ESPECIALIDADES = [
  'Alto Padrão', 'Lançamentos', 'Investimentos', 'Penthouses', 
  'Casas em Condomínio', 'Comercial', 'Locação Exclusiva', 'Reformados'
];

const SUGESTOES_BAIRROS = [
  'Jardins', 'Itaim Bibi', 'Vila Nova Conceição', 'Pinheiros', 
  'Moema', 'Higienópolis', 'Perdizes', 'Vila Madalena'
];

/**
 * Constrói o layout principal da tela de Perfil / Configurações
 */
function setupPerfilLayout(container) {
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
      <div>
        <h2 style="font-family: 'Playfair Display', serif; font-size: 1.6rem; color: var(--cream); margin: 0 0 0.25rem 0;">Perfil Profissional & Disponibilidade</h2>
        <p style="color: var(--cream); opacity: 0.75; font-size: 0.88rem; margin: 0;">Configure suas informações públicas, horários de visita, canais de contato e especialidades.</p>
      </div>
      
      <div style="display: flex; gap: 0.75rem; align-items: center;">
        <a id="btnVerPerfilPublico" href="corretor.html" target="_blank" rel="noopener noreferrer" class="panel-btn" style="background: rgba(212, 175, 122, 0.15); border: 1px solid var(--gold); color: var(--gold); padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 0.4rem; font-size: 0.88rem;">
          <span>👤</span> Ver meu Perfil Público ↗
        </a>
        <button id="btnSalvarPerfil" class="panel-btn" style="background: var(--gold); color: #0a2e2a; border: none; padding: 0.5rem 1.25rem; border-radius: 8px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; font-size: 0.88rem;">
          <span>💾</span> Salvar Alterações
        </button>
      </div>
    </div>

    <!-- CORPO COM FORMULÁRIO E PREVIEW EM TEMPO REAL -->
    <div style="display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr); gap: 1.5rem; align-items: start;">
      
      <!-- FORMULÁRIO DE EDIÇÃO -->
      <form id="formPerfilCorretor" onsubmit="return false;" style="display: flex; flex-direction: column; gap: 1.5rem;">
        
        <!-- CARD 1: DADOS BÁSICOS & FOTO -->
        <div class="panel-card" style="padding: 1.5rem;">
          <h3 class="panel-card-title" style="font-size: 1.1rem; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>📸</span> Foto & Informações Pessoais
          </h3>

          <!-- Upload de Foto -->
          <div style="display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
            <div id="avatarContainer" style="position: relative; width: 90px; height: 90px; border-radius: 50%; overflow: hidden; border: 2px solid var(--gold); background: #0a2e2a; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
              <img id="imgAvatarPreview" src="" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; display: none;">
              <span id="txtAvatarInitials" style="font-size: 1.8rem; font-weight: 700; color: var(--gold); font-family: 'Playfair Display', serif;">CR</span>
            </div>
            <div style="flex: 1; min-width: 200px;">
              <label style="display: inline-block; background: rgba(255, 255, 255, 0.08); border: 1px dashed var(--gold); padding: 0.55rem 1rem; border-radius: 8px; color: var(--cream); font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                <span>📁 Escolher nova foto (JPG/PNG)</span>
                <input type="file" id="fileAvatarInput" accept="image/*" style="display: none;">
              </label>
              <div style="font-size: 0.75rem; color: var(--cream); opacity: 0.65; margin-top: 0.4rem;">
                Comprimida automaticamente no navegador (máx. 2MB). Ideal proporção 1:1.
              </div>
              <div id="uploadStatusMsg" style="font-size: 0.78rem; color: var(--gold); margin-top: 0.25rem; display: none;">Enviando foto...</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            <div class="panel-form-group">
              <label class="panel-form-label">Nome de Exibição Pública *</label>
              <input type="text" id="inpNome" class="panel-form-input" required placeholder="Ex: Ana Carolina Silva">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label">Registro Profissional (CRECI) *</label>
              <input type="text" id="inpCreci" class="panel-form-input" required placeholder="Ex: CRECI-SP 123456-F">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label">WhatsApp / Telefone Direto *</label>
              <input type="tel" id="inpWhatsapp" class="panel-form-input" required placeholder="Ex: (11) 98765-4321">
            </div>

            <div class="panel-form-group">
              <label class="panel-form-label">E-mail Comercial de Contato</label>
              <input type="email" id="inpEmail" class="panel-form-input" placeholder="contato@imobiliaria.com">
            </div>

            <div class="panel-form-group" style="grid-column: 1 / -1;">
              <label class="panel-form-label">Slug da URL de Perfil e Agendamento</label>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 0.85rem; color: var(--cream); opacity: 0.65;">site.com/corretor.html?slug=</span>
                <input type="text" id="inpSlug" class="panel-form-input" style="flex: 1;" placeholder="ana-silva">
              </div>
            </div>

            <div class="panel-form-group" style="grid-column: 1 / -1;">
              <label class="panel-form-label">Biografia & Apresentação aos Clientes</label>
              <textarea id="inpBio" class="panel-form-input" rows="4" style="resize: vertical;" placeholder="Conte sobre sua experiência no mercado imobiliário, postura de atendimento e histórico de transações..."></textarea>
            </div>
          </div>
        </div>

        <!-- CARD 2: REDES SOCIAIS & CANAIS -->
        <div class="panel-card" style="padding: 1.5rem;">
          <h3 class="panel-card-title" style="font-size: 1.1rem; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>🌐</span> Presença Digital & Redes
          </h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            <div class="panel-form-group">
              <label class="panel-form-label">Instagram (@ ou URL)</label>
              <input type="text" id="inpInstagram" class="panel-form-input" placeholder="Ex: @anasilva_imoveis">
            </div>
            <div class="panel-form-group">
              <label class="panel-form-label">LinkedIn (URL ou usuário)</label>
              <input type="text" id="inpLinkedin" class="panel-form-input" placeholder="Ex: linkedin.com/in/anasilva">
            </div>
          </div>
        </div>

        <!-- CARD 3: ESPECIALIDADES & BAIRROS (TAGS) -->
        <div class="panel-card" style="padding: 1.5rem;">
          <h3 class="panel-card-title" style="font-size: 1.1rem; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>🏷️</span> Especialidades & Regiões de Atuação
          </h3>

          <!-- Especialidades -->
          <div style="margin-bottom: 1.5rem;">
            <label class="panel-form-label" style="margin-bottom: 0.4rem;">Segmentos de Especialidade</label>
            <div id="tagsEspecialidadesContainer" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.6rem;"></div>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="inpNovaEspecialidade" class="panel-form-input" placeholder="Adicionar nova especialidade..." style="flex: 1; padding: 0.45rem 0.8rem; font-size: 0.85rem;">
              <button type="button" id="btnAdicionarEspecialidade" class="panel-btn" style="background: rgba(212,175,122,0.2); border: 1px solid var(--gold); color: var(--gold); padding: 0.45rem 0.85rem; border-radius: 6px; font-weight: 600; cursor: pointer;">+ Add</button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem;">
              <span style="font-size: 0.75rem; color: var(--cream); opacity: 0.6; align-self: center;">Sugestões:</span>
              ${SUGESTOES_ESPECIALIDADES.map(s => `
                <button type="button" class="btn-sugestao-tag" data-tag="${s}" data-tipo="especialidade" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: var(--cream); font-size: 0.72rem; padding: 0.15rem 0.4rem; cursor: pointer;">+ ${s}</button>
              `).join('')}
            </div>
          </div>

          <!-- Bairros -->
          <div>
            <label class="panel-form-label" style="margin-bottom: 0.4rem;">Bairros de Cobertura</label>
            <div id="tagsBairrosContainer" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.6rem;"></div>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="inpNovoBairro" class="panel-form-input" placeholder="Adicionar bairro..." style="flex: 1; padding: 0.45rem 0.8rem; font-size: 0.85rem;">
              <button type="button" id="btnAdicionarBairro" class="panel-btn" style="background: rgba(212,175,122,0.2); border: 1px solid var(--gold); color: var(--gold); padding: 0.45rem 0.85rem; border-radius: 6px; font-weight: 600; cursor: pointer;">+ Add</button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem;">
              <span style="font-size: 0.75rem; color: var(--cream); opacity: 0.6; align-self: center;">Sugestões:</span>
              ${SUGESTOES_BAIRROS.map(b => `
                <button type="button" class="btn-sugestao-tag" data-tag="${b}" data-tipo="bairro" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: var(--cream); font-size: 0.72rem; padding: 0.15rem 0.4rem; cursor: pointer;">+ ${b}</button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- CARD 4: HORÁRIOS DE ATENDIMENTO & VISITAS -->
        <div class="panel-card" style="padding: 1.5rem;">
          <h3 class="panel-card-title" style="font-size: 1.1rem; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>⏰</span> Agenda & Disponibilidade de Visitas
          </h3>
          <p style="font-size: 0.82rem; color: var(--cream); opacity: 0.7; margin: -0.75rem 0 1.25rem 0;">Essas faixas de horário alimentam a seleção inteligente na página de agendamento (/agendar.html).</p>

          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <!-- Dias de Atendimento -->
            <div>
              <label class="panel-form-label">Dias da Semana Disponíveis</label>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.35rem;">
                ${[
                  { id: 'seg', label: 'Segunda' },
                  { id: 'ter', label: 'Terça' },
                  { id: 'qua', label: 'Quarta' },
                  { id: 'qui', label: 'Quinta' },
                  { id: 'sex', label: 'Sexta' },
                  { id: 'sab', label: 'Sábado' },
                  { id: 'dom', label: 'Domingo' }
                ].map(d => `
                  <label style="display: flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.04); border: 1px solid var(--glass-border); padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.82rem; cursor: pointer;">
                    <input type="checkbox" name="diasSemana" value="${d.id}" class="chk-dia">
                    <span>${d.label}</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <!-- Faixas de Horário Seg a Sex -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; background: rgba(0,0,0,0.15); padding: 1rem; border-radius: 8px;">
              <div class="panel-form-group" style="margin: 0;">
                <label class="panel-form-label">Horário Início (Seg-Sex)</label>
                <input type="time" id="inpHoraInicioSemana" class="panel-form-input" value="09:00">
              </div>
              <div class="panel-form-group" style="margin: 0;">
                <label class="panel-form-label">Horário Término (Seg-Sex)</label>
                <input type="time" id="inpHoraFimSemana" class="panel-form-input" value="18:00">
              </div>
            </div>

            <!-- Horário de Sábado -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; background: rgba(0,0,0,0.15); padding: 1rem; border-radius: 8px;">
              <div class="panel-form-group" style="margin: 0;">
                <label class="panel-form-label">Horário Início (Sábado)</label>
                <input type="time" id="inpHoraInicioSabado" class="panel-form-input" value="09:00">
              </div>
              <div class="panel-form-group" style="margin: 0;">
                <label class="panel-form-label">Horário Término (Sábado)</label>
                <input type="time" id="inpHoraFimSabado" class="panel-form-input" value="13:00">
              </div>
            </div>

            <!-- Intervalo entre visitas -->
            <div class="panel-form-group">
              <label class="panel-form-label">Duração / Intervalo Padrão de cada Visita</label>
              <select id="selIntervalo" class="panel-form-input" style="max-width: 250px;">
                <option value="45">45 minutos</option>
                <option value="60" selected>60 minutos (1 hora)</option>
                <option value="90">90 minutos (1h30)</option>
                <option value="120">120 minutos (2 horas)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- CARD 5: NOTIFICAÇÕES & PREFERÊNCIAS -->
        <div class="panel-card" style="padding: 1.5rem;">
          <h3 class="panel-card-title" style="font-size: 1.1rem; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>🔔</span> Canais de Notificação
          </h3>
          <p style="font-size: 0.82rem; color: var(--cream); opacity: 0.7; margin: -0.75rem 0 1rem 0;">Escolha onde deseja receber avisos de novas propostas, visitas agendadas e mensagens de clientes.</p>

          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; padding: 0.6rem 0.85rem; background: rgba(255,255,255,0.03); border-radius: 8px;">
              <input type="checkbox" id="chkNotifEmail" checked style="width: 18px; height: 18px; accent-color: var(--gold);">
              <div>
                <div style="font-weight: 600; color: var(--cream); font-size: 0.9rem;">Notificações por E-mail</div>
                <div style="font-size: 0.78rem; opacity: 0.65;">Resumo de novos leads, propostas e alterações de agendamento</div>
              </div>
            </label>

            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; padding: 0.6rem 0.85rem; background: rgba(255,255,255,0.03); border-radius: 8px;">
              <input type="checkbox" id="chkNotifPush" checked style="width: 18px; height: 18px; accent-color: var(--gold);">
              <div>
                <div style="font-weight: 600; color: var(--cream); font-size: 0.9rem;">Alertas Instantâneos no Painel (Web Push)</div>
                <div style="font-size: 0.78rem; opacity: 0.65;">Badges e sons sutis ao receber mensagens diretas</div>
              </div>
            </label>

            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; padding: 0.6rem 0.85rem; background: rgba(255,255,255,0.03); border-radius: 8px;">
              <input type="checkbox" id="chkNotifWhatsapp" checked style="width: 18px; height: 18px; accent-color: var(--gold);">
              <div>
                <div style="font-weight: 600; color: var(--cream); font-size: 0.9rem;">Alertas via WhatsApp</div>
                <div style="font-size: 0.78rem; opacity: 0.65;">Avisos prioritários sobre propostas recebidas e visitas confirmadas</div>
              </div>
            </label>
          </div>
        </div>

      </form>

      <!-- PREVIEW EM TEMPO REAL DO PERFIL PÚBLICO -->
      <div style="position: sticky; top: 1.5rem;">
        <div style="margin-bottom: 0.5rem; font-size: 0.82rem; font-weight: 700; color: var(--gold); letter-spacing: 0.05em; text-transform: uppercase;">
          👁️ Pré-visualização ao Vivo
        </div>

        <div class="panel-card" style="padding: 1.5rem; border: 1px solid var(--gold); box-shadow: 0 12px 30px rgba(0,0,0,0.4); background: linear-gradient(180deg, rgba(10,46,42,0.95), rgba(7,30,27,0.98));">
          <!-- Card Cabeçalho Preview -->
          <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1.25rem;">
            <div id="prevAvatarBox" style="width: 64px; height: 64px; border-radius: 50%; overflow: hidden; border: 2px solid var(--gold); background: #0a2e2a; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <img id="prevAvatarImg" src="" alt="" style="width: 100%; height: 100%; object-fit: cover; display: none;">
              <span id="prevAvatarInitials" style="font-size: 1.3rem; font-weight: 700; color: var(--gold); font-family: 'Playfair Display', serif;">CR</span>
            </div>
            <div style="min-width: 0; flex: 1;">
              <h4 id="prevNome" style="font-family: 'Playfair Display', serif; font-size: 1.15rem; color: var(--cream); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Nome do Corretor</h4>
              <div id="prevCreci" style="font-size: 0.78rem; color: var(--gold); font-weight: 600; margin-top: 0.2rem;">CRECI-SP 000000-F</div>
              <div style="font-size: 0.72rem; color: #34d399; margin-top: 0.15rem;">● Disponível para visitas</div>
            </div>
          </div>

          <!-- Bio Preview -->
          <div id="prevBio" style="font-size: 0.82rem; color: var(--cream); opacity: 0.8; line-height: 1.5; margin-bottom: 1rem; max-height: 90px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;">
            Biografia resumida do corretor...
          </div>

          <!-- Especialidades Preview -->
          <div style="margin-bottom: 1rem;">
            <div style="font-size: 0.72rem; color: var(--gold); font-weight: 600; text-transform: uppercase; margin-bottom: 0.35rem;">Especialidades</div>
            <div id="prevEspecialidades" style="display: flex; flex-wrap: wrap; gap: 0.35rem;">
              <span style="font-size: 0.72rem; background: rgba(255,255,255,0.06); padding: 0.15rem 0.5rem; border-radius: 4px; color: var(--cream);">Alto Padrão</span>
            </div>
          </div>

          <!-- Bairros Preview -->
          <div style="margin-bottom: 1.25rem;">
            <div style="font-size: 0.72rem; color: var(--gold); font-weight: 600; text-transform: uppercase; margin-bottom: 0.35rem;">Bairros de Atuação</div>
            <div id="prevBairros" style="display: flex; flex-wrap: wrap; gap: 0.35rem;">
              <span style="font-size: 0.72rem; background: rgba(255,255,255,0.06); padding: 0.15rem 0.5rem; border-radius: 4px; color: var(--cream);">Jardins</span>
            </div>
          </div>

          <!-- Botões de Ação do Perfil Público -->
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <a id="prevBtnWhatsapp" href="#" target="_blank" rel="noopener noreferrer" style="display: flex; justify-content: center; align-items: center; gap: 0.4rem; background: #25d366; color: #fff; font-weight: 600; padding: 0.55rem; border-radius: 6px; text-decoration: none; font-size: 0.82rem;">
              <span>💬</span> Falar via WhatsApp
            </a>
            <a id="prevBtnAgendar" href="#" style="display: flex; justify-content: center; align-items: center; gap: 0.4rem; background: var(--gold); color: #0a2e2a; font-weight: 700; padding: 0.55rem; border-radius: 6px; text-decoration: none; font-size: 0.82rem;">
              <span>📅</span> Agendar Visita
            </a>
          </div>

          <div style="text-align: center; margin-top: 1rem; font-size: 0.72rem; color: var(--cream); opacity: 0.5;">
            Visualização prévia simplificada.
          </div>
        </div>
      </div>

    </div>
  `;
}

/**
 * Atualiza o preview dinâmico com os valores dos campos
 */
function updatePreview() {
  const nome = document.getElementById('inpNome')?.value.trim() || 'Nome do Corretor';
  const creci = document.getElementById('inpCreci')?.value.trim() || 'CRECI não informado';
  const bio = document.getElementById('inpBio')?.value.trim() || 'Especialista em consultoria e negociação imobiliária de alto padrão.';
  const whatsapp = document.getElementById('inpWhatsapp')?.value.trim() || '';

  const prevNome = document.getElementById('prevNome');
  if (prevNome) prevNome.textContent = nome;

  const prevCreci = document.getElementById('prevCreci');
  if (prevCreci) prevCreci.textContent = creci;

  const prevBio = document.getElementById('prevBio');
  if (prevBio) prevBio.textContent = bio;

  // Iniciais do avatar
  const initials = nome.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('') || 'CR';
  const prevInitials = document.getElementById('prevAvatarInitials');
  if (prevInitials) prevInitials.textContent = initials;
  const txtAvatarInitials = document.getElementById('txtAvatarInitials');
  if (txtAvatarInitials) txtAvatarInitials.textContent = initials;

  // WhatsApp Link
  const prevBtnWhatsapp = document.getElementById('prevBtnWhatsapp');
  if (prevBtnWhatsapp) {
    const digits = whatsapp.replace(/\D/g, '');
    const num = digits.startsWith('55') ? digits : `55${digits}`;
    prevBtnWhatsapp.href = digits ? `https://wa.me/${num}?text=Olá! Encontrei seu perfil no site Living Canvas.` : '#';
  }

  // Agendar Link
  const prevBtnAgendar = document.getElementById('prevBtnAgendar');
  if (prevBtnAgendar && currentCorretor) {
    prevBtnAgendar.href = `agendar.html?corretor=${currentCorretor.uid}`;
  }

  // Atualiza tags no preview
  const prevEsp = document.getElementById('prevEspecialidades');
  if (prevEsp && perfilData) {
    prevEsp.innerHTML = (perfilData.especialidades || []).map(e => `
      <span style="font-size: 0.72rem; background: rgba(255,255,255,0.06); padding: 0.15rem 0.5rem; border-radius: 4px; color: var(--cream);">${escapeHtml(e)}</span>
    `).join('') || '<span style="font-size:0.72rem; opacity:0.5;">Nenhuma tag</span>';
  }

  const prevBairros = document.getElementById('prevBairros');
  if (prevBairros && perfilData) {
    prevBairros.innerHTML = (perfilData.bairros || []).map(b => `
      <span style="font-size: 0.72rem; background: rgba(255,255,255,0.06); padding: 0.15rem 0.5rem; border-radius: 4px; color: var(--cream);">${escapeHtml(b)}</span>
    `).join('') || '<span style="font-size:0.72rem; opacity:0.5;">Nenhum bairro</span>';
  }
}

/**
 * Renderiza as tags nos containers do formulário
 */
function renderTags(tipo) {
  if (tipo === 'especialidades') {
    const container = document.getElementById('tagsEspecialidadesContainer');
    if (!container || !perfilData) return;
    container.innerHTML = (perfilData.especialidades || []).map((esp, idx) => `
      <span style="display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(212,175,122,0.15); border: 1px solid var(--gold); color: var(--cream); font-size: 0.8rem; padding: 0.25rem 0.6rem; border-radius: 6px;">
        <span>${escapeHtml(esp)}</span>
        <button type="button" class="btn-remove-tag" data-tipo="especialidade" data-idx="${idx}" style="background: none; border: none; color: #f87171; cursor: pointer; font-size: 0.9rem; line-height: 1;">×</button>
      </span>
    `).join('');
  } else if (tipo === 'bairros') {
    const container = document.getElementById('tagsBairrosContainer');
    if (!container || !perfilData) return;
    container.innerHTML = (perfilData.bairros || []).map((b, idx) => `
      <span style="display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.06); border: 1px solid var(--glass-border); color: var(--cream); font-size: 0.8rem; padding: 0.25rem 0.6rem; border-radius: 6px;">
        <span>${escapeHtml(b)}</span>
        <button type="button" class="btn-remove-tag" data-tipo="bairro" data-idx="${idx}" style="background: none; border: none; color: #f87171; cursor: pointer; font-size: 0.9rem; line-height: 1;">×</button>
      </span>
    `).join('');
  }

  updatePreview();
}

/**
 * Preenche o formulário com dados carregados
 */
function populateForm(data) {
  perfilData = data || {};
  if (!perfilData.especialidades) perfilData.especialidades = ['Alto Padrão', 'Lançamentos'];
  if (!perfilData.bairros) perfilData.bairros = ['Jardins', 'Itaim Bibi'];

  document.getElementById('inpNome').value = perfilData.nome || '';
  document.getElementById('inpCreci').value = perfilData.creci || '';
  document.getElementById('inpWhatsapp').value = perfilData.whatsapp || perfilData.telefone || '';
  document.getElementById('inpEmail').value = perfilData.email || '';
  document.getElementById('inpSlug').value = perfilData.slug || '';
  document.getElementById('inpBio').value = perfilData.bio || '';

  if (perfilData.redes) {
    document.getElementById('inpInstagram').value = perfilData.redes.instagram || '';
    document.getElementById('inpLinkedin').value = perfilData.redes.linkedin || '';
  }

  // Foto
  if (perfilData.fotoURL) {
    const imgPreview = document.getElementById('imgAvatarPreview');
    const prevAvatarImg = document.getElementById('prevAvatarImg');
    const txtInitials = document.getElementById('txtAvatarInitials');
    const prevInitials = document.getElementById('prevAvatarInitials');

    if (imgPreview) {
      imgPreview.src = perfilData.fotoURL;
      imgPreview.style.display = 'block';
      if (txtInitials) txtInitials.style.display = 'none';
    }
    if (prevAvatarImg) {
      prevAvatarImg.src = perfilData.fotoURL;
      prevAvatarImg.style.display = 'block';
      if (prevInitials) prevInitials.style.display = 'none';
    }
  }

  // Horários
  const h = perfilData.horarios || {};
  const diasAtivos = h.diasSemana || ['seg', 'ter', 'qua', 'qui', 'sex'];
  document.querySelectorAll('.chk-dia').forEach(chk => {
    chk.checked = diasAtivos.includes(chk.value);
  });

  if (h.inicioSemana) document.getElementById('inpHoraInicioSemana').value = h.inicioSemana;
  if (h.fimSemana) document.getElementById('inpHoraFimSemana').value = h.fimSemana;
  if (h.inicioSabado) document.getElementById('inpHoraInicioSabado').value = h.inicioSabado;
  if (h.fimSabado) document.getElementById('inpHoraFimSabado').value = h.fimSabado;
  if (h.intervaloMinutos) document.getElementById('selIntervalo').value = String(h.intervaloMinutos);

  // Notificações
  const notif = perfilData.notificacoes || {};
  document.getElementById('chkNotifEmail').checked = notif.email !== false;
  document.getElementById('chkNotifPush').checked = notif.push !== false;
  document.getElementById('chkNotifWhatsapp').checked = notif.whatsapp !== false;

  // Botão Ver Perfil Público
  const btnVerPublico = document.getElementById('btnVerPerfilPublico');
  if (btnVerPublico && currentCorretor) {
    btnVerPublico.href = `corretor.html?id=${currentCorretor.uid}`;
  }

  // Renderiza tags
  renderTags('especialidades');
  renderTags('bairros');
  updatePreview();
}

/**
 * Salva os dados do perfil
 */
async function handleSalvarPerfil() {
  if (!currentCorretor?.uid) {
    showToast('Corretor não autenticado.', 'error');
    return;
  }

  const btnSalvar = document.getElementById('btnSalvarPerfil');
  if (btnSalvar) {
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<span>⏳</span> Salvando...';
  }

  try {
    const nome = document.getElementById('inpNome').value.trim();
    const creci = document.getElementById('inpCreci').value.trim();
    const whatsapp = document.getElementById('inpWhatsapp').value.trim();
    const email = document.getElementById('inpEmail').value.trim();
    const slug = document.getElementById('inpSlug').value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-');
    const bio = document.getElementById('inpBio').value.trim();

    if (!nome) throw new Error('O nome de exibição é obrigatório.');
    if (!creci) throw new Error('O CRECI é obrigatório.');

    const instagram = document.getElementById('inpInstagram').value.trim();
    const linkedin = document.getElementById('inpLinkedin').value.trim();

    // Dias da semana selecionados
    const diasSemana = Array.from(document.querySelectorAll('.chk-dia:checked')).map(c => c.value);

    const payload = {
      nome,
      creci,
      whatsapp,
      telefone: whatsapp,
      email,
      slug,
      bio,
      redes: { instagram, linkedin },
      especialidades: perfilData.especialidades || [],
      bairros: perfilData.bairros || [],
      horarios: {
        diasSemana,
        inicioSemana: document.getElementById('inpHoraInicioSemana').value,
        fimSemana: document.getElementById('inpHoraFimSemana').value,
        atendeSabado: diasSemana.includes('sab'),
        inicioSabado: document.getElementById('inpHoraInicioSabado').value,
        fimSabado: document.getElementById('inpHoraFimSabado').value,
        intervaloMinutos: parseInt(document.getElementById('selIntervalo').value, 10) || 60
      },
      notificacoes: {
        email: document.getElementById('chkNotifEmail').checked,
        push: document.getElementById('chkNotifPush').checked,
        whatsapp: document.getElementById('chkNotifWhatsapp').checked
      },
      ativo: true
    };

    if (perfilData.fotoURL) {
      payload.fotoURL = perfilData.fotoURL;
    }

    await CorretoresPublicos.salvarPerfil(currentCorretor.uid, payload);
    perfilData = { ...perfilData, ...payload };

    showToast('Perfil profissional atualizado com sucesso!', 'success');

    // Atualiza links e topo
    const topName = document.getElementById('corretorTopName');
    if (topName) topName.textContent = nome.split(' ')[0];
    const userName = document.getElementById('corretorUserName');
    if (userName) userName.textContent = nome;

  } catch (err) {
    console.error('Erro ao salvar perfil do corretor:', err);
    showToast(err.message || 'Falha ao salvar perfil.', 'error');
  } finally {
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.innerHTML = '<span>💾</span> Salvar Alterações';
    }
  }
}

/**
 * Gerencia o upload de avatar com compressão
 */
async function handleAvatarUpload(file) {
  if (!file || !currentCorretor?.uid) return;

  const msgEl = document.getElementById('uploadStatusMsg');
  if (msgEl) {
    msgEl.style.display = 'block';
    msgEl.textContent = 'Comprimindo e enviando foto...';
  }

  try {
    const downloadURL = await CorretoresPublicos.uploadAvatar(currentCorretor.uid, file);
    perfilData.fotoURL = downloadURL;

    // Atualiza imagens na tela
    const imgPreview = document.getElementById('imgAvatarPreview');
    const prevAvatarImg = document.getElementById('prevAvatarImg');
    const txtInitials = document.getElementById('txtAvatarInitials');
    const prevInitials = document.getElementById('prevAvatarInitials');

    if (imgPreview) {
      imgPreview.src = downloadURL;
      imgPreview.style.display = 'block';
      if (txtInitials) txtInitials.style.display = 'none';
    }
    if (prevAvatarImg) {
      prevAvatarImg.src = downloadURL;
      prevAvatarImg.style.display = 'block';
      if (prevInitials) prevInitials.style.display = 'none';
    }

    // Atualiza avatar do topo do shell
    const headerAvatar = document.getElementById('corretorAvatar');
    if (headerAvatar) {
      headerAvatar.innerHTML = `<img src="${downloadURL}" alt="" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    }

    if (msgEl) {
      msgEl.textContent = 'Foto atualizada com sucesso!';
      setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
    }
    showToast('Foto de perfil enviada e salva!', 'success');
  } catch (err) {
    console.error('Erro ao enviar avatar:', err);
    if (msgEl) {
      msgEl.textContent = `Erro: ${err.message}`;
    }
    showToast(err.message || 'Erro ao enviar foto.', 'error');
  }
}

/**
 * Conecta todos os event listeners da view
 */
function attachEventListeners(container) {
  // Salvar
  const btnSalvar = container.querySelector('#btnSalvarPerfil');
  if (btnSalvar) btnSalvar.addEventListener('click', handleSalvarPerfil);

  // Upload Avatar
  const fileInput = container.querySelector('#fileAvatarInput');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleAvatarUpload(file);
    });
  }

  // Inputs para Live Preview
  ['inpNome', 'inpCreci', 'inpWhatsapp', 'inpBio'].forEach(id => {
    const el = container.querySelector(`#${id}`);
    if (el) el.addEventListener('input', updatePreview);
  });

  // Especialidades: Add
  const btnAddEsp = container.querySelector('#btnAdicionarEspecialidade');
  const inpEsp = container.querySelector('#inpNovaEspecialidade');
  if (btnAddEsp && inpEsp) {
    const addEsp = () => {
      const val = inpEsp.value.trim();
      if (val && !perfilData.especialidades.includes(val)) {
        perfilData.especialidades.push(val);
        inpEsp.value = '';
        renderTags('especialidades');
      }
    };
    btnAddEsp.addEventListener('click', addEsp);
    inpEsp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addEsp(); } });
  }

  // Bairros: Add
  const btnAddBairro = container.querySelector('#btnAdicionarBairro');
  const inpBairro = container.querySelector('#inpNovoBairro');
  if (btnAddBairro && inpBairro) {
    const addB = () => {
      const val = inpBairro.value.trim();
      if (val && !perfilData.bairros.includes(val)) {
        perfilData.bairros.push(val);
        inpBairro.value = '';
        renderTags('bairros');
      }
    };
    btnAddBairro.addEventListener('click', addB);
    inpBairro.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addB(); } });
  }

  // Delegação para Remover Tags e Sugestões
  container.addEventListener('click', (e) => {
    // Remover tag
    const btnRemove = e.target.closest('.btn-remove-tag');
    if (btnRemove) {
      const tipo = btnRemove.dataset.tipo;
      const idx = parseInt(btnRemove.dataset.idx, 10);
      if (tipo === 'especialidade' && perfilData.especialidades) {
        perfilData.especialidades.splice(idx, 1);
        renderTags('especialidades');
      } else if (tipo === 'bairro' && perfilData.bairros) {
        perfilData.bairros.splice(idx, 1);
        renderTags('bairros');
      }
      return;
    }

    // Adicionar por sugestão
    const btnSugestao = e.target.closest('.btn-sugestao-tag');
    if (btnSugestao) {
      const tag = btnSugestao.dataset.tag;
      const tipo = btnSugestao.dataset.tipo;
      if (tipo === 'especialidade') {
        if (!perfilData.especialidades.includes(tag)) {
          perfilData.especialidades.push(tag);
          renderTags('especialidades');
        }
      } else if (tipo === 'bairro') {
        if (!perfilData.bairros.includes(tag)) {
          perfilData.bairros.push(tag);
          renderTags('bairros');
        }
      }
    }
  });
}

/**
 * Registra a View de Perfil e o alias 'configuracoes'
 */
const viewConfig = {
  titulo: 'Perfil Público & Configurações',
  async mount(container, user) {
    currentCorretor = user || auth.currentUser;
    setupPerfilLayout(container);
    attachEventListeners(container);

    if (!currentCorretor?.uid) return;

    try {
      // Carrega ou inicializa perfil no Firestore
      const perfil = await CorretoresPublicos.obterOuCriarPerfil(currentCorretor.uid, {
        nome: currentCorretor.displayName || '',
        email: currentCorretor.email || ''
      });
      populateForm(perfil);
    } catch (err) {
      console.error('Erro ao obter perfil do corretor:', err);
      showToast('Aviso: Perfil inicial em carregamento.', 'info');
    }
  }
};

registerView('perfil', viewConfig);
registerView('configuracoes', viewConfig);

export function initPerfilView() {
  // auto-registered
}
