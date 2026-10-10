/* ================= MODO SUPERVISOR (App de seguimiento) =================
   Solo se carga cuando quien ha iniciado sesión es el supervisor del plan (sync.js lo detecta y
   app.js carga este archivo). Usa los datos y los cálculos de la App de Martina, pero con sus
   propias pestañas: Ahora · Calendario · Tareas · Análisis · Historial · Config. No cambia nada
   del plan (las reglas de Firestore tampoco se lo permitirían).
   Fase 1: las pestañas y Config (cuenta e idioma); el contenido de las demás llega por fases
   (ver el punto 7 bis del dossier). */
(function(){
  var ICONS = {
    now: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    cal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 2v4"/><path d="M16 2v4"/>',
    tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    stats: '<line x1="6" y1="20" x2="6" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="14"/>',
    log: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'
  };
  // phase: fase en la que llega el contenido de la pestaña
  var TABS = [
    { id: 'now', phase: 2 }, { id: 'cal', phase: 2 }, { id: 'tasks', phase: 2 },
    { id: 'stats', phase: 4 }, { id: 'log', phase: 3 }, { id: 'config' }
  ];

  document.body.classList.add('is-supervisor');
  var main = document.querySelector('main.screen-container');
  var nav = document.createElement('nav');
  nav.className = 'tabbar sup-tabbar';
  nav.setAttribute('data-i18n-aria', 'aria.nav');
  TABS.forEach(function(tab){
    nav.insertAdjacentHTML('beforeend',
      '<button class="tab" data-screen="sup-' + tab.id + '" data-title="sup.' + tab.id + '" data-sub="sup.' + tab.id + 'Sub" onclick="showScreen(this)">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[tab.id] + '</svg>' +
        '<span data-i18n="sup.' + tab.id + '"></span></button>');
    var sec = document.createElement('section');
    sec.className = 'screen';
    sec.id = 'screen-sup-' + tab.id;
    sec.setAttribute('aria-labelledby', 'screen-heading');
    sec.innerHTML = tab.phase
      ? '<div class="config-card sup-soon"><p class="card-hint" data-sup-soon="' + tab.phase + '"></p></div>'
      : '<div class="config-card" id="sup-account"></div><div class="config-card" id="sup-lang"></div>';
    main.appendChild(sec);
  });
  main.parentNode.insertBefore(nav, main.nextSibling);

  // Config: la cuenta (la dibuja renderAccount en #account-body) y el idioma: se traen aquí de la Config de la App
  var account = document.getElementById('account-body');
  if(account){ document.getElementById('sup-account').replaceWith(account); }
  var lang = document.getElementById('lang-select');
  if(lang){ document.getElementById('sup-lang').appendChild(lang.closest('.config-line')); }

  function texts(){
    document.querySelectorAll('[data-sup-soon]').forEach(function(p){
      var n = +p.getAttribute('data-sup-soon');
      p.textContent = t(n === 3 ? 'sup.soonLog' : 'sup.soon', { n: n });
    });
    nav.setAttribute('aria-label', t('aria.nav'));
    nav.querySelectorAll('[data-i18n]').forEach(function(s){ s.textContent = t(s.getAttribute('data-i18n')); });
    var active = nav.querySelector('.tab.is-active');
    if(active){ setScreenHeading(active); }
  }
  // Al cambiar de idioma se vuelven a escribir los textos del modo supervisor
  var applyI18nBase = window.applyI18n;
  if(typeof applyI18nBase === 'function'){
    window.applyI18n = function(){ applyI18nBase.apply(this, arguments); texts(); };
  }

  if(typeof window.renderAccount === 'function'){ window.renderAccount(); }
  showScreen(nav.querySelector('.tab'));
  texts();
})();
