import test from 'node:test';
import assert from 'node:assert/strict';
import { resetKv, isTaskKey, isTaskLog, isTaskAlert, isTaskSent } from '../reset.js';

const J = JSON.stringify;

test('resetKv: quita tareas, tareas de eventos, sus bloques y la lista de importadas; deja actividades y eventos', function(){
  const kv = {
    'app-tasks': J([{ id: 'm1', source: 'manual' }, { id: 'i1', source: 'classroom', ref: 'R' }]),
    'app-events': J([{ id: 'e1', name: 'Excursión', task: { name: 'Autorización' } }, { id: 'e2', name: 'Médico' }]),
    'app-blocks': J([{ id: 'b1', task: 's:m1' }, { id: 'b2', task: 'e:e1' }, { id: 'b3', task: 'a:a1', logged: 30 }]),
    'import-seen': J({ R: { s: 'discarded' } })
  };
  const r = resetKv(kv);
  assert.deepEqual(r.counts, { tasks: 2, eventTasks: 1, blocks: 2 });
  assert.equal(r.values['app-tasks'], '[]');
  assert.equal(r.values['import-seen'], '{}');
  assert.deepEqual(JSON.parse(r.values['app-events']), [{ id: 'e1', name: 'Excursión', task: null }, { id: 'e2', name: 'Médico' }]);
  assert.deepEqual(JSON.parse(r.values['app-blocks']), [{ id: 'b3', task: 'a:a1', logged: 30 }]);
});

test('resetKv: no crea datos que no había y tolera datos rotos', function(){
  const r = resetKv({ 'app-tasks': 'no es json' });
  assert.deepEqual(Object.keys(r.values).sort(), ['app-tasks', 'import-seen']);
  assert.deepEqual(r.counts, { tasks: 0, eventTasks: 0, blocks: 0 });
});

test('qué es de una tarea: historial, avisos del supervisor y avisos enviados', function(){
  assert.ok(isTaskKey('s:m1') && isTaskKey('e:e1') && !isTaskKey('a:a1') && !isTaskKey(undefined));
  assert.ok(isTaskLog({ type: 'task.created', key: 's:i1' }));
  assert.ok(isTaskLog({ type: 'block.planned', key: 'e:e1' }));
  assert.ok(!isTaskLog({ type: 'block.logged', key: 'a:a1' }));
  assert.ok(!isTaskLog({ type: 'event.created', id: 'e1' }));
  assert.ok(!isTaskLog({ type: 'plan.tracked' }));
  assert.ok(isTaskAlert({ open: 'task:s:i1' }) && isTaskAlert({ open: 'task:e:e1' }));
  assert.ok(!isTaskAlert({ open: 'task:a:a1' }) && !isTaskAlert({ open: 'event:e1' }) && !isTaskAlert({ open: '' }));
  assert.ok(isTaskSent('uid1|overdue|s:i1|2026-11-10') && isTaskSent('uid1|noest|e:e1'));
  assert.ok(!isTaskSent('uid1|risk|a:a1|2|x') && !isTaskSent('uid1|news|abc-0'));
});
