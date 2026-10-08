/* ================= LECTURA DEL CALENDARIO ESCOLAR =================
   Lo que no depende de Firebase: conseguir el contenido (archivo subido o enlace), preparar la
   petición para Gemini y comprobar lo que devuelve. index.js lo usa desde la función del servidor.

   Formatos: PDF e imágenes van tal cual a Gemini; Word (.docx) se pasa a texto; de una página
   web se queda el texto. Los enlaces de Google Drive y Google Docs/Sheets se convierten en su
   dirección de descarga (el archivo tiene que estar compartido con «cualquier persona con el
   enlace»). */

import dns from 'node:dns/promises';
import net from 'node:net';
import mammoth from 'mammoth';

export const MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Error con un código que la App traduce (toast.read.<code>)
export class ReadError extends Error {
  constructor(code, detail){ super(detail || code); this.code = code; }
}

/* ---- Enlaces ---- */

// Drive / Docs / Sheets / Slides: la dirección que descarga el archivo en vez de la página de vista previa
export function downloadUrl(raw){
  const u = new URL(raw);
  const host = u.hostname.replace(/^www\./, '');
  if(host === 'drive.google.com'){
    const m = /\/file\/d\/([\w-]+)/.exec(u.pathname);
    const id = m ? m[1] : u.searchParams.get('id');
    if(id){ return 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id); }
  }
  if(host === 'docs.google.com'){
    const m = /^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/.exec(u.pathname);
    if(m){ return 'https://docs.google.com/' + m[1] + '/d/' + m[2] + '/export?format=pdf'; }
  }
  return u.href;
}

// Solo direcciones públicas: nada de la red interna del servidor
export function isPublicIp(ip){
  if(net.isIPv4(ip)){
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224);
  }
  const v = ip.toLowerCase();
  if(v.startsWith('::ffff:')){ return isPublicIp(v.slice(7)); }
  return !(v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') ||
    v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff'));
}

async function checkHost(u){
  if(u.protocol !== 'https:' && u.protocol !== 'http:'){ throw new ReadError('badUrl'); }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs;
  try{ addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }); }
  catch(e){ throw new ReadError('fetch', 'DNS ' + host); }
  if(!addrs.length || !addrs.every(function(a){ return isPublicIp(a.address); })){ throw new ReadError('badUrl'); }
}

// Descarga siguiendo las redirecciones a mano, para comprobar cada salto
export async function fetchUrl(raw, fetchImpl = fetch){
  let url = new URL(downloadUrl(raw));
  for(let hop = 0; hop < 6; hop++){
    await checkHost(url);
    let res;
    try{
      res = await fetchImpl(url.href, {
        redirect: 'manual',
        headers: { 'user-agent': 'Mozilla/5.0 (AHHHHHH Today; lectura del calendario escolar)' },
        signal: AbortSignal.timeout(30000)
      });
    } catch(e){ throw new ReadError('fetch', String(e && e.message || e)); }
    if(res.status >= 300 && res.status < 400 && res.headers.get('location')){
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if(res.status === 401 || res.status === 403){ throw new ReadError('private'); }
    if(!res.ok){ throw new ReadError('fetch', 'HTTP ' + res.status); }
    const len = Number(res.headers.get('content-length') || 0);
    if(len > MAX_BYTES){ throw new ReadError('tooBig'); }
    const buf = Buffer.from(await res.arrayBuffer());
    if(buf.length > MAX_BYTES){ throw new ReadError('tooBig'); }
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    // Drive pide iniciar sesión si el archivo no está compartido: llega la página de acceso
    if(/(^|\.)accounts\.google\.com$/.test(url.hostname)){ throw new ReadError('private'); }
    return { buf, type, name: decodeURIComponent(url.pathname.split('/').pop() || '') };
  }
  throw new ReadError('fetch', 'demasiadas redirecciones');
}

/* ---- Contenido para Gemini ---- */

function sniff(buf){
  const h = buf.subarray(0, 12);
  if(h.subarray(0, 5).toString('latin1') === '%PDF-'){ return 'application/pdf'; }
  if(h[0] === 0xff && h[1] === 0xd8){ return 'image/jpeg'; }
  if(h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))){ return 'image/png'; }
  if(h.subarray(0, 4).toString('latin1') === 'GIF8'){ return 'image/gif'; }
  if(h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP'){ return 'image/webp'; }
  if(h[0] === 0x50 && h[1] === 0x4b){ return 'zip'; }                 // .docx es un zip
  if(h[0] === 0xd0 && h[1] === 0xcf && h[2] === 0x11 && h[3] === 0xe0){ return 'ole'; }   // .doc antiguo
  return '';
}

export function htmlToText(html){
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|table|section)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function(_, n){ return String.fromCodePoint(Number(n)); })
    .replace(/[ \t]+/g, ' ').replace(/ *\n\s*/g, '\n').trim();
}

// Parte de la petición a Gemini según lo que sea el archivo: PDF e imagen tal cual, el resto como texto
export async function toPart(buf, type, name){
  const kind = sniff(buf) || type;
  if(kind === 'application/pdf' || IMAGE_TYPES.includes(kind)){
    return { inlineData: { mimeType: kind, data: buf.toString('base64') } };
  }
  if(kind === 'ole'){ throw new ReadError('oldWord'); }
  if(kind === 'zip' || kind === DOCX){
    let text = '';
    try{ text = (await mammoth.extractRawText({ buffer: buf })).value; }catch(e){ throw new ReadError('format'); }
    return textPart(text, name);
  }
  if(/^text\/|html|xml|json/.test(type) || !kind){
    const raw = buf.toString('utf8');
    const text = /html/.test(type) || /<html|<body|<div/i.test(raw.slice(0, 4000)) ? htmlToText(raw) : raw;
    return textPart(text, name);
  }
  throw new ReadError('format');
}

function textPart(text, name){
  text = (text || '').trim();
  if(text.length < 20){ throw new ReadError('empty'); }
  // Una página o un documento enorme no es un calendario escolar: se queda lo primero
  if(text.length > 200000){ text = text.slice(0, 200000); }
  return { text: 'School calendar' + (name ? ' (' + name + ')' : '') + ':\n\n' + text };
}

/* ---- Lo que se pide a Gemini ---- */

export const LANG_NAMES = { es: 'Spanish', en: 'English', it: 'Italian', fr: 'French', de: 'German' };

export const SYSTEM = [
  'You read school calendars (Spain and elsewhere) for a family planning app.',
  'Find every day on which the student has no classes: public holidays, regional and local holidays,',
  'school holidays (Christmas, Easter, summer, etc.), "no lectivo" days, bridge days ("puentes"),',
  'teacher training days without students, and the period before the first and after the last day of',
  'classes when the calendar states those dates. Do not include ordinary weekends, half days with',
  'classes ("jornada intensiva", early finish), exams, events, or days that only affect other',
  'stages (e.g. only for Bachillerato or only for Infantil); if the calendar distinguishes stages, list',
  'only the days that apply to every stage and mention the stage-specific ones in notes.',
  'Merge consecutive days with the same reason into one period. Dates are ISO (YYYY-MM-DD).',
  'Work out the year of each date from the school year shown in the calendar; if the calendar does not',
  'show it, assume the school year that contains or starts after the reference date.',
  'Use colour legends carefully: in calendar images the colour or symbol of each day is what says',
  'whether it is a school day. When a date is ambiguous or unreadable, leave it out and say so in notes.',
  'If the file is not a school calendar, return no periods and explain in notes.'
].join(' ');

export function userPrompt({ lang, today }){
  return 'Reference date (today): ' + today + '.\n' +
    'Write the "name" of each period and the "notes" in ' + (LANG_NAMES[lang] || 'Spanish') + '. ' +
    'Keep names short (e.g. "Navidad", "Día de la Constitución"). ' +
    'List the days without classes in the attached school calendar.';
}

export const SCHEMA = {
  type: 'object',
  properties: {
    is_school_calendar: { type: 'boolean' },
    school_year: { type: 'string', description: 'For example "2026-2027"; empty if not shown' },
    periods: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'First day without classes, YYYY-MM-DD' },
          to: { type: 'string', description: 'Last day without classes, YYYY-MM-DD (same as from for a single day)' },
          name: { type: 'string' }
        },
        required: ['from', 'to', 'name']
      }
    },
    notes: { type: 'string', description: 'Anything the family should check by hand; empty if nothing' }
  },
  required: ['is_school_calendar', 'school_year', 'periods', 'notes']
};

/* ---- Comprobación de lo que devuelve Gemini ---- */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function validDate(s){
  if(!ISO.test(s)){ return false; }
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// Fechas válidas, en orden, sin periodos de más de 120 días (lo mismo que se permite a mano)
// y dentro de unos años alrededor de hoy
export function cleanResult(out, today){
  const y = Number(today.slice(0, 4));
  const periods = [];
  (out && Array.isArray(out.periods) ? out.periods : []).forEach(function(p){
    let from = String(p.from || ''), to = String(p.to || p.from || '');
    if(!validDate(from) || !validDate(to)){ return; }
    if(to < from){ const x = from; from = to; to = x; }
    const fy = Number(from.slice(0, 4));
    if(fy < y - 1 || fy > y + 2){ return; }
    if((Date.parse(to) - Date.parse(from)) / 864e5 >= 120){ return; }
    const name = String(p.name || '').trim().slice(0, 40);
    if(periods.some(function(q){ return q.from === from && q.to === to; })){ return; }
    periods.push({ from, to, name });
  });
  periods.sort(function(a, b){ return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; });
  return {
    isCalendar: !!(out && out.is_school_calendar),
    schoolYear: String(out && out.school_year || '').slice(0, 20),
    periods,
    notes: String(out && out.notes || '').slice(0, 600)
  };
}
