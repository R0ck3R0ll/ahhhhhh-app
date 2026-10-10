/* ================= HISTORIAL DEL PLAN =================
   Compara el antes y el después de un dato del plan (plans/{id}/kv/{clave}) y dice qué ha
   cambiado, para el historial de la App de seguimiento (plans/{id}/log) y el archivo de tareas
   (plans/{id}/archive/{clave de la tarea}). Todo son funciones puras: index.js las llama desde
   el disparador onPlanChange y las pruebas, con datos de ejemplo.

   Datos que guarda la App de Martina (texto JSON en cada clave):
   - app-tasks: [{ id, source ('manual' | Classroom), name, date, time, est, course, done, doneAt }]
   - app-events: [{ id, name, date, time, dur, place, task?: { name, date, time, est, done, doneAt } }]
   - app-activities: [{ id, name, sessions: [{ day, start, end }], place, skip?: ['fecha' + 'T' + 'hora'],
                        task?: { name, est, doneFor: [sesión], doneAtFor?: { sesión: momento } } }]
   - app-blocks: [{ id, task (clave de la tarea), date, start, end (horas), logged? (min), manual? }]
   Claves de las tareas, como en la App: 's:' + id (Classroom y sueltas), 'e:' + evento, 'a:' + actividad. */

export const TRACKED = ['app-tasks', 'app-events', 'app-activities', 'app-blocks'];

export function parse(v){
  if(typeof v !== 'string' || !v){ return []; }
  try{ const d = JSON.parse(v); return Array.isArray(d) ? d : []; }catch(e){ return []; }
}

function due(date, time){ return date ? date + (time ? ' ' + time : '') : null; }

// Tareas que salen de una clave: clave de la tarea → foto con lo que se sigue en el historial
export function taskMap(kvKey, arr){
  const out = {};
  arr.forEach(function(it){
    if(!it || !it.id){ return; }
    if(kvKey === 'app-tasks'){
      out['s:' + it.id] = { kind: it.source === 'manual' ? 'manual' : 'classroom', name: it.name || '', from: it.course || '',
                            due: due(it.date, it.time), est: it.est || 0, done: !!it.done, doneAt: it.doneAt || null };
    } else if(kvKey === 'app-events' && it.task){
      out['e:' + it.id] = { kind: 'event', name: it.task.name || '', from: it.name || '',
                            due: due(it.task.date, it.task.time), est: it.task.est || 0, done: !!it.task.done, doneAt: it.task.doneAt || null };
    } else if(kvKey === 'app-activities' && it.task){
      out['a:' + it.id] = { kind: 'activity', name: it.task.name || '', from: it.name || '', due: null, est: it.task.est || 0,
                            doneFor: (it.task.doneFor || []).slice(), doneAtFor: Object.assign({}, it.task.doneAtFor || {}) };
    }
  });
  return out;
}

// Cambios entre dos fotos de tareas → entradas del historial { type, key, name, ... }
export function diffTasks(before, after){
  const out = [];
  Object.keys(after).forEach(function(k){
    const a = after[k], b = before[k];
    if(!b){ out.push({ type: 'task.created', key: k, name: a.name, kind: a.kind, from: a.from, due: a.due, est: a.est }); return; }
    if(a.name !== b.name){ out.push({ type: 'task.renamed', key: k, name: a.name, before: b.name, after: a.name }); }
    if(a.due !== b.due){ out.push({ type: 'task.due-changed', key: k, name: a.name, before: b.due, after: a.due }); }
    if(a.est !== b.est){ out.push({ type: 'task.est-changed', key: k, name: a.name, before: b.est, after: a.est }); }
    if(a.kind === 'activity'){
      a.doneFor.filter(function(s){ return b.doneFor.indexOf(s) < 0; }).forEach(function(s){
        out.push({ type: 'task.done', key: k, name: a.name, session: s, doneAt: a.doneAtFor[s] || null });
      });
      b.doneFor.filter(function(s){ return a.doneFor.indexOf(s) < 0; }).forEach(function(s){
        out.push({ type: 'task.reopened', key: k, name: a.name, session: s });
      });
    } else if(a.done !== b.done){
      out.push(a.done ? { type: 'task.done', key: k, name: a.name, doneAt: a.doneAt, due: a.due }
                      : { type: 'task.reopened', key: k, name: a.name });
    }
  });
  Object.keys(before).forEach(function(k){
    if(!after[k]){ out.push({ type: 'task.deleted', key: k, name: before[k].name, done: !!before[k].done }); }
  });
  return out;
}

// Eventos y actividades (no sus tareas: esas van por diffTasks)
const EVENT_FIELDS = ['name', 'date', 'time', 'dur', 'place'];
const ACT_FIELDS = ['name', 'place'];
export function diffItems(kvKey, beforeArr, afterArr){
  const kind = kvKey === 'app-events' ? 'event' : 'activity', fields = kind === 'event' ? EVENT_FIELDS : ACT_FIELDS;
  const byId = function(arr){ const m = {}; arr.forEach(function(it){ if(it && it.id){ m[it.id] = it; } }); return m; };
  const B = byId(beforeArr), A = byId(afterArr), out = [];
  Object.keys(A).forEach(function(id){
    const a = A[id], b = B[id];
    if(!b){
      out.push(kind === 'event' ? { type: 'event.created', id, name: a.name, date: a.date || null, time: a.time || null }
                                : { type: 'activity.created', id, name: a.name, sessions: a.sessions || [] });
      return;
    }
    const changed = fields.filter(function(f){ return (a[f] == null ? null : a[f]) !== (b[f] == null ? null : b[f]); });
    if(kind === 'activity' && JSON.stringify(a.sessions || []) !== JSON.stringify(b.sessions || [])){ changed.push('sessions'); }
    if(changed.length){
      const e = { type: kind + '.changed', id, name: a.name, fields: changed, before: {}, after: {} };
      changed.forEach(function(f){ e.before[f] = b[f] == null ? null : b[f]; e.after[f] = a[f] == null ? null : a[f]; });
      out.push(e);
    }
    if(kind === 'activity'){
      const sa = a.skip || [], sb = b.skip || [];
      sa.filter(function(s){ return sb.indexOf(s) < 0; }).forEach(function(s){ out.push({ type: 'activity.skipped', id, name: a.name, session: s }); });
      sb.filter(function(s){ return sa.indexOf(s) < 0 && s >= today(); }).forEach(function(s){ out.push({ type: 'activity.unskipped', id, name: a.name, session: s }); });
    }
  });
  Object.keys(B).forEach(function(id){ if(!A[id]){ out.push({ type: kind + '.deleted', id, name: B[id].name }); } });
  return out;
}
// Al guardar una actividad, la App quita las sesiones quitadas que ya pasaron: eso no es «volver a ponerla»
let TODAY = null;
export function setToday(iso){ TODAY = iso; }
function today(){ return TODAY || new Date().toISOString().slice(0, 10); }

// Bloques de trabajo: entradas del historial agrupadas por tarea y cambios para el archivo
//   entries: block.planned { n, min } · block.removed { n } · block.moved { n } · block.logged { min, planned, manual }
//   byTask: clave de la tarea → { put: [bloques nuevos o cambiados], drop: [ids quitados] }
export function blockMin(b){ return Math.round((b.end - b.start) * 60); }
export function diffBlocks(beforeArr, afterArr){
  const byId = function(arr){ const m = {}; arr.forEach(function(b){ if(b && b.id && b.task){ m[b.id] = b; } }); return m; };
  const B = byId(beforeArr), A = byId(afterArr), groups = {}, byTask = {}, entries = [];
  const g = function(k){ return groups[k] || (groups[k] = { planned: 0, plannedMin: 0, removed: 0, moved: 0 }); };
  const t = function(k){ return byTask[k] || (byTask[k] = { put: [], drop: [] }); };
  const logged = function(b){ return typeof b.logged === 'number'; };
  Object.keys(A).forEach(function(id){
    const a = A[id], b = B[id];
    if(!b){
      t(a.task).put.push(a);
      if(logged(a)){ entries.push({ type: 'block.logged', key: a.task, block: id, date: a.date, start: a.start, min: a.logged, planned: blockMin(a), manual: !!a.manual }); }
      else { g(a.task).planned++; g(a.task).plannedMin += blockMin(a); }
      return;
    }
    if(a.date !== b.date || a.start !== b.start || a.end !== b.end || a.logged !== b.logged){ t(a.task).put.push(a); }
    if(!logged(b) && logged(a)){ entries.push({ type: 'block.logged', key: a.task, block: id, date: a.date, start: a.start, min: a.logged, planned: blockMin(a), manual: !!a.manual }); }
    else if(!logged(a) && (a.date !== b.date || a.start !== b.start || a.end !== b.end)){ g(a.task).moved++; }
  });
  Object.keys(B).forEach(function(id){
    if(A[id]){ return; }
    const b = B[id];
    // Lo trabajado se queda en el archivo aunque se borre el bloque (p. ej. al eliminar la tarea)
    if(!logged(b)){ t(b.task).drop.push(id); g(b.task).removed++; }
  });
  Object.keys(groups).forEach(function(k){
    const x = groups[k];
    if(x.planned){ entries.push({ type: 'block.planned', key: k, n: x.planned, min: x.plannedMin }); }
    if(x.moved){ entries.push({ type: 'block.moved', key: k, n: x.moved }); }
    if(x.removed){ entries.push({ type: 'block.removed', key: k, n: x.removed }); }
  });
  return { entries, byTask };
}

// Archivo de una tarea: se fusionan los bloques (los trabajados no se quitan nunca)
export function mergeBlocks(current, change){
  const m = {};
  (current || []).forEach(function(b){ m[b.id] = b; });
  change.drop.forEach(function(id){ if(m[id] && typeof m[id].logged !== 'number'){ delete m[id]; } });
  change.put.forEach(function(b){
    const o = { id: b.id, date: b.date, start: b.start, end: b.end };
    if(typeof b.logged === 'number'){ o.logged = b.logged; }
    if(b.manual){ o.manual = true; }
    m[b.id] = o;
  });
  return Object.keys(m).map(function(k){ return m[k]; })
    .sort(function(p, q){ return p.date === q.date ? p.start - q.start : (p.date < q.date ? -1 : 1); });
}
