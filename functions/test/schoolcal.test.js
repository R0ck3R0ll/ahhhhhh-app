import test from 'node:test';
import assert from 'node:assert/strict';
import {
  downloadUrl, isPublicIp, fetchUrl, toPart, htmlToText, cleanResult, ReadError, MAX_BYTES
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
