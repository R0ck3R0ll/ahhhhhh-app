/* ================= REGISTRO DE TAREAS DESDE CERO =================
   Lo que no depende de Firebase para resetTasks (index.js): qué datos del plan quedan y qué
   entradas del historial, del archivo y de los avisos del supervisor son de tareas.

   Se quitan las tareas sueltas, de Classroom y del correo (claves 's:') y las de los eventos
   ('e:'), sus bloques de trabajo y la lista de importadas. Las actividades y sus tareas de
   práctica ('a:') se quedan, igual que los eventos (sin su tarea). */

import { parse } from './planlog.js';

export const RESET_KEYS = ['app-tasks', 'app-events', 'app-blocks', 'import-seen'];

// Clave de una tarea que se borra (no las de práctica de las actividades)
export function isTaskKey(k){ return typeof k === 'string' && /^[se]:/.test(k); }

// Datos del plan después del reset: { values: { clave: texto }, counts }
export function resetKv(kv){
  const tasks = parse(kv['app-tasks']), events = parse(kv['app-events']), blocks = parse(kv['app-blocks']);
  const keep = blocks.filter(function(b){ return !(b && isTaskKey(b.task)); });
  const counts = {
    tasks: tasks.length,
    eventTasks: events.filter(function(e){ return e && e.task; }).length,
    blocks: blocks.length - keep.length
  };
  const values = {
    'app-tasks': '[]',
    'app-events': JSON.stringify(events.map(function(e){ return e && e.task ? Object.assign({}, e, { task: null }) : e; })),
    'app-blocks': JSON.stringify(keep),
    'import-seen': '{}'
  };
  // Lo que no existía en el plan sigue sin existir (no se crean datos nuevos)
  ['app-events', 'app-blocks'].forEach(function(k){ if(kv[k] == null){ delete values[k]; } });
  return { values, counts };
}

// Entrada del historial (plans/{id}/log) que es de una tarea o de sus bloques
export function isTaskLog(d){ return !!d && isTaskKey(d.key); }
// Aviso del supervisor (users/{uid}/alerts) que abre una tarea
export function isTaskAlert(d){ return !!d && typeof d.open === 'string' && d.open.indexOf('task:') === 0 && isTaskKey(d.open.slice(5)); }
// Aviso ya enviado (plans/{id}/sent/{uid|clave}) de una tarea: la clave lleva «|s:…» o «|e:…»
export function isTaskSent(id){ return /\|[se]:/.test(id); }
