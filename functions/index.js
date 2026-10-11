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
import { onCall, HttpsError } from 'firebase-functions/v2/https';
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
  const devs = await v.ref.collection('devices').get();
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
export const dailySummaryJob = onSchedule({ schedule: '0 22 * * *', region: ALERT_REGION, timeZone: 'Europe/Madrid' }, function(){ return sendSummary('daily'); });
export const weeklySummaryJob = onSchedule({ schedule: '1 22 * * 0', region: ALERT_REGION, timeZone: 'Europe/Madrid' }, function(){ return sendSummary('weekly'); });
