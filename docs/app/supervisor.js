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
   - Historial (fase 3): lo que ha hecho y cuándo (plans/{id}/log, lo escribe el servidor), con filtros;
     cada entrada abre su ficha (las tareas eliminadas, desde el archivo). La ficha de cada tarea añade
     su historia.
   - Análisis (fase 4): estado de las tareas e indicadores (analysis.js, que se carga desde aquí).
   - Avisos (fase 5): campana arriba a la derecha con los avisos recibidos (users/{uid}/alerts, los escribe
     el servidor) y, en Config, activar las notificaciones en este móvil y elegir qué avisos llegan.
     Al pulsar una notificación, la App se abre con ?open=task:… y va a esa ficha.
   - Mensajes (fase 6): el sobre de arriba abre la pantalla de mensajes: escribir (con atajos «¿Cómo vas?»,
     «¡Bien hecho!», «Propongo un evento:») y ver los enviados con su estado (enviado · visto · respondido).
     Desde la ficha de una tarea, «Enviar mensaje sobre esta tarea».
   - Config: la cuenta, los avisos y el idioma. */
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
    { id: 'stats' }, { id: 'log' }, { id: 'config' }
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
      : tab.id === 'log' ? '<div class="sup-filters" id="sup-log-filters" role="radiogroup"></div><div id="sup-log-body"></div>'
      : tab.id === 'stats' ? '<div id="sup-stats-body" class="an-body"></div>'
      : tab.phase ? '<div class="config-card sup-soon"><p class="card-hint" data-sup-soon="' + tab.phase + '"></p></div>'
      : '<div class="config-card" id="sup-account"></div><div class="config-card" id="sup-alerts-cfg"></div><div class="config-card" id="sup-lang"></div>';
    main.appendChild(sec);
  });
  // Fichas de actividades y eventos (desde Ahora o el Calendario) y la lista de avisos: pestañas ocultas
  ['activities', 'events'].forEach(function(s){
    nav.insertAdjacentHTML('beforeend', '<button class="tab sup-hidden-tab" hidden data-screen="' + s + '" data-title="tab.' + s + '" data-sub="sub.' + s + '" onclick="showScreen(this)"></button>');
  });
  nav.insertAdjacentHTML('beforeend', '<button class="tab sup-hidden-tab" hidden data-screen="sup-alerts" data-title="al.title" data-sub="al.sub" onclick="showScreen(this)"></button>');
  nav.insertAdjacentHTML('beforeend', '<button class="tab sup-hidden-tab" hidden data-screen="sup-msgs" data-title="sm.title" data-sub="sm.sub" onclick="showScreen(this)"></button>');
  var msSec = document.createElement('section');
  msSec.className = 'screen'; msSec.id = 'screen-sup-msgs'; msSec.setAttribute('aria-labelledby', 'screen-heading');
  msSec.innerHTML = '<div class="config-card sm-compose" id="sup-compose"></div><div id="sup-msgs-body"></div>';
  main.appendChild(msSec);
  var alSec = document.createElement('section');
  alSec.className = 'screen'; alSec.id = 'screen-sup-alerts'; alSec.setAttribute('aria-labelledby', 'screen-heading');
  alSec.innerHTML = '<div id="sup-alerts-body"></div>';
  main.appendChild(alSec);
  // Campana arriba a la derecha, con el número de avisos sin ver
  document.querySelector('.topbar').insertAdjacentHTML('beforeend',
    '<button type="button" class="sup-bell sup-envelope" id="sup-envelope" onclick="supMessages()"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg><span class="sup-badge" id="sup-msg-badge" hidden></span></button>' +
    '<button type="button" class="sup-bell" id="sup-bell" onclick="supAlerts()"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span class="sup-badge" id="sup-badge" hidden></span></button>');
  main.parentNode.insertBefore(nav, main.nextSibling);

  // Al abrir una ficha de actividad o evento, la pestaña de la que se viene sigue marcada
  var showScreenBase = window.showScreen;
  window.showScreen = function(btn){
    var prev = nav.querySelector('.tab.is-active:not(.sup-hidden-tab)');
    showScreenBase(btn);
    if(btn.classList.contains('sup-hidden-tab') && prev){ prev.classList.add('is-active'); }
    if(btn.dataset.screen === 'sup-now'){ renderNow(); }
    if(btn.dataset.screen === 'sup-log' && !LOG.loaded){ loadLog(false); }
    if(btn.dataset.screen === 'sup-stats' && window.renderStats){ window.renderStats(); }
    if(btn.dataset.screen === 'sup-config'){ renderAlertCfg(); }
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

  /* ---- Historial ---- */
  var LOG = { items: [], loaded: false, busy: false, end: false, filter: 'all', error: '' };
  var LOG_PAGE = 60;
  var FILTERS = ['all', 'task', 'block', 'item'];
  function filterOf(e){ var k = String(e.type).split('.')[0]; return k === 'event' || k === 'activity' ? 'item' : k; }
  // '2026-10-14 18:00' → 'Mié 14/10 18:00'
  function dueText(v){ if(!v){ return '—'; } var p = String(v).split(' '); return fmtDay(p[0]) + (p[1] ? ' ' + p[1] : ''); }
  function sessionText(v){ var p = String(v || '').split('T'); return p[0] ? fmtDay(p[0]) + (p[1] ? ' ' + p[1] : '') : ''; }
  function plural(base, n){ return t(n === 1 ? base + '1' : base, { n: n }); }
  // Texto de una entrada del historial
  function describe(e){
    // Sin nombre (p. ej. bloques de una tarea recién creada): el nombre actual de la tarea
    var name = e.name || (e.key && (allTasks().filter(function(x){ return x.key === e.key; })[0] || {}).name) || '', v = { name: name };
    switch(e.type){
      case 'task.created': return t('log.taskCreated', v) + (e.due ? ' · ' + t('log.dueIs', { t: dueText(e.due) }) : '') + (e.est ? ' · ' + fmtEst(e.est) : '');
      case 'task.renamed': return t('log.taskRenamed', { a: e.before || '', b: e.after || '' });
      case 'task.due-changed': return t('log.taskDue', v) + ': ' + dueText(e.before) + ' → ' + dueText(e.after);
      case 'task.est-changed': return t('log.taskEst', v) + ': ' + (e.before ? fmtEst(e.before) : '—') + ' → ' + (e.after ? fmtEst(e.after) : '—');
      case 'task.done': return t('log.taskDone', v) + (e.session ? ' (' + sessionText(e.session) + ')' : '');
      case 'task.reopened': return t('log.taskReopened', v) + (e.session ? ' (' + sessionText(e.session) + ')' : '');
      case 'task.deleted': return t('log.taskDeleted', v);
      case 'block.planned': return plural('log.blockPlanned', e.n) + ' (' + fmtEst(e.min || 0) + ') · «' + name + '»';
      case 'block.moved': return plural('log.blockMoved', e.n) + ' · «' + name + '»';
      case 'block.removed': return plural('log.blockRemoved', e.n) + ' · «' + name + '»';
      case 'block.logged': return e.manual ? t('log.workManual', { t: fmtEst(e.min || 0), name: name })
        : t('log.blockLogged', { t: e.min ? fmtEst(e.min) : '0 min', p: fmtEst(e.planned || 0), name: name });
      case 'event.created': return t('log.evtCreated', v) + (e.date ? ' · ' + dueText(e.date + (e.time ? ' ' + e.time : '')) : '');
      case 'event.changed': return t('log.evtChanged', v) + changedText(e);
      case 'event.deleted': return t('log.evtDeleted', v);
      case 'activity.created': return t('log.actCreated', v);
      case 'activity.changed': return t('log.actChanged', v) + changedText(e);
      case 'activity.deleted': return t('log.actDeleted', v);
      case 'activity.skipped': return t('log.actSkipped', v) + ' (' + sessionText(e.session) + ')';
      case 'activity.unskipped': return t('log.actUnskipped', v) + ' (' + sessionText(e.session) + ')';
      case 'plan.tracked': return t('log.tracked');
    }
    return e.type;
  }
  function changedText(e){
    var f = (e.fields || []).filter(function(k){ return k === 'date' || k === 'time'; });
    if(!f.length){ return ''; }
    var b = e.before || {}, a = e.after || {};
    return ': ' + dueText([b.date || a.date, b.time || a.time].join(' ')) + ' → ' + dueText([a.date || b.date, a.time || b.time].join(' '));
  }
  function whenText(d){ return d ? fmtHour(d.getHours() + d.getMinutes() / 60) : ''; }
  function dayTitle(d){
    var iso = isoOf(d), today = isoOf(TODAY_DATE), y = new Date(TODAY_DATE); y.setDate(y.getDate() - 1);
    return iso === today ? t('log.today') : iso === isoOf(y) ? t('log.yesterday') : fmtDay(iso);
  }
  // Lo que abre cada entrada: la tarea (o su archivo, si se eliminó), el evento o la actividad
  function entryOpen(e){
    if(e.key){ return ' role="button" tabindex="0" onclick="supOpenLog(\'task\', \'' + e.key + '\')"'; }
    if(e.id && /^(event|activity)\./.test(e.type)){
      var kind = e.type.split('.')[0], list = kind === 'event' ? USER_EVENTS : USER_ACTS;
      if(list.some(function(x){ return x.id === e.id; })){ return ' role="button" tabindex="0" onclick="supOpenLog(\'' + kind + '\', \'' + e.id + '\')"'; }
    }
    return '';
  }
  window.supOpenLog = function(kind, id){
    var sc = KIND_SCREEN[kind];
    nav.querySelector('.tab[data-screen="' + sc[0] + '"]').click();
    DETAIL_BACK = { label: t('sup.backLog'), fn: "supBackLog('" + sc[1] + "')", go: function(){ window.supBackLog(sc[1]); } };
    if(kind === 'activity'){ openActivity(id); } else if(kind === 'event'){ openEvent(id); }
    else if(allTasks().some(function(x){ return x.key === id; })){ openTask(id); } else { openArchived(id); }
  };
  // Igual, desde cualquier pantalla del supervisor: «‹ Volver a …» (labelKey) a esa pantalla (screen)
  window.supOpenWith = function(kind, id, labelKey, screen){
    var sc = KIND_SCREEN[kind];
    nav.querySelector('.tab[data-screen="' + sc[0] + '"]').click();
    DETAIL_BACK = { label: t(labelKey), fn: "supBackTo('" + sc[1] + "', '" + screen + "')", go: function(){ window.supBackTo(sc[1], screen); } };
    if(kind === 'activity'){ openActivity(id); } else if(kind === 'event'){ openEvent(id); }
    else if(allTasks().some(function(x){ return x.key === id; })){ openTask(id); } else { openArchived(id); }
  };
  window.supBackTo = function(f, screen){
    showView(f, 'list');
    nav.querySelector('.tab[data-screen="' + screen + '"]').click();
  };
  window.supBackLog = function(f){
    showView(f, 'list');
    nav.querySelector('.tab[data-screen="sup-log"]').click();
  };
  function loadLog(more){
    if(LOG.busy){ return; }
    if(!window.syncReadLog || !(window.SYNC && window.SYNC.status === 'in')){ LOG.error = ''; renderLog(); return; }
    LOG.busy = true; renderLog();
    window.syncReadLog(LOG_PAGE, more).then(function(list){
      list = list || [];
      LOG.items = more ? LOG.items.concat(list) : list;
      LOG.end = list.length < LOG_PAGE; LOG.loaded = true; LOG.error = '';
    }).catch(function(e){ LOG.error = String(e && e.code || e); })
      .then(function(){ LOG.busy = false; renderLog(); });
  }
  window.supLogMore = function(){ loadLog(true); };
  window.supLogFilter = function(f){ LOG.filter = f; renderLog(); };
  function renderLog(){
    var fb = document.getElementById('sup-log-filters'), box = document.getElementById('sup-log-body');
    if(!box){ return; }
    fb.innerHTML = FILTERS.map(function(f){
      var on = LOG.filter === f;
      return '<button type="button" class="cat-chip' + (on ? ' is-active' : '') + '" role="radio" aria-checked="' + on + '" onclick="supLogFilter(\'' + f + '\')">' + t('log.f.' + f) + '</button>';
    }).join('');
    if(!LOG.loaded){
      var st = window.SYNC ? window.SYNC.status : 'loading';
      box.innerHTML = '<p class="card-hint">' + (LOG.error ? esc(t('sync.error', { code: LOG.error })) : t(st === 'in' || st === 'loading' ? 'log.loading' : 'log.signIn')) + '</p>';
      return;
    }
    var items = LOG.items.filter(function(e){ return LOG.filter === 'all' || filterOf(e) === LOG.filter || e.type === 'plan.tracked'; });
    var h = '', day = '';
    items.forEach(function(e){
      var d = e.at ? isoOf(e.at) : '';
      if(d !== day){ if(day){ h += '</ul>'; } day = d; h += '<h3 class="sup-h">' + (e.at ? dayTitle(e.at) : '—') + '</h3><ul class="sup-list">'; }
      var open = entryOpen(e);
      h += '<li class="sup-row log-' + filterOf(e) + (open ? ' is-open' : '') + '"' + open + '>' +
        '<span class="sup-row-time">' + whenText(e.at) + '</span><span class="sup-row-main"><span class="sup-row-title log-text">' + esc(describe(e)) + '</span></span></li>';
    });
    if(day){ h += '</ul>'; }
    if(!items.length){ h = '<p class="card-hint">' + t('log.empty') + '</p>'; }
    if(!LOG.end){ h += '<div><button type="button" class="btn-ghost" onclick="supLogMore()"' + (LOG.busy ? ' disabled' : '') + '>' + t(LOG.busy ? 'log.loading' : 'log.more') + '</button></div>'; }
    if(LOG.error){ h += '<p class="card-hint sync-error">' + esc(t('sync.error', { code: LOG.error })) + '</p>'; }
    box.innerHTML = h;
  }
  // Cuando sync.js termina de conectar, se carga el historial si está a la vista
  var renderAccountBase = window.renderAccount;
  window.renderAccount = function(){
    renderAccountBase.apply(this, arguments);
    if(window.SYNC && window.SYNC.status === 'in' && !LOG.loaded && document.getElementById('screen-sup-log').classList.contains('active')){ loadLog(false); }
    if(window.SYNC && window.SYNC.status === 'in' && window.renderStats && document.getElementById('screen-sup-stats').classList.contains('active')){ window.renderStats(); }
    if(window.SYNC && window.SYNC.status === 'in'){
      watchMsgs();
      if(AL.items == null){ loadAlerts(); }
      if(document.getElementById('screen-sup-config').classList.contains('active')){ renderAlertCfg(); }
    }
  };

  /* ---- Historia de cada tarea (en su ficha) y tareas eliminadas (desde el archivo) ---- */
  function historyHtml(list, arch){
    var rows = (list || []).map(function(e){
      return '<li><span class="hist-when">' + (e.at ? fmtDay(isoOf(e.at)) + ' ' + whenText(e.at) : '') + '</span><span>' + esc(describe(e)) + '</span></li>';
    });
    if(arch && arch.existedAt && !(list || []).some(function(e){ return e.type === 'task.created'; })){
      rows.push('<li><span class="hist-when">' + fmtDay(isoOf(arch.existedAt)) + '</span><span>' + esc(t('log.existed')) + '</span></li>');
    }
    return '<div class="detail-card sup-history"><h4>' + t('log.history') + '</h4>' +
      (rows.length ? '<ul>' + rows.join('') + '</ul>' : '<p class="card-hint">' + t('log.noHistory') + '</p>') + '</div>';
  }
  function addHistory(key){
    if(!window.syncTaskLog || !(window.SYNC && window.SYNC.status === 'in')){ return; }
    Promise.all([window.syncTaskLog(key), window.syncArchive(key)]).then(function(r){
      var box = document.getElementById('task-detail');
      // Solo si sigue abierta la ficha de esa tarea
      if(!box || box.hidden || box.dataset.key !== key){ return; }
      var old = box.querySelector('.sup-history');
      if(old){ old.remove(); }
      var after = box.querySelector('.sup-msg-task') || box.querySelector('.detail-card');
      after.insertAdjacentHTML('afterend', historyHtml(r[0], r[1]));
    }).catch(function(){});
  }
  var openTaskBase = window.openTask;
  window.openTask = function(key){
    openTaskBase.apply(this, arguments);
    var box = document.getElementById('task-detail');
    if(box){
      box.dataset.key = key;
      var card = box.querySelector('.detail-card');
      if(card){ card.insertAdjacentHTML('afterend', '<button type="button" class="btn-plan sup-msg-task" onclick="supMessageTask(\'' + key + '\')">' + t('sm.aboutTask') + '</button>'); }
    }
    addHistory(key);
  };
  // Tarea eliminada: su ficha sale del archivo (datos de cuando se eliminó, lo trabajado y su historia)
  function openArchived(key){
    var box = document.getElementById('task-detail');
    box.dataset.key = key;
    Promise.all([window.syncArchive(key), window.syncTaskLog(key)]).then(function(r){
      var a = r[0] || { name: key, blocks: [] }, worked = (a.blocks || []).reduce(function(s, b){ return s + (typeof b.logged === 'number' ? b.logged : 0); }, 0);
      renderDetail('task', {
        title: a.name || '—', prio: 'Media',
        rows: [
          [t('d.origin'), esc(a.from || '')],
          [t('task.dueDate'), dueText(a.due)],
          [t('task.est'), a.est ? fmtEst(a.est) : ''],
          [t('d.status'), t(a.deletedAt ? 'log.deletedOn' : 'status.pending', { t: a.deletedAt ? fmtDay(isoOf(a.deletedAt)) + ' ' + whenText(a.deletedAt) : '' })],
          [t('d.worked'), worked ? fmtEst(worked) : '—'],
          [t('d.blocks'), (a.blocks || []).map(function(b){
            return '<span class="block-line">' + fmtDay(b.date) + ' ' + fmtHour(b.start) + '–' + fmtHour(b.end) + (typeof b.logged === 'number' ? ' <span class="muted">· ' + t('prog.logged', { t: b.logged ? fmtEst(b.logged) : '0 min' }) + (b.manual ? ' · ' + t('work.manual') : '') + '</span>' : '') + '</span>';
          }).join('')]
        ],
        edit: '', del: '', delLabel: ''
      });
      box.querySelector('.detail-head .prio-chip').remove();
      box.querySelector('.detail-card').insertAdjacentHTML('afterend', historyHtml(r[1], a));
    }).catch(function(e){ toast(t('sync.error', { code: e && e.code || e })); });
  }

  /* ---- Avisos: campana y lista ---- */
  var AL = { items: null, busy: false, error: '' };
  function seenAt(){ try{ return +localStorage.getItem('alerts-seen') || 0; }catch(e){ return 0; } }
  function loadAlerts(){
    if(AL.busy || !window.syncReadAlerts || !(window.SYNC && window.SYNC.status === 'in')){ return; }
    AL.busy = true;
    window.syncReadAlerts(80).then(function(l){ AL.items = l || []; AL.error = ''; })
      .catch(function(e){ AL.error = String(e && e.code || e); })
      .then(function(){ AL.busy = false; renderBadge(); if(document.getElementById('screen-sup-alerts').classList.contains('active')){ renderAlerts(); } });
  }
  function renderBadge(){
    var n = (AL.items || []).filter(function(a){ return a.at && a.at.getTime() > seenAt(); }).length, b = document.getElementById('sup-badge');
    b.hidden = !n; b.textContent = n > 9 ? '9+' : n;
    document.getElementById('sup-bell').setAttribute('aria-label', t('al.title') + (n ? ' · ' + n : ''));
  }
  window.supAlerts = function(){
    nav.querySelector('.tab[data-screen="sup-alerts"]').click();
    // Los que eran nuevos al abrir la lista se siguen marcando como nuevos mientras se mira
    try{ sessionStorage.setItem('alerts-prev-seen', String(seenAt())); localStorage.setItem('alerts-seen', String(Date.now())); }catch(e){}
    renderAlerts();
    renderBadge();
    loadAlerts();
  };
  // Abre lo que dice el aviso: task:clave · event:id · now · stats
  function openTarget(open, label, screen){
    var p = String(open || '').split(':'), kind = p.shift(), id = p.join(':');
    if(kind === 'task' || kind === 'event' || kind === 'activity'){ window.supOpenWith(kind, id, label, screen); }
    else if(kind === 'now' || kind === 'stats' || kind === 'log'){ nav.querySelector('.tab[data-screen="sup-' + kind + '"]').click(); }
    else if(kind === 'msgs'){ window.supMessages(); }
  }
  window.supOpenAlert = function(i){ var a = (AL.items || [])[i]; if(a){ openTarget(a.open, 'al.back', 'sup-alerts'); } };
  function renderAlerts(){
    var box = document.getElementById('sup-alerts-body');
    if(!box){ return; }
    if(AL.items == null){ box.innerHTML = '<p class="card-hint">' + (AL.error ? esc(t('sync.error', { code: AL.error })) : t('log.loading')) + '</p>'; return; }
    if(!AL.items.length){ box.innerHTML = '<p class="card-hint">' + t('al.empty') + '</p>'; return; }
    var seen = +(sessionStorage.getItem('alerts-prev-seen') || seenAt());
    box.innerHTML = '<ul class="sup-list">' + AL.items.map(function(a, i){
      var open = a.open ? ' is-open" role="button" tabindex="0" onclick="supOpenAlert(' + i + ')' : '';
      return '<li class="sup-row al-' + esc(a.type) + (a.level ? ' lv-' + a.level : '') + (a.at && a.at.getTime() > seen ? ' is-new' : '') + open + '">' +
        '<span class="sup-row-time">' + (a.at ? fmtDay(isoOf(a.at)) + '<br>' + fmtHour(a.at.getHours() + a.at.getMinutes() / 60) : '') + '</span>' +
        '<span class="sup-row-main"><span class="sup-row-title">' + esc(a.title) + '</span><span class="al-body">' + esc(a.body).replace(/\n/g, '<br>') + '</span></span></li>';
    }).join('') + '</ul>';
  }
  setInterval(loadAlerts, 5 * 60000);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden){ loadAlerts(); } });

  /* ---- Config: avisos ---- */
  var ALERT_TYPES = ['overdue', 'risk', 'dueSoon', 'big', 'noEst', 'unlogged', 'skipped', 'news', 'daily', 'weekly'];
  var CFG = { data: null, push: null, saving: false };
  var DEF = { overdue: true, risk: true, dueSoon: true, big: true, noEst: true, unlogged: true, skipped: true, news: true, daily: true, weekly: true,
              dueHours: [24, 3], amberMargin: 60, bigMin: 180, bigDays: 3, unloggedH: 2 };
  function renderAlertCfg(){
    var box = document.getElementById('sup-alerts-cfg');
    if(!box){ return; }
    if(!(window.SYNC && window.SYNC.status === 'in')){ box.innerHTML = '<span class="field-label">' + t('al.cfgTitle') + '</span><p class="card-hint">' + t('log.loading') + '</p>'; return; }
    if(CFG.data == null){
      box.innerHTML = '<span class="field-label">' + t('al.cfgTitle') + '</span><p class="card-hint">' + t('log.loading') + '</p>';
      Promise.all([window.syncAlertConfig(), window.syncPushState()]).then(function(r){ CFG.data = Object.assign({}, DEF, r[0] || {}); CFG.push = r[1]; renderAlertCfg(); })
        .catch(function(e){ box.innerHTML = '<p class="card-hint sync-error">' + esc(t('sync.error', { code: e && e.code || e })) + '</p>'; });
      return;
    }
    var c = CFG.data, num = function(id, v, step){ return '<input class="txt-input al-num" type="number" inputmode="decimal" min="0" step="' + (step || 1) + '" id="al-' + id + '" value="' + v + '">'; };
    box.innerHTML = '<span class="field-label">' + t('al.cfgTitle') + '</span>' +
      '<div class="al-push"><p class="card-hint">' + t('al.push.' + CFG.push) + '</p>' +
        (CFG.push === 'off' ? '<button type="button" class="btn-primary" onclick="supEnablePush(this)">' + t('al.enable') + '</button>' : '') + '</div>' +
      '<ul class="al-types">' + ALERT_TYPES.map(function(k){
        return '<li><label><input type="checkbox" id="al-t-' + k + '"' + (c[k] ? ' checked' : '') + '> <span>' + t('al.t.' + k) + '</span></label></li>';
      }).join('') + '</ul>' +
      '<div class="al-nums">' +
        '<label>' + t('al.n.dueHours') + '<input class="txt-input" type="text" inputmode="numeric" id="al-dueHours" value="' + esc((c.dueHours || []).join(', ')) + '"></label>' +
        '<label>' + t('al.n.amberMargin') + num('amberMargin', c.amberMargin, 5) + '</label>' +
        '<label>' + t('al.n.bigMin') + num('bigMin', Math.round(c.bigMin / 6) / 10, 0.5) + '</label>' +
        '<label>' + t('al.n.bigDays') + num('bigDays', c.bigDays) + '</label>' +
        '<label>' + t('al.n.unloggedH') + num('unloggedH', c.unloggedH, 0.5) + '</label>' +
      '</div>' +
      '<div><button type="button" class="btn-primary" onclick="supSaveAlertCfg(this)">' + t('btn.save') + '</button></div>';
  }
  window.supEnablePush = function(btn){
    btn.disabled = true;
    window.syncEnablePush().then(function(st){ CFG.push = st; renderAlertCfg(); if(st === 'on'){ toast(t('al.pushOn')); } })
      .catch(function(e){ btn.disabled = false; toast(t('sync.error', { code: e && e.code || e })); });
  };
  window.supSaveAlertCfg = function(btn){
    var c = {}, v = function(id){ return parseFloat(String(document.getElementById('al-' + id).value).replace(',', '.')); };
    ALERT_TYPES.forEach(function(k){ c[k] = document.getElementById('al-t-' + k).checked; });
    c.dueHours = String(document.getElementById('al-dueHours').value).split(/[^0-9.]+/).map(Number).filter(function(h){ return h > 0 && h <= 168; });
    c.amberMargin = Math.max(0, Math.round(v('amberMargin')) || DEF.amberMargin);
    c.bigMin = Math.max(30, Math.round((v('bigMin') || 3) * 60));
    c.bigDays = Math.max(1, Math.round(v('bigDays')) || DEF.bigDays);
    c.unloggedH = Math.max(0.5, v('unloggedH') || DEF.unloggedH);
    btn.disabled = true;
    window.syncSaveAlertConfig(c).then(function(){ CFG.data = Object.assign({}, DEF, c); renderAlertCfg(); toast(t('al.saved')); })
      .catch(function(e){ btn.disabled = false; toast(t('sync.error', { code: e && e.code || e })); });
  };

  /* ---- Mensajes ---- */
  var SM = { list: null, task: null, sending: false };
  var QUICK = ['sm.q.how', 'sm.q.well', 'sm.q.event'];
  window.supMessages = function(task){
    if(task){ SM.task = task; }
    nav.querySelector('.tab[data-screen="sup-msgs"]').click();
    renderCompose(); renderMsgs();
    try{ localStorage.setItem('replies-seen', String(Date.now())); }catch(e){}
    renderMsgBadge();
  };
  // Desde la ficha de una tarea
  window.supMessageTask = function(key){
    var x = allTasks().filter(function(it){ return it.key === key; })[0];
    window.supMessages({ key: key, name: x ? x.name : '' });
  };
  function renderCompose(){
    var box = document.getElementById('sup-compose');
    if(!box){ return; }
    var draft = document.getElementById('sm-text') ? document.getElementById('sm-text').value : '';
    box.innerHTML = '<span class="field-label">' + t('sm.write', { name: KID || '' }) + '</span>' +
      (SM.task ? '<div class="sm-task"><span>' + esc(t('sm.about', { name: SM.task.name })) + '</span><button type="button" class="link-btn" onclick="supMsgNoTask()">' + t('sm.noTask') + '</button></div>' : '') +
      '<div class="sup-filters">' + QUICK.map(function(k){ return '<button type="button" class="cat-chip" onclick="supMsgQuick(\'' + k + '\')">' + t(k) + '</button>'; }).join('') + '</div>' +
      '<textarea class="txt-input sm-text" id="sm-text" rows="3" maxlength="1000" placeholder="' + esc(t('sm.ph')) + '"></textarea>' +
      '<div><button type="button" class="btn-primary" id="sm-send" onclick="supMsgSend()">' + t('msg.send') + '</button></div>' +
      '<p class="card-hint">' + t('sm.hint') + '</p>';
    document.getElementById('sm-text').value = draft;
  }
  window.supMsgNoTask = function(){ SM.task = null; renderCompose(); };
  window.supMsgQuick = function(k){
    var ta = document.getElementById('sm-text'), txt = t(k);
    ta.value = k === 'sm.q.event' ? txt + ' ' : txt;
    ta.focus();
  };
  window.supMsgSend = function(){
    var ta = document.getElementById('sm-text'), v = ta.value.trim();
    if(!v){ ta.focus(); return; }
    if(SM.sending){ return; }
    SM.sending = true; document.getElementById('sm-send').disabled = true;
    window.syncSendMessage({ text: v, taskKey: SM.task && SM.task.key, taskName: SM.task && SM.task.name })
      .then(function(ok){ if(ok){ ta.value = ''; SM.task = null; toast(t('msg.sent')); renderCompose(); } else { toast(t('log.signIn')); } })
      .catch(function(e){ toast(t('sync.error', { code: e && e.code || e })); })
      .then(function(){ SM.sending = false; var b = document.getElementById('sm-send'); if(b){ b.disabled = false; } });
  };
  function msgState(m){
    if(m.reply){ return '<span class="sm-state is-replied">' + esc(t('sm.replied', { r: m.reply.text || 'OK' })) + (m.repliedAt ? ' · ' + whenText(m.repliedAt) : '') + '</span>'; }
    if(m.seenAt){ return '<span class="sm-state is-seen">' + t('sm.seen', { t: fmtDay(isoOf(m.seenAt)) + ' ' + whenText(m.seenAt) }) + '</span>'; }
    return '<span class="sm-state">' + t('sm.sentState') + '</span>';
  }
  function renderMsgs(){
    var box = document.getElementById('sup-msgs-body');
    if(!box){ return; }
    if(SM.list == null){ box.innerHTML = '<p class="card-hint">' + t('log.loading') + '</p>'; return; }
    box.innerHTML = '<h3 class="sup-h">' + t('sm.sentList') + '</h3>' + (SM.list.length ? '<ul class="sup-list">' + SM.list.map(function(m){
      var open = m.taskKey ? ' is-open" role="button" tabindex="0" onclick="supOpenWith(\'task\', \'' + m.taskKey + '\', \'sm.back\', \'sup-msgs\')' : '';
      return '<li class="sup-row sm-row' + (m.reply ? ' is-replied' : '') + open + '"><span class="sup-row-time">' + (m.createdAt ? fmtDay(isoOf(m.createdAt)) + '<br>' + whenText(m.createdAt) : '…') + '</span>' +
        '<span class="sup-row-main">' + (m.taskName ? '<span class="sup-row-sub">«' + esc(m.taskName) + '»</span>' : '') +
        '<span class="sup-row-title log-text">' + esc(m.text) + '</span>' + msgState(m) + '</span></li>';
    }).join('') + '</ul>' : '<p class="card-hint">' + t('msg.none') + '</p>');
  }
  // Respuestas sin ver: número en el sobre
  function renderMsgBadge(){
    var seen = 0; try{ seen = +localStorage.getItem('replies-seen') || 0; }catch(e){}
    var n = (SM.list || []).filter(function(m){ return m.repliedAt && m.repliedAt.getTime() > seen; }).length, b = document.getElementById('sup-msg-badge');
    b.hidden = !n; b.textContent = n;
    document.getElementById('sup-envelope').setAttribute('aria-label', t('sm.title') + (n ? ' · ' + n : ''));
  }
  var SM_WATCH = false;
  function watchMsgs(){
    if(SM_WATCH || !window.syncWatchMessages){ return; }
    SM_WATCH = true;
    window.syncWatchMessages(function(list){
      SM.list = list || [];
      renderMsgBadge();
      if(document.getElementById('screen-sup-msgs').classList.contains('active')){
        renderMsgs();
        try{ localStorage.setItem('replies-seen', String(Date.now())); }catch(e){}
        renderMsgBadge();
      }
    });
  }

  // Al abrir la App desde una notificación: ?open=task:…
  var OPEN = new URLSearchParams(location.search).get('open');
  function openFromUrl(){
    if(!OPEN){ return; }
    var o = OPEN; OPEN = null;
    try{ history.replaceState(null, '', location.pathname); }catch(e){}
    openTarget(o, 'al.back', 'sup-alerts');
  }

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
    renderLog();
    if(document.getElementById('screen-sup-msgs').classList.contains('active')){ renderCompose(); renderMsgs(); }
    if(window.renderStats && document.getElementById('screen-sup-stats').classList.contains('active')){ window.renderStats(); }
  }
  // Al cambiar de idioma se vuelven a escribir los textos del modo supervisor
  var applyI18nBase = window.applyI18n;
  if(typeof applyI18nBase === 'function'){
    window.applyI18n = function(){ applyI18nBase.apply(this, arguments); texts(); };
  }

  if(typeof window.renderAccount === 'function'){ window.renderAccount(); }
  showScreen(nav.querySelector('.tab'));
  texts();
  openFromUrl();
  var an = document.createElement('script');
  an.src = 'analysis.js';
  document.body.appendChild(an);
})();
