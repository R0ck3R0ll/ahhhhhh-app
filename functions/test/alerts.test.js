// Hora de Madrid, como en el servidor (index.js)
process.env.TZ = 'Europe/Madrid';
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlan, riskTasks, allTasks, nextSession, isHoliday } from '../plancore.js';
import { computeAlerts, newsAlert, dailySummary, weeklySummary, config } from '../alerts.js';

const J = JSON.stringify;
const settings = J({ bounds: { start: '08:00', end: '21:30' }, school: { week: { entry: '09:00', exit: '17:00' }, sat: { on: false, entry: '', exit: '' } } });
function plan(over){
  return makePlan(Object.assign({ 'kid-name': 'Martina', 'app-settings': settings, 'app-tasks': '[]', 'app-events': '[]', 'app-activities': '[]', 'app-blocks': '[]' }, over));
}
const types = function(l){ return l.map(function(a){ return a.type; }).sort(); };

test('festivos y sesiones: el 12/10 no hay Piano y la práctica pasa a la siguiente sesión', function(){
  assert.ok(isHoliday('2026-10-12'));
  assert.ok(isHoliday('2026-04-03'));   // Viernes Santo 2026
  const a = { sessions: [{ day: 0, start: '17:00', end: '18:00' }], skip: ['2026-10-19T17:00'] };
  assert.equal(nextSession(a, new Date('2026-10-11T10:00')).toISOString(), new Date('2026-10-26T17:00').toISOString());
});

test('avisos: atrasada, entrega próxima (solo el plazo más corto), grande sin bloques, sin estimar y riesgo', function(){
  const P = plan({ 'app-tasks': J([
    { id: '1', source: 'manual', name: 'Pasada', date: '2026-10-12', time: '18:00', est: 30 },
    { id: '2', source: 'manual', name: 'Pronto', date: '2026-10-13', time: '19:00', est: 30 },
    { id: '3', source: 'manual', name: 'Grande', date: '2026-10-15', time: '18:00', est: 240 },
    { id: '4', source: 'manual', name: 'Sin est', date: '2026-10-20', time: '18:00', est: 0 },
    { id: '5', source: 'manual', name: 'Hecha', date: '2026-10-12', time: '18:00', est: 30, done: true } ]) });
  const now = new Date('2026-10-13T17:30');
  const a = computeAlerts(P, now, {});
  const due = a.filter(function(x){ return x.type === 'dueSoon'; });
  assert.equal(due.length, 1);   // solo «Pronto» (en 1 h 30); «Grande» se entrega en 2 días
  const pronto = due.filter(function(x){ return x.key.indexOf('s:2') > 0; })[0];
  assert.ok(pronto.key.indexOf('due3|') === 0);
  assert.deepEqual(pronto.silent.map(function(k){ return k.split('|')[0]; }), ['due24']);
  assert.ok(a.some(function(x){ return x.type === 'overdue' && x.key.indexOf('s:1') > 0; }));
  assert.ok(!a.some(function(x){ return x.key.indexOf('s:5') > 0; }));
  assert.ok(a.some(function(x){ return x.type === 'big' && x.key.indexOf('s:3') > 0; }));
  assert.ok(a.some(function(x){ return x.type === 'noEst' && x.key.indexOf('s:4') > 0; }));
  assert.ok(!a.some(function(x){ return x.type === 'risk'; }));   // «Grande» cabe: quedan unas 11 h libres
  // Desactivados en Config: no salen
  const off = computeAlerts(P, now, { overdue: false, big: false, noEst: false, risk: false, dueSoon: false });
  assert.deepEqual(off, []);
});

test('riesgo con otro margen del ámbar', function(){
  const P = plan({ 'app-tasks': J([{ id: '1', source: 'manual', name: 'X', date: '2026-10-14', time: '20:00', est: 120 }]) });
  const now = new Date('2026-10-14T16:00');   // libre: 17:00–20:00 = 3 h
  assert.equal(riskTasks(P, now).length, 0);                 // 2 h + 1 h de margen = 3 h: cabe justo
  assert.equal(riskTasks(P, now, 90)[0].level, 'amber');     // con 1 h 30 de margen ya es ámbar
  assert.equal(computeAlerts(P, now, { amberMargin: 90 }).filter(function(x){ return x.type === 'risk'; }).length, 1);
});

test('bloques: sin registrar a las 2 h y no completado; los antiguos (más de 48 h) no', function(){
  const P = plan({ 'app-tasks': J([{ id: '1', source: 'manual', name: 'Mates', date: '2026-10-20', time: '18:00', est: 300 }]),
    'app-blocks': J([
      { id: 'a', task: 's:1', date: '2026-10-13', start: 17, end: 18 },
      { id: 'b', task: 's:1', date: '2026-10-13', start: 18.5, end: 19.5 },
      { id: 'c', task: 's:1', date: '2026-10-13', start: 19.5, end: 20, logged: 10 },
      { id: 'd', task: 's:1', date: '2026-10-13', start: 20, end: 20.5, logged: 0, manual: true },
      { id: 'e', task: 's:1', date: '2026-10-10', start: 17, end: 18 } ]) });
  const a = computeAlerts(P, new Date('2026-10-13T20:45'), {});
  const keys = a.map(function(x){ return x.key; });
  assert.ok(keys.indexOf('unlogged|a') >= 0);    // terminó hace 2 h 45
  assert.ok(keys.indexOf('unlogged|b') < 0);     // terminó hace 1 h 15
  assert.ok(keys.indexOf('skipped|c') >= 0);     // 10 de 30 min
  assert.ok(keys.indexOf('skipped|d') < 0);      // anotado a mano: no cuenta
  assert.ok(keys.indexOf('unlogged|e') < 0);     // de hace más de 48 h
});

test('novedades y resúmenes', function(){
  assert.equal(newsAlert({ type: 'task.created', key: 's:1', name: 'Mates', due: '2026-10-14 18:00', est: 60 }).body, '«Mates», entrega mié 14/10 18:00 · 1 h');
  assert.equal(newsAlert({ type: 'block.planned' }), null);
  const P = plan({
    'app-tasks': J([
      { id: '1', source: 'manual', name: 'Mates', date: '2026-10-13', time: '18:00', est: 60, done: true, doneAt: '2026-10-13T15:00:00.000Z' },
      { id: '2', source: 'manual', name: 'Lengua', date: '2026-10-14', time: '18:00', est: 90 } ]),
    'app-blocks': J([{ id: 'a', task: 's:1', date: '2026-10-13', start: 17.5, end: 18.5, logged: 45 }, { id: 'b', task: 's:2', date: '2026-10-13', start: 19, end: 20 }]),
    'app-activities': J([{ id: 'p', name: 'Natación', sessions: [{ day: 2, start: '18:00', end: '19:00' }] }]) });
  const d = dailySummary(P, new Date('2026-10-13T22:00'));
  assert.match(d.body, /1 tarea hecha \(Mates\) · 45 min trabajados/);
  assert.match(d.body, /0 completos, 1 a medias, 1 sin registrar/);
  assert.match(d.body, /Mañana: Lengua \(18:00, falta 1 h 30 min\) · 18:00 Natación/);
  const w = weeklySummary(P, new Date('2026-10-11T22:00'));
  assert.match(w.body, /1 entrega · falta 1 h 30 min/);   // «Mates» ya está hecha
  assert.equal(config({ dueHours: [24, 'x', 3] }).dueHours.join(','), '24,3');
});
