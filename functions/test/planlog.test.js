import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, taskMap, diffTasks, diffItems, diffBlocks, mergeBlocks, setToday } from '../planlog.js';

const J = JSON.stringify;
const types = function(list){ return list.map(function(e){ return e.type; }); };

test('parse tolera datos vacíos o rotos', function(){
  assert.deepEqual(parse(null), []);
  assert.deepEqual(parse('no es json'), []);
  assert.deepEqual(parse('{"a":1}'), []);
  assert.deepEqual(parse('[{"id":"x"}]'), [{ id: 'x' }]);
});

test('tareas sueltas y de Classroom: creada, cambios, hecha, reabierta y eliminada', function(){
  const t0 = [{ id: '1', source: 'manual', name: 'Mates', date: '2026-10-14', time: '18:00', est: 120 }];
  const t1 = [{ id: '1', source: 'manual', name: 'Mates', date: '2026-10-15', time: '18:00', est: 90, done: true, doneAt: '2026-10-13T17:05:00.000Z' },
              { id: '2', source: 'classroom', course: 'Lengua', name: 'Redacción', date: '2026-10-20', time: '09:00', est: 60 }];
  const d = diffTasks(taskMap('app-tasks', parse(J(t0))), taskMap('app-tasks', parse(J(t1))));
  assert.deepEqual(types(d), ['task.due-changed', 'task.est-changed', 'task.done', 'task.created']);
  assert.equal(d[0].before, '2026-10-14 18:00');
  assert.equal(d[0].after, '2026-10-15 18:00');
  assert.equal(d[2].doneAt, '2026-10-13T17:05:00.000Z');
  assert.equal(d[3].kind, 'classroom');
  assert.equal(d[3].from, 'Lengua');
  const back = diffTasks(taskMap('app-tasks', t1), taskMap('app-tasks', [Object.assign({}, t1[0], { done: false, doneAt: null })]));
  assert.deepEqual(types(back), ['task.reopened', 'task.deleted']);
  assert.equal(back[1].key, 's:2');
});

test('tareas de eventos y de práctica de actividades', function(){
  const e0 = [{ id: 'e1', name: 'Excursión', date: '2026-10-20', time: '08:00' }];
  const e1 = [{ id: 'e1', name: 'Excursión', date: '2026-10-20', time: '08:00', task: { name: 'Autorización', date: '2026-10-19', time: '20:00', est: 10 } }];
  const d = diffTasks(taskMap('app-events', e0), taskMap('app-events', e1));
  assert.deepEqual(types(d), ['task.created']);
  assert.equal(d[0].key, 'e:e1');
  assert.equal(d[0].due, '2026-10-19 20:00');

  const a0 = [{ id: 'a1', name: 'Piano', sessions: [], task: { name: 'Practicar', est: 30, doneFor: ['2026-10-13T18:00'] } }];
  const a1 = [{ id: 'a1', name: 'Piano', sessions: [], task: { name: 'Practicar', est: 30, doneFor: ['2026-10-15T18:00'], doneAtFor: { '2026-10-15T18:00': '2026-10-14T19:00:00.000Z' } } }];
  const p = diffTasks(taskMap('app-activities', a0), taskMap('app-activities', a1));
  assert.deepEqual(types(p), ['task.done', 'task.reopened']);
  assert.equal(p[0].session, '2026-10-15T18:00');
  assert.equal(p[0].doneAt, '2026-10-14T19:00:00.000Z');
});

test('eventos y actividades: creados, cambiados, eliminados y sesiones quitadas', function(){
  const d = diffItems('app-events',
    [{ id: 'e1', name: 'Médico', date: '2026-10-20', time: '10:00', dur: 60 }, { id: 'e2', name: 'Cine' }],
    [{ id: 'e1', name: 'Médico', date: '2026-10-21', time: '10:00', dur: 60 }, { id: 'e3', name: 'Cumple', date: '2026-10-25', time: '17:00' }]);
  assert.deepEqual(types(d), ['event.changed', 'event.created', 'event.deleted']);
  assert.deepEqual(d[0].fields, ['date']);
  assert.equal(d[0].before.date, '2026-10-20');

  setToday('2026-10-13');
  const s = [{ day: 1, start: '18:00', end: '19:00' }];
  const a = diffItems('app-activities',
    [{ id: 'a1', name: 'Natación', sessions: s, skip: ['2026-10-06T18:00', '2026-10-20T18:00'] }],
    [{ id: 'a1', name: 'Natación', sessions: [{ day: 1, start: '18:30', end: '19:30' }], skip: ['2026-10-13T18:00'] }]);
  assert.deepEqual(types(a), ['activity.changed', 'activity.skipped', 'activity.unskipped']);
  assert.deepEqual(a[0].fields, ['sessions']);
  assert.equal(a[1].session, '2026-10-13T18:00');
  // La del 6/10 ya pasó: la App la limpia al guardar, no es «volver a ponerla»
  assert.equal(a[2].session, '2026-10-20T18:00');
});

test('bloques: planificados, movidos, quitados y trabajados, agrupados por tarea', function(){
  const b0 = [
    { id: 'b1', task: 's:1', date: '2026-10-13', start: 18, end: 19 },
    { id: 'b2', task: 's:1', date: '2026-10-14', start: 18, end: 19 },
    { id: 'b3', task: 's:1', date: '2026-10-12', start: 17, end: 18 }
  ];
  const b1 = [
    { id: 'b1', task: 's:1', date: '2026-10-13', start: 18, end: 19, logged: 40 },
    { id: 'b3', task: 's:1', date: '2026-10-12', start: 17.5, end: 18 },
    { id: 'b4', task: 's:1', date: '2026-10-15', start: 17, end: 18.5 },
    { id: 'b5', task: 's:1', date: '2026-10-11', start: 10, end: 10.5, logged: 30, manual: true }
  ];
  const d = diffBlocks(b0, b1);
  assert.deepEqual(types(d.entries), ['block.logged', 'block.logged', 'block.planned', 'block.moved', 'block.removed']);
  assert.equal(d.entries[0].min, 40);
  assert.equal(d.entries[0].planned, 60);
  assert.equal(d.entries[1].manual, true);
  assert.equal(d.entries[2].n, 1);
  assert.equal(d.entries[2].min, 90);
  assert.deepEqual(d.byTask['s:1'].drop, ['b2']);
});

test('archivo: los bloques trabajados no se quitan nunca', function(){
  const cur = [{ id: 'b1', date: '2026-10-13', start: 18, end: 19, logged: 40 }, { id: 'b2', date: '2026-10-14', start: 9.5, end: 10 }];
  // Al eliminar la tarea, la App borra todos sus bloques
  const d = diffBlocks([{ id: 'b1', task: 's:1', date: '2026-10-13', start: 18, end: 19, logged: 40 }, { id: 'b2', task: 's:1', date: '2026-10-14', start: 9.5, end: 10 }], []);
  assert.deepEqual(d.entries.map(function(e){ return e.type; }), ['block.removed']);
  const out = mergeBlocks(cur, d.byTask['s:1']);
  assert.deepEqual(out.map(function(b){ return b.id; }), ['b1']);
  // Orden por día y hora (9,5 antes que 10)
  const sorted = mergeBlocks([], { put: [{ id: 'x', date: '2026-10-14', start: 10, end: 11 }, { id: 'y', date: '2026-10-14', start: 9.75, end: 10 }, { id: 'z', date: '2026-10-13', start: 20, end: 21 }], drop: [] });
  assert.deepEqual(sorted.map(function(b){ return b.id; }), ['z', 'y', 'x']);
});
