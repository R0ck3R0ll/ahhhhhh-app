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
    if(btn.dataset.screen === 'sup-log' && !LOG.loaded){ loadLog(false); }
    if(btn.dataset.screen === 'sup-stats' && window.renderStats){ window.renderStats(); }
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
      box.querySelector('.detail-card').insertAdjacentHTML('afterend', historyHtml(r[0], r[1]));
    }).catch(function(){});
  }
  var openTaskBase = window.openTask;
  window.openTask = function(key){
    openTaskBase.apply(this, arguments);
    var box = document.getElementById('task-detail');
    if(box){ box.dataset.key = key; }
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
  var an = document.createElement('script');
  an.src = 'analysis.js';
  document.body.appendChild(an);
})();
