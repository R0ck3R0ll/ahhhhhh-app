/* ================= EXPORTACIÓN A GOOGLE CALENDAR =================
   Solo en un sentido (App → Google Calendar). La App crea en la cuenta de Google que elija quien la
   usa (p. ej. la Gmail personal de Martina) un calendario propio, «AHHHHHH · nombre», y el servidor
   escribe ahí las actividades, los eventos y las entregas de las tareas. Permiso de Google:
   calendar.app.created (solo puede tocar los calendarios que crea la App; no ve los demás).

   Este archivo tiene la parte pura (qué eventos tiene que haber, con sus avisos) y las llamadas a
   la API de Google. index.js decide cuándo se sincroniza y guarda el estado en Firestore.

   desiredEvents(kv, leave, now, lang) → { clave: { date, body } }
   - Actividades: una entrada por sesión, de hace 7 días a 8 semanas vista (sin festivos ni «Hoy no
     voy»). Si tienen tarea de práctica, va en la descripción («✓» si ya está hecha para esa sesión).
   - Eventos: desde hace 7 días, con su duración.
   - Tareas (sueltas, de Classroom y de eventos): un aviso a la hora de entrega (15 min, sin ocupar
     tiempo). Las hechas llevan «✓» y no avisan.
   - Avisos: a la hora de salida si el elemento tiene lugar y «Aviso a la hora de salida» está
     activado (tiempo de trayecto que publica el móvil para hoy; si aún no se sabe, 30 min antes);
     si no, 10 min antes.
   - Categorías que no se exportan (Config > Google Calendar > Qué se exporta): fuera. */

import { createHash } from 'node:crypto';
import { isoOf, isoDate, addDays, atTime, weekdayOf, sessionOn } from './plancore.js';

export const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export const PAST_DAYS = 7, AHEAD_DAYS = 56;
export const TZ = 'Europe/Madrid';
const DEFAULT_LEAD = 10, UNKNOWN_TRAVEL = 30, TASK_MIN = 15;

const TEXTS = {
  es: { due: 'Entrega', practice: 'Tarea', footer: 'Creado por AHHHHHH Today. Los cambios se hacen en la App.' },
  en: { due: 'Due', practice: 'Homework', footer: 'Created by AHHHHHH Today. Make changes in the App.' },
  it: { due: 'Consegna', practice: 'Compito', footer: 'Creato da AHHHHHH Today. Le modifiche si fanno nell’App.' },
  fr: { due: 'À rendre', practice: 'Devoir', footer: 'Créé par AHHHHHH Today. Les changements se font dans l’App.' },
  de: { due: 'Abgabe', practice: 'Aufgabe', footer: 'Erstellt von AHHHHHH Today. Änderungen bitte in der App.' }
};
export function texts(lang){ return TEXTS[lang] || TEXTS.es; }
export function calendarName(kid){ return 'AHHHHHH' + (kid ? ' · ' + kid : ''); }

function json(v, def){ try{ const d = JSON.parse(v); return d == null ? def : d; }catch(e){ return def; } }
function pad(n){ return String(n).padStart(2, '0'); }
// Fecha y hora locales (Madrid) en el formato de la API: «2026-10-12T17:30:00»
export function localStamp(d){ return isoOf(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00'; }

// Id fijo de cada evento en Google (caracteres 0-9 y a-v): si se pierde lo guardado, no se duplica
export function eventId(planId, key){ return 'ah' + createHash('sha1').update(planId + '|' + key).digest('hex'); }

function reminders(minutes){ return minutes == null ? { useDefault: false, overrides: [] } : { useDefault: false, overrides: [{ method: 'popup', minutes: Math.max(0, Math.min(40320, Math.round(minutes))) }] }; }
function desc(lines, T){ return lines.filter(Boolean).concat(['', T.footer]).join('\n').trim(); }

// Aviso de un elemento con hora (actividad o evento): a la hora de salida si tiene lugar
function leadFor(id, iso, place, leaveOn, leave){
  if(!place || !leaveOn){ return DEFAULT_LEAD; }
  const known = leave && leave.date === iso && leave.items && typeof leave.items[id] === 'number' ? leave.items[id] : null;
  if(known === null){ return UNKNOWN_TRAVEL; }
  return known > 0 ? known : DEFAULT_LEAD;
}

export function desiredEvents(kv, leave, now, lang){
  const T = texts(lang);
  const settings = json(kv['app-settings'], {}) || {};
  const cats = settings.exportCats || {};
  const on = function(cat){ return cats[cat] !== false; };
  const leaveOn = settings.leaveAlert !== false;
  const acts = json(kv['app-activities'], []) || [], events = json(kv['app-events'], []) || [], tasks = json(kv['app-tasks'], []) || [];
  const today = isoOf(now), from = addDays(today, -PAST_DAYS), to = addDays(today, AHEAD_DAYS);
  const out = {};

  acts.forEach(function(a){
    if(!a || !a.id || !on(a.cat || 'actividad')){ return; }
    for(let iso = from; iso <= to; iso = addDays(iso, 1)){
      const wd = weekdayOf(isoDate(iso));
      (a.sessions || []).forEach(function(x){
        if(x.day !== wd || !x.start || !x.end || !sessionOn(a, x, iso)){ return; }
        const id = 'act-' + a.id + '-' + x.start, occ = iso + 'T' + x.start;
        const practice = a.task && a.task.name ? ((a.task.doneFor || []).indexOf(occ) >= 0 ? '✓ ' : '') + T.practice + ': ' + a.task.name : '';
        out['act|' + a.id + '|' + occ] = { date: iso, body: {
          summary: a.name || '',
          location: a.place || undefined,
          description: desc([a.desc, practice], T),
          start: { dateTime: localStamp(atTime(iso, x.start)), timeZone: TZ },
          end: { dateTime: localStamp(atTime(iso, x.end)), timeZone: TZ },
          reminders: reminders(leadFor(id, iso, a.place, leaveOn, leave))
        } };
      });
    }
  });

  events.forEach(function(e){
    if(!e || !e.id || !e.date || !e.time || e.date < from || !on(e.cat || 'cita')){ return; }
    const start = atTime(e.date, e.time), end = new Date(start.getTime() + (e.dur || 60) * 60000);
    out['evt|' + e.id] = { date: e.date, body: {
      summary: e.name || '',
      location: e.place || undefined,
      description: desc([e.desc, e.task && e.task.name ? T.practice + ': ' + e.task.name : ''], T),
      start: { dateTime: localStamp(start), timeZone: TZ },
      end: { dateTime: localStamp(end), timeZone: TZ },
      reminders: reminders(leadFor('evt-' + e.id, e.date, e.place, leaveOn, leave))
    } };
  });

  // Entregas: tareas sueltas o de Classroom y tareas de eventos (las de práctica van en la actividad)
  if(on('tarea')){
    const due = [];
    tasks.forEach(function(tk){ if(tk && tk.id && tk.date && tk.time){ due.push({ key: 's:' + tk.id, name: tk.name, date: tk.date, time: tk.time, done: !!tk.done, from: tk.source === 'manual' ? '' : tk.course || '', desc: tk.desc }); } });
    events.forEach(function(e){ if(e && e.id && e.task && e.task.date && e.task.time){ due.push({ key: 'e:' + e.id, name: e.task.name, date: e.task.date, time: e.task.time, done: !!e.task.done, from: e.name || '', desc: e.task.desc }); } });
    due.forEach(function(x){
      if(x.date < from){ return; }
      const start = atTime(x.date, x.time);
      out['task|' + x.key] = { date: x.date, body: {
        summary: (x.done ? '✓ ' : '') + T.due + ': ' + (x.name || ''),
        description: desc([x.from, x.desc], T),
        start: { dateTime: localStamp(start), timeZone: TZ },
        end: { dateTime: localStamp(new Date(start.getTime() + TASK_MIN * 60000)), timeZone: TZ },
        transparency: 'transparent',
        reminders: reminders(x.done ? null : 0)
      } };
    });
  }
  return out;
}

// Huella de un evento: si no cambia, no se vuelve a escribir en Google
export function hashOf(body){ return createHash('sha1').update(JSON.stringify(body)).digest('base64').slice(0, 16); }

/* Qué hay que hacer en Google: map es lo ya escrito { clave: { h: huella, d: fecha } }.
   Lo que ya no está y es de hace más de PAST_DAYS días se deja en el calendario (es pasado) y se
   olvida; lo demás que ya no está se borra. */
export function planSync(map, want, now){
  const from = addDays(isoOf(now), -PAST_DAYS), ops = [];
  Object.keys(want).forEach(function(k){
    const h = hashOf(want[k].body);
    if(!map[k]){ ops.push({ op: 'insert', key: k, h, d: want[k].date }); }
    else if(map[k].h !== h){ ops.push({ op: 'update', key: k, h, d: want[k].date }); }
  });
  Object.keys(map).forEach(function(k){
    if(want[k]){ return; }
    ops.push({ op: map[k].d < from ? 'forget' : 'delete', key: k });
  });
  return ops;
}

/* ---- API de Google ---- */
export class GoogleError extends Error {
  constructor(status, reason, message){ super(message || reason || String(status)); this.status = status; this.reason = reason || ''; }
}
async function readError(res){
  let j = null;
  try{ j = await res.json(); }catch(e){}
  const err = j && j.error;
  if(typeof err === 'string'){ return new GoogleError(res.status, err, j.error_description || err); }
  return new GoogleError(res.status, err && err.errors && err.errors[0] && err.errors[0].reason || (err && err.status) || '', err && err.message);
}

export function authUrl(clientId, redirectUri, state){
  const p = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: 'openid email ' + SCOPE, access_type: 'offline', prompt: 'consent select_account',
    include_granted_scopes: 'false', state
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}
async function tokenRequest(params){
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  if(!res.ok){ throw await readError(res); }
  return res.json();
}
// Código de la pantalla de permiso → { refresh, access, email, scopes }
export async function exchangeCode(clientId, secret, redirectUri, code){
  const j = await tokenRequest({ code, client_id: clientId, client_secret: secret, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  let email = '';
  try{ email = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64url').toString()).email || ''; }catch(e){}
  return { refresh: j.refresh_token || '', access: j.access_token, email: String(email).toLowerCase(), scopes: String(j.scope || '').split(' ') };
}
export async function accessToken(clientId, secret, refresh){
  return (await tokenRequest({ client_id: clientId, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' })).access_token;
}
export async function revoke(token){
  try{ await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=' + encodeURIComponent(token) }); }catch(e){}
}

const API = 'https://www.googleapis.com/calendar/v3';
export async function call(access, method, path, body){
  for(let attempt = 0; ; attempt++){
    const res = await fetch(API + path, {
      method, headers: Object.assign({ Authorization: 'Bearer ' + access }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    if(res.ok){ return res.status === 204 ? null : res.json(); }
    const e = await readError(res);
    // Demasiadas peticiones seguidas: se espera un poco y se repite
    const limited = res.status === 429 || (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(e.reason));
    if(limited && attempt < 4){ await new Promise(function(r){ setTimeout(r, 1000 * Math.pow(2, attempt)); }); continue; }
    throw e;
  }
}
export function createCalendar(access, name){ return call(access, 'POST', '/calendars', { summary: name, timeZone: TZ }); }
export function renameCalendar(access, cal, name){ return call(access, 'PATCH', '/calendars/' + encodeURIComponent(cal), { summary: name }); }
export function deleteCalendar(access, cal){ return call(access, 'DELETE', '/calendars/' + encodeURIComponent(cal)); }

// Escribe un evento con su id fijo (fresh: nuevo, se crea; si no, se reescribe). Si el id ya existía
// en Google (p. ej. un evento borrado antes: Google guarda el id), se reescribe; si no estaba, se crea.
export async function putEvent(access, cal, id, body, fresh){
  const base = '/calendars/' + encodeURIComponent(cal) + '/events';
  const full = Object.assign({ id, status: 'confirmed' }, body);
  const put = function(){ return call(access, 'PUT', base + '/' + id, full); };
  const post = function(){ return call(access, 'POST', base, full); };
  if(fresh){
    try{ await post(); }catch(e){ if(e.status === 409){ await put(); } else { throw e; } }
  } else {
    try{ await put(); }catch(e){ if(e.status === 404){ await post(); } else { throw e; } }
  }
}
export async function removeEvent(access, cal, id){
  try{ await call(access, 'DELETE', '/calendars/' + encodeURIComponent(cal) + '/events/' + id); }
  catch(e){ if(e.status !== 404 && e.status !== 410){ throw e; } }
}
