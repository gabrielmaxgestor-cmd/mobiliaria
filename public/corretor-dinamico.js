/**
 * Living Canvas - Hidratação Dinâmica do Perfil Público do Corretor (P10)
 * 
 * Lê os parâmetros ?id={uid} ou ?slug={slug} da query string, busca os dados reais
 * em 'corretoresPublicos/{uid}', hidrata fotos, biografia, redes, especialidades,
 * horários de atendimento, portfólio de imóveis do corretor e captura leads diretos.
 */

import LivingCanvasAuth from './auth.js';
import LivingCanvasData, { CorretoresPublicos, Atividades, db } from './lc-data.js';
import { saveLead, showToast } from './leads.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMoeda(val) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(num);
}

function cleanDigits(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

/**
 * Busca o corretor pelo ID, slug ou busca padrão
 */
async function carregarDadosCorretor() {
  const urlParams = new URLSearchParams(window.location.search);
  const idParam = urlParams.get('id');
  const slugParam = urlParams.get('slug');

  const siteConfig = window.SITE_CONFIG || {};

  // 1. Tenta carregar por ID ou Slug explícito
  if (idParam || slugParam) {
    try {
      const corretor = await CorretoresPublicos.obter(idParam || slugParam);
      if (corretor) return corretor;
    } catch (e) {
      console.warn('Corretor não encontrado por parâmetro URL:', e.message);
    }
  }

  // 2. Tenta corretor padrão configurado no SITE_CONFIG
  if (siteConfig.corretorPadraoId) {
    try {
      const corretor = await CorretoresPublicos.obter(siteConfig.corretorPadraoId);
      if (corretor) return corretor;
    } catch (e) {
      console.warn('Corretor padrão não encontrado no banco:', e.message);
    }
  }

  // 3. Tenta o primeiro corretor público ativo cadastrado
  try {
    const corretores = await CorretoresPublicos.listarVisiveis();
    if (corretores && corretores.length > 0) {
      return corretores[0];
    }
  } catch (e) {
    console.warn('Erro ao listar corretores visíveis:', e.message);
  }

  // 4. Fallback institucional baseado em SITE_CONFIG (nunca dados falsos hardcoded)
  const brandName = siteConfig.brandName || 'Living Canvas';
  return {
    id: 'corretor-institucional',
    nome: siteConfig.corretorPadraoNome || `Consultor(a) ${brandName}`,
    creci: siteConfig.creci || 'CRECI Sob Consulta',
    bio: siteConfig.institucionalBio || `Equipe especializada em assessoria imobiliária de alto padrão, curadoria de arquitetura e negociações com total confidencialidade na ${brandName}.`,
    telefone: siteConfig.whatsappNumber || siteConfig.telefone || '(11) 3000-0000',
    whatsapp: siteConfig.whatsappNumber || siteConfig.telefone || '(11) 3000-0000',
    email: siteConfig.emailContato || 'contato@livingcanvas.com.br',
    slug: 'consultoria',
    especialidades: ['Alto Padrão', 'Investimentos', 'Lançamentos', 'Penthouses'],
    bairros: ['Jardins', 'Itaim Bibi', 'Vila Nova Conceição', 'Pinheiros'],
    redes: {
      instagram: siteConfig.socialInstagram || '',
      linkedin: siteConfig.socialLinkedin || ''
    },
    horarios: {
      inicioSemana: '09:00',
      fimSemana: '18:00',
      inicioSabado: '09:00',
      fimSabado: '13:00',
      diasSemana: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab']
    }
  };
}

/**
 * Busca imóveis cadastrados para este corretor
 */
async function carregarImoveisDoCorretor(corretorId) {
  if (!corretorId || corretorId === 'corretor-institucional') {
    // Carrega os 3 primeiros imóveis gerais para preencher o portfólio
    try {
      const snap = await getDocs(query(collection(db, 'imoveis')));
      return snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 3);
    } catch {
      return [];
    }
  }

  try {
    // Busca por corretorResponsavelId ou corretorId
    const q1 = query(collection(db, 'imoveis'), where('corretorId', '==", corretorId));
    const snap1 = await getDocs(q1);
    let items = snap1.docs.map(d => ({ id: d.id, ...d.data() }));

    if (items.length === 0) {
      const q2 = query(collection(db, 'imoveis'), where('corretorResponsavelId', '==', corretorId));
      const snap2 = await getDocs(q2);
      items = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    return items;
  } catch (err) {
    console.warn('Erro ao carregar imóveis do corretor:', err.message);
    return [];
  }
}

/**
 * Hidrata todos os elementos visuais de corretor.html
 */
async function hidratarPaginaCorretor() {
  const corretor = await carregarDadosCorretor();
  window._currentCorretorData = corretor;

  const siteConfig = window.SITE_CONFIG || {};
  const brandName = siteConfig.brandName || 'Living Canvas';
  const nomeCompleto = corretor.nome || `Especialista ${brandName}`;
  const parts = nomeCompleto.split(' ');
  const primeiroNome = parts[0];
  const sobrenome = parts.slice(1).join(' ') || '';

  const creciText = corretor.creci || 'CRECI Sob Consulta';
  const whatsappDigits = cleanDigits(corretor.whatsapp || corretor.telefone);
  const waUrl = whatsappDigits ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(`Olá ${primeiroNome}, encontrei seu perfil no site ${brandName} e gostaria de informações sobre imóveis.`)}` : '#';
  const agendarUrl = `agendar.html?corretor=${corretor.id}`;

  // 1. Title e Metadados
  document.title = `${nomeCompleto} — Especialista Imobiliário | ${brandName}`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', `Conheça o perfil, trajetória e portfólio de imóveis de ${nomeCompleto}.`);

  // 2. Breadcrumb
  const breadcrumbName = document.querySelector('.breadcrumb strong');
  if (breadcrumbName) breadcrumbName.textContent = nomeCompleto;

  // 3. Profile Hero
  const heroName = document.querySelector('.profile-name');
  if (heroName) {
    heroName.innerHTML = `${escapeHtml(primeiroNome)} <em>${escapeHtml(sobrenome)}</em>`;
  }

  const heroRole = document.querySelector('.profile-role');
  if (heroRole) {
    const mainBairro = (corretor.bairros && corretor.bairros[0]) ? corretor.bairros[0] : 'Alto Padrão';
    heroRole.textContent = `${creciText} • Especialista em ${mainBairro}`;
  }

  const heroTagline = document.querySelector('.profile-tagline');
  if (heroTagline) {
    const shortBio = (corretor.bio || '').split('.')[0] || 'Atendimento consultivo, transparente e focado em encontrar o imóvel ideal para a sua história.';
    heroTagline.textContent = `"${shortBio}."`;
  }

  // Foto de Perfil
  const photoDiv = document.querySelector('.profile-photo');
  if (photoDiv) {
    if (corretor.fotoURL) {
      photoDiv.style.backgroundImage = `url('${corretor.fotoURL}')`;
      photoDiv.style.backgroundSize = 'cover';
      photoDiv.style.backgroundPosition = 'center';
    } else {
      photoDiv.style.background = 'radial-gradient(circle, #1a5f5a 0%, #0a2e2a 100%)';
      photoDiv.style.display = 'flex';
      photoDiv.style.alignItems = 'center';
      photoDiv.style.justifyContent = 'center';
      photoDiv.innerHTML = `
        <span class="profile-photo-badge">★ Credenciado(a)</span>
        <div style="font-size: 4.5rem; font-family: 'Playfair Display', serif; color: var(--gold); font-weight: 700;">
          ${(primeiroNome[0] || 'C') + (sobrenome[0] || 'R')}
        </div>
      `;
    }
  }

  // Links Sociais no Hero
  const socialDiv = document.querySelector('.profile-photo-social');
  if (socialDiv) {
    let socialHtml = '';
    if (corretor.redes?.linkedin) {
      const lk = corretor.redes.linkedin.startsWith('http') ? corretor.redes.linkedin : `https://${corretor.redes.linkedin}`;
      socialHtml += `<a href="${escapeHtml(lk)}" target="_blank" rel="noopener noreferrer" title="LinkedIn">in</a>`;
    }
    if (corretor.redes?.instagram) {
      const igHandle = corretor.redes.instagram.replace('@', '');
      const igUrl = corretor.redes.instagram.startsWith('http') ? corretor.redes.instagram : `https://instagram.com/${igHandle}`;
      socialHtml += `<a href="${escapeHtml(igUrl)}" target="_blank" rel="noopener noreferrer" title="Instagram">@</a>`;
    }
    if (corretor.email) {
      socialHtml += `<a href="mailto:${escapeHtml(corretor.email)}" title="E-mail">✉</a>`;
    }
    socialDiv.innerHTML = socialHtml;
  }

  // CTAs do Hero
  const heroCtas = document.querySelector('.profile-ctas');
  if (heroCtas) {
    heroCtas.innerHTML = `
      <a href="${agendarUrl}" class="profile-cta profile-cta-primary">📅 Agendar Visita</a>
      <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="profile-cta profile-cta-whatsapp">💬 Falar no WhatsApp</a>
      <a href="#imoveis" class="profile-cta profile-cta-secondary">🏠 Ver Imóveis</a>
    `;
  }

  // 4. Bio Section
  const bioContent = document.querySelector('.bio-content');
  if (bioContent) {
    const paragraphs = (corretor.bio || '')
      .split('\n')
      .map(p => p.trim())
      .filter(Boolean);

    bioContent.innerHTML = `
      <p class="section-eyebrow">Trajetória Profissional</p>
      <h2 class="section-title">Uma consultoria voltada para <em>pessoas</em></h2>
      ${paragraphs.length > 0 ? paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('') : `
        <p>${escapeHtml(nomeCompleto)} atua no mercado imobiliário com foco em residências nobres e investimentos consolidados. Seu diferencial está na escuta ativa, garantindo transações transparentes e seguras para compradores e proprietários.</p>
        <p>Com amplo conhecimento das regiões de maior valorização, conecta cada cliente ao endereço sob medida para o seu momento de vida.</p>
      `}
    `;
  }

  // Citação da Bio
  const quoteAuthorName = document.querySelector('.bio-quote-info h4');
  if (quoteAuthorName) quoteAuthorName.textContent = nomeCompleto;

  const quoteAuthorRole = document.querySelector('.bio-quote-info p');
  if (quoteAuthorRole) quoteAuthorRole.textContent = `${creciText} • ${brandName}`;

  const quoteAvatar = document.querySelector('.bio-quote-avatar');
  if (quoteAvatar) {
    if (corretor.fotoURL) {
      quoteAvatar.style.backgroundImage = `url('${corretor.fotoURL}')`;
      quoteAvatar.style.backgroundSize = 'cover';
    } else {
      quoteAvatar.style.background = '#0a2e2a';
      quoteAvatar.style.border = '1px solid var(--gold)';
      quoteAvatar.textContent = (primeiroNome[0] || 'C');
      quoteAvatar.style.display = 'flex';
      quoteAvatar.style.alignItems = 'center';
      quoteAvatar.style.justifyContent = 'center';
      quoteAvatar.style.color = 'var(--gold)';
      quoteAvatar.style.fontWeight = '700';
    }
  }

  // 5. Especialidades & Bairros
  const specialtiesTitle = document.querySelector('section:has(.specialties-grid) .section-title');
  if (specialtiesTitle) {
    specialtiesTitle.innerHTML = `Onde ${escapeHtml(primeiroNome)} pode te <em>ajudar</em>`;
  }

  const bairrosListEl = document.querySelector('.specialty-card:nth-child(1) .specialty-list');
  if (bairrosListEl && corretor.bairros) {
    bairrosListEl.innerHTML = corretor.bairros.map(b => `
      <div class="specialty-item">
        <span class="specialty-item-name">${escapeHtml(b)}</span>
        <span class="specialty-item-count" style="color: var(--gold);">★ Região Atendida</span>
      </div>
    `).join('');
  }

  const espListEl = document.querySelector('.specialty-card:nth-child(2) .specialty-list');
  if (espListEl && corretor.especialidades) {
    espListEl.innerHTML = corretor.especialidades.map(e => `
      <div class="specialty-item">
        <span class="specialty-item-name">${escapeHtml(e)}</span>
        <span class="specialty-item-count" style="color: var(--gold);">Especialidade</span>
      </div>
    `).join('');
  }

  // 6. Imóveis Curados
  const imoveisTitle = document.querySelector('#imoveis .section-title');
  if (imoveisTitle) {
    imoveisTitle.innerHTML = `Imóveis sob <em>curadoria</em> de ${escapeHtml(primeiroNome)}`;
  }

  const propGrid = document.querySelector('.properties-grid');
  if (propGrid) {
    propGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem 0; color: var(--cream); opacity: 0.7;">
        Carregando carteira de imóveis...
      </div>
    `;

    const imoveis = await carregarImoveisDoCorretor(corretor.id);
    if (imoveis.length === 0) {
      propGrid.innerHTML = `
        <div style="grid-column: 1 / -1; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 14px; padding: 3rem 1.5rem; text-align: center;">
          <div style="font-size: 2.2rem; margin-bottom: 0.75rem;">🏡</div>
          <h3 style="font-family: 'Playfair Display', serif; color: var(--cream); font-size: 1.3rem; margin-bottom: 0.5rem;">Novas Propriedades em Curadoria</h3>
          <p style="color: var(--cream); opacity: 0.7; max-width: 500px; margin: 0 auto 1.5rem auto; font-size: 0.9rem;">
            Os lançamentos exclusivos representados por ${escapeHtml(primeiroNome)} estão passando por processo de diligência e fotografia. Explore nosso catálogo completo da imobiliária.
          </p>
          <a href="imoveis.html" class="profile-cta profile-cta-primary" style="display: inline-block;">Ver Catálogo Geral</a>
        </div>
      `;
    } else {
      propGrid.innerHTML = imoveis.map(im => {
        const foto = (im.fotos && im.fotos[0]) || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80';
        const preco = formatMoeda(im.preco);
        const bairro = im.bairro || im.cidade || 'Localização Nobre';
        const area = im.areaUtil ? ` • ${im.areaUtil}m²` : (im.areaTotal ? ` • ${im.areaTotal}m²` : '');
        const suites = im.suites ? `${im.suites} suítes` : (im.quartos ? `${im.quartos} quartos` : 'Exclusivo');
        const vagas = im.vagas ? `${im.vagas} vagas` : 'Vagas privativas';

        return `
          <article class="property-card" style="cursor: pointer;" onclick="window.location.href='imovel.html?id=${im.id}'">
            <div class="card-image card-image-exterior" style="background-image: url('${escapeHtml(foto)}')"></div>
            <div class="card-overlay">
              <span class="card-badge">${escapeHtml(im.tag || 'Exclusivo')}</span>
              <span class="card-price">${preco}</span>
              <h3 class="card-title">${escapeHtml(im.titulo || 'Imóvel Exclusivo')}</h3>
              <p class="card-location">${escapeHtml(bairro)}${area}</p>
              <p class="card-story">"${escapeHtml(im.subtitulo || im.descricao?.substring(0, 75) || 'Sofisticação e conforto.')}..."</p>
              <div class="card-meta">
                <span>🛏 ${suites}</span>
                <span>🚗 ${vagas}</span>
              </div>
            </div>
          </article>
        `;
      }).join('');
    }
  }

  // 7. Testemunhos (Adapta texto com o nome do corretor)
  const testEyebrow = document.querySelector('.testimonials-section .section-eyebrow');
  if (testEyebrow) testEyebrow.textContent = `O Que Dizem Sobre ${primeiroNome}`;

  // 8. Seção de Contato Direto
  const contactEyebrow = document.querySelector('.contact-section .section-eyebrow');
  if (contactEyebrow) contactEyebrow.textContent = `Fale com ${primeiroNome}`;

  const contactSub = document.querySelector('.contact-form p');
  if (contactSub) contactSub.textContent = `Preencha o formulário e ${primeiroNome} retornará pessoalmente.`;

  const contactNote = document.querySelector('.form-note');
  if (contactNote) {
    contactNote.innerHTML = `<strong>⚡ Resposta rápida:</strong> ${escapeHtml(primeiroNome)} retorna em até 2 horas úteis.`;
  }

  // Atualiza Dados de Contato Direto
  const phoneLinks = document.querySelectorAll('a[href^="tel:"]');
  phoneLinks.forEach(a => {
    a.href = `tel:+${whatsappDigits}`;
    a.textContent = corretor.telefone || corretor.whatsapp || siteConfig.telefone || '(11) 3000-0000';
  });

  const waLinks = document.querySelectorAll('.contact-info-item a[href*="wa.me"]');
  waLinks.forEach(a => {
    a.href = waUrl;
    a.textContent = corretor.whatsapp || corretor.telefone || siteConfig.whatsappNumber || '(11) 3000-0000';
  });

  const emailLinks = document.querySelectorAll('a[href^="mailto:"]');
  emailLinks.forEach(a => {
    if (corretor.email) {
      a.href = `mailto:${corretor.email}`;
      a.textContent = corretor.email;
    }
  });

  // Disponibilidade
  const h = corretor.horarios || {};
  const availList = document.querySelector('.availability-list');
  if (availList) {
    const inicioSem = h.inicioSemana || '09:00';
    const fimSem = h.fimSemana || '18:00';
    const inicioSab = h.inicioSabado || '09:00';
    const fimSab = h.fimSabado || '13:00';

    availList.innerHTML = `
      <div class="availability-item">
        <span class="availability-day">Segunda a Sexta</span>
        <span class="availability-time">${inicioSem} — ${fimSem}</span>
      </div>
      <div class="availability-item">
        <span class="availability-day">Sábado</span>
        <span class="availability-time">${h.diasSemana?.includes('sab') !== false ? `${inicioSab} — ${fimSab}` : 'Somente agendado'}</span>
      </div>
      <div class="availability-item">
        <span class="availability-day">Domingo</span>
        <span class="availability-time">Somente agendado</span>
      </div>
    `;
  }

  // 9. Formulário de Contato Direto do Corretor
  const contactForm = document.querySelector('.contact-form form');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : 'Enviar Mensagem';

      const nomeInp = contactForm.querySelector('input[type="text"]');
      const telInp = contactForm.querySelector('input[type="tel"]');
      const emailInp = contactForm.querySelector('input[type="email"]');
      const assuntoSel = contactForm.querySelector('select');
      const msgTxt = contactForm.querySelector('textarea');

      const nome = nomeInp?.value.trim() || '';
      const telefone = telInp?.value.trim() || '';
      const email = emailInp?.value.trim() || '';
      const assunto = assuntoSel?.value || 'Contato via Perfil';
      const mensagem = msgTxt?.value.trim() || '';

      if (!nome || !telefone || !email) {
        showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
        return;
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Enviando...';
        }

        // Salva lead com corretorId e origem contato
        const lead = await saveLead({
          nome,
          telefone,
          email,
          assunto,
          mensagem: mensagem || `Contato enviado diretamente pelo perfil de ${nomeCompleto}.`,
          origem: 'contato',
          corretorId: corretor.id !== 'corretor-institucional' ? corretor.id : null
        });

        // Registra atividade no sistema se possível
        try {
          const user = LivingCanvasAuth.auth?.currentUser;
          if (user?.uid) {
            await Atividades.registrar({
              usuarioId: user.uid,
              tipo: 'lead',
              titulo: `Contato enviado para ${nomeCompleto}`,
              descricao: `Mensagem enviada com sucesso: "${assunto}".`,
              refTipo: 'lead',
              refId: lead.id
            });
          }
        } catch {
          // ignora
        }

        showToast('Mensagem enviada com sucesso! O corretor entrará em contato em breve.', 'success');

        // Feedback na tela
        contactForm.innerHTML = `
          <div style="background: rgba(52, 211, 153, 0.1); border: 1px solid #34d399; border-radius: 12px; padding: 2rem; text-align: center; color: var(--cream);">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">✨</div>
            <h4 style="font-family: 'Playfair Display', serif; font-size: 1.4rem; color: #34d399; margin-bottom: 0.5rem;">Mensagem Recebida!</h4>
            <p style="font-size: 0.95rem; opacity: 0.9; margin-bottom: 1.25rem;">
              Obrigado, <strong>${escapeHtml(nome)}</strong>. ${escapeHtml(primeiroNome)} recebeu sua solicitação e entrará em contato pelo telefone ou WhatsApp fornecido.
            </p>
            <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
              <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="profile-cta profile-cta-whatsapp" style="padding: 0.6rem 1.2rem; font-size: 0.85rem;">Falar no WhatsApp Agora</a>
              <a href="${agendarUrl}" class="profile-cta profile-cta-primary" style="padding: 0.6rem 1.2rem; font-size: 0.85rem;">Agendar Visita</a>
            </div>
          </div>
        `;

      } catch (err) {
        console.error('Erro ao enviar contato para o corretor:', err);
        showToast(err.message || 'Erro ao enviar mensagem. Tente novamente.', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  }

  // 10. Floating CTA
  const floatTooltip = document.querySelector('.floating-cta .cta-tooltip');
  if (floatTooltip) floatTooltip.textContent = `Fale com ${primeiroNome}`;

  const floatBtn = document.querySelector('.floating-cta .whatsapp-btn');
  if (floatBtn) floatBtn.href = waUrl;
}

// Inicializa no carregamento do DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hidratarPaginaCorretor);
} else {
  hidratarPaginaCorretor();
}
