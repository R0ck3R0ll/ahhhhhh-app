/* ================= CÁLCULOS DEL PLAN (servidor) =================
   Los mismos cálculos que hace la App de Martina (docs/app/app.js), para que el servidor pueda avisar
   con las apps cerradas: la lista de tareas (sueltas, de Classroom, de eventos y de práctica de
   actividades), lo trabajado, los huecos libres y el aviso de riesgo («No da tiempo» / «Cuidado, el
   tiempo se agota»). Funciones puras: reciben los datos del plan y el momento actual.
   La hora es la local del proceso: index.js fija TZ = Europe/Madrid. Una prueba con el navegador
   (ver dossier) compara el resultado con el de app.js con los mismos datos.

   plan = makePlan({ 'app-settings': '…', 'app-tasks': '…', … }) con los textos de plans/{id}/kv. */

export const BLOCK_STEP = 5 / 60, BLOCK_MIN = 0.25, RISK_MARGIN = 60;
const DEFAULT_BOUNDS = { start: '00:00', end: '23:59' };

function json(v, def){ try{ const d = JSON.parse(v); return d == null ? def : d; }catch(e){ return def; } }
export function isoOf(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function isoDate(iso){ const p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
export function toHours(t){ const p = String(t).split(':'); return +p[0] + (+p[1] || 0) / 60; }
export function fmtHour(h){ const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }
export function atTime(iso, hhmm){ const d = isoDate(iso); d.setMinutes(Math.round(toHours(hhmm) * 60)); return d; }
export function addDays(iso, n){ const d = isoDate(iso); d.setDate(d.getDate() + n); return isoOf(d); }
export function weekdayOf(d){ return (d.getDay() + 6) % 7; }
// Momento actual al minuto, como el reloj de la App
export function minuteOf(d){ const x = new Date(d.getTime()); x.setSeconds(0, 0); return x; }
function occKey(d){ return isoOf(d) + 'T' + fmtHour(d.getHours() + d.getMinutes() / 60); }

// Festivos nacionales de España (como en app.js)
const HOLIDAYS = {};
export function nationalHolidays(y){
  if(HOLIDAYS[y]){ return HOLIDAYS[y]; }
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
        g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
        l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
        month = Math.floor((h + l - 7 * m + 114) / 31), day = (h + l - 7 * m + 114) % 31 + 1;
  HOLIDAYS[y] = ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25']
    .map(function(md){ return y + '-' + md; }).concat(isoOf(new Date(y, month - 1, day - 2)));
  return HOLIDAYS[y];
}
export function isHoliday(iso){ return nationalHolidays(+iso.slice(0, 4)).indexOf(iso) >= 0; }

export function makePlan(kv){
  const settings = json(kv['app-settings'], {}) || {};
  const school = settings.school || { week: { entry: '', exit: '' }, sat: { on: false, entry: '', exit: '' } };
  const bounds = { start: (settings.bounds && settings.bounds.start) || DEFAULT_BOUNDS.start, end: (settings.bounds && settings.bounds.end) || DEFAULT_BOUNDS.end };
  const mode = kv['school-cal-mode'] === 'manual' ? 'manual' : 'source';
  const noSchool = [];
  (mode === 'manual' ? json(kv['no-school-manual'], []) : json(kv['no-school-read'], [])).forEach(function(r){
    if(!r || !r.from || !r.to){ return; }
    for(let d = isoDate(r.from), z = isoDate(r.to); d <= z; d.setDate(d.getDate() + 1)){ const k = isoOf(d); if(noSchool.indexOf(k) < 0){ noSchool.push(k); } }
  });
  return {
    name: kv['kid-name'] || '',
    bounds, school, noSchool,
    tasks: json(kv['app-tasks'], []) || [],
    events: json(kv['app-events'], []) || [],
    acts: json(kv['app-activities'], []) || [],
    blocks: json(kv['app-blocks'], []) || []
  };
}

function schoolSet(P){ return !!(P.school.week && P.school.week.entry && P.school.week.exit); }
export function schoolForDate(P, d){
  if(P.noSchool.indexOf(isoOf(d)) >= 0){ return { on: false }; }
  const day = weekdayOf(d);
  if(day < 5){ return schoolSet(P) ? { on: true, entry: P.school.week.entry, exit: P.school.week.exit } : { on: false }; }
  if(day === 5){ const s = P.school.sat || {}; return s.on && s.entry && s.exit ? s : { on: false }; }
  return { on: false };
}
export function sessionOn(a, x, iso){ return !isHoliday(iso) && (a.skip || []).indexOf(iso + 'T' + x.start) < 0; }
export function nextSession(a, from){
  for(let off = 0; off <= 35; off++){
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + off);
    const todays = (a.sessions || []).filter(function(x){ return x.day === weekdayOf(d) && sessionOn(a, x, isoOf(d)); })
      .map(function(x){ const s = new Date(d.getTime()); s.setMinutes(Math.round(toHours(x.start) * 60)); return s; })
      .filter(function(s){ return s > from; }).sort(function(p, q){ return p - q; });
    if(todays.length){ return todays[0]; }
  }
  return null;
}

// Lista de tareas, como allTasks() de la App: { key, kind, name, due, est, done, origin }
export function allTasks(P, now){
  const out = [];
  P.tasks.forEach(function(tk){
    out.push({ key: 's:' + tk.id, kind: tk.source === 'manual' ? 'manual' : 'classroom', name: tk.name, due: tk.date && tk.time ? atTime(tk.date, tk.time) : null,
               est: tk.est || 0, done: !!tk.done, origin: tk.source === 'manual' ? '' : tk.course || '' });
  });
  P.events.forEach(function(e){
    if(!e.task){ return; }
    out.push({ key: 'e:' + e.id, kind: 'event', name: e.task.name, due: e.task.date && e.task.time ? atTime(e.task.date, e.task.time) : null,
               est: e.task.est || 0, done: !!e.task.done, origin: e.name });
  });
  P.acts.forEach(function(a){
    if(!a.task){ return; }
    const due = nextSession(a, now);
    out.push({ key: 'a:' + a.id, kind: 'activity', name: a.task.name, due, est: a.task.est || 0,
               done: !!(due && (a.task.doneFor || []).indexOf(occKey(due)) >= 0), origin: a.name });
  });
  out.forEach(function(x){ x.overdue = !x.done && !!x.due && x.due < now; });
  return out.sort(function(p, q){ return (p.due || Infinity) - (q.due || Infinity); });
}
export function isLogged(b){ return typeof b.logged === 'number'; }
export function blocksOf(P, key){ return P.blocks.filter(function(b){ return b.task === key; }); }
export function doneMin(P, key){ return blocksOf(P, key).reduce(function(s, b){ return s + (isLogged(b) ? b.logged : 0); }, 0); }
export function blockEnd(b){ return atTime(b.date, fmtHour(b.end)); }

// Ocupado ese día (cole, actividades, eventos y bloques menos los de skip) y huecos libres de la franja
function busyOn(P, iso, skip){
  const d = isoDate(iso), wd = weekdayOf(d), out = [], sc = schoolForDate(P, d);
  if(sc.on){ out.push([toHours(sc.entry), toHours(sc.exit)]); }
  P.acts.forEach(function(a){ (a.sessions || []).forEach(function(x){ if(x.day === wd && sessionOn(a, x, iso)){ out.push([toHours(x.start), toHours(x.end)]); } }); });
  P.events.forEach(function(e){ if(e.date === iso){ const h = toHours(e.time); out.push([h, h + (e.dur || 60) / 60]); } });
  P.blocks.forEach(function(b){ if(b.date === iso && (skip || []).indexOf(b.id) < 0){ out.push([b.start, b.end]); } });
  return out.sort(function(p, q){ return p[0] - q[0]; });
}
export function freeGaps(P, iso, from, to, skip){
  const lo = Math.max(toHours(P.bounds.start), from), hi = Math.min(toHours(P.bounds.end), to), gaps = [];
  let cur = lo;
  busyOn(P, iso, skip).forEach(function(r){
    if(r[0] > cur){ gaps.push([cur, Math.min(r[0], hi)]); }
    cur = Math.max(cur, r[1]);
  });
  if(cur < hi){ gaps.push([cur, hi]); }
  return gaps.filter(function(g){ return g[1] - g[0] >= BLOCK_MIN - 1e-9; });
}
export function planLimits(iso, due, now){
  let from = 0, to = 24;
  if(iso === isoOf(now)){ from = Math.ceil((now.getHours() + now.getMinutes() / 60) / BLOCK_STEP - 1e-9) * BLOCK_STEP; }
  if(due && iso === isoOf(due)){ to = due.getHours() + due.getMinutes() / 60; }
  return { from, to };
}
// Tiempo libre (min) desde ahora hasta la entrega; los bloques cuentan como libres
export function freeMinutesUntil(P, due, now){
  const skip = P.blocks.map(function(b){ return b.id; });
  let iso = isoOf(now), total = 0;
  const last = isoOf(due);
  for(let i = 0; i < 60 && iso <= last; i++){
    const l = planLimits(iso, due, now);
    freeGaps(P, iso, l.from, l.to, skip).forEach(function(g){ total += g[1] - g[0]; });
    iso = addDays(iso, 1);
  }
  return Math.round(total * 60);
}
// Aviso de riesgo, como riskTasks() de la App: [{ key, name, due, level: 'red'|'amber', need, free }]
// margin: margen del ámbar en minutos (en la App, 1 h)
export function riskTasks(P, now, margin){
  if(margin == null){ margin = RISK_MARGIN; }
  let cum = 0;
  const out = [];
  allTasks(P, now).filter(function(x){ return !x.done && x.est && x.due && x.due > now; })
    .sort(function(p, q){ return p.due - q.due; })
    .forEach(function(x){
      const own = Math.max(0, x.est - doneMin(P, x.key));
      cum += own;
      if(!own){ return; }
      const free = freeMinutesUntil(P, x.due, now);
      const level = cum > free ? 'red' : cum + margin > free ? 'amber' : null;
      if(level){ out.push({ key: x.key, name: x.name, due: x.due, level, need: cum, own, free }); }
    });
  return out;
}
// Tiempo libre de un día entero (min), desde ahora si es hoy (para la carga de la semana)
export function freeMinutesOn(P, iso, now){
  const l = planLimits(iso, null, now);
  let total = 0;
  freeGaps(P, iso, l.from, 24, P.blocks.map(function(b){ return b.id; })).forEach(function(g){ total += g[1] - g[0]; });
  return Math.round(total * 60);
}
