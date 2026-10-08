  var LANG = 'es';

  function t(key, vars){
    var s = I18N[LANG][key];
    if(s == null){ s = I18N.es[key]; }
    if(s == null){ return key; }
    vars = vars || {};
    if(vars.name == null){
      // Sin nombre configurado, los textos que lo usan tienen su versión sin nombre
      if(!KID && I18N.es[key + '.anon'] != null){ return t(key + '.anon', vars); }
      vars.name = KID;
    }
    return s.replace(/\{(\w+)\}/g, function(m, k){ return vars[k] != null ? vars[k] : m; });
  }
  function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
  function fmtDate(d, opts){ return new Intl.DateTimeFormat(LOCALES[LANG], opts).format(d); }
  function isoDate(iso){ var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function ddmm(d){ return (d.getDate() < 10 ? '0' : '') + d.getDate() + '/' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1); }
  // Nombre del día de la semana (lunes = 0); el 7/9/2026 es lunes
  function weekdayName(i, style){ return fmtDate(new Date(2026, 8, 7 + i), { weekday: style || 'long' }); }
  // Reloj de la App: fecha de hoy (a las 00:00), día de la semana (lunes = 0) y hora actual
  // en horas con decimales (17:15 → 17.25). Se actualiza cada minuto (ver tickClock).
  var TODAY_DATE = null, TODAY_DAY = 0, NOW = 0;
  function syncClock(){
    var d = new Date(), day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var changed = !TODAY_DATE || day.getTime() !== TODAY_DATE.getTime();
    TODAY_DATE = day; TODAY_DAY = weekdayOf(day); NOW = d.getHours() + d.getMinutes() / 60;
    return changed;
  }
  syncClock();
  function todaySubtitle(){
    return cap(fmtDate(TODAY_DATE, { weekday:'long', day:'numeric', month:'long' })) + ' · ' + t('planOf');
  }

  // Nombre de quien usa la App (editable en Configuración > Perfil)
  function loadKidName(){ try{ var n = localStorage.getItem('kid-name'); if(n){ KID = n; } }catch(e){} }
  function setKidName(v){
    v = v.trim();
    if(!v){ el('kid-name').value = KID; if(KID){ return; } }
    KID = v;
    try{ localStorage.setItem('kid-name', v); }catch(e){}
    applyI18n();
  }
  function loadLanguage(){
    try{ var l = localStorage.getItem('app-language'); if(l && I18N[l]){ LANG = l; } }catch(e){}
  }
  function setLanguage(l){
    if(!I18N[l]){ return; }
    LANG = l;
    try{ localStorage.setItem('app-language', l); }catch(e){}
    applyI18n();
  }

  // Aplica el idioma a todo lo que está en el HTML y vuelve a dibujar lo generado
  function applyI18n(){
    document.documentElement.lang = LANG;
    if(document.getElementById('kid-name')){ document.getElementById('kid-name').value = KID; }
    if(document.getElementById('addr-home')){ el('addr-home').value = ADDR.home; }
    var sel = document.getElementById('lang-select');
    if(sel){ sel.value = LANG; }
    document.querySelectorAll('[data-i18n]').forEach(function(el){ el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(function(el){ el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-aria]').forEach(function(el){ el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-title]').forEach(function(el){ el.setAttribute('title', t(el.dataset.i18nTitle)); });
    document.querySelectorAll('[data-i18n-ph]').forEach(function(el){ el.setAttribute('placeholder', t(el.dataset.i18nPh)); });
    document.querySelectorAll('.priority-select option').forEach(function(o){ o.textContent = t('prio.' + o.value); });
    // Días de la semana y fechas de los datos de ejemplo
    document.querySelectorAll('[data-days]').forEach(function(el){
      el.textContent = cap(el.dataset.days.split(',').map(function(d){ return weekdayName(+d); }).join(t('and')));
    });
    document.querySelectorAll('[data-date]').forEach(function(el){
      var d = isoDate(el.dataset.date);
      el.textContent = cap(fmtDate(d, { weekday:'short' }).replace('.', '')) + ' ' + ddmm(d);
    });
    renderLoad();
    var active = document.querySelector('.tab.is-active');
    if(active){ setScreenHeading(active); }
    document.getElementById('cal-range').textContent = calRangeText(calView);
    renderExportCats();
    renderSchoolCal();
    renderEvents();
    refreshEventForm();
    renderActivities();
    refreshActivityForm();
    renderTasks();
    refreshOpenDetails();
    onScheduleChanged();
    applyAppearance();
  }

  var FORM_CLOSE = { 'evt-form':'closeEventForm', 'act-form':'closeActivityForm', 'task-form':'closeTaskForm', 'task-plan':'closePlan' }, pendingTab = null;
  function openForm(){
    var f = document.querySelector('.screen.active form.evt-form:not([hidden])');
    return f ? f.id : null;
  }
  function discardAndGo(){
    var f = openForm(), btn = pendingTab;
    el('discard-dialog').close();
    if(f){ window[FORM_CLOSE[f]](); }
    pendingTab = null;
    if(btn){ showScreen(btn); }
  }
  function showScreen(btn){
    // Sin configurar lo mínimo, solo se puede usar Configuración
    if(btn.dataset.screen !== 'config' && !setupDone()){ toast(t('setup.locked')); renderSetup(); return; }
    // Con un formulario abierto, cambiar de pestaña pide confirmación
    if(openForm() && !btn.classList.contains('is-active')){ pendingTab = btn; el('discard-dialog').showModal(); return; }
    PRESS_BACK = null;
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('is-active'));
    btn.classList.add('is-active');
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-'+btn.dataset.screen).classList.add('active');
    setScreenHeading(btn);
    DETAIL_BACK = null;   // al cambiar de pestaña, las fichas vuelven a su lista
    // «Hoy» lleva la cabecera compacta (sin la marca y con la fecha en la misma línea)
    document.querySelector('.app-shell').classList.toggle('is-today', btn.dataset.screen === 'today');
    if(btn.dataset.screen === 'calendar'){ fitCalendar(); }
    if(btn.dataset.screen === 'today'){ renderToday(); }
  }

  function setScreenHeading(btn){
    var today = btn.dataset.screen === 'today';
    document.getElementById('screen-heading').textContent = today ? t('tab.today') : t(btn.dataset.title);
    document.getElementById('screen-subheading').textContent = today ? todaySubtitle() : t(btn.dataset.sub);
  }


  /* ================= TODAY ================= */
  // Nombre de una categoría tal como está en Configuración (o el de fábrica traducido)
  function catName(cat){
    var row = document.querySelector('#category-list .cat-row[data-cat="' + cat + '"]');
    return row ? rowName(row) : t('cat.' + cat);
  }
  function rowName(row){
    var input = row.querySelector('.cat-name-input');
    return input ? (input.value || t('category')) : t('cat.' + row.dataset.cat);
  }
  /* ---- Elementos de hoy: los datos reales (actividades, eventos y tareas) ----
     kind: pantalla en la que se abre al pulsarlo (activity / event / task); end: fin si tiene duración;
     place / dist: línea de detalle; leaves: horas de salida por modo (las pone applyRoute, solo en
     el próximo). Las tareas hechas no se presentan. */
  var TODAY_NEXT = null, TODAY_LATER = [], TODAY_LATER_ALL = [];
  // El cuerpo de la pantalla muestra como máximo TODAY_MAX deadlines (el próximo y los
  // siguientes por orden); la barra de tiempo dibuja todos los del día.
  var TODAY_MAX = 4;
  function todayItems(){
    var iso = isoOf(TODAY_DATE), wd = weekdayOf(TODAY_DATE), now = appNow(), out = [];
    USER_ACTS.forEach(function(a){
      a.sessions.filter(function(x){ return x.day === wd; }).forEach(function(x){
        out.push({ id:'act-' + a.id + '-' + x.start, kind:'activity', ref:a.id, t:toHours(x.start), end:toHours(x.end), cat:a.cat, title:a.name, place:a.place || '' });
      });
    });
    USER_EVENTS.filter(function(e){ return e.date === iso; }).forEach(function(e){
      var h = toHours(e.time);
      out.push({ id:'evt-' + e.id, kind:'event', ref:e.id, t:h, end:h + (e.dur || 60) / 60, cat:e.cat, title:e.name, place:e.place || '' });
    });
    allTasks().filter(function(x){ return !x.done && x.due && isoOf(x.due) === iso; }).forEach(function(x){
      out.push({ id:'tk-' + x.key.replace(':', '-'), kind:'task', ref:x.key, t:x.due.getHours() + x.due.getMinutes() / 60, cat:'tarea', title:x.name,
                 place:x.origin, dist:x.est ? fmtEst(x.est) : '', est:x.est, pid:taskParentId(x, iso, wd) });
    });
    // Bloques de trabajo de hoy (de tareas sin hacer)
    liveBlocks().filter(function(o){ return o.b.date === iso && !o.x.done; }).forEach(function(o){
      out.push({ id:'blk-' + o.b.id, kind:'block', ref:o.x.key, t:o.b.start, end:o.b.end, cat:'tarea', title:o.x.name,
                 place:t('block.label'), dist:fmtEst(Math.round((o.b.end - o.b.start) * 60)) });
    });
    out.forEach(function(e){ e.from = originText(travelOrigin(e, TODAY_DATE, NOW)); });
    // Tarea de un evento o actividad de hoy: hay que hacerla antes de salir hacia él, así que su
    // entrega se ve a la hora de salida (la más temprana, si hay coche y a pie) si esa es antes
    out.forEach(function(e){
      var p = e.pid && out.filter(function(q){ return q.id === e.pid; })[0], lv = p && leaveHour(p);
      if(lv != null && lv < e.t){ e.t = lv; e.byLeave = true; }
    });
    // Tarea que vence hoy con bloques de trabajo de hoy que cubren lo que falta: en «Hoy» solo se
    // ven los bloques, con «(antes de HH:MM)», mientras quede alguno por terminar
    var covered = {};
    out.forEach(function(e){
      if(e.kind !== 'task' || !e.est){ return; }
      var today = blocksOf(e.ref).filter(function(b){ return b.date === iso && !isLogged(b); });
      var left = e.est - doneMin(e.ref);
      var upcoming = out.some(function(b){ return b.kind === 'block' && b.ref === e.ref && b.end > NOW; });
      if(left > 0 && upcoming && Math.round(blockHours(today) * 60) >= left){ covered[e.ref] = e.t; }
    });
    out = out.filter(function(e){ return !(e.kind === 'task' && covered[e.ref] != null); });
    out.forEach(function(e){
      if(e.kind === 'block' && covered[e.ref] != null){ e.title += ' (' + t('block.before', { t: fmtHour(covered[e.ref]) }) + ')'; }
    });
    // Se quitan los que ya han terminado (una tarea, al pasar su hora, queda en «Atrasadas»)
    return out.filter(function(e){ return (e.end || e.t) > NOW + 1e-9 && (e.kind !== 'task' || e.t > NOW); })
      .map(function(e){ if(!/^(tarea|cita|actividad|libre)$/.test(e.cat) && !findCategory(e.cat)){ e.cat = 'libre'; } return e; })
      .sort(function(p, q){
        if(p.t !== q.t){ return p.t - q.t; }
        // A la misma hora, la tarea de un elemento va antes que él; el resto de tareas, después
        if(p.pid === q.id){ return -1; }
        if(q.pid === p.id){ return 1; }
        return (p.kind === 'task') - (q.kind === 'task');
      });
  }
  // Elemento de hoy (evento o sesión de la actividad) al que pertenece una tarea, o null
  function taskParentId(x, iso, wd){
    if(!x.parent){ return null; }
    if(x.kind === 'event'){ return x.parent.date === iso ? 'evt-' + x.parent.id : null; }
    if(x.kind === 'activity'){
      var h = x.due.getHours() + x.due.getMinutes() / 60;
      var ses = (x.parent.sessions || []).filter(function(z){ return z.day === wd && Math.abs(toHours(z.start) - h) < 1e-6; })[0];
      return ses ? 'act-' + x.parent.id + '-' + ses.start : null;
    }
    return null;
  }
  // Hora de salida más temprana hacia un elemento de hoy (en horas), o null si no hay trayecto calculado
  function leaveHour(item){
    var r = ROUTES.day === isoOf(TODAY_DATE) && ROUTES.items[item.id];
    if(!r || !r.car){ return null; }
    var mins = Math.max(r.car.min, r.walk ? r.walk.min : 0);
    return Math.floor(item.t * 60 - mins) / 60;
  }
  function loadTodayItems(){
    var items = todayItems();
    TODAY_NEXT = items[0] || null;
    refreshRoutes(items);
    // Las horas de salida se calculan para todos: se ven en el próximo y en los siguientes
    items.forEach(applyRoute);
    TODAY_LATER_ALL = items.slice(1);
    TODAY_LATER = TODAY_LATER_ALL.slice(0, TODAY_MAX - 1);
  }
  function todayVisible(){ return TODAY_LATER_ALL; }
  function todayCheck(e){
    return e.kind === 'task' ? '<button type="button" class="task-check today-check" aria-label="' + t('task.markDone') + ': ' + esc(e.title) + '" title="' + t('task.markDone') + '" ' +
      'onclick="event.stopPropagation(); setTaskDone(\'' + e.ref + '\', true)" onkeydown="event.stopPropagation()" onpointerdown="event.stopPropagation()">' + CHECK_ICON + '</button>' : '';
  }
  // Lugar · desde dónde se sale · distancia (o, en las tareas, origen · tiempo estimado)
  function placeLine(n){ return [n.place, n.from, n.dist].filter(Boolean).map(esc).join(' · '); }

  /* ---- Traslados: punto de partida ----
     Desde 1 h antes de la hora de salida: la ubicación del móvil. Antes de eso: el lugar del elemento
     anterior de ese día (actividad o evento); si no hay ninguno o no tiene ubicación, casa.
     El cole no cuenta: lo primero después del cole sale de casa.
     Google Maps (con tráfico previsto para la hora de salida) calculará el tiempo desde ahí. */
  var ADDR = { home:'' };
  try{ var a0 = JSON.parse(localStorage.getItem('addresses') || 'null'); if(a0){ ADDR.home = a0.home || ''; } }catch(e){}
  function setAddress(k, v){
    ADDR[k] = v.trim();
    try{ localStorage.setItem('addresses', JSON.stringify(ADDR)); }catch(e){}
    renderToday();
  }
  // Elementos programados de una fecha (también los ya terminados): sesiones de actividades y eventos
  function placedElements(d){
    var iso = isoOf(d), wd = weekdayOf(d), out = [];
    USER_ACTS.forEach(function(a){
      a.sessions.filter(function(x){ return x.day === wd; }).forEach(function(x){
        out.push({ id:'act-' + a.id + '-' + x.start, t:toHours(x.start), place:a.place || '', name:a.name });
      });
    });
    USER_EVENTS.filter(function(e){ return e.date === iso; }).forEach(function(e){
      out.push({ id:'evt-' + e.id, t:toHours(e.time), place:e.place || '', name:e.name });
    });
    return out;
  }
  // { kind:'device' | 'prev' | 'home', place, name } o null si no hay traslado
  // (sin ubicación, ya empezado o en el mismo sitio que el elemento anterior)
  function travelOrigin(item, d, now){
    if(!item.place || (item.kind !== 'activity' && item.kind !== 'event') || now >= item.t){ return null; }
    // Hora de salida: la hora del elemento menos el tiempo en coche (si aún no se sabe, la del elemento)
    var r = ROUTES.day === isoOf(d) && ROUTES.items[item.id], lead = r && r.car ? r.car.min / 60 : 0;
    if(item.t - lead - now <= 1){ return { kind:'device' }; }
    var prev = placedElements(d).filter(function(p){ return p.id !== item.id && p.t < item.t; })
      .sort(function(p, q){ return q.t - p.t; })[0];
    if(prev && prev.place){ return prev.place === item.place ? null : { kind:'prev', place:prev.place, name:prev.name }; }
    return { kind:'home', place:ADDR.home };
  }
  function originText(o){
    return !o ? '' : o.kind === 'device' ? t('from.device') : o.kind === 'home' ? t('from.home') : t('from.prev', { place: o.name });
  }

  /* ---- Lugares: sugerencias al escribir y sitio exacto ----
     Al escribir un lugar (casa, actividad, evento) salen primero los ya usados. A partir de
     PLACE_MIN_CHARS caracteres, si no se ha elegido ninguno, se busca el texto en Google Maps
     (Places API, al dejar de escribir un momento). Al elegir una sugerencia de Google se guarda
     su identificador, y el botón «Usar mi ubicación actual» guarda el punto exacto de casa:
     PLACES[texto] = { id } o { ll:[lat, lng] }. Así Maps calcula siempre hacia el sitio correcto. */
  var PLACE_MIN_CHARS = 10, PLACE_DAY_MAX = 150;
  var PLACES = {};
  try{ PLACES = JSON.parse(localStorage.getItem('places') || '{}') || {}; }catch(e){}
  function savePlaces(){ try{ localStorage.setItem('places', JSON.stringify(PLACES)); }catch(e){} }
  // Punto para Routes API: el sitio exacto si se conoce, si no el texto tal cual
  function waypointFor(text){
    var p = PLACES[text];
    if(p && p.id){ return { placeId: p.id }; }
    if(p && p.ll){ return { location: { latLng: { latitude: p.ll[0], longitude: p.ll[1] } } }; }
    return { address: text };
  }
  function usedPlaces(){
    var seen = {}, out = [];
    [ADDR.home].concat(USER_ACTS.map(function(a){ return a.place; }), USER_EVENTS.map(function(e){ return e.place; }), Object.keys(PLACES))
      .forEach(function(p){ p = (p || '').trim(); var k = p.toLowerCase(); if(p && !seen[k]){ seen[k] = true; out.push(p); } });
    return out;
  }
  function fold(s){ return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function placeCount(add){
    var iso = isoOf(new Date()), c = { d: iso, n: 0 };
    try{ var s0 = JSON.parse(localStorage.getItem('place-count') || 'null'); if(s0 && s0.d === iso){ c = s0; } }catch(e){}
    if(add){ c.n += add; try{ localStorage.setItem('place-count', JSON.stringify(c)); }catch(e){} }
    return c.n;
  }
  // Las últimas búsquedas se recuerdan, para no preguntar dos veces lo mismo a Google
  var PLACE_MEMO = {};
  function searchPlaces(text){
    if(PLACE_MEMO[text]){ return Promise.resolve(PLACE_MEMO[text]); }
    var body = { input: text, languageCode: LOCALES[LANG], regionCode: 'es' };
    var c = GEO ? [GEO.lat, GEO.lng] : (PLACES[ADDR.home] && PLACES[ADDR.home].ll);
    if(c){ body.locationBias = { circle: { center: { latitude: c[0], longitude: c[1] }, radius: 30000 } }; }
    placeCount(1);
    return fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': MAPS_KEY,
                 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.types' },
      body: JSON.stringify(body)
    }).then(function(r){ if(!r.ok){ throw r.status; } return r.json(); })
      .then(function(j){
        return (j.suggestions || []).map(function(sg){ return sg.placePrediction; }).filter(Boolean)
          .map(function(p){ return { text: p.text.text, id: p.placeId, types: p.types || [] }; });
      }).then(function(r){
        var keys = Object.keys(PLACE_MEMO);
        if(keys.length >= 20){ delete PLACE_MEMO[keys[0]]; }
        PLACE_MEMO[text] = r;
        return r;
      });
  }
  // Una dirección exacta (con número de portal o un sitio concreto), no solo la calle
  var EXACT_TYPES = ['street_address', 'premise', 'subpremise', 'establishment', 'point_of_interest'];
  function exactPlace(types){ return (types || []).some(function(x){ return EXACT_TYPES.indexOf(x) >= 0; }); }
  // Convierte un campo de texto en campo de lugar con su lista de sugerencias.
  // Si se elige una calle sin número, el cursor se queda tras el nombre de la calle para añadirlo; al
  // dejar el campo con el texto cambiado, se busca en Google el sitio exacto de lo escrito.
  function placeField(input, onPick){
    var box = document.createElement('div');
    box.className = 'place-field';
    input.parentNode.insertBefore(box, input);
    box.appendChild(input);
    var list = document.createElement('ul');
    list.className = 'place-sugg'; list.hidden = true; list.setAttribute('role', 'listbox');
    box.appendChild(list);
    var hint = document.createElement('p');
    hint.className = 'card-hint place-hint'; hint.hidden = true;
    box.appendChild(hint);
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
    var timer = null, asked = '', remote = [], picked = false, pickedText = '';
    function show(){
      var q = fold(input.value.trim()), local = [];
      if(q){ local = usedPlaces().filter(function(p){ var f = fold(p); return f.indexOf(q) >= 0 && f !== q; }).slice(0, 5); }
      var items = local.map(function(p){ return { text: p, mine: true }; })
        .concat(remote.filter(function(r){ return local.indexOf(r.text) < 0; }));
      list.innerHTML = items.map(function(it, i){
        return '<li role="option" data-i="' + i + '" class="' + (it.mine ? 'is-mine' : 'is-google') + '">' + (it.mine ? PIN_SVG : '') + '<span>' + esc(it.text) + '</span></li>';
      }).join('') + (remote.length ? '<li class="place-src" aria-hidden="true">Google Maps</li>' : '');
      list._items = items;
      list.hidden = !items.length;
      input.setAttribute('aria-expanded', String(!list.hidden));
    }
    function pick(it){
      input.value = it.text;
      if(it.id){ PLACES[it.text] = { id: it.id }; savePlaces(); }
      picked = true; pickedText = it.text; remote = []; list.hidden = true; input.setAttribute('aria-expanded', 'false');
      // Calle sin número: el cursor tras el nombre de la calle (antes de la primera coma) y un aviso
      var street = it.id && !exactPlace(it.types) && (it.types || []).indexOf('route') >= 0;
      hint.textContent = street ? t('place.addNumber') : ''; hint.hidden = !street;
      if(street){
        var at = it.text.indexOf(','); at = at < 0 ? it.text.length : at;
        input.focus();
        try{ input.setSelectionRange(at, at); }catch(e){}
      }
      if(onPick){ onPick(it.text); }
    }
    // Texto cambiado a mano tras elegir (p. ej. con el número añadido): se busca su sitio exacto
    function resolveEdited(){
      var v = input.value.trim();
      if(!pickedText || v === pickedText || !v || PLACES[v] || !MAPS_ON || !navigator.onLine || placeCount(0) >= PLACE_DAY_MAX){ return; }
      pickedText = '';
      searchPlaces(v).then(function(r){
        var best = r[0];
        if(best && exactPlace(best.types)){ PLACES[v] = { id: best.id }; savePlaces(); if(onPick){ onPick(v); } }
      }).catch(function(){});
    }
    input.addEventListener('input', function(){
      picked = false;
      hint.hidden = true;
      clearTimeout(timer);
      var v = input.value.trim();
      if(v.length < PLACE_MIN_CHARS){ remote = []; asked = ''; }
      show();
      if(v.length >= PLACE_MIN_CHARS && MAPS_ON && navigator.onLine && v !== asked && placeCount(0) < PLACE_DAY_MAX){
        timer = setTimeout(function(){
          asked = v;
          searchPlaces(v).then(function(r){ if(!picked && input.value.trim() === v){ remote = r.slice(0, 5); show(); } }).catch(function(){});
        }, 700);
      }
    });
    input.addEventListener('focus', function(){ if(input.value.trim()){ show(); } });
    input.addEventListener('blur', function(){
      setTimeout(function(){ list.hidden = true; input.setAttribute('aria-expanded', 'false'); if(document.activeElement !== input){ hint.hidden = true; resolveEdited(); } }, 150);
    });
    input.addEventListener('keydown', function(ev){ if(ev.key === 'Escape'){ list.hidden = true; } });
    // pointerdown en vez de click: así no se pierde el foco antes de elegir
    list.addEventListener('pointerdown', function(ev){
      var li = ev.target.closest('li[data-i]');
      if(!li){ return; }
      ev.preventDefault();
      pick(list._items[+li.dataset.i]);
    });
  }
  // Casa = el punto exacto donde está ahora el móvil
  function useHereAsHome(btn){
    if(!navigator.geolocation){ toast(t('home.noGeo')); return; }
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(function(p){
      btn.disabled = false;
      var label = t('home.saved');
      PLACES[label] = { ll: [+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6)] };
      savePlaces();
      el('addr-home').value = label;
      setAddress('home', label);
      toast(t('home.savedToast'));
    }, function(){ btn.disabled = false; toast(t('home.noGeo')); }, { enableHighAccuracy: true, timeout: 20000 });
  }

  /* ---- Traslados: tiempo real con Google Maps (Routes API) ----
     Cada elemento de hoy con lugar y traslado tiene su tiempo en coche (con el tráfico previsto)
     y, si está a menos de 2,5 km, a pie. Cuándo se calcula, para pedir lo justo:
       - la primera vez que se abre la App en el día: todos;
       - para cada elemento, cuando falta 1 h para su hora de salida y después cada 20 min,
         hasta la hora del elemento (ROUTE_SLOT_MIN);
       - si cambia algo de hoy (una actividad o un evento, la casa o el sitio exacto de un
         lugar): todos, porque el punto de partida de cada uno depende del anterior.
     Los resultados se guardan en el móvil (route-cache). Máximo MAPS_DAY_MAX consultas por móvil
     y día; si Google rechaza la clave o el cupo, se deja de preguntar 1 h.
     La clave solo funciona desde la dirección de la App (restricción por sitio web). */
  var MAPS_KEY = 'AIzaSyAVY7P4ZP89mUGi_0cQy-jNY7gXLO8L9Mw';
  var MAPS_ON = /(^|\.)ahhhhhh-today\.(web\.app|firebaseapp\.com)$/.test(location.hostname);
  var MAPS_DAY_MAX = 60, WALK_MAX_M = 2500, WALK_MAX_MIN = 45, ROUTE_SLOT_MIN = 20;
  var ROUTES = { day: '', sig: '', items: {} }, ROUTE_BUSY = false, ROUTE_PAUSE = 0;
  try{ var r0 = JSON.parse(localStorage.getItem('route-cache') || 'null'); if(r0 && r0.items){ ROUTES = r0; } }catch(e){}
  function saveRoutes(){ try{ localStorage.setItem('route-cache', JSON.stringify(ROUTES)); }catch(e){} }
  function routeCount(add){
    var iso = isoOf(new Date()), c = { d: iso, n: 0 };
    try{ var s0 = JSON.parse(localStorage.getItem('route-count') || 'null'); if(s0 && s0.d === iso){ c = s0; } }catch(e){}
    if(add){ c.n += add; try{ localStorage.setItem('route-count', JSON.stringify(c)); }catch(e){} }
    return c.n;
  }

  // Ubicación del móvil (solo cuando falta 1 h o menos). Si no se puede saber, se sale de casa.
  var GEO = null, GEO_BUSY = false, GEO_DENIED = false, GEO_RETRY = 0;
  function ensureGeo(){
    if(GEO_BUSY || GEO_DENIED || Date.now() < GEO_RETRY || (GEO && Date.now() - GEO.at < 5 * 60000)){ return; }
    if(!navigator.geolocation){ GEO_DENIED = true; return; }
    GEO_BUSY = true;
    navigator.geolocation.getCurrentPosition(function(p){
      GEO_BUSY = false;
      GEO = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() };
      renderToday();
    }, function(e){
      GEO_BUSY = false;
      if(e.code === 1){ GEO_DENIED = true; } else { GEO_RETRY = Date.now() + 2 * 60000; }
      renderToday();
    }, { maximumAge: 5 * 60000, timeout: 15000 });
  }

  function fetchRoute(origin, dest, mode, departMs){
    var body = { origin: origin, destination: waypointFor(dest), travelMode: mode, languageCode: LOCALES[LANG], units: 'METRIC' };
    if(mode === 'DRIVE'){
      body.routingPreference = 'TRAFFIC_AWARE';
      if(departMs > Date.now() + 60000){ body.departureTime = new Date(departMs).toISOString(); }
    }
    routeCount(1);
    return fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': MAPS_KEY, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters' },
      body: JSON.stringify(body)
    }).then(function(r){
      if(!r.ok){ throw r.status; }
      return r.json();
    }).then(function(j){
      var r = j.routes && j.routes[0];
      return r ? { min: Math.max(1, Math.ceil(parseInt(r.duration, 10) / 60)), m: r.distanceMeters || 0 } : null;
    });
  }

  // Firma de lo que influye en los trayectos de hoy: si cambia, se recalculan todos
  function routeSig(){
    return JSON.stringify([ADDR.home, PLACES[ADDR.home] || ''].concat(placedElements(TODAY_DATE)
      .sort(function(p, q){ return p.t - q.t || (p.id < q.id ? -1 : 1); })
      .map(function(p){ return [p.id, p.t, p.place, PLACES[p.place] || '']; })));
  }
  // Tramo de 20 min en el que estamos para un elemento: -1 antes de 1 h de la salida o ya
  // empezado; 0 desde 1 h antes de la salida, 1 a los 20 min, etc.
  function routeSlot(item, r){
    var now = NOW * 60, start = item.t * 60;
    if(now >= start || !r || !r.car){ return -1; }
    var from = start - r.car.min - 60;
    return now < from ? -1 : Math.floor((now - from) / ROUTE_SLOT_MIN);
  }
  function routeOrigin(item){
    var o = travelOrigin(item, TODAY_DATE, NOW);
    if(!o){ return null; }
    if(o.kind === 'device'){
      ensureGeo();
      if(GEO){ return { o: o, wp: { location: { latLng: { latitude: GEO.lat, longitude: GEO.lng } } } }; }
      if(GEO_DENIED || GEO_RETRY > Date.now()){ o = { kind: 'home', place: ADDR.home, fallback: true }; }
      else { return { wait: true }; }   // esperando la ubicación
    }
    return o.place ? { o: o, wp: waypointFor(o.place) } : null;
  }
  // Repasa los elementos de hoy y calcula (de uno en uno) los que tocan
  function refreshRoutes(items){
    if(!MAPS_ON || ROUTE_BUSY || Date.now() < ROUTE_PAUSE || !navigator.onLine){ return; }
    var iso = isoOf(TODAY_DATE), sig = routeSig();
    if(ROUTES.day !== iso || ROUTES.sig !== sig){ ROUTES = { day: iso, sig: sig, items: {} }; saveRoutes(); }
    var due = null, dueOrigin = null;
    items.some(function(item){
      if(!item.place || (item.kind !== 'activity' && item.kind !== 'event')){ return false; }
      var r = ROUTES.items[item.id];
      if(r && r.failAt && Date.now() - r.failAt < 10 * 60000){ return false; }
      if(r && !r.failAt && routeSlot(item, r) <= r.slot){ return false; }
      var org = routeOrigin(item);
      if(!org || org.wait){ return false; }
      due = item; dueOrigin = org; return true;
    });
    if(!due || routeCount(0) >= MAPS_DAY_MAX){ return; }
    ROUTE_BUSY = true;
    var item = due, prev = ROUTES.items[item.id];
    var arrive = TODAY_DATE.getTime() + item.t * 3600000;
    var guess = prev && prev.car ? prev.car.min : 20;
    var res = { at: Date.now(), from: dueOrigin.o.kind, fallback: !!dueOrigin.o.fallback };
    fetchRoute(dueOrigin.wp, item.place, 'DRIVE', arrive - guess * 60000).then(function(car){
      res.car = car;
      if(car && car.m && car.m <= WALK_MAX_M){
        return fetchRoute(dueOrigin.wp, item.place, 'WALK', 0).then(function(w){ if(w && w.min <= WALK_MAX_MIN){ res.walk = w; } });
      }
    }).then(function(){
      res.slot = routeSlot(item, res);
      if(ROUTES.day === iso && ROUTES.sig === sig){ ROUTES.items[item.id] = res; saveRoutes(); }
      ROUTE_BUSY = false;
      renderToday();   // pinta el resultado y sigue con el siguiente que toque
    }).catch(function(code){
      ROUTE_BUSY = false;
      if(code === 403 || code === 429){ ROUTE_PAUSE = Date.now() + 60 * 60000; }   // clave rechazada o cupo agotado
      else { ROUTES.items[item.id] = { failAt: Date.now(), slot: -2 }; saveRoutes(); }
    });
  }
  // Pone en el elemento las horas de salida (leaves), la distancia y, si se salió de casa en
  // vez de la ubicación del móvil, el origen
  function applyRoute(item){
    var r = item && ROUTES.items[item.id];
    if(!r || !r.car || ROUTES.day !== isoOf(TODAY_DATE)){ return; }
    var leaves = {};
    leaves.car = fmtHour(Math.floor(item.t * 60 - r.car.min) / 60);
    if(r.walk){ leaves.walk = fmtHour(Math.floor(item.t * 60 - r.walk.min) / 60); }
    item.leaves = leaves;
    if(r.car.m){ item.dist = new Intl.NumberFormat(LOCALES[LANG], { maximumFractionDigits: 1 }).format(r.car.m / 1000) + ' km'; }
    if(r.fallback){ item.from = t('from.home'); }
  }

  /* ---- Apariencia (Configuración) ---- */
  var APPEARANCE = { layout:'list', mode:'light', bar:'dots' };
  function loadAppearance(){
    try{
      var saved = JSON.parse(localStorage.getItem('today-appearance') || 'null');
      if(saved){ Object.keys(APPEARANCE).forEach(function(k){ if(saved[k]){ APPEARANCE[k] = saved[k]; } }); }
    }catch(e){}
  }

  function setAppearance(key, value){
    APPEARANCE[key] = value;
    try{ localStorage.setItem('today-appearance', JSON.stringify(APPEARANCE)); }catch(e){}
    applyAppearance();
  }

  function applyAppearance(){
    document.documentElement.setAttribute('data-theme', APPEARANCE.mode === 'dark' ? 'dark' : 'light');
    // Color de la barra del sistema (móvil) igual que el fondo de la App
    var tc = document.getElementById('theme-color');
    if(tc){ tc.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#D9D9D9'); }
    document.querySelectorAll('[data-appearance]').forEach(function(b){
      var on = APPEARANCE[b.dataset.appearance] === b.dataset.value;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    document.getElementById('layout-hint').textContent = t('hint.' + APPEARANCE.layout);
    if(typeof updateConfigSummaries === 'function'){ updateConfigSummaries(); }
    renderToday();
  }

  /* ---- Utilidades ---- */
  // Categorías de fábrica: sus variables; las creadas por el usuario: su color y tonos derivados
  function isBaseCat(cat){ return /^(tarea|cita|actividad|libre)$/.test(cat); }
  function catColor(cat){
    if(isBaseCat(cat)){ return 'var(--cat-' + cat + ')'; }
    var c = findCategory(cat);
    return c ? c.color : 'var(--cat-libre)';
  }
  function catVars(cat){
    if(isBaseCat(cat)){ return '--c:var(--cat-' + cat + ');--c-ink:var(--cat-' + cat + '-ink);--deep:var(--cat-' + cat + '-deep)'; }
    var c = catColor(cat);
    return '--c:' + c + ';--c-ink:' + inkOf(cat) + ';--deep:color-mix(in srgb, ' + c + ' 30%, #000)';
  }
  function untilText(t){
    var m = Math.max(0, Math.round((t - NOW) * 60)), h = Math.floor(m / 60), r = m % 60;
    return h ? h + 'h' + (r ? ('0' + r).slice(-2) : '') : r + ' min';   // abreviado: «4h45», «2h», «45 min»
  }
  function nextState(t){ var m = (t - NOW) * 60; return m > 60 ? 'st-calm' : m > 30 ? 'st-soon' : 'st-urgent'; }
  function nextCardAttrs(n){ return ' next-card ' + nextState(n.t) + '" style="' + catVars(n.cat); }
  /* ---- Próximos días: tareas pendientes de los siguientes LOAD_DAYS días con LOAD_MIN_EST minutos o más ----
     El color es el de la categoría de la que salen (evento o actividad; si no, Tarea). */
  var LOAD_DAYS = 5, LOAD_MIN_EST = 90;
  function upcomingLoad(){
    // Desde mañana (lo de hoy ya está en el cuerpo de «Hoy») hasta el final del quinto día
    var from = new Date(TODAY_DATE.getFullYear(), TODAY_DATE.getMonth(), TODAY_DATE.getDate() + 1);
    var limit = new Date(TODAY_DATE.getFullYear(), TODAY_DATE.getMonth(), TODAY_DATE.getDate() + LOAD_DAYS + 1);
    return allTasks().filter(function(x){ return !x.done && x.est >= LOAD_MIN_EST && x.due && x.due >= from && x.due < limit; })
      .map(function(x){
        var cat = x.parent && x.parent.cat && (isBaseCat(x.parent.cat) || findCategory(x.parent.cat)) ? x.parent.cat : 'tarea';
        return { x:{ name:x.name, cat:cat, est:x.est, key:x.key }, due:x.due };
      });
  }
  function inkOf(cat){ return isBaseCat(cat) ? 'var(--cat-' + cat + '-ink)' : 'color-mix(in srgb, ' + catColor(cat) + ' 55%, #000)'; }
  function renderLoad(){
    var items = upcomingLoad(), card = document.querySelector('.load-card');
    card.hidden = !items.length;
    el('load-count').textContent = '· ' + items.length;
    el('load-list').innerHTML = items.map(function(it){
      // Pulsar una tarea abre su ficha (con «‹ Volver a Hoy»)
      return '<li style="color:' + inkOf(it.x.cat) + '" title="' + esc(it.x.name) + '" ' + openAttrs('openLoadTask', it.x.key) + '><span class="load-name">' + esc(it.x.name) + '</span>' +
        '<span class="load-meta"><span class="load-est">' + fmtEst(it.x.est) + '</span> · ' +
        t('load.before', { t: fmtWhen(it.due) }) + '</span></li>';
    }).join('');
  }
  // Regla: si con la tarjeta desplegada la pantalla no da para todo sin taparse, se queda plegada
  function fitLoad(){
    var card = document.querySelector('.load-card'), screen = el('screen-today');
    if(!card || card.hidden || !screen.classList.contains('active')){ return; }
    setLoadOpen(true);
    var main = screen.parentElement;
    if(main.scrollHeight > main.clientHeight + 1){ setLoadOpen(false); }
  }
  function setLoadOpen(open){
    document.querySelector('.load-card').classList.toggle('is-collapsed', !open);
    el('load-toggle').setAttribute('aria-expanded', open);
    el('load-toggle').setAttribute('aria-label', t('load.title') + ' · ' + t(open ? 'load.hide' : 'load.show'));
  }
  function toggleLoad(){ setLoadOpen(document.querySelector('.load-card').classList.contains('is-collapsed')); }
  // Altura de la App = la de la ventana tal como la ve el móvil (sin barras del navegador ni del
  // sistema): así cabecera y pestañas quedan siempre a la vista y solo se desplaza el contenido
  function fitShell(){ document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px'); }
  fitShell();
  window.addEventListener('resize', fitShell);
  window.addEventListener('orientationchange', function(){ setTimeout(fitShell, 300); });
  window.addEventListener('pageshow', fitShell);
  window.addEventListener('resize', fitLoad);
  window.addEventListener('load', fitLoad);
  /* ---- Pulsar una tarjeta de «Hoy»: se abre la ficha del elemento en la pantalla que le
     corresponde, con un botón para volver a «Hoy». ---- */
  var KIND_SCREEN = { activity:['activities', 'act'], event:['events', 'evt'], task:['tasks', 'task'], block:['tasks', 'task'] };
  // Bloque de trabajo: tarjeta rayada
  function blk(e){ return e.kind === 'block' ? ' is-block' : ''; }
  function todayOpen(item){
    return 'data-open="' + item.id + '" role="button" tabindex="0" aria-label="' + fmtHour(item.t) + ' ' + esc(item.title) + '" ' +
      'onclick="openFromToday(\'' + item.id + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){ event.preventDefault(); openFromToday(\'' + item.id + '\'); }"';
  }
  function openFromToday(id){
    var item = [TODAY_NEXT].concat(TODAY_LATER_ALL).filter(function(x){ return x && x.id === id; })[0];
    if(!item){ return; }
    var sc = KIND_SCREEN[item.kind];
    document.querySelector('.tab[data-screen="' + sc[0] + '"]').click();
    DETAIL_BACK = { label: t('btn.backToday'), fn: "backToToday('" + sc[1] + "')", go: function(){ backToToday(sc[1]); } };
    if(item.kind === 'activity'){ openActivity(item.ref); } else if(item.kind === 'event'){ openEvent(item.ref); } else { openTask(item.ref); }   // tarea o bloque: la ficha de la tarea
  }
  function openLoadTask(key){
    document.querySelector('.tab[data-screen="tasks"]').click();
    DETAIL_BACK = { label: t('btn.backToday'), fn: "backToToday('task')", go: function(){ backToToday('task'); } };
    openTask(key);
  }
  function openFromCalendar(kind, id){
    var sc = KIND_SCREEN[kind];
    document.querySelector('.tab[data-screen="' + sc[0] + '"]').click();
    DETAIL_BACK = { label: t('btn.backCal'), fn: "backToCalendar('" + sc[1] + "')", go: function(){ backToCalendar(sc[1]); } };
    if(kind === 'activity'){ openActivity(id); } else if(kind === 'event'){ openEvent(id); } else { openTask(id); }
  }
  function backToCalendar(f){
    showView(f, 'list');
    document.querySelector('.tab[data-screen="calendar"]').click();
  }
  function backToToday(f){
    showView(f, 'list');
    document.querySelector('.tab[data-screen="today"]').click();
  }
  function travelOf(item){ return item.travel ? item.travel[item.travel.mode] : null; }
  var CLOCK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  var WALK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="4" r="2"/><path d="m9 20 3-6 3 3v4"/><path d="M6 12l3-4 4 1 3 3"/><path d="m12 14-1-5"/></svg>';
  // Horas de salida solo con icono (andando si aplica, y coche)
  function leaveChips(n){
    var l = n.leaves || {};
    return ['walk', 'car'].filter(function(m){ return l[m]; }).map(function(m){
      return '<span class="leave-chip" title="' + cap(t('how.' + m)) + '">' + (m === 'walk' ? WALK_SVG : CAR_SVG) + '<span>' + l[m] + '</span></span>';
    }).join('');
  }
  // En los siguientes: las mismas horas de salida, en pequeño
  function laterLeave(e){ return e.leaves ? '<div class="later-leave">' + leaveChips(e) + '</div>' : ''; }
  var CAR_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14l-1.5-5.5A2 2 0 0 0 15.6 10H8.4a2 2 0 0 0-1.9 1.5Z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>';

  // Escala de la barra: toda la franja horaria de hoy. En días de cole, el horario
  // escolar se dibuja como un tramo comprimido (SCHOOL_SHARE del ancho) y el resto
  // del ancho se reparte en proporción al tiempo fuera del cole.
  var SCHOOL_SHARE = 0.12;
  function todayScale(){
    var b = dayBounds(), sc = schoolForDate(TODAY_DATE);
    var start = toHours(b.start), end = toHours(b.end), school = null;
    var segs = [{ from:start, to:end }];
    if(sc.on){
      var a = Math.max(toHours(sc.entry), start), z = Math.min(toHours(sc.exit), end);
      if(a < z){
        school = { from:a, to:z };
        segs = [{ from:start, to:a }, { from:a, to:z, school:true }, { from:z, to:end }]
          .filter(function(g){ return g.to > g.from; });
      }
    }
    var outside = segs.reduce(function(sum, g){ return sum + (g.school ? 0 : g.to - g.from); }, 0);
    var x = 0;
    segs.forEach(function(g){
      g.w = g.school ? (outside ? SCHOOL_SHARE : 1) : (1 - (school ? SCHOOL_SHARE : 0)) * (g.to - g.from) / outside;
      g.x = x; x += g.w;
    });
    function pos(t){
      if(t <= start){ return 0; }
      if(t >= end){ return 1; }
      for(var i = 0; i < segs.length; i++){
        var g = segs[i];
        if(t <= g.to){ return g.x + g.w * (t - g.from) / (g.to - g.from); }
      }
      return 1;
    }
    if(school){ school.x0 = pos(school.from); school.x1 = pos(school.to); }
    return { start:start, end:end, school:school, pos:pos };
  }

  function todayBlocks(){ return (TODAY_NEXT ? [TODAY_NEXT] : []).concat(TODAY_LATER_ALL).filter(function(e){ return e.kind === 'block'; }); }
  function todayEvents(){
    return (TODAY_NEXT ? [ {t:TODAY_NEXT.t, cat:TODAY_NEXT.cat, next:true} ] : []).concat(todayVisible().map(function(e){ return {t:e.t, cat:e.cat}; }))
      .sort(function(a, b){ return a.t - b.t; });
  }

  /* ---- Primeros pasos ----
     Para usar la App hacen falta, como mínimo, el nombre, la franja horaria y el horario escolar.
     Mientras falte algo, la App se abre en Configuración, las demás pestañas están bloqueadas y
     una tarjeta arriba dice qué falta (cada punto abre su bloque). */
  var SETUP_WAS_DONE = null;
  function setupMissing(){
    var m = [];
    if(!KID){ m.push({ key:'setup.name', group:'profile' }); }
    if(!boundsSet()){ m.push({ key:'setup.window', group:'hours' }); }
    if(!schoolSet()){ m.push({ key:'setup.school', group:'hours' }); }
    return m;
  }
  function setupDone(){ return !setupMissing().length; }
  function renderSetup(){
    var card = el('setup-card');
    if(!card){ return; }
    var missing = setupMissing(), done = !missing.length;
    card.hidden = done;
    el('setup-list').innerHTML = missing.map(function(m){
      return '<li><button type="button" class="setup-link" onclick="openCfgGroup(\'' + m.group + '\')">' + esc(t(m.key)) + '</button></li>';
    }).join('');
    document.querySelectorAll('.tab').forEach(function(tab){
      var locked = !done && tab.dataset.screen !== 'config';
      tab.classList.toggle('is-locked', locked);
      if(locked){ tab.setAttribute('aria-disabled', 'true'); } else { tab.removeAttribute('aria-disabled'); }
    });
    if(SETUP_WAS_DONE === false && done){ toast(t('setup.done')); }
    SETUP_WAS_DONE = done;
  }
  function openCfgGroup(name, noScroll){
    var g = document.querySelector('.cfg-group[data-group="' + name + '"]');
    if(!g){ return; }
    g.open = true;
    if(!noScroll){ g.scrollIntoView({ block:'start', behavior:'smooth' }); }
  }

  /* ---- Cuenta (Configuración): inicio de sesión con Google y personas del plan ----
     El estado lo lleva sync.js en window.SYNC y avisa con renderAccount() en cada cambio. */
  // Sin conexión la primera vez, la parte de Firebase no llega a cargar: se avisa en vez de esperar
  var SYNC_FAILED = false;
  setTimeout(function(){ if(!window.SYNC){ SYNC_FAILED = true; renderAccount(); } }, 10000);
  function renderAccount(){
    var box = el('account-body');
    if(!box){ return; }
    var S = window.SYNC || { status: SYNC_FAILED ? 'offline' : 'loading' };
    var h = '';
    if(S.status === 'offline'){
      h = '<p class="card-hint">' + t('sync.why') + '</p><p class="card-hint">' + t('sync.offline') + '</p>';
    } else if(S.status === 'unavailable'){
      h = '<p class="card-hint">' + t('sync.why') + '</p><p class="card-hint">' + t('sync.unavailable') + '</p>';
    } else if(S.status === 'loading'){
      h = '<p class="card-hint">' + t('sync.loading') + '</p>';
    } else if(S.status === 'out'){
      h = '<p class="card-hint">' + t('sync.why') + '</p>' +
          '<div><button type="button" class="btn-primary" onclick="syncSignIn()">' + t('sync.signIn') + '</button></div>';
    } else {
      h = '<div class="config-line"><span class="config-label">' + t('sync.signedAs') + ' <strong>' + esc(S.email) + '</strong></span></div>' +
          '<p class="card-hint">' + t('sync.synced') + '</p>' +
          '<span class="field-label">' + t('sync.members') + '</span>' +
          '<ul class="member-list">' + (S.members || []).map(function(m){
            var own = m === S.owner;
            return '<li><span class="member-email">' + esc(m) + (own ? ' <span class="muted">· ' + t('sync.owner') + '</span>' : '') + '</span>' +
              (S.isOwner && !own ? '<button type="button" class="btn-ghost" data-email="' + esc(m) + '" onclick="removeMember(this)">' + t('sync.remove') + '</button>' : '') + '</li>';
          }).join('') + '</ul>' +
          (S.isOwner
            ? '<form class="member-add" onsubmit="addMember(event)"><input class="txt-input" id="member-email" type="email" autocomplete="off" inputmode="email" placeholder="' + esc(t('sync.addPh')) + '">' +
              '<button type="submit" class="btn-primary">' + t('sync.add') + '</button></form>' +
              '<p class="card-hint">' + t('sync.membersHint') + '</p>'
            : '<p class="card-hint">' + esc(t('sync.sharedBy', { owner: S.owner })) + '</p>') +
          '<div><button type="button" class="btn-ghost" onclick="syncSignOut()">' + t('sync.signOut') + '</button></div>';
    }
    if(S.error){ h += '<p class="card-hint sync-error">' + esc(t('sync.error', { code: S.error })) + '</p>'; }
    box.innerHTML = h;
    var sum = el('sum-account');
    if(sum){ sum.textContent = S.status === 'in' ? S.email : (S.status === 'loading' ? t('sync.loading') : t('sum.signedOut')); }
    var hint = el('setup-signin');
    if(hint){ hint.hidden = S.status !== 'out'; }
    // La lectura del calendario escolar con IA necesita la sesión iniciada
    renderSchoolCal();
  }
  function addMember(ev){
    ev.preventDefault();
    var inp = el('member-email');
    var v = inp.value.trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){ toast(t('sync.badEmail')); inp.focus(); return; }
    window.syncAddMember(v).then(function(ok){ if(ok){ inp.value = ''; toast(t('sync.added')); } })
      .catch(function(e){ toast(t('sync.error', { code: e && e.code || e })); });
  }
  function removeMember(btn){
    window.syncRemoveMember(btn.dataset.email).then(function(ok){ if(ok){ toast(t('sync.removed')); } })
      .catch(function(e){ toast(t('sync.error', { code: e && e.code || e })); });
  }

  function renderToday(){
    loadTodayItems();
    var screen = document.getElementById('screen-today');
    screen.setAttribute('data-layout', APPEARANCE.layout);
    var r = todayScale();
    var bar = document.getElementById('today-bar');
    if(APPEARANCE.bar === 'nina'){ renderNinaBar(bar, r); } else { renderDotsBar(bar, r); }
    bar.insertAdjacentHTML('afterbegin', riskTriangle());
    var layout = document.getElementById('today-layout');
    if(!TODAY_NEXT){ layout.innerHTML = '<p class="today-empty">' + t('today.empty') + '</p>'; }
    else if(APPEARANCE.layout === 'postit1'){ renderPostit1(layout); }
    else if(APPEARANCE.layout === 'postit2'){ renderPostit2(layout); }
    else { renderList(layout); }
    // Los que no caben en el cuerpo se ven en la barra de tiempo
    var more = todayVisible().length - TODAY_LATER.length;
    if(more > 0){ layout.insertAdjacentHTML('beforeend', '<p class="today-more">' + t(more === 1 ? 'today.more1' : 'today.more', { n: more }) + '</p>'); }
    renderLoad();
    fitLoad();
    var hint = document.getElementById('bar-hint');
    if(hint){
      hint.textContent = t('hint.' + APPEARANCE.bar) + t('hint.range', { range: fmtHour(r.start) + '–' + fmtHour(r.end) }) +
        (r.school ? t('hint.rangeSchool', { school: fmtHour(r.school.from) + '–' + fmtHour(r.school.to) }) : '.');
    }
  }

  /* ---- Icono del colegio: edificio rojo con tejados grises, torre con reloj y cartel ---- */
  // Dibujo de 64 x 52 unidades con el origen en el centro del suelo.
  // Icono del colegio: la imagen elegida por el usuario (estilo cómic), sin el fondo blanco y
  // reducida a 180 px de ancho. Se coloca en la misma caja que usaban los dibujos anteriores:
  // 66 × 54 unidades con el origen en el centro del suelo.
  var SCHOOL_PNG = 'data:image/png;base64,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';
  function schoolIcon(){
    var w = 66, h = w * 137 / 180;
    return '<image href="' + SCHOOL_PNG + '" x="' + (-w / 2) + '" y="' + (-h).toFixed(2) + '" width="' + w + '" height="' + h.toFixed(2) + '"/>';
  }



  /* ---- Barra «Puntos» ---- */
  function renderDotsBar(host, r){
    function pct(t){ return r.pos(t) * 100; }
    var html = '<div class="day-strip"><div class="bar"></div>';
    if(r.school){
      var gw = (r.school.x1 - r.school.x0) * 100;
      html += '<div class="school-gap" style="left:' + (r.school.x0 * 100) + '%; width:' + gw + '%;"></div>' +
        '<svg class="school-icon" viewBox="-33 -53 66 54" aria-label="' + t('aria.school') + '" role="img" style="left:' + ((r.school.x0 + r.school.x1) * 50) + '%; width:max(' + (gw * 1.3).toFixed(1) + '%, 56px);">' + schoolIcon() + '</svg>';
    }
    // Bloques de trabajo: tramo rayado sobre la barra
    todayBlocks().forEach(function(e){
      html += '<div class="block-seg is-block" style="left:' + pct(e.t) + '%; width:' + (pct(e.end) - pct(e.t)) + '%;"></div>';
    });
    // Horas de los elementos: alternas abajo y arriba, empezando abajo por el más próximo (como en la barra de la niña)
    var ahead = 0;
    todayEvents().forEach(function(e){
      var p = pct(e.t), end = p > 97 ? ' at-end' : '';
      var below = e.t < NOW || ahead++ % 2 === 0, edge = p > 94 ? ' at-end' : (p < 6 ? ' at-start' : '');
      html += '<div class="ev-label' + edge + (e.next ? ' is-next' : '') + '" style="left:' + p + '%; top:' + (below ? 58 : 12) + 'px;">' + fmtHour(e.t) + '</div>';
      if(e.next){
        // Mismo código de color que la tarjeta del próximo (según lo que falta)
        var st = nextState(e.t) + '" style="' + catVars(e.cat) + ';left:' + p + '%;';
        html += '<div class="marker next-dot ' + st + ' top:16px; width:20px; height:20px;"></div>' +
                '<div class="stem next-stem ' + st + ' top:44px; height:14px; width:2px;"></div>';
      } else {
        html += '<div class="marker' + end + '" style="left:' + p + '%; top:28px; width:9px; height:9px; background:' + catColor(e.cat) + ';"></div>' +
                '<div class="stem' + end + '" style="left:' + p + '%; top:44px; height:12px; background:' + catColor(e.cat) + ';"></div>';
      }
    });
    var n = pct(NOW);   // sin etiqueta con la hora actual: solo la línea y el punto
    html += '<div class="now-line" style="left:' + n + '%; height:50px;"></div>' +
            '<div class="now-dot" style="left:' + n + '%; top:44px; width:12px; height:12px;"></div>' +
            '</div><div class="day-strip-scale"><span>' + fmtHour(r.start) + '</span>' +
            (r.school ? '<span class="scale-school" style="left:max(calc(' + ((r.school.x0 + r.school.x1) * 50) + '% - 29px), 36px)">' + fmtHour(r.school.from) + '–' + fmtHour(r.school.to) + '</span>' : '') +
            '<span>' + fmtHour(r.end) + '</span></div>';
    host.innerHTML = html;
  }

  /* ---- Barra «Niña soldado» (de boceto-today.html) ---- */
  var TL_X0 = 20, TL_X1 = 304, TL_Y = 58;

  function seeded(seed){
    var v = seed;
    return function(){ v = (v * 9301 + 49297) % 233280; return v / 233280; };
  }

  function boomPoints(seed, rOut, rIn, spikes){
    var rnd = seeded(seed), pts = [];
    for(var k = 0; k < spikes * 2; k++){
      var a = (k + (rnd() - .5) * .5) * Math.PI / spikes - Math.PI / 2;
      var rad = k % 2 ? rIn * (.85 + rnd() * .3) : rOut * (.72 + rnd() * .5);
      pts.push((Math.cos(a) * rad).toFixed(2) + ',' + (Math.sin(a) * rad).toFixed(2));
    }
    return pts.join(' ');
  }

  function explosion(e, i, x){
    var big = !!e.next, color = catColor(e.cat), sparks = '';
    // El próximo lleva el contorno del código de color (categoría / ámbar / rojo oscuro)
    var line = big ? { 'st-calm':inkOf(e.cat), 'st-soon':'var(--amber-line)', 'st-urgent':'var(--red-line)' }[nextState(e.t)] : 'var(--ink)';
    if(big){
      for(var k = 0; k < 6; k++){
        var a = k / 6 * Math.PI * 2 + .3;
        sparks += '<g class="spark" style="--sx:' + (Math.cos(a) * 17).toFixed(1) + 'px;--sy:' + (Math.sin(a) * 17).toFixed(1) + 'px">' +
          '<circle r="' + (k % 2 ? 1.1 : 1.6) + '" fill="' + (k % 2 ? '#ffe066' : color) + '" stroke="var(--ink)" stroke-width=".6"/></g>';
      }
    }
    return '<g transform="translate(' + x.toFixed(1) + ' ' + TL_Y + ')">' + sparks +
      '<g class="boom' + (big ? ' is-next' : '') + '" style="--dur:' + (2.6 + i * .45) + 's;--delay:' + (-i * .7) + 's">' +
        '<polygon points="' + boomPoints(7 + i * 13, big ? 18 : 14.5, 7.5, 11) + '" fill="' + color + '" stroke="' + line + '" stroke-width="' + (big ? 2.6 : 1.3) + '" stroke-linejoin="round"/>' +
        '<polygon points="' + boomPoints(3 + i * 29, big ? 9.5 : 7.5, 4.4, 9) + '" fill="' + (big ? '#ffe066' : '#fff4c2') + '" stroke="var(--ink)" stroke-width=".9" stroke-linejoin="round"/>' +
      '</g></g>';
  }

  // Extremidad articulada en (x, y) que oscila entre `from` y `to` grados.
  function limb(x, y, len, w, color, from, to, tip){
    return '<g transform="translate(' + x + ' ' + y + ')"><g>' +
      '<animateTransform attributeName="transform" type="rotate" values="' + from + ';' + to + ';' + from + '" dur="0.9s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines=".45 0 .55 1;.45 0 .55 1"/>' +
      '<line x1="0" y1="0" x2="0" y2="' + len + '" stroke="var(--ink)" stroke-width="' + (w + 1.8) + '" stroke-linecap="round"/>' +
      '<line x1="0" y1="0" x2="0" y2="' + len + '" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round"/>' +
      tip + '</g></g>';
  }

  function soldierGirl(){
    var OLIVE = '#6f7d3c', OLIVE_DARK = '#56622d', KHAKI = '#7d8a45', SKIN = '#f2c7a0', HAIR = '#6b3b1f';
    var boot = '<path d="M-2 9.3 h4.6 a1.7 1.7 0 0 1 0 3.4 h-4.6 z" fill="var(--ink)"/>';
    var hand = '<circle cx="0" cy="8.1" r="1.5" fill="' + SKIN + '" stroke="var(--ink)" stroke-width=".8"/>';
    return '<g class="w-bob">' +
      limb(-0.8, -12, 10.5, 3.2, OLIVE_DARK, 24, -24, boot) +
      limb(0, -21.5, 7.5, 2.6, OLIVE_DARK, -30, 30, hand) +
      '<rect x="-8.6" y="-24" width="6" height="10.5" rx="2" fill="' + OLIVE_DARK + '" stroke="var(--ink)" stroke-width="1.2"/>' +
      '<rect x="-3.4" y="-24.5" width="7.2" height="13" rx="2.8" fill="' + KHAKI + '" stroke="var(--ink)" stroke-width="1.3"/>' +
      '<rect x="-3.4" y="-14.6" width="7.2" height="2" fill="var(--ink)"/>' +
      '<rect x="0.2" y="-14.4" width="1.6" height="1.6" fill="#e8b839"/>' +
      '<ellipse class="ponytail" cx="-5.6" cy="-28.4" rx="3" ry="1.7" fill="' + HAIR + '" stroke="var(--ink)" stroke-width="1"/>' +
      '<circle cx="1" cy="-29.5" r="4.6" fill="' + SKIN + '" stroke="var(--ink)" stroke-width="1.3"/>' +
      '<ellipse cx="3.1" cy="-29.6" rx=".75" ry="1" fill="var(--ink)"/>' +
      '<circle cx="3.4" cy="-27.6" r="1" fill="#ea8f8f" opacity=".8"/>' +
      '<path d="M2.2 -26.3 q1 .8 2.1 0" fill="none" stroke="var(--ink)" stroke-width=".8" stroke-linecap="round"/>' +
      '<path d="M-3.6 -29.8 q.6 4.6 4.4 5.2" fill="none" stroke="var(--ink)" stroke-width=".8"/>' +
      '<path d="M-4.9 -30.6 C-4.9 -37.6 7.1 -37.6 7.1 -30.6 Z" fill="' + OLIVE + '" stroke="var(--ink)" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<circle cx="3.8" cy="-33.1" r="1" fill="' + OLIVE_DARK + '"/>' +
      '<circle cx="-1.4" cy="-32.5" r=".8" fill="' + OLIVE_DARK + '"/>' +
      '<path d="M-2.2 -34.1 q2.4 -1.8 5 -.8" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".9" stroke-linecap="round"/>' +
      '<rect x="-6.2" y="-31.4" width="14.6" height="2" rx="1" fill="' + OLIVE_DARK + '" stroke="var(--ink)" stroke-width="1.1"/>' +
      limb(0.8, -12, 10.5, 3.2, OLIVE, -24, 24, boot) +
      limb(0.6, -21.5, 7.5, 2.6, KHAKI, 30, -30, hand) +
    '</g>';
  }

  function renderNinaBar(host, r){
    function xAt(t){ return TL_X0 + r.pos(t) * (TL_X1 - TL_X0); }
    var nowX = xAt(NOW), events = todayEvents();
    var inSchool = r.school && NOW > r.school.from && NOW < r.school.to;
    var track = 'M20 52 H316 V44 L338 58 L316 72 V64 H20 A6 6 0 0 1 20 52 Z';
    var nowLabel = '';   // sin etiqueta con la hora actual: la niña marca el momento
    var svg =
      '<svg viewBox="0 -2 350 96" role="img" aria-label="Ahora ' + fmtHour(NOW) + '; próximos: ' + events.map(function(e){ return fmtHour(e.t); }).join(', ') + '">' +
      '<defs>' +
        '<clipPath id="trackClip"><path d="' + track + '"/></clipPath>' +
        '<pattern id="blockHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
          '<rect width="8" height="8" fill="var(--cat-tarea)"/><rect width="4" height="8" fill="#fff" fill-opacity=".38"/>' +
        '</pattern>' +
        '<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
          '<rect width="6" height="6" fill="var(--accent-soft)"/>' +
          '<line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent)" stroke-opacity=".45" stroke-width="2"/>' +
        '</pattern>' +
      '</defs>' +
      '<path d="' + track + '" fill="var(--surface)"/>' +
      '<rect x="0" y="40" width="' + nowX + '" height="40" fill="url(#hatch)" clip-path="url(#trackClip)"/>' +
      todayBlocks().map(function(e){
        return '<rect x="' + xAt(e.t).toFixed(1) + '" y="53" width="' + (xAt(e.end) - xAt(e.t)).toFixed(1) + '" height="10" rx="2" fill="url(#blockHatch)" stroke="var(--cat-tarea-ink)" stroke-width=".8" clip-path="url(#trackClip)"/>';
      }).join('') +
      '<path d="' + track + '" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round"/>';
    // El cole se dibuja sobre el camino: la niña entra al empezar y sale al terminar
    if(r.school){
      var tx0 = xAt(r.school.from), tx1 = xAt(r.school.to), tw = tx1 - tx0;
      var sk = Math.max(tw, 48) / 64;
      svg += '<g transform="translate(' + ((tx0 + tx1) / 2).toFixed(1) + ' 68) scale(' + sk.toFixed(3) + ')">' + schoolIcon() + '</g>' +
        '<text class="tl-label is-muted" x="' + Math.max(tx0 + tw / 2 - 30, 56).toFixed(1) + '" y="88" text-anchor="start">' + fmtHour(r.school.from) + '–' + fmtHour(r.school.to) + '</text>';
    }
    // Horas alternas abajo y arriba del camino, empezando abajo por la más próxima
    // (así, cerca de la niña, la etiqueta no se cruza con el dibujo).
    var ahead = 0;
    events.forEach(function(e, i){
      var x = xAt(e.t), below = e.t < NOW || ahead++ % 2 === 0;
      svg += explosion(e, i, x) + '<text class="tl-label" x="' + x.toFixed(1) + '" y="' + (below ? 88 : 30) + '" text-anchor="middle">' + fmtHour(e.t) + '</text>';
    });
    if(!events.length || xAt(events[0].t) - TL_X0 > 40){
      svg += '<text class="tl-label is-muted" x="20" y="88" text-anchor="start">' + fmtHour(r.start) + '</text>';
    }
    svg += '<polygon points="' + (nowX - 4) + ',72 ' + (nowX + 4) + ',72 ' + nowX + ',66" fill="var(--ink)"/>' + nowLabel +
      (inSchool ? '' : '<g transform="translate(' + nowX.toFixed(1) + ' 52) scale(1.5)">' + soldierGirl() + '</g>') + '</svg>';
    host.innerHTML = '<div class="timeline">' + svg + '</div>';
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){ host.querySelector('svg').pauseAnimations(); }
  }

  /* ---- Tema «Lista» ---- */
  function renderList(host){
    var n = TODAY_NEXT;
    // Solo el primer deadline lleva detalles; los siguientes, hora y nombre
    var chips = TODAY_LATER.map(function(e){
      return '<div class="later-chip' + blk(e) + '" ' + todayOpen(e) + ' style="' + catVars(e.cat) + '">' +
        todayCheck(e) + '<div class="later-time">' + fmtHour(e.t) + '</div>' +
        '<div class="later-title">' + esc(e.title) + '</div>' + laterLeave(e) + '</div>';
    }).join('');
    host.innerHTML =
      '<div><div class="section-eyebrow" style="color:var(--warn-ink)">' + t('today.soon', { t: untilText(n.t) }) + '</div>' +
      '<div class="up-next-card' + blk(n) + nextCardAttrs(n) + '" ' + todayOpen(n) + '>' + todayCheck(n) + '<div style="display:flex; align-items:baseline; gap:10px;">' +
        '<span class="up-next-time">' + fmtHour(n.t) + '</span><span class="up-next-title">' + n.title + '</span></div>' +
        (placeLine(n) ? '<div class="up-next-sub">' + placeLine(n) + '</div>' : '') +
        (n.leaves ? '<div class="hero-leave">' + leaveChips(n) + '</div>' : '') + '</div></div>' +
      (chips ? '<div><div class="section-eyebrow" style="color:var(--text-muted)">' + t('today.later') + '</div><div class="later-row">' + chips + '</div></div>' : '');
  }

  /* ---- Tema «Post-it 1» (Design.html · Siguiente ahora) ---- */
  function renderPostit1(host){
    var n = TODAY_NEXT;
    var cards = TODAY_LATER.map(function(e, i){   // siguientes: solo hora y nombre
      return '<div class="fan-card' + blk(e) + '" ' + todayOpen(e) + ' style="' + catVars(e.cat) + ';z-index:' + (i + 1) + '">' +
        todayCheck(e) + '<div class="fan-time">' + fmtHour(e.t) + '</div>' +
        '<div class="fan-title">' + esc(e.title) + '</div>' + laterLeave(e) + '</div>';
    }).join('');
    host.innerHTML =
      '<div><div class="hero-eyebrow">' + t('today.nowSoon', { t: untilText(n.t) }) + '</div>' +
      '<div class="hero-card' + blk(n) + nextCardAttrs(n) + '" ' + todayOpen(n) + '>' + todayCheck(n) +
        '<div class="hero-head"><span class="hero-time">' + fmtHour(n.t) + '</span><span class="hero-title">' + esc(n.title) + '</span></div>' +
        (placeLine(n) ? '<div class="hero-place">' + placeLine(n) + '</div>' : '') +
        (n.leaves ? '<div class="hero-leave">' + leaveChips(n) + '</div>' : '') + '</div></div>' +
      (cards ? '<div><div class="section-eyebrow" style="color:var(--text-muted)">' + t('today.afterToday') + '</div><div class="fan">' + cards + '</div></div>' : '');
  }

  /* ---- Tema «Post-it 2» (boceto-today.html) ---- */
  // Escalonadas hacia la derecha para que la hora (esquina superior derecha) de cada una quede a la vista
  var NOTE_SLOTS = [ { x:'0%', y:10, rot:-7 }, { x:'26%', y:64, rot:-2 }, { x:'47%', y:112, rot:5 } ];
  var NOTE_FLOAT = [
    { dur:'5.6s', delay:'-0.8s', sway:'1.4deg' },
    { dur:'6.8s', delay:'-3.1s', sway:'-1.2deg' },
    { dur:'6.1s', delay:'-1.9s', sway:'1.8deg' }
  ];
  var noteOrder = [];

  function renderPostit2(host){
    var n = TODAY_NEXT;
    // El orden de los post-its sigue a los que quedan (si se marca uno como hecho, sale)
    var ids = TODAY_LATER.map(function(e){ return e.id; });
    noteOrder = noteOrder.filter(function(id){ return ids.indexOf(id) >= 0; })
      .concat(ids.filter(function(id){ return noteOrder.indexOf(id) < 0; }));
    host.innerHTML =
      '<div class="pi-next' + blk(n) + nextCardAttrs(n) + '" ' + todayOpen(n) + '>' +
        '<span class="pi-next-time">' + fmtHour(n.t) + '</span>' +
        '<span class="pi-next-main"><span class="pi-next-title">' + esc(n.title) + '</span>' +
          (placeLine(n) ? '<span class="pi-next-place">' + placeLine(n) + '</span>' : '') + '</span>' +
        '<span class="pi-next-side"><span class="pi-next-when">' + t('today.in', { t: untilText(n.t) }) + '</span>' +
        (n.leaves ? '<span class="pi-next-leave">' + leaveChips(n) + '</span>' : '') + todayCheck(n) + '</span></div>' +
      (TODAY_LATER.length ? '<div class="board" aria-label="' + t('aria.later') + '"></div>' : '');
    if(!TODAY_LATER.length){ return; }
    var board = host.querySelector('.board'), els = {};
    TODAY_LATER.forEach(function(item, i){
      var f = NOTE_FLOAT[i % NOTE_FLOAT.length];
      var note = document.createElement('div');
      note.className = 'note';
      note.tabIndex = 0;
      note.setAttribute('role', 'button');
      note.setAttribute('aria-label', fmtHour(item.t) + ' ' + item.title + '. ' + t('aria.front'));
      note.setAttribute('style', catVars(item.cat) + ';--dur:' + f.dur + ';--delay:' + f.delay + ';--sway:' + f.sway + ';--in-delay:' + (0.15 + i * 0.18) + 's');
      // Siguientes: solo hora y nombre
      note.innerHTML = '<div class="note-shadow"></div><div class="note-card' + blk(item) + '">' +
        todayCheck(item) + '<div class="n-head"><span class="n-time">' + fmtHour(item.t) + '</span></div>' +
        '<div class="n-title">' + esc(item.title) + '</div>' + laterLeave(item) + '</div>';
      // Un post-it de detrás viene al frente; el de delante se abre en su pantalla
      function front(){
        var k = noteOrder.indexOf(item.id);
        if(k > 0){ noteOrder.splice(k, 1); noteOrder.unshift(item.id); placeNotes(els); }
        else { openFromToday(item.id); }
      }
      note.addEventListener('click', front);
      note.addEventListener('keydown', function(e){
        if(e.target === note && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); front(); }
      });
      els[item.id] = note;
      board.appendChild(note);
    });
    placeNotes(els);
  }

  // Móviles pequeños: post-its más pequeños y más juntos
  var SMALL_PHONE = window.matchMedia('(max-width:360px), (max-height:620px)');
  function noteY(sl){ return SMALL_PHONE.matches ? Math.round(sl.y * 0.95) : sl.y; }
  SMALL_PHONE.addEventListener('change', function(){ if(el('screen-today').classList.contains('active')){ renderToday(); } });
  function placeNotes(els){
    noteOrder.forEach(function(id, slot){
      var sl = NOTE_SLOTS[slot] || NOTE_SLOTS[NOTE_SLOTS.length - 1], el = els[id];
      el.style.setProperty('--x', sl.x);
      el.style.setProperty('--y', noteY(sl) + 'px');
      el.style.setProperty('--rot', sl.rot + 'deg');
      el.style.setProperty('--z', String(10 - slot));
    });
    // El tablero crece si algún post-it tiene más texto (pantallas estrechas)
    var board = els[noteOrder[0]].parentNode, h = 0;
    noteOrder.forEach(function(id, slot){
      var sl = NOTE_SLOTS[slot] || NOTE_SLOTS[NOTE_SLOTS.length - 1];
      h = Math.max(h, noteY(sl) + els[id].offsetHeight);
    });
    board.style.height = (h + 18) + 'px';
  }

  var toastTimer;
  // action (opcional): { label, fn } → botón en el aviso, p. ej. «Deshacer»
  function toast(msg, action){
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.toggle('has-action', !!action);
    if(action){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'toast-action'; b.textContent = action.label;
      b.onclick = function(){ el.classList.remove('show'); clearTimeout(toastTimer); action.fn(); };
      el.appendChild(b);
    }
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ el.classList.remove('show'); }, action ? 4500 : 2200);
  }

  /* ---- Categorías y prioridades (editable) ---- */
  var CAT_PALETTE = ['#4fc3f7','#b39ddb','#4cd6a0','#b7bfcb','#8c9eff','#4dd0e1'];

  function cycleColor(btn){
    var current = getComputedStyle(btn).backgroundColor;
    var idx = 0;
    for(var i=0;i<CAT_PALETTE.length;i++){
      if(hexToRgb(CAT_PALETTE[i]) === current){ idx = i; break; }
    }
    var next = CAT_PALETTE[(idx+1) % CAT_PALETTE.length];
    if(!btn.closest('.cat-row').classList.contains('is-editing')){ return; }
    btn.style.background = next;
    var select = btn.closest('.cat-row').querySelector('.priority-select');
    if(select){ select.style.background = next; }
    renderExportCats();
  }

  function hexToRgb(hex){
    var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return 'rgb(' + r + ', ' + g + ', ' + b + ')';
  }

  function onPriorityChange(select){
    var name = rowName(select.closest('.cat-row'));
    toast(t('toast.prio', { name: name, p: select.options[select.selectedIndex].text }));
    renderExportCats();
  }

  // Borrar categoría: si tiene eventos o actividades activos asociados, aviso con doble
  // confirmación; al confirmar se cancela todo lo asociado (con las tareas de los eventos).
  var catToDelete = null;
  function removeCategory(btn){
    var row = btn.closest('.cat-row');
    var linked = linkedToCategory(row.dataset.cat);
    if(!linked.length){ deleteCategoryRow(row, []); return; }
    catToDelete = { row: row, linked: linked, step: 1 };
    var name = rowName(row);
    el('cat-del-title').textContent = t('del.title', { name: name });
    el('cat-del-body').textContent = t(linked.length === 1 ? 'del.body1' : 'del.body', { n: linked.length });
    el('cat-del-list').innerHTML = linked.map(function(it){ return '<li><strong>' + esc(it.name) + '</strong> · ' + esc(it.when) + '</li>'; }).join('');
    el('cat-del-warn').textContent = t('del.warn');
    var go = el('cat-del-go');
    go.classList.remove('is-confirm');
    go.textContent = t('del.continue');
    el('cat-del-dialog').showModal();
  }
  function confirmCatDelete(){
    var d = catToDelete, go = el('cat-del-go');
    if(!d){ return; }
    if(d.step === 1){
      // Segunda confirmación
      d.step = 2;
      el('cat-del-warn').textContent = t('del.step2', { name: rowName(d.row), n: d.linked.length });
      go.classList.add('is-confirm');
      go.textContent = t('del.confirm', { n: d.linked.length });
      return;
    }
    deleteCategoryRow(d.row, d.linked);
    closeCatDelete();
  }
  function closeCatDelete(){ catToDelete = null; el('cat-del-dialog').close(); }

  // Eventos activos (aún no terminados) y actividades de una categoría
  function linkedToCategory(id){
    var now = appNow();
    return USER_EVENTS.filter(function(e){
      if(e.cat !== id){ return false; }
      var end = isoDate(e.date); end.setMinutes(Math.round(toHours(e.time) * 60) + (e.dur || 60));
      return end > now;
    }).map(function(e){
      return { kind:'event', id:e.id, name:e.name, when: fmtDay(e.date) + ' ' + e.time + (e.task ? ' · ' + t('del.withTask') : '') };
    }).concat(USER_ACTS.filter(function(a){ return a.cat === id; }).map(function(a){
      // Las actividades recurrentes siempre están activas
      return { kind:'activity', id:a.id, name:a.name, when: sessionsText(a) + (a.task ? ' · ' + t('del.withTask') : '') };
    }));
  }

  function deleteCategoryRow(row, linked){
    var name = rowName(row), id = row.dataset.cat;
    var ids = linked.map(function(it){ return it.id; });
    USER_EVENTS = USER_EVENTS.filter(function(e){ return ids.indexOf(e.id) < 0; });
    USER_ACTS = USER_ACTS.filter(function(a){ return ids.indexOf(a.id) < 0; });
    storeActivities();
    renderActivities();
    renderTasks();
    // Los eventos pasados conservan su copia de la categoría; no se vuelve a crear al recargar
    DELETED_CATS.push(id);
    storeEvents();
    row.remove();
    renderExportCats();
    queueSaveSettings();
    toast(linked.length ? t(linked.length === 1 ? 'toast.catDeletedAll1' : 'toast.catDeletedAll', { name: name, n: linked.length }) : t('toast.catDeleted', { name: name }));
  }


  // Categorías tal como están en Configuración: {id, name, color, prio}
  function getCategories(){
    return Array.prototype.map.call(document.querySelectorAll('#category-list .cat-row'), function(row){
      if(!row.dataset.cat){ row.dataset.cat = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
      return { id: row.dataset.cat, name: rowName(row), color: row.querySelector('.row-bar').style.background,
               prio: row.querySelector('.priority-select').value };
    });
  }
  function findCategory(id){ return getCategories().filter(function(c){ return c.id === id; })[0] || null; }

  // opts (desde Eventos): {id, name, color, prio} → se crea ya terminada, sin modo edición
  function addCategory(opts){
    var list = document.getElementById('category-list');
    var color = (opts && opts.color) || CAT_PALETTE[list.children.length % CAT_PALETTE.length];
    var row = document.createElement('div');
    row.className = 'row cat-row';
    row.innerHTML =
      '<button class="row-bar swatch" style="background:' + color + '" onclick="cycleColor(this)" aria-label="' + t('aria.catColor') + '" title="' + t('aria.catColor') + '"></button>' +
      '<div class="row-body"><input class="cat-name-input" value="' + esc(opts ? opts.name : t('cat.new')) + '" readonly aria-label="' + t('aria.catName') + '" onkeydown="if(event.key===\'Enter\'){ editCategory(this); }"></div>' +
      '<button class="row-edit" onclick="editCategory(this)" aria-label="' + t('aria.catEdit') + '" title="' + t('aria.catEdit') + '"></button>' +
      '<button class="row-delete" onclick="removeCategory(this)" aria-label="' + t('aria.catDelete') + '" title="' + t('aria.catDelete') + '">×</button>' +
      '<select class="priority-select" style="background:' + color + '" onchange="onPriorityChange(this)" aria-label="' + t('aria.catPrio') + '">' +
        '<option value="Alta">' + t('prio.Alta') + '</option><option value="Media" selected>' + t('prio.Media') + '</option><option value="Baja">' + t('prio.Baja') + '</option>' +
      '</select>';
    row.querySelector('.row-edit').innerHTML = PENCIL_SVG;
    row.dataset.cat = (opts && opts.id) || 'u' + Date.now().toString(36);
    if(opts && opts.prio){ row.querySelector('.priority-select').value = opts.prio; }
    list.appendChild(row);
    renderExportCats();
    if(!opts){ editCategory(row.querySelector('.row-edit')); }   // desde Configuración empieza en modo edición
    queueSaveSettings();
    return row;
  }

  // Lápiz: activa la edición del nombre y del color; el mismo botón (✓) o Intro la terminan
  var PENCIL_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
  var CHECK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  function editCategory(el){
    var row = el.closest('.cat-row'), input = row.querySelector('.cat-name-input'), btn = row.querySelector('.row-edit');
    var editing = !row.classList.contains('is-editing');
    // Solo una categoría en edición a la vez
    if(editing){ document.querySelectorAll('.cat-row.is-editing').forEach(function(r){ editCategory(r.querySelector('.row-edit')); }); }
    row.classList.toggle('is-editing', editing);
    input.readOnly = !editing;
    btn.innerHTML = editing ? CHECK_SVG : PENCIL_SVG;
    btn.setAttribute('aria-label', t(editing ? 'aria.catDone' : 'aria.catEdit'));
    btn.setAttribute('title', t(editing ? 'aria.catDone' : 'aria.catEdit'));
    if(editing){ input.focus(); input.select(); }
    else { if(!input.value.trim()){ input.value = t('cat.new'); } renderExportCats(); }
  }

  /* ---- Ajustes guardados en el dispositivo ----
     Franja horaria, horario escolar, categorías (nombre, color, prioridad y orden) y exportación
     a Google Calendar. Se guardan tras cualquier cambio en Configuración y al crear o borrar
     una categoría desde otra pantalla. */
  var SETTINGS_READY = false, settingsTimer = null;
  function queueSaveSettings(){ clearTimeout(settingsTimer); settingsTimer = setTimeout(saveSettings, 200); }
  function saveSettings(){
    if(!SETTINGS_READY){ return; }
    var exportCats = {};
    var rows = document.querySelectorAll('#category-list .cat-row');
    document.querySelectorAll('#export-cats input').forEach(function(i, idx){ if(rows[idx]){ exportCats[rows[idx].dataset.cat] = i.checked; } });
    var data = {
      bounds: { start: el('day-start').value, end: el('day-end').value },
      school: SCHOOL,
      categories: getCategories(),
      exportOn: el('export-switch').getAttribute('aria-checked') === 'true',
      exportCats: exportCats,
      leaveAlert: el('leave-switch').getAttribute('aria-checked') === 'true'
    };
    try{ localStorage.setItem('app-settings', JSON.stringify(data)); }catch(e){}
  }
  function loadSettings(){
    var data = null;
    try{ data = JSON.parse(localStorage.getItem('app-settings') || 'null'); }catch(e){}
    if(data){
      if(data.bounds){ el('day-start').value = data.bounds.start || ''; el('day-end').value = data.bounds.end || ''; }
      el('day-start').dataset.prev = el('day-start').value; el('day-end').dataset.prev = el('day-end').value;
      if(data.school){
        SCHOOL = data.school;
        el('school-week-entry').value = SCHOOL.week.entry; el('school-week-exit').value = SCHOOL.week.exit;
        el('school-sat-entry').value = SCHOOL.sat.entry;   el('school-sat-exit').value = SCHOOL.sat.exit;
        el('sat-switch').setAttribute('aria-checked', String(!!SCHOOL.sat.on));
        el('sat-times').hidden = !SCHOOL.sat.on;
      }
      if(data.categories){
        var list = el('category-list'), ids = data.categories.map(function(c){ return c.id; });
        // Las que se borraron (salvo las de serie, que no se pueden borrar) desaparecen
        list.querySelectorAll('.cat-row').forEach(function(row){
          if(ids.indexOf(row.dataset.cat) < 0 && !row.dataset.default){ row.remove(); }
        });
        data.categories.forEach(function(c){
          var row = list.querySelector('.cat-row[data-cat="' + c.id + '"]');
          if(!row){ row = addCategory(c); }
          var input = row.querySelector('.cat-name-input'), bar = row.querySelector('.row-bar'), sel = row.querySelector('.priority-select');
          if(input && c.name){ input.value = c.name; }
          if(!row.dataset.default && c.color){ bar.style.background = c.color; sel.style.background = c.color; }
          if(c.prio){ sel.value = c.prio; }
          list.appendChild(row);   // mismo orden que al guardar
        });
      }
      el('export-switch').setAttribute('aria-checked', String(!!data.exportOn));
      el('export-options').hidden = !data.exportOn;
      if(data.leaveAlert === false){ el('leave-switch').setAttribute('aria-checked', 'false'); }
      renderExportCats();
      if(data.exportCats){
        var rows = document.querySelectorAll('#category-list .cat-row');
        document.querySelectorAll('#export-cats input').forEach(function(i, idx){
          var v = rows[idx] && data.exportCats[rows[idx].dataset.cat];
          if(v === false){ i.checked = false; }
        });
      }
    }
    SETTINGS_READY = true;
    // Cualquier cambio en Configuración se guarda
    ['change', 'input', 'click'].forEach(function(type){ el('screen-config').addEventListener(type, queueSaveSettings); });
  }

  /* ---- Franja horaria y horario escolar ---- */
  // Vacíos al instalar: hasta que se configuren, no hay cole y la App planifica todo el día
  var SCHOOL = {
    week: {entry:'', exit:''},            // lunes a viernes
    sat:  {on:false, entry:'', exit:''}   // clases el sábado (opcional)
  };
  var DEFAULT_BOUNDS = {'day-start':'00:00', 'day-end':'23:59'};
  function boundsSet(){ return !!(el('day-start').value && el('day-end').value); }
  function schoolSet(){ return !!(SCHOOL.week.entry && SCHOOL.week.exit); }
  var TIME_RE = /^\d{2}:\d{2}$/;

  function toHours(t){ var p = t.split(':'); return +p[0] + (+p[1]) / 60; }
  function dayBounds(){
    return { start: document.getElementById('day-start').value || DEFAULT_BOUNDS['day-start'],
             end:   document.getElementById('day-end').value   || DEFAULT_BOUNDS['day-end'] };
  }

  // Horario del cole para un día de la semana (lunes = 0). Domingos y
  // festivos/no lectivos del calendario escolar: sin cole.
  function schoolFor(day){
    if(day < 5){ return schoolSet() ? {on:true, entry:SCHOOL.week.entry, exit:SCHOOL.week.exit} : {on:false}; }
    if(day === 5){ return SCHOOL.sat.on && SCHOOL.sat.entry && SCHOOL.sat.exit ? SCHOOL.sat : {on:false}; }
    return {on:false};
  }
  // Festivos y días no lectivos. Salen del calendario escolar de Config de una de dos formas:
  //  - 'source': leídos del archivo o enlace con IA y revisados antes de guardarlos (NO_SCHOOL_READ);
  //  - 'manual': insertados a mano, como días sueltos o periodos; entonces el archivo o enlace no se lee.
  // Las dos listas son periodos { id, from, to, name } con fechas ISO; NO_SCHOOL_DATES son los días sueltos.
  var NO_SCHOOL_READ = [], NSD_MANUAL = [], SCHOOL_MODE = 'source', NO_SCHOOL_DATES = [];
  try{ NO_SCHOOL_READ = JSON.parse(localStorage.getItem('no-school-read') || '[]') || []; }catch(e){ NO_SCHOOL_READ = []; }
  try{ NSD_MANUAL = JSON.parse(localStorage.getItem('no-school-manual') || '[]') || []; }catch(e){ NSD_MANUAL = []; }
  try{ if(localStorage.getItem('school-cal-mode') === 'manual'){ SCHOOL_MODE = 'manual'; } }catch(e){}
  function refreshNoSchool(){
    var out = [];
    (SCHOOL_MODE === 'manual' ? NSD_MANUAL : NO_SCHOOL_READ).forEach(function(r){
      for(var d = isoDate(r.from), z = isoDate(r.to); d <= z; d.setDate(d.getDate() + 1)){
        var k = isoOf(d);
        if(out.indexOf(k) < 0){ out.push(k); }
      }
    });
    NO_SCHOOL_DATES = out;
  }
  refreshNoSchool();
  // De dónde sale el calendario escolar (Config > Enlaces): un archivo subido (PDF, Word o imagen)
  // o un enlace (p. ej. un archivo en Google Drive). Se guardan sus datos, no el archivo: el archivo
  // se lee con IA en el servidor (functions/) nada más subirlo, mientras sigue en memoria (SCHOOL_FILE).
  //   { kind:'file', name, size, ext, read? }  ·  { kind:'link', url, read? }
  //   read = { at, year, notes }: cuándo se guardó lo leído, el curso y los avisos de la IA
  var SCHOOL_CAL = null, SCHOOL_FILE = null;
  try{ SCHOOL_CAL = JSON.parse(localStorage.getItem('school-cal') || 'null'); }catch(e){ SCHOOL_CAL = null; }
  var SCHOOL_CAL_MAX = 10 * 1024 * 1024;
  var SCHOOL_CAL_EXT = { pdf:'PDF', docx:'DOC', png:'IMG', jpg:'IMG', jpeg:'IMG', gif:'IMG', webp:'IMG', heic:'IMG', heif:'IMG' };
  var LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  // Lectura en curso (READING: el número de lectura, para ignorar la respuesta si entretanto cambia
  // la fuente) y resultado pendiente de revisar, guardado solo en este móvil.
  // READ_PENDING es { periods… } para revisar o { questions } si la IA necesita saber algo antes de leer.
  var READING = 0, READ_SEQ = 0, READ_PENDING = null;
  try{ READ_PENDING = JSON.parse(localStorage.getItem('school-read-pending') || 'null'); }catch(e){ READ_PENDING = null; }
  // Respuestas de la familia a las preguntas de la IA ([{ q, a }], compartidas por el plan): se mandan
  // en cada lectura, también con otro calendario, para que no vuelva a preguntar lo mismo
  var READ_ANSWERS = [];
  try{ READ_ANSWERS = JSON.parse(localStorage.getItem('school-read-answers') || '[]') || []; }catch(e){ READ_ANSWERS = []; }
  function storeReadAnswers(){ try{ localStorage.setItem('school-read-answers', JSON.stringify(READ_ANSWERS)); }catch(e){} }

  function setSchoolCal(v){
    SCHOOL_CAL = v;
    try{ if(v){ localStorage.setItem('school-cal', JSON.stringify(v)); } else { localStorage.removeItem('school-cal'); } }catch(e){}
    renderSchoolCal();
    updateConfigSummaries();
  }
  function setReadPending(v){
    READ_PENDING = v;
    try{ if(v){ localStorage.setItem('school-read-pending', JSON.stringify(v)); } else { localStorage.removeItem('school-read-pending'); } }catch(e){}
  }
  function storeNoSchoolRead(){ try{ localStorage.setItem('no-school-read', JSON.stringify(NO_SCHOOL_READ)); }catch(e){} }
  function isDriveUrl(u){ return /(^|\.)(drive|docs)\.google\.com$/i.test(u.hostname); }
  function fmtSize(b){
    var mb = b >= 1024 * 1024, n = mb ? b / 1048576 : Math.max(1, Math.round(b / 1024));
    return new Intl.NumberFormat(LOCALES[LANG], { maximumFractionDigits: mb ? 1 : 0 }).format(n) + (mb ? ' MB' : ' KB');
  }
  function signedIn(){ return !!(window.SYNC && window.SYNC.status === 'in'); }
  // Se puede leer (o volver a leer) un enlace siempre; un archivo, solo mientras sigue en memoria
  function canRead(){ return !!SCHOOL_CAL && (SCHOOL_CAL.kind === 'link' || !!SCHOOL_FILE); }

  function renderSchoolCal(){
    var c = SCHOOL_CAL, chip = el('school-cal-chip'), manual = SCHOOL_MODE === 'manual';
    if(!chip){ return; }
    document.querySelectorAll('[data-school-mode]').forEach(function(b){
      var on = b.dataset.schoolMode === SCHOOL_MODE;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    var reviewing = !!(c && !manual && READ_PENDING && !READING);   // revisión o preguntas a la vista
    var asking = reviewing && !!READ_PENDING.questions;
    var read = !!(c && c.read);
    // A mano: el archivo o enlace (si lo hay) se ve tachado y con «Lectura desactivada»; no se puede cambiar
    chip.className = 'status-chip ' + (manual || !c ? 'off' : READING || reviewing ? 'pending' : read ? 'ok' : 'off');
    chip.textContent = manual ? t('schoolCal.off') : !c ? t('schoolCal.none') :
      READING ? t('read.chipReading') : asking ? t('read.chipQuestion') : reviewing ? t('read.chipReview') :
      read ? (NO_SCHOOL_READ.length === 1 ? t('read.chipOne') : t('read.chipN', { n: NO_SCHOOL_READ.length })) : t('read.chipUnread');
    el('school-cal-line').hidden = manual && !c;
    el('school-cal-src').hidden = !c;
    el('school-cal-src').classList.toggle('is-off', manual);
    el('school-cal-hint').hidden = manual || !!c;
    el('school-manual').hidden = !manual;
    if(manual){ closeSchoolCalLink(); }
    el('school-cal-actions').hidden = manual || !el('school-cal-linkbox').hidden;
    // Estado de la lectura: leyendo, falta iniciar sesión, hay que volver a subir el archivo…
    var st = el('school-cal-pending'), msg = '';
    if(c && !manual && !reviewing){
      if(READING){ msg = t('read.reading'); }
      else if(!signedIn()){ msg = t('read.needSignIn'); }
      else if(!read && !canRead()){ msg = t('read.reupload'); }
      else if(read){
        msg = t('read.savedOn', { date: fmtDate(new Date(c.read.at), { day:'numeric', month:'short', year:'numeric' }) }) +
          (c.read.year ? ' · ' + t('read.year', { year: c.read.year }) : '');
      }
    }
    st.textContent = msg; st.hidden = !msg;
    st.classList.toggle('is-busy', !!READING);
    // Lo que ya se ha respondido a la IA, con la opción de olvidarlo
    var ans = el('school-cal-answers');
    ans.hidden = !c || manual || reviewing || !READ_ANSWERS.length;
    el('school-cal-answers-text').textContent = t('read.answersUsed', { list: READ_ANSWERS.map(function(x){ return x.a; }).join(' · ') });
    var notes = el('school-cal-notes');
    notes.textContent = c && read && !manual && !reviewing && c.read.notes ? c.read.notes : '';
    notes.hidden = !notes.textContent;
    var rb = el('school-cal-read');
    rb.hidden = !c || READING || reviewing || !canRead();
    rb.disabled = !signedIn();
    rb.textContent = t(read ? 'read.again' : 'read.now');
    var rm = el('school-cal-remove');
    rm.hidden = !c; rm.classList.remove('is-confirm'); rm.textContent = t('schoolCal.remove');
    el('school-cal-actions').querySelectorAll('button').forEach(function(b){ if(b !== rb){ b.disabled = !!READING; } });
    // Con el botón de leer a la vista, subir otro archivo pasa a segundo plano
    el('school-cal-upload').className = rb.hidden ? 'btn-primary' : 'btn-ghost';
    renderSchoolReview(reviewing);
    renderNoSchoolList();
    renderNoSchoolReadList(!!c && read && !manual && !reviewing);
    if(!c){ return; }
    var icon = el('school-cal-icon');
    if(c.kind === 'file'){
      icon.textContent = c.ext;
      el('school-cal-name').textContent = c.name;
      el('school-cal-meta').textContent = (c.ext === 'IMG' ? t('schoolCal.image') : c.ext) + ' · ' + fmtSize(c.size);
    } else {
      var u = new URL(c.url);
      icon.innerHTML = LINK_ICON;
      el('school-cal-name').textContent = isDriveUrl(u) ? t('schoolCal.drive') : u.hostname.replace(/^www\./, '');
      el('school-cal-meta').textContent = c.url.replace(/^https?:\/\//, '');
      el('school-cal-meta').title = c.url;
    }
  }

  function setSchoolMode(m){
    if(m === SCHOOL_MODE){ return; }
    SCHOOL_MODE = m;
    try{ localStorage.setItem('school-cal-mode', m); }catch(e){}
    renderSchoolCal();
    noSchoolChanged();
    toast(t(m === 'manual' ? 'toast.modeManual' : 'toast.modeSource'));
  }
  // Los días no lectivos cambian el cole de esos días: Calendario, «Hoy», huecos libres y avisos de riesgo
  function noSchoolChanged(){
    refreshNoSchool();
    onScheduleChanged();
    schedulePrompts();
  }

  function nsdDay(iso){
    var d = isoDate(iso);
    return cap(fmtDate(d, { weekday:'short' }).replace('.', '')) + ' ' + fmtDate(d, { day:'numeric', month:'short', year:'numeric' });
  }
  function nsdWhen(r){ return r.from === r.to ? nsdDay(r.from) : nsdDay(r.from) + ' – ' + nsdDay(r.to); }
  function nsdMeta(r){
    var n = Math.round((isoDate(r.to) - isoDate(r.from)) / 864e5) + 1;
    return (r.name ? r.name + ' · ' : '') + (n === 1 ? t('nsd.day') : t('nsd.days', { n: n }));
  }
  function nsdText(r){
    var tx = document.createElement('span'); tx.className = 'nsd-text';
    var w = document.createElement('span'); w.className = 'nsd-when'; w.textContent = nsdWhen(r);
    var m = document.createElement('span'); m.className = 'nsd-meta'; m.textContent = nsdMeta(r);
    tx.appendChild(w); tx.appendChild(m);
    return tx;
  }
  function nsdItems(ul, list, onRemove){
    ul.innerHTML = '';
    list.slice().sort(function(a, b){ return a.from < b.from ? -1 : 1; }).forEach(function(r){
      var li = document.createElement('li'); li.className = 'nsd-item';
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'row-delete'; x.textContent = '×';
      x.setAttribute('aria-label', t('nsd.remove')); x.title = t('nsd.remove');
      x.onclick = function(){ onRemove(r.id, x); };
      li.appendChild(nsdText(r)); li.appendChild(x); ul.appendChild(li);
    });
  }
  function renderNoSchoolList(){ nsdItems(el('nsd-list'), NSD_MANUAL, removeNoSchool); }
  function renderNoSchoolReadList(show){ nsdItems(el('nsd-read-list'), show ? NO_SCHOOL_READ : [], removeNoSchoolRead); }
  function storeNoSchool(){ try{ localStorage.setItem('no-school-manual', JSON.stringify(NSD_MANUAL)); }catch(e){} }
  function addNoSchool(){
    var f = el('nsd-from'), z = el('nsd-to'), from = f.value, to = z.value || from;
    if(!from){ f.classList.add('is-invalid'); toast(t('toast.nsdNoDate')); f.focus(); return; }
    if(to < from){ z.classList.add('is-invalid'); toast(t('toast.nsdOrder')); z.focus(); return; }
    if((isoDate(to) - isoDate(from)) / 864e5 >= 120){ z.classList.add('is-invalid'); toast(t('toast.nsdTooLong')); z.focus(); return; }
    NSD_MANUAL.push({ id:'nsd' + Date.now(), from:from, to:to, name:el('nsd-name').value.trim() });
    storeNoSchool();
    f.value = ''; z.value = ''; el('nsd-name').value = '';
    renderNoSchoolList();
    noSchoolChanged();
    toast(t(from === to ? 'toast.nsdAdded' : 'toast.nsdRangeAdded'));
  }
  // Quitar pide una segunda pulsación
  function confirmRemove(btn){
    if(btn.classList.contains('is-confirm')){ return true; }
    btn.classList.add('is-confirm');
    btn.title = t('nsd.removeConfirm'); btn.setAttribute('aria-label', t('nsd.removeConfirm'));
    return false;
  }
  function removeNoSchool(id, btn){
    if(!confirmRemove(btn)){ return; }
    NSD_MANUAL = NSD_MANUAL.filter(function(r){ return r.id !== id; });
    storeNoSchool();
    renderNoSchoolList();
    noSchoolChanged();
    toast(t('toast.nsdRemoved'));
  }
  function removeNoSchoolRead(id, btn){
    if(!confirmRemove(btn)){ return; }
    NO_SCHOOL_READ = NO_SCHOOL_READ.filter(function(r){ return r.id !== id; });
    storeNoSchoolRead();
    renderSchoolCal();
    noSchoolChanged();
    toast(t('toast.nsdRemoved'));
  }

  function pickSchoolCalFile(){ closeSchoolCalLink(); el('school-cal-file').click(); }
  function onSchoolCalFile(input){
    var f = input.files && input.files[0];
    input.value = '';
    if(!f){ return; }
    var m = /\.([a-z0-9]+)$/i.exec(f.name), low = m && m[1].toLowerCase(), ext = low && SCHOOL_CAL_EXT[low];
    if(low === 'doc'){ toast(t('read.err.oldWord')); return; }
    if(!ext && /^image\//.test(f.type)){ ext = 'IMG'; }
    if(!ext){ toast(t('toast.schoolBadType')); return; }
    if(f.size > SCHOOL_CAL_MAX){ toast(t('toast.schoolTooBig')); return; }
    SCHOOL_FILE = f;
    newSchoolCal({ kind:'file', name:f.name, size:f.size, ext:ext });
    toast(t('toast.schoolFile'));
    readSchoolCal();
  }

  function openSchoolCalLink(){
    var input = el('school-cal-url');
    el('school-cal-linkbox').hidden = false;
    el('school-cal-actions').hidden = true;
    input.classList.remove('is-invalid');
    input.value = SCHOOL_CAL && SCHOOL_CAL.kind === 'link' ? SCHOOL_CAL.url : '';
    input.focus();
  }
  function closeSchoolCalLink(){
    el('school-cal-linkbox').hidden = true;
    el('school-cal-actions').hidden = false;
  }
  function saveSchoolCalLink(){
    var input = el('school-cal-url'), v = input.value.trim(), u = null;
    // Se admite pegar «drive.google.com/…» sin el https://
    if(v && !/^[a-z][a-z0-9+.-]*:/i.test(v)){ v = 'https://' + v; }
    try{ u = new URL(v); }catch(e){}
    if(!u || !/^https?:$/.test(u.protocol) || u.hostname.indexOf('.') < 0){
      input.classList.add('is-invalid');
      toast(t('toast.schoolBadUrl'));
      input.focus();
      return;
    }
    closeSchoolCalLink();
    SCHOOL_FILE = null;
    newSchoolCal({ kind:'link', url:u.href });
    toast(t('toast.schoolLink'));
    readSchoolCal();
  }
  // Otro calendario (o ninguno) empieza de cero: se olvida la lectura en curso, la pendiente de
  // revisar y los días leídos del anterior
  function newSchoolCal(v){
    READ_SEQ++; READING = 0;
    setReadPending(null);
    var had = NO_SCHOOL_READ.length;
    NO_SCHOOL_READ = []; storeNoSchoolRead();
    setSchoolCal(v);
    if(had){ noSchoolChanged(); }
  }
  // Quitar pide una segunda pulsación
  function removeSchoolCal(btn){
    if(!btn.classList.contains('is-confirm')){
      btn.classList.add('is-confirm');
      btn.textContent = t('schoolCal.removeConfirm');
      return;
    }
    SCHOOL_FILE = null;
    newSchoolCal(null);
    toast(t('toast.schoolRemoved'));
  }

  /* ---- Lectura del calendario escolar con IA ----
     La hace la función readSchoolCalendar del servidor (functions/index.js) con Gemini (Vertex AI): recibe el
     archivo (en base64) o el enlace y devuelve { isCalendar, schoolYear, periods:[{from,to,name}], notes }.
     Lo leído no se aplica solo: se enseña para revisarlo y se guarda con «Guardar». */
  function fileToBase64(blob){
    return new Promise(function(ok, ko){
      var r = new FileReader();
      r.onload = function(){ ok(String(r.result).replace(/^data:[^,]*,/, '')); };
      r.onerror = function(){ ko(r.error); };
      r.readAsDataURL(blob);
    });
  }
  // Las fotos se pasan a JPEG de 2400 px como mucho: pesan menos y así también vale una foto HEIC
  // del iPhone. Si el navegador no sabe abrir la imagen, se manda tal cual.
  function shrinkImage(f){
    return new Promise(function(ok){
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function(){
        var k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
        var cv = document.createElement('canvas');
        cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
        var g = cv.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function(b){ ok(b ? { blob:b, type:'image/jpeg' } : { blob:f, type:f.type }); }, 'image/jpeg', 0.9);
      };
      img.onerror = function(){ URL.revokeObjectURL(url); ok({ blob:f, type:f.type }); };
      img.src = url;
    });
  }
  function readPayload(){
    var base = { lang: LANG, today: isoOf(new Date()), answers: READ_ANSWERS };
    if(SCHOOL_CAL.kind === 'link'){ base.url = SCHOOL_CAL.url; return Promise.resolve(base); }
    var f = SCHOOL_FILE;
    return (SCHOOL_CAL.ext === 'IMG' ? shrinkImage(f) : Promise.resolve({ blob:f, type:f.type })).then(function(x){
      return fileToBase64(x.blob).then(function(data){
        base.file = { name: f.name, type: x.type || '', data: data };
        return base;
      });
    });
  }
  // Mensaje para cada error de la función (su message es el motivo: 'signIn', 'private', 'busy'…)
  var READ_ERRORS = ['signIn', 'noPlan', 'limit', 'busy', 'ai', 'format', 'oldWord', 'empty', 'tooBig', 'private', 'fetch', 'badUrl', 'notReady', 'noDownload'];
  function readErrorText(e){
    var code = String(e && e.code || ''), msg = String(e && e.message || '');
    // Con un enlace que no se puede abrir, el motivo exacto (p. ej. «HTTP 403 …») ayuda a saber qué pasa
    var detail = e && e.details && e.details.detail;
    if(READ_ERRORS.indexOf(msg) >= 0){ return t('read.err.' + msg) + (detail && (msg === 'private' || msg === 'fetch') ? ' (' + detail + ')' : ''); }
    if(!navigator.onLine){ return t('read.err.offline'); }
    if(code === 'functions/not-found'){ return t('read.err.notReady'); }
    if(code === 'functions/deadline-exceeded'){ return t('read.err.busy'); }
    return t('read.err.other', { code: code.replace(/^functions\//, '') || msg });
  }
  function readSchoolCal(){
    if(!SCHOOL_CAL || SCHOOL_MODE === 'manual' || READING || !canRead()){ return; }
    if(!signedIn() || typeof window.syncCall !== 'function'){ renderSchoolCal(); return; }
    var seq = ++READ_SEQ;
    READING = seq;
    renderSchoolCal();
    readPayload().then(function(payload){
      return window.syncCall('readSchoolCalendar', payload);
    }).then(function(res){
      if(seq !== READ_SEQ){ return; }
      // La IA necesita saber algo de la alumna: primero se responde y luego se vuelve a leer
      if(res && res.questions && res.questions.length){
        setReadPending({ questions: res.questions, picks: res.questions.map(function(){ return { opt: -1, other: '' }; }) });
        toast(t('read.asking'));
        return;
      }
      var periods = (res && res.periods || []).map(function(p, i){
        return { id:'nsr' + Date.now() + '-' + i, from:p.from, to:p.to, name:p.name || '' };
      }).sort(function(a, b){ return a.from < b.from ? -1 : 1; });
      setReadPending({ isCalendar: !!res.isCalendar, year: res.schoolYear || '', notes: res.notes || '', periods: periods, sel: periods.map(function(){ return true; }) });
      toast(t('read.done'));
    }).catch(function(e){
      if(seq !== READ_SEQ){ return; }
      toast(readErrorText(e));
    }).then(function(){
      if(seq !== READ_SEQ){ return; }
      READING = 0;
      renderSchoolCal();
    });
  }

  // Revisión de lo leído: cada periodo con su casilla (todas marcadas); «Guardar» se queda con las marcadas
  function renderSchoolReview(show){
    var box = el('school-review'), asking = show && !!READ_PENDING.questions;
    renderSchoolAsk(asking);
    box.hidden = !show || asking;
    if(box.hidden){ return; }
    var p = READ_PENDING, list = el('school-review-list');
    var meta = !p.isCalendar ? t('read.notCalendar') :
      !p.periods.length ? t('read.noneFound') :
      (p.periods.length === 1 ? t('read.foundOne') : t('read.foundN', { n: p.periods.length })) +
      (p.year ? ' · ' + t('read.year', { year: p.year }) : '');
    el('school-review-meta').textContent = meta;
    el('school-review-notes').textContent = p.notes;
    el('school-review-notes').hidden = !p.notes;
    el('school-review-replace').hidden = !(NO_SCHOOL_READ.length && p.periods.length);
    list.innerHTML = '';
    p.periods.forEach(function(r, i){
      var label = document.createElement('label'); label.className = 'check-row review-row';
      var box = document.createElement('input'); box.type = 'checkbox'; box.checked = p.sel[i] !== false;
      box.onchange = function(){ p.sel[i] = box.checked; setReadPending(p); updateReviewSave(); };
      label.appendChild(box); label.appendChild(nsdText(r));
      list.appendChild(label);
    });
    updateReviewSave();
  }
  function reviewCount(){ return READ_PENDING.sel.filter(function(s){ return s !== false; }).length; }
  function updateReviewSave(){
    var b = el('school-review-save'), n = reviewCount();
    b.hidden = !READ_PENDING.periods.length;
    b.textContent = t('read.save', { n: n });
    b.disabled = !n;
    el('school-review-discard').textContent = t(READ_PENDING.periods.length ? 'read.discard' : 'read.close');
  }
  function saveSchoolRead(){
    var p = READ_PENDING;
    if(!p || !reviewCount()){ return; }
    NO_SCHOOL_READ = p.periods.filter(function(r, i){ return p.sel[i] !== false; });
    storeNoSchoolRead();
    var c = Object.assign({}, SCHOOL_CAL, { read: { at: new Date().toISOString(), year: p.year, notes: p.notes } });
    setReadPending(null);
    setSchoolCal(c);
    noSchoolChanged();
    toast(t('read.saved'));
  }
  // Preguntas de la IA: cada una con sus opciones (botones de radio) y «Otra respuesta» con texto libre
  function renderSchoolAsk(show){
    var box = el('school-ask');
    box.hidden = !show;
    if(!show){ return; }
    var p = READ_PENDING, list = el('school-ask-list');
    list.innerHTML = '';
    p.questions.forEach(function(q, i){
      var pick = p.picks[i] || (p.picks[i] = { opt: -1, other: '' });
      var fs = document.createElement('fieldset'); fs.className = 'ask-q';
      var lg = document.createElement('legend'); lg.textContent = q.question; fs.appendChild(lg);
      var opts = q.options.concat([t('read.other')]);
      var other = document.createElement('input');
      other.type = 'text'; other.className = 'txt-input'; other.maxLength = 120;
      other.placeholder = t('read.otherPh'); other.value = pick.other;
      other.hidden = pick.opt !== q.options.length;
      other.oninput = function(){ pick.other = other.value; setReadPending(p); };
      opts.forEach(function(o, j){
        var label = document.createElement('label'); label.className = 'check-row';
        var r = document.createElement('input'); r.type = 'radio'; r.name = 'ask-' + i; r.checked = pick.opt === j;
        r.onchange = function(){
          pick.opt = j; setReadPending(p);
          other.hidden = j !== q.options.length;
          if(!other.hidden){ other.focus(); }
        };
        var span = document.createElement('span'); span.textContent = o;
        label.appendChild(r); label.appendChild(span); fs.appendChild(label);
      });
      fs.appendChild(other);
      list.appendChild(fs);
    });
  }
  function answerSchoolAsk(){
    var p = READ_PENDING, out = [];
    for(var i = 0; i < p.questions.length; i++){
      var q = p.questions[i], pick = p.picks[i] || {}, a = '';
      if(pick.opt >= 0 && pick.opt < q.options.length){ a = q.options[pick.opt]; }
      else if(pick.opt === q.options.length){ a = (pick.other || '').trim(); }
      if(!a){ toast(t('read.needAnswer')); return; }
      out.push({ q: q.question, a: a });
    }
    // La misma pregunta respondida otra vez sustituye a la respuesta anterior
    READ_ANSWERS = READ_ANSWERS.filter(function(x){ return !out.some(function(y){ return y.q === x.q; }); }).concat(out).slice(-8);
    storeReadAnswers();
    setReadPending(null);
    renderSchoolCal();
    readSchoolCal();
  }
  function forgetReadAnswers(){
    READ_ANSWERS = [];
    storeReadAnswers();
    renderSchoolCal();
    toast(t('read.forgotten'));
  }
  function discardSchoolRead(){
    setReadPending(null);
    renderSchoolCal();
  }

  // Horario del cole para una fecha concreta: un día no lectivo se trata como un domingo
  function schoolForDate(d){
    return NO_SCHOOL_DATES.indexOf(isoOf(d)) >= 0 ? {on:false} : schoolFor(weekdayOf(d));
  }

  // Franja horaria menos el horario escolar
  function coveredRanges(d){
    var b = dayBounds();
    if(!d.on){ return [[b.start, b.end]]; }
    var r = [];
    if(b.start < d.entry){ r.push([b.start, d.entry < b.end ? d.entry : b.end]); }
    if(d.exit < b.end){ r.push([d.exit > b.start ? d.exit : b.start, b.end]); }
    return r;
  }

  function rangesText(d){
    var r = coveredRanges(d);
    return r.length ? r.map(function(x){ return '<span style="white-space:nowrap">' + x[0] + '–' + x[1] + '</span>'; }).join(t('and')) : t('cover.none');
  }

  function renderCover(){
    var rows = [[t('monFri'), schoolFor(0)]];
    if(SCHOOL.sat.on){ rows.push([t('saturday'), SCHOOL.sat]); }
    rows.push([SCHOOL.sat.on ? t('cover.sunHol') : t('cover.weekendHol'), {on:false}]);
    var list = document.getElementById('cover-list');
    list.innerHTML = '';
    rows.forEach(function(r){
      var line = document.createElement('div');
      line.className = 'config-line';
      line.innerHTML = '<span class="config-label">' + r[0] + '</span><span class="config-value">' + rangesText(r[1]) + '</span>';
      list.appendChild(line);
    });
  }

  function onSchoolTime(which, field, input){
    var d = SCHOOL[which], v = input.value;
    var entry = field === 'entry' ? v : d.entry, exit = field === 'exit' ? v : d.exit;
    if((v && !TIME_RE.test(v)) || (entry && exit && entry >= exit)){
      input.value = d[field];
      toast(t('toast.exitAfter'));
      return;
    }
    d[field] = v;
    onScheduleChanged();
  }

  function toggleSaturday(btn){
    SCHOOL.sat.on = !SCHOOL.sat.on;
    btn.setAttribute('aria-checked', String(SCHOOL.sat.on));
    document.getElementById('sat-times').hidden = !SCHOOL.sat.on;
    onScheduleChanged();
  }

  function onBoundsChange(input){
    var s0 = el('day-start').value, e0 = el('day-end').value;
    if((input.value && !TIME_RE.test(input.value)) || (s0 && e0 && s0 >= e0)){
      input.value = input.dataset.prev || '';
      toast(t('toast.windowOrder'));
    }
    input.dataset.prev = input.value;
    onScheduleChanged();
  }

  function scheduleSummary(){
    if(!schoolSet()){ return t('sum.noSchool'); }
    var txt = t('sum.week', { t: SCHOOL.week.entry + '–' + SCHOOL.week.exit });
    if(SCHOOL.sat.on){ txt += ' · ' + t('sum.sat', { t: SCHOOL.sat.entry + '–' + SCHOOL.sat.exit }); }
    return txt;
  }

  function onScheduleChanged(){
    var summary = scheduleSummary();
    document.querySelectorAll('.school-note').forEach(function(el){ el.innerHTML = t('note.school', { summary: summary }); });
    renderCover();
    var b = dayBounds();
    CAL_START = Math.floor(toHours(b.start));
    CAL_END = Math.ceil(toHours(b.end));
    renderCalendar(calView);
    fitCalendar();
    updateConfigSummaries();
    if(typeof renderToday === 'function' && document.getElementById('layout-hint').textContent){ renderToday(); }
  }

  /* ---- Exportación a Google Calendar ---- */
  function toggleSwitch(btn, label){
    var on = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(on));
    toast(t(on ? 'toast.on' : 'toast.off', { label: label }));
  }

  function toggleExport(btn){
    var on = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(on));
    document.getElementById('export-options').hidden = !on;
    updateConfigSummaries();
    if(on){ renderExportCats(); }
  }

  // Una casilla por categoría definida arriba (se mantiene al renombrar o añadir)
  function renderExportCats(){
    var box = document.getElementById('export-cats');
    var prev = [];
    box.querySelectorAll('input').forEach(function(i){ prev.push(i.checked); });
    box.innerHTML = '';
    document.querySelectorAll('#category-list .cat-row').forEach(function(row, idx){
      var label = document.createElement('label');
      label.className = 'check-row';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = idx < prev.length ? prev[idx] : true;
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = row.querySelector('.row-bar').style.background;
      var name = document.createElement('span');
      name.textContent = rowName(row);
      label.appendChild(input); label.appendChild(dot); label.appendChild(name);
      box.appendChild(label);
    });
    document.querySelectorAll('[data-cat-name]').forEach(function(el){ el.textContent = catName(el.dataset.catName) + (el.dataset.suffix ? ' ' + t(el.dataset.suffix) : ''); });
    updateConfigSummaries();
    // Nombre, color o prioridad de una categoría cambian también eventos y Calendario
    renderEvents();
    renderActivities();
    renderTasks();
    renderTasks();
    renderCalendar(calView);
  }
  document.getElementById('category-list').addEventListener('input', renderExportCats);

  // Acordeón: abrir un bloque de Configuración cierra el que estuviera abierto
  document.querySelectorAll('.cfg-group').forEach(function(g){
    g.addEventListener('toggle', function(){
      if(!g.open){ return; }
      document.querySelectorAll('.cfg-group[open]').forEach(function(o){ if(o !== g){ o.open = false; } });
    });
  });

  // Resumen del valor actual en la cabecera de cada bloque plegado
  function updateConfigSummaries(){
    function put(id, text){ var el = document.getElementById('sum-' + id); if(el){ el.textContent = text; } }
    put('profile', KID || t('sum.notSet'));
    renderAccount();
    renderSetup();
    put('language', LANGS[LANG]);
    put('look', [t(APPEARANCE.layout === 'list' ? 'layout.list' : (APPEARANCE.layout === 'postit1' ? 'Post-it 1' : 'Post-it 2')),
                 t('mode.' + APPEARANCE.mode), t('bar.' + APPEARANCE.bar)].join(' · '));
    var b = dayBounds();
    put('hours', !boundsSet() ? t('sum.notSet') : b.start + '–' + b.end + (schoolSet() ? ' · ' + t('sum.school') + '\u00a0' + SCHOOL.week.entry + '\u2011' + SCHOOL.week.exit : ''));
    put('links', t('sum.links', { n: (SCHOOL_MODE === 'manual' ? NSD_MANUAL.length : SCHOOL_CAL) ? 1 : 0 }));
    put('cats', t('sum.cats', { n: document.querySelectorAll('#category-list .cat-row').length }));
    put('gcal', t(document.getElementById('export-switch').getAttribute('aria-checked') === 'true' ? 'sum.gcalOn' : 'sum.gcalOff'));
  }


  /* ---- Lista → ficha de consulta → formulario (Actividades, Eventos, Tareas) ---- */
  // Pulsar un elemento abre su ficha solo para consultar; desde la ficha se edita o se elimina.
  // Ficha abierta desde otra pantalla (Calendario): su botón de volver lleva allí
  var DETAIL_BACK = null;
  // Tras eliminar desde una ficha: a la pantalla de origen si se abrió desde otra, si no a la lista
  function afterDelete(f){ if(DETAIL_BACK && DETAIL_BACK.go){ DETAIL_BACK.go(); } else { showView(f, 'list'); } }
  function showView(f, view){
    if(view === 'list'){ DETAIL_BACK = null; }
    el(f + '-list-view').hidden = view !== 'list';
    el(f + '-detail').hidden = view !== 'detail';
    el(f + '-form').hidden = view !== 'form';
    if(el(f + '-plan')){ el(f + '-plan').hidden = view !== 'plan'; }
    el(f + '-detail').closest('.screen').parentElement.scrollTop = 0;
  }
  var BACK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';
  // d: {title, prio, rows:[[etiqueta, html]], edit:'fn()', del:'fn(this)', delLabel}
  function renderDetail(f, d){
    el(f + '-detail').innerHTML =
      '<button type="button" class="detail-back" onclick="' + ((d.back = d.back || DETAIL_BACK) ? d.back.fn : 'showView(\'' + f + '\', \'list\')') + '">' + BACK_SVG + (d.back ? d.back.label : t('btn.back')) + '</button>' +
      '<div class="detail-card">' +
        '<div class="detail-head"><h3>' + esc(d.title) + '</h3><span class="prio-chip prio-' + d.prio + '">' + t('prio.' + d.prio) + '</span></div>' +
        '<dl class="detail-list">' + d.rows.filter(function(r){ return r[1]; }).map(function(r){
          return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
        }).join('') + '</dl>' +
      '</div>' +
      (d.extra || '') +
      '<div class="form-actions">' +
        '<button type="button" class="btn-danger" onclick="' + d.del + '">' + d.delLabel + '</button>' +
        '<button type="button" class="btn-primary" onclick="' + d.edit + '">' + t('edit') + '</button>' +
      '</div>';
    showView(f, 'detail');
  }
  function catHtml(c){ return c ? '<i style="background:' + c.color + '"></i>' + esc(c.name) : ''; }
  function prioHtml(p, own){ return t('prio.' + p) + ' <span class="muted">' + t(own ? 'd.prioOwn' : 'd.prioDefault') + '</span>'; }

  // Al cambiar de idioma (o una categoría), la ficha abierta se vuelve a dibujar
  function refreshOpenDetails(){
    if(el('evt-detail') && !el('evt-detail').hidden && editingEvent){ openEvent(editingEvent.id); }
    if(el('act-detail') && !el('act-detail').hidden && editingAct){ openActivity(editingAct.id); }
    if(el('task-detail') && !el('task-detail').hidden && editingTask){ openTask(editingTask.key); }
  }

  /* ---- Categoría y prioridad en los formularios (Eventos y Actividades) ---- */
  // Elegir categoría propone su prioridad, salvo que ya se haya elegido una a mano.
  // Desde el formulario se puede crear una categoría nueva: es una categoría de usuario más.
  var PICK = {
    evt: { cat:null, prio:null, touched:false, newColor:null, refresh:function(){ refreshEventForm(); } },
    act: { cat:null, prio:null, touched:false, newColor:null, refresh:function(){ refreshActivityForm(); } }
  };
  function resetPick(f, cat, prio, touched){ PICK[f].cat = cat || null; PICK[f].prio = prio || null; PICK[f].touched = touched; }
  // extra: categoría guardada en el elemento que ya no está en Configuración (se sigue mostrando)
  function renderPick(f, extra){
    var st = PICK[f], cats = getCategories();
    if(extra && st.cat === extra.id && !cats.some(function(c){ return c.id === extra.id; })){ cats.push(extra); }
    el(f + '-cat').innerHTML = cats.map(function(c){
      var on = c.id === st.cat;
      return '<button type="button" class="cat-chip' + (on ? ' is-active' : '') + '" role="radio" aria-checked="' + on + '" onclick="setFormCat(\'' + f + '\', \'' + c.id + '\')">' +
        '<i style="background:' + c.color + '"></i>' + esc(c.name) + '</button>';
    }).join('') +
      '<button type="button" class="cat-chip is-add" onclick="toggleNewCategory(\'' + f + '\', true)">+ ' + t('cat.new') + '</button>';
    document.querySelectorAll('#' + f + '-prio .toggle-btn').forEach(function(b){
      var on = b.dataset.prio === st.prio;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', on);
    });
    el(f + '-cat-colors').innerHTML = CAT_PALETTE.map(function(c, i){
      return '<button type="button" role="radio" aria-checked="' + (c === st.newColor) + '" aria-label="' + t('aria.catColor') + ' ' + (i + 1) + '" style="background:' + c + '" onclick="pickNewCatColor(\'' + f + '\', \'' + c + '\')"></button>';
    }).join('');
  }
  function setFormCat(f, id){
    var st = PICK[f], c = findCategory(id);
    st.cat = id;
    if(c && !st.touched){ st.prio = c.prio; }
    el(f + '-cat').classList.remove('is-invalid');
    el(f + '-prio').classList.remove('is-invalid');
    st.refresh();
  }
  function setFormPrio(f, btn){ PICK[f].prio = btn.dataset.prio; PICK[f].touched = true; el(f + '-prio').classList.remove('is-invalid'); PICK[f].refresh(); }
  function toggleNewCategory(f, on){
    el(f + '-cat-new').hidden = !on;
    if(on){
      PICK[f].newColor = CAT_PALETTE[document.querySelectorAll('#category-list .cat-row').length % CAT_PALETTE.length];
      el(f + '-cat-name').value = '';
      PICK[f].refresh();
      el(f + '-cat-name').focus();
    }
  }
  function pickNewCatColor(f, c){ PICK[f].newColor = c; PICK[f].refresh(); }
  function addFormCategory(f){
    var input = el(f + '-cat-name'), name = input.value.trim();
    if(!name){ input.classList.add('is-invalid'); input.focus(); return; }
    input.classList.remove('is-invalid');
    var row = addCategory({ name: name, color: PICK[f].newColor, prio: PICK[f].prio || 'Media' });
    toggleNewCategory(f, false);
    setFormCat(f, row.dataset.cat);
    toast(t('toast.catAdded', { name: name }));
  }

  /* ================= EVENTOS ================= */
  // Eventos puntuales: todo lo inserta el usuario (con la App nueva, la lista está vacía).
  // Campos obligatorios: nombre, fecha, hora de inicio, duración, categoría y prioridad.
  // Cada evento puede llevar una tarea de preparación: copia la prioridad del evento, solo
  // se edita desde aquí y se cancela con él; para Today, el Calendario y los avisos es una
  // tarea más. En la maqueta se guardan en el dispositivo (ver dossier).
  var USER_EVENTS = [], editingEvent = null;
  (function loadEvents(){
    try{ USER_EVENTS = JSON.parse(localStorage.getItem('app-events') || '[]') || []; }catch(e){ USER_EVENTS = []; }
  })();
  var DELETED_CATS = [];
  try{ DELETED_CATS = JSON.parse(localStorage.getItem('deleted-cats') || '[]') || []; }catch(e){}
  function storeEvents(){
    try{
      localStorage.setItem('app-events', JSON.stringify(USER_EVENTS));
      localStorage.setItem('deleted-cats', JSON.stringify(DELETED_CATS));
    }catch(e){}
    schedulePrompts();
  }
  // Categorías creadas desde Eventos que no estén en Configuración (la maqueta no guarda
  // Configuración): se recrean a partir de la copia guardada en el evento.
  function restoreEventCategories(){
    USER_EVENTS.concat(USER_ACTS).forEach(function(e){
      if(e.cat && !findCategory(e.cat) && DELETED_CATS.indexOf(e.cat) < 0){ addCategory({ id:e.cat, name:e.catName, color:e.catColor, prio:e.prio }); }
    });
  }

  function fmtEst(min){
    var h = Math.floor(min / 60), m = min % 60;
    return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min';
  }
  function fmtDay(iso){ var d = isoDate(iso); return cap(fmtDate(d, { weekday:'short' }).replace('.', '')) + ' ' + ddmm(d); }
  function esc(v){ return String(v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function el(id){ return document.getElementById(id); }
  // Categoría de un evento: la de Configuración o, si ya no está, la copia guardada
  function eventCategory(e){
    var c = e.cat && findCategory(e.cat);
    return c || (e.cat ? { id:e.cat, name:e.catName, color:e.catColor } : null);
  }
  function endTime(e){ return fmtHour(toHours(e.time) + (e.dur || 60) / 60); }

  var PIN_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  var TASK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';

  function renderEvents(){
    var list = el('evt-list');
    if(!list){ return; }
    var items = USER_EVENTS.slice().sort(function(a, b){ return (a.date + a.time).localeCompare(b.date + b.time); });
    el('evt-list-wrap').hidden = !items.length;
    list.innerHTML = items.map(function(e){
      var c = eventCategory(e);
      var sub = (c ? '<span class="evt-cat"><i style="background:' + c.color + '"></i>' + esc(c.name) + '</span> · ' : '') +
        '<span>' + fmtDay(e.date) + ' · ' + e.time + '–' + endTime(e) + (e.place ? ' · </span>' + PIN_SVG + '<span>' + esc(e.place) : '') + '</span>';
      var task = e.task ? '<div class="evt-task">' + TASK_SVG + '<span>' + esc(t('evt.taskRow', {
        task: e.task.name, due: fmtDay(e.task.date) + ' ' + e.task.time, est: fmtEst(e.task.est) })) + '</span></div>' : '';
      return '<div class="row evt-row row-open" ' + openAttrs('openEvent', e.id) + '>' +
        '<div class="row-body">' +
          '<span class="evt-title-line"><span class="row-title">' + esc(e.name) + '</span>' +
            '<span class="prio-chip prio-' + e.prio + '">' + t('prio.' + e.prio) + '</span></span>' +
          '<span class="row-sub">' + sub + '</span>' +
          (e.desc ? '<span class="evt-desc">' + esc(e.desc) + '</span>' : '') + task +
        '</div>' +
        ROW_CHEV +
      '</div>';
    }).join('');
  }

  // Duración en horas y minutos, sin tope
  function setDur(prefix, min){
    el(prefix + '-h').value = min ? Math.floor(min / 60) : '';
    el(prefix + '-m').value = min ? ('0' + min % 60).slice(-2) : '';
  }
  function getDur(prefix){
    var h = parseInt(el(prefix + '-h').value, 10) || 0, m = parseInt(el(prefix + '-m').value, 10) || 0;
    return h < 0 || m < 0 || m > 59 ? 0 : h * 60 + m;
  }

  function openEventForm(id){
    editingEvent = id ? USER_EVENTS.filter(function(e){ return e.id === id; })[0] : null;
    var e = editingEvent || {};
    el('evt-name').value = e.name || '';
    el('evt-date').value = e.date || '';
    el('evt-time').value = e.time || '';
    setDur('evt-dur', e.dur);
    el('evt-place').value = e.place || '';
    el('evt-desc').value = e.desc || '';
    resetPick('evt', e.cat, e.prio, !!editingEvent);
    var tk = e.task;
    el('task-name').value = tk ? tk.name : '';
    el('task-date').value = tk ? tk.date : '';
    el('task-time').value = tk ? tk.time : '';
    setDur('task-est', tk ? tk.est : 0);
    setTaskOn(!!tk);
    toggleNewCategory('evt', false);
    document.querySelectorAll('#evt-form .is-invalid').forEach(function(f){ f.classList.remove('is-invalid'); });
    refreshEventForm();
    showView('evt', 'form');
    el('evt-name').focus();
  }
  // Al corregir un campo marcado, se quita la marca
  el('evt-form').addEventListener('input', function(ev){
    ev.target.classList.remove('is-invalid');
    var pair = ev.target.closest('.dur-input');
    if(pair){ pair.querySelectorAll('.is-invalid').forEach(function(f){ f.classList.remove('is-invalid'); }); }
  });
  // Cancelar el formulario vuelve a la ficha (al editar) o a la lista (al añadir)
  function closeEventForm(){
    if(PRESS_BACK){ PRESS_BACK(); return; }
    if(editingEvent){ openEvent(editingEvent.id); } else { showView('evt', 'list'); }
  }
  function openEvent(id){
    var e = USER_EVENTS.filter(function(x){ return x.id === id; })[0];
    if(!e){ showView('evt', 'list'); return; }
    editingEvent = e;
    renderDetail('evt', {
      title: e.name, prio: e.prio,
      rows: [
        [t('f.cat'), catHtml(eventCategory(e))],
        [t('d.when'), fmtDay(e.date) + ' · ' + e.time + '–' + endTime(e) + ' <span class="muted">(' + fmtEst(e.dur || 60) + ')</span>'],
        [t('f.prio'), eventCategory(e) && findCategory(e.cat) && findCategory(e.cat).prio === e.prio ? prioHtml(e.prio, false) : prioHtml(e.prio, true)],
        [t('f.place'), e.place ? esc(e.place) : ''],
        [t('f.desc'), e.desc ? esc(e.desc) : ''],
        [t('d.task'), e.task ? esc(e.task.name) + '<br><span class="muted">' + t('task.dueAt', { t: fmtDay(e.task.date) + ' ' + e.task.time }) + ' · ' + fmtEst(e.task.est) + '</span>' : '']
      ],
      edit: "openEventForm('" + e.id + "')", del: 'cancelEvent(this)', delLabel: t('evt.cancel')
    });
  }

  // Partes del formulario que dependen del estado (título, categorías, prioridad)
  function refreshEventForm(){
    if(!el('evt-form')){ return; }
    el('evt-form-title').textContent = t(editingEvent ? 'evt.editTitle' : 'evt.new');
    renderPick('evt', editingEvent && eventCategory(editingEvent));
    var p = PICK.evt.prio, own = editingEvent && editingEvent.task && editingEvent.task.prio;
    if(own){ p = own; }
    el('task-prio').textContent = own ? t('task.ownPrio', { p: t('prio.' + p) }) : p ? t('task.samePrio', { p: t('prio.' + p) }) : '—';
    el('task-prio').className = 'prio-copy' + (p ? ' prio-' + p : '');
    resetCancelButton();
  }

  function setTaskOn(on){
    el('evt-task-switch').setAttribute('aria-checked', on);
    el('evt-task-fields').hidden = !on;
  }
  function toggleEventTask(){
    var on = el('evt-task-switch').getAttribute('aria-checked') !== 'true';
    setTaskOn(on);
    if(on){
      // Propuesta inicial: «Preparar: <evento>», para la víspera a las 20:00
      if(!el('task-name').value && el('evt-name').value.trim()){
        el('task-name').value = t('task.namePre', { event: el('evt-name').value.trim() });
      }
      if(!el('task-date').value && el('evt-date').value){
        var d = isoDate(el('evt-date').value); d.setDate(d.getDate() - 1);
        el('task-date').value = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
        if(!el('task-time').value){ el('task-time').value = '20:00'; }
      }
      el('task-name').focus();
    }
  }

  function saveEvent(ev){
    ev.preventDefault();
    var withTask = el('evt-task-switch').getAttribute('aria-checked') === 'true';
    var missing = [];
    document.querySelectorAll('#evt-form .is-invalid').forEach(function(f){ f.classList.remove('is-invalid'); });
    function need(ok, fields, key){
      if(ok){ return; }
      fields.forEach(function(f){ el(f).classList.add('is-invalid'); });
      missing.push(t(key));
    }
    need(el('evt-name').value.trim(), ['evt-name'], 'f.name');
    need(el('evt-date').value, ['evt-date'], 'f.date');
    need(el('evt-time').value, ['evt-time'], 'f.time');
    need(getDur('evt-dur') > 0, ['evt-dur-h', 'evt-dur-m'], 'f.dur');
    need(PICK.evt.cat, ['evt-cat'], 'f.cat');
    need(PICK.evt.prio, ['evt-prio'], 'f.prio');
    if(withTask){
      need(el('task-name').value.trim(), ['task-name'], 'task.name');
      need(el('task-date').value, ['task-date'], 'task.dueDate');
      need(el('task-time').value, ['task-time'], 'task.dueTime');
      need(getDur('task-est') > 0, ['task-est-h', 'task-est-m'], 'task.est');
    }
    if(missing.length){ toast(t('err.missing', { fields: missing.join(', ') })); return; }
    if(withTask && el('task-date').value + el('task-time').value > el('evt-date').value + el('evt-time').value){
      el('task-date').classList.add('is-invalid'); el('task-time').classList.add('is-invalid');
      toast(t('err.taskAfter')); return;
    }
    var c = eventCategory({ cat: PICK.evt.cat, catName: editingEvent && editingEvent.catName, catColor: editingEvent && editingEvent.catColor });
    var data = {
      id: editingEvent ? editingEvent.id : 'e' + Date.now(),
      name: el('evt-name').value.trim(), date: el('evt-date').value, time: el('evt-time').value, dur: getDur('evt-dur'),
      cat: c.id, catName: c.name, catColor: c.color, prio: PICK.evt.prio,
      place: el('evt-place').value.trim(), desc: el('evt-desc').value.trim(),
      // La tarea toma la prioridad del evento salvo que en Tareas se le haya puesto una propia
      task: withTask ? { name: el('task-name').value.trim(), date: el('task-date').value, time: el('task-time').value, est: getDur('task-est'),
        // prioridad propia y descripción se editan en Tareas: se conservan
        prio: editingEvent && editingEvent.task ? editingEvent.task.prio || null : null,
        desc: editingEvent && editingEvent.task ? editingEvent.task.desc || '' : '' } : null
    };
    if(editingEvent){ USER_EVENTS[USER_EVENTS.indexOf(editingEvent)] = data; } else { USER_EVENTS.push(data); }
    storeEvents();
    renderEvents();
    renderTasks();
    renderCalendar(calView);
    if(PRESS_BACK){ PRESS_BACK(); } else { openEvent(data.id); }
    toast(t('toast.evtSaved', { name: data.name }));
  }

  // Cancelar un evento pide una segunda pulsación y se lleva su tarea
  function resetCancelButton(){}
  function cancelEvent(btn){
    var e = editingEvent;
    if(!e){ return; }
    if(!btn.classList.contains('is-confirm')){
      btn.classList.add('is-confirm');
      btn.textContent = t(e.task ? 'evt.cancelConfirmTask' : 'evt.cancelConfirm');
      return;
    }
    USER_EVENTS.splice(USER_EVENTS.indexOf(e), 1);
    storeEvents();
    editingEvent = null;
    afterDelete('evt');
    renderEvents();
    renderTasks();
    renderCalendar(calView);
    toast(t(e.task ? 'toast.evtTaskCancelled' : 'toast.evtCancelled', { name: e.name }));
  }

  // Para el Calendario: eventos y tareas del usuario que caen en la semana mostrada
  function weekDayIndex(iso){
    var diff = Math.round((isoDate(iso) - WEEK_DAYS[0].d) / 86400000);
    return diff >= 0 && diff < 7 ? diff : -1;
  }
  function weekUserEvents(){
    return USER_EVENTS.map(function(e){
      var h = toHours(e.time), c = eventCategory(e);
      return { day: weekDayIndex(e.date), title: e.name, start: h, end: Math.min(h + (e.dur || 60) / 60, CAL_END),
               color: c ? c.color : null, catLabel: c ? c.name : '', ref: { kind:'event', id:e.id } };
    }).filter(function(e){ return e.day >= 0; });
  }
  function weekUserTasks(){
    return USER_EVENTS.filter(function(e){ return e.task; }).map(function(e){ return { tk:e.task, key:'e:' + e.id }; })
      .concat(OWN_TASKS.map(function(tk){ return { tk:tk, key:'s:' + tk.id }; })).map(function(x){
      return { day: weekDayIndex(x.tk.date), title: x.tk.name, time: toHours(x.tk.time), cat: 'tarea', done: !!x.tk.done, ref: { kind:'task', id:x.key } };
    }).filter(function(e){ return e.day >= 0; });
  }

  /* ================= ACTIVIDADES ================= */
  // Actividades recurrentes semanales: todo lo inserta el usuario. Obligatorios: nombre,
  // días (con hora de inicio y fin por día), categoría, prioridad y ubicación. Pueden llevar
  // una tarea de práctica entre sesiones: copia la prioridad, solo se edita aquí y su
  // deadline es siempre la siguiente sesión de la misma actividad.
  var USER_ACTS = [], editingAct = null, actSessions = {};   // actSessions: día (lunes = 0) → {start, end}
  try{ USER_ACTS = JSON.parse(localStorage.getItem('app-activities') || '[]') || []; }catch(e){ USER_ACTS = []; }
  function storeActivities(){
    try{
      localStorage.setItem('app-activities', JSON.stringify(USER_ACTS));
      localStorage.setItem('deleted-cats', JSON.stringify(DELETED_CATS));
    }catch(e){}
    schedulePrompts();
  }

  // Momento actual según el reloj de la App (al minuto)
  function appNow(){ var d = new Date(TODAY_DATE.getTime()); d.setMinutes(Math.round(NOW * 60)); return d; }
  function weekdayOf(d){ return (d.getDay() + 6) % 7; }
  // Próxima sesión de una actividad a partir de «from» → Date del inicio
  function nextSession(a, from){
    for(var off = 0; off <= 7; off++){
      var d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + off);
      var todays = a.sessions.filter(function(x){ return x.day === weekdayOf(d); })
        .map(function(x){ var s = new Date(d.getTime()); s.setMinutes(Math.round(toHours(x.start) * 60)); return s; })
        .filter(function(s){ return s > from; }).sort(function(p, q){ return p - q; });
      if(todays.length){ return todays[0]; }
    }
    return null;
  }
  function sessionsText(a){
    return a.sessions.slice().sort(function(p, q){ return p.day - q.day; }).map(function(x){
      return cap(weekdayName(x.day, 'short').replace('.', '')) + ' ' + x.start + '–' + x.end;
    }).join(', ');
  }

  function renderActivities(){
    var list = el('act-list');
    if(!list){ return; }
    el('act-list-wrap').hidden = !USER_ACTS.length;
    var now = appNow();
    list.innerHTML = USER_ACTS.map(function(a){
      var c = eventCategory(a), next = a.task && nextSession(a, now);
      var sub = '<span>' + sessionsText(a) + ' · </span>' + PIN_SVG + '<span>' + esc(a.place) + '</span>';
      var task = a.task ? '<div class="evt-task">' + TASK_SVG + '<span>' + esc(t('act.taskRow', {
        task: a.task.name, est: fmtEst(a.task.est), next: next ? fmtDay(isoOf(next)) + ' ' + fmtHour(next.getHours() + next.getMinutes() / 60) : '—' })) + '</span></div>' : '';
      return '<div class="row evt-row row-open" ' + openAttrs('openActivity', a.id) + '>' +
        '<div class="row-body">' +
          '<span class="evt-title-line"><span class="row-title">' + esc(a.name) + '</span>' +
            '<span class="prio-chip prio-' + a.prio + '">' + t('prio.' + a.prio) + '</span></span>' +
          (c ? '<span class="row-sub"><span class="evt-cat"><i style="background:' + c.color + '"></i>' + esc(c.name) + '</span></span>' : '') +
          '<span class="row-sub">' + sub + '</span>' +
          (a.desc ? '<span class="evt-desc">' + esc(a.desc) + '</span>' : '') + task +
        '</div>' +
        ROW_CHEV +
      '</div>';
    }).join('');
  }
  function isoOf(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  function openActivityForm(id){
    editingAct = id ? USER_ACTS.filter(function(a){ return a.id === id; })[0] : null;
    var a = editingAct || { sessions: [] };
    el('act-name').value = a.name || '';
    el('act-place').value = a.place || '';
    el('act-desc').value = a.desc || '';
    actSessions = {};
    a.sessions.forEach(function(x){ actSessions[x.day] = { start: x.start, end: x.end }; });
    resetPick('act', a.cat, a.prio, !!editingAct);
    el('atask-name').value = a.task ? a.task.name : '';
    setDur('atask-est', a.task ? a.task.est : 0);
    setActTaskOn(!!a.task);
    toggleNewCategory('act', false);
    document.querySelectorAll('#act-form .is-invalid').forEach(function(f){ f.classList.remove('is-invalid'); });
    refreshActivityForm();
    showView('act', 'form');
    el('act-name').focus();
  }
  function closeActivityForm(){
    if(editingAct){ openActivity(editingAct.id); } else { showView('act', 'list'); }
  }
  function openActivity(id){
    var a = USER_ACTS.filter(function(x){ return x.id === id; })[0];
    if(!a){ showView('act', 'list'); return; }
    editingAct = a;
    var next = a.task && nextSession(a, appNow()), c = eventCategory(a);
    renderDetail('act', {
      title: a.name, prio: a.prio,
      rows: [
        [t('f.cat'), catHtml(c)],
        [t('f.days'), a.sessions.slice().sort(function(p, q){ return p.day - q.day; }).map(function(x){
          return cap(weekdayName(x.day)) + ' · ' + x.start + '–' + x.end; }).join('<br>')],
        [t('f.prio'), prioHtml(a.prio, !(c && findCategory(a.cat) && findCategory(a.cat).prio === a.prio))],
        [t('f.place'), esc(a.place)],
        [t('f.desc'), a.desc ? esc(a.desc) : ''],
        [t('d.task'), a.task ? esc(a.task.name) + '<br><span class="muted">' + fmtEst(a.task.est) + ' · ' + t('task.dueNextAt', { t: next ? fmtWhen(next) : '—' }) + '</span>' : '']
      ],
      edit: "openActivityForm('" + a.id + "')", del: 'cancelActivity(this)', delLabel: t('act.cancel')
    });
  }

  function refreshActivityForm(){
    if(!el('act-form')){ return; }
    el('act-form-title').textContent = t(editingAct ? 'act.editTitle' : 'act.new');
    // Días: L M X J V S D
    el('act-days').innerHTML = [0,1,2,3,4,5,6].map(function(i){
      var on = !!actSessions[i];
      return '<button type="button" class="toggle-btn' + (on ? ' is-active' : '') + '" aria-pressed="' + on + '" aria-label="' + cap(weekdayName(i)) + '" onclick="toggleActDay(' + i + ')">' +
        cap(weekdayName(i, 'narrow')) + '</button>';
    }).join('');
    renderSessions();
    renderPick('act', editingAct && eventCategory(editingAct));
    var p = PICK.act.prio, own = editingAct && editingAct.task && editingAct.task.prio;
    if(own){ p = own; }
    el('atask-prio').textContent = own ? t('task.ownPrio', { p: t('prio.' + p) }) : p ? t('task.samePrioAct', { p: t('prio.' + p) }) : '—';
    el('atask-prio').className = 'prio-copy' + (p ? ' prio-' + p : '');
  }
  function renderSessions(){
    var days = Object.keys(actSessions).map(Number).sort();
    el('act-sessions').innerHTML = days.map(function(i){
      var x = actSessions[i];
      return '<div class="session-row"><span class="s-day">' + cap(weekdayName(i)) + '</span>' +
        '<input class="txt-input" type="time" id="act-s' + i + '-start" value="' + x.start + '" aria-label="' + t('f.start') + ' · ' + weekdayName(i) + '" oninput="setSession(' + i + ', \'start\', this.value)">' +
        '<span>–</span>' +
        '<input class="txt-input" type="time" id="act-s' + i + '-end" value="' + x.end + '" aria-label="' + t('f.end') + ' · ' + weekdayName(i) + '" oninput="setSession(' + i + ', \'end\', this.value)">' +
      '</div>';
    }).join('');
    el('act-days-hint').hidden = days.length < 2;
  }
  // Un día nuevo propone el horario del primer día que ya tenga horas
  function toggleActDay(i){
    if(actSessions[i]){ delete actSessions[i]; }
    else {
      var first = Object.keys(actSessions).map(Number).sort().map(function(d){ return actSessions[d]; })
        .filter(function(x){ return x.start || x.end; })[0];
      actSessions[i] = first ? { start: first.start, end: first.end } : { start:'', end:'' };
    }
    el('act-days').classList.remove('is-invalid');
    refreshActivityForm();
  }
  function setSession(i, key, v){ if(actSessions[i]){ actSessions[i][key] = v; } }

  function setActTaskOn(on){
    el('act-task-switch').setAttribute('aria-checked', on);
    el('act-task-fields').hidden = !on;
  }
  function toggleActivityTask(){
    var on = el('act-task-switch').getAttribute('aria-checked') !== 'true';
    setActTaskOn(on);
    if(on){
      if(!el('atask-name').value && el('act-name').value.trim()){
        el('atask-name').value = t('task.namePreAct', { act: el('act-name').value.trim() });
      }
      el('atask-name').focus();
    }
  }

  function saveActivity(ev){
    ev.preventDefault();
    var withTask = el('act-task-switch').getAttribute('aria-checked') === 'true';
    var missing = [], days = Object.keys(actSessions).map(Number).sort();
    document.querySelectorAll('#act-form .is-invalid').forEach(function(f){ f.classList.remove('is-invalid'); });
    function need(ok, fields, key){
      if(ok){ return; }
      fields.forEach(function(f){ el(f).classList.add('is-invalid'); });
      if(missing.indexOf(t(key)) < 0){ missing.push(t(key)); }
    }
    need(el('act-name').value.trim(), ['act-name'], 'f.name');
    need(days.length, ['act-days'], 'f.days');
    days.forEach(function(i){
      need(actSessions[i].start, ['act-s' + i + '-start'], 'f.start');
      need(actSessions[i].end, ['act-s' + i + '-end'], 'f.end');
    });
    need(PICK.act.cat, ['act-cat'], 'f.cat');
    need(PICK.act.prio, ['act-prio'], 'f.prio');
    need(el('act-place').value.trim(), ['act-place'], 'f.place');
    if(withTask){
      need(el('atask-name').value.trim(), ['atask-name'], 'task.name');
      need(getDur('atask-est') > 0, ['atask-est-h', 'atask-est-m'], 'task.est');
    }
    if(missing.length){ toast(t('err.missing', { fields: missing.join(', ') })); return; }
    var bad = days.filter(function(i){ return actSessions[i].end <= actSessions[i].start; });
    if(bad.length){
      bad.forEach(function(i){ el('act-s' + i + '-end').classList.add('is-invalid'); });
      toast(t('err.endBefore', { day: weekdayName(bad[0]) })); return;
    }
    var c = eventCategory({ cat: PICK.act.cat, catName: editingAct && editingAct.catName, catColor: editingAct && editingAct.catColor });
    var data = {
      id: editingAct ? editingAct.id : 'a' + Date.now(),
      name: el('act-name').value.trim(),
      sessions: days.map(function(i){ return { day: i, start: actSessions[i].start, end: actSessions[i].end }; }),
      cat: c.id, catName: c.name, catColor: c.color, prio: PICK.act.prio,
      place: el('act-place').value.trim(), desc: el('act-desc').value.trim(),
      // Tarea de práctica: deadline siempre la siguiente sesión; prioridad la de la actividad salvo la propia puesta en Tareas
      task: withTask ? { name: el('atask-name').value.trim(), est: getDur('atask-est'),
        prio: editingAct && editingAct.task ? editingAct.task.prio || null : null,
        desc: editingAct && editingAct.task ? editingAct.task.desc || '' : '' } : null
    };
    if(editingAct){ USER_ACTS[USER_ACTS.indexOf(editingAct)] = data; } else { USER_ACTS.push(data); }
    storeActivities();
    renderActivities();
    renderTasks();
    renderCalendar(calView);
    openActivity(data.id);
    toast(t('toast.actSaved', { name: data.name }));
  }

  // Eliminar una actividad pide una segunda pulsación y se lleva su tarea
  function cancelActivity(btn){
    var a = editingAct;
    if(!a){ return; }
    if(!btn.classList.contains('is-confirm')){
      btn.classList.add('is-confirm');
      btn.textContent = t(a.task ? 'act.cancelConfirmTask' : 'act.cancelConfirm');
      return;
    }
    USER_ACTS.splice(USER_ACTS.indexOf(a), 1);
    storeActivities();
    editingAct = null;
    afterDelete('act');
    renderActivities();
    renderTasks();
    renderCalendar(calView);
    toast(t(a.task ? 'toast.actTaskCancelled' : 'toast.actCancelled', { name: a.name }));
  }

  // Para el Calendario: cada sesión de la semana y, si hay tarea de práctica, su entrega
  // al empezar esa sesión (es la deadline de la tarea de la sesión anterior)
  function weekUserActs(){
    var out = [];
    USER_ACTS.forEach(function(a){
      var c = eventCategory(a);
      a.sessions.forEach(function(x){
        out.push({ day: x.day, title: a.name, start: toHours(x.start), end: toHours(x.end), color: c ? c.color : null, catLabel: c ? c.name : '', ref: { kind:'activity', id:a.id } });
      });
    });
    return out;
  }
  // Bloques de trabajo de la semana (atenuados si la tarea ya está hecha)
  function weekBlocks(){
    return liveBlocks().map(function(o){
      return { day: weekDayIndex(o.b.date), title: o.x.name, start: o.b.start, end: o.b.end, block: true, done: o.x.done || isLogged(o.b), ref: { kind:'task', id:o.x.key } };
    }).filter(function(e){ return e.day >= 0; });
  }
  function weekActTasks(){
    var out = [];
    USER_ACTS.forEach(function(a){
      if(!a.task){ return; }
      a.sessions.forEach(function(x){
        var due = new Date(WEEK_DAYS[x.day].d.getTime()); due.setMinutes(Math.round(toHours(x.start) * 60));
        out.push({ day: x.day, title: a.task.name, time: toHours(x.start), cat: 'tarea', done: (a.task.doneFor || []).indexOf(occKey(due)) >= 0, ref: { kind:'task', id:'a:' + a.id } });
      });
    });
    return out;
  }

  el('act-form').addEventListener('input', function(ev){
    ev.target.classList.remove('is-invalid');
    var pair = ev.target.closest('.dur-input');
    if(pair){ pair.querySelectorAll('.is-invalid').forEach(function(f){ f.classList.remove('is-invalid'); }); }
  });

  /* ================= TAREAS ================= */
  // Todas las tareas en una lista: las de Classroom, las sueltas añadidas a mano y las
  // generadas por eventos y actividades. Se abren pulsando encima y se editan aquí: nombre,
  // entrega (la de las actividades es siempre la siguiente sesión), tiempo estimado,
  // prioridad y descripción. Prioridad por defecto: la del evento o actividad del que salen,
  // o la de la categoría Tarea; cambiarla aquí solo afecta a esa tarea.
  var OWN_TASKS = null, editingTask = null, taskPrio = null;
  try{ OWN_TASKS = JSON.parse(localStorage.getItem('app-tasks') || 'null'); }catch(e){}
  if(!OWN_TASKS){ OWN_TASKS = []; }
  function storeTasks(){ try{ localStorage.setItem('app-tasks', JSON.stringify(OWN_TASKS)); }catch(e){} schedulePrompts(); }

  function atTime(iso, hhmm){ var d = isoDate(iso); d.setMinutes(Math.round(toHours(hhmm) * 60)); return d; }
  function fmtWhen(d){ return fmtDay(isoOf(d)) + ' ' + fmtHour(d.getHours() + d.getMinutes() / 60); }

  // Lista unificada: {key, kind, name, due, est, prio (efectiva), own, basePrio, desc, origin, ref}
  function allTasks(){
    var now = appNow(), catPrio = (findCategory('tarea') || {}).prio || 'Alta', out = [];
    OWN_TASKS.forEach(function(tk){
      var manual = tk.source === 'manual';
      out.push({ key:'s:' + tk.id, kind: manual ? 'manual' : 'classroom', name:tk.name, due:atTime(tk.date, tk.time), est:tk.est, own:tk.prio, basePrio:catPrio,
                 desc:tk.desc, origin: manual ? t('task.fromManual') : t('task.fromClassroom', { name: tk.course }), ref:tk });
    });
    USER_EVENTS.forEach(function(e){
      if(!e.task){ return; }
      out.push({ key:'e:' + e.id, kind:'event', name:e.task.name, due:atTime(e.task.date, e.task.time), est:e.task.est, own:e.task.prio, basePrio:e.prio,
                 desc:e.task.desc, origin:t('task.fromEvent', { name: e.name }), ref:e.task, parent:e });
    });
    USER_ACTS.forEach(function(a){
      if(!a.task){ return; }
      out.push({ key:'a:' + a.id, kind:'activity', name:a.task.name, due:nextSession(a, now), est:a.task.est, own:a.task.prio, basePrio:a.prio,
                 desc:a.task.desc, origin:t('task.fromAct', { name: a.name }), ref:a.task, parent:a });
    });
    out.forEach(function(x){
      x.prio = x.own || x.basePrio;
      // Hecha: en las de práctica, solo la sesión en curso (la siguiente vuelve a estar pendiente)
      x.done = x.kind === 'activity' ? !!(x.due && (x.ref.doneFor || []).indexOf(occKey(x.due)) >= 0) : !!x.ref.done;
      x.overdue = !x.done && !!x.due && x.due < now;
    });
    return out.sort(function(p, q){ return (p.due || Infinity) - (q.due || Infinity); });
  }
  function occKey(d){ return isoOf(d) + 'T' + fmtHour(d.getHours() + d.getMinutes() / 60); }

  // Marcar / reabrir una tarea (con «Deshacer» en el aviso)
  function setTaskDone(key, done, silent){
    var x = allTasks().filter(function(it){ return it.key === key; })[0];
    if(!x){ return; }
    if(x.kind === 'activity'){
      var list = x.ref.doneFor = (x.ref.doneFor || []).filter(function(k){ return k !== occKey(x.due); });
      if(done){ list.push(occKey(x.due)); }
    } else {
      x.ref.done = done;
      x.ref.doneAt = done ? isoOf(appNow()) : null;
    }
    storeTasks(); storeEvents(); storeActivities();
    renderTasks(); renderEvents(); renderActivities(); renderCalendar(calView); renderToday();
    refreshOpenDetails();
    if(!silent){
      toast(t(done ? 'toast.taskDone' : 'toast.taskReopened', { name: x.name }),
        { label: t('btn.undo'), fn: function(){ setTaskDone(key, !done, true); } });
    }
  }
  var CHECK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  function checkBtn(key, done){
    return '<button type="button" class="task-check' + (done ? ' is-done' : '') + '" aria-pressed="' + done + '" aria-label="' + t(done ? 'task.reopen' : 'task.markDone') + '" title="' + t(done ? 'task.reopen' : 'task.markDone') + '" ' +
      'onclick="event.stopPropagation(); setTaskDone(\'' + key + '\', ' + !done + ')" onkeydown="event.stopPropagation()">' + CHECK_ICON + '</button>';
  }

  function openAttrs(fn, id){
    return 'role="button" tabindex="0" onclick="' + fn + '(\'' + id + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){ event.preventDefault(); ' + fn + '(\'' + id + '\'); }"';
  }
  var ROW_CHEV = '<svg class="row-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

  function taskRow(x){
    var when = x.due ? t('task.dueAt', { t: fmtWhen(x.due) }) : '—';
    var est = x.est ? fmtEst(x.est) : '<span class="est-missing">' + t('task.noEst') + '</span>';
    return '<div class="row evt-row row-open task-row' + (x.done ? ' is-done' : '') + (x.overdue ? ' is-overdue' : '') + '" ' + openAttrs('openTask', x.key) + '>' +
      checkBtn(x.key, x.done) +
      '<div class="row-body">' +
        '<span class="evt-title-line"><span class="row-title">' + esc(x.name) + '</span>' +
          '<span class="prio-chip prio-' + x.prio + '">' + t('prio.' + x.prio) + '</span></span>' +
        '<span class="row-sub"><span>' + when + ' · ' + est + '</span></span>' +
        '<span class="row-sub">' + TASK_SVG + '<span>' + esc(x.origin) + '</span></span>' +
        (!x.done && doneMin(x.key) ? progressHtml(x) : '') +
        (x.desc && !x.done ? '<span class="evt-desc">' + esc(x.desc) + '</span>' : '') +
      '</div>' + ROW_CHEV +
    '</div>';
  }
  function renderTasks(){
    var list = el('task-list');
    if(!list){ return; }
    var items = allTasks();
    // Semana visible en el calendario (lunes a domingo de la semana actual)
    var wk0 = new Date(TODAY_DATE); wk0.setDate(wk0.getDate() - (wk0.getDay() + 6) % 7);
    var wk1 = new Date(wk0); wk1.setDate(wk1.getDate() + 7);
    var overdue = items.filter(function(x){ return x.overdue; }),
        pending = items.filter(function(x){ return !x.done && !x.overdue; }),
        // Las hechas se quitan de la lista cuando su fecha queda fuera de la semana del calendario
        done = items.filter(function(x){ return x.done && (!x.due || (x.due >= wk0 && x.due < wk1)); });
    el('task-list-wrap').hidden = !(overdue.length + pending.length + done.length);
    // Atrasadas arriba y Hechas al final: ambas plegadas y sólo si tienen algo dentro
    el('task-overdue-wrap').hidden = !overdue.length;
    el('tasks-overdue-count').textContent = overdue.length;
    el('task-overdue').innerHTML = overdue.map(taskRow).join('');
    el('task-pending-title').hidden = !pending.length;
    list.innerHTML = pending.map(taskRow).join('');
    el('tasks-done').hidden = !done.length;
    el('tasks-done-count').textContent = done.length;
    el('task-done-list').innerHTML = done.map(taskRow).join('');
  }


  var CAL_PLAN_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 15h8"/></svg>';
  function openTask(key){
    var x = allTasks().filter(function(it){ return it.key === key; })[0];
    if(!x){ showView('task', 'list'); return; }
    editingTask = x;
    var dueTxt = x.due ? fmtWhen(x.due) : '—';
    renderDetail('task', {
      title: x.name, prio: x.prio,
      rows: [
        [t('d.origin'), TASK_SVG + esc(x.origin)],
        [t('task.dueDate'), x.kind === 'activity' ? t('task.dueNextAt', { t: dueTxt }) : dueTxt],
        [t('task.est'), x.est ? fmtEst(x.est) : '<span class="est-missing">' + t('task.noEst') + '</span>'],
        [t('f.prio'), prioHtml(x.prio, !!x.own)],
        [t('f.desc'), x.desc ? esc(x.desc) : ''],
        [t('d.status'), t(x.done ? 'status.done' : x.overdue ? 'status.overdue' : 'status.pending')],
        [t('d.progress'), progressHtml(x)],
        [t('d.blocks'), blocksOf(key).map(function(b){
          return '<span class="block-line">' + fmtDay(b.date) + ' ' + fmtHour(b.start) + '–' + fmtHour(b.end) + (isLogged(b) ? ' <span class="muted">· ' + t('prog.logged', { t: b.logged ? fmtEst(b.logged) : '0 min' }) + '</span>' : '') + '</span>';
        }).join('')]
      ],
      extra: '<button type="button" class="btn-done' + (x.done ? ' is-done' : '') + '" onclick="setTaskDone(\'' + key + '\', ' + !x.done + ')">' + CHECK_ICON + t(x.done ? 'task.reopen' : 'task.markDone') + '</button>' +
        (x.done ? '' : '<button type="button" class="btn-plan" onclick="openPlan(\'' + key + '\')">' + CAL_PLAN_SVG + t('task.plan') + '</button>'),
      edit: "openTaskForm('" + key + "')", del: 'deleteTask(this)', delLabel: t('task.delete')
    });
  }

  // Sin clave: tarea suelta nueva, añadida a mano (prioridad por defecto: la de la categoría Tarea)
  function openTaskForm(key){
    var x = key ? allTasks().filter(function(it){ return it.key === key; })[0] : null;
    if(key && !x){ return; }
    if(!x){
      var base = (findCategory('tarea') || {}).prio || 'Alta';
      x = { kind:'manual', isNew:true, name:'', est:0, basePrio:base, prio:base, desc:'', origin:t('task.fromManual'), ref:{ date:'', time:'' } };
    }
    editingTask = x;
    taskPrio = x.prio;
    el('tk-form-title').textContent = t(x.isNew ? 'task.newTitle' : 'task.editTitle');
    el('tk-origin').innerHTML = TASK_SVG + '<span>' + esc(x.origin) + '</span>';
    el('tk-name').value = x.name;
    var auto = x.kind === 'activity';
    el('tk-due-row').hidden = auto;
    el('tk-due-auto').hidden = !auto;
    if(auto){ el('tk-due-auto-text').textContent = t('task.dueNextAt', { t: x.due ? fmtWhen(x.due) : '—' }); }
    else { el('tk-date').value = x.ref.date; el('tk-time').value = x.ref.time; }
    setDur('tk-est', x.est);
    el('tk-desc').value = x.desc || '';
    document.querySelectorAll('#task-form .is-invalid').forEach(function(f){ f.classList.remove('is-invalid'); });
    refreshTaskPrio();
    showView('task', 'form');
    el('tk-name').focus();
  }
  function closeTaskForm(){
    if(editingTask && !editingTask.isNew){ openTask(editingTask.key); } else { editingTask = null; showView('task', 'list'); }
  }
  function setTaskPrio(btn){ taskPrio = btn.dataset.prio; refreshTaskPrio(); }
  function refreshTaskPrio(){
    var x = editingTask;
    if(!x){ return; }
    document.querySelectorAll('#tk-prio .toggle-btn').forEach(function(b){
      var on = b.dataset.prio === taskPrio;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', on);
    });
    var key = x.kind === 'event' ? 'hint.taskPrioEvt' : x.kind === 'activity' ? 'hint.taskPrioAct' : 'hint.taskPrioCat';   // Classroom y a mano: categoría Tarea
    el('tk-prio-hint').textContent = t(key, { p: t('prio.' + x.basePrio) });
  }

  function saveTask(ev){
    ev.preventDefault();
    var x = editingTask, auto = x.kind === 'activity', missing = [];
    document.querySelectorAll('#task-form .is-invalid').forEach(function(f){ f.classList.remove('is-invalid'); });
    function need(ok, fields, key){ if(ok){ return; } fields.forEach(function(f){ el(f).classList.add('is-invalid'); }); missing.push(t(key)); }
    need(el('tk-name').value.trim(), ['tk-name'], 'task.name');
    if(!auto){
      need(el('tk-date').value, ['tk-date'], 'task.dueDate');
      need(el('tk-time').value, ['tk-time'], 'task.dueTime');
    }
    need(getDur('tk-est') > 0, ['tk-est-h', 'tk-est-m'], 'task.est');
    if(missing.length){ toast(t('err.missing', { fields: missing.join(', ') })); return; }
    if(x.kind === 'event' && el('tk-date').value + el('tk-time').value > x.parent.date + x.parent.time){
      el('tk-date').classList.add('is-invalid'); el('tk-time').classList.add('is-invalid');
      toast(t('err.taskAfter')); return;
    }
    var r = x.ref;
    if(x.isNew){
      r = { id:'m' + Date.now(), source:'manual' };
      OWN_TASKS.push(r);
      x.key = 's:' + r.id;
    }
    r.name = el('tk-name').value.trim();
    if(!auto){ r.date = el('tk-date').value; r.time = el('tk-time').value; }
    r.est = getDur('tk-est');
    r.desc = el('tk-desc').value.trim();
    // Prioridad propia solo si es distinta de la que le corresponde por defecto
    r.prio = taskPrio !== x.basePrio ? taskPrio : null;
    storeTasks(); storeEvents(); storeActivities();
    renderTasks(); renderEvents(); renderActivities(); renderCalendar(calView);
    openTask(x.key);
    toast(t('toast.taskSaved', { name: r.name }));
  }

  // Eliminar (desde la ficha) pide una segunda pulsación; en eventos y actividades la tarea se quita de su origen
  function deleteTask(btn){
    var x = editingTask;
    if(!x){ return; }
    if(!btn.classList.contains('is-confirm')){
      btn.classList.add('is-confirm');
      btn.textContent = t(x.parent ? 'task.deleteConfirmLinked' : 'task.deleteConfirm', { name: x.parent ? x.parent.name : '' });
      return;
    }
    if(x.parent){ x.parent.task = null; } else { OWN_TASKS.splice(OWN_TASKS.indexOf(x.ref), 1); }
    WORK_BLOCKS = WORK_BLOCKS.filter(function(b){ return b.task !== x.key; });
    storeTasks(); storeEvents(); storeActivities(); storeBlocks();
    editingTask = null;
    afterDelete('task');
    renderTasks(); renderEvents(); renderActivities(); renderCalendar(calView);
    toast(t('toast.taskDeleted', { name: x.name }));
  }

  /* ================= BLOQUES DE TRABAJO ================= */
  // Tiempo reservado para trabajar en una tarea: {id, task (clave de la tarea), date, start, end}
  // (horas en decimal). Se crean con «Planificar» en la ficha de la tarea: la App propone
  // bloques en los huecos libres antes de la entrega y el usuario los mueve, alarga o acorta
  // sin salir nunca del hueco libre.
  var WORK_BLOCKS = [];
  try{ WORK_BLOCKS = JSON.parse(localStorage.getItem('app-blocks') || '[]') || []; }catch(e){ WORK_BLOCKS = []; }
  function storeBlocks(){ try{ localStorage.setItem('app-blocks', JSON.stringify(WORK_BLOCKS)); }catch(e){} schedulePrompts(); }
  var BLOCK_STEP = 5 / 60, BLOCK_MIN = 0.25, BLOCK_MAX = 1.5, BLOCK_NEW = 0.5, PLAN_DAYS = 14;
  // Bloques cuya tarea sigue existiendo, con la tarea al lado
  function liveBlocks(){
    var byKey = {};
    allTasks().forEach(function(x){ byKey[x.key] = x; });
    return WORK_BLOCKS.filter(function(b){ return byKey[b.task]; }).map(function(b){ return { b:b, x:byKey[b.task] }; });
  }
  function blocksOf(key){ return WORK_BLOCKS.filter(function(b){ return b.task === key; }).sort(function(p, q){ return (p.date + fmtHour(p.start)).localeCompare(q.date + fmtHour(q.start)); }); }
  function blockHours(list){ return list.reduce(function(sum, b){ return sum + (b.end - b.start); }, 0); }
  // Progreso: cada bloque terminado guarda en «logged» los minutos trabajados (lo confirma el usuario)
  function blockEnd(b){ return atTime(b.date, fmtHour(b.end)); }
  function isLogged(b){ return typeof b.logged === 'number'; }
  // Editable en «Planificar»: sin registrar y sin terminar
  function isEditable(b){ return !isLogged(b) && blockEnd(b) > appNow(); }
  function doneMin(key){ return blocksOf(key).reduce(function(sum, b){ return sum + (isLogged(b) ? b.logged : 0); }, 0); }
  // Planificado pendiente: bloques sin registrar (los futuros y los terminados sin confirmar)
  function plannedMin(key){ return Math.round(blockHours(blocksOf(key).filter(function(b){ return !isLogged(b); })) * 60); }
  // Barra de progreso de una tarea (hecho / estimado); extra: minutos aún sin guardar
  function progressHtml(x, extra){
    var done = doneMin(x.key) + (extra || 0);
    if(!x.est && !done){ return ''; }
    var pct = x.est ? Math.min(100, Math.round(done / x.est * 100)) : 0;
    return '<span class="progress-line"><span class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></span>' +
      '<span class="progress-text">' + (x.est ? t('prog.of', { done: done ? fmtEst(done) : '0 min', est: fmtEst(x.est) }) : t('prog.done', { done: fmtEst(done) })) + '</span></span>';
  }
  function snap(h){ return Math.round(h / BLOCK_STEP) * BLOCK_STEP; }
  function addDays(iso, n){ var d = isoDate(iso); d.setDate(d.getDate() + n); return isoOf(d); }

  // Ocupado ese día: cole, actividades, eventos y bloques (menos los de skip); extra: bloques en borrador
  function busyOn(iso, skip, extra){
    var d = isoDate(iso), wd = weekdayOf(d), out = [], sc = schoolForDate(d);
    if(sc.on){ out.push([toHours(sc.entry), toHours(sc.exit)]); }
    USER_ACTS.forEach(function(a){ a.sessions.forEach(function(x){ if(x.day === wd){ out.push([toHours(x.start), toHours(x.end)]); } }); });
    USER_EVENTS.forEach(function(e){ if(e.date === iso){ var h = toHours(e.time); out.push([h, h + (e.dur || 60) / 60]); } });
    WORK_BLOCKS.concat(extra || []).forEach(function(b){ if(b.date === iso && (skip || []).indexOf(b.id) < 0){ out.push([b.start, b.end]); } });
    return out.sort(function(p, q){ return p[0] - q[0]; });
  }
  // Huecos libres de un día dentro de la franja horaria (Config), entre from y to
  function freeGaps(iso, from, to, skip, extra){
    var b = dayBounds(), lo = Math.max(toHours(b.start), from), hi = Math.min(toHours(b.end), to), gaps = [], cur = lo;
    busyOn(iso, skip, extra).forEach(function(r){
      if(r[0] > cur){ gaps.push([cur, Math.min(r[0], hi)]); }
      cur = Math.max(cur, r[1]);
    });
    if(cur < hi){ gaps.push([cur, hi]); }
    return gaps.filter(function(g){ return g[1] - g[0] >= BLOCK_MIN - 1e-9; });
  }
  // Límites de un día para una tarea: desde ahora (si es hoy) hasta la entrega (si es ese día)
  function planLimits(iso, due){
    var now = appNow(), from = 0, to = 24;
    if(iso === isoOf(now)){ from = Math.ceil((now.getHours() + now.getMinutes() / 60) / BLOCK_STEP - 1e-9) * BLOCK_STEP; }
    if(due && iso === isoOf(due)){ to = due.getHours() + due.getMinutes() / 60; }
    return { from:from, to:to };
  }
  function planDays(due){
    var out = [], iso = isoOf(appNow()), last = due ? isoOf(due) : addDays(iso, PLAN_DAYS - 1);
    for(var i = 0; i < PLAN_DAYS && iso <= last; i++){ out.push(iso); iso = addDays(iso, 1); }
    return out;
  }
  // Todos los huecos libres para la tarea (por orden), sin contar el bloque skip y con los borradores
  function planGaps(due, skip, extra){
    var out = [];
    planDays(due).forEach(function(iso){
      var l = planLimits(iso, due);
      freeGaps(iso, l.from, l.to, skip, extra).forEach(function(g){ out.push({ date:iso, s:g[0], e:g[1] }); });
    });
    return out;
  }
  // Propuesta: un bloque por día (de hasta BLOCK_MAX) desde hoy hasta la entrega, en el primer hueco
  // donde quepa entero (si no, en el más grande), con SUG_GAP de margen con lo de antes y después.
  // Si con un bloque por día no se llega, se añaden más en otra pasada.
  var SUG_MIN = 0.5, SUG_GAP = 0.25;
  function suggestBlocks(x, left, drafts){
    var out = [], all = (drafts || []).slice(), eps = 1e-9;
    for(var pass = 0; pass < 3 && left >= BLOCK_MIN - eps; pass++){
      planDays(x.due).forEach(function(iso){
        if(left < BLOCK_MIN - eps || out.length >= 8){ return; }
        if(pass === 0 && all.some(function(o){ return o.task === x.key && o.date === iso; })){ return; }
        var l = planLimits(iso, x.due), bnd = dayBounds();
        var lo = Math.max(toHours(bnd.start), l.from), hi = Math.min(toHours(bnd.end), l.to);
        var need = Math.max(Math.min(SUG_MIN, left), BLOCK_MIN), want = Math.min(left, BLOCK_MAX);
        var gaps = freeGaps(iso, l.from, l.to, [], all).map(function(g){
          return [g[0] > lo + eps ? g[0] + SUG_GAP : g[0], g[1] < hi - eps ? g[1] - SUG_GAP : g[1]];
        }).filter(function(g){ return g[1] - g[0] >= need - eps; });
        if(!gaps.length){ return; }
        var g = gaps.filter(function(g){ return g[1] - g[0] >= want - eps; })[0] ||
                gaps.slice().sort(function(p, q){ return (q[1] - q[0]) - (p[1] - p[0]); })[0];
        var len = Math.min(want, g[1] - g[0]);
        var nb = { id:'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), task:x.key, date:iso, start:g[0], end:g[0] + len };
        out.push(nb); all.push(nb); left -= len;
      });
    }
    return out;
  }

  /* ---- Pantalla «Planificar» ---- */
  var PLAN = null;   // { key, x, drafts }
  // at (pulsación larga): { date, h, back } → un bloque nuevo que empieza en ese punto
  function openPlan(key, at){
    var x = allTasks().filter(function(it){ return it.key === key; })[0];
    if(!x){ return; }
    var drafts = blocksOf(key).filter(isEditable).map(function(b){ return Object.assign({}, b); });
    PLAN = { key:key, x:x, drafts:drafts, back: at && at.back };
    if(at){
      var left = x.est ? (planLeftMin() / 60) : 0;
      if(left < BLOCK_MIN - 1e-9){ left = BLOCK_NEW; }
      var g = planGaps(x.due, [], drafts).filter(function(g){ return g.date === at.date && g.s <= at.h + 1e-9 && g.e >= at.h + BLOCK_MIN - 1e-9; })[0];
      if(g){ drafts.push({ id:'b' + Date.now().toString(36), task:key, date:at.date, start:at.h, end:at.h + Math.min(left, BLOCK_MAX, g.e - at.h) }); }
    }
    // Sin bloques: la App propone los suyos para lo que falta
    else if(!drafts.length && x.est && planLeftMin() > 0){ PLAN.drafts = suggestBlocks(x, planLeftMin() / 60, []); }
    el('task-list-view').hidden = true; el('task-detail').hidden = true; el('task-form').hidden = true;
    el('task-plan').hidden = false;
    el('task-plan').closest('.screen').parentElement.scrollTop = 0;
    renderPlan();
    if(x.est && !PLAN.drafts.length){ toast(t('plan.none')); }
    var seen = false;
    try{ seen = localStorage.getItem('tut-plan') === '1'; }catch(e){}
    if(!seen){ el('plan-tutorial').showModal(); }
  }
  function closeTutorial(){
    el('plan-tutorial').close();
    try{ localStorage.setItem('tut-plan', '1'); }catch(e){}
  }
  function closePlan(){
    el('task-plan').hidden = true;
    var key = PLAN && PLAN.key, back = PLAN && PLAN.back;
    PLAN = null;
    if(back){ back(); } else if(key){ openTask(key); } else { showView('task', 'list'); }
  }
  function savePlan(ev){
    if(ev){ ev.preventDefault(); }
    var key = PLAN.key, name = PLAN.x.name;
    // Los bloques ya terminados (registrados o por confirmar) se conservan tal cual
    WORK_BLOCKS = WORK_BLOCKS.filter(function(b){ return b.task !== key || !isEditable(b); }).concat(PLAN.drafts.map(function(b){
      return { id:b.id, task:key, date:b.date, start:b.start, end:b.end };
    }));
    storeBlocks();
    closePlan();
    renderCalendar(calView); renderToday();
    toast(t('toast.planSaved', { name: name }));
  }
  // Minutos planificados en el borrador más los bloques terminados sin confirmar
  function planPlannedMin(){
    var fixed = blocksOf(PLAN.key).filter(function(b){ return !isEditable(b) && !isLogged(b); });
    return Math.round((blockHours(PLAN.drafts) + blockHours(fixed)) * 60);
  }
  // Lo que falta por planificar: estimado − hecho − planificado
  function planLeftMin(){ return PLAN.x.est ? PLAN.x.est - doneMin(PLAN.key) - planPlannedMin() : 0; }
  function planSummary(){
    var x = PLAN.x, plan = planPlannedMin(), done = doneMin(PLAN.key), parts = [];
    parts.push(x.est ? t('plan.pEst', { t: fmtEst(x.est) }) : t('plan.pNoEst'));
    if(done){ parts.push(t('plan.pDone', { t: fmtEst(done) })); }
    parts.push(t('plan.pPlan', { t: plan ? fmtEst(plan) : '0 min' }));
    if(x.est){ var left = planLeftMin(); parts.push(left > 0 ? t('plan.pLeft', { t: fmtEst(left) }) : t('plan.pFull')); }
    return parts.join(' · ');
  }
  // Hueco libre en el que está un bloque (sin contar él mismo; los otros borradores sí ocupan)
  function gapOf(b){
    var others = PLAN.drafts.filter(function(o){ return o !== b; }), l = planLimits(b.date, PLAN.x.due);
    var gaps = freeGaps(b.date, Math.min(l.from, b.start), Math.max(l.to, b.end), [b.id], others);
    return gaps.filter(function(g){ return g[0] <= b.start + 1e-9 && g[1] >= b.end - 1e-9; })[0] || [b.start, b.end];
  }
  function renderPlan(){
    var x = PLAN.x;
    el('plan-task').textContent = x.name;
    el('plan-due').textContent = x.due ? t('task.dueAt', { t: fmtWhen(x.due) }) : '';
    el('plan-sum').textContent = planSummary();
    el('plan-prog').innerHTML = progressHtml(x);
    el('plan-hint').hidden = !!x.est;
    el('plan-hint').textContent = x.est ? '' : t('plan.noEst');
    PLAN.drafts.sort(function(p, q){ return (p.date + fmtHour(p.start)).localeCompare(q.date + fmtHour(q.start)); });
    var list = el('plan-list');
    if(!PLAN.drafts.length){ list.innerHTML = '<p class="plan-empty">' + t('plan.empty') + '</p>'; return; }
    list.innerHTML = PLAN.drafts.map(function(b, i){
      var g = gapOf(b), span = g[1] - g[0];
      var left = (b.start - g[0]) / span * 100, width = (b.end - b.start) / span * 100;
      var prev = neighbourGap(b, -1), next = neighbourGap(b, 1);
      return '<div class="plan-card" data-i="' + i + '">' +
        '<div class="plan-card-head">' +
          '<button type="button" class="plan-icon" onclick="jumpBlock(' + i + ', -1)" aria-label="' + t('plan.prevGap') + '" title="' + t('plan.prevGap') + '"' + (prev ? '' : ' disabled') + '>' + CHEV_L + '</button>' +
          '<span class="plan-when">' + fmtDay(b.date) + ' · ' + fmtHour(b.start) + '–' + fmtHour(b.end) + ' <span class="plan-len">(' + fmtEst(Math.round((b.end - b.start) * 60)) + ')</span></span>' +
          '<button type="button" class="plan-icon" onclick="jumpBlock(' + i + ', 1)" aria-label="' + t('plan.nextGap') + '" title="' + t('plan.nextGap') + '"' + (next ? '' : ' disabled') + '>' + CHEV_R + '</button>' +
          '<button type="button" class="plan-icon" onclick="removeBlock(' + i + ')" aria-label="' + t('plan.remove') + '" title="' + t('plan.remove') + '">' + TRASH_SVG + '</button>' +
        '</div>' +
        '<div class="plan-track" aria-label="' + t('plan.gap', { a: fmtHour(g[0]), b: fmtHour(g[1]) }) + '">' +
          '<div class="plan-block is-block" tabindex="0" role="slider" aria-label="' + t('plan.move') + '" aria-valuetext="' + fmtHour(b.start) + '–' + fmtHour(b.end) + '" data-mode="move" style="left:' + left + '%;width:' + width + '%">' +
            '<span class="plan-handle is-start" tabindex="0" role="slider" aria-label="' + t('plan.startH') + '" aria-valuetext="' + fmtHour(b.start) + '" data-mode="start"></span>' +
            '<span class="plan-handle is-end" tabindex="0" role="slider" aria-label="' + t('plan.endH') + '" aria-valuetext="' + fmtHour(b.end) + '" data-mode="end"></span>' +
          '</div>' +
        '</div>' +
        '<div class="plan-scale"><span>' + fmtHour(g[0]) + '</span><span>' + fmtHour(g[1]) + '</span></div>' +
      '</div>';
    }).join('');
  }
  var CHEV_L = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';
  var CHEV_R = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  var TRASH_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';

  // Hueco libre anterior (dir -1) o siguiente (dir 1) a un bloque, donde quepa al menos BLOCK_MIN
  function neighbourGap(b, dir){
    var others = PLAN.drafts.filter(function(o){ return o !== b; });
    var gaps = planGaps(PLAN.x.due, [b.id], others), key = b.date + fmtHour(b.start), cur = gapOf(b);
    var list = gaps.filter(function(g){
      var same = g.date === b.date && Math.abs(g.s - cur[0]) < 1e-6;
      return !same && (dir < 0 ? (g.date + fmtHour(g.s)) < key : (g.date + fmtHour(g.s)) > key);
    });
    return dir < 0 ? list[list.length - 1] : list[0];
  }
  function jumpBlock(i, dir){
    var b = PLAN.drafts[i], g = neighbourGap(b, dir);
    if(!g){ return; }
    var len = Math.min(b.end - b.start, g.e - g.s);
    b.date = g.date; b.start = g.s; b.end = g.s + len;
    renderPlan();
  }
  function removeBlock(i){ PLAN.drafts.splice(i, 1); renderPlan(); }
  function addPlanBlock(){
    var x = PLAN.x, left = x.est ? planLeftMin() / 60 : BLOCK_NEW;
    if(left < BLOCK_MIN - 1e-9){ left = BLOCK_NEW; }
    var nb = suggestBlocks(x, Math.min(left, BLOCK_MAX), PLAN.drafts);
    if(!nb.length){ toast(t('plan.none')); return; }
    PLAN.drafts.push(nb[0]);
    renderPlan();
  }

  // Arrastrar: el bloque entero lo mueve; sus extremos lo alargan o acortan. Nunca sale del hueco.
  function applyDrag(b, mode, g, s0, e0, dh){
    var len = e0 - s0;
    if(mode === 'move'){ b.start = Math.min(Math.max(snap(s0 + dh), g[0]), g[1] - len); b.end = b.start + len; }
    else if(mode === 'start'){ b.start = Math.min(Math.max(snap(s0 + dh), g[0]), e0 - BLOCK_MIN); }
    else { b.end = Math.max(Math.min(snap(e0 + dh), g[1]), s0 + BLOCK_MIN); }
  }
  el('task-plan').addEventListener('pointerdown', function(ev){
    var tgt = ev.target.closest('[data-mode]');
    if(!tgt || !PLAN){ return; }
    ev.preventDefault(); ev.stopPropagation();
    var card = tgt.closest('.plan-card'), b = PLAN.drafts[+card.dataset.i], g = gapOf(b);
    var track = card.querySelector('.plan-track'), w = track.getBoundingClientRect().width, x0 = ev.clientX;
    var s0 = b.start, e0 = b.end, mode = tgt.dataset.mode, blk = card.querySelector('.plan-block');
    blk.setPointerCapture(ev.pointerId);
    function move(e){
      applyDrag(b, mode, g, s0, e0, (e.clientX - x0) / w * (g[1] - g[0]));
      blk.style.left = ((b.start - g[0]) / (g[1] - g[0]) * 100) + '%';
      blk.style.width = ((b.end - b.start) / (g[1] - g[0]) * 100) + '%';
      card.querySelector('.plan-when').innerHTML = fmtDay(b.date) + ' · ' + fmtHour(b.start) + '–' + fmtHour(b.end) + ' <span class="plan-len">(' + fmtEst(Math.round((b.end - b.start) * 60)) + ')</span>';
      el('plan-sum').textContent = planSummary();
    }
    function up(){
      blk.removeEventListener('pointermove', move);
      blk.removeEventListener('pointerup', up);
      blk.removeEventListener('pointercancel', up);
      renderPlan();
    }
    blk.addEventListener('pointermove', move);
    blk.addEventListener('pointerup', up);
    blk.addEventListener('pointercancel', up);
  });
  // Teclado: flechas de 5 en 5 minutos
  el('task-plan').addEventListener('keydown', function(ev){
    var tgt = ev.target.closest && ev.target.closest('[data-mode]');
    if(!tgt || !PLAN || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')){ return; }
    ev.preventDefault();
    var i = +tgt.closest('.plan-card').dataset.i, b = PLAN.drafts[i], mode = tgt.dataset.mode;
    applyDrag(b, mode, gapOf(b), b.start, b.end, ev.key === 'ArrowLeft' ? -BLOCK_STEP : BLOCK_STEP);
    renderPlan();
    var card = el('plan-list').querySelector('.plan-card[data-i="' + i + '"]');
    if(card){ card.querySelector('[data-mode="' + mode + '"]').focus(); }
  });

  /* ================= FIN DE UN BLOQUE ================= */
  // Al terminar un bloque la App pregunta cuánto se ha trabajado (de 0 a lo que falta; por
  // defecto, lo planificado). Si se elige el máximo, pregunta si la tarea está terminada.
  // Sin cronómetro. Si la App estaba cerrada, la pregunta sale al abrirla (y el móvil avisa
  // con una notificación; los permisos se piden en la configuración del primer inicio).
  var END = null, END_LATER = [];
  function pendingEnds(){
    var now = appNow();
    return liveBlocks().filter(function(o){
      return !o.x.done && !isLogged(o.b) && blockEnd(o.b) <= now && END_LATER.indexOf(o.b.id) < 0;
    }).sort(function(p, q){ return blockEnd(p.b) - blockEnd(q.b); });
  }
  function checkBlockEnds(){
    if(END || document.querySelector('dialog[open]')){ return; }
    var o = pendingEnds()[0];
    if(o){ openBlockEnd(o); } else { checkRisks(); }
  }
  // Preguntas pendientes (fin de bloque y avisos de riesgo), tras cualquier cambio de datos
  var promptTimer = null;
  function schedulePrompts(){ clearTimeout(promptTimer); promptTimer = setTimeout(checkBlockEnds, 500); }
  function openBlockEnd(o){
    var b = o.b, x = o.x, len = Math.round((b.end - b.start) * 60);
    var left = x.est ? x.est - doneMin(x.key) : 0;
    var max = left > 0 ? left : len;
    END = { b:b, x:x, max:max, full: left > 0 };
    el('end-task').textContent = x.name;
    el('end-when').textContent = fmtDay(b.date) + ' · ' + fmtHour(b.start) + '–' + fmtHour(b.end) + ' (' + fmtEst(len) + ')';
    var r = el('end-range');
    r.max = max; r.value = Math.min(len, max);
    el('end-max').textContent = fmtEst(max);
    el('end-step1').hidden = false; el('end-step2').hidden = true;
    endInput();
    el('end-dialog').showModal();
    notifyBlockEnd(x);
  }
  // Aviso del sistema (si la App tiene permiso; en la maqueta no se pide)
  function notifyBlockEnd(x){
    try{ if(window.Notification && Notification.permission === 'granted'){ new Notification(t('end.title'), { body: t('end.notif', { name: x.name }) }); } }catch(e){}
  }
  function endInput(){
    var v = +el('end-range').value, x = END.x;
    el('end-value').textContent = v ? fmtEst(v) : '0 min';
    el('end-range').setAttribute('aria-valuetext', el('end-value').textContent);
    el('end-prog').innerHTML = x.est ? progressHtml(x, v) : '';
    el('end-ok').textContent = t(END.full && v >= END.max ? 'end.next' : 'btn.save');
  }
  function endConfirm(){
    var v = +el('end-range').value;
    if(END.full && v >= END.max){
      el('end-q2').textContent = t('end.q2', { name: END.x.name });
      el('end-step1').hidden = true; el('end-step2').hidden = false;
      return;
    }
    endSave(v, false);
  }
  function endFinish(done){ endSave(+el('end-range').value, done); }
  function endSave(v, finished){
    var o = END;
    o.b.logged = v;
    storeBlocks();
    END = null;
    el('end-dialog').close();
    if(finished){ setTaskDone(o.x.key, true); }
    else {
      renderTasks(); renderCalendar(calView); renderToday(); refreshOpenDetails();
      toast(t('end.saved', { t: v ? fmtEst(v) : '0 min', name: o.x.name }));
    }
    setTimeout(checkBlockEnds, 300);
  }
  // «Ahora no»: se vuelve a preguntar la próxima vez que se abra la App
  function endLater(){
    if(END){ END_LATER.push(END.b.id); }
    END = null;
    if(el('end-dialog').open){ el('end-dialog').close(); }
    setTimeout(checkBlockEnds, 300);
  }
  el('end-dialog').addEventListener('cancel', function(ev){ ev.preventDefault(); endLater(); });
  // Con la App abierta, se comprueba cada minuto si ha terminado algún bloque
  // Cada minuto (y al volver a la App) avanza el reloj: «Hoy» se redibuja con la hora nueva y,
  // si ha cambiado el día, se redibuja todo y el Calendario vuelve a la semana de hoy.
  function tickClock(){
    if(syncClock()){ calToday(); applyI18n(); } else { renderToday(); }
    checkBlockEnds();
  }
  setInterval(tickClock, 60000);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden){ tickClock(); } });

  /* ================= AVISO DE RIESGO ================= */
  // Una tarea está en riesgo cuando lo que falta por hacer no cabe en el tiempo libre que queda
  // hasta su entrega. Se cuentan también las tareas que se entregan antes (van primero): por
  // orden de entrega, lo que falta acumulado tiene que caber en el tiempo libre hasta cada entrega.
  // Tiempo libre: la franja horaria menos cole, actividades y eventos (los bloques de trabajo
  // cuentan como libres: son tiempo para las tareas). Sin tiempo estimado no se puede calcular.
  // Dos niveles: rojo, si no cabe; ámbar («cuidado, el tiempo se agota»), si cabe pero con menos
  // de 1 h de margen (el tiempo libre no llega a lo que hace falta + 1 h).
  // Aviso emergente la primera vez para cada nivel; aceptado, no vuelve (si una tarea pasa de ámbar
  // a rojo, sí avisa de nuevo). Mientras quede alguna tarea avisada sin hacer ni eliminar, un único
  // triángulo junto a la barra de tiempo: rojo si alguna llegó a rojo; si no, ámbar.
  var RISK_MARGIN = 60;   // minutos
  var RISK_ACK = [], RISK_SEEN = {};   // RISK_ACK: 'clave:nivel'; RISK_SEEN: clave → peor nivel avisado
  try{
    RISK_ACK = JSON.parse(localStorage.getItem('risk-ack') || '[]') || [];
    RISK_SEEN = JSON.parse(localStorage.getItem('risk-seen') || '{}') || {};
    if(Array.isArray(RISK_SEEN)){ var old = RISK_SEEN; RISK_SEEN = {}; old.forEach(function(k){ RISK_SEEN[k] = 'red'; }); }
    RISK_ACK = RISK_ACK.map(function(k){ return /:(red|amber)$/.test(k) ? k : k + ':red'; });
  }catch(e){}
  function storeRisk(){ try{ localStorage.setItem('risk-ack', JSON.stringify(RISK_ACK)); localStorage.setItem('risk-seen', JSON.stringify(RISK_SEEN)); }catch(e){} }
  function freeMinutesUntil(due){
    var skip = WORK_BLOCKS.map(function(b){ return b.id; }), iso = isoOf(appNow()), last = isoOf(due), total = 0;
    for(var i = 0; i < 60 && iso <= last; i++){
      var l = planLimits(iso, due);
      freeGaps(iso, l.from, l.to, skip, []).forEach(function(g){ total += g[1] - g[0]; });
      iso = addDays(iso, 1);
    }
    return Math.round(total * 60);
  }
  function riskTasks(){
    var now = appNow(), cum = 0, out = [];
    allTasks().filter(function(x){ return !x.done && x.est && x.due && x.due > now; })
      .sort(function(p, q){ return p.due - q.due; })
      .forEach(function(x){
        var own = Math.max(0, x.est - doneMin(x.key));
        cum += own;
        if(!own){ return; }
        var free = freeMinutesUntil(x.due);
        var level = cum > free ? 'red' : cum + RISK_MARGIN > free ? 'amber' : null;
        if(level){ out.push({ x:x, level:level, need:cum, own:own, free:free, shared: cum > own }); }
      });
    return out;
  }
  // Tareas avisadas que siguen sin hacer (el triángulo se queda hasta que se hacen o se eliminan)
  function riskFlagged(){
    var byKey = {};
    allTasks().forEach(function(x){ byKey[x.key] = x; });
    return Object.keys(RISK_SEEN).filter(function(k){ return byKey[k] && !byKey[k].done; })
      .map(function(k){ return { x:byKey[k], level:RISK_SEEN[k] }; });
  }
  var RISK_COLOR = { red:'var(--red-line)', amber:'var(--amber-line)' };
  function triSvg(level, w){
    return '<svg width="' + w + '" height="' + Math.round(w * 24 / 26) + '" viewBox="0 0 26 24" aria-hidden="true"><path d="M13 2 L25 22 H1 Z" fill="' + RISK_COLOR[level] + '" stroke="' + RISK_COLOR[level] + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M13 9v6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="13" cy="18.6" r="1.4" fill="#fff"/></svg>';
  }
  var RISK_OPEN = null;
  function checkRisks(){
    if(END || RISK_OPEN || document.querySelector('dialog[open]')){ return; }
    // Primero los rojos
    var r = riskTasks().filter(function(o){ return RISK_ACK.indexOf(o.x.key + ':' + o.level) < 0 && !(o.level === 'amber' && RISK_SEEN[o.x.key] === 'red'); })
      .sort(function(p, q){ return (p.level === 'red' ? 0 : 1) - (q.level === 'red' ? 0 : 1); })[0];
    if(!r){ return; }
    if(RISK_SEEN[r.x.key] !== 'red'){ RISK_SEEN[r.x.key] = r.level; storeRisk(); }
    RISK_OPEN = r;
    el('risk-icon').innerHTML = triSvg(r.level, 24);
    el('risk-dialog').classList.toggle('is-amber', r.level === 'amber');
    el('risk-title').textContent = t(r.level === 'red' ? 'risk.title' : 'risk.amberTitle');
    el('risk-body').innerHTML = riskText(r);
    el('risk-list').innerHTML = '';
    el('risk-ok').hidden = false;
    el('risk-open').hidden = false;
    el('risk-close').hidden = true;
    el('risk-dialog').showModal();
    renderToday();
  }
  function riskText(r, short){
    var key = r.level === 'red' ? (short ? 'risk.short' : 'risk.body') : (short ? 'risk.amberShort' : 'risk.amberBody');
    return t(key, { name: esc(r.x.name), need: fmtEst(r.need), due: fmtWhen(r.x.due), free: r.free ? fmtEst(r.free) : '0 min' }) +
      (r.shared ? ' ' + t('risk.shared') : '');
  }
  // Aceptar el aviso: no vuelve a salir para esa tarea (en ese nivel)
  function riskAccept(open){
    var r = RISK_OPEN;
    el('risk-dialog').close();
    RISK_OPEN = null;
    if(r && RISK_ACK.indexOf(r.x.key + ':' + r.level) < 0){ RISK_ACK.push(r.x.key + ':' + r.level); storeRisk(); }
    if(open && r){ openRiskTask(r.x.key); }
    else { setTimeout(checkRisks, 300); }
  }
  function openRiskTask(key){
    if(el('risk-dialog').open){ el('risk-dialog').close(); }
    var from = document.querySelector('.tab.is-active').dataset.screen;
    document.querySelector('.tab[data-screen="tasks"]').click();
    if(from === 'today'){ DETAIL_BACK = { label: t('btn.backToday'), fn: "backToToday('task')", go: function(){ backToToday('task'); } }; }
    openTask(key);
  }
  function worstLevel(list){ return list.some(function(o){ return o.level === 'red'; }) ? 'red' : 'amber'; }
  // Pulsar el triángulo: las tareas avisadas, con los datos de ahora
  function openRiskList(){
    var now = riskTasks(), list = riskFlagged();
    RISK_OPEN = null;
    el('risk-icon').innerHTML = triSvg(worstLevel(list), 24);
    el('risk-dialog').classList.toggle('is-amber', worstLevel(list) === 'amber');
    el('risk-title').textContent = t('risk.listTitle');
    el('risk-body').textContent = '';
    el('risk-list').innerHTML = list.map(function(o){
      var x = o.x, r = now.filter(function(n){ return n.x.key === x.key; })[0];
      return '<button type="button" class="press-choice" onclick="openRiskTask(\'' + x.key + '\')">' + triSvg(r ? r.level : o.level, 20) +
        '<span><strong>' + esc(x.name) + '</strong><small>' + (r ? riskText(r, true) : t('risk.fitsNow', { due: fmtWhen(x.due) })) + '</small></span></button>';
    }).join('');
    el('risk-ok').hidden = true;
    el('risk-open').hidden = true;
    el('risk-close').hidden = false;
    el('risk-dialog').showModal();
  }
  el('risk-dialog').addEventListener('cancel', function(ev){ ev.preventDefault(); if(RISK_OPEN){ riskAccept(false); } else { el('risk-dialog').close(); } });
  function riskTriangle(){
    var list = riskFlagged(), n = list.length;
    if(!n){ return ''; }
    var level = worstLevel(list);
    return '<button type="button" class="risk-flag is-' + level + '" onclick="openRiskList()" aria-label="' + t('risk.aria', { n: n }) + '" title="' + t('risk.aria', { n: n }) + '">' + triSvg(level, 26) + '</button>';
  }

  /* ================= PULSACIÓN LARGA ================= */
  // Mantener pulsado un hueco libre de la barra de tiempo de «Hoy» o del Calendario pregunta si se
  // quiere añadir un evento (fecha y hora de ese punto; dura hasta el siguiente elemento) o
  // trabajar en una tarea (como «Planificar», con un bloque que empieza en ese punto).
  var PRESS_MS = 550, PRESS_MAX_EVT = 2, PRESS = null, PRESS_BACK = null, CAL_POS = null;
  function onLongPress(host, where, fire){
    var timer = null, sx = 0, sy = 0, fired = false, mark = null;
    function clear(){ clearTimeout(timer); timer = null; if(mark){ mark.remove(); mark = null; } }
    host.addEventListener('pointerdown', function(ev){
      if(ev.button > 0){ return; }
      var at = where(ev);
      if(!at){ return; }
      sx = ev.clientX; sy = ev.clientY; fired = false;
      clear();
      mark = document.createElement('div'); mark.className = 'press-mark';
      mark.style.left = sx + 'px'; mark.style.top = sy + 'px';
      document.body.appendChild(mark);
      timer = setTimeout(function(){ clear(); fired = true; fire(at); }, PRESS_MS);
    });
    host.addEventListener('pointermove', function(ev){ if(timer && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10){ clear(); } });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(n){ host.addEventListener(n, function(){ if(timer){ clear(); } }); });
    host.addEventListener('contextmenu', function(ev){ ev.preventDefault(); });
    // tras la pulsación larga no cuenta el «clic» de soltar
    host.addEventListener('click', function(ev){ if(fired){ fired = false; ev.stopPropagation(); ev.preventDefault(); } }, true);
  }
  // Inversa de una escala creciente (horas → posición) por bisección
  function invScale(pos, v, lo, hi){
    for(var i = 0; i < 40; i++){ var m = (lo + hi) / 2; if(pos(m) < v){ lo = m; } else { hi = m; } }
    return (lo + hi) / 2;
  }
  // Calendario: en una columna de día, fuera de los bloques
  onLongPress(el('cal-grid'), function(ev){
    var col = ev.target.closest('.cal-daycol');
    if(!col || ev.target.closest('.cal-bar') || !CAL_POS){ return null; }
    var y = ev.clientY - col.getBoundingClientRect().top;
    return { iso: isoOf(WEEK_DAYS[+col.dataset.day].d), h: invScale(CAL_POS, y, CAL_START, CAL_END), from:'calendar' };
  }, pressAt);
  // Barra de tiempo de «Hoy» (Puntos o Niña soldado)
  onLongPress(el('today-bar'), function(ev){
    if(ev.target.closest('.risk-flag')){ return null; }
    var r = todayScale(), box, frac;
    var svg = ev.target.closest('svg');
    if(APPEARANCE.bar === 'nina' && svg){
      box = svg.getBoundingClientRect();
      var vb = svg.viewBox.baseVal, x = vb.x + (ev.clientX - box.left) / box.width * vb.width;
      frac = (x - TL_X0) / (TL_X1 - TL_X0);
    } else {
      var strip = el('today-bar').querySelector('.day-strip');
      if(!strip){ return null; }
      box = strip.getBoundingClientRect(); frac = (ev.clientX - box.left) / box.width;
    }
    if(frac < 0 || frac > 1){ return null; }
    return { iso: isoOf(TODAY_DATE), h: invScale(r.pos, frac, r.start, r.end), from:'today' };
  }, pressAt);

  function pressAt(at){
    var now = appNow(), nowH = now.getHours() + now.getMinutes() / 60, today = isoOf(now);
    var h = Math.round(at.h * 4) / 4;   // al cuarto de hora
    if(at.iso < today || (at.iso === today && at.h < nowH)){ toast(t('press.past')); return; }
    var l = planLimits(at.iso, null);
    var gap = freeGaps(at.iso, l.from, 24, [], []).filter(function(g){ return g[0] <= at.h + 1e-9 && g[1] >= at.h - 1e-9; })[0];
    if(!gap){ toast(t('press.busy')); return; }
    h = Math.min(Math.max(h, gap[0]), gap[1] - BLOCK_MIN);
    if(h < gap[0] - 1e-9){ toast(t('press.busy')); return; }
    // El evento dura hasta el siguiente elemento, con un tope de PRESS_MAX_EVT horas
    PRESS = { iso: at.iso, h: h, end: Math.min(gap[1], h + PRESS_MAX_EVT), from: at.from };
    el('press-title').textContent = fmtDay(at.iso) + ' · ' + fmtHour(h);
    el('press-q').textContent = t('press.q');
    el('press-event-sub').textContent = t('press.eventSub', { a: fmtHour(h), b: fmtHour(PRESS.end) });
    el('press-main').hidden = false; el('press-tasks').hidden = true;
    el('press-dialog').showModal();
  }
  function closePress(){ el('press-dialog').close(); PRESS = null; }
  // A dónde se vuelve al guardar o cancelar lo abierto con la pulsación larga
  function pressBack(from, f){
    return function(){
      PRESS_BACK = null;
      showView(f, 'list');
      document.querySelector('.tab[data-screen="' + (from === 'today' ? 'today' : 'calendar') + '"]').click();
    };
  }
  // Evento: formulario nuevo con fecha, hora y duración (hasta el siguiente elemento)
  function pressEvent(){
    var p = PRESS; closePress();
    document.querySelector('.tab[data-screen="events"]').click();
    openEventForm();
    el('evt-date').value = p.iso;
    el('evt-time').value = fmtHour(p.h);
    setDur('evt-dur', Math.round((p.end - p.h) * 60 / 5) * 5);
    PRESS_BACK = pressBack(p.from, 'evt');
  }
  // Trabajar en una tarea: las pendientes cuya entrega es posterior a ese momento
  function pressTaskList(){
    var p = PRESS, when = atTime(p.iso, fmtHour(p.h));
    var list = allTasks().filter(function(x){ return !x.done && x.due && x.due > when; });
    el('press-q').textContent = t('press.pick');
    el('press-main').hidden = true; el('press-tasks').hidden = false;
    el('press-tasks').innerHTML = list.length ? list.map(function(x){
      var left = x.est ? Math.max(0, x.est - doneMin(x.key) - plannedMin(x.key)) : 0;
      return '<button type="button" class="press-choice" onclick="pressTask(\'' + x.key + '\')">' + TASK_SVG +
        '<span><strong>' + esc(x.name) + '</strong><small>' + t('task.dueAt', { t: fmtWhen(x.due) }) +
        (x.est ? ' · ' + (left ? t('press.left', { t: fmtEst(left) }) : t('press.allPlanned')) : '') + '</small></span></button>';
    }).join('') : '<p class="press-empty">' + t('press.noTasks') + '</p>';
  }
  function pressTask(key){
    var p = PRESS; closePress();
    document.querySelector('.tab[data-screen="tasks"]').click();
    openPlan(key, { date: p.iso, h: p.h, back: pressBack(p.from, 'task') });
  }

  el('task-form').addEventListener('input', function(ev){
    ev.target.classList.remove('is-invalid');
    var pair = ev.target.closest('.dur-input');
    if(pair){ pair.querySelectorAll('.is-invalid').forEach(function(f){ f.classList.remove('is-invalid'); }); }
  });

  /* ---- Calendario (vista día / semana) ---- */
  // Alto de la cuadrícula: en el móvil, el que quede libre en la pantalla (ver fitCalendar);
  // en la maqueta de escritorio, fijo. El horario escolar se comprime en CAL_SCHOOL_PX y el
  // resto del alto se reparte entre las horas fuera del cole.
  var CAL_START = 7, CAL_END = 23, CAL_BODY_PX = 440, CAL_BODY_DEFAULT = 440, CAL_BODY_MIN = 250, CAL_SCHOOL_PX = 44;   // sigue la franja horaria de Config
  // Semana que se muestra (de lunes a domingo) y día de la vista día (lunes = 0).
  // Empieza en la semana de hoy; las flechas ‹ › pasan de semana (o de día, en la vista día)
  // y pulsar la fecha vuelve a hoy.
  var WEEK_DAYS = [], CAL_DAY = 0;
  function mondayOf(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekdayOf(d)); }
  function setCalWeek(monday, day){
    var today = isoOf(TODAY_DATE);
    CAL_DAY = day;
    WEEK_DAYS = [0,1,2,3,4,5,6].map(function(i){
      var d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      return { d:d, isToday: isoOf(d) === today };
    });
  }
  setCalWeek(mondayOf(TODAY_DATE), TODAY_DAY);
  function calRangeText(view){
    if(view !== 'week'){ return cap(fmtDate(WEEK_DAYS[CAL_DAY].d, { weekday:'short', day:'numeric', month:'short' })); }
    var a = WEEK_DAYS[0].d, b = WEEK_DAYS[6].d;
    return a.getMonth() === b.getMonth()
      ? a.getDate() + '–' + b.getDate() + ' ' + fmtDate(b, { month:'long' })
      : fmtDate(a, { day:'numeric', month:'short' }) + ' – ' + fmtDate(b, { day:'numeric', month:'short' });
  }
  function refreshCalendar(){
    el('cal-range').textContent = calRangeText(calView);
    renderCalendar(calView);
    fitCalendar();
  }
  // ‹ › : semana anterior o siguiente (vista semana) o día anterior o siguiente (vista día)
  function calNav(step){
    if(calView === 'week'){
      var m = WEEK_DAYS[0].d;
      setCalWeek(new Date(m.getFullYear(), m.getMonth(), m.getDate() + 7 * step), CAL_DAY);
    } else {
      var c = WEEK_DAYS[CAL_DAY].d, d = new Date(c.getFullYear(), c.getMonth(), c.getDate() + step);
      setCalWeek(mondayOf(d), weekdayOf(d));
    }
    refreshCalendar();
  }
  function calToday(){ setCalWeek(mondayOf(TODAY_DATE), TODAY_DAY); refreshCalendar(); }
  var CAL_EVENTS = [];   // las actividades y los eventos los inserta el usuario
  var CAL_DEADLINES = [];   // las tareas salen de Tareas (Classroom), eventos y actividades
  var calView = 'week';

  // Escala vertical (en px) de la franja horaria con el tramo escolar comprimido.
  // En la semana se comprime el horario de lunes a viernes; en la vista día, el de ese día.
  function calScale(sd){
    var start = CAL_START, end = CAL_END, school = null;
    var segs = [{ from:start, to:end }];
    if(sd.on){
      var a = Math.max(toHours(sd.entry), start), z = Math.min(toHours(sd.exit), end);
      if(a < z){
        school = { from:a, to:z };
        segs = [{ from:start, to:a }, { from:a, to:z, school:true }, { from:z, to:end }]
          .filter(function(g){ return g.to > g.from; });
      }
    }
    var outside = segs.reduce(function(sum, g){ return sum + (g.school ? 0 : g.to - g.from); }, 0);
    var free = CAL_BODY_PX - (school && outside ? CAL_SCHOOL_PX : 0), y = 0;
    segs.forEach(function(g){
      g.h = g.school ? (outside ? CAL_SCHOOL_PX : CAL_BODY_PX) : free * (g.to - g.from) / outside;
      g.y = y; y += g.h;
    });
    function pos(t){
      if(t <= start){ return 0; }
      if(t >= end){ return CAL_BODY_PX; }
      for(var i = 0; i < segs.length; i++){
        var g = segs[i];
        if(t <= g.to){ return g.y + g.h * (t - g.from) / (g.to - g.from); }
      }
      return CAL_BODY_PX;
    }
    if(school){ school.y0 = pos(school.from); school.y1 = pos(school.to); }
    return { school:school, pos:pos, inSchool:function(t){ return school && t > school.from && t < school.to; } };
  }

  function fmtHour(h){
    var hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  var TASK_VIEW_H = 0.5;   // entrega de tarea: bloque de media hora antes de la deadline
  // Reparte en carriles los bloques que se solapan dentro de un mismo día
  function layoutLanes(items){
    items.sort(function(a, b){ return a.start - b.start || b.end - a.end; });
    var cluster = [], ends = [], clusterEnd = -1;
    function close(){ cluster.forEach(function(it){ it.lanes = ends.length; }); cluster = []; ends = []; }
    items.forEach(function(it){
      if(it.start >= clusterEnd){ close(); }
      var lane = ends.findIndex(function(e){ return e <= it.start; });
      if(lane < 0){ lane = ends.length; ends.push(it.end); } else { ends[lane] = it.end; }
      it.lane = lane; cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.end);
    });
    close();
  }

  function renderCalendar(view){
    var grid = document.getElementById('cal-grid');
    grid.innerHTML = '';
    var legend = {};
    var isWeek = view === 'week';
    var days = isWeek ? WEEK_DAYS : [WEEK_DAYS[CAL_DAY]];
    // Actividades, eventos, bloques y entregas de tareas. La entrega se dibuja como un bloque
    // estándar de TASK_VIEW_H que termina en la deadline (solo visual: avisos y barra
    // de tiempo usan la deadline).
    var allItems = CAL_EVENTS.concat(weekUserActs(), weekUserEvents(), weekBlocks()).concat(CAL_DEADLINES.concat(weekUserTasks(), weekActTasks()).map(function(e){
      return { day:e.day, title:e.title, start:Math.max(e.time - TASK_VIEW_H, CAL_START), end:e.time, cat:'tarea', due:true, done:e.done, ref:e.ref };
    }));
    // El horario del cole se comprime (en la semana, el de lunes a viernes). Si un día sin cole
    // (sábado, domingo, festivo o no lectivo) o con menos horas de cole tiene algo en ese tramo,
    // no se comprime: así nada queda aplastado.
    var base = isWeek ? schoolFor(0) : schoolForDate(WEEK_DAYS[CAL_DAY].d);
    if(base.on && isWeek){
      var A = toHours(base.entry), B = toHours(base.exit);
      var clash = WEEK_DAYS.some(function(d, i){
        var sd = schoolForDate(d.d), a = sd.on ? toHours(sd.entry) : B, z = sd.on ? toHours(sd.exit) : B;
        return allItems.some(function(e){
          if(e.day !== i){ return false; }
          // partes del tramo A–B en las que ese día no hay cole: [A, a) y (z, B]
          return (e.start < Math.min(a, B) && e.end > A) || (e.end > Math.max(z, A) && e.start < B);
        });
      });
      if(clash){ base = {on:false}; }
    }
    var sc = calScale(base), pos = sc.pos;
    CAL_POS = pos;

    grid.style.gridTemplateColumns = '34px repeat(' + days.length + ', minmax(0, 1fr))';
    grid.style.columnGap = isWeek ? '2px' : '0';

    // En la vista día la fecha ya está en la cabecera: sin fila de nombres de día
    if(isWeek){ grid.appendChild(document.createElement('div')); }

    if(isWeek) days.forEach(function(d){
      var h = document.createElement('div');
      h.className = 'cal-daylabel' + (d.isToday ? ' is-today' : '');
      h.innerHTML = '<span class="dl-name">' + cap(fmtDate(d.d, { weekday:'narrow' })) + '</span><span class="dl-date">' + d.d.getDate() + '</span>';
      grid.appendChild(h);
    });

    // Horas: cada hora fuera del cole tiene línea; etiqueta cada dos horas y en los bordes del cole
    // (en pantallas altas, con sitio de sobra, etiqueta cada hora)
    var lines = [], labels = [], step = pos(CAL_END) - pos(CAL_END - 1) >= 48 ? 1 : 2;
    for(var hr = CAL_START; hr <= CAL_END; hr++){
      if(sc.inSchool(hr)){ continue; }
      if(hr > CAL_START && hr < CAL_END){ lines.push(hr); }
      if((hr - CAL_START) % step === 0 || hr === CAL_END){ labels.push(hr); }
    }
    if(sc.school){ labels.push(sc.school.from, sc.school.to); }
    labels.sort(function(x, y){ return x - y; });
    var hourCol = document.createElement('div');
    hourCol.className = 'cal-hourcol';
    hourCol.style.height = CAL_BODY_PX + 'px';
    var lastY = -99;
    labels.forEach(function(hr, i){
      var y = pos(hr), isEdge = sc.school && (hr === sc.school.from || hr === sc.school.to);
      if(y - lastY < 13 && !isEdge){ return; }
      var lab = document.createElement('div');
      lab.className = 'cal-hourlabel' + (hr === CAL_END ? ' is-last' : '');
      lab.style.top = y + 'px';
      lab.textContent = fmtHour(hr);
      hourCol.appendChild(lab);
      lastY = y;
    });
    if(sc.school){
      hourCol.insertAdjacentHTML('beforeend',
        '<svg class="cal-school-icon" viewBox="-33 -53 66 54" role="img" aria-label="' + t('aria.school') + '" style="top:' +
        ((sc.school.y0 + sc.school.y1) / 2) + 'px">' + schoolIcon() + '</svg>');
    }
    grid.appendChild(hourCol);

    days.forEach(function(d, i){
      var realDay = isWeek ? i : CAL_DAY;
      var col = document.createElement('div');
      col.className = 'cal-daycol' + (d.isToday ? ' is-today' : '');
      col.dataset.day = realDay;
      col.style.height = CAL_BODY_PX + 'px';

      lines.forEach(function(hr){
        var ln = document.createElement('div');
        ln.className = 'cal-hourline';
        ln.style.top = pos(hr) + 'px';
        col.appendChild(ln);
      });

      var sd = schoolForDate(d.d);
      if(sd.on){
        var y0 = pos(Math.max(toHours(sd.entry), CAL_START)), y1 = pos(Math.min(toHours(sd.exit), CAL_END));
        var band = document.createElement('div');
        band.className = 'school-band';
        band.style.top = y0 + 'px';
        band.style.height = Math.max(y1 - y0, 0) + 'px';
        if(!isWeek){ band.innerHTML = '<span>' + t('cfg.school') + ' · ' + sd.entry + '–' + sd.exit + '</span>'; }
        col.appendChild(band);
      }

      // Los bloques que se solapan se reparten el ancho
      var items = allItems.filter(function(e){ return e.day === realDay; }).map(function(e){ return Object.assign({}, e); });
      layoutLanes(items);
      items.forEach(function(e){
        var bar = document.createElement('div');
        bar.className = 'cal-bar' + (e.cat ? ' cat-' + e.cat : '') + (e.block ? ' is-block' : '') + (e.done ? ' is-done' : '');
        if(e.color){ bar.style.background = e.color; }
        bar.style.top = pos(e.start) + 'px';
        bar.style.height = (pos(e.end) - pos(e.start)) + 'px';
        bar.style.left = 'calc(' + (e.lane / e.lanes * 100) + '% + 2px)';
        bar.style.right = 'calc(' + ((e.lanes - e.lane - 1) / e.lanes * 100) + '% + 2px)';
        var when = e.due ? t('cal.due', { t: fmtHour(e.end) }) : fmtHour(e.start) + '–' + fmtHour(e.end);
        bar.title = e.title + ' · ' + when;
        // Pulsar un bloque abre el elemento en su pantalla, con botón para volver al Calendario
        if(e.ref){
          bar.classList.add('is-open');
          bar.setAttribute('role', 'button'); bar.tabIndex = 0;
          bar.setAttribute('aria-label', e.title + ' · ' + when);
          bar.setAttribute('onclick', "openFromCalendar('" + e.ref.kind + "', '" + e.ref.id + "')");
          bar.setAttribute('onkeydown', "if(event.key==='Enter'||event.key===' '){ event.preventDefault(); openFromCalendar('" + e.ref.kind + "', '" + e.ref.id + "'); }");
        }
        // Bloques bajos (p. ej. la media hora de una entrega): título y hora en una sola línea
        var h = pos(e.end) - pos(e.start);
        // Tarea hecha: atenuada y con ✓
        if(e.done){ e.title = '✓ ' + e.title; }
        bar.innerHTML = isWeek ? '<span class="bar-title">' + esc(e.title) + '</span>'
          : h < 30 ? '<span class="bar-title">' + esc(e.title) + ' <span class="bar-time">· ' + when + '</span></span>'
          : '<span class="bar-title">' + esc(e.title) + '</span><span class="bar-time">' + when + '</span>';
        col.appendChild(bar);
        if(e.block){ legend.block = true; }
        else if(e.color || e.cat){ legend[e.due ? 'tarea' : (e.catLabel ? 'u:' + e.catLabel + '|' + e.color : e.cat)] = true; }
      });

      grid.appendChild(col);
    });

    // Leyenda: las categorías que aparecen en la vista, y la entrega de tareas al final
    var rank = function(k){ return k === 'tarea' ? 2 : k === 'block' ? 1 : 0; };
    var keys = Object.keys(legend).sort(function(a, b){ return rank(a) - rank(b); });
    document.getElementById('cal-legend').innerHTML = keys.map(function(k){
      var name, color;
      if(k === 'block'){ return '<span><i class="is-block"></i>' + t('legend.block') + '</span>'; }
      if(k.indexOf('u:') === 0){ var p = k.slice(2).split('|'); name = esc(p[0]); color = p[1]; }
      else { name = esc(catName(k)) + (k === 'tarea' ? ' ' + t('legend.deadline') : ''); color = 'var(--cat-' + k + ')'; }
      return '<span><i style="background:' + color + '"></i>' + name + '</span>';
    }).join('');
  }

  // En el móvil, ajusta el alto de la cuadrícula al hueco libre para que no haga falta
  // scroll (con un mínimo legible: en pantallas muy bajas sí se desplaza).
  var MOBILE = window.matchMedia('(max-width:500px)');
  function fitCalendar(){
    var screen = document.getElementById('screen-calendar');
    if(!screen.classList.contains('active')){ return; }
    var target = CAL_BODY_DEFAULT;
    if(MOBILE.matches){
      var main = screen.parentElement, cs = getComputedStyle(main);
      var free = main.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - screen.offsetHeight;
      target = Math.max(CAL_BODY_MIN, Math.floor(CAL_BODY_PX + free));
    }
    if(target !== CAL_BODY_PX){ CAL_BODY_PX = target; renderCalendar(calView); }
  }
  window.addEventListener('resize', fitCalendar);

  function setCalView(btn){
    document.querySelectorAll('.seg-btn[data-view]').forEach(function(b){ b.classList.remove('is-active'); });
    btn.classList.add('is-active');
    calView = btn.dataset.view;
    // Al pasar a la vista día en la semana de hoy, se abre hoy
    if(calView === 'day' && WEEK_DAYS.some(function(d){ return d.isToday; })){ CAL_DAY = TODAY_DAY; }
    refreshCalendar();
  }

  // Campos de fecha y hora: al tocarlos se abre el selector nativo (donde el navegador lo permite)
  document.addEventListener('click', function(ev){
    var t = ev.target;
    if(t && t.tagName === 'INPUT' && (t.type === 'time' || t.type === 'date') && !t.disabled && !t.readOnly && t.showPicker){
      try{ t.showPicker(); }catch(e){}
    }
  });

  placeField(el('addr-home'), function(v){ setAddress('home', v); });
  placeField(el('act-place'));
  placeField(el('evt-place'));
  loadAppearance();
  loadLanguage();
  loadKidName();
  loadSettings();
  restoreEventCategories();
  applyI18n();
  if(!setupDone()){
    var cfgTab = document.querySelector('.tab[data-screen="config"]');
    showScreen(cfgTab);
    openCfgGroup('profile', true);
    var sc = document.querySelector('main.screen-container');
    if(sc){ sc.scrollTop = 0; }
  }
  setTimeout(checkBlockEnds, 600);   // bloques que terminaron con la App cerrada
