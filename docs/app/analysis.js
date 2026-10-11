/* ================= ANÁLISIS (App de seguimiento, fase 4) =================
   Pestaña Análisis del modo supervisor (lo carga supervisor.js). Todo se calcula en el móvil con los
   datos del plan (tareas y bloques) y, para las tareas eliminadas, el archivo del servidor
   (syncArchiveAll). Periodo: esta semana · 4 semanas · curso (por la entrega de cada tarea).

   1. Estado de las tareas: cada tarea en un solo estado, el primero que cumple:
      eliminada · hecha a tiempo · hecha tarde · atrasada · sin estimar · en curso · planificada · sin planificar.
      Pulsar un total abre la lista; cada tarea abre su ficha.
   2. Indicadores: entregadas a tiempo (y por semana), antelación, precisión de las estimaciones,
      cumplimiento de lo planificado, trabajo en las últimas 24 h, horas de estudio (por día o semana
      y por origen) y la carga de los próximos 7 días frente al tiempo libre.
   Las tareas de práctica de las actividades no tienen una entrega fija: no cuentan en los estados ni
   en los indicadores de entregas, pero su tiempo sí cuenta en las horas de estudio. */
(function(){
  var STATES = ['deleted', 'onTime', 'late', 'overdue', 'noEst', 'inProgress', 'planned', 'unplanned'];
  var ST = { period: 'week', list: null, archive: null, loading: false };
  var DAY = 86400000;

  function monday(d){ var m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() - (m.getDay() + 6) % 7); return m; }
  function addD(d, n){ var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function range(){
    var w = monday(TODAY_DATE);
    if(ST.period === 'week'){ return { from: w, to: addD(w, 7) }; }
    if(ST.period === '4w'){ return { from: addD(w, -21), to: addD(w, 7) }; }
    // Curso: desde el 1 de septiembre
    var y = TODAY_DATE.getMonth() >= 8 ? TODAY_DATE.getFullYear() : TODAY_DATE.getFullYear() - 1;
    return { from: new Date(y, 8, 1), to: new Date(y + 1, 8, 1) };
  }
  function inR(d, r){ return d && d >= r.from && d < r.to; }
  function blockStart(b){ var d = isoDate(b.date); d.setMinutes(Math.round(b.start * 60)); return d; }
  function bLen(b){ return Math.round((b.end - b.start) * 60); }
  function logged(b){ return typeof b.logged === 'number'; }
  function parseDue(v){ if(!v){ return null; } var p = String(v).split(' '); return atTime(p[0], p[1] || '23:59'); }

  // Todas las tareas con entrega (sin las de práctica): las de ahora y las eliminadas del archivo
  function records(){
    var live = allTasks().filter(function(x){ return x.kind !== 'activity'; }).map(function(x){
      var at = x.ref.doneAt || null;
      return { key: x.key, name: x.name, kind: x.kind, due: x.due, est: x.est || 0, done: x.done,
               doneAt: at ? (at.indexOf('T') < 0 ? isoDate(at) : new Date(at)) : null, fullAt: !!(at && at.indexOf('T') >= 0),
               blocks: blocksOf(x.key), deleted: null };
    });
    var have = {};
    live.forEach(function(r){ have[r.key] = true; });
    (ST.archive || []).forEach(function(a){
      if(!a.deletedAt || have[a.key] || a.kind === 'activity'){ return; }
      var at = a.doneAt || null;
      live.push({ key: a.key, name: a.name || '', kind: a.kind, due: parseDue(a.due), est: a.est || 0, done: !!a.done,
                  doneAt: at ? (String(at).indexOf('T') < 0 ? isoDate(at) : new Date(at)) : null, fullAt: !!(at && String(at).indexOf('T') >= 0),
                  blocks: a.blocks || [], deleted: a.deletedAt });
    });
    return live;
  }
  function worked(r){ return r.blocks.reduce(function(s, b){ return s + (logged(b) ? b.logged : 0); }, 0); }
  function onTime(r){
    if(!r.done || !r.doneAt || !r.due){ return false; }
    return r.fullAt ? r.doneAt <= r.due : isoOf(r.doneAt) <= isoOf(r.due);
  }
  function stateOf(r, now){
    if(r.deleted){ return 'deleted'; }
    if(r.done){ return onTime(r) ? 'onTime' : 'late'; }
    if(r.due && r.due < now){ return 'overdue'; }
    if(!r.est){ return 'noEst'; }
    var w = worked(r);
    if(w > 0){ return 'inProgress'; }
    var planned = r.blocks.filter(function(b){ return !logged(b); }).reduce(function(s, b){ return s + bLen(b); }, 0);
    return planned >= r.est ? 'planned' : 'unplanned';
  }

  /* ---- Piezas de la pantalla ---- */
  function pct(a, b){ return b ? Math.round(a / b * 100) : 0; }
  function tile(label, value, sub){
    return '<div class="an-tile"><span class="an-tile-label">' + label + '</span><span class="an-tile-value">' + value + '</span>' +
      (sub ? '<span class="an-tile-sub">' + sub + '</span>' : '') + '</div>';
  }
  function cardH(title, body, hint){
    return '<section class="config-card an-card"><h3 class="an-h">' + title + '</h3>' + body + (hint ? '<p class="card-hint">' + hint + '</p>' : '') + '</section>';
  }
  // Barras de una sola serie: [{ label, value, text, title }]; max: valor de la barra más alta
  function bars(list, max){
    max = max || Math.max.apply(null, list.map(function(x){ return x.value; }).concat([1]));
    return '<div class="an-bars" role="img">' + list.map(function(x, i){
      var h = x.value == null ? 0 : Math.max(x.value ? 3 : 0, Math.round(x.value / max * 100));
      return '<div class="an-bar-col" title="' + esc(x.title || '') + '"><span class="an-bar-val">' + (x.show ? esc(x.text) : '') + '</span>' +
        '<span class="an-bar-wrap"><i class="an-bar' + (x.value == null ? ' is-none' : '') + '" style="height:' + h + '%"></i></span>' +
        '<span class="an-bar-label">' + esc(x.label) + '</span></div>';
    }).join('') + '</div>';
  }
  function hours(min){ return min ? fmtEst(Math.round(min)) : '0 min'; }

  function render(){
    var box = document.getElementById('sup-stats-body');
    if(!box){ return; }
    var now = appNow(), r = range(), recs = records();
    var h = '<div class="sup-filters" role="radiogroup">' + ['week', '4w', 'course'].map(function(p){
      var on = ST.period === p;
      return '<button type="button" class="cat-chip' + (on ? ' is-active' : '') + '" role="radio" aria-checked="' + on + '" onclick="anPeriod(\'' + p + '\')">' + t('an.p.' + p) + '</button>';
    }).join('') + '</div>';
    if(ST.archive == null){ h += '<p class="card-hint">' + t(ST.loading ? 'an.loadingDeleted' : 'an.noDeleted') + '</p>'; }

    // Lista de un estado
    var inPeriod = recs.filter(function(x){ return inR(x.due, r); });
    var byState = {};
    STATES.forEach(function(s){ byState[s] = []; });
    inPeriod.forEach(function(x){ byState[stateOf(x, now)].push(x); });
    if(ST.list){
      var list = byState[ST.list].slice().sort(function(p, q){ return (q.due || 0) - (p.due || 0); });
      h += '<button type="button" class="detail-back" onclick="anList(null)">' + BACK_SVG + t('an.backStates') + '</button>' +
        '<h3 class="sup-h">' + t('an.s.' + ST.list) + ' · ' + list.length + '</h3>' +
        (list.length ? '<ul class="sup-list">' + list.map(function(x){
          return '<li class="sup-row k-task is-open" role="button" tabindex="0" onclick="supOpenWith(\'task\', \'' + x.key + '\', \'an.back\', \'sup-stats\')">' +
            '<span class="sup-row-time">' + (x.due ? fmtDay(isoOf(x.due)) : '—') + '</span><span class="sup-row-main"><span class="sup-row-title">' + esc(x.name) + '</span>' +
            '<span class="sup-row-sub">' + [x.est ? fmtEst(x.est) : t('task.noEst'), worked(x) ? t('prog.logged', { t: fmtEst(worked(x)) }) : ''].filter(Boolean).join(' · ') + '</span></span></li>';
        }).join('') + '</ul>' : '<p class="card-hint">' + t('an.none') + '</p>');
      box.innerHTML = h;
      return;
    }

    // 1. Estado de las tareas
    h += cardH(t('an.states') + ' · ' + inPeriod.length, '<div class="an-states">' + STATES.map(function(s){
      var n = byState[s].length;
      return '<button type="button" class="an-state st-' + s + '"' + (n ? ' onclick="anList(\'' + s + '\')"' : ' disabled') + '><span class="an-state-n">' + n + '</span><span class="an-state-l">' + t('an.s.' + s) + '</span></button>';
    }).join('') + '</div>', t('an.statesHint'));

    // 2. Entregadas a tiempo (de las que ya vencieron): en el periodo y por semana (últimas 8)
    function onTimeOf(list){
      var due = list.filter(function(x){ return !x.deleted && x.due && x.due < now; });
      return { n: due.length, ok: due.filter(onTime).length };
    }
    var ot = onTimeOf(inPeriod), weeks = [], w0 = monday(TODAY_DATE);
    for(var i = 7; i >= 0; i--){
      var ws = addD(w0, -7 * i), we = addD(ws, 7), o = onTimeOf(recs.filter(function(x){ return inR(x.due, { from: ws, to: we }); }));
      weeks.push({ label: ddmm(ws), value: o.n ? pct(o.ok, o.n) : null, text: o.n ? pct(o.ok, o.n) + ' %' : '—',
                   title: t('an.weekOf', { d: ddmm(ws) }) + ': ' + (o.n ? t('an.okOf', { ok: o.ok, n: o.n }) : t('an.noDue')), show: i === 0 });
    }
    h += cardH(t('an.onTime'),
      '<div class="an-tiles">' + tile(t('an.inPeriod'), ot.n ? pct(ot.ok, ot.n) + ' %' : '—', ot.n ? t('an.okOf', { ok: ot.ok, n: ot.n }) : t('an.noDue')) + '</div>' +
      '<p class="an-sub">' + t('an.byWeek') + '</p>' + bars(weeks, 100), t('an.onTimeHint'));

    // 3. Antelación: cuánto antes de la entrega se marcan como hechas (solo las que guardan la hora)
    var adv = inPeriod.filter(function(x){ return !x.deleted && x.done && x.fullAt && x.due; })
      .map(function(x){ return Math.round((x.due - x.doneAt) / 60000); }).sort(function(a, b){ return a - b; });
    function advText(m){ return Math.abs(m) < 1 ? t('d.onTime') : t(m > 0 ? 'd.early' : 'd.late', { t: fmtSpan(Math.abs(m)) }); }
    if(adv.length){
      var mean = Math.round(adv.reduce(function(s, v){ return s + v; }, 0) / adv.length),
          med = adv.length % 2 ? adv[(adv.length - 1) / 2] : Math.round((adv[adv.length / 2 - 1] + adv[adv.length / 2]) / 2);
      h += cardH(t('an.advance'), '<div class="an-tiles">' + tile(t('an.median'), advText(med)) + tile(t('an.mean'), advText(mean)) + '</div>', t('an.advanceHint', { n: adv.length }));
    } else { h += cardH(t('an.advance'), '<p class="card-hint">' + t('an.noData') + '</p>'); }

    // 4. Precisión de las estimaciones: trabajado frente a estimado en las hechas
    var est = inPeriod.filter(function(x){ return !x.deleted && x.done && x.est && worked(x) > 0; });
    if(est.length){
      var tw = est.reduce(function(s, x){ return s + worked(x); }, 0), te = est.reduce(function(s, x){ return s + x.est; }, 0), ratio = tw / te;
      var over = est.filter(function(x){ return worked(x) > x.est * 1.1; }).length, under = est.filter(function(x){ return worked(x) < x.est * 0.9; }).length;
      h += cardH(t('an.estimate'), '<div class="an-tiles">' + tile(t('an.workedVsEst'), Math.round(ratio * 100) + ' %', hours(tw) + ' / ' + hours(te)) +
        tile(t('an.verdict'), t(ratio > 1.1 ? 'an.short' : ratio < 0.9 ? 'an.long' : 'an.good'), t('an.overUnder', { o: over, u: under, n: est.length })) + '</div>', t('an.estimateHint'));
    } else { h += cardH(t('an.estimate'), '<p class="card-hint">' + t('an.noData') + '</p>'); }

    // 5. Cumplimiento de lo planificado: bloques planificados ya terminados en el periodo
    var allBlocks = [];
    recs.forEach(function(x){ x.blocks.forEach(function(b){ allBlocks.push(b); }); });
    WORK_BLOCKS.filter(function(b){ return /^a:/.test(b.task); }).forEach(function(b){ allBlocks.push(b); });
    var ended = allBlocks.filter(function(b){ return !b.manual && inR(blockStart(b), r) && blockEnd(b) <= now; });
    if(ended.length){
      var plan = ended.reduce(function(s, b){ return s + bLen(b); }, 0), done = ended.reduce(function(s, b){ return s + (logged(b) ? Math.min(b.logged, bLen(b)) : 0); }, 0);
      var full = ended.filter(function(b){ return logged(b) && b.logged >= bLen(b); }).length,
          part = ended.filter(function(b){ return logged(b) && b.logged > 0 && b.logged < bLen(b); }).length,
          zero = ended.filter(function(b){ return logged(b) && !b.logged; }).length,
          none = ended.filter(function(b){ return !logged(b); }).length;
      h += cardH(t('an.plan'), '<div class="an-tiles">' + tile(t('an.workedVsPlan'), pct(done, plan) + ' %', hours(done) + ' / ' + hours(plan)) + '</div>' +
        '<ul class="an-counts"><li><b>' + full + '</b> ' + t('an.bFull') + '</li><li><b>' + part + '</b> ' + t('an.bPart') + '</li><li><b>' + zero + '</b> ' + t('an.bZero') + '</li><li><b>' + none + '</b> ' + t('an.bNone') + '</li></ul>',
        t('an.planHint'));
    } else { h += cardH(t('an.plan'), '<p class="card-hint">' + t('an.noData') + '</p>'); }

    // 6. Trabajo en las últimas 24 h antes de la entrega (en las tareas hechas)
    var pr = inPeriod.filter(function(x){ return !x.deleted && x.done && x.due && worked(x) > 0; });
    if(pr.length){
      var tot = 0, last = 0;
      pr.forEach(function(x){
        x.blocks.forEach(function(b){
          if(!logged(b) || !b.logged){ return; }
          tot += b.logged;
          if(blockStart(b) >= new Date(x.due.getTime() - DAY)){ last += b.logged; }
        });
      });
      h += cardH(t('an.last24'), '<div class="an-tiles">' + tile(t('an.last24Share'), pct(last, tot) + ' %', hours(last) + ' / ' + hours(tot)) + '</div>', t('an.last24Hint', { n: pr.length }));
    } else { h += cardH(t('an.last24'), '<p class="card-hint">' + t('an.noData') + '</p>'); }

    // 7. Horas de estudio: por día (semana) o por semana (4 semanas, curso) y por origen
    var names = {};
    allTasks().forEach(function(x){ names[x.key] = x; });
    (ST.archive || []).forEach(function(a){ if(!names[a.key]){ names[a.key] = { kind: a.kind, origin: a.from, archived: true }; } });
    var work = [];
    recs.forEach(function(x){ x.blocks.forEach(function(b){ if(logged(b) && b.logged){ work.push({ b: b, key: x.key }); } }); });
    WORK_BLOCKS.filter(function(b){ return /^a:/.test(b.task) && logged(b) && b.logged; }).forEach(function(b){ work.push({ b: b, key: b.task }); });
    work = work.filter(function(o){ return inR(blockStart(o.b), r); });
    function originOf(key){
      var x = names[key] || {};
      if(x.kind === 'classroom'){ return x.archived ? x.origin || 'Classroom' : (x.ref && x.ref.course) || 'Classroom'; }
      if(x.kind === 'activity'){ return x.archived ? x.origin || t('sup.kAct') : (x.parent && x.parent.name) || t('sup.kAct'); }
      if(x.kind === 'event'){ return t('an.oEvent'); }
      return t('an.oManual');
    }
    var totalW = work.reduce(function(s, o){ return s + o.b.logged; }, 0), cols = [];
    if(ST.period === 'week'){
      for(var d = 0; d < 7; d++){
        var iso = isoOf(addD(r.from, d)), m = work.filter(function(o){ return o.b.date === iso; }).reduce(function(s, o){ return s + o.b.logged; }, 0);
        cols.push({ label: cap(weekdayName(d, 'narrow')), value: m, text: hours(m), title: fmtDay(iso) + ': ' + hours(m), show: m > 0 });
      }
    } else {
      for(var ws2 = monday(r.from); ws2 < r.to && ws2 <= TODAY_DATE; ws2 = addD(ws2, 7)){
        var we2 = addD(ws2, 7), mm = work.filter(function(o){ var s0 = blockStart(o.b); return s0 >= ws2 && s0 < we2; }).reduce(function(s, o){ return s + o.b.logged; }, 0);
        cols.push({ label: ddmm(ws2), value: mm, text: hours(mm), title: t('an.weekOf', { d: ddmm(ws2) }) + ': ' + hours(mm), show: false });
      }
      var top = cols.reduce(function(b, c){ return c.value > (b ? b.value : 0) ? c : b; }, null);
      if(top){ top.show = true; }
      if(cols.length > 12){ cols = cols.slice(-12); }
    }
    var byO = {};
    work.forEach(function(o){ var k = originOf(o.key); byO[k] = (byO[k] || 0) + o.b.logged; });
    var origins = Object.keys(byO).sort(function(a, b){ return byO[b] - byO[a]; }), omax = origins.length ? byO[origins[0]] : 1;
    var nDays = ST.period === 'week' ? 7 : Math.max(1, Math.round((Math.min(TODAY_DATE, r.to) - r.from) / DAY) + 1);
    h += cardH(t('an.hours'),
      '<div class="an-tiles">' + tile(t('an.total'), hours(totalW)) + tile(t(ST.period === 'week' ? 'an.perDay' : 'an.perWeek'),
        hours(ST.period === 'week' ? totalW / 7 : totalW / Math.max(1, nDays / 7))) + '</div>' +
      bars(cols) +
      (origins.length ? '<p class="an-sub">' + t('an.byOrigin') + '</p><ul class="an-hbars">' + origins.map(function(k){
        return '<li><span class="an-h-label">' + esc(k) + '</span><span class="an-h-track"><i style="width:' + Math.max(2, Math.round(byO[k] / omax * 100)) + '%"></i></span><span class="an-h-val">' + hours(byO[k]) + '</span></li>';
      }).join('') + '</ul>' : ''));

    // 8. Carga de los próximos 7 días: lo que falta de las tareas que vencen cada día frente al tiempo libre
    var risk = {};
    riskTasks().forEach(function(o){ var k = isoOf(o.x.due); if(!risk[k] || o.level === 'red'){ risk[k] = o.level; } });
    var rows = [];
    for(var j = 0; j < 7; j++){
      var dd = addD(TODAY_DATE, j), di = isoOf(dd), l = planLimits(di, null), free = 0;
      freeGaps(di, l.from, 24, WORK_BLOCKS.map(function(b){ return b.id; }), []).forEach(function(g){ free += g[1] - g[0]; });
      free = Math.round(free * 60);
      var need = 0, noEst = 0;
      allTasks().forEach(function(x){
        if(x.done || !x.due || isoOf(x.due) !== di || x.due < now){ return; }   // las ya vencidas están en Atrasadas
        if(!x.est){ noEst++; return; }
        need += Math.max(0, x.est - doneMin(x.key));
      });
      rows.push({ iso: di, free: free, need: need, noEst: noEst, level: risk[di] || null });
    }
    var lmax = Math.max.apply(null, rows.map(function(x){ return Math.max(x.free, x.need); }).concat([60]));
    h += cardH(t('an.load'), '<ul class="an-load">' + rows.map(function(x){
      var lv = x.level ? '<span class="an-flag lv-' + x.level + '" title="' + t(x.level === 'red' ? 'risk.title' : 'risk.amberTitle') + '">⚠ ' + t(x.level === 'red' ? 'an.lvRed' : 'an.lvAmber') + '</span>' : '';
      return '<li class="' + (x.level ? 'lv-' + x.level : '') + '"><span class="an-load-day">' + (x.iso === isoOf(TODAY_DATE) ? t('log.today') : fmtDay(x.iso)) + '</span>' +
        '<span class="an-load-track" title="' + esc(t('an.loadTip', { need: hours(x.need), free: hours(x.free) })) + '"><i class="an-free" style="width:' + Math.round(x.free / lmax * 100) + '%"></i><i class="an-need" style="width:' + Math.round(x.need / lmax * 100) + '%"></i></span>' +
        '<span class="an-load-txt">' + hours(x.need) + ' / ' + hours(x.free) + (x.noEst ? ' · ' + t('an.noEstN', { n: x.noEst }) : '') + ' ' + lv + '</span></li>';
    }).join('') + '</ul><p class="an-legend"><i class="an-need"></i> ' + t('an.need') + ' <i class="an-free"></i> ' + t('an.free') + '</p>', t('an.loadHint'));

    box.innerHTML = h;
  }

  window.anPeriod = function(p){ ST.period = p; ST.list = null; render(); };
  window.anList = function(s){ ST.list = s; render(); var sc = document.querySelector('main.screen-container'); if(sc){ sc.scrollTop = 0; } };
  // El archivo (tareas eliminadas) se pide una vez al abrir Análisis
  window.renderStats = function(){
    if(ST.archive == null && !ST.loading && window.syncArchiveAll && window.SYNC && window.SYNC.status === 'in'){
      ST.loading = true;
      window.syncArchiveAll().then(function(a){ ST.archive = a || []; }).catch(function(){ ST.archive = null; })
        .then(function(){ ST.loading = false; render(); });
    }
    render();
  };
  if(document.getElementById('screen-sup-stats').classList.contains('active')){ window.renderStats(); }
})();
