/* Service worker de AHHHHHH Today: guarda la App en el dispositivo para que abra al instante
   y funcione sin conexión. Estrategia: primero la red (así siempre se ve la última versión
   publicada) y, si no hay conexión, la copia guardada. Al publicar una versión nueva basta con
   cambiar VERSION para que se renueve la copia. */
var VERSION = 'v17';
var CACHE = 'ahhhhhh-' + VERSION;
var SHELL = [
  './', 'index.html', 'styles.css', 'i18n.js', 'app.js', 'sync.js', 'manifest.webmanifest',
  'assets/school-icon.png', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k.indexOf('ahhhhhh-') === 0 && k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET'){ return; }
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  // El inicio de sesión de Firebase (/__/) va siempre directo a la red
  if(sameOrigin && url.pathname.indexOf('/__/') === 0){ return; }
  var fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  // La biblioteca de Firebase (sync.js) también se guarda, para abrir la App sin conexión
  var firebaseLib = url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0;
  if(!sameOrigin && !fonts && !firebaseLib){ return; }
  e.respondWith(
    fetch(req).then(function(res){
      if(res && (res.ok || res.type === 'opaque')){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
      }
      return res;
    }).catch(function(){
      return caches.match(req, { ignoreSearch: true }).then(function(hit){ return hit || caches.match('index.html'); });
    })
  );
});
