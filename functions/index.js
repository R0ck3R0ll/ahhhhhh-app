/* ================= FUNCIONES DEL SERVIDOR (Firebase Cloud Functions) =================
   readSchoolCalendar: lee el calendario escolar (archivo subido o enlace) con Claude y devuelve
   los festivos y días no lectivos. La App los enseña para revisarlos antes de guardarlos.

   - La clave de Anthropic está en Secret Manager (secreto ANTHROPIC_API_KEY); nunca llega al móvil.
   - Solo la pueden usar personas con sesión iniciada que estén en algún plan, y como mucho
     DAILY_LIMIT veces al día cada una (para que nadie gaste la clave). */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import {
  ReadError, MAX_BYTES, fetchUrl, toContentBlock, SYSTEM, userPrompt, SCHEMA, cleanResult
} from './schoolcal.js';

initializeApp();
const db = getFirestore();
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const DAILY_LIMIT = 20;

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

// Lo que manda la App: { file: { name, type, data (base64) } } o { url }, más { lang, today }
async function loadSource(data){
  if(data.url){ return fetchUrl(String(data.url)); }
  const f = data.file;
  if(!f || typeof f.data !== 'string'){ throw new ReadError('format'); }
  const buf = Buffer.from(f.data, 'base64');
  if(!buf.length){ throw new ReadError('empty'); }
  if(buf.length > MAX_BYTES){ throw new ReadError('tooBig'); }
  return { buf, type: String(f.type || '').toLowerCase(), name: String(f.name || '').slice(0, 120) };
}

export const readSchoolCalendar = onCall({
  region: 'europe-west1',
  secrets: [ANTHROPIC_API_KEY],
  timeoutSeconds: 300,
  memory: '512MiB',
  maxInstances: 3
}, async function(request){
  const data = request.data || {};
  await checkUser(request.auth);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(data.today) ? data.today : new Date().toISOString().slice(0, 10);
  const lang = String(data.lang || 'es');

  let block;
  try{
    const src = await loadSource(data);
    block = await toContentBlock(src.buf, src.type, src.name);
  } catch(e){
    if(e instanceof ReadError){
      logger.info('readSchoolCalendar: no se pudo leer', { code: e.code, detail: e.message });
      throw new HttpsError('failed-precondition', e.code);
    }
    throw e;
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  let res;
  try{
    res = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // Si el modelo rechaza la petición por error, la repite con el modelo de respaldo recomendado
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: [block, { type: 'text', text: userPrompt({ lang, today }) }] }]
    });
  } catch(e){
    logger.error('readSchoolCalendar: error de la API de Anthropic', { status: e && e.status, message: String(e && e.message || e) });
    if(e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && e.status >= 500)){
      throw new HttpsError('unavailable', 'busy');
    }
    if(e instanceof Anthropic.BadRequestError){ throw new HttpsError('failed-precondition', 'format'); }
    throw new HttpsError('internal', 'ai');
  }

  if(res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens'){
    logger.warn('readSchoolCalendar: respuesta incompleta', { stop: res.stop_reason });
    throw new HttpsError('internal', 'ai');
  }
  const text = res.content.filter(function(b){ return b.type === 'text'; }).map(function(b){ return b.text; }).join('');
  let out;
  try{ out = JSON.parse(text); }catch(e){ throw new HttpsError('internal', 'ai'); }
  const result = cleanResult(out, today);
  logger.info('readSchoolCalendar: leído', { periods: result.periods.length, usage: res.usage });
  return result;
});
