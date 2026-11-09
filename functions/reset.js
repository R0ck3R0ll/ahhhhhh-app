/* ================= REGISTRO DESDE CERO (TAREAS O ACTIVIDADES) =================
   Lo que no depende de Firebase para resetPlanData (index.js): qué datos del plan quedan y qué
   entradas del historial, del archivo y de los avisos del supervisor se borran.

   - 'tasks': las tareas sueltas, de Classroom y del correo (claves 's:') y las de los eventos ('e:'),
     sus bloques de trabajo y la lista de importadas. Los eventos se quedan, sin su tarea.
   - 'activities': las actividades con sus tareas de práctica ('a:') y sus bloques de trabajo.
   Lo demás no se toca. */

import { parse } from './planlog.js';

export const SCOPES = {
  tasks: { prefixes: ['s', 'e'], keys: ['app-tasks', 'app-events', 'app-blocks', 'import-seen'], confirm: 'VACIAR TAREAS' },
  activities: { prefixes: ['a'], keys: ['app-activities', 'app-blocks'], confirm: 'VACIAR ACTIVIDADES' }
};

// Clave de una tarea (o tarea de práctica) que se borra con ese reset
export function isScopeKey(k, scope){
  return typeof k === 'string' && SCOPES[scope].prefixes.some(function(p){ return k.indexOf(p + ':') === 0; });
}

// Datos del plan después del reset: { values: { clave: texto }, counts }
export function resetKv(kv, scope){
  const blocks = parse(kv['app-blocks']);
  const keep = blocks.filter(function(b){ return !(b && isScopeKey(b.task, scope)); });
  const values = {}, counts = { blocks: blocks.length - keep.length };
  if(kv['app-blocks'] != null){ values['app-blocks'] = JSON.stringify(keep); }
  if(scope === 'tasks'){
    const events = parse(kv['app-events']);
    counts.tasks = parse(kv['app-tasks']).length;
    counts.eventTasks = events.filter(function(e){ return e && e.task; }).length;
    values['app-tasks'] = '[]';
    values['import-seen'] = '{}';
    if(kv['app-events'] != null){ values['app-events'] = JSON.stringify(events.map(function(e){ return e && e.task ? Object.assign({}, e, { task: null }) : e; })); }
  } else {
    counts.activities = parse(kv['app-activities']).length;
    values['app-activities'] = '[]';
  }
  return { values, counts };
}

// Entrada del historial (plans/{id}/log): de una tarea o sus bloques y, con las actividades, también
// las de las actividades mismas (creada, cambiada, «hoy no voy»…)
export function isScopeLog(d, scope){
  return !!d && (isScopeKey(d.key, scope) || (scope === 'activities' && /^activity\./.test(d.type || '')));
}
// Aviso del supervisor (users/{uid}/alerts) que abre una de esas tareas
export function isScopeAlert(d, scope){ return !!d && typeof d.open === 'string' && d.open.indexOf('task:') === 0 && isScopeKey(d.open.slice(5), scope); }
// Aviso ya enviado (plans/{id}/sent/{uid|clave}): la clave lleva «|s:…», «|e:…» o «|a:…»
export function isScopeSent(id, scope){ return SCOPES[scope].prefixes.some(function(p){ return id.indexOf('|' + p + ':') >= 0; }); }
