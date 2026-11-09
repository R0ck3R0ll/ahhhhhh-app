import test from 'node:test';
import assert from 'node:assert/strict';
import { resetKv, isScopeKey, isScopeLog, isScopeAlert, isScopeSent } from '../reset.js';

const J = JSON.stringify;
const KV = {
  'app-tasks': J([{ id: 'm1', source: 'manual' }, { id: 'i1', source: 'classroom', ref: 'R' }]),
  'app-events': J([{ id: 'e1', name: 'Excursión', task: { name: 'Autorización' } }, { id: 'e2', name: 'Médico' }]),
  'app-activities': J([{ id: 'a1', name: 'Piano', task: { name: 'Practicar' } }]),
  'app-blocks': J([{ id: 'b1', task: 's:m1' }, { id: 'b2', task: 'e:e1' }, { id: 'b3', task: 'a:a1', logged: 30 }]),
  'import-seen': J({ R: { s: 'discarded' } })
};

test('tareas: quita tareas, tareas de eventos, sus bloques y la lista de importadas; deja actividades y eventos', function(){
  const r = resetKv(KV, 'tasks');
  assert.deepEqual(r.counts, { blocks: 2, tasks: 2, eventTasks: 1 });
  assert.deepEqual(Object.keys(r.values).sort(), ['app-blocks', 'app-events', 'app-tasks', 'import-seen']);
  assert.equal(r.values['app-tasks'], '[]');
  assert.equal(r.values['import-seen'], '{}');
  assert.deepEqual(JSON.parse(r.values['app-events']), [{ id: 'e1', name: 'Excursión', task: null }, { id: 'e2', name: 'Médico' }]);
  assert.deepEqual(JSON.parse(r.values['app-blocks']), [{ id: 'b3', task: 'a:a1', logged: 30 }]);
});

test('actividades: quita las actividades y sus bloques; deja tareas, eventos e importadas', function(){
  const r = resetKv(KV, 'activities');
  assert.deepEqual(r.counts, { blocks: 1, activities: 1 });
  assert.deepEqual(Object.keys(r.values).sort(), ['app-activities', 'app-blocks']);
  assert.equal(r.values['app-activities'], '[]');
  assert.deepEqual(JSON.parse(r.values['app-blocks']), [{ id: 'b1', task: 's:m1' }, { id: 'b2', task: 'e:e1' }]);
});

test('no crea datos que no había y tolera datos rotos', function(){
  const r = resetKv({ 'app-tasks': 'no es json' }, 'tasks');
  assert.deepEqual(Object.keys(r.values).sort(), ['app-tasks', 'import-seen']);
  assert.deepEqual(r.counts, { blocks: 0, tasks: 0, eventTasks: 0 });
});

test('qué se borra del historial, de los avisos del supervisor y de los avisos enviados', function(){
  assert.ok(isScopeKey('s:m1', 'tasks') && isScopeKey('e:e1', 'tasks') && !isScopeKey('a:a1', 'tasks') && !isScopeKey(undefined, 'tasks'));
  assert.ok(isScopeKey('a:a1', 'activities') && !isScopeKey('s:m1', 'activities'));
  assert.ok(isScopeLog({ type: 'task.created', key: 's:i1' }, 'tasks'));
  assert.ok(isScopeLog({ type: 'block.planned', key: 'e:e1' }, 'tasks'));
  assert.ok(!isScopeLog({ type: 'block.logged', key: 'a:a1' }, 'tasks'));
  assert.ok(!isScopeLog({ type: 'event.created', id: 'e1' }, 'tasks'));
  assert.ok(!isScopeLog({ type: 'plan.tracked' }, 'tasks') && !isScopeLog({ type: 'plan.tracked' }, 'activities'));
  assert.ok(isScopeLog({ type: 'block.logged', key: 'a:a1' }, 'activities'));
  assert.ok(isScopeLog({ type: 'activity.skipped', id: 'a1' }, 'activities'));
  assert.ok(!isScopeLog({ type: 'event.created', id: 'e1' }, 'activities'));
  assert.ok(isScopeAlert({ open: 'task:s:i1' }, 'tasks') && isScopeAlert({ open: 'task:e:e1' }, 'tasks'));
  assert.ok(!isScopeAlert({ open: 'task:a:a1' }, 'tasks') && isScopeAlert({ open: 'task:a:a1' }, 'activities'));
  assert.ok(!isScopeAlert({ open: 'event:e1' }, 'tasks') && !isScopeAlert({ open: '' }, 'activities'));
  assert.ok(isScopeSent('uid1|overdue|s:i1|2026-11-10', 'tasks') && isScopeSent('uid1|noest|e:e1', 'tasks'));
  assert.ok(!isScopeSent('uid1|risk|a:a1|2|x', 'tasks') && isScopeSent('uid1|risk|a:a1|2|x', 'activities'));
  assert.ok(!isScopeSent('uid1|news|abc-0', 'tasks') && !isScopeSent('uid1|news|abc-0', 'activities'));
});
