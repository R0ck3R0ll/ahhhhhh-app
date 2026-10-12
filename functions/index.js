/* ================= FUNCIONES DEL SERVIDOR (Firebase Cloud Functions) =================
   readSchoolCalendar: lee el calendario escolar (archivo subido o enlace) con Gemini en Vertex AI
   y devuelve los festivos y días no lectivos. La App los enseña para revisarlos antes de guardarlos.

   - Gemini se usa en el propio proyecto de Google Cloud: no hay clave; la función entra con su
     cuenta de servicio (necesita el rol «Usuario de Vertex AI») y el gasto va a la facturación
     del proyecto. Con Vertex AI, Google no usa los datos para entrenar sus modelos.
   - El modelo se puede cambiar sin tocar el código con el parámetro GEMINI_MODEL (archivo
     functions/.env); por defecto, un Gemini Flash estable.
   - Solo la pueden usar personas con sesión iniciada que estén en algún plan, y como mucho
     DAILY_LIMIT veces al día cada una (para que nadie gaste a costa del proyecto). */

// Todas las fechas en hora de Madrid (los cálculos del plan usan la hora local, como la App)
process.env.TZ = 'Europe/Madrid';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { GoogleGenAI, ApiError } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import {
  ReadError, MAX_BYTES, fetchSource, toPart, SYSTEM, userPrompt, SCHEMA, cleanResult, cleanAnswers
} from './schoolcal.js';
import { TRACKED, parse, taskMap, diffTasks, diffItems, diffBlocks, mergeBlocks } from './planlog.js';
import { makePlan, minuteOf } from './plancore.js';
import { config, computeAlerts, newsAlert, dailySummary, weeklySummary } from './alerts.js';
import * as G from './gcal.js';
import { randomBytes } from 'node:crypto';

initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const GEMINI_MODEL = defineString('GEMINI_MODEL', { default: 'gemini-3.5-flash' });
const DAILY_LIMIT = 20;
let ai = null;
// Token de la cuenta de servicio para leer con la API de Drive los archivos compartidos por enlace
const driveAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
async function driveToken(){ return driveAuth.getAccessToken(); }
function gemini(){
  if(!ai){ ai = new GoogleGenAI({ enterprise: true, project: process.env.GCLOUD_PROJECT, location: 'global' }); }
  return ai;
}
async function checkUser(auth){
  if(!auth || !auth.token.email){ throw new HttpsError('unauthenticated', 'signIn'); }
  const email = auth.token.email.toLowerCase();
  const plans = await db.collection('plans').where('memberEmails', 'array-contains', email).limit(1).get();
  if(plans.empty){ throw new HttpsError('permission-denied', 'noPlan'); }
  // Contador por persona y día (usage/{uid}); la App no puede leerlo ni cambiarlo
  const ref = db.collection('usage').doc(auth.uid), day = new Date().toISOString().slice(0, 10);
  await db.runTransaction(async function(tx){
    const d = (await tx.get(ref)).data() || {};
    const n = d.day === day ? d.n || 0 : 0;
    if(n >= DAILY_LIMIT){ throw new HttpsError('resource-exhausted', 'limit'); }
    tx.set(ref, { day, n: n + 1 });
  });
}

// Lo que manda la App: { file: { name, type, data (base64) } } o { url }, más { lang, today, answers }
// (answers: lo que la familia ha respondido a preguntas anteriores de la IA, [{ q, a }])
async function loadSource(data){
  if(data.url){ return fetchSource(String(data.url), driveToken); }
  const f = data.file;
  if(!f || typeof f.data !== 'string'){ throw new ReadError('format'); }
  const buf = Buffer.from(f.data, 'base64');
  if(!buf.length){ throw new ReadError('empty'); }
  if(buf.length > MAX_BYTES){ throw new ReadError('tooBig'); }
  return { buf, type: String(f.type || '').toLowerCase(), name: String(f.name || '').slice(0, 120) };
}

export const readSchoolCalendar = onCall({
  region: 'europe-west1',
  timeoutSeconds: 300,
  memory: '512MiB',
  maxInstances: 3
}, async function(request){
  const data = request.data || {};
  await checkUser(request.auth);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(data.today) ? data.today : new Date().toISOString().slice(0, 10);
  const lang = String(data.lang || 'es');
  const answers = cleanAnswers(data.answers);

  let part;
  try{
    const src = await loadSource(data);
    part = await toPart(src.buf, src.type, src.name);
  } catch(e){
    if(e instanceof ReadError){
      logger.info('readSchoolCalendar: no se pudo leer', { code: e.code, detail: e.message });
      // El detalle (p. ej. «HTTP 403 drive.usercontent.google.com») va también a la App, para saber qué ha fallado
      throw new HttpsError('failed-precondition', e.code, { detail: e.message === e.code ? '' : e.message.slice(0, 200) });
    }
    throw e;
  }

  let res;
  try{
    res = await gemini().models.generateContent({
      model: GEMINI_MODEL.value(),
      contents: [{ role: 'user', parts: [part, { text: userPrompt({ lang, today, answers }) }] }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseJsonSchema: SCHEMA,
        maxOutputTokens: 16000
      }
    });
  } catch(e){
    const status = e instanceof ApiError ? e.status : 0;
    logger.error('readSchoolCalendar: error de Gemini', { status, message: String(e && e.message || e) });
    if(status === 429 || status >= 500){ throw new HttpsError('unavailable', 'busy'); }
    // API de Vertex AI sin activar, sin permiso o modelo inexistente: falta configurar el proyecto
    if(status === 401 || status === 403 || status === 404){ throw new HttpsError('failed-precondition', 'notReady'); }
    if(status === 400){ throw new HttpsError('failed-precondition', 'format'); }
    throw new HttpsError('internal', 'ai');
  }

  const cand = res.candidates && res.candidates[0];
  if(!cand || cand.finishReason !== 'STOP'){
    logger.warn('readSchoolCalendar: respuesta incompleta', { finish: cand && cand.finishReason, block: res.promptFeedback && res.promptFeedback.blockReason });
    throw new HttpsError('internal', 'ai');
  }
  const text = res.text || '';
  let out;
  try{ out = JSON.parse(text); }catch(e){ throw new HttpsError('internal', 'ai'); }
  const result = cleanResult(out, today, lang);
  logger.info('readSchoolCalendar: leído', { model: GEMINI_MODEL.value(), periods: result.periods.length, questions: result.questions.length, answers: answers.length, usage: res.usageMetadata });
  return result;
});

/* ================= HISTORIAL DEL PLAN (para la App de seguimiento) =================
   onPlanChange: cada vez que cambia un dato del plan (plans/{id}/kv/{clave}) compara el antes y el
   después (planlog.js) y escribe:
   - plans/{id}/log/{auto}: el historial (qué se creó, cambió, planificó, trabajó o eliminó y cuándo);
   - plans/{id}/archive/{clave de la tarea}: cada tarea con sus datos y sus bloques. Los bloques
     trabajados se quedan aunque la App de Martina los borre (al eliminar la tarea), y la tarea
     eliminada se queda con deletedAt: así las estadísticas no pierden nada.
   - plans/{id}/private/log: desde cuándo se lleva el historial. La primera vez se archiva todo lo
     que ya había (existedAt) y el historial empieza con «plan.tracked».
   Solo lo escribe el servidor (reglas): la App de Martina no cambia. La base de datos está en
   europe-southwest1 (Madrid) y el disparador va en la misma región. */
const LOG_REGION = 'europe-southwest1';

async function commitAll(ops){
  for(let i = 0; i < ops.length; i += 400){
    const batch = db.batch();
    ops.slice(i, i + 400).forEach(function(op){ batch.set(op[0], op[1], { merge: !!op[2] }); });
    await batch.commit();
  }
}
function archiveFields(snap){
  const o = { kind: snap.kind, name: snap.name, from: snap.from, due: snap.due, est: snap.est };
  if(snap.kind === 'activity'){ o.doneFor = snap.doneFor; o.doneAtFor = snap.doneAtFor; }
  else { o.done = snap.done; o.doneAt = snap.doneAt; }
  return o;
}

// Primera vez: se archiva lo que ya había. kvKey/beforeV: el dato que acaba de cambiar, con su valor anterior.
async function bootstrap(plan, kvKey, beforeV, at){
  const meta = plan.collection('private').doc('log');
  const first = await db.runTransaction(async function(tx){
    if((await tx.get(meta)).exists){ return false; }
    tx.create(meta, { since: at });
    return true;
  });
  if(!first){ return; }
  const values = {};
  for(const k of TRACKED){
    if(k === kvKey){ values[k] = beforeV; continue; }
    const d = await plan.collection('kv').doc(k).get();
    values[k] = d.exists ? d.data().v : null;
  }
  const blocks = {};
  parse(values['app-blocks']).forEach(function(b){ if(b && b.id && b.task){ (blocks[b.task] = blocks[b.task] || []).push(b); } });
  const ops = [];
  ['app-tasks', 'app-events', 'app-activities'].forEach(function(k){
    const m = taskMap(k, parse(values[k]));
    Object.keys(m).forEach(function(tk){
      ops.push([plan.collection('archive').doc(tk), Object.assign({ key: tk, existedAt: at, updatedAt: at, blocks: mergeBlocks([], { put: blocks[tk] || [], drop: [] }) }, archiveFields(m[tk]))]);
    });
  });
  ops.push([plan.collection('log').doc(), { type: 'plan.tracked', at }]);
  await commitAll(ops);
}

export const onPlanChange = onDocumentWritten({ document: 'plans/{planId}/kv/{key}', region: LOG_REGION }, async function(event){
  const kvKey = event.params.key;
  if(!TRACKED.includes(kvKey)){ return; }
  const plan = db.collection('plans').doc(event.params.planId);
  const before = event.data.before.exists ? event.data.before.data() : {};
  const after = event.data.after.exists ? event.data.after.data() : {};
  const at = after.at instanceof Timestamp ? after.at : Timestamp.fromDate(new Date(event.time));
  const by = after.by || null;
  await bootstrap(plan, kvKey, before.v, at);
  const B = parse(before.v), A = parse(after.v);
  const entries = [], ops = [];

  if(kvKey === 'app-blocks'){
    const d = diffBlocks(B, A);
    const keys = Object.keys(d.byTask).concat(d.entries.map(function(e){ return e.key; }));
    const names = {};
    for(const tk of keys.filter(function(k, i){ return keys.indexOf(k) === i; })){
      const ref = plan.collection('archive').doc(tk);
      await db.runTransaction(async function(tx){
        const cur = await tx.get(ref), data = cur.exists ? cur.data() : {};
        names[tk] = data.name || '';
        if(d.byTask[tk]){ tx.set(ref, { key: tk, blocks: mergeBlocks(data.blocks, d.byTask[tk]), updatedAt: at }, { merge: true }); }
      });
    }
    d.entries.forEach(function(e){ entries.push(Object.assign({ name: names[e.key] || '' }, e)); });
  } else {
    if(kvKey !== 'app-tasks'){ diffItems(kvKey, B, A).forEach(function(e){ entries.push(e); }); }
    const tb = taskMap(kvKey, B), ta = taskMap(kvKey, A);
    diffTasks(tb, ta).forEach(function(e){
      entries.push(e);
      const ref = plan.collection('archive').doc(e.key);
      if(e.type === 'task.deleted'){ ops.push([ref, { key: e.key, deletedAt: at, updatedAt: at }, true]); }
      else {
        const extra = e.type === 'task.created' ? { createdAt: at, deletedAt: null } : {};
        ops.push([ref, Object.assign({ key: e.key, updatedAt: at }, extra, archiveFields(ta[e.key])), true]);
      }
    });
  }
  // Id fijo por evento: si el disparador se repite, no se duplica
  entries.forEach(function(e, i){ ops.push([plan.collection('log').doc(event.id + '-' + i), Object.assign({ at, by, src: kvKey }, e)]); });
  if(ops.length){ await commitAll(ops); }
  // Novedades para los supervisores: tarea nueva, evento nuevo, entrega cambiada
  const news = entries.map(function(e, i){ const a = newsAlert(e); return a && Object.assign(a, { key: 'news|' + event.id + '-' + i }); }).filter(Boolean);
  if(news.length){
    const pd = await plan.get();
    for(const v of await viewersOf(pd.data() || {})){
      if(!v.cfg.news){ continue; }
      for(const a of news){ await deliverOnce(plan, v, a); }
    }
  }
});

/* ================= AVISOS Y RESÚMENES PARA EL SUPERVISOR =================
   - checkAlerts (cada 15 min): alerts.js dice qué avisos tocan para cada supervisor de cada plan; los
     nuevos se guardan en users/{uid}/alerts (la campana de la App) y se envían a sus móviles
     (users/{uid}/devices, notificaciones de Firebase Cloud Messaging).
   - plans/{id}/sent/{uid|clave}: avisos ya enviados, para no repetirlos. La primera vez que un
     supervisor tiene avisos (users/{uid}.alertsSince) se dan por enviados los que ya tocaban: así no
     le llega de golpe todo lo atrasado.
   - Resúmenes: cada día a las 22:00 y el domingo a las 22:01 (la semana que viene).
   - Configuración de cada supervisor en users/{uid}.alerts (Config de la App de seguimiento). */
const ALERT_REGION = 'europe-west1';

async function loadKv(plan){
  const kv = {};
  (await plan.collection('kv').get()).forEach(function(d){ kv[d.id] = d.data().v; });
  return kv;
}
// Supervisores del plan: { email, uid, cfg, user (ref), since }
async function viewersOf(planData){
  const out = [];
  for(const email of planData.viewerEmails || []){
    let uid = null;
    try{ uid = (await getAuth().getUserByEmail(email)).uid; }catch(e){ continue; }   // aún no ha entrado nunca
    const ref = db.collection('users').doc(uid), u = (await ref.get()).data() || {};
    out.push({ email, uid, ref, cfg: config(u.alerts), since: u.alertsSince || null });
  }
  return out;
}
function sentId(uid, key){ return (uid + '|' + key).replace(/\//g, '_').slice(0, 1400); }
// Guarda el aviso en la campana y lo envía a los móviles del supervisor
async function deliver(plan, v, a){
  await v.ref.collection('alerts').add({ plan: plan.id, type: a.type, title: a.title, body: a.body, open: a.open || '', level: a.level || null, at: new Date() });
  await pushTo(v.ref, a);
}
// Notificación a todos los móviles de un usuario (users/{uid}/devices)
async function pushTo(userRef, a){
  const devs = await userRef.collection('devices').get();
  if(devs.empty){ return; }
  const tokens = devs.docs.map(function(d){ return d.data().token; }).filter(Boolean);
  if(!tokens.length){ return; }
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: { title: a.title, body: a.body, open: a.open || '', tag: a.type },
    webpush: { headers: { Urgency: 'high', TTL: '86400' } }
  });
  // Los móviles que ya no reciben (App desinstalada, permiso quitado…) se borran
  res.responses.forEach(function(r, i){
    const code = r.error && r.error.code;
    if(code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token'){
      devs.docs.filter(function(d){ return d.data().token === tokens[i]; }).forEach(function(d){ d.ref.delete().catch(function(){}); });
    }
  });
}
// Solo si no se envió ya (con transacción: si dos ejecuciones coinciden, solo una lo envía)
async function deliverOnce(plan, v, a){
  const ref = plan.collection('sent').doc(sentId(v.uid, a.key));
  const fresh = await db.runTransaction(async function(tx){
    if((await tx.get(ref)).exists){ return false; }
    tx.create(ref, { at: new Date() });
    return true;
  });
  if(fresh){ await deliver(plan, v, a); }
  for(const k of a.silent || []){ await plan.collection('sent').doc(sentId(v.uid, k)).set({ at: new Date(), silent: true }); }
}
async function plansWithViewers(){
  const out = [];
  (await db.collection('plans').get()).forEach(function(d){ if((d.data().viewerEmails || []).length){ out.push(d); } });
  return out;
}

export const checkAlerts = onSchedule({ schedule: 'every 15 minutes', region: ALERT_REGION, timeZone: 'Europe/Madrid' }, async function(){
  const now = minuteOf(new Date());
  for(const pd of await plansWithViewers()){
    const plan = pd.ref, P = makePlan(await loadKv(plan));
    for(const v of await viewersOf(pd.data())){
      const list = computeAlerts(P, now, v.cfg);
      if(!v.since){
        // Primera vez: lo que ya tocaba se da por enviado
        const ops = [];
        list.forEach(function(a){ [a.key].concat(a.silent || []).forEach(function(k){ ops.push([plan.collection('sent').doc(sentId(v.uid, k)), { at: now, baseline: true }]); }); });
        ops.push([v.ref, { alertsSince: now }, true]);
        await commitAll(ops);
        continue;
      }
      for(const a of list){
        try{ await deliverOnce(plan, v, a); }catch(e){ logger.error('checkAlerts: envío', { plan: plan.id, key: a.key, error: String(e) }); }
      }
    }
  }
});

async function sendSummary(kind){
  const now = minuteOf(new Date()), day = now.toISOString().slice(0, 10);
  for(const pd of await plansWithViewers()){
    const plan = pd.ref, P = makePlan(await loadKv(plan));
    const s = kind === 'daily' ? dailySummary(P, now) : weeklySummary(P, now);
    for(const v of await viewersOf(pd.data())){
      if(!v.cfg[kind]){ continue; }
      try{ await deliverOnce(plan, v, Object.assign({ type: kind, key: kind + '|' + day }, s)); }
      catch(e){ logger.error('resumen', { plan: plan.id, kind, error: String(e) }); }
    }
  }
}
/* ================= MENSAJES (supervisor → quien usa la App) =================
   plans/{id}/messages/{id}: el supervisor escribe { text, taskKey?, … }; quien usa la App lo ve como
   aviso emergente (o notificación, con la App cerrada) y responde «OK» o con un texto.
   onMessage: mensaje nuevo → notificación a los miembros del plan; respuesta → notificación y aviso
   en la campana del supervisor que lo envió. */
export const onMessage = onDocumentWritten({ document: 'plans/{planId}/messages/{msgId}', region: LOG_REGION }, async function(event){
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if(!after){ return; }
  const plan = db.collection('plans').doc(event.params.planId);
  const short = function(t){ t = String(t || ''); return t.length > 160 ? t.slice(0, 157) + '…' : t; };
  if(!before){
    const pd = (await plan.get()).data() || {};
    for(const email of pd.memberEmails || []){
      let uid = null;
      try{ uid = (await getAuth().getUserByEmail(email)).uid; }catch(e){ continue; }
      await pushTo(db.collection('users').doc(uid), { type: 'message', title: 'Mensaje de ' + (after.fromName || after.fromEmail || 'tu supervisor'),
        body: (after.taskName ? '«' + after.taskName + '»: ' : '') + short(after.text), open: 'msg:' + event.params.msgId }).catch(function(e){ logger.error('onMessage: envío', String(e)); });
    }
    return;
  }
  if(!before.reply && after.reply && after.from){
    const r = after.reply, body = (r.text ? short(r.text) : 'OK') + ' · a «' + short(after.text).slice(0, 60) + '»';
    const user = db.collection('users').doc(after.from);
    const kid = (await plan.collection('kv').doc('kid-name').get()).data();
    const title = kid && kid.v ? 'Respuesta de ' + kid.v : 'Respuesta a tu mensaje';
    await user.collection('alerts').add({ plan: plan.id, type: 'reply', title, body, open: 'msgs', at: new Date() }).catch(function(){});
    await pushTo(user, { type: 'reply', title, body, open: 'msgs' }).catch(function(e){ logger.error('onMessage: respuesta', String(e)); });
  }
});

export const dailySummaryJob = onSchedule({ schedule: '0 22 * * *', region: ALERT_REGION, timeZone: 'Europe/Madrid' }, function(){ return sendSummary('daily'); });
export const weeklySummaryJob = onSchedule({ schedule: '1 22 * * 0', region: ALERT_REGION, timeZone: 'Europe/Madrid' }, function(){ return sendSummary('weekly'); });

/* ================= EXPORTACIÓN A GOOGLE CALENDAR (gcal.js) =================
   Cada conexión es de un plan y de una persona: la de quien usa la App (una por plan, con los ajustes
   de su Config: app-settings) o la de cada supervisor (con sus propios ajustes: users/{uid}.gcal =
   { exportOn, exportCats, leaveAlert }). Cada una tiene su cuenta de Google y su calendario.
   - gcalStart (la App): devuelve la dirección de la pantalla de permiso de Google; ahí se elige la
     cuenta (p. ej. una Gmail personal: las del colegio están bloqueadas).
   - gcalCallback: Google vuelve aquí con el código; se guarda el permiso (refresh token), se crea el
     calendario «AHHHHHH · nombre» y se vuelve a la App con ?gcal=ok (o el motivo del fallo).
   - Piden una sincronización (requestSync): gcalSyncNow (la App, al volver), los cambios del plan
     (gcalOnKv), los tiempos de trayecto de hoy que publica el móvil (gcalOnLeave), los ajustes del
     supervisor (gcalOnUser) y una pasada cada hora (gcalSweep, que avanza las semanas). Solo se
     escribe en Google lo que ha cambiado.
   - gcalStop (la App): desconecta, borra el calendario de la App en Google y retira el permiso.
   Datos: plans/{id}/private/gcal o gcal-{uid} (permiso, calendario y lo ya escrito; solo el servidor)
   y plans/{id}/gcal/status o status-{uid} (lo que ve la App: conectado, cuenta, sincronización, error).
   El ID y el secreto del cliente OAuth de Google van en GCAL_CLIENT_ID y GCAL_CLIENT_SECRET (los
   escribe el flujo de publicación a partir de los secretos de GitHub del mismo nombre). */
// Se leen tal cual del entorno (no como parámetros de Firebase): así, mientras no estén, las funciones
// se publican igual y la exportación dice que aún no está preparada
const GCAL_CLIENT_ID = { value: function(){ return process.env.GCAL_CLIENT_ID || ''; } };
const GCAL_CLIENT_SECRET = { value: function(){ return process.env.GCAL_CLIENT_SECRET || ''; } };
const GCAL_REGION = 'europe-west1';
const GCAL_REDIRECT = 'https://' + GCAL_REGION + '-ahhhhhh-today.cloudfunctions.net/gcalCallback';
const APP_URL = 'https://ahhhhhh-today.web.app/';
const GCAL_KEYS = ['app-tasks', 'app-events', 'app-activities', 'app-settings', 'kid-name'];
const GCAL_LOCK_MS = 5 * 60000, GCAL_MAX_OPS = 300;

function gcalReady(){ return !!(GCAL_CLIENT_ID.value() && GCAL_CLIENT_SECRET.value()); }
// Conexión: { plan, who } (who: '' quien usa la App; el uid de un supervisor)
function gcalPrivate(c){ return c.plan.collection('private').doc(c.who ? 'gcal-' + c.who : 'gcal'); }
function gcalStatus(c){ return c.plan.collection('gcal').doc(c.who ? 'status-' + c.who : 'status'); }
function gcalTag(c){ return c.plan.id + (c.who ? '|' + c.who : ''); }
// Conexión de quien llama: el plan con el que entra la App (users/{uid}.planId), como miembro o como
// supervisor. Así no cuenta un plan antiguo en el que solo esté esa persona (ver sync.js, connect).
async function callerConn(auth){
  if(!auth || !auth.token.email){ throw new HttpsError('unauthenticated', 'signIn'); }
  const email = auth.token.email.toLowerCase();
  const planId = ((await db.collection('users').doc(auth.uid).get()).data() || {}).planId;
  if(planId){
    const pd = await db.collection('plans').doc(planId).get(), d = pd.exists ? pd.data() : {};
    if((d.memberEmails || []).includes(email)){ return { plan: pd.ref, who: '' }; }
    if((d.viewerEmails || []).includes(email)){ return { plan: pd.ref, who: auth.uid }; }
  }
  throw new HttpsError('permission-denied', 'noPlan');
}
// Conexiones de un plan
async function connsOf(plan){
  return (await plan.collection('private').get()).docs
    .filter(function(d){ return d.id === 'gcal' || d.id.indexOf('gcal-') === 0; })
    .map(function(d){ return { plan, who: d.id === 'gcal' ? '' : d.id.slice(5) }; });
}
async function settingsOf(c, kv){
  if(c.who){ return ((await db.collection('users').doc(c.who).get()).data() || {}).gcal || {}; }
  try{ return JSON.parse(kv['app-settings'] || '{}') || {}; }catch(e){ return {}; }
}
async function setStatus(c, data){ await gcalStatus(c).set(Object.assign({ at: new Date() }, data), { merge: true }); }
// Sin permiso o sin calendario: se olvida la conexión (la App lo explica y deja volver a conectar)
async function dropConnection(c, reason){
  // Ya desconectado a mano (gcalStop) mientras se sincronizaba: no se cambia nada
  if(!(await gcalPrivate(c).get()).exists){ return; }
  await gcalPrivate(c).delete().catch(function(){});
  await gcalStatus(c).set({ connected: false, state: 'off', error: reason, email: null, at: new Date() });
}
function gone(e){ return e instanceof G.GoogleError && (e.status === 404 || e.status === 410); }
function revoked(e){ return e instanceof G.GoogleError && (e.reason === 'invalid_grant' || e.status === 401); }

export const gcalStart = onCall({ region: GCAL_REGION }, async function(request){
  const c = await callerConn(request.auth);
  if(!gcalReady()){ throw new HttpsError('failed-precondition', 'notReady'); }
  const state = randomBytes(24).toString('hex');
  await db.collection('gcalStates').doc(state).set({ uid: request.auth.uid, plan: c.plan.id, who: c.who, lang: String((request.data || {}).lang || 'es').slice(0, 5), at: new Date() });
  return { url: G.authUrl(GCAL_CLIENT_ID.value(), GCAL_REDIRECT, state) };
});

export const gcalCallback = onRequest({ region: GCAL_REGION, timeoutSeconds: 120 }, async function(req, res){
  const back = function(code){ res.redirect(302, APP_URL + '?gcal=' + code); };
  try{
    const q = req.query || {};
    const sref = q.state ? db.collection('gcalStates').doc(String(q.state).slice(0, 100)) : null;
    const st = sref ? await sref.get() : null;
    if(sref){ await sref.delete().catch(function(){}); }
    if(!st || !st.exists || Date.now() - st.data().at.toDate().getTime() > 30 * 60000){ return back('expired'); }
    if(q.error || !q.code){ return back(q.error === 'access_denied' ? 'denied' : 'error'); }
    const s = st.data(), c = { plan: db.collection('plans').doc(s.plan), who: s.who || '' };
    const tok = await G.exchangeCode(GCAL_CLIENT_ID.value(), GCAL_CLIENT_SECRET.value(), GCAL_REDIRECT, String(q.code));
    // En la pantalla de Google se puede desmarcar el permiso del calendario
    if(tok.scopes.indexOf(G.SCOPE) < 0 || !tok.refresh){ await G.revoke(tok.refresh || tok.access); return back('scope'); }
    const prev = (await gcalPrivate(c).get()).data() || null;
    // La misma cuenta que antes: se sigue con su calendario (si aún existe)
    let calendarId = prev && prev.email === tok.email ? prev.calendarId : null, map = {};
    if(calendarId){
      try{ await G.call(tok.access, 'GET', '/calendars/' + encodeURIComponent(calendarId)); map = prev.map || {}; }
      catch(e){ if(!gone(e)){ throw e; } calendarId = null; }
    }
    if(prev && prev.refresh && prev.refresh !== tok.refresh){ await G.revoke(prev.refresh); }
    const kid = (await c.plan.collection('kv').doc('kid-name').get()).data();
    const name = G.calendarName(kid && kid.v || '');
    if(!calendarId){ calendarId = (await G.createCalendar(tok.access, name)).id; }
    await gcalPrivate(c).set({ refresh: tok.refresh, email: tok.email, calendarId, calName: name, lang: s.lang, by: s.uid, connectedAt: new Date(), map, dirty: Date.now(), lockUntil: 0 });
    await gcalStatus(c).set({ connected: true, email: tok.email, state: 'pending', error: null, syncedAt: null, count: 0, at: new Date() });
    logger.info('gcalCallback: conectado', { plan: c.plan.id, supervisor: !!c.who });
    back('ok');
  } catch(e){
    logger.error('gcalCallback', { error: String(e && e.message || e), status: e && e.status, reason: e && e.reason });
    back('error');
  }
});

// Escribe en Google lo que ha cambiado. Devuelve true si quedan cosas por hacer (más de GCAL_MAX_OPS).
async function syncOnce(c){
  const ref = gcalPrivate(c), snap = await ref.get();
  if(!snap.exists || !snap.data().refresh){ return false; }
  const d = snap.data(), kv = await loadKv(c.plan), settings = await settingsOf(c, kv);
  if(settings.exportOn !== true){ await setStatus(c, { connected: true, email: d.email, state: 'paused', error: null }); return false; }
  let access;
  try{ access = await G.accessToken(GCAL_CLIENT_ID.value(), GCAL_CLIENT_SECRET.value(), d.refresh); }
  catch(e){ if(revoked(e)){ await dropConnection(c, 'revoked'); return false; } throw e; }
  const now = minuteOf(new Date()), cal = d.calendarId, tag = gcalTag(c);
  try{
    const name = G.calendarName(kv['kid-name'] || '');
    if(name !== d.calName){ await G.renameCalendar(access, cal, name); await ref.update({ calName: name }); }
    const leave = (await c.plan.collection('gcal').doc('leave').get()).data() || null;
    const want = G.desiredEvents(kv, leave, now, d.lang, settings);
    const ops = G.planSync(d.map || {}, want, now), map = Object.assign({}, d.map || {});
    let failed = 0, done = 0;
    for(const o of ops){
      if(done >= GCAL_MAX_OPS){ break; }
      if(o.op === 'forget'){ delete map[o.key]; continue; }
      done++;
      try{
        if(o.op === 'delete'){ await G.removeEvent(access, cal, G.eventId(tag, o.key)); delete map[o.key]; }
        else { await G.putEvent(access, cal, G.eventId(tag, o.key), want[o.key].body, o.op === 'insert'); map[o.key] = { h: o.h, d: o.d }; }
      } catch(e){
        if(gone(e) || revoked(e)){ throw e; }
        failed++;
        logger.warn('gcal: evento', { plan: c.plan.id, key: o.key, status: e.status, reason: e.reason, error: String(e.message || e) });
      }
    }
    if(ops.length){ await ref.update({ map, syncedAt: new Date() }); }
    await setStatus(c, { connected: true, email: d.email, state: failed ? 'partial' : 'ok', error: null, syncedAt: new Date(), count: Object.keys(map).length });
    return done >= GCAL_MAX_OPS;
  } catch(e){
    // Calendario borrado en Google o permiso retirado: se desconecta
    if(gone(e)){ await G.revoke(d.refresh); await dropConnection(c, 'gone'); return false; }
    if(revoked(e)){ await dropConnection(c, 'revoked'); return false; }
    throw e;
  }
}

/* Pide una sincronización. Si ya hay una en marcha (lockUntil), solo lo apunta (dirty) y la que está
   en marcha vuelve a empezar al acabar: así nunca hay dos a la vez escribiendo en Google. */
async function requestSync(c){
  const ref = gcalPrivate(c), mark = Date.now();
  const go = await db.runTransaction(async function(tx){
    const s = await tx.get(ref);
    if(!s.exists || !s.data().refresh){ return false; }
    if((s.data().lockUntil || 0) > Date.now()){ tx.update(ref, { dirty: mark }); return false; }
    tx.update(ref, { dirty: mark, lockUntil: Date.now() + GCAL_LOCK_MS });
    return true;
  });
  if(!go){ return; }
  for(let round = 0; round < 4; round++){
    const started = Date.now();
    let more = false;
    try{ more = await syncOnce(c); }
    catch(e){
      logger.error('gcal: sincronización', { plan: c.plan.id, status: e && e.status, reason: e && e.reason, error: String(e && e.message || e) });
      // (si mientras tanto se ha desconectado, el estado se queda como está)
      if((await ref.get()).exists){ await setStatus(c, { state: 'partial', error: 'sync' }).catch(function(){}); }
    }
    const again = await db.runTransaction(async function(tx){
      const s = await tx.get(ref);
      if(!s.exists){ return false; }
      const next = round < 3 && (more || (s.data().dirty || 0) > started);
      tx.update(ref, { lockUntil: next ? Date.now() + GCAL_LOCK_MS : 0 });
      return next;
    });
    if(!again){ return; }
  }
}
// Todas las conexiones del plan (quien usa la App y los supervisores)
async function requestPlanSync(plan){
  for(const c of await connsOf(plan)){
    try{ await requestSync(c); }catch(e){ logger.error('gcal: plan', { plan: plan.id, error: String(e) }); }
  }
}

export const gcalSyncNow = onCall({ region: GCAL_REGION, timeoutSeconds: 300 }, async function(request){
  const c = await callerConn(request.auth);
  await requestSync(c);
  return (await gcalStatus(c).get()).data() || { connected: false };
});

export const gcalStop = onCall({ region: GCAL_REGION, timeoutSeconds: 120 }, async function(request){
  const c = await callerConn(request.auth);
  const d = (await gcalPrivate(c).get()).data();
  await gcalPrivate(c).delete();
  if(d && d.refresh && gcalReady()){
    try{
      const access = await G.accessToken(GCAL_CLIENT_ID.value(), GCAL_CLIENT_SECRET.value(), d.refresh);
      if(d.calendarId){ await G.deleteCalendar(access, d.calendarId).catch(function(e){ if(!gone(e)){ throw e; } }); }
    } catch(e){ logger.warn('gcalStop: no se pudo borrar el calendario', { plan: c.plan.id, error: String(e && e.message || e) }); }
    await G.revoke(d.refresh);
  }
  await gcalStatus(c).set({ connected: false, state: 'off', error: null, email: null, at: new Date() });
  return { ok: true };
});

export const gcalOnKv = onDocumentWritten({ document: 'plans/{planId}/kv/{key}', region: LOG_REGION, timeoutSeconds: 300 }, async function(event){
  if(!GCAL_KEYS.includes(event.params.key)){ return; }
  await requestPlanSync(db.collection('plans').doc(event.params.planId));
});
export const gcalOnLeave = onDocumentWritten({ document: 'plans/{planId}/gcal/leave', region: LOG_REGION, timeoutSeconds: 300 }, async function(event){
  await requestPlanSync(db.collection('plans').doc(event.params.planId));
});
// Ajustes de exportación de un supervisor (Config de la App de seguimiento)
export const gcalOnUser = onDocumentWritten({ document: 'users/{uid}', region: LOG_REGION, timeoutSeconds: 300 }, async function(event){
  const b = event.data.before.exists ? event.data.before.data().gcal : null;
  const a = event.data.after.exists ? event.data.after.data().gcal : null;
  if(JSON.stringify(b || null) === JSON.stringify(a || null)){ return; }
  const planId = event.data.after.exists ? event.data.after.data().planId : null;
  // Si no hay conexión de este supervisor en ese plan, requestSync no hace nada
  if(planId){ await requestSync({ plan: db.collection('plans').doc(planId), who: event.params.uid }); }
});
// Cada hora: avanza las semanas que se exportan y recoge lo que haya fallado
export const gcalSweep = onSchedule({ schedule: 'every 60 minutes', region: GCAL_REGION, timeZone: 'Europe/Madrid', timeoutSeconds: 540 }, async function(){
  for(const pd of (await db.collection('plans').get()).docs){ await requestPlanSync(pd.ref); }
  // Permisos empezados y no terminados
  const old = await db.collection('gcalStates').where('at', '<', new Date(Date.now() - 60 * 60000)).get();
  for(const s of old.docs){ await s.ref.delete().catch(function(){}); }
});
