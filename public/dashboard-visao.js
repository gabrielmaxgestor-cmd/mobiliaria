/**
 * Living Canvas - Dashboard do Cliente: Visão Geral (P11)
 * 
 * Centraliza os principais indicadores do cliente:
 * - Saudação personalizada com nome real
 * - Cartão de próxima visita agendada
 * - Cartão de proposta ativa em negociação
 * - Indicadores rápidos (mensagens, novos matches, favoritos)
 * - Bloco dinâmico e inteligente de "Próximos Passos"
 * - Galeria dos últimos imóveis favoritados com ações completas
 */

import { registerView, escapeHtml, formatMoeda, formatData, showToast } from "./panel-shell.js";
import LivingCanvasAuth from "./auth.js";
import { Visitas, Propostas, Conversas, Documentos } from "./lc-data.js";
import * as LivingCanvasFavorites from "./favorites.js";
import * as LivingCanvasNotifications from "./notifications.js";
import * as LivingCanvasSavedSearches from "./savedSearches.js";

let unmountVisaoGeral = null;

export function initDashboardVisao() {
  registerView("visao-geral", {
    titulo: "Visão Geral",
    mount: async (section, user) => {
      const container = document.getElementById("view-visao-geral");
      if (!container || !user) return;

      container.innerHTML = `
        <div class="panel-skeleton" style="height: 120px; margin-bottom: 1.5rem; border-radius: 12px;"></div>
        <div class="panel-grid-stats" style="margin-bottom: 1.5rem;">
          <div class="panel-skeleton" style="height: 100px; border-radius: 12px;"></div>
          <div class="panel-skeleton" style="height: 100px; border-radius: 12px;"></div>
          <div class="panel-skeleton" style="height: 100px; border-radius: 12px;"></div>
          <div class="panel-skeleton" style="height: 100px; border-radius: 12px;"></div>
        </div>
      `;

      try {
        // Carrega dados em paralelo
        const [
          visitasRes,
          propostasRes,
          conversasRes,
          docsRes,
          favPropsRes,
          notifsRes,
          buscasRes,
          userDocRes
        ] = await Promise.allSettled([
          Visitas.listarDoCliente(user.uid),
          Propostas.listarDoUsuario(user.uid),
          Conversas.listarDoUsuario(user.uid),
          Documentos.listarDoCliente(user.uid),
          LivingCanvasFavorites.getFavoriteProperties(),
          LivingCanvasNotifications.getUnreadNotifications(20),
          LivingCanvasSavedSearches.getSavedSearches(),
          LivingCanvasAuth.getUserProfile(user.uid)
        ]);

        const visitas = visitasRes.status === "fulfilled" ? (visitasRes.value || []) : [];
        const propostas = propostasRes.status === "fulfilled" ? (propostasRes.value || []) : [];
        const conversas = conversasRes.status === "fulfilled" ? (conversasRes.value || []) : [];
        const docs = docsRes.status === "fulfilled" ? (docsRes.value || []) : [];
        const favoritos = favPropsRes.status === "fulfilled" ? (favPropsRes.value || []) : [];
        const notificacoes = notifsRes.status === "fulfilled" ? (notifsRes.value || []) : [];
        const buscas = buscasRes.status === "fulfilled" ? (buscasRes.value || []) : [];
        const profile = userDocRes.status === "fulfilled" ? (userDocRes.value || {}) : {};

        // Atualiza cabeçalho com nome real
        const nomeReal = profile.nome || user.displayName || user.email?.split("@")[0] || "Cliente Exclusivo";
        const welcomeEl = document.getElementById("welcomeUserName");
        if (welcomeEl) welcomeEl.textContent = nomeReal;

        const profileNameEl = document.getElementById("profileUserName");
        if (profileNameEl) profileNameEl.textContent = nomeReal;

        // Identifica próxima visita agendada/confirmada/pendente
        const visitasAtivas = visitas.filter(v => v.status === "confirmada" || v.status === "pendente" || v.status === "solicitada" || v.status === "reagendada");
        // Ordena por data mais próxima
        visitasAtivas.sort((a, b) => (a.data || "").localeCompare(b.data || ""));
        const proximaVisita = visitasAtivas[0] || null;

        // Identifica proposta ativa em negociação (não cancelada/recusada)
        const propostaAtiva = propostas.find(p => p.status === "em_analise" || p.status === "pendente" || p.status === "novo" || p.status === "contraproposta" || p.status === "aceita") || propostas[0] || null;

        // Calcula próximos passos inteligentes
        const proximosPassos = calcularProximosPassos({
          user,
          profile,
          visitas,
          propostas,
          docs,
          favoritos,
          buscas
        });

        // Monta o layout rico da visão geral
        container.innerHTML = `
          <!-- HERO SAUDAÇÃO & DESTAQUES -->
          <div style="background: linear-gradient(135deg, rgba(10, 46, 42, 0.95), rgba(6, 26, 24, 0.98)); border: 1px solid var(--glass-border); border-radius: 16px; padding: 1.5rem 1.8rem; margin-bottom: 2rem; box-shadow: 0 10px 30px rgba(0,0,0,0.25); display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1.25rem;">
            <div>
              <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(212, 175, 122, 0.12); border: 1px solid rgba(212, 175, 122, 0.3); padding: 0.25rem 0.75rem; border-radius: 50px; font-size: 0.75rem; color: var(--gold); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
                <span>✨</span> Área Exclusiva do Cliente
              </div>
              <h2 style="font-family: 'Playfair Display', serif; font-size: 1.6rem; color: var(--cream); margin: 0 0 0.35rem 0;">
                Bem-vindo ao seu refúgio, ${escapeHtml(nomeReal)}
              </h2>
              <p style="color: var(--text-light); font-size: 0.88rem; margin: 0; max-width: 620px;">
                Acompanhe o andamento das suas visitas, propostas e negociações com total transparência e curadoria personalizada.
              </p>
            </div>
            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
              <a href="imoveis.html" class="panel-btn panel-btn-primary panel-btn-sm" style="display: inline-flex; align-items: center; gap: 0.4rem;">
                <span>🔍</span> Explorar Imóveis
              </a>
              <a href="#imovel-dos-sonhos" class="panel-btn panel-btn-secondary panel-btn-sm" style="display: inline-flex; align-items: center; gap: 0.4rem;">
                <span>✨</span> Criar Busca Desejada
              </a>
            </div>
          </div>

          <!-- CARDS DE MÉTRICAS RÁPIDAS -->
          <div class="panel-grid-stats" style="margin-bottom: 2rem;">
            <div class="panel-stat-card" style="position: relative; overflow: hidden;">
              <div class="panel-stat-header">
                <span class="panel-stat-icon">❤️</span>
                <span class="panel-stat-trend">Portfólio</span>
              </div>
              <div class="panel-stat-value" id="vgFavCount">${favoritos.length}</div>
              <div class="panel-stat-label">Imóveis Favoritados</div>
              <a href="#favoritos" style="position: absolute; inset: 0;" aria-label="Ir para favoritos"></a>
            </div>

            <div class="panel-stat-card" style="position: relative; overflow: hidden;">
              <div class="panel-stat-header">
                <span class="panel-stat-icon">📅</span>
                <span class="panel-stat-trend">${visitasAtivas.length > 0 ? "Em andamento" : "Agenda livre"}</span>
              </div>
              <div class="panel-stat-value" id="vgVisitasCount">${visitas.length}</div>
              <div class="panel-stat-label">${visitasAtivas.length > 0 ? `${visitasAtivas.length} visita(s) pendente(s)` : "Visitas Realizadas"}</div>
              <a href="#visitas" style="position: absolute; inset: 0;" aria-label="Ir para visitas"></a>
            </div>

            <div class="panel-stat-card" style="position: relative; overflow: hidden;">
              <div class="panel-stat-header">
                <span class="panel-stat-icon">📝</span>
                <span class="panel-stat-trend">Negociações</span>
              </div>
              <div class="panel-stat-value" id="vgPropostasCount">${propostas.length}</div>
              <div class="panel-stat-label">Propostas Enviadas</div>
              <a href="#propostas" style="position: absolute; inset: 0;" aria-label="Ir para propostas"></a>
            </div>

            <div class="panel-stat-card" style="position: relative; overflow: hidden;">
              <div class="panel-stat-header">
                <span class="panel-stat-icon">🔔</span>
                <span class="panel-stat-trend">${notificacoes.length > 0 ? "Novos alertas" : "Atualizado"}</span>
              </div>
              <div class="panel-stat-value" id="vgNotifsCount">${notificacoes.length}</div>
              <div class="panel-stat-label">Matches & Notificações</div>
              <a href="#notificacoes" style="position: absolute; inset: 0;" aria-label="Ir para notificações"></a>
            </div>
          </div>

          <!-- CARDS PRINCIPAIS: PRÓXIMA VISITA & PROPOSTA ATIVA -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
            
            <!-- PRÓXIMA VISITA -->
            <div class="panel-card" style="margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between;">
              <div class="panel-card-header">
                <div>
                  <h3 class="panel-card-title" style="display: flex; align-items: center; gap: 0.5rem;">
                    <span>📅</span> Próxima Visita
                  </h3>
                  <p class="panel-card-subtitle">Seu próximo compromisso agendado</p>
                </div>
                <a href="#visitas" class="panel-btn panel-btn-secondary panel-btn-sm">Ver Todas →</a>
              </div>

              ${proximaVisita ? `
                <div style="background: rgba(10, 46, 42, 0.4); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1.2rem; margin: 0.5rem 0 1rem 0;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.75rem;">
                    <span class="panel-badge panel-badge-${proximaVisita.status || 'solicitada'}">
                      ● ${escapeHtml(proximaVisita.status || 'solicitada').toUpperCase()}
                    </span>
                    <span style="font-size: 0.78rem; color: var(--gold); font-weight: 600; text-transform: uppercase;">
                      ${proximaVisita.tipoVisita === 'video' ? '📹 Vídeo' : '📍 Presencial'}
                    </span>
                  </div>
                  <h4 style="font-family: 'Playfair Display', serif; font-size: 1.15rem; color: var(--cream); margin: 0 0 0.4rem 0;">
                    ${escapeHtml(proximaVisita.imovelTitulo || 'Imóvel Selecionado')}
                  </h4>
                  <div style="font-size: 0.88rem; color: var(--text-light); display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.8rem;">
                    <span>🗓️</span> <strong>${escapeHtml(proximaVisita.data)}</strong> às ${escapeHtml(proximaVisita.horario || 'Horário a confirmar')}
                  </div>
                  ${proximaVisita.linkVideo ? `
                    <div style="margin-bottom: 0.8rem;">
                      <a href="${encodeURI(proximaVisita.linkVideo)}" target="_blank" rel="noopener" class="panel-btn panel-btn-primary panel-btn-sm" style="width: 100%; justify-content: center;">
                        📹 Entrar na Sala de Vídeo
                      </a>
                    </div>
                  ` : ''}
                </div>
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                  <a href="imovel.html?id=${encodeURIComponent(proximaVisita.imovelId || '')}" class="panel-btn panel-btn-secondary panel-btn-sm">
                    Ficha do Imóvel
                  </a>
                  <a href="#visitas" class="panel-btn panel-btn-primary panel-btn-sm">
                    Gerenciar Visita
                  </a>
                </div>
              ` : `
                <div class="panel-empty-state" style="padding: 1.8rem 1rem; margin: 0.5rem 0;">
                  <div class="panel-empty-icon" style="font-size: 2.2rem; margin-bottom: 0.5rem;">📅</div>
                  <h4 class="panel-empty-title" style="font-size: 1.05rem;">Nenhuma visita agendada</h4>
                  <p class="panel-empty-desc" style="font-size: 0.85rem; max-width: 320px; margin: 0 auto 1rem auto;">
                    Deseja conhecer um imóvel de perto ou por chamada de vídeo? Agende um horário conveniente com nossos corretores.
                  </p>
                  <a href="imoveis.html" class="panel-btn panel-btn-primary panel-btn-sm">Agendar Visita</a>
                </div>
              `}
            </div>

            <!-- PROPOSTA ATIVA -->
            <div class="panel-card" style="margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between;">
              <div class="panel-card-header">
                <div>
                  <h3 class="panel-card-title" style="display: flex; align-items: center; gap: 0.5rem;">
                    <span>📝</span> Proposta em Negociação
                  </h3>
                  <p class="panel-card-subtitle">Status das suas ofertas formais</p>
                </div>
                <a href="#propostas" class="panel-btn panel-btn-secondary panel-btn-sm">Ver Todas →</a>
              </div>

              ${propostaAtiva ? `
                <div style="background: rgba(10, 46, 42, 0.4); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1.2rem; margin: 0.5rem 0 1rem 0;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.75rem;">
                    <span class="panel-badge panel-badge-${propostaAtiva.status || 'pendente'}">
                      ● ${escapeHtml(propostaAtiva.status || 'em análise').toUpperCase()}
                    </span>
                    <span style="font-size: 0.78rem; color: var(--text-muted);">
                      Enviada em ${formatData(propostaAtiva.criadoEm)}
                    </span>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--text-light);">Valor Proposto:</span>
                    <span style="font-size: 1.35rem; color: var(--gold); font-weight: 700; font-family: 'Playfair Display', serif;">
                      ${formatMoeda(propostaAtiva.valor)}
                    </span>
                  </div>
                  <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.5rem;">
                    Condições: <strong>${escapeHtml(propostaAtiva.formaPagamento || 'À vista')}</strong>
                  </div>
                  ${propostaAtiva.observacoes ? `
                    <div style="font-size: 0.82rem; font-style: italic; color: var(--text-muted); background: rgba(0,0,0,0.2); padding: 0.5rem 0.75rem; border-radius: 6px;">
                      “${escapeHtml(propostaAtiva.observacoes)}”
                    </div>
                  ` : ''}
                </div>
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                  <a href="imovel.html?id=${encodeURIComponent(propostaAtiva.imovelId || '')}" class="panel-btn panel-btn-secondary panel-btn-sm">
                    Ver Imóvel
                  </a>
                  <a href="#propostas" class="panel-btn panel-btn-primary panel-btn-sm">
                    Detalhes da Proposta
                  </a>
                </div>
              ` : `
                <div class="panel-empty-state" style="padding: 1.8rem 1rem; margin: 0.5rem 0;">
                  <div class="panel-empty-icon" style="font-size: 2.2rem; margin-bottom: 0.5rem;">📝</div>
                  <h4 class="panel-empty-title" style="font-size: 1.05rem;">Nenhuma proposta ativa</h4>
                  <p class="panel-empty-desc" style="font-size: 0.85rem; max-width: 320px; margin: 0 auto 1rem auto;">
                    Quando encontrar o imóvel que faz seu coração bater mais forte, formule uma proposta oficial diretamente na página dele.
                  </p>
                  <a href="imoveis.html" class="panel-btn panel-btn-primary panel-btn-sm">Explorar Imóveis</a>
                </div>
              `}
            </div>

          </div>

          <!-- BLOCO DINÂMICO: PRÓXIMOS PASSOS INTELIGENTES -->
          <div class="panel-card" style="margin-bottom: 2rem;">
            <div class="panel-card-header">
              <div>
                <h3 class="panel-card-title" style="display: flex; align-items: center; gap: 0.5rem;">
                  <span>🧭</span> Próximos Passos Recomendados
                </h3>
                <p class="panel-card-subtitle">Ações sugeridas com base no seu momento atual</p>
              </div>
              <a href="#jornada" class="panel-btn panel-btn-secondary panel-btn-sm">Ver Linha do Tempo →</a>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.85rem;">
              ${proximosPassos.map(passo => `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem; background: ${passo.destaque ? 'rgba(212, 175, 122, 0.08)' : 'var(--glass-bg)'}; border: 1px solid ${passo.destaque ? 'rgba(212, 175, 122, 0.3)' : 'var(--glass-border)'}; border-radius: 12px; flex-wrap: wrap;">
                  <div style="display: flex; align-items: flex-start; gap: 0.85rem; flex: 1; min-width: 240px;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: ${passo.destaque ? 'var(--gold)' : 'rgba(245, 241, 232, 0.1)'}; color: ${passo.destaque ? 'var(--emerald-deep)' : 'var(--cream)'}; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; font-weight: 700;">
                      ${passo.icone}
                    </div>
                    <div>
                      <h4 style="color: var(--cream); font-size: 0.95rem; margin: 0 0 0.2rem 0; font-weight: 600;">
                        ${escapeHtml(passo.titulo)}
                      </h4>
                      <p style="color: var(--text-light); font-size: 0.84rem; margin: 0;">
                        ${escapeHtml(passo.descricao)}
                      </p>
                    </div>
                  </div>
                  <a href="${passo.link}" class="panel-btn ${passo.destaque ? 'panel-btn-primary' : 'panel-btn-secondary'} panel-btn-sm" style="flex-shrink: 0;">
                    ${escapeHtml(passo.cta)} →
                  </a>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- SEÇÃO: ÚLTIMOS IMÓVEIS FAVORITADOS -->
          <div class="panel-card" style="margin-bottom: 2rem;">
            <div class="panel-card-header">
              <div>
                <h3 class="panel-card-title" style="display: flex; align-items: center; gap: 0.5rem;">
                  <span>❤️</span> Seus Últimos Favoritos
                </h3>
                <p class="panel-card-subtitle">Imóveis selecionados para o seu portfólio particular</p>
              </div>
              <a href="#favoritos" class="panel-btn panel-btn-secondary panel-btn-sm">Ver Todos (${favoritos.length}) →</a>
            </div>

            ${favoritos.length === 0 ? `
              <div class="panel-empty-state" style="padding: 2rem 1rem;">
                <div class="panel-empty-icon">🤍</div>
                <h4 class="panel-empty-title">Nenhum imóvel favoritado ainda</h4>
                <p class="panel-empty-desc">
                  Explore nosso catálogo e clique no coração nos imóveis que você mais gostar para reuni-los aqui.
                </p>
                <a href="imoveis.html" class="panel-btn panel-btn-primary panel-btn-sm">Explorar Catálogo</a>
              </div>
            ` : `
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem;">
                ${favoritos.slice(0, 3).map(prop => {
                  const img = (prop.imagens && prop.imagens[0]) || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80';
                  const bairro = prop.endereco?.bairro || prop.bairro || 'Localização Nobre';
                  const cidade = prop.endereco?.cidade || prop.cidade || '';
                  const area = prop.caracteristicas?.areaM2 || prop.area || 0;
                  const quartos = prop.caracteristicas?.quartos || prop.quartos || 0;

                  return `
                    <div class="fav-card" id="vg-fav-card-${prop.id}">
                      <div class="fav-image" style="background-image: url('${encodeURI(img)}')">
                        <button class="fav-remove" data-action="remove-fav" data-prop-id="${escapeHtml(prop.id)}" title="Remover dos favoritos">×</button>
                        <span style="position: absolute; bottom: 8px; left: 8px; background: rgba(10, 46, 42, 0.85); color: var(--gold); padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.72rem; font-weight: 600; text-transform: uppercase;">
                          ${escapeHtml(prop.tipo || 'Imóvel')}
                        </span>
                      </div>
                      <div class="fav-content">
                        <div>
                          <h4 class="fav-title" style="font-size: 1.05rem; margin-bottom: 0.3rem;">
                            ${escapeHtml(prop.titulo || 'Imóvel Exclusivo')}
                          </h4>
                          <p class="fav-location" style="margin-bottom: 0.6rem;">
                            📍 ${escapeHtml(bairro)}${cidade ? `, ${escapeHtml(cidade)}` : ''} • ${area ? `${area}m²` : ''} ${quartos ? `• ${quartos} qts` : ''}
                          </p>
                        </div>
                        <div class="fav-price">
                          <span>${formatMoeda(prop.preco)}</span>
                          <a href="imovel.html?id=${encodeURIComponent(prop.id)}" class="panel-btn panel-btn-secondary panel-btn-sm">
                            Ver Imóvel
                          </a>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        `;

        // Ativa botões de remoção de favoritos dentro da visão geral
        container.querySelectorAll('button[data-action="remove-fav"]').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const propId = btn.getAttribute('data-prop-id');
            if (!propId) return;

            btn.disabled = true;
            try {
              await LivingCanvasFavorites.removeFavorite(propId);
              const card = document.getElementById(`vg-fav-card-${propId}`);
              if (card) {
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                setTimeout(() => card.remove(), 250);
              }
              const countEl = document.getElementById('vgFavCount');
              if (countEl) {
                const cur = parseInt(countEl.textContent, 10) || 0;
                countEl.textContent = Math.max(0, cur - 1);
              }
              showToast('Imóvel removido dos favoritos.', 'info');
            } catch (err) {
              btn.disabled = false;
              showToast('Erro ao remover favorito.', 'error');
            }
          });
        });

      } catch (err) {
        console.error("Erro ao carregar Visão Geral:", err);
        container.innerHTML = `
          <div class="panel-empty-state" style="padding: 3rem 1.5rem;">
            <div class="panel-empty-icon">⚠️</div>
            <h4 class="panel-empty-title">Não foi possível carregar a Visão Geral</h4>
            <p class="panel-empty-desc">${escapeHtml(err.message || 'Erro de conexão com o banco de dados.')}</p>
            <button class="panel-btn panel-btn-primary" onclick="window.location.reload()">Tentar Novamente</button>
          </div>
        `;
      }
    },
    unmount: () => {
      if (typeof unmountVisaoGeral === "function") {
        unmountVisaoGeral();
        unmountVisaoGeral = null;
      }
    }
  });
}

/**
 * Motor heurístico para sugerir os próximos passos prioritários do cliente
 */
function calcularProximosPassos({ user, profile, visitas, propostas, docs, favoritos, buscas }) {
  const passos = [];

  // 1. Visita concluída sem avaliação
  const visitaPendenteAvaliacao = visitas.find(v => (v.status === "concluida" || v.status === "realizada") && !v.avaliacao);
  if (visitaPendenteAvaliacao) {
    passos.push({
      icone: "⭐",
      titulo: `Avalie sua visita em ${visitaPendenteAvaliacao.imovelTitulo || 'imóvel'}`,
      descricao: "Compartilhe sua impressão para que nosso corretor possa refinar as recomendações de acordo com seu estilo.",
      link: "#visitas",
      cta: "Avaliar Visita",
      destaque: true
    });
  }

  // 2. Documentos pendentes / reprovados
  const docsPendentes = docs.filter(d => d.status === "pendente" || d.status === "solicitado" || d.status === "reprovado");
  if (docsPendentes.length > 0) {
    passos.push({
      icone: "📁",
      titulo: `Você possui ${docsPendentes.length} documento(s) com pendência`,
      descricao: "Envie seus comprovantes com segurança para dar andamento às análises de proposta ou contrato.",
      link: "#documentos",
      cta: "Enviar Documentos",
      destaque: true
    });
  }

  // 3. Proposta aceita aguardando formalização
  const propostaAceita = propostas.find(p => p.status === "aceita");
  if (propostaAceita) {
    passos.push({
      icone: "🎉",
      titulo: "Sua proposta foi aceita!",
      descricao: "Acesse sua jornada para conferir a documentação exigida e assinar a minuta do contrato.",
      link: "#jornada",
      cta: "Acompanhar Jornada",
      destaque: true
    });
  }

  // 4. Perfil incompleto (sem telefone de contato)
  if (!profile.telefone && !user.phoneNumber) {
    passos.push({
      icone: "📱",
      titulo: "Complete seu número de WhatsApp no perfil",
      descricao: "Permita que o corretor confirme suas visitas e envie fotos exclusivas em tempo real.",
      link: "#configuracoes",
      cta: "Atualizar Perfil",
      destaque: false
    });
  }

  // 5. Favoritos salvos, mas nenhuma visita marcada
  const visitasAgendadas = visitas.filter(v => v.status === "confirmada" || v.status === "pendente" || v.status === "solicitada");
  if (favoritos.length > 0 && visitasAgendadas.length === 0) {
    passos.push({
      icone: "📅",
      titulo: "Agende uma visita aos seus favoritos",
      descricao: `Você tem ${favoritos.length} imóvel(is) salvo(s). Escolha uma data e experimente o ambiente presencialmente ou por vídeo.`,
      link: "imoveis.html",
      cta: "Agendar Agora",
      destaque: false
    });
  }

  // 6. Nenhuma busca desejada salva
  if (buscas.length === 0) {
    passos.push({
      icone: "✨",
      titulo: "Cadastre seu Imóvel dos Sonhos",
      descricao: "Defina faixa de preço, bairros preferidos e tipologia para receber notificações de novos lançamentos antes do mercado.",
      link: "#imovel-dos-sonhos",
      cta: "Cadastrar Desejo",
      destaque: false
    });
  }

  // Se nenhum passo crítico foi detectado, fornece orientação padrão positiva
  if (passos.length === 0) {
    passos.push({
      icone: "💎",
      titulo: "Sua jornada está fluindo com excelência",
      descricao: "Continue explorando nosso portfólio exclusivo ou entre em contato com seu corretor para consultorias privativas.",
      link: "imoveis.html",
      cta: "Ver Catálogo",
      destaque: false
    });
  }

  return passos.slice(0, 3);
}

// Inicialização automática do módulo
initDashboardVisao();
