/**
 * Living Canvas - Home Page Interactive Map Module
 * Integração com dados do Firestore (coleção 'imoveis') e mapa interativo Leaflet
 */

import LivingCanvasProperties from './properties.js';

// Coordenadas geográficas base dos bairros e regiões de Valença-RJ
const NEIGHBORHOOD_COORDS = {
  "centro": [-22.2447, -43.7014],
  "chacrinha": [-22.2390, -43.6890],
  "belo horizonte": [-22.2520, -43.7140],
  "vila esperanca": [-22.2360, -43.7150],
  "vila esperança": [-22.2360, -43.7150],
  "parque pentagna": [-22.2560, -43.6910],
  "pq. pentagna": [-22.2560, -43.6910],
  "bom retiro": [-22.2300, -43.7050],
  "jardim europa": [-22.2480, -43.7080],
  "aparecida": [-22.2410, -43.7030],
  "biquinha": [-22.2430, -43.6980],
  "sao jose das palmeiras": [-22.2510, -43.6950],
  "são josé das palmeiras": [-22.2510, -43.6950],
  "valença": [-22.2447, -43.7014],
  "itaim bibi": [-22.2520, -43.7140],
  "vila madalena": [-22.2390, -43.6890],
  "pinheiros": [-22.2360, -43.7150],
  "riviera": [-22.2560, -43.6910]
};

const DEFAULT_MAP_CENTER = [-22.2447, -43.7014];
const DEFAULT_MAP_ZOOM = 14;

let homeMap = null;
let radiusCircle = null;
let allFirestoreProperties = [];
let displayedMarkers = {};
let currentBairroFilter = 'todos';
let currentTypeFilter = 'todos';
let currentRadiusKm = 8;

/**
 * Função utilitária de hash para leve dispersão de marcadores com mesmo bairro
 */
function pseudoHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Resolve as coordenadas geográficas de um imóvel
 */
function getPropertyCoordinates(property) {
  // 1. Coordenadas explícitas no documento
  if (property.coordenadas && typeof property.coordenadas.lat === 'number' && typeof property.coordenadas.lng === 'number') {
    return [property.coordenadas.lat, property.coordenadas.lng];
  }
  if (typeof property.lat === 'number' && typeof property.lng === 'number') {
    return [property.lat, property.lng];
  }

  // 2. Coordenadas mapeadas por bairro
  const bairroRaw = (property.endereco?.bairro || property.bairro || '').trim().toLowerCase();
  const baseCoord = NEIGHBORHOOD_COORDS[bairroRaw] || DEFAULT_MAP_CENTER;

  // Aplica leve dispersão para que múltiplos imóveis no mesmo bairro não fiquem exatamente sobrepostos
  const seed = pseudoHash(String(property.id || property.titulo || 'seed'));
  const deltaLat = ((seed % 100) - 50) * 0.00007;
  const deltaLng = (((seed >> 2) % 100) - 50) * 0.00007;

  return [baseCoord[0] + deltaLat, baseCoord[1] + deltaLng];
}

/**
 * Formata valores para o pin de mapa
 */
function formatShortPrice(val) {
  if (typeof val !== 'number' || isNaN(val)) return 'Sob Consulta';
  if (val >= 1000000) {
    const m = (val / 1000000).toFixed(1).replace('.0', '').replace('.', ',');
    return `R$ ${m}M`;
  }
  if (val >= 1000) {
    return `R$ ${Math.round(val / 1000)}k`;
  }
  return `R$ ${val}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Calcula a distância em km entre dois pontos geográficos (fórmula de Haversine)
 */
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Inicializa o mapa Leaflet
 */
export async function initHomeMap() {
  const mapElement = document.getElementById('homeLeafletMap');
  if (!mapElement) return;

  if (typeof L === 'undefined') {
    console.warn('Leaflet ainda não carregado, aguardando...');
    setTimeout(initHomeMap, 200);
    return;
  }

  // Evita re-inicialização
  if (homeMap) {
    homeMap.invalidateSize();
    return;
  }

  // Cria a instância do mapa com centro em Valença-RJ
  homeMap = L.map('homeLeafletMap', {
    center: DEFAULT_MAP_CENTER,
    zoom: DEFAULT_MAP_ZOOM,
    zoomControl: true,
    scrollWheelZoom: false // Evita interceptar scroll acidental da página
  });

  // Habilita scroll com clique
  homeMap.on('focus', () => { homeMap.scrollWheelZoom.enable(); });
  homeMap.on('blur', () => { homeMap.scrollWheelZoom.disable(); });

  // Tiles de alta legibilidade (OpenStreetMap)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(homeMap);

  // Círculo de Raio Interativo
  updateRadiusCircle(currentRadiusKm);

  // Carrega os imóveis do Firestore
  await loadFirestoreProperties();
}

/**
 * Carrega a base de imóveis do Firestore via Data Access Layer
 */
async function loadFirestoreProperties() {
  const countEl = document.getElementById('homeMapCount');
  if (countEl) countEl.textContent = 'Carregando imóveis...';

  try {
    // Busca os imóveis com status disponível diretamente do Firestore
    allFirestoreProperties = await LivingCanvasProperties.getProperties({ status: 'disponivel' });
    
    // Adiciona coordenadas a cada imóvel
    allFirestoreProperties = allFirestoreProperties.map(prop => {
      const coords = getPropertyCoordinates(prop);
      return {
        ...prop,
        _coords: coords,
        _distKm: getDistanceFromLatLonInKm(DEFAULT_MAP_CENTER[0], DEFAULT_MAP_CENTER[1], coords[0], coords[1])
      };
    });

    renderMapMarkersAndList();
  } catch (err) {
    console.error('Erro ao carregar imóveis do Firestore para o mapa:', err);
    if (countEl) countEl.textContent = '0 imóveis';
  }
}

/**
 * Atualiza o círculo visual do raio de busca
 */
function updateRadiusCircle(km) {
  if (!homeMap) return;

  if (radiusCircle) {
    homeMap.removeLayer(radiusCircle);
  }

  radiusCircle = L.circle(DEFAULT_MAP_CENTER, {
    radius: km * 1000,
    color: '#d4af7a',
    weight: 1.5,
    fillColor: '#d4af7a',
    fillOpacity: 0.07,
    interactive: false
  }).addTo(homeMap);
}

/**
 * Filtra e renderiza marcadores e lista lateral
 */
function renderMapMarkersAndList() {
  if (!homeMap) return;

  // Limpa marcadores anteriores
  Object.values(displayedMarkers).forEach(m => homeMap.removeLayer(m));
  displayedMarkers = {};

  // Aplica filtros
  const filtered = allFirestoreProperties.filter(prop => {
    // 1. Filtro por Bairro
    if (currentBairroFilter !== 'todos') {
      const propBairro = (prop.endereco?.bairro || prop.bairro || '').toLowerCase();
      const targetBairro = currentBairroFilter.toLowerCase();
      if (!propBairro.includes(targetBairro) && !targetBairro.includes(propBairro)) {
        return false;
      }
    }

    // 2. Filtro por Tipo de Imóvel
    if (currentTypeFilter !== 'todos') {
      const propTipo = (prop.tipo || '').toLowerCase();
      if (propTipo !== currentTypeFilter.toLowerCase()) {
        return false;
      }
    }

    // 3. Filtro por Raio de Distância
    if (typeof prop._distKm === 'number' && prop._distKm > currentRadiusKm) {
      return false;
    }

    return true;
  });

  // Atualiza contador
  const countEl = document.getElementById('homeMapCount');
  if (countEl) {
    countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'imóvel' : 'imóveis'}`;
  }

  // Renderiza marcadores no mapa
  filtered.forEach(prop => {
    const [lat, lng] = prop._coords;
    const shortPrice = formatShortPrice(prop.preco);
    const fullPrice = LivingCanvasProperties.formatFullCurrency(prop.preco);
    const imgUrl = prop.imagens && prop.imagens[0] ? prop.imagens[0] : 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80';
    const bairroText = prop.endereco?.bairro || prop.bairro || 'Valença';
    const areaText = prop.caracteristicas?.areaM2 ? `${prop.caracteristicas.areaM2}m²` : '';
    const quartosText = prop.caracteristicas?.quartos ? `${prop.caracteristicas.quartos} qts` : '';

    const customIcon = L.divIcon({
      className: 'lc-home-pin-wrap',
      html: `
        <div class="lc-home-pin" id="pin_${prop.id}">
          <span style="font-size: 0.85rem;">🏡</span>
          <span>${shortPrice}</span>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });

    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(homeMap);

    const popupHtml = `
      <div style="width: 260px; overflow: hidden; font-family: 'Inter', sans-serif;">
        <div style="height: 140px; background-image: url('${imgUrl}'); background-size: cover; background-position: center; position: relative;">
          ${prop.tag ? `<span style="position: absolute; top: 10px; left: 10px; background: rgba(10,46,42,0.85); color: #d4af7a; font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 4px; border: 1px solid #d4af7a;">${escapeHtml(prop.tag)}</span>` : ''}
        </div>
        <div style="padding: 1rem;">
          <h4 style="color: #f5f1e8; font-size: 1.05rem; font-family: 'Playfair Display', serif; margin: 0 0 0.3rem 0; font-weight: 600;">${escapeHtml(prop.titulo)}</h4>
          <p style="color: #d4af7a; font-size: 0.8rem; margin: 0 0 0.4rem 0;">📍 ${escapeHtml(bairroText)} ${areaText ? `• ${areaText}` : ''}</p>
          <div style="font-size: 1.15rem; font-weight: 700; color: #f5f1e8; margin-bottom: 0.8rem;">${fullPrice}</div>
          <div style="display: flex; gap: 0.5rem;">
            <a href="imovel.html?id=${prop.id}" style="flex: 1; background: #d4af7a; color: #0a2e2a; text-decoration: none; text-align: center; padding: 0.5rem 0.6rem; border-radius: 6px; font-weight: 700; font-size: 0.78rem;">Ver Imóvel</a>
            <a href="agendar.html?id=${prop.id}" style="flex: 1; background: rgba(245,241,232,0.1); color: #f5f1e8; border: 1px solid rgba(245,241,232,0.2); text-decoration: none; text-align: center; padding: 0.5rem 0.6rem; border-radius: 6px; font-size: 0.78rem;">Agendar</a>
          </div>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml, { maxWidth: 280, minWidth: 260, offset: [0, -10] });

    marker.on('popupopen', () => {
      document.querySelectorAll('.lc-home-pin').forEach(el => el.classList.remove('is-active'));
      const pinEl = document.getElementById(`pin_${prop.id}`);
      if (pinEl) pinEl.classList.add('is-active');

      // Rola a lista lateral para o card correspondente
      const cardEl = document.getElementById(`card_prop_${prop.id}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        document.querySelectorAll('.home-map-card-item').forEach(c => c.style.borderColor = 'var(--glass-border)');
        cardEl.style.borderColor = 'var(--gold)';
      }
    });

    marker.on('popupclose', () => {
      const pinEl = document.getElementById(`pin_${prop.id}`);
      if (pinEl) pinEl.classList.remove('is-active');
      const cardEl = document.getElementById(`card_prop_${prop.id}`);
      if (cardEl) cardEl.style.borderColor = 'var(--glass-border)';
    });

    displayedMarkers[prop.id] = marker;
  });

  // Renderiza a lista lateral de cartões
  const cardsContainer = document.getElementById('homeMapCardsList');
  if (!cardsContainer) return;

  if (filtered.length === 0) {
    cardsContainer.innerHTML = `
      <div style="padding: 2.5rem 1rem; text-align: center; color: var(--gold-soft);">
        <p style="font-size: 1.8rem; margin-bottom: 0.5rem;">🔍</p>
        <p style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.3rem;">Nenhum imóvel nesta região</p>
        <p style="font-size: 0.8rem; color: var(--text-light);">Aumente o raio de busca ou selecione outro bairro.</p>
      </div>
    `;
    return;
  }

  cardsContainer.innerHTML = filtered.map(prop => {
    const fullPrice = LivingCanvasProperties.formatFullCurrency(prop.preco);
    const imgUrl = prop.imagens && prop.imagens[0] ? prop.imagens[0] : 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&q=80';
    const bairroText = prop.endereco?.bairro || prop.bairro || 'Valença';
    const quartos = prop.caracteristicas?.quartos ? `${prop.caracteristicas.quartos} quartos` : '';
    const area = prop.caracteristicas?.areaM2 ? `${prop.caracteristicas.areaM2}m²` : '';

    return `
      <div class="home-map-card-item" id="card_prop_${prop.id}" onclick="window.focusHomeMapProperty('${prop.id}')" style="background: rgba(10, 46, 42, 0.85); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.85rem; cursor: pointer; display: flex; gap: 0.85rem; transition: all 0.25s;">
        <div style="width: 85px; height: 85px; border-radius: 8px; background-image: url('${imgUrl}'); background-size: cover; background-position: center; flex-shrink: 0;"></div>
        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;">
          <h4 style="color: var(--cream); font-size: 0.95rem; font-family: 'Playfair Display', serif; margin: 0 0 0.2rem 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(prop.titulo)}</h4>
          <p style="color: var(--gold); font-size: 0.78rem; margin: 0 0 0.35rem 0;">📍 ${escapeHtml(bairroText)} ${area ? `• ${area}` : ''}</p>
          <div style="font-size: 0.95rem; font-weight: 700; color: var(--cream);">${fullPrice}</div>
          <div style="font-size: 0.72rem; color: var(--text-light); margin-top: 0.2rem;">${quartos}</div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Foca um imóvel no mapa e abre o balão popup
 */
window.focusHomeMapProperty = function(propertyId) {
  const marker = displayedMarkers[propertyId];
  if (!marker || !homeMap) return;

  homeMap.flyTo(marker.getLatLng(), 16, { duration: 0.9 });
  marker.openPopup();
};

/**
 * Filtro por bairro
 */
window.filterHomeMapByBairro = function(bairro, btnElement) {
  currentBairroFilter = bairro;

  document.querySelectorAll('.home-map-pill').forEach(btn => {
    btn.classList.remove('active');
  });
  if (btnElement) {
    btnElement.classList.add('active');
  }

  // Se for um bairro específico, ajusta a câmera do mapa para as coordenadas do bairro
  if (bairro !== 'todos') {
    const bLower = bairro.toLowerCase();
    const coord = NEIGHBORHOOD_COORDS[bLower];
    if (coord && homeMap) {
      homeMap.flyTo(coord, 15, { duration: 0.8 });
    }
  } else if (homeMap) {
    homeMap.flyTo(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, { duration: 0.8 });
  }

  renderMapMarkersAndList();
};

/**
 * Filtro por tipo de imóvel
 */
window.filterHomeMapByType = function(tipo) {
  currentTypeFilter = tipo;
  renderMapMarkersAndList();
};

/**
 * Atualização do raio de busca em quilômetros
 */
window.updateHomeMapRadius = function(km) {
  currentRadiusKm = parseFloat(km) || 8;
  const label = document.getElementById('homeMapRadiusVal');
  if (label) label.textContent = `${currentRadiusKm} km`;

  updateRadiusCircle(currentRadiusKm);
  renderMapMarkersAndList();
};

// Auto-inicialização quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHomeMap);
} else {
  initHomeMap();
}

window.LivingCanvasHomeMap = {
  initHomeMap,
  filterHomeMapByBairro: window.filterHomeMapByBairro,
  filterHomeMapByType: window.filterHomeMapByType,
  updateHomeMapRadius: window.updateHomeMapRadius,
  focusHomeMapProperty: window.focusHomeMapProperty
};

export default window.LivingCanvasHomeMap;
