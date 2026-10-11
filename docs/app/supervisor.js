/* ================= MODO SUPERVISOR (App de seguimiento) =================
   Solo se carga cuando quien ha iniciado sesión es el supervisor del plan (sync.js lo detecta y
   app.js carga este archivo). Usa los datos y los cálculos de la App de Martina, pero con sus
   propias pestañas: Ahora · Calendario · Tareas · Análisis · Historial · Config. No cambia nada
   del plan (las reglas de Firestore tampoco se lo permitirían): los botones que cambian algo no
   se ven (styles.css, body.is-supervisor).
   - Ahora (fase 2): qué tiene Martina en este momento y lo siguiente, la barra del día y la lista de hoy.
   - Calendario y Tareas (fase 2): las pantallas de la App, de solo lectura, con lo trabajado sobre lo
     planificado, el ✓ en el momento en que se marcó cada tarea y, en la ficha, planificado, trabajado,
     lo que falta y la antelación con que se hizo (lo añade app.js cuando IS_SUPERVISOR).
   - Análisis (fase 4) e Historial (fase 3): por llegar.
   - Config: la cuenta y el idioma. */
(function(){
  var ICONS = {
    now: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    cal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 2v4"/><path d="M16 2v4"/>',
    tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    stats: '<line x1="6" y1="20" x2="6" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="14"/>',
    log: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'
  };
  // screen: pantalla de la App que se usa tal cual (de solo lectura); phase: fase en la que llega
  var TABS = [
    { id: 'now' }, { id: 'cal', screen: 'calendar' }, { id: 'tasks', screen: 'tasks' },
    { id: 'stats', phase: 4 }, { id: 'log', phase: 3 }, { id: 'config' }
  ];

  document.body.classList.add('is-supervisor');
  // Las pestañas de la App se quitan (no solo se ocultan): así los botones «volver» de las fichas
  // encuentran las del supervisor
  var old = document.querySelector('.tabbar');
  if(old){ old.remove(); }
  var main = document.querySelector('main.screen-container');
  var nav = document.createElement('nav');
  nav.className = 'tabbar sup-tabbar';
  TABS.forEach(function(tab){
    var screen = tab.screen || 'sup-' + tab.id;
    nav.insertAdjacentHTML('beforeend',
      '<button class="tab" data-screen="' + screen + '" data-title="sup.' + tab.id + '" data-sub="sup.' + tab.id + 'Sub" onclick="showScreen(this)">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[tab.id] + '</svg>' +
        '<span data-i18n="sup.' + tab.id + '"></span></button>');
    if(tab.screen){ return; }
    var sec = document.createElement('section');
    sec.className = 'screen';
    sec.id = 'screen-' + screen;
    sec.setAttribute('aria-labelledby', 'screen-heading');
    sec.innerHTML = tab.id === 'now' ? '<div id="sup-now-body" class="sup-now"></div>'
      : tab.phase ? '<div class="config-card sup-soon"><p class="card-hint" data-sup-soon="' + tab.phase + '"></p></div>'
      : '<div class="config-card" id="sup-account"></div><div class="config-card" id="sup-lang"></div>';
    main.appendChild(sec);
  });
  // Fichas de actividades y eventos (desde Ahora o el Calendario): pestañas ocultas
  ['activities', 'events'].forEach(function(s){
    nav.insertAdjacentHTML('beforeend', '<button class="tab sup-hidden-tab" hidden data-screen="' + s + '" data-title="tab.' + s + '" data-sub="sub.' + s + '" onclick="showScreen(this)"></button>');
  });
  main.parentNode.insertBefore(nav, main.nextSibling);

  // Al abrir una ficha de actividad o evento, la pestaña de la que se viene sigue marcada
  var showScreenBase = window.showScreen;
  window.showScreen = function(btn){
    var prev = nav.querySelector('.tab.is-active:not(.sup-hidden-tab)');
    showScreenBase(btn);
    if(btn.classList.contains('sup-hidden-tab') && prev){ prev.classList.add('is-active'); }
    if(btn.dataset.screen === 'sup-now'){ renderNow(); }
  };

  // Config: la cuenta (la dibuja renderAccount en #account-body) y el idioma: se traen aquí de la Config de la App
  var account = document.getElementById('account-body');
  if(account){ document.getElementById('sup-account').replaceWith(account); }
  var lang = document.getElementById('lang-select');
  if(lang){ document.getElementById('sup-lang').appendChild(lang.closest('.config-line')); }

  /* ---- Ahora ---- */
  // Lo que hay hoy: cole, sesiones de actividades, eventos, bloques de trabajo y entregas de tareas.
  // { kind, ref, title, s, e (null en las entregas), place, done, block }
  function dayItems(){
    var d = TODAY_DATE, iso = isoOf(d), wd = weekdayOf(d), out = [], sc = schoolForDate(d);
    if(sc.on){ out.push({ kind: 'school', title: t('sup.school'), s: toHours(sc.entry), e: toHours(sc.exit) }); }
    USER_ACTS.forEach(function(a){
      a.sessions.filter(function(x){ return x.day === wd && sessionOn(a, x, iso); }).forEach(function(x){
        out.push({ kind: 'activity', ref: a.id, title: a.name, s: toHours(x.start), e: toHours(x.end), place: a.place });
      });
    });
    USER_EVENTS.filter(function(e){ return e.date === iso; }).forEach(function(e){
      var h = toHours(e.time);
      out.push({ kind: 'event', ref: e.id, title: e.name, s: h, e: h + (e.dur || 60) / 60, place: e.place });
    });
    liveBlocks().filter(function(o){ return o.b.date === iso; }).forEach(function(o){
      out.push({ kind: 'block', ref: o.x.key, title: o.x.name, s: o.b.start, e: o.b.end, block: true,
                 logged: isLogged(o.b) ? o.b.logged : null, manual: !!o.b.manual, done: o.x.done });
    });
    allTasks().filter(function(x){ return x.due && isoOf(x.due) === iso; }).forEach(function(x){
      out.push({ kind: 'task', ref: x.key, title: x.name, s: x.due.getHours() + x.due.getMinutes() / 60, e: null, done: x.done });
    });
    return out.sort(function(p, q){ return p.s - q.s || (p.e == null) - (q.e == null); });
  }
  function kindLabel(it){
    if(it.kind === 'block'){ return t(it.manual ? 'work.manual' : 'block.label'); }
    if(it.kind === 'task'){ return t('sup.due'); }
    if(it.kind === 'school'){ return ''; }
    return t(it.kind === 'activity' ? 'sup.kAct' : 'sup.kEvt');
  }
  function timeText(it){ return it.e == null ? fmtHour(it.s) : fmtHour(it.s) + '–' + fmtHour(it.e); }
  function openAttr(it){
    if(it.kind === 'school'){ return ''; }
    var kind = it.kind === 'block' ? 'task' : it.kind;
    return ' role="button" tabindex="0" onclick="supOpen(\'' + kind + '\', \'' + it.ref + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){ event.preventDefault(); supOpen(\'' + kind + '\', \'' + it.ref + '\'); }"';
  }
  // Abre la ficha en su pantalla, con «‹ Volver a Ahora»
  window.supOpen = function(kind, id){
    var sc = KIND_SCREEN[kind];
    nav.querySelector('.tab[data-screen="' + sc[0] + '"]').click();
    DETAIL_BACK = { label: t('sup.backNow'), fn: "supBackNow('" + sc[1] + "')", go: function(){ window.supBackNow(sc[1]); } };
    if(kind === 'activity'){ openActivity(id); } else if(kind === 'event'){ openEvent(id); } else { openTask(id); }
  };
  window.supBackNow = function(f){
    showView(f, 'list');
    nav.querySelector('.tab[data-screen="sup-now"]').click();
  };
  function card(label, it, extra){
    if(!it){ return '<div class="sup-card is-empty"><div class="sup-eyebrow">' + label + '</div><div class="sup-big">' + esc(extra) + '</div></div>'; }
    var sub = [timeText(it), kindLabel(it), it.place].filter(Boolean).map(esc).join(' · ');
    return '<div class="sup-card' + (it.kind === 'school' ? '' : ' is-open') + '"' + openAttr(it) + '>' +
      '<div class="sup-eyebrow">' + label + (extra ? ' · ' + esc(extra) : '') + '</div>' +
      '<div class="sup-big">' + (it.done ? '✓ ' : '') + esc(it.title) + '</div><div class="sup-sub">' + sub + '</div></div>';
  }
  function renderNow(){
    var box = document.getElementById('sup-now-body');
    if(!box){ return; }
    var items = dayItems(), b = dayBounds(), lo = toHours(b.start), hi = toHours(b.end);
    // Ahora: lo que está en curso (lo más concreto: bloque, evento o actividad antes que el cole)
    var cur = items.filter(function(it){ return it.e != null && it.s <= NOW && NOW < it.e; })
      .sort(function(p, q){ return (p.kind === 'school') - (q.kind === 'school'); })[0];
    var next = items.filter(function(it){ return it.s > NOW && !(it.kind === 'task' && it.done); })[0];
    var h = card(t('sup.nowLabel'), cur, cur ? '' : t('sup.free')) +
      card(t('sup.nextLabel'), next, next ? t('today.in', { t: untilText(next.s) }) : t('sup.nothingNext'));
    // Barra del día (franja horaria de Config): tramos, entregas y la hora actual
    var pct = function(x){ return Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100)); };
    h += '<div class="sup-dayline" aria-hidden="true"><div class="sup-track">' + items.map(function(it){
        if(it.e == null){ return '<i class="sup-tick' + (it.done ? ' is-done' : '') + '" style="left:' + pct(it.s) + '%"></i>'; }
        return '<i class="sup-seg k-' + it.kind + '" style="left:' + pct(it.s) + '%;width:' + Math.max(0.8, pct(it.e) - pct(it.s)) + '%"></i>';
      }).join('') + (NOW >= lo && NOW <= hi ? '<i class="sup-nowline" style="left:' + pct(NOW) + '%"></i>' : '') + '</div>' +
      '<div class="sup-scale"><span>' + fmtHour(lo) + '</span><span>' + fmtHour(hi) + '</span></div></div>';
    // Todo lo de hoy, con lo pasado atenuado
    h += '<h3 class="sup-h">' + t('sup.todayList') + '</h3>' + (items.length ? '<ul class="sup-list">' + items.map(function(it){
      var past = (it.e != null ? it.e : it.s) <= NOW, extra = '';
      if(it.kind === 'block' && it.logged != null){ extra = t('prog.logged', { t: it.logged ? fmtEst(it.logged) : '0 min' }); }
      else if(it.kind === 'block' && past){ extra = t('sup.unlogged'); }
      return '<li class="sup-row k-' + it.kind + (past ? ' is-past' : '') + (it.kind === 'school' ? '' : ' is-open') + '"' + openAttr(it) + '>' +
        '<span class="sup-row-time">' + timeText(it) + '</span>' +
        '<span class="sup-row-main"><span class="sup-row-title">' + (it.done ? '✓ ' : '') + esc(it.title) + '</span>' +
        '<span class="sup-row-sub">' + [kindLabel(it), it.place, extra].filter(Boolean).map(esc).join(' · ') + '</span></span></li>';
    }).join('') + '</ul>' : '<p class="card-hint">' + t('today.empty') + '</p>');
    box.innerHTML = h;
  }
  // Cada minuto la App redibuja «Hoy»; aquí, también «Ahora»
  var renderTodayBase = window.renderToday;
  window.renderToday = function(){ renderTodayBase.apply(this, arguments); if(document.getElementById('screen-sup-now').classList.contains('active')){ renderNow(); } };

  function texts(){
    document.querySelectorAll('[data-sup-soon]').forEach(function(p){
      var n = +p.getAttribute('data-sup-soon');
      p.textContent = t(n === 3 ? 'sup.soonLog' : 'sup.soon', { n: n });
    });
    nav.setAttribute('aria-label', t('aria.nav'));
    nav.querySelectorAll('[data-i18n]').forEach(function(s){ s.textContent = t(s.getAttribute('data-i18n')); });
    var active = nav.querySelector('.tab.is-active');
    if(active){ setScreenHeading(active); }
    renderNow();
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
