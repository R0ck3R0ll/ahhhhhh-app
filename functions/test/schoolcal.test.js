import test from 'node:test';
import assert from 'node:assert/strict';
import {
  downloadUrl, driveId, fetchDrive, fetchSource, isPublicIp, fetchUrl, toPart, htmlToText, cleanResult, cleanAnswers, userPrompt, ReadError, MAX_BYTES
} from '../schoolcal.js';

test('enlaces de Drive y Docs pasan a su dirección de descarga', function(){
  assert.equal(downloadUrl('https://drive.google.com/file/d/AbC_12-x/view?usp=sharing'),
    'https://drive.google.com/uc?export=download&id=AbC_12-x');
  assert.equal(downloadUrl('https://drive.google.com/open?id=XYZ'),
    'https://drive.google.com/uc?export=download&id=XYZ');
  assert.equal(downloadUrl('https://docs.google.com/document/d/D0c/edit#heading=h.1'),
    'https://docs.google.com/document/d/D0c/export?format=pdf');
  assert.equal(downloadUrl('https://docs.google.com/spreadsheets/d/Sh33t/edit'),
    'https://docs.google.com/spreadsheets/d/Sh33t/export?format=pdf');
  assert.equal(downloadUrl('https://colegio.es/calendario.pdf'), 'https://colegio.es/calendario.pdf');
});

test('solo direcciones públicas', function(){
  ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.20.1.1', '192.168.1.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '0.0.0.0']
    .forEach(function(ip){ assert.equal(isPublicIp(ip), false, ip); });
  ['8.8.8.8', '142.250.184.14', '2a00:1450:4003:80e::200e'].forEach(function(ip){ assert.equal(isPublicIp(ip), true, ip); });
});

test('fetchUrl rechaza la red interna y sigue redirecciones comprobando cada salto', async function(){
  await assert.rejects(fetchUrl('http://169.254.169.254/computeMetadata/v1/'), function(e){ return e instanceof ReadError && e.code === 'badUrl'; });
  await assert.rejects(fetchUrl('file:///etc/passwd'), function(e){ return e.code === 'badUrl'; });
  const calls = [];
  const fake = async function(url){
    calls.push(url);
    if(url === 'https://8.8.8.8/a'){ return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }); }
    return new Response('x');
  };
  await assert.rejects(fetchUrl('https://8.8.8.8/a', fake), function(e){ return e.code === 'badUrl'; });
  assert.deepEqual(calls, ['https://8.8.8.8/a']);
});

test('fetchUrl: archivo privado, demasiado grande y correcto', async function(){
  await assert.rejects(fetchUrl('https://8.8.8.8/p', async function(){ return new Response('no', { status: 403 }); }), function(e){ return e.code === 'private'; });
  await assert.rejects(fetchUrl('https://8.8.8.8/b', async function(){
    return new Response('x', { headers: { 'content-length': String(MAX_BYTES + 1) } });
  }), function(e){ return e.code === 'tooBig'; });
  const r = await fetchUrl('https://8.8.8.8/cal.pdf', async function(){ return new Response('%PDF-1.4 hola', { headers: { 'content-type': 'application/pdf' } }); });
  assert.equal(r.type, 'application/pdf');
  assert.equal(r.name, 'cal.pdf');
});

test('toPart según el tipo de archivo', async function(){
  const pdf = await toPart(Buffer.from('%PDF-1.7 ...'), '', 'c.pdf');
  assert.equal(pdf.inlineData.mimeType, 'application/pdf');
  assert.equal(Buffer.from(pdf.inlineData.data, 'base64').toString(), '%PDF-1.7 ...');
  const png = await toPart(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), 'application/octet-stream', 'c.png');
  assert.equal(png.inlineData.mimeType, 'image/png');
  const html = await toPart(Buffer.from('<html><body><h1>Calendario 2026-2027</h1><p>8 de diciembre: festivo</p><script>x()</script></body></html>'), 'text/html', 'cal');
  assert.match(html.text, /8 de diciembre: festivo/);
  assert.doesNotMatch(html.text, /x\(\)/);
  await assert.rejects(toPart(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3, 4]), '', 'c.doc'), function(e){ return e.code === 'oldWord'; });
  await assert.rejects(toPart(Buffer.from('hola'), 'text/plain', 'c.txt'), function(e){ return e.code === 'empty'; });
  await assert.rejects(toPart(Buffer.from([0x50, 0x4b, 3, 4, 0, 0]), '', 'roto.docx'), function(e){ return e.code === 'format'; });
});

test('htmlToText', function(){
  assert.equal(htmlToText('<p>A&amp;B</p><p>C&#241;</p>'), 'A&B\nCñ');
});

test('cleanResult deja solo periodos válidos, ordenados y sin repetir', function(){
  const r = cleanResult({
    is_school_calendar: true, school_year: '2026-2027', notes: '',
    periods: [
      { from: '2026-12-22', to: '2027-01-07', name: 'Navidad' },
      { from: '2026-12-08', to: '2026-12-08', name: 'Inmaculada' },
      { from: '2026-12-08', to: '2026-12-08', name: 'Repetido' },
      { from: '2027-02-30', to: '2027-02-30', name: 'Fecha imposible' },
      { from: '2026-11-02', to: '2026-11-01', name: 'Al revés' },
      { from: '2026-06-20', to: '2026-12-31', name: 'Demasiado largo' },
      { from: '2031-01-01', to: '2031-01-01', name: 'Muy lejos' }
    ]
  }, '2026-10-07');
  assert.equal(r.isCalendar, true);
  assert.deepEqual(r.periods.map(function(p){ return p.from + '/' + p.to; }),
    ['2026-11-01/2026-11-02', '2026-12-08/2026-12-08', '2026-12-22/2027-01-07']);
  assert.deepEqual(cleanResult(null, '2026-10-07').periods, []);
});

test('driveId reconoce los enlaces de Drive y Docs', function(){
  assert.equal(driveId('https://drive.google.com/file/d/1AIlonipVQMMepGTFzdTcIgkYaVyEtU0f/view?usp=sharing'), '1AIlonipVQMMepGTFzdTcIgkYaVyEtU0f');
  assert.equal(driveId('https://drive.google.com/file/u/1/d/AbC/view'), 'AbC');
  assert.equal(driveId('https://drive.google.com/open?id=XYZ'), 'XYZ');
  assert.equal(driveId('https://docs.google.com/document/d/D0c/edit'), 'D0c');
  assert.equal(driveId('https://colegio.es/calendario.pdf'), null);
});

// Drive simulado: responde según la dirección pedida
function fakeDrive(routes, calls){
  return async function(url, opts){
    calls && calls.push({ url, auth: opts && opts.headers && opts.headers.authorization });
    for(const [re, fn] of routes){ if(re.test(url)){ return fn(url); } }
    return new Response('{}', { status: 500 });
  };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const token = async () => 'tok';

test('fetchDrive descarga un PDF compartido por enlace', async function(){
  const calls = [];
  const r = await fetchDrive('ID1', token, fakeDrive([
    [/files\/ID1\?supportsAllDrives=true&fields=/, () => json({ name: 'cal.pdf', mimeType: 'application/pdf', size: '20', capabilities: { canDownload: true } })],
    [/files\/ID1\?alt=media/, () => new Response('%PDF-1.4 x')]
  ], calls));
  assert.equal(r.type, 'application/pdf');
  assert.equal(r.name, 'cal.pdf');
  assert.equal(r.buf.toString(), '%PDF-1.4 x');
  assert.equal(calls[0].auth, 'Bearer tok');
});

test('fetchDrive exporta a PDF los documentos de Google', async function(){
  const r = await fetchDrive('DOC', token, fakeDrive([
    [/files\/DOC\?supportsAllDrives=true&fields=/, () => json({ name: 'Calendario', mimeType: 'application/vnd.google-apps.document' })],
    [/files\/DOC\/export\?mimeType=application\/pdf/, () => new Response('%PDF-1.7 doc')]
  ]));
  assert.equal(r.type, 'application/pdf');
});

test('fetchDrive: descarga desactivada y archivo no compartido', async function(){
  await assert.rejects(fetchDrive('NO', token, fakeDrive([
    [/fields=/, () => json({ name: 'c.pdf', mimeType: 'application/pdf', copyRequiresWriterPermission: true, capabilities: { canDownload: false } })]
  ])), function(e){ return e.code === 'noDownload'; });
  await assert.rejects(fetchDrive('NO2', token, fakeDrive([
    [/fields=/, () => json({ name: 'c.pdf', mimeType: 'application/pdf' })],
    [/alt=media/, () => json({ error: { errors: [{ reason: 'cannotDownloadFile' }], message: 'x' } }, 403)]
  ])), function(e){ return e.code === 'noDownload'; });
  await assert.rejects(fetchDrive('PRIV', token, fakeDrive([
    [/fields=/, () => json({ error: { errors: [{ reason: 'notFound' }], message: 'File not found' } }, 404)]
  ])), function(e){ return e.code === 'private' && /404/.test(e.message); });
});

test('fetchSource: si la API de Drive falla, prueba la descarga pública; sin Drive, descarga normal', async function(){
  // API de Drive sin activar (403 accessNotConfigured) y la descarga pública también rechazada
  await assert.rejects(fetchSource('https://drive.google.com/file/d/ID9/view', token, fakeDrive([
    [/googleapis\.com\/drive/, () => json({ error: { errors: [{ reason: 'accessNotConfigured' }], message: 'disabled' } }, 403)],
    [/drive\.google\.com\/uc/, () => new Response('no', { status: 403 })]
  ])), function(e){ return e.code === 'private' && /accessNotConfigured/.test(e.message) && /HTTP 403/.test(e.message); });
  // La descarga desactivada no se intenta por otro camino
  const calls = [];
  await assert.rejects(fetchSource('https://drive.google.com/file/d/ND/view', token, fakeDrive([
    [/fields=/, () => json({ copyRequiresWriterPermission: true })]
  ], calls)), function(e){ return e.code === 'noDownload'; });
  assert.equal(calls.length, 1);
});

test('cleanResult: con preguntas no devuelve periodos y limpia las opciones', function(){
  const r = cleanResult({
    is_school_calendar: true, school_year: '2026-2027', notes: '',
    periods: [{ from: '2026-12-08', to: '2026-12-08', name: 'Inmaculada' }],
    questions: [
      { question: '¿Qué sistema sigue la alumna?', options: ['British System', 'Sistema español', 'British System', ''] },
      { question: 'Sin opciones', options: ['solo una'] },
      { question: 'Q3', options: ['a', 'b'] }, { question: 'Q4', options: ['a', 'b'] }
    ]
  }, '2026-10-08');
  assert.deepEqual(r.questions[0], { question: '¿Qué sistema sigue la alumna?', options: ['British System', 'Sistema español'] });
  assert.equal(r.questions.length, 2);
  assert.deepEqual(r.periods, []);
  const sinPreguntas = cleanResult({ is_school_calendar: true, periods: [{ from: '2026-12-08', to: '2026-12-08', name: 'x' }], questions: [] }, '2026-10-08');
  assert.equal(sinPreguntas.periods.length, 1);
  assert.deepEqual(sinPreguntas.questions, []);
});

test('respuestas de la familia: se limpian y van en la petición', function(){
  const a = cleanAnswers([{ q: ' ¿Sistema? ', a: 'British System' }, { q: 'vacía', a: '' }, 'basura', null]);
  assert.deepEqual(a, [{ q: '¿Sistema?', a: 'British System' }]);
  assert.deepEqual(cleanAnswers('no es una lista'), []);
  const p = userPrompt({ lang: 'es', today: '2026-10-08', answers: a });
  assert.match(p, /¿Sistema\? → British System/);
  assert.doesNotMatch(userPrompt({ lang: 'es', today: '2026-10-08' }), /answers about the student/);
});
