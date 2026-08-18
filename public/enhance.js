/* ============================================================
   Enhancement layer: sidebar, icon replacement, motion, ⌘K
   Idempotent — safe to include on every page.
   ============================================================ */
(function () {
  if (typeof window === 'undefined') return;
  if (window.__lcEnhanceLoaded) return;
  window.__lcEnhanceLoaded = true;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- SVG icon library (lucide-inspired, inline) ---------- */
  const ICONS = {
    menu:      '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/>',
    close:     '<path d="M6 6l12 12M18 6L6 18"/>',
    home:      '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    building:  '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01"/>',
    map:       '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
    pin:       '<path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    tree:      '<path d="M12 3l4 6h-2l3 5h-2l3 5H8l3-5H9l3-5H10z"/><line x1="12" y1="19" x2="12" y2="22"/>',
    launch:    '<path d="M5 13l4 4L19 7"/><path d="M12 3v4M4 12H0M20 12h4"/>',
    heart:     '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z"/>',
    star:      '<polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/>',
    diamond:   '<path d="M6 3h12l4 6-10 12L2 9z"/>',
    sparkle:   '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    search:    '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    bed:       '<path d="M2 18v-6a2 2 0 0 1 2-2h9a4 4 0 0 1 4 4v4"/><path d="M2 18h20v2H2z"/><circle cx="6" cy="12" r="2"/>',
    bath:      '<path d="M4 12V6a2 2 0 0 1 4 0"/><path d="M2 12h20v3a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="21" x2="6" y2="19"/><line x1="18" y1="21" x2="18" y2="19"/>',
    ruler:     '<path d="M3 17l14-14 4 4L7 21z"/><path d="M7 7l2 2M10 4l2 2M13 7l2 2M16 10l2 2"/>',
    car:       '<path d="M5 13l2-5h10l2 5"/><path d="M3 17h18v-4H3z"/><circle cx="7" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/>',
    coffee:    '<path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M16 9h2a2 2 0 0 1 0 4h-2"/><line x1="6" y1="3" x2="6" y2="5"/><line x1="10" y1="3" x2="10" y2="5"/>',
    sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:      '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    wave:      '<path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M2 18c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/>',
    cloud:     '<path d="M17 18a4 4 0 0 0 0-8 6 6 0 0 0-11.7 1.5A3.5 3.5 0 0 0 6 18z"/>',
    lock:      '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    key:       '<circle cx="8" cy="15" r="4"/><path d="M11 15l9-9M17 8l2 2"/>',
    shield:    '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    chat:      '<path d="M4 5h16v11H8l-4 4z"/>',
    mail:      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    phone:     '<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19 19 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 2.9a2 2 0 0 1-.5 2L8 9.8a16 16 0 0 0 6.2 6.2l1.2-1.2a2 2 0 0 1 2-.5c.9.3 1.9.5 2.9.6a2 2 0 0 1 1.7 2z"/>',
    calendar:  '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
    clock:     '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user:      '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users:     '<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0"/><circle cx="17" cy="8" r="3"/><path d="M14.5 14a6 6 0 0 1 7.5 6"/>',
    handshake: '<path d="M11 17l-2 2-3-3 6-6 3 3-2 2 4 4 3-3-8-8H5L3 10"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    file:      '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    edit:      '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
    check:     '<path d="M4 12l5 5L20 6"/>',
    cross:     '<path d="M6 6l12 12M18 6L6 18"/>',
    eye:       '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    hidden:    '<path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0 1 22 12s-1 2-3 4M6 6c-2 1.7-4 6-4 6s3.5 7 10 7c2 0 3.7-.6 5-1.4"/>',
    bell:      '<path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    bulb:      '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10c1 1 2 2 2 4h4c0-2 1-3 2-4a6 6 0 0 0-4-10z"/>',
    fire:      '<path d="M12 3s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 1-3 0 2 1 3 2 3-1-3 1-6 1-8z"/>',
    trophy:    '<path d="M8 3h8v5a4 4 0 0 1-8 0z"/><path d="M4 5h4v2a4 4 0 0 1-4-2z"/><path d="M20 5h-4v2a4 4 0 0 0 4-2z"/><path d="M10 13v3H8v2h8v-2h-2v-3"/>',
    medal:     '<circle cx="12" cy="15" r="5"/><path d="M8 3l4 6M16 3l-4 6"/>',
    chart:     '<line x1="4" y1="20" x2="20" y2="20"/><path d="M6 16l4-6 4 3 4-8"/>',
    graph:     '<line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="12" width="3" height="8"/><rect x="11" y="8" width="3" height="12"/><rect x="16" y="14" width="3" height="6"/>',
    money:     '<circle cx="12" cy="12" r="9"/><path d="M15 9a3 3 0 0 0-3-2c-2 0-3 1-3 2s1 2 3 2 3 1 3 2-1 2-3 2a3 3 0 0 1-3-2"/><line x1="12" y1="5" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="19"/>',
    card:      '<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    computer:  '<rect x="2" y="4" width="20" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/>',
    monitor:   '<rect x="3" y="4" width="18" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/>',
    camera:    '<path d="M4 8h4l2-3h4l2 3h4v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    photo:     '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-6-6-8 8"/>',
    palette:   '<path d="M12 3a9 9 0 1 0 0 18c1 0 2-1 2-2s-1-2-1-3 1-2 2-2h2a4 4 0 0 0 4-4 9 9 0 0 0-9-7z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>',
    theatre:   '<path d="M4 5h16v6a8 8 0 0 1-16 0z"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/>',
    film:      '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/><line x1="3" y1="12" x2="21" y2="12"/>',
    pool:      '<path d="M2 15c2-1 4 1 6 0s4-1 6 0 4 1 6 0"/><path d="M2 19c2-1 4 1 6 0s4-1 6 0 4 1 6 0"/><path d="M7 12V6a2 2 0 0 1 2-2M17 12V6a2 2 0 0 0-2-2"/>',
    running:   '<circle cx="15" cy="4" r="2"/><path d="M8 20l3-6 3 2 2-3 2 4"/><path d="M4 12l4-2 3 4"/>',
    door:      '<rect x="6" y="3" width="12" height="18" rx="1"/><circle cx="15" cy="12" r="1"/>',
    hospital:  '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 8v8M8 12h8"/>',
    museum:    '<path d="M3 10l9-6 9 6"/><line x1="3" y1="20" x2="21" y2="20"/><path d="M6 20V11M10 20V11M14 20V11M18 20V11"/>',
    shopping:  '<path d="M6 7h12l-1 12H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    plate:     '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
    utensils:  '<path d="M5 3v8a2 2 0 0 0 4 0V3"/><line x1="7" y1="11" x2="7" y2="21"/><path d="M17 3c-2 1-3 3-3 6s1 4 3 4v8"/>',
    wine:      '<path d="M8 3h8l-1 6a3 3 0 0 1-6 0z"/><line x1="12" y1="12" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/>',
    beer:      '<rect x="6" y="6" width="10" height="14" rx="1"/><rect x="16" y="9" width="3" height="8" rx="1"/>',
    bus:       '<rect x="4" y="5" width="16" height="12" rx="2"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/><line x1="4" y1="12" x2="20" y2="12"/>',
    train:     '<rect x="5" y="4" width="14" height="14" rx="4"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/><path d="M8 22l2-3M16 22l-2-3"/>',
    walk:      '<circle cx="13" cy="4" r="2"/><path d="M10 22l2-8 3 2 2-4 3 3"/>',
    globe:     '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    scale:     '<line x1="12" y1="3" x2="12" y2="21"/><path d="M4 8l4-4 4 4M16 12l4-4 4 4"/><path d="M4 8l4 8h-8zM16 12l4 8h-8z"/>',
    graduation:'<path d="M12 3l10 5-10 5L2 8z"/><path d="M6 10v5a6 6 0 0 0 12 0v-5"/>',
    book:      '<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><line x1="8" y1="7" x2="15" y2="7"/>',
    scroll:    '<path d="M6 3h11a3 3 0 0 1 3 3v0a2 2 0 0 1-2 2H5"/><path d="M5 8v11a2 2 0 0 0 2 2h11a3 3 0 0 0 3-3v0a2 2 0 0 0-2-2H6"/>',
    gear:      '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4.9a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 2.6a7 7 0 0 0-1.7 1l-2.4-.9-2 3.5 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1l-2 1.5 2 3.5 2.4-.9a7 7 0 0 0 1.7 1l.3 2.6h5l.3-2.6a7 7 0 0 0 1.7-1l2.4.9 2-3.5-2-1.5a7 7 0 0 0 .1-1z"/>',
    telescope: '<path d="M3 15l7-3 3 7-7 3z"/><path d="M13 12l6-2 2 5-6 2"/><line x1="10" y1="19" x2="7" y2="22"/>',
    brain:     '<path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0-2 3v2a3 3 0 0 0 2 3v1a3 3 0 0 0 3 3h.5V3z"/><path d="M15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 2 3v2a3 3 0 0 1-2 3v1a3 3 0 0 1-3 3h-.5V3z"/>',
    question:  '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7"/><line x1="12" y1="17" x2="12" y2="17.5"/>',
    mute:      '<polygon points="4 9 8 9 13 5 13 19 8 15 4 15"/><line x1="17" y1="9" x2="21" y2="13"/><line x1="21" y1="9" x2="17" y2="13"/>',
    sound:     '<polygon points="4 9 8 9 13 5 13 19 8 15 4 15"/><path d="M17 8a5 5 0 0 1 0 8"/>',
    play:      '<polygon points="6 4 20 12 6 20 6 4"/>',
    refresh:   '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><polyline points="20 4 20 10 14 10"/>',
    save:      '<path d="M5 3h11l3 3v15H5z"/><rect x="8" y="14" width="8" height="7"/><rect x="8" y="3" width="8" height="5"/>',
    folder:    '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    id:        '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M5 18a4 4 0 0 1 8 0"/><line x1="15" y1="10" x2="19" y2="10"/><line x1="15" y1="14" x2="19" y2="14"/>',
    wheel:     '<circle cx="12" cy="12" r="9"/><line x1="4" y1="18" x2="20" y2="6"/>',
    wave2:     '<path d="M3 12c3-4 6-4 9 0s6 4 9 0"/>',
    paw:       '<circle cx="6" cy="10" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><circle cx="18" cy="10" r="2"/><path d="M8 18a4 4 0 0 1 8 0 3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z"/>',
    plant:     '<path d="M12 21V10"/><path d="M12 10c0-3-2-5-6-5 0 4 2 6 6 6z"/><path d="M12 10c0-3 2-5 6-5 0 4-2 6-6 6z"/>',
    dog:       '<path d="M6 8l2-4 3 2 2-2 3 2 2 4-2 8H8z"/><circle cx="10" cy="12" r="1"/><circle cx="14" cy="12" r="1"/>',
    accessible:'<circle cx="12" cy="4" r="2"/><path d="M12 8v6l4 6"/><path d="M8 14a5 5 0 1 0 6 6"/>',
    hand:      '<path d="M9 11V4a1.5 1.5 0 1 1 3 0v7"/><path d="M12 11V3a1.5 1.5 0 1 1 3 0v8"/><path d="M15 11V5a1.5 1.5 0 1 1 3 0v9a6 6 0 0 1-6 6H9l-4-6 2-2 3 2V6a1.5 1.5 0 1 1 3 0v5"/>',
    star2:     '<polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/>',
    rocket:    '<path d="M5 15c-1 3 0 4 3 5-1-3 0-4 3-5"/><path d="M12 3s7 3 7 10c0 0-3 0-5 2l-4-4c2-2 2-5 2-5z"/>',
    fullscreen:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    hamburger: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
    arrow:     '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/>',
    external:  '<path d="M14 3h7v7"/><line x1="10" y1="14" x2="21" y2="3"/><path d="M20 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6"/>'
  };

  function svg(name, extraClass) {
    const body = ICONS[name];
    if (!body) return '';
    return '<svg class="lc-ic ' + (extraClass || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  }

  /* ---------- Emoji → icon mapping ---------- */
  const EMOJI_MAP = {
    '🏠': 'home', '🏢': 'building', '🏛': 'museum', '🏥': 'hospital',
    '🏙': 'building', '🛏': 'bed', '🛁': 'bath', '🛋': 'plate',
    '📍': 'pin', '🗺': 'map', '🌐': 'globe', '🌇': 'sun', '🌙': 'moon',
    '☀': 'sun', '🌧': 'cloud', '🌊': 'wave', '🌳': 'tree', '🌴': 'tree',
    '🌿': 'plant', '🌟': 'star', '⭐': 'star', '★': 'star', '☆': 'star',
    '✨': 'sparkle', '💎': 'diamond', '🔍': 'search', '🔎': 'search',
    '❤': 'heart', '❤️': 'heart', '♥': 'heart', '♡': 'heart', '❤️‍🔥': 'heart',
    '🔒': 'lock', '🔑': 'key', '🛡': 'shield',
    '💬': 'chat', '📧': 'mail', '✉': 'mail', '📞': 'phone',
    '📅': 'calendar', '🕐': 'clock', '⏰': 'clock',
    '👤': 'user', '👥': 'users', '👨': 'user', '👩': 'user', '👧': 'user', '👋': 'hand',
    '🤝': 'handshake', '💼': 'briefcase',
    '📁': 'folder', '📄': 'file', '📋': 'file', '📝': 'edit', '✏': 'edit',
    '✓': 'check', '✔': 'check', '✗': 'cross', '❌': 'cross',
    '👁': 'eye', '🙈': 'hidden', '🔔': 'bell', '💡': 'bulb',
    '🔥': 'fire', '🏆': 'trophy', '🏅': 'medal',
    '📊': 'chart', '📈': 'chart', '💰': 'money', '💳': 'card',
    '💻': 'computer', '🖥': 'monitor', '📷': 'camera', '📸': 'photo',
    '🎨': 'palette', '🎭': 'theatre', '🎬': 'film', '🎥': 'film',
    '🏊': 'pool', '🏃': 'running', '🚪': 'door',
    '🛍': 'shopping', '🍽': 'plate', '🍴': 'utensils', '🍳': 'utensils',
    '🍷': 'wine', '🍺': 'beer', '☕': 'coffee',
    '🚗': 'car', '🚌': 'bus', '🚇': 'train', '🚶': 'walk',
    '⚖': 'scale', '🎓': 'graduation', '📖': 'book', '📘': 'book', '📜': 'scroll',
    '⚙': 'gear', '🔭': 'telescope', '🧠': 'brain', '❓': 'question',
    '🔇': 'mute', '🔊': 'sound', '🎯': 'star', '⚡': 'sparkle',
    '🔄': 'refresh', '💾': 'save', '📐': 'ruler', '📏': 'ruler',
    '🐕': 'dog', '🐾': 'paw', '♿': 'accessible', '🚀': 'rocket',
    '🪪': 'id', '⛶': 'fullscreen', '☰': 'hamburger', '→': 'arrow'
  };

  // Build a regex from the mapping keys
  const emojiKeys = Object.keys(EMOJI_MAP).sort((a, b) => b.length - a.length);
  const EMOJI_RE = new RegExp('(' + emojiKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gu');

  function replaceEmojiInTextNodes(root) {
    if (!root) return;
    const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE']);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !EMOJI_RE.test(node.nodeValue)) { EMOJI_RE.lastIndex = 0; return NodeFilter.FILTER_REJECT; }
        EMOJI_RE.lastIndex = 0;
        let p = node.parentNode;
        while (p && p.nodeType === 1) {
          if (skip.has(p.tagName)) return NodeFilter.FILTER_REJECT;
          if (p.classList && p.classList.contains('lc-no-icon')) return NodeFilter.FILTER_REJECT;
          if (p.matches && p.matches('a[href*="wa.me"], a[href*="whatsapp"], a[href*="api.whatsapp.com"], .whatsapp-btn, .whatsapp-float, #whatsappFloat, .card-btn-whatsapp, .cta-whatsapp, .quick-whatsapp, .profile-cta-whatsapp, .expert-cta, .uni-cta')) return NodeFilter.FILTER_REJECT;
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n; while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(node => {
      const html = node.nodeValue.replace(EMOJI_RE, (m) => {
        const iconName = EMOJI_MAP[m];
        return iconName ? svg(iconName) : '';
      });
      if (html !== node.nodeValue) {
        const span = document.createElement('span');
        span.className = 'lc-iconized';
        span.innerHTML = html;
        node.parentNode.replaceChild(span, node);
      }
    });
  }

  /* ---------- Top Dropdown Navigation Bar ---------- */
  function buildTopNavigationDropdowns() {
    const navbar = document.querySelector('#navbar, nav#navbar, header.navbar, .site-header');
    if (!navbar) return;

    // Remove any old nav-links, nav-cta, nav-menu-btn or sidebar triggers
    navbar.querySelectorAll('.nav-cta, .nav-links, ul.nav-links, .nav-menu-btn, .lc-side-trigger').forEach(el => el.remove());
    document.querySelectorAll('.lc-side, .lc-side-scrim, .lc-side-trigger').forEach(el => el.remove());

    if (navbar.querySelector('.top-nav-dropdowns')) return;

    const navContainer = document.createElement('div');
    navContainer.className = 'top-nav-dropdowns';

    navContainer.innerHTML = `
      <div class="top-nav-item">
        <button type="button" class="top-nav-link">
          <span>Imóveis</span>
          <svg class="chevron-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="top-nav-menu top-nav-menu-mega">
          <div>
            <div class="top-nav-group-title">Catálogo & Opções</div>
            <a href="imoveis.html" class="top-nav-sublink">
              <div class="top-nav-sublink-icon">${svg('building')}</div>
              <div>
                <div class="top-nav-sublink-title">Todos os Imóveis</div>
                <div class="top-nav-sublink-desc">Casas, aps e coberturas exclusivas</div>
              </div>
            </a>
            <a href="lancamentos.html" class="top-nav-sublink">
              <div class="top-nav-sublink-icon">${svg('launch')}</div>
              <div>
                <div class="top-nav-sublink-title">Lançamentos</div>
                <div class="top-nav-sublink-desc">Projetos na planta e novidades</div>
              </div>
            </a>
            <a href="imovel.html" class="top-nav-sublink">
              <div class="top-nav-sublink-icon">${svg('door')}</div>
              <div>
                <div class="top-nav-sublink-title">Ficha do Imóvel</div>
                <div class="top-nav-sublink-desc">Visualização detalhada e galeria</div>
              </div>
            </a>
          </div>
          <div>
            <div class="top-nav-group-title">Ferramentas de Busca</div>
            <a href="mapa.html" class="top-nav-sublink">
              <div class="top-nav-sublink-icon">${svg('map')}</div>
              <div>
                <div class="top-nav-sublink-title">Mapa Interativo</div>
                <div class="top-nav-sublink-desc">Busque por localização geográfica</div>
              </div>
            </a>
            <a href="comparador.html" class="top-nav-sublink">
              <div class="top-nav-sublink-icon">${svg('scale')}</div>
              <div>
                <div class="top-nav-sublink-title">Comparador de Imóveis</div>
                <div class="top-nav-sublink-desc">Análise comparativa lado a lado</div>
              </div>
            </a>
          </div>
        </div>
      </div>

      <div class="top-nav-item">
        <button type="button" class="top-nav-link">
          <span>Bairros</span>
          <svg class="chevron-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="top-nav-menu">
          <a href="bairros.html" class="top-nav-sublink">
            <div class="top-nav-sublink-icon">${svg('tree')}</div>
            <div>
              <div class="top-nav-sublink-title">Guia de Bairros</div>
              <div class="top-nav-sublink-desc">Jardins, Pinheiros, Itaim e mais</div>
            </div>
          </a>
          <a href="bairro.html" class="top-nav-sublink">
            <div class="top-nav-sublink-icon">${svg('pin')}</div>
            <div>
              <div class="top-nav-sublink-title">Perfil do Bairro</div>
              <div class="top-nav-sublink-desc">Infraestrutura, cultura e estilo</div>
            </div>
          </a>
          <a href="busca-ia.html" class="top-nav-sublink">
            <div class="top-nav-sublink-icon">${svg('sparkle')}</div>
            <div>
              <div class="top-nav-sublink-title">Guia Por Vibe (IA)</div>
              <div class="top-nav-sublink-desc">Descubra o bairro com a sua cara</div>
            </div>
          </a>
        </div>
      </div>

      <div class="top-nav-item">
        <button type="button" class="top-nav-link">
          <span>Serviços</span>
          <svg class="chevron-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="top-nav-menu top-nav-menu-mega">
          <div>
            <div class="top-nav-group-title">Finanças & Vendas</div>
            <a href="financiamento.html" class="top-nav-sublink">
              <div class="top-nav-sublink-icon">${svg('money')}</div>
              <div>
                <div class="top-nav-sublink-title">Simulador de Financiamento</div>
                <div class="top-nav-sublink-desc">Simule parcelas e condições</div>
              </div>
            </a>
            <a href="vender.html" class="top-nav-sublink">
              <div class="top-nav-sublink-icon">${svg('key')}</div>
              <div>
                <div class="top-nav-sublink-title">Vender meu Imóvel</div>
                <div class="top-nav-sublink-desc">Avaliação e anúncio premium</div>
              </div>
            </a>
          </div>
          <div>
            <div class="top-nav-group-title">Atendimento</div>
            <a href="agendar.html" class="top-nav-sublink">
              <div class="top-nav-sublink-icon">${svg('calendar')}</div>
              <div>
                <div class="top-nav-sublink-title">Agendar Visita VIP</div>
                <div class="top-nav-sublink-desc">Atendimento presencial exclusivo</div>
              </div>
            </a>
            <a href="corretor.html" class="top-nav-sublink">
              <div class="top-nav-sublink-icon">${svg('user')}</div>
              <div>
                <div class="top-nav-sublink-title">Falar com Corretor</div>
                <div class="top-nav-sublink-desc">Atendimento rápido e exclusivo</div>
              </div>
            </a>
          </div>
        </div>
      </div>

      <div class="top-nav-item">
        <button type="button" class="top-nav-link">
          <span>Institucional</span>
          <svg class="chevron-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="top-nav-menu">
          <a href="sobre.html" class="top-nav-sublink">
            <div class="top-nav-sublink-icon">${svg('users')}</div>
            <div>
              <div class="top-nav-sublink-title">Sobre a Equipe</div>
              <div class="top-nav-sublink-desc">Conheça a história e conceito</div>
            </div>
          </a>
          <a href="depoimentos.html" class="top-nav-sublink">
            <div class="top-nav-sublink-icon">${svg('heart')}</div>
            <div>
              <div class="top-nav-sublink-title">Depoimentos</div>
              <div class="top-nav-sublink-desc">Avaliações de nossos clientes</div>
            </div>
          </a>
          <a href="faq.html" class="top-nav-sublink">
            <div class="top-nav-sublink-icon">${svg('question')}</div>
            <div>
              <div class="top-nav-sublink-title">Dúvidas Frequentes</div>
              <div class="top-nav-sublink-desc">FAQ & Glossário Imobiliário</div>
            </div>
          </a>
          <a href="contato.html" class="top-nav-sublink">
            <div class="top-nav-sublink-icon">${svg('chat')}</div>
            <div>
              <div class="top-nav-sublink-title">Fale Conosco</div>
              <div class="top-nav-sublink-desc">Nossa matriz e suporte</div>
            </div>
          </a>
        </div>
      </div>

      <div class="top-nav-item">
        <button type="button" class="top-nav-link">
          <span>Área do Cliente</span>
          <svg class="chevron-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="top-nav-menu">
          <a href="dashboard.html" class="top-nav-sublink">
            <div class="top-nav-sublink-icon">${svg('chart')}</div>
            <div>
              <div class="top-nav-sublink-title">Painel / CRM</div>
              <div class="top-nav-sublink-desc">Favoritos, propostas e histórico</div>
            </div>
          </a>
          <a href="login.html" class="top-nav-sublink">
            <div class="top-nav-sublink-icon">${svg('lock')}</div>
            <div>
              <div class="top-nav-sublink-title">Entrar / Cadastrar</div>
              <div class="top-nav-sublink-desc">Acessar ou criar sua conta</div>
            </div>
          </a>
        </div>
      </div>

      <div class="top-nav-item">
        <a href="busca-ia.html" class="top-nav-link" style="color: var(--lc-gold); font-weight: 600;">
          ${svg('sparkle')}
          <span>Busca IA</span>
        </a>
      </div>
    `;

    // Click behavior to open/toggle dropdown menu on click as well as hover
    navContainer.querySelectorAll('.top-nav-item').forEach(item => {
      const linkBtn = item.querySelector('.top-nav-link');
      const menu = item.querySelector('.top-nav-menu');
      if (linkBtn && menu) {
        linkBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const isOpen = item.classList.contains('is-open');
          navContainer.querySelectorAll('.top-nav-item').forEach(i => i.classList.remove('is-open'));
          if (!isOpen) {
            item.classList.add('is-open');
          }
        });
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.top-nav-item')) {
        navContainer.querySelectorAll('.top-nav-item').forEach(i => i.classList.remove('is-open'));
      }
    });

    navbar.appendChild(navContainer);
  }

  /* ---------- Command palette (⌘K / Ctrl+K) ---------- */
  function buildCmdK() {
    if (document.getElementById('lcCmd')) return;
    const scrim = document.createElement('div');
    scrim.className = 'lc-cmd-scrim';
    scrim.id = 'lcCmd';

    const cmd = document.createElement('div');
    cmd.className = 'lc-cmd';
    const items = NAV_ITEMS.filter(x => x.href);
    cmd.innerHTML =
      '<input class="lc-cmd__input" type="text" placeholder="Buscar página, imóvel, bairro..." autocomplete="off" />' +
      '<div class="lc-cmd__list">' +
        items.map((it, i) => (
          '<a class="lc-cmd__item' + (i === 0 ? ' is-active' : '') + '" href="' + it.href + '" data-label="' + it.label.toLowerCase() + '">' +
            svg(it.icon) + '<span>' + it.label + '</span>' +
            '<span class="lc-cmd__hint">' + it.href.replace('.html','') + '</span>' +
          '</a>'
        )).join('') +
      '</div>' +
      '<div class="lc-cmd__foot">' +
        '<span><span class="lc-kbd">↑</span> <span class="lc-kbd">↓</span> navegar</span>' +
        '<span><span class="lc-kbd">↵</span> abrir</span>' +
        '<span><span class="lc-kbd">Esc</span> fechar</span>' +
      '</div>';
    scrim.appendChild(cmd);
    document.body.appendChild(scrim);

    const input = cmd.querySelector('.lc-cmd__input');
    const list = cmd.querySelector('.lc-cmd__list');

    function open() { scrim.classList.add('is-open'); input.value = ''; filter(''); setTimeout(() => input.focus(), 40); }
    function close() { scrim.classList.remove('is-open'); }
    window.lcOpenCmd = open;
    function filter(q) {
      q = q.trim().toLowerCase();
      let firstShown = null;
      list.querySelectorAll('.lc-cmd__item').forEach(el => {
        const match = !q || el.dataset.label.includes(q);
        el.style.display = match ? '' : 'none';
        el.classList.remove('is-active');
        if (match && !firstShown) firstShown = el;
      });
      if (firstShown) firstShown.classList.add('is-active');
    }
    function move(dir) {
      const shown = Array.from(list.querySelectorAll('.lc-cmd__item')).filter(e => e.style.display !== 'none');
      if (!shown.length) return;
      const idx = shown.findIndex(e => e.classList.contains('is-active'));
      shown.forEach(e => e.classList.remove('is-active'));
      const next = shown[(idx + dir + shown.length) % shown.length];
      next.classList.add('is-active');
      next.scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', () => filter(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        const act = list.querySelector('.lc-cmd__item.is-active');
        if (act) location.href = act.getAttribute('href');
      } else if (e.key === 'Escape') close();
    });
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (scrim.classList.contains('is-open')) close(); else open();
      }
    });
  }

  /* ---------- Scroll progress bar ---------- */
  function buildScrollProgress() {
    if (document.getElementById('lcScrollBar')) return;
    const bar = document.createElement('div');
    bar.className = 'lc-scroll-progress';
    bar.id = 'lcScrollBar';
    document.body.appendChild(bar);
    function tick() {
      const h = document.documentElement;
      const pct = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
      bar.style.width = (pct * 100).toFixed(2) + '%';
    }
    window.addEventListener('scroll', tick, { passive: true });
    tick();
  }

  /* ---------- Word-by-word reveal on H1/H2 ---------- */
  function buildWordReveals() {
    if (reduced) return;
    const targets = document.querySelectorAll('h1, h2:not(.lc-no-reveal)');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target;
        el.querySelectorAll('.lc-word').forEach((w, i) => {
          setTimeout(() => w.classList.add('is-in'), i * 55);
        });
        io.unobserve(el);
      });
    }, { threshold: 0.2 });

    targets.forEach(el => {
      if (el.dataset.lcSplit) return;
      // Only split if it has plain text children — skip if already contains SVGs deeply
      const html = el.innerHTML;
      if (/<(img|svg|video|iframe)/i.test(html)) return;
      el.dataset.lcSplit = '1';
      // Split by words while preserving inline <em>/<span>/<br>
      const parts = html.split(/(<[^>]+>)/g);
      const out = parts.map(chunk => {
        if (chunk.startsWith('<')) return chunk;
        return chunk.replace(/(\S+)/g, '<span class="lc-word">$1</span>');
      }).join('');
      el.innerHTML = out;
      io.observe(el);
    });
  }

  /* ---------- Official WhatsApp SVG Logos ---------- */
  const OFFICIAL_WA_SVG = `<svg class="wa-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.447-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.572-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414zM12.004 2.003c-5.518 0-9.998 4.48-9.998 9.998 0 2.158.685 4.156 1.85 5.8l-1.218 4.45 4.562-1.196a9.948 9.948 0 004.804 1.242c5.518 0 9.998-4.48 9.998-9.998 0-5.518-4.48-9.998-9.998-9.998zm0 18.188c-1.605 0-3.13-.435-4.453-1.192l-.319-.184-2.712.711.724-2.643-.202-.321a8.167 8.167 0 01-1.258-4.372c0-4.522 3.68-8.201 8.22-8.201 4.54 0 8.22 3.679 8.22 8.201 0 4.523-3.68 8.201-8.22 8.201z"/></svg>`;

  const OFFICIAL_WA_SVG_LARGE = `<svg class="wa-icon-large" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:block;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.447-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.572-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414zM12.004 2.003c-5.518 0-9.998 4.48-9.998 9.998 0 2.158.685 4.156 1.85 5.8l-1.218 4.45 4.562-1.196a9.948 9.948 0 004.804 1.242c5.518 0 9.998-4.48 9.998-9.998 0-5.518-4.48-9.998-9.998-9.998zm0 18.188c-1.605 0-3.13-.435-4.453-1.192l-.319-.184-2.712.711.724-2.643-.202-.321a8.167 8.167 0 01-1.258-4.372c0-4.522 3.68-8.201 8.22-8.201 4.54 0 8.22 3.679 8.22 8.201 0 4.523-3.68 8.201-8.22 8.201z"/></svg>`;

  /* ---------- Replace generic WhatsApp icons with Official WhatsApp Logo ---------- */
  function enhanceWhatsApp() {
    const selector = [
      'a[href*="wa.me"]',
      'a[href*="whatsapp"]',
      'a[href*="api.whatsapp.com"]',
      '.whatsapp-btn',
      '.whatsapp-float',
      '#whatsappFloat',
      '.card-btn-whatsapp',
      '.cta-whatsapp',
      '.quick-whatsapp',
      '.profile-cta-whatsapp',
      '.expert-cta',
      '.uni-cta'
    ].join(', ');

    document.querySelectorAll(selector).forEach(el => {
      el.classList.add('lc-pulse-ring');
      
      const isFloat = el.classList.contains('whatsapp-btn') || el.classList.contains('whatsapp-float') || el.id === 'whatsappFloat';

      if (isFloat) {
        // Floating circular button: replace all content with large official WhatsApp SVG
        el.innerHTML = OFFICIAL_WA_SVG_LARGE;
      } else {
        // Inline button / CTA:
        // Remove old generic icons or iconized spans
        el.querySelectorAll('.lc-iconized, svg.lc-icon, i[data-lucide], svg:not(.wa-icon)').forEach(oldIcon => oldIcon.remove());
        
        // Remove literal emoji 💬 if present
        if (el.innerHTML.includes('💬')) {
          el.innerHTML = el.innerHTML.replace(/💬\s*/g, '');
        }

        // Add official WhatsApp icon if not present
        if (!el.querySelector('svg.wa-icon')) {
          el.insertAdjacentHTML('afterbegin', OFFICIAL_WA_SVG + ' ');
        }
      }
    });

    // Also target info cards/icons that display WhatsApp text or numbers
    document.querySelectorAll('.info-icon, .contact-info-icon, .info-card-icon').forEach(iconEl => {
      const parent = iconEl.closest('.contact-info-item, .info-card, .info-item, .contact-card, div');
      if (parent && parent.innerText && parent.innerText.toLowerCase().includes('whatsapp')) {
        iconEl.innerHTML = OFFICIAL_WA_SVG;
        iconEl.classList.add('wa-info-icon');
      }
    });
  }

  /* ---------- GSAP LED Contour Light Animation ---------- */
  function ensureGlobalSvgGradients() {
    if (document.getElementById('lc-global-led-defs')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'lc-global-led-defs';
    svg.setAttribute('style', 'position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none;');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `
      <defs>
        <!-- Imóveis (Properties) - Gold / Amber Neon -->
        <linearGradient id="lc-led-grad-property" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fbbf24" />
          <stop offset="50%" stop-color="#f59e0b" />
          <stop offset="100%" stop-color="#d4af7a" />
        </linearGradient>
        <!-- Bairros (Neighborhoods) - Emerald / Mint / Cyan Neon -->
        <linearGradient id="lc-led-grad-neighborhood" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#34d399" />
          <stop offset="50%" stop-color="#10b981" />
          <stop offset="100%" stop-color="#06b6d4" />
        </linearGradient>
      </defs>
    `;
    document.body.appendChild(svg);
  }

  function loadGSAP(callback) {
    if (window.gsap) {
      callback();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
    script.async = true;
    script.onload = () => callback();
    script.onerror = () => {
      console.warn('GSAP could not be loaded from CDN');
    };
    document.head.appendChild(script);
  }

  function initLedContourAnimations() {
    if (!window.gsap) return;
    ensureGlobalSvgGradients();

    const PROPERTY_SELECTORS = [
      '.property-card',
      '.launch-card',
      '.similar-card',
      '.property-list-item',
      '.fav-card',
      '.property-summary',
      '.verdict-property',
      '.featured-launch',
      '.result-card',
      '.property-slot',
      '.visit-property'
    ];

    const NEIGHBORHOOD_SELECTORS = [
      '.neighborhood-card',
      '.poi-card',
      '.neighborhood-item',
      '.neighborhood-block',
      '.neighborhood-mini',
      '.neighborhood-highlights'
    ];

    function setupCard(card, type) {
      if (card.dataset.ledBound) return;
      card.dataset.ledBound = 'true';

      const isProperty = type === 'property';
      card.classList.add(isProperty ? 'lc-led-card-property' : 'lc-led-card-neighborhood');

      const overlay = document.createElement('div');
      overlay.className = 'lc-led-overlay';
      overlay.innerHTML = `
        <svg class="lc-led-svg" xmlns="http://www.w3.org/2000/svg">
          <rect class="lc-led-rect"
            fill="none"
            stroke="url(#${isProperty ? 'lc-led-grad-property' : 'lc-led-grad-neighborhood'})"
            stroke-width="2"
            stroke-linecap="round" />
        </svg>
      `;

      card.appendChild(overlay);

      const svg = overlay.querySelector('.lc-led-svg');
      const rect = overlay.querySelector('.lc-led-rect');

      let tween = null;
      let cardHoverTween = null;
      let lastWidth = 0;
      let lastHeight = 0;

      function updateLedPath() {
        const w = Math.round(card.getBoundingClientRect().width || card.offsetWidth || 300);
        const h = Math.round(card.getBoundingClientRect().height || card.offsetHeight || 200);

        if (w === 0 || h === 0) return;
        if (w === lastWidth && h === lastHeight && tween) return;

        lastWidth = w;
        lastHeight = h;

        const computedStyle = window.getComputedStyle(card);
        let borderRadius = parseFloat(computedStyle.borderRadius) || 16;
        borderRadius = Math.max(4, Math.min(borderRadius, Math.min(w, h) / 2));

        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        rect.setAttribute('x', '1');
        rect.setAttribute('y', '1');
        rect.setAttribute('width', Math.max(0, w - 2));
        rect.setAttribute('height', Math.max(0, h - 2));
        rect.setAttribute('rx', borderRadius);
        rect.setAttribute('ry', borderRadius);

        // Calculate perimeter for precise beam proportions
        const perimeter = Math.round(2 * (w + h));
        const beamLength = Math.max(60, Math.min(160, Math.round(perimeter * 0.16)));
        const gapLength = perimeter - beamLength;

        rect.style.strokeDasharray = `${beamLength} ${gapLength}`;

        if (tween) tween.kill();

        tween = window.gsap.to(rect, {
          strokeDashoffset: -perimeter,
          duration: Math.max(1.8, perimeter / 400),
          repeat: -1,
          ease: "none",
          paused: true
        });
      }

      card.addEventListener('mouseenter', () => {
        updateLedPath();
        card.classList.add('is-led-active');

        if (tween) tween.play();

        if (cardHoverTween) cardHoverTween.kill();
        cardHoverTween = window.gsap.to(card, {
          scale: 1.015,
          y: -4,
          duration: 0.35,
          ease: "power2.out"
        });

        window.gsap.to(overlay, {
          opacity: 1,
          duration: 0.25,
          ease: "power2.out"
        });
      });

      card.addEventListener('mouseleave', () => {
        card.classList.remove('is-led-active');

        if (cardHoverTween) cardHoverTween.kill();
        cardHoverTween = window.gsap.to(card, {
          scale: 1,
          y: 0,
          duration: 0.35,
          ease: "power2.out"
        });

        window.gsap.to(overlay, {
          opacity: 0,
          duration: 0.3,
          ease: "power2.inOut",
          onComplete: () => {
            if (tween) tween.pause();
          }
        });
      });
    }

    function scanAndBind() {
      document.querySelectorAll(PROPERTY_SELECTORS.join(',')).forEach(el => setupCard(el, 'property'));
      document.querySelectorAll(NEIGHBORHOOD_SELECTORS.join(',')).forEach(el => setupCard(el, 'neighborhood'));
    }

    scanAndBind();

    const observer = new MutationObserver(() => scanAndBind());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function initFeaturedCtaAnimations() {
    if (!window.gsap) return;

    function setupCtaButton(button) {
      if (button.dataset.ctaInit) return;
      button.dataset.ctaInit = 'true';

      const shimmer = button.querySelector('.cta-shimmer-bar');
      const arrow = button.querySelector('.cta-arrow-circle');
      const glow = button.querySelector('.cta-glow-bg');

      // Light shimmer animation loop
      if (shimmer) {
        window.gsap.to(shimmer, {
          xPercent: 400,
          duration: 3.4,
          repeat: -1,
          repeatDelay: 2,
          ease: "power2.inOut"
        });
      }

      // Intersection reveal
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              window.gsap.fromTo(button,
                { opacity: 0, y: 30, scale: 0.96 },
                { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" }
              );
              observer.unobserve(button);
            }
          });
        }, { threshold: 0.1 });
        observer.observe(button);
      }

      let hoverTween = null;
      let arrowTween = null;

      button.addEventListener('mouseenter', () => {
        if (hoverTween) hoverTween.kill();
        hoverTween = window.gsap.to(button, {
          scale: 1.03,
          y: -3,
          duration: 0.35,
          ease: "power2.out"
        });

        if (arrow) {
          if (arrowTween) arrowTween.kill();
          arrowTween = window.gsap.to(arrow, {
            x: 4,
            scale: 1.08,
            duration: 0.3,
            ease: "back.out(1.7)"
          });
        }

        if (glow) {
          window.gsap.to(glow, {
            scale: 1.3,
            opacity: 0.32,
            duration: 0.4,
            ease: "power2.out"
          });
        }
      });

      button.addEventListener('mousemove', (e) => {
        const rect = button.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width - 0.5;
        const relY = (e.clientY - rect.top) / rect.height - 0.5;

        // Ultra-subtle 3D tilt for compact button
        window.gsap.to(button, {
          rotationY: relX * 5,
          rotationX: -relY * 5,
          transformPerspective: 600,
          duration: 0.3,
          ease: "power1.out"
        });
      });

      button.addEventListener('mouseleave', () => {
        if (hoverTween) hoverTween.kill();
        hoverTween = window.gsap.to(button, {
          scale: 1,
          y: 0,
          rotationX: 0,
          rotationY: 0,
          duration: 0.4,
          ease: "power2.out"
        });

        if (arrow) {
          if (arrowTween) arrowTween.kill();
          arrowTween = window.gsap.to(arrow, {
            x: 0,
            scale: 1,
            duration: 0.3,
            ease: "power2.out"
          });
        }

        if (glow) {
          window.gsap.to(glow, {
            scale: 1,
            opacity: 0.18,
            duration: 0.4,
            ease: "power2.out"
          });
        }
      });
    }

    document.querySelectorAll('.featured-cta-button').forEach(setupCtaButton);

    const observer = new MutationObserver(() => {
      document.querySelectorAll('.featured-cta-button').forEach(setupCtaButton);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- AI Concierge Chat Widget (Integrated into Vibe Search) ---------- */
  function initAIConciergeChat() {
    // Consolidated into Busca por Vibe console.
  }

  /* ---------- AI Vibe Search Client Integration ---------- */
  function initVibeSearchIntegration() {
    const vibeForm = document.getElementById('vibe-chat-form');
    const vibeInput = document.getElementById('vibe-input');
    const vibeMessages = document.getElementById('vibe-chat-messages');
    const aiSection = document.querySelector('.ai-section');

    const sample1 = document.getElementById('btn-sample-1');
    const sample2 = document.getElementById('btn-sample-2');
    const sample3 = document.getElementById('btn-sample-3');

    const runVibeSearch = async (promptText) => {
      if (!promptText || !promptText.trim()) return;

      // Append user message to chat console
      if (vibeMessages) {
        const userDiv = document.createElement('div');
        userDiv.className = 'vibe-msg user';
        userDiv.textContent = promptText;
        vibeMessages.appendChild(userDiv);

        const botDiv = document.createElement('div');
        botDiv.className = 'vibe-msg bot';
        botDiv.textContent = '✨ Analisando o catálogo e calculando a compatibilidade dos imóveis...';
        vibeMessages.appendChild(botDiv);
        vibeMessages.scrollTop = vibeMessages.scrollHeight;
      }

      if (aiSection) {
        const statusEl = aiSection.querySelector('.ai-status');
        if (statusEl) statusEl.textContent = 'Consultando IA...';
      }

      try {
        const res = await fetch('/api/vibe-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptText })
        });
        const data = await res.json();

        if (data.success) {
          // Update last bot message in chat console
          if (vibeMessages) {
            const lastBotMsg = vibeMessages.querySelector('.vibe-msg.bot:last-child');
            if (lastBotMsg) {
              lastBotMsg.innerHTML = `✨ <strong>Recomendação IA:</strong> ${data.aiSummary || 'Encontramos imóveis altamente compatíveis com seu perfil. Veja as opções abaixo e entre em contato direto pelo WhatsApp!'}`;
            }
            vibeMessages.scrollTop = vibeMessages.scrollHeight;
          }

          // Update priorities
          const tagsContainer = document.querySelector('.ai-insight-block .ai-tags');
          if (tagsContainer && data.extractedPriorities) {
            tagsContainer.innerHTML = data.extractedPriorities.map(p => `
              <span class="ai-tag">${p.name} <span class="ai-tag-confidence">${p.confidence}</span></span>
            `).join('');
          }

          // Update filters
          const filtersContainer = document.querySelector('.ai-filters');
          if (filtersContainer && data.appliedFilters) {
            const f = data.appliedFilters;
            filtersContainer.innerHTML = `
              <div class="ai-filter"><span class="ai-filter-label">Nível de ruído</span><span class="ai-filter-value">${f.noiseLevel || 'Silencioso'}</span></div>
              <div class="ai-filter"><span class="ai-filter-label">Orientação solar</span><span class="ai-filter-value">${f.sunOrientation || 'Norte/Leste'}</span></div>
              <div class="ai-filter"><span class="ai-filter-label">Distância de parques</span><span class="ai-filter-value">${f.parksDistance || 'Até 800m'}</span></div>
              <div class="ai-filter"><span class="ai-filter-label">Walkability</span><span class="ai-filter-value">${f.walkability || 'Alto'}</span></div>
              <div class="ai-filter"><span class="ai-filter-label">Home Office</span><span class="ai-filter-value">${f.homeOfficeSpace || 'Sim'}</span></div>
            `;
          }

          // Update AI Summary
          const summaryEl = document.querySelector('.ai-summary');
          if (summaryEl && data.aiSummary) {
            summaryEl.innerHTML = `✨ ${data.aiSummary}`;
          }

          // Update Results Count
          const countEl = document.querySelector('.results-count');
          if (countEl && data.matches) {
            countEl.innerHTML = `<strong>${data.matches.length} imóveis</strong> com alta compatibilidade`;
          }

          // Update Property Cards with CTA buttons
          const gridEl = document.querySelector('.properties-grid');
          if (gridEl && data.matches && data.matches.length > 0) {
            gridEl.innerHTML = data.matches.map(m => {
              const p = m.property;
              const waText = encodeURIComponent(`Olá! Encontrei o imóvel ${p.title} (${p.neighborhood}) pela Busca por Vibe e gostaria de agendar uma visita.`);
              return `
                <article class="property-card" onclick="window.location.href='imovel.html?id=${p.id}'">
                  <div class="card-image card-image-exterior" style="background-image: url('${p.imageUrl}')"></div>
                  <div class="card-overlay">
                    <div class="card-badges">
                      <span class="card-badge">Exclusivo</span>
                      <span class="match-badge">${m.matchPercentage}% match</span>
                    </div>
                    <span class="card-price">${p.priceFormatted}</span>
                    <h3 class="card-title">${p.title}</h3>
                    <p class="card-location">${p.neighborhood} • ${p.area}m²</p>
                    <div class="card-match-reason">${m.vibeMatchReason}</div>
                    <div class="card-match-tags">
                      ${p.tags.map(t => `<span class="card-match-tag matched">${t}</span>`).join('')}
                    </div>
                    <div class="card-meta">
                      <span>🛏 ${p.bedrooms} suítes</span>
                      <span>🚗 ${p.parking} vagas</span>
                      <span>📐 ${p.area}m²</span>
                    </div>
                    <div class="card-action-btns" onclick="event.stopPropagation();">
                      <a href="imovel.html?id=${p.id}" class="card-btn-details">
                        🔍 Ver Detalhes
                      </a>
                      <a href="https://wa.me/5511999999999?text=${waText}" target="_blank" class="card-btn-whatsapp">
                        ${OFFICIAL_WA_SVG} Falar no WhatsApp
                      </a>
                    </div>
                  </div>
                </article>
              `;
            }).join('');
            enhanceWhatsApp();
          }

          if (aiSection) {
            const statusEl = aiSection.querySelector('.ai-status');
            if (statusEl) statusEl.textContent = 'Análise concluída';
          }
        }
      } catch (e) {
        console.error('Vibe search failed:', e);
        if (vibeMessages) {
          const lastBotMsg = vibeMessages.querySelector('.vibe-msg.bot:last-child');
          if (lastBotMsg) {
            lastBotMsg.textContent = 'Ocorreu um problema ao conectar com a IA. Por favor, tente novamente.';
          }
        }
      }
    };

    if (vibeForm) {
      vibeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (vibeInput) {
          const promptVal = vibeInput.value;
          runVibeSearch(promptVal);
        }
      });
    }

    if (sample1) {
      sample1.addEventListener('click', () => {
        const text = 'Quero uma casa aconchegante com jardim privativo, silêncio absoluto para trabalhar e pet-friendly no Jardim Europa.';
        if (vibeInput) vibeInput.value = text;
        runVibeSearch(text);
      });
    }

    if (sample2) {
      sample2.addEventListener('click', () => {
        const text = 'Busco um loft moderno com pé-direito alto, perto de cafés artesanais e galerias de arte na Vila Madalena.';
        if (vibeInput) vibeInput.value = text;
        runVibeSearch(text);
      });
    }

    if (sample3) {
      sample3.addEventListener('click', () => {
        const text = 'Procuro uma cobertura duplex de alto padrão no Itaim Bibi com terraço privativo, vista linda e espaço gourmet.';
        if (vibeInput) vibeInput.value = text;
        runVibeSearch(text);
      });
    }

    // Auto-trigger search if query parameter exists in URL
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get('q') || urlParams.get('prompt') || urlParams.get('vibe');
    if (initialQuery && initialQuery.trim()) {
      if (vibeInput) vibeInput.value = initialQuery;
      runVibeSearch(initialQuery);
    }
  }

  /* ---------- AI Compare Verdict Client Integration ---------- */
  function initCompareVerdictIntegration() {
    const verdictGrid = document.querySelector('.verdict-grid');
    if (!verdictGrid) return;

    const runCompareVerdict = async () => {
      try {
        const res = await fetch('/api/compare-verdict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyIds: ["casa-do-bosque", "loft-horizonte", "penthouse-urbano", "studio-artistico"] })
        });
        const data = await res.json();

        if (data.success && data.verdicts) {
          verdictGrid.innerHTML = data.verdicts.map((v, i) => `
            <div class="verdict-card ${i === 0 ? 'winner-card' : ''}">
              <span class="verdict-badge">${v.badge}</span>
              <div class="verdict-icon">${v.icon}</div>
              <h3 class="verdict-title">${v.title}</h3>
              <p class="verdict-subtitle">${v.subtitle}</p>
              <p class="verdict-reason">${v.reason}</p>
            </div>
          `).join('');
        }
      } catch (e) {
        console.error('Compare verdict failed:', e);
      }
    };

    runCompareVerdict();
  }

  /* ---------- Init ---------- */
  function init() {
    try { buildTopNavigationDropdowns(); } catch(e) { console.warn('topnav', e); }
    try { buildCmdK(); } catch(e) { console.warn('cmdk', e); }
    try { buildScrollProgress(); } catch(e) {}
    try { replaceEmojiInTextNodes(document.body); } catch(e) { console.warn('icons', e); }
    try { buildWordReveals(); } catch(e) {}
    try { enhanceWhatsApp(); } catch(e) {}
    try { initAIConciergeChat(); } catch(e) { console.warn('aichat', e); }
    try { initVibeSearchIntegration(); } catch(e) { console.warn('vibesearch', e); }
    try { initCompareVerdictIntegration(); } catch(e) { console.warn('compareverdict', e); }

    loadGSAP(() => {
      try { initLedContourAnimations(); } catch(e) { console.warn('led animations', e); }
      try { initFeaturedCtaAnimations(); } catch(e) { console.warn('cta animations', e); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


