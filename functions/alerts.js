/* ================= AVISOS Y RESÚMENES (App de seguimiento) =================
   Qué avisos tocan ahora para un supervisor y los textos de los resúmenes de las 22:00. Funciones
   puras sobre los cálculos de plancore.js; index.js las llama cada 15 min (checkAlerts), a las 22:00
   (resúmenes) y al cambiar el plan (novedades), y se encarga de no repetir avisos y de enviarlos.
   Cada aviso lleva una clave fija: si ya se envió, no se vuelve a enviar.
   Los textos van en español (la App de seguimiento la usa Carlo). */
import { allTasks, riskTasks, doneMin, blockEnd, isLogged, isoOf, isoDate, addDays, toHours, fmtHour, weekdayOf, sessionOn, freeMinutesOn, RISK_MARGIN } from './plancore.js';

// Configuración por defecto (Config del supervisor la cambia: users/{uid}.alerts)
export const DEFAULTS = {
  overdue: true, risk: true, dueSoon: true, big: true, noEst: true, unlogged: true, skipped: true, news: true,
  daily: true, weekly: true,
  dueHours: [24, 3], amberMargin: 60, bigMin: 180, bigDays: 3, unloggedH: 2
};
export function config(raw){
  const c = Object.assign({}, DEFAULTS, raw || {});
  c.dueHours = (Array.isArray(c.dueHours) ? c.dueHours : DEFAULTS.dueHours).map(Number).filter(function(h){ return h > 0 && h <= 168; });
  ['amberMargin', 'bigMin', 'bigDays', 'unloggedH'].forEach(function(k){ c[k] = Math.max(0, Number(c[k]) || DEFAULTS[k]); });
  return c;
}

const WD = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
export function fmtWhen(d){ return WD[weekdayOf(d)] + ' ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + fmtHour(d.getHours() + d.getMinutes() / 60); }
export function fmtEst(min){ min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min'; }
function untilText(ms){ const min = Math.round(ms / 60000); return min >= 1440 ? Math.round(min / 1440) + ' d' : fmtEst(min); }
function dueKey(d){ return d ? d.toISOString().slice(0, 16) : ''; }

// Avisos que tocan ahora: [{ key, type, title, body, open, silent? }]
// silent: claves que se dan por enviadas sin avisar (p. ej. el aviso de 24 h si ya toca el de 3 h)
export function computeAlerts(P, now, cfg){
  cfg = config(cfg);
  const out = [], tasks = allTasks(P, now), byKey = {};
  tasks.forEach(function(x){ byKey[x.key] = x; });
  const name = function(x){ return '«' + x.name + '»'; };

  tasks.forEach(function(x){
    if(x.done || !x.due){ return; }
    // Tarea no hecha a tiempo
    if(cfg.overdue && x.due < now && x.kind !== 'activity'){
      out.push({ key: 'overdue|' + x.key + '|' + dueKey(x.due), type: 'overdue', open: 'task:' + x.key,
                 title: 'Tarea sin hacer a tiempo', body: name(x) + ': la entrega era el ' + fmtWhen(x.due) + ' y sigue sin hacer.' });
    }
    if(x.due <= now){ return; }
    // Entrega próxima: el aviso del plazo más corto que ya toca; los más largos se dan por enviados
    if(cfg.dueSoon){
      const left = x.due - now, hit = cfg.dueHours.filter(function(h){ return left <= h * 3600000; }).sort(function(a, b){ return a - b; });
      if(hit.length){
        out.push({ key: 'due' + hit[0] + '|' + x.key + '|' + dueKey(x.due), type: 'dueSoon', open: 'task:' + x.key,
                   silent: hit.slice(1).map(function(h){ return 'due' + h + '|' + x.key + '|' + dueKey(x.due); }),
                   title: 'Entrega en ' + untilText(left), body: name(x) + ' se entrega el ' + fmtWhen(x.due) + ' y no está hecha' + (x.est ? ' (falta ' + fmtEst(Math.max(0, x.est - doneMin(P, x.key))) + ').' : '.') });
      }
    }
    // Tarea grande sin bloques cerca de la entrega
    if(cfg.big && x.est >= cfg.bigMin && !P.blocks.some(function(b){ return b.task === x.key; }) && x.due - now <= cfg.bigDays * 86400000){
      out.push({ key: 'big|' + x.key + '|' + dueKey(x.due), type: 'big', open: 'task:' + x.key,
                 title: 'Tarea grande sin planificar', body: name(x) + ' (' + fmtEst(x.est) + ') se entrega el ' + fmtWhen(x.due) + ' y no tiene bloques de trabajo.' });
    }
    // Sin tiempo estimado: no se puede comprobar su riesgo
    if(cfg.noEst && !x.est && x.kind !== 'activity'){
      out.push({ key: 'noest|' + x.key, type: 'noEst', open: 'task:' + x.key,
                 title: 'Tarea sin tiempo estimado', body: name(x) + ' (entrega ' + fmtWhen(x.due) + ') no tiene tiempo estimado: no se puede saber si da tiempo.' });
    }
  });

  // Riesgo: el mismo cálculo que la App (con el margen del ámbar de Config)
  if(cfg.risk){
    riskTasks(P, now, cfg.amberMargin).forEach(function(r){
      const level = r.level;
      out.push({ key: 'risk|' + r.key + '|' + level + '|' + dueKey(r.due), type: 'risk', level, open: 'task:' + r.key,
                 title: level === 'red' ? 'No da tiempo' : 'Cuidado, el tiempo se agota',
                 body: '«' + r.name + '»: hace falta ' + fmtEst(r.need) + ' y hasta la entrega (' + fmtWhen(r.due) + ') quedan ' + fmtEst(r.free) + ' libres' + (level === 'amber' ? ': muy poco margen.' : '.') });
    });
  }

  // Bloques de las últimas 48 h: sin registrar (pasadas unloggedH horas) o saltados (menos de lo planificado)
  P.blocks.forEach(function(b){
    const x = byKey[b.task], end = blockEnd(b);
    if(!x || end > now || now - end > 48 * 3600000){ return; }
    const len = Math.round((b.end - b.start) * 60);
    if(cfg.unlogged && !isLogged(b) && !x.done && now - end >= cfg.unloggedH * 3600000){
      out.push({ key: 'unlogged|' + b.id, type: 'unlogged', open: 'task:' + b.task,
                 title: 'Bloque sin registrar', body: 'El bloque de ' + name(x) + ' (' + fmtWhen(isoDate(b.date)).slice(0, 9) + ' ' + fmtHour(b.start) + '–' + fmtHour(b.end) + ') terminó y no ha anotado lo trabajado.' });
    }
    if(cfg.skipped && isLogged(b) && !b.manual && b.logged < len){
      out.push({ key: 'skipped|' + b.id, type: 'skipped', open: 'task:' + b.task,
                 title: 'Bloque no completado', body: name(x) + ': ' + (b.logged ? 'trabajó ' + fmtEst(b.logged) + ' de ' + fmtEst(len) : 'no trabajó nada de ' + fmtEst(len)) + ' planificados (' + fmtWhen(isoDate(b.date)).slice(0, 9) + ' ' + fmtHour(b.start) + ').' });
    }
  });
  return out;
}

// Novedades (desde el historial que escribe onPlanChange): tarea nueva, evento nuevo, entrega cambiada
export function newsAlert(e){
  const due = function(v){ if(!v){ return '—'; } const p = String(v).split(' '); const d = isoDate(p[0]); if(p[1]){ d.setMinutes(Math.round(toHours(p[1]) * 60)); } return p[1] ? fmtWhen(d) : fmtWhen(d).slice(0, 9); };
  if(e.type === 'task.created'){ return { type: 'news', open: 'task:' + e.key, title: 'Tarea nueva', body: '«' + e.name + '»' + (e.due ? ', entrega ' + due(e.due) : '') + (e.est ? ' · ' + fmtEst(e.est) : ' · sin tiempo estimado') }; }
  if(e.type === 'event.created'){ return { type: 'news', open: 'event:' + e.id, title: 'Evento nuevo', body: '«' + e.name + '»' + (e.date ? ', ' + due(e.date + (e.time ? ' ' + e.time : '')) : '') }; }
  if(e.type === 'task.due-changed'){ return { type: 'news', open: 'task:' + e.key, title: 'Entrega cambiada', body: '«' + e.name + '»: ' + due(e.before) + ' → ' + due(e.after) }; }
  return null;
}

// Resumen diario (22:00): lo de hoy y lo de mañana
export function dailySummary(P, now){
  const today = isoOf(now), tomorrow = addDays(today, 1), tasks = allTasks(P, now);
  // Día en que se marcó como hecha (doneAt antiguo: solo la fecha)
  const dayOf = function(v){ return !v ? null : String(v).length <= 10 ? String(v) : isoOf(new Date(v)); };
  const doneToday = [];
  P.tasks.forEach(function(t){ if(t.done && dayOf(t.doneAt) === today){ doneToday.push(t.name); } });
  P.events.forEach(function(e){ const t = e.task; if(t && t.done && dayOf(t.doneAt) === today){ doneToday.push(t.name); } });
  P.acts.forEach(function(a){ const at = (a.task && a.task.doneAtFor) || {}; Object.keys(at).forEach(function(k){ if(dayOf(at[k]) === today){ doneToday.push(a.task.name); } }); });
  let worked = 0, full = 0, part = 0, none = 0;
  P.blocks.forEach(function(b){
    if(b.date !== today){ return; }
    if(isLogged(b)){ worked += b.logged; }
    if(b.manual || blockEnd(b) > now){ return; }
    const len = Math.round((b.end - b.start) * 60);
    if(!isLogged(b)){ none++; } else if(b.logged >= len){ full++; } else { part++; }
  });
  const dueTomorrow = tasks.filter(function(x){ return x.due && isoOf(x.due) === tomorrow && !x.done; });
  const d = isoDate(tomorrow), wd = weekdayOf(d), plans = [];
  P.acts.forEach(function(a){ (a.sessions || []).forEach(function(x){ if(x.day === wd && sessionOn(a, x, tomorrow)){ plans.push(x.start + ' ' + a.name); } }); });
  P.events.forEach(function(e){ if(e.date === tomorrow){ plans.push(e.time + ' ' + e.name); } });
  plans.sort();
  const lines = [];
  lines.push('Hoy: ' + (doneToday.length ? doneToday.length + (doneToday.length === 1 ? ' tarea hecha' : ' tareas hechas') + ' (' + doneToday.join(', ') + ')' : 'ninguna tarea hecha') + ' · ' + fmtEst(worked) + ' trabajados.');
  if(full + part + none){ lines.push('Bloques de hoy: ' + full + ' completos, ' + part + ' a medias, ' + none + ' sin registrar.'); }
  lines.push('Mañana: ' + (dueTomorrow.length ? dueTomorrow.map(function(x){ return x.name + ' (' + fmtHour(x.due.getHours() + x.due.getMinutes() / 60) + (x.est ? ', falta ' + fmtEst(Math.max(0, x.est - doneMin(P, x.key))) : '') + ')'; }).join(', ') : 'ninguna entrega') + (plans.length ? ' · ' + plans.join(', ') : '') + '.');
  return { title: 'Resumen de hoy' + (P.name ? ' · ' + P.name : ''), body: lines.join('\n'), open: 'now' };
}

// Resumen semanal (domingo, 22:00): la semana que viene
export function weeklySummary(P, now){
  const start = addDays(isoOf(now), 1), tasks = allTasks(P, now), risk = {};
  riskTasks(P, now).forEach(function(r){ const k = isoOf(r.due); if(!risk[k] || r.level === 'red'){ risk[k] = r.level; } });
  let n = 0, need = 0, free = 0, noEst = 0;
  const days = [];
  for(let i = 0; i < 7; i++){
    const iso = addDays(start, i), list = tasks.filter(function(x){ return x.due && isoOf(x.due) === iso && !x.done && x.kind !== 'activity'; });
    let dn = 0;
    list.forEach(function(x){ if(x.est){ dn += Math.max(0, x.est - doneMin(P, x.key)); } else { noEst++; } });
    n += list.length; need += dn; free += freeMinutesOn(P, iso, now);
    if(risk[iso]){ days.push(WD[weekdayOf(isoDate(iso))] + ' ' + iso.slice(8) + '/' + iso.slice(5, 7) + (risk[iso] === 'red' ? ' (no da tiempo)' : ' (muy justo)')); }
  }
  const lines = [
    'Semana que viene: ' + n + (n === 1 ? ' entrega' : ' entregas') + ' · falta ' + fmtEst(need) + ' de trabajo y hay ' + fmtEst(free) + ' libres' + (noEst ? ' (' + noEst + ' sin estimar)' : '') + '.',
    days.length ? 'Días críticos: ' + days.join(', ') + '.' : 'Sin días críticos.'
  ];
  return { title: 'La semana que viene' + (P.name ? ' · ' + P.name : ''), body: lines.join('\n'), open: 'stats' };
}
export { RISK_MARGIN };
