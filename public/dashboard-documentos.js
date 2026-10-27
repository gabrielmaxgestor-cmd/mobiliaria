/**
 * Living Canvas - Dashboard do Cliente: Documentos Seguros (P12)
 * 
 * Gerencia a documentação e certidões enviadas pelo cliente ou solicitadas pelo corretor:
 * - Organização por processo: Compra Financiada, Compra à Vista, Locação e Todos
 * - Integração com os checklists oficiais de conformidade (CHECKLISTS)
 * - Upload seguro para o Firebase Storage (/documentos/{uid}/{processo}/)
 * - Validação estrita de tipos (PDF, PNG, JPG, WEBP) e limite de 15 MB
 * - Feedback visual de progresso de upload com barra de porcentagem
 * - Status em tempo real: enviado, em_analise, aprovado, reprovado (com motivo legível)
 * - Exclusão permitida estritamente para documentos não aprovados (firestore.rules)
 * - Download e visualização de arquivos homologados
 */

import {
  registerView,
  escapeHtml,
  formatData,
  showToast
} from "/panel-shell.js";

import {
  Documentos,
  CHECKLISTS
} from "/lc-data.js";

import LivingCanvasAuth from "/auth.js";

let activeProcessoAba = "compra_financiada";
let documentosUsuarioCache = [];
let documentosUnsubscribe = null;

function formatarTamanho(bytes) {
  if (!bytes || isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderStatusBadge(status) {
  const map = {
    enviado: { label: "Enviado", bg: "rgba(59, 130, 246, 0.15)", color: "#93c5fd", border: "rgba(59, 130, 246, 0.3)" },
    em_analise: { label: "Em Análise", bg: "rgba(212, 175, 122, 0.15)", color: "var(--gold, #d4af7a)", border: "rgba(212, 175, 122, 0.3)" },
    aprovado: { label: "Aprovado ✓", bg: "rgba(16, 185, 129, 0.15)", color: "#6ee7b7", border: "rgba(16, 185, 129, 0.35)" },
    reprovado: { label: "Reprovado", bg: "rgba(239, 68, 68, 0.15)", color: "#fca5a5", border: "rgba(239, 68, 68, 0.3)" },
    solicitado: { label: "Solicitado", bg: "rgba(245, 158, 11, 0.15)", color: "#fcd34d", border: "rgba(245, 158, 11, 0.3)" },
    pendente: { label: "Pendente", bg: "rgba(156, 163, 175, 0.15)", color: "#d1d5db", border: "rgba(156, 163, 175, 0.3)" }
  };

  const info = map[status] || { label: status || "Pendente", bg: "rgba(255, 255, 255, 0.08)", color: "#fff", border: "transparent" };
  return `
    <span style="display:inline-flex; align-items:center; gap:0.35rem; padding:0.25rem 0.65rem; border-radius:9999px; font-size:0.75rem; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; background:${info.bg}; color:${info.color}; border:1px solid ${info.border};">
      <span style="width:6px; height:6px; border-radius:50%; background:${info.color};"></span>
      ${escapeHtml(info.label)}
    </span>
  `;
}

// Calcula estatísticas de conformidade do checklist
function calcularProgressoChecklist(processoKey, docs) {
  const checklistDef = CHECKLISTS[processoKey];
  if (!checklistDef) return { total: 0, concluidos: 0, percentual: 0 };

  const docsDoProcesso = docs.filter(d => d.processo === processoKey || !d.processo);
  const obrigatorios = checklistDef.documentos.filter(i => i.obrigatorio);
  
  let concluidos = 0;
  obrigatorios.forEach(item => {
    const docExiste = docsDoProcesso.find(d => d.tipo === item.id && d.status !== "reprovado");
    if (docExiste) concluidos++;
  });

  const total = obrigatorios.length;
  const percentual = total > 0 ? Math.round((concluidos / total) * 100) : 0;
  return { total, concluidos, percentual };
}

// Renderiza o grid de documentos e itens do checklist
function renderizarConteudoDocumentos(container, docs, user) {
  if (!container || !user) return;

  const abasDisponiveis = [
    { key: "compra_financiada", titulo: "Compra Financiada", icone: "🏦" },
    { key: "compra_a_vista", titulo: "Compra à Vista", icone: "💰" },
    { key: "locacao", titulo: "Locação Residencial", icone: "🔑" },
    { key: "todos", titulo: "Todos os Documentos", icone: "📁" }
  ];

  // Abas de navegação de processo
  const abasHtml = `
    <div style="display:flex; gap:0.5rem; border-bottom:1px solid rgba(255,255,255,0.08); margin-bottom:1.5rem; overflow-x:auto; padding-bottom:0.25rem;">
      ${abasDisponiveis.map(aba => {
        const isAtiva = activeProcessoAba === aba.key;
        return `
          <button 
            type="button" 
            onclick="window.trocarAbaProcessoDocumentos('${aba.key}')"
            style="display:flex; align-items:center; gap:0.4rem; padding:0.65rem 1.1rem; border-radius:8px 8px 0 0; border:none; background:${isAtiva ? 'rgba(212, 175, 122, 0.15)' : 'transparent'}; border-bottom:2px solid ${isAtiva ? 'var(--gold, #d4af7a)' : 'transparent'}; color:${isAtiva ? 'var(--gold, #d4af7a)' : 'var(--text-light, #a0aec0)'}; font-weight:${isAtiva ? '600' : '500'}; font-size:0.88rem; cursor:pointer; transition:all 0.15s ease; white-space:nowrap;"
          >
            <span>${aba.icone}</span>
            <span>${escapeHtml(aba.titulo)}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;

  // Se a aba for um processo com checklist
  let bannerProgressoHtml = "";
  let listaItensHtml = "";

  if (activeProcessoAba !== "todos") {
    const checklistDef = CHECKLISTS[activeProcessoAba];
    const { total, concluidos, percentual } = calcularProgressoChecklist(activeProcessoAba, docs);
    const docsDoProcesso = docs.filter(d => d.processo === activeProcessoAba || !d.processo);

    bannerProgressoHtml = `
      <div style="padding:1.25rem; border-radius:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.06); margin-bottom:1.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:0.75rem;">
          <div>
            <h4 style="margin:0; font-size:1.05rem; color:var(--cream, #f5f1e8); font-family:'Playfair Display', serif;">
              ${escapeHtml(checklistDef.titulo)}
            </h4>
            <p style="margin:0.2rem 0 0 0; font-size:0.82rem; color:var(--text-muted);">
              ${escapeHtml(checklistDef.descricao)}
            </p>
          </div>
          <div style="text-align:right;">
            <span style="font-size:0.8rem; color:var(--text-muted); display:block;">Conformidade</span>
            <strong style="color:var(--gold, #d4af7a); font-size:1.1rem;">${concluidos} de ${total} obrigatórios</strong>
            <span style="font-size:0.75rem; color:${percentual === 100 ? '#10b981' : 'var(--text-light)'}; margin-left:0.35rem;">(${percentual}%)</span>
          </div>
        </div>

        <!-- Barra de Progresso -->
        <div style="width:100%; height:8px; background:rgba(255,255,255,0.08); border-radius:9999px; overflow:hidden;">
          <div style="width:${percentual}%; height:100%; background:linear-gradient(90deg, var(--gold, #d4af7a), #10b981); border-radius:9999px; transition:width 0.4s ease;"></div>
        </div>
      </div>
    `;

    // Itens do Checklist
    listaItensHtml = `
      <div style="display:flex; flex-direction:column; gap:0.85rem;">
        ${checklistDef.documentos.map(item => {
          // Procura se já há documento enviado para este item
          const docEnviado = docsDoProcesso.find(d => d.tipo === item.id);
          const obrigatorioBadge = item.obrigatorio 
            ? `<span style="font-size:0.7rem; color:#fca5a5; background:rgba(239,68,68,0.15); padding:0.15rem 0.4rem; border-radius:4px; font-weight:600;">Obrigatório</span>`
            : `<span style="font-size:0.7rem; color:var(--text-muted); background:rgba(255,255,255,0.05); padding:0.15rem 0.4rem; border-radius:4px;">Opcional</span>`;

          if (docEnviado) {
            const isAprovado = docEnviado.status === "aprovado";
            const isReprovado = docEnviado.status === "reprovado";
            const podeExcluir = !isAprovado;

            return `
              <div class="panel-card" style="margin-bottom:0; padding:1rem 1.25rem; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.02); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                <div style="display:flex; gap:0.85rem; align-items:center; flex:1; min-width:240px;">
                  <div style="font-size:1.75rem; width:44px; height:44px; border-radius:8px; background:rgba(255,255,255,0.04); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    ${docEnviado.mimeType?.includes("pdf") ? "📄" : "🖼️"}
                  </div>
                  <div>
                    <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.2rem;">
                      <strong style="color:var(--cream, #f5f1e8); font-size:0.95rem;">${escapeHtml(item.rotulo)}</strong>
                      ${obrigatorioBadge}
                      ${renderStatusBadge(docEnviado.status)}
                    </div>
                    <div style="font-size:0.78rem; color:var(--text-muted); display:flex; gap:0.75rem; flex-wrap:wrap;">
                      <span>Arquivo: <strong style="color:var(--text-light);">${escapeHtml(docEnviado.nomeOriginal || "documento")}</strong></span>
                      ${docEnviado.tamanhoBytes ? `<span>(${formatarTamanho(docEnviado.tamanhoBytes)})</span>` : ""}
                      <span>Enviado em ${formatData(docEnviado.criadoEm)}</span>
                    </div>

                    ${isReprovado && docEnviado.motivoReprovacao ? `
                      <div style="margin-top:0.4rem; padding:0.4rem 0.65rem; border-radius:6px; background:rgba(239,68,68,0.1); border-left:2px solid #ef4444; font-size:0.78rem; color:#fee2e2;">
                        <strong>Motivo da Reprovação:</strong> ${escapeHtml(docEnviado.motivoReprovacao)}
                      </div>
                    ` : ""}
                  </div>
                </div>

                <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                  ${docEnviado.url ? `
                    <a href="${escapeHtml(docEnviado.url)}" target="_blank" rel="noopener noreferrer" class="panel-btn panel-btn-secondary panel-btn-sm" style="font-size:0.78rem;">
                      👁️ Visualizar
                    </a>
                  ` : ""}

                  ${isReprovado ? `
                    <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" style="font-size:0.78rem;" onclick="window.abrirModalUploadDocumento('${activeProcessoAba}', '${item.id}', '${escapeHtml(item.rotulo)}')">
                      🔄 Reenviar
                    </button>
                  ` : ""}

                  ${podeExcluir ? `
                    <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" style="color:#ef4444; border-color:rgba(239,68,68,0.25); font-size:0.78rem;" onclick="window.excluirDocumentoCliente('${docEnviado.id}', '${escapeHtml(item.rotulo)}')">
                      🗑️ Excluir
                    </button>
                  ` : `
                    <span style="font-size:0.72rem; color:var(--text-muted);" title="Documentos homologados pela imobiliária não podem ser excluídos pelo cliente.">
                      🔒 Homologado
                    </span>
                  `}
                </div>
              </div>
            `;
          } else {
            // Documento Pendente de Envio
            return `
              <div class="panel-card" style="margin-bottom:0; padding:1rem 1.25rem; border:1px dashed rgba(255,255,255,0.12); border-radius:10px; background:rgba(0,0,0,0.1); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                <div style="display:flex; gap:0.85rem; align-items:center;">
                  <div style="font-size:1.75rem; width:44px; height:44px; border-radius:8px; background:rgba(255,255,255,0.02); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--text-muted);">
                    📤
                  </div>
                  <div>
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.2rem;">
                      <strong style="color:var(--cream, #f5f1e8); font-size:0.95rem;">${escapeHtml(item.rotulo)}</strong>
                      ${obrigatorioBadge}
                    </div>
                    <span style="font-size:0.78rem; color:var(--text-muted);">
                      Pendente de envio. Formatos suportados: PDF, JPG, PNG ou WEBP (máx. 15 MB).
                    </span>
                  </div>
                </div>

                <div>
                  <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" style="font-size:0.78rem;" onclick="window.abrirModalUploadDocumento('${activeProcessoAba}', '${item.id}', '${escapeHtml(item.rotulo)}')">
                    + Enviar Arquivo
                  </button>
                </div>
              </div>
            `;
          }
        }).join("")}
      </div>
    `;

  } else {
    // Aba "Todos os Documentos" (Visão geral de todos os arquivos já enviados)
    if (docs.length === 0) {
      listaItensHtml = `
        <div class="panel-empty-state" style="padding:3rem 1.5rem; text-align:center;">
          <div class="panel-empty-icon" style="font-size:3rem; margin-bottom:1rem;">📁</div>
          <h4 class="panel-empty-title" style="font-size:1.2rem; font-family:'Playfair Display', serif; color:var(--cream, #f5f1e8); margin-bottom:0.5rem;">
            Nenhum documento anexado
          </h4>
          <p class="panel-empty-desc" style="max-width:480px; margin:0 auto 1.5rem auto; font-size:0.88rem; color:var(--text-light); line-height:1.5;">
            Selecione uma das etapas acima (Compra Financiada, Compra à Vista ou Locação) para acompanhar e anexar os documentos necessários com segurança criptográfica.
          </p>
        </div>
      `;
    } else {
      listaItensHtml = `
        <div class="panel-table-responsive" style="background:rgba(255,255,255,0.02); border-radius:10px; border:1px solid rgba(255,255,255,0.08);">
          <table class="panel-table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Processo</th>
                <th>Tamanho</th>
                <th>Data de Envio</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${docs.map(d => {
                const isAprovado = d.status === "aprovado";
                const isReprovado = d.status === "reprovado";
                const processoNome = CHECKLISTS[d.processo]?.titulo || d.processo || "Geral";

                return `
                  <tr>
                    <td>
                      <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span>${d.mimeType?.includes("pdf") ? "📄" : "🖼️"}</span>
                        <div>
                          <strong style="color:var(--cream, #f5f1e8); font-size:0.88rem;">${escapeHtml(d.nomeOriginal || d.tipo || "Documento")}</strong>
                          ${isReprovado && d.motivoReprovacao ? `
                            <div style="font-size:0.75rem; color:#fca5a5; margin-top:0.15rem;">
                              Motivo: ${escapeHtml(d.motivoReprovacao)}
                            </div>
                          ` : ""}
                        </div>
                      </div>
                    </td>
                    <td style="font-size:0.82rem; color:var(--text-light);">${escapeHtml(processoNome)}</td>
                    <td style="font-size:0.82rem; color:var(--text-muted);">${formatarTamanho(d.tamanhoBytes)}</td>
                    <td style="font-size:0.82rem; color:var(--text-muted);">${formatData(d.criadoEm)}</td>
                    <td>${renderStatusBadge(d.status)}</td>
                    <td>
                      <div style="display:flex; gap:0.4rem; align-items:center;">
                        ${d.url ? `
                          <a href="${escapeHtml(d.url)}" target="_blank" rel="noopener noreferrer" class="panel-btn panel-btn-secondary panel-btn-sm" style="font-size:0.75rem; padding:0.25rem 0.5rem;">
                            Visualizar
                          </a>
                        ` : ""}
                        ${!isAprovado ? `
                          <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" style="color:#ef4444; border-color:rgba(239,68,68,0.25); font-size:0.75rem; padding:0.25rem 0.5rem;" onclick="window.excluirDocumentoCliente('${d.id}', '${escapeHtml(d.nomeOriginal || d.tipo)}')">
                            Excluir
                          </button>
                        ` : `
                          <span style="font-size:0.7rem; color:var(--text-muted);">🔒</span>
                        `}
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  // Montagem do Container
  container.innerHTML = `
    <!-- Topbar com Ação de Upload Avulso -->
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid rgba(255,255,255,0.08);">
      <div>
        <p style="margin:0; font-size:0.88rem; color:var(--text-light);">
          Seus arquivos são armazenados de forma criptografada e acessíveis apenas pela equipe autorizada.
        </p>
      </div>
      <div>
        <button type="button" class="panel-btn panel-btn-primary panel-btn-sm" onclick="window.abrirModalUploadDocumento('${activeProcessoAba === 'todos' ? 'compra_financiada' : activeProcessoAba}', 'outro', 'Documento Complementar')">
          + Upload de Arquivo Complementar
        </button>
      </div>
    </div>

    <!-- Abas de Processo -->
    ${abasHtml}

    <!-- Banner de Progresso (se aplicável) -->
    ${bannerProgressoHtml}

    <!-- Lista de Itens / Tabela -->
    ${listaItensHtml}

    <!-- Modal de Upload com Barra de Progresso Real -->
    <div id="modalUploadDocumentoContainer" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.75); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:1.5rem;">
      <div style="background:var(--emerald-deep, #0a2e2a); border:1px solid rgba(212, 175, 122, 0.3); border-radius:14px; max-width:480px; width:100%; padding:1.75rem; box-shadow:0 12px 30px rgba(0,0,0,0.5);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
          <h4 style="margin:0; font-size:1.15rem; color:var(--cream, #f5f1e8); font-family:'Playfair Display', serif;" id="modalUploadTitulo">
            Enviar Documento
          </h4>
          <button type="button" onclick="window.fecharModalUploadDocumento()" style="background:transparent; border:none; color:var(--text-muted); font-size:1.2rem; cursor:pointer;">
            ✕
          </button>
        </div>

        <form id="formUploadDocumento" onsubmit="window.submeterUploadDocumento(event)">
          <input type="hidden" id="uploadInputProcesso" value="" />
          <input type="hidden" id="uploadInputTipo" value="" />

          <div style="margin-bottom:1rem;">
            <label style="display:block; font-size:0.82rem; color:var(--text-light); margin-bottom:0.35rem;">
              Item do Checklist:
            </label>
            <input type="text" id="uploadInputRotuloVisivel" class="panel-input" readonly style="width:100%; opacity:0.8; font-size:0.85rem;" />
          </div>

          <div style="margin-bottom:1.25rem;">
            <label style="display:block; font-size:0.82rem; color:var(--text-light); margin-bottom:0.35rem;">
              Selecione o Arquivo (PDF, JPG, PNG ou WEBP - máx. 15 MB)*:
            </label>
            <input 
              type="file" 
              id="uploadInputArquivo" 
              accept="application/pdf,image/jpeg,image/png,image/webp" 
              class="panel-input" 
              required 
              style="width:100%; font-size:0.85rem; padding:0.5rem;"
            />
          </div>

          <!-- Barra de Progresso Real do Upload -->
          <div id="uploadProgressBarContainer" style="display:none; margin-bottom:1.25rem;">
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-bottom:0.3rem;">
              <span id="uploadProgressStatusText">Enviando arquivo com segurança...</span>
              <strong style="color:var(--gold, #d4af7a);" id="uploadProgressPercentText">0%</strong>
            </div>
            <div style="width:100%; height:8px; background:rgba(255,255,255,0.08); border-radius:9999px; overflow:hidden;">
              <div id="uploadProgressBarFill" style="width:0%; height:100%; background:linear-gradient(90deg, var(--gold, #d4af7a), #10b981); border-radius:9999px; transition:width 0.2s ease;"></div>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:0.65rem;">
            <button type="button" class="panel-btn panel-btn-secondary panel-btn-sm" onclick="window.fecharModalUploadDocumento()" id="btnCancelUpload">
              Cancelar
            </button>
            <button type="submit" class="panel-btn panel-btn-primary panel-btn-sm" id="btnSubmitUpload">
              Iniciar Envio
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// Alternar abas de processo
window.trocarAbaProcessoDocumentos = function(abaKey) {
  activeProcessoAba = abaKey;
  const container = document.getElementById("clientDocumentosContainer");
  const user = LivingCanvasAuth.auth.currentUser;
  if (container && user) {
    renderizarConteudoDocumentos(container, documentosUsuarioCache, user);
  }
};

// Abertura e fechamento do modal de upload
window.abrirModalUploadDocumento = function(processo, tipo, rotulo) {
  const modal = document.getElementById("modalUploadDocumentoContainer");
  const inputProc = document.getElementById("uploadInputProcesso");
  const inputTipo = document.getElementById("uploadInputTipo");
  const inputRotulo = document.getElementById("uploadInputRotuloVisivel");
  const inputArquivo = document.getElementById("uploadInputArquivo");
  const progressBox = document.getElementById("uploadProgressBarContainer");

  if (!modal) return;

  if (inputProc) inputProc.value = processo || "compra_financiada";
  if (inputTipo) inputTipo.value = tipo || "outro";
  if (inputRotulo) inputRotulo.value = rotulo || "Documento Complementar";
  if (inputArquivo) inputArquivo.value = "";
  if (progressBox) progressBox.style.display = "none";

  modal.style.display = "flex";
};

window.fecharModalUploadDocumento = function() {
  const modal = document.getElementById("modalUploadDocumentoContainer");
  if (modal) modal.style.display = "none";
};

// Execução do upload com validação de cliente e progresso
window.submeterUploadDocumento = async function(event) {
  if (event && event.preventDefault) event.preventDefault();

  const fileInput = document.getElementById("uploadInputArquivo");
  const processoInput = document.getElementById("uploadInputProcesso");
  const tipoInput = document.getElementById("uploadInputTipo");
  const btnSubmit = document.getElementById("btnSubmitUpload");
  const btnCancel = document.getElementById("btnCancelUpload");
  const progressBox = document.getElementById("uploadProgressBarContainer");
  const progressFill = document.getElementById("uploadProgressBarFill");
  const progressPercent = document.getElementById("uploadProgressPercentText");
  const progressStatus = document.getElementById("uploadProgressStatusText");

  const file = fileInput?.files?.[0];
  if (!file) {
    showToast("Por favor, selecione um arquivo para upload.", "warning");
    return;
  }

  // Validação estrita de tamanho (15 MB)
  const MAX_SIZE = 15 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    showToast("O arquivo selecionado excede o limite máximo permitido de 15 MB.", "error");
    return;
  }

  // Validação de tipo MIME
  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    showToast("Formato inválido. Envie apenas arquivos em PDF ou imagens (JPG, PNG, WEBP).", "error");
    return;
  }

  const processo = processoInput?.value || "compra_financiada";
  const tipo = tipoInput?.value || "outro";

  try {
    if (btnSubmit) btnSubmit.disabled = true;
    if (btnCancel) btnCancel.disabled = true;
    if (progressBox) progressBox.style.display = "block";
    if (progressStatus) progressStatus.textContent = "Criptografando e enviando...";

    await Documentos.enviar(file, {
      processo,
      tipo,
      onProgress: (pct) => {
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressPercent) progressPercent.textContent = `${pct}%`;
      }
    });

    showToast("Documento enviado com sucesso para análise!", "success");
    window.fecharModalUploadDocumento();

    // Atualiza listagem
    const user = LivingCanvasAuth.auth.currentUser;
    if (user) {
      documentosUsuarioCache = await Documentos.listarDoCliente(user.uid);
      const container = document.getElementById("clientDocumentosContainer");
      if (container) {
        renderizarConteudoDocumentos(container, documentosUsuarioCache, user);
      }
    }
  } catch (err) {
    console.error("Erro no envio de documento:", err);
    showToast(`Falha no upload: ${err.message}`, "error");
  } finally {
    if (btnSubmit) btnSubmit.disabled = false;
    if (btnCancel) btnCancel.disabled = false;
  }
};

// Exclusão de documento do cliente (apenas não aprovados conforme firestore.rules)
window.excluirDocumentoCliente = async function(docId, nomeDoc) {
  if (!docId) return;

  const confirmou = window.confirm(`Tem certeza que deseja excluir o documento "${nomeDoc || 'selecionado'}"? Esta ação removerá o arquivo do sistema.`);
  if (!confirmou) return;

  try {
    showToast("Removendo documento...", "info");
    await Documentos.remover(docId);
    showToast("Documento removido com sucesso.", "success");

    const user = LivingCanvasAuth.auth.currentUser;
    if (user) {
      documentosUsuarioCache = await Documentos.listarDoCliente(user.uid);
      const container = document.getElementById("clientDocumentosContainer");
      if (container) {
        renderizarConteudoDocumentos(container, documentosUsuarioCache, user);
      }
    }
  } catch (err) {
    console.error("Erro ao excluir documento:", err);
    showToast(`Erro ao excluir: ${err.message}`, "error");
  }
};

// Registra a View 'documentos' no painel
registerView("documentos", {
  titulo: "Documentos Seguros",
  mount: async (section, user) => {
    const container = document.getElementById("clientDocumentosContainer") || section;
    if (!container || !user) return;

    container.innerHTML = `
      <div style="padding: 2rem 0; text-align: center;">
        <div class="panel-skeleton" style="height: 120px; margin-bottom: 1rem; border-radius: 12px;"></div>
        <div class="panel-skeleton" style="height: 120px; border-radius: 12px;"></div>
      </div>
    `;

    try {
      // Escuta em tempo real da lista de documentos do cliente
      documentosUnsubscribe = Documentos.listar({ usuarioId: user.uid }, (docs) => {
        documentosUsuarioCache = docs || [];
        renderizarConteudoDocumentos(container, documentosUsuarioCache, user);
      });
    } catch (err) {
      console.error("Erro ao carregar documentos:", err);
      container.innerHTML = `
        <div class="panel-empty-state" style="padding:2rem; text-align:center;">
          <p style="color:var(--danger, #ef4444); margin-bottom:1rem;">Falha ao carregar documentos: ${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  },
  unmount: () => {
    if (typeof documentosUnsubscribe === "function") {
      documentosUnsubscribe();
      documentosUnsubscribe = null;
    }
    documentosUsuarioCache = [];
  }
});
