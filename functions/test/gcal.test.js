// Hora de Madrid, como en el servidor (index.js)
process.env.TZ = 'Europe/Madrid';
import test from 'node:test';
import assert from 'node:assert/strict';
import { desiredEvents, planSync, hashOf, eventId, authUrl, localStamp, SCOPE } from '../gcal.js';

const J = JSON.stringify;
const now = new Date('2026-10-14T10:00');   // miércoles
function kv(over){
  return Object.assign({ 'kid-name': 'Martina', 'app-settings': J({ exportOn: true }), 'app-tasks': '[]', 'app-events': '[]', 'app-activities': '[]' }, over);
}
const piano = { id: 'a1', name: 'Piano', cat: 'actividad', place: 'Escuela de música', sessions: [{ day: 0, start: '17:00', end: '18:00' }],
                skip: ['2026-10-19T17:00'], task: { name: 'Escalas', doneFor: ['2026-10-26T17:00'] } };

test('actividades: una entrada por sesión, sin festivos ni «Hoy no voy», con la práctica en la descripción', function(){
  const w = desiredEvents(kv({ 'app-activities': J([piano]) }), null, now, 'es');
  const keys = Object.keys(w).sort();
  // 12/10 festivo, 19/10 «Hoy no voy»; de 7/10 a 9/12
  assert.ok(!w['act|a1|2026-10-12T17:00']);
  assert.ok(!w['act|a1|2026-10-19T17:00']);
  assert.equal(keys[0], 'act|a1|2026-10-26T17:00');
  assert.equal(keys[keys.length - 1], 'act|a1|2026-12-07T17:00');
  assert.ok(!w['act|a1|2026-12-14T17:00']);   // más allá de 8 semanas
  const e = w['act|a1|2026-10-26T17:00'].body;
  assert.equal(e.start.dateTime, '2026-10-26T17:00:00');
  assert.equal(e.end.dateTime, '2026-10-26T18:00:00');
  assert.equal(e.location, 'Escuela de música');
  assert.match(e.description, /✓ Tarea: Escalas/);
  assert.match(w['act|a1|2026-11-02T17:00'].body.description, /^Tarea: Escalas/);
  // Con lugar y aviso de salida: 30 min si aún no se sabe el trayecto
  assert.deepEqual(e.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] });
});

test('avisos: el trayecto de hoy que publica el móvil, 10 min sin lugar o con el aviso de salida apagado', function(){
  const evs = [{ id: 'e1', name: 'Dentista', date: '2026-10-14', time: '18:00', dur: 30, cat: 'cita', place: 'Clínica' },
               { id: 'e2', name: 'Llamada', date: '2026-10-14', time: '19:00', cat: 'cita' },
               { id: 'e3', name: 'Cumple', date: '2026-10-14', time: '20:00', cat: 'cita', place: 'Casa de Ana' }];
  const leave = { date: '2026-10-14', items: { 'evt-e1': 22, 'evt-e3': 0 } };
  let w = desiredEvents(kv({ 'app-events': J(evs) }), leave, now, 'es');
  assert.equal(w['evt|e1'].body.reminders.overrides[0].minutes, 22);
  assert.equal(w['evt|e1'].body.end.dateTime, '2026-10-14T18:30:00');
  assert.equal(w['evt|e2'].body.reminders.overrides[0].minutes, 10);
  assert.equal(w['evt|e2'].body.end.dateTime, '2026-10-14T20:00:00');   // 60 min por defecto
  assert.equal(w['evt|e3'].body.reminders.overrides[0].minutes, 10);   // mismo sitio que antes: sin trayecto
  // Trayecto de otro día: no se usa
  w = desiredEvents(kv({ 'app-events': J(evs) }), { date: '2026-10-13', items: { 'evt-e1': 22 } }, now, 'es');
  assert.equal(w['evt|e1'].body.reminders.overrides[0].minutes, 30);
  w = desiredEvents(kv({ 'app-events': J(evs), 'app-settings': J({ exportOn: true, leaveAlert: false }) }), leave, now, 'es');
  assert.equal(w['evt|e1'].body.reminders.overrides[0].minutes, 10);
});

test('tareas: aviso a la hora de entrega; las hechas con ✓ y sin aviso; categorías desmarcadas fuera', function(){
  const tasks = [{ id: 't1', source: 'manual', name: 'Mates', date: '2026-10-15', time: '09:00', est: 60 },
                 { id: 't2', source: 'manual', name: 'Lengua', date: '2026-10-16', time: '09:00', done: true },
                 { id: 't3', source: 'manual', name: 'Vieja', date: '2026-09-01', time: '09:00' }];
  const evs = [{ id: 'e1', name: 'Excursión', date: '2026-10-20', time: '09:00', cat: 'salida', task: { name: 'Autorización', date: '2026-10-17', time: '20:00' } }];
  let w = desiredEvents(kv({ 'app-tasks': J(tasks), 'app-events': J(evs) }), null, now, 'en');
  assert.equal(w['task|s:t1'].body.summary, 'Due: Mates');
  assert.equal(w['task|s:t1'].body.transparency, 'transparent');
  assert.deepEqual(w['task|s:t1'].body.reminders.overrides, [{ method: 'popup', minutes: 0 }]);
  assert.equal(w['task|s:t2'].body.summary, '✓ Due: Lengua');
  assert.deepEqual(w['task|s:t2'].body.reminders.overrides, []);
  assert.ok(!w['task|s:t3']);
  assert.equal(w['task|e:e1'].body.description.split('\n')[0], 'Excursión');
  assert.ok(w['evt|e1']);
  w = desiredEvents(kv({ 'app-tasks': J(tasks), 'app-events': J(evs), 'app-settings': J({ exportOn: true, exportCats: { tarea: false, salida: false } }) }), null, now, 'es');
  assert.deepEqual(Object.keys(w), []);
});

test('sincronización: solo lo que cambia; lo pasado que ya no está se olvida, no se borra', function(){
  const body = { summary: 'A' };
  const map = { k1: { h: hashOf(body), d: '2026-10-14' }, k2: { h: 'x', d: '2026-10-14' }, old: { h: 'x', d: '2026-09-01' }, gone: { h: 'x', d: '2026-10-20' } };
  const want = { k1: { date: '2026-10-14', body }, k2: { date: '2026-10-14', body }, k3: { date: '2026-10-15', body } };
  const ops = planSync(map, want, now).map(function(o){ return o.op + ':' + o.key; }).sort();
  assert.deepEqual(ops, ['delete:gone', 'forget:old', 'insert:k3', 'update:k2']);
});

test('ids de Google y dirección de permiso', function(){
  const id = eventId('plan1', 'evt|e1');
  assert.match(id, /^[0-9a-v]{5,1024}$/);
  assert.equal(id, eventId('plan1', 'evt|e1'));
  assert.notEqual(id, eventId('plan2', 'evt|e1'));
  const u = new URL(authUrl('cid', 'https://x/cb', 'st'));
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.ok(u.searchParams.get('scope').split(' ').includes(SCOPE));
  assert.equal(localStamp(new Date('2026-03-29T03:05')), '2026-03-29T03:05:00');
});

test('ajustes propios (supervisor): mandan sobre los de app-settings', function(){
  const tasks = [{ id: 't1', source: 'manual', name: 'Mates', date: '2026-10-15', time: '09:00' }];
  const base = kv({ 'app-tasks': J(tasks), 'app-settings': J({ exportOn: true, exportCats: { tarea: false } }) });
  assert.ok(!desiredEvents(base, null, now, 'es')['task|s:t1']);
  assert.ok(desiredEvents(base, null, now, 'es', { exportOn: true })['task|s:t1']);
});
