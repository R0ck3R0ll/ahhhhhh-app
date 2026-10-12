/* ================= SINCRONIZACIÓN (Firebase) =================
   Inicio de sesión con Google y copia de los datos del plan en Firestore, para que estén a
   salvo y sean los mismos en todos los móviles del plan.

   - Un «plan» es lo que comparten varias personas (p. ej. Carlo y Martina): plans/{id}, con
     el dueño y los correos que pueden entrar (memberEmails). Quien inicia sesión sin plan crea
     uno y sube los datos que tenga el móvil; quien inicia sesión con un correo invitado entra en
     ese plan y recibe sus datos.
   - Los datos van por claves, igual que en el almacenamiento del navegador: cada clave
     compartida es un documento plans/{id}/kv/{clave} con su valor. Al cambiar en el móvil se
     sube; al cambiar en otro móvil llega aquí y la App se vuelve a cargar con los datos nuevos.
   - Supervisor (viewerEmails, p. ej. Carlo): ve el plan en modo supervisor, solo lectura. Recibe
     los datos igual que un miembro, pero nunca sube nada (las reglas tampoco se lo permiten).
     El rol se guarda en el móvil ('sync-role') para que la App abra ya en ese modo.
   - Sin sesión, la App funciona como siempre, solo en el móvil.
   La parte visible (Configuración > Cuenta) está en app.js: renderAccount() lee window.SYNC. */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, limit, getDocs, onSnapshot, orderBy, startAfter,
  serverTimestamp, arrayUnion, arrayRemove, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getMessaging, getToken, isSupported as messagingSupported } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';

// Datos compartidos del plan (la lista está en app.js). El idioma, el aspecto y los avisos ya vistos son de cada móvil.
const SHARED_KEYS = window.SHARED_KEYS;

// El inicio de sesión solo funciona en la dirección de Firebase (o en local, para probar)
const HOST = location.hostname;
const ON_FIREBASE = /(^|\.)ahhhhhh-today\.(web\.app|firebaseapp\.com)$/.test(HOST);
const ALLOWED = ON_FIREBASE || HOST === 'localhost' || HOST === '127.0.0.1';

const firebaseConfig = {
  apiKey: 'AIzaSyBCrWTanDxXjy6g0A15U8YXC7CpeXjMX_0',
  // En la propia dirección de la App: así el inicio de sesión funciona también en iPhone
  authDomain: ON_FIREBASE ? HOST : 'ahhhhhh-today.firebaseapp.com',
  projectId: 'ahhhhhh-today',
  storageBucket: 'ahhhhhh-today.firebasestorage.app',
  messagingSenderId: '356797407017',
  appId: '1:356797407017:web:87c75711f9350d5a152138'
};

// Estado que lee la App: status = 'unavailable' | 'loading' | 'out' | 'in'
const SYNC = window.SYNC = { status: ALLOWED ? 'loading' : 'unavailable', email: '', isOwner: false, members: [], viewers: [], owner: '', pendingOwner: '', role: '', error: '' };
// Rol en este móvil: si cambia (p. ej. el dueño pasa a alguien de miembro a supervisor), la App se recarga
function setRole(role){
  const was = localStorage.getItem('sync-role') || '';
  SYNC.role = role;
  if(role === 'viewer'){ localStorage.setItem('sync-role', 'viewer'); } else { localStorage.removeItem('sync-role'); }
  return was !== (role === 'viewer' ? 'viewer' : '');
}
function changed(){ if(typeof window.renderAccount === 'function'){ window.renderAccount(); } }

if(!ALLOWED){
  changed();
} else {
  start().catch(function(e){ SYNC.status = 'out'; SYNC.error = String(e && e.code || e); changed(); });
}

async function start(){
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

  let user = null, planId = null, unsubKv = null, unsubPlan = null;
  let applyingRemote = false, reloadPending = false;
  const pushQueue = new Set();
  let pushTimer = null;

  // ---- Cambios locales → nube ----
  const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  Storage.prototype.setItem = function(k, v){
    rawSet.call(this, k, v);
    if(this === window.localStorage && !applyingRemote && SHARED_KEYS.includes(k)){ queuePush(k); }
  };
  Storage.prototype.removeItem = function(k){
    rawRemove.call(this, k);
    if(this === window.localStorage && !applyingRemote && SHARED_KEYS.includes(k)){ queuePush(k); }
  };
  function queuePush(k){
    if(!planId || SYNC.role === 'viewer'){ return; }
    pushQueue.add(k);
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flushPush, 600);
  }
  async function flushPush(){
    if(!planId || !user || SYNC.role === 'viewer'){ return; }
    const keys = Array.from(pushQueue); pushQueue.clear();
    const batch = writeBatch(db);
    keys.forEach(function(k){
      batch.set(doc(db, 'plans', planId, 'kv', k), { v: localStorage.getItem(k), at: serverTimestamp(), by: user.uid });
    });
    try{ await batch.commit(); }catch(e){ SYNC.error = String(e.code || e); changed(); }
  }
  async function uploadAll(){
    const batch = writeBatch(db);
    SHARED_KEYS.forEach(function(k){
      const v = localStorage.getItem(k);
      if(v !== null){ batch.set(doc(db, 'plans', planId, 'kv', k), { v: v, at: serverTimestamp(), by: user.uid }); }
    });
    await batch.commit();
  }

  // ---- Nube → este móvil ----
  function applyRemote(k, v){
    if(localStorage.getItem(k) === v){ return false; }
    applyingRemote = true; window.SYNC_APPLYING = true;
    try{ if(v === null || v === undefined){ localStorage.removeItem(k); } else { localStorage.setItem(k, v); } }
    finally{ applyingRemote = false; window.SYNC_APPLYING = false; }
    return true;
  }
  // La App lee sus datos al abrirse: con datos nuevos de otro móvil se vuelve a cargar,
  // pero nunca con un formulario a medias ni con un diálogo abierto
  function scheduleReload(){
    reloadPending = true;
    tryReload();
  }
  function busy(){
    return !!document.querySelector('.screen.active form.evt-form:not([hidden])') || !!document.querySelector('dialog[open]');
  }
  // Freno: si la App se ha recargado 3 veces en el último minuto, no se recarga más (se avisa)
  function reloadLoop(){
    let list = [];
    try{ list = JSON.parse(sessionStorage.getItem('sync-reloads') || '[]'); }catch(e){}
    const now = Date.now();
    list = list.filter(function(x){ return now - x < 60000; });
    if(list.length >= 3){ return true; }
    list.push(now);
    try{ sessionStorage.setItem('sync-reloads', JSON.stringify(list)); }catch(e){}
    return false;
  }
  function tryReload(){
    if(!reloadPending){ return; }
    if(reloadLoop()){ reloadPending = false; SYNC.error = 'reload-loop'; changed(); return; }
    if(document.hidden){ location.reload(); return; }
    if(busy()){ setTimeout(tryReload, 3000); return; }
    if(typeof window.toast === 'function' && window.t){ window.toast(window.t('sync.updated')); }
    setTimeout(function(){ location.reload(); }, 900);
  }

  function listen(){
    if(unsubKv){ unsubKv(); }
    if(unsubPlan){ unsubPlan(); }
    unsubKv = onSnapshot(collection(db, 'plans', planId, 'kv'), function(snap){
      let any = false;
      snap.docChanges().forEach(function(ch){
        if(ch.doc.metadata.hasPendingWrites){ return; }   // es nuestro propio cambio
        const k = ch.doc.id;
        if(!SHARED_KEYS.includes(k)){ return; }
        // Un cambio de este móvil que aún no se ha subido gana: si no, al arrancar la App podría
        // rehacer un dato, recibir el del servidor encima, recargarse y volver a empezar sin fin
        if(pushQueue.has(k)){ return; }
        const v = ch.type === 'removed' ? null : ch.doc.data().v;
        if(applyRemote(k, v)){ any = true; }
      });
      if(any){ scheduleReload(); }
    }, function(e){ SYNC.error = String(e.code || e); changed(); });
    unsubPlan = onSnapshot(doc(db, 'plans', planId), function(snap){
      const d = snap.data() || {};
      SYNC.members = d.memberEmails || [];
      SYNC.viewers = d.viewerEmails || [];
      SYNC.owner = d.ownerEmail || '';
      SYNC.pendingOwner = d.pendingOwner || '';
      SYNC.isOwner = d.owner === (user && user.uid);
      // Si el dueño te quita del plan (o te cambia de miembro a supervisor), se vuelve a buscar el plan
      const me = user && user.email.toLowerCase();
      const list = SYNC.role === 'viewer' ? SYNC.viewers : SYNC.members;
      if(me && SYNC.members.length && !list.includes(me)){ leavePlan(); return; }
      changed();
    }, function(e){ SYNC.error = String(e.code || e); changed(); });
  }

  async function leavePlan(){
    if(unsubKv){ unsubKv(); unsubKv = null; }
    if(unsubPlan){ unsubPlan(); unsubPlan = null; }
    planId = null;
    if(user){ await setDoc(doc(db, 'users', user.uid), { planId: null }, { merge: true }); }
    // Si los datos de este móvil eran de un plan que ya no ve, se quitan
    if(SYNC.role === 'viewer'){ SHARED_KEYS.forEach(function(k){ applyRemote(k, null); }); }
    await connect();
  }

  // ---- Al iniciar sesión: buscar el plan (propio o invitado) o crear uno ----
  async function connect(){
    const email = user.email.toLowerCase();
    const me = await getDoc(doc(db, 'users', user.uid));
    planId = me.exists() ? me.data().planId : null;
    let role = 'member';
    if(planId){
      const p = await getDoc(doc(db, 'plans', planId)).catch(function(){ return null; });
      const d = p && p.exists() ? p.data() : {};
      if((d.memberEmails || []).includes(email)){
        role = 'member';
        // Plan en el que solo estoy yo (p. ej. el que creó una versión anterior de la App al pasar de
        // miembro a supervisor): si soy supervisor de otro plan, se usa ese
        if((d.memberEmails || []).length === 1 && !(d.viewerEmails || []).length){
          const sup = await getDocs(query(collection(db, 'plans'), where('viewerEmails', 'array-contains', email), limit(1))).catch(function(){ return null; });
          if(sup && !sup.empty){ planId = null; }
        }
      }
      else if((d.viewerEmails || []).includes(email)){ role = 'viewer'; }
      else { planId = null; }
    }
    if(!planId){
      // ¿Soy supervisor de algún plan? Entonces se ve ese plan (solo lectura)
      const sup = await getDocs(query(collection(db, 'plans'), where('viewerEmails', 'array-contains', email), limit(1)));
      if(!sup.empty){
        planId = sup.docs[0].id;
        await setDoc(doc(db, 'users', user.uid), { planId: planId }, { merge: true });
        setRole('viewer');
        const kv = await getDocs(collection(db, 'plans', planId, 'kv'));
        SHARED_KEYS.forEach(function(k){ applyRemote(k, null); });
        kv.forEach(function(s){ if(SHARED_KEYS.includes(s.id)){ applyRemote(s.id, s.data().v); } });
        location.reload();
        return;
      }
    }
    if(!planId){
      // ¿Alguien me ha invitado a su plan?
      const inv = await getDocs(query(collection(db, 'plans'), where('memberEmails', 'array-contains', email), limit(1)));
      if(!inv.empty){
        const p = inv.docs[0], d = p.data();
        const hasLocal = SHARED_KEYS.some(function(k){ return localStorage.getItem(k) !== null; });
        if(hasLocal && !window.confirm(window.t('sync.joinConfirm', { owner: d.ownerEmail || '' }))){
          await signOut(auth);
          return;
        }
        planId = p.id;
        await setDoc(doc(db, 'users', user.uid), { planId: planId }, { merge: true });
        setRole('member');
        // Los datos del plan sustituyen a los de este móvil
        const kv = await getDocs(collection(db, 'plans', planId, 'kv'));
        SHARED_KEYS.forEach(function(k){ applyRemote(k, null); });
        kv.forEach(function(s){ if(SHARED_KEYS.includes(s.id)){ applyRemote(s.id, s.data().v); } });
        location.reload();
        return;
      }
      // Plan nuevo con los datos de este móvil
      const ref = doc(collection(db, 'plans'));
      planId = ref.id;
      await setDoc(ref, { owner: user.uid, ownerEmail: email, memberEmails: [email], createdAt: serverTimestamp() });
      await setDoc(doc(db, 'users', user.uid), { planId: planId }, { merge: true });
      await uploadAll();
    }
    if(setRole(role)){ location.reload(); return; }
    SYNC.status = 'in';
    watchMessages();
    watchGcal();
    // Notificaciones ya activadas: se renueva el registro de este móvil (el token puede cambiar)
    if(window.Notification && Notification.permission === 'granted' && localStorage.getItem('push-token')){ registerPush().catch(function(){}); }
    // Quien usa la App, si tiene supervisor y ya dio permiso de notificaciones: recibe los mensajes con la App cerrada
    else if(role === 'member' && window.Notification && Notification.permission === 'granted'){
      getDoc(doc(db, 'plans', planId)).then(function(p){ if(p.exists() && (p.data().viewerEmails || []).length){ return registerPush(); } }).catch(function(){});
    }
    listen();
    changed();
  }

  // ---- Lo que usa la App ----
  const mobile = window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(display-mode: standalone)').matches;
  // Funciones del servidor (carpeta functions), p. ej. la lectura del calendario escolar con IA.
  // Devuelve lo que devuelve la función; si falla, el error lleva code (p. ej. 'functions/unauthenticated')
  // y message con el motivo que la App traduce.
  const functions = getFunctions(app, 'europe-west1');
  window.syncCall = async function(name, data){
    const res = await httpsCallable(functions, name, { timeout: 300000 })(data);
    return res.data;
  };

  window.syncSignIn = async function(){
    SYNC.error = '';
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try{
      if(mobile){ await signInWithRedirect(auth, provider); }
      else { await signInWithPopup(auth, provider); }
    }catch(e){
      if(e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')){
        await signInWithRedirect(auth, provider);
      } else if(!(e && e.code === 'auth/popup-closed-by-user')){
        SYNC.error = String(e && e.code || e); changed();
      }
    }
  };
  window.syncSignOut = async function(){
    await flushPush();
    if(unsubMsgs){ unsubMsgs(); unsubMsgs = null; }
    if(unsubGcal){ unsubGcal(); unsubGcal = null; }
    if(unsubKv){ unsubKv(); unsubKv = null; }
    if(unsubPlan){ unsubPlan(); unsubPlan = null; }
    planId = null;
    // El supervisor no se queda con los datos del plan en el móvil
    if(SYNC.role === 'viewer'){ SHARED_KEYS.forEach(function(k){ applyRemote(k, null); }); }
    const wasViewer = setRole('');
    await signOut(auth);
    if(wasViewer){ location.reload(); }
  };
  window.syncAddMember = async function(email){
    email = String(email || '').trim().toLowerCase();
    if(!planId || !SYNC.isOwner || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ return false; }
    await updateDoc(doc(db, 'plans', planId), { memberEmails: arrayUnion(email) });
    return true;
  };
  // ---- Historial del plan (lo escribe el servidor; lo leen miembros y supervisores) ----
  // Entradas de la más reciente a la más antigua, de n en n: syncReadLog(n) y luego syncReadLog(n, true) para seguir
  let logCursor = null;
  function logEntry(d){ const x = d.data(); x.id = d.id; x.at = x.at && x.at.toDate ? x.at.toDate() : null; return x; }
  window.syncReadLog = async function(n, more){
    if(!planId){ return null; }
    if(!more){ logCursor = null; }
    const parts = [collection(db, 'plans', planId, 'log'), orderBy('at', 'desc')];
    if(logCursor){ parts.push(startAfter(logCursor)); }
    parts.push(limit(n));
    const snap = await getDocs(query.apply(null, parts));
    if(snap.docs.length){ logCursor = snap.docs[snap.docs.length - 1]; }
    return snap.docs.map(logEntry);
  };
  // Todo lo de una tarea (sus cambios y sus bloques), de lo más reciente a lo más antiguo
  window.syncTaskLog = async function(key){
    if(!planId){ return null; }
    const snap = await getDocs(query(collection(db, 'plans', planId, 'log'), where('key', '==', key)));
    return snap.docs.map(logEntry).sort(function(p, q){ return (q.at || 0) - (p.at || 0); });
  };
  // Archivo de una tarea (también de las eliminadas) y desde cuándo se lleva el historial
  window.syncArchive = async function(key){
    if(!planId){ return null; }
    const d = await getDoc(doc(db, 'plans', planId, 'archive', key));
    if(!d.exists()){ return null; }
    const x = d.data();
    ['createdAt', 'existedAt', 'deletedAt', 'updatedAt'].forEach(function(k){ if(x[k] && x[k].toDate){ x[k] = x[k].toDate(); } });
    return x;
  };

  // ---- Notificaciones en este móvil (Firebase Cloud Messaging) ----
  // El servidor envía los avisos a los móviles de users/{uid}/devices; sw.js los muestra.
  // syncPushState(): 'unsupported' (el navegador no puede; en iPhone, solo con la App en la pantalla
  // de inicio) · 'denied' · 'off' (aún sin activar) · 'on'
  window.syncPushState = async function(){
    if(!('Notification' in window) || !('serviceWorker' in navigator) || !(await messagingSupported().catch(function(){ return false; }))){ return 'unsupported'; }
    if(Notification.permission === 'denied'){ return 'denied'; }
    return Notification.permission === 'granted' && localStorage.getItem('push-token') ? 'on' : 'off';
  };
  async function registerPush(){
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), { serviceWorkerRegistration: reg });
    if(!token || !user){ return false; }
    const id = token.replace(/[^A-Za-z0-9_-]/g, '').slice(-120);
    await setDoc(doc(db, 'users', user.uid, 'devices', id), { token: token, role: SYNC.role || 'member', at: serverTimestamp(), ua: navigator.userAgent.slice(0, 200) });
    localStorage.setItem('push-token', token);
    return true;
  }
  // Tiene que llamarse al pulsar un botón (el navegador pide permiso)
  window.syncEnablePush = async function(){
    if((await window.syncPushState()) === 'unsupported'){ return 'unsupported'; }
    const perm = await Notification.requestPermission();
    if(perm !== 'granted'){ return perm === 'denied' ? 'denied' : 'off'; }
    return (await registerPush()) ? 'on' : 'off';
  };
  // Configuración de los avisos del supervisor (users/{uid}.alerts) y avisos recibidos (users/{uid}/alerts)
  window.syncAlertConfig = async function(){
    if(!user){ return null; }
    const d = await getDoc(doc(db, 'users', user.uid));
    return (d.exists() && d.data().alerts) || {};
  };
  window.syncSaveAlertConfig = async function(cfg){
    if(!user){ return false; }
    await setDoc(doc(db, 'users', user.uid), { alerts: cfg }, { merge: true });
    return true;
  };
  window.syncReadAlerts = async function(n){
    if(!user){ return null; }
    const snap = await getDocs(query(collection(db, 'users', user.uid, 'alerts'), orderBy('at', 'desc'), limit(n || 50)));
    return snap.docs.map(function(d){ const x = d.data(); x.id = d.id; x.at = x.at && x.at.toDate ? x.at.toDate() : null; return x; });
  };

  // ---- Mensajes del supervisor (plans/{id}/messages) ----
  // syncWatchMessages(cb): cb(lista) con los últimos 50, del más reciente al más antiguo, cada vez que cambian
  let unsubMsgs = null, msgCb = null;
  function watchMessages(){
    if(unsubMsgs){ unsubMsgs(); unsubMsgs = null; }
    if(!planId || !msgCb){ return; }
    unsubMsgs = onSnapshot(query(collection(db, 'plans', planId, 'messages'), orderBy('createdAt', 'desc'), limit(50)), function(snap){
      msgCb(snap.docs.map(function(d){
        const x = d.data(); x.id = d.id;
        ['createdAt', 'seenAt', 'repliedAt'].forEach(function(k){ if(x[k] && x[k].toDate){ x[k] = x[k].toDate(); } });
        return x;
      }));
    }, function(e){ SYNC.error = String(e.code || e); changed(); });
  }
  window.syncWatchMessages = function(cb){ msgCb = cb; if(SYNC.status === 'in'){ watchMessages(); } };

  // ---- Exportación a Google Calendar (plans/{id}/gcal) ----
  // syncWatchGcal(cb): cb(estado o null) cada vez que cambia (lo escribe el servidor)
  let unsubGcal = null, gcalCb = null;
  function watchGcal(){
    if(unsubGcal){ unsubGcal(); unsubGcal = null; }
    if(!planId || !gcalCb){ return; }
    unsubGcal = onSnapshot(doc(db, 'plans', planId, 'gcal', 'status'), function(s){
      const x = s.exists() ? s.data() : null;
      if(x){ ['at', 'syncedAt'].forEach(function(k){ if(x[k] && x[k].toDate){ x[k] = x[k].toDate(); } }); }
      gcalCb(x);
    }, function(){ gcalCb(null); });
  }
  window.syncWatchGcal = function(cb){ gcalCb = cb; if(SYNC.status === 'in'){ watchGcal(); } };
  // Tiempos de trayecto de hoy para el aviso a la hora de salida: { 'act-…' | 'evt-…': minutos }
  window.syncGcalLeave = async function(date, items){
    if(!planId || !user || SYNC.role === 'viewer'){ return; }
    await setDoc(doc(db, 'plans', planId, 'gcal', 'leave'), { date: date, items: items, at: serverTimestamp(), by: user.uid });
  };
  // Sube ya lo que esté pendiente (p. ej. antes de salir de la App hacia Google)
  window.syncFlush = function(){ clearTimeout(pushTimer); return pushQueue.size ? flushPush() : Promise.resolve(); };
  window.syncSendMessage = async function(m){
    if(!planId || !user || SYNC.role !== 'viewer'){ return false; }
    const data = { from: user.uid, fromEmail: user.email.toLowerCase(), fromName: user.displayName || '', text: String(m.text || '').slice(0, 1000), createdAt: serverTimestamp() };
    if(m.taskKey){ data.taskKey = m.taskKey; data.taskName = String(m.taskName || '').slice(0, 200); }
    await addDoc(collection(db, 'plans', planId, 'messages'), data);
    return true;
  };
  window.syncMessageSeen = async function(id){
    if(!planId || SYNC.role === 'viewer'){ return; }
    await updateDoc(doc(db, 'plans', planId, 'messages', id), { seenAt: serverTimestamp() });
  };
  // reply: { ok: true } o { text }
  window.syncReplyMessage = async function(id, reply){
    if(!planId || SYNC.role === 'viewer'){ return false; }
    await updateDoc(doc(db, 'plans', planId, 'messages', id), { reply: reply, repliedAt: serverTimestamp() });
    return true;
  };

  // Todo el archivo (para Análisis: también las tareas eliminadas, con lo trabajado)
  window.syncArchiveAll = async function(){
    if(!planId){ return null; }
    const snap = await getDocs(collection(db, 'plans', planId, 'archive'));
    return snap.docs.map(function(d){
      const x = d.data(); x.key = d.id;
      ['createdAt', 'existedAt', 'deletedAt', 'updatedAt'].forEach(function(k){ if(x[k] && x[k].toDate){ x[k] = x[k].toDate(); } });
      return x;
    });
  };

  // Supervisor: solo lo pone el dueño. Si ya era miembro, deja de serlo en el mismo cambio
  window.syncAddViewer = async function(email){
    email = String(email || '').trim().toLowerCase();
    if(!planId || !SYNC.isOwner || email === SYNC.owner || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ return false; }
    const upd = { viewerEmails: arrayUnion(email), memberEmails: arrayRemove(email) };
    if(SYNC.pendingOwner === email){ upd.pendingOwner = null; }
    await updateDoc(doc(db, 'plans', planId), upd);
    return true;
  };
  window.syncRemoveViewer = async function(email){
    if(!planId || !SYNC.isOwner){ return false; }
    await updateDoc(doc(db, 'plans', planId), { viewerEmails: arrayRemove(email) });
    return true;
  };
  // Pasar la propiedad del plan a otro miembro: el dueño la ofrece y el otro la acepta
  window.syncOfferOwner = async function(email){
    if(!planId || !SYNC.isOwner || (email && !SYNC.members.includes(email))){ return false; }
    await updateDoc(doc(db, 'plans', planId), { pendingOwner: email || null });
    return true;
  };
  window.syncAcceptOwner = async function(){
    if(!planId || !user || SYNC.pendingOwner !== user.email.toLowerCase()){ return false; }
    await updateDoc(doc(db, 'plans', planId), { owner: user.uid, ownerEmail: user.email.toLowerCase(), pendingOwner: null });
    return true;
  };
  window.syncRemoveMember = async function(email){
    if(!planId || !SYNC.isOwner || email === SYNC.owner){ return false; }
    const upd = { memberEmails: arrayRemove(email) };
    if(SYNC.pendingOwner === email){ upd.pendingOwner = null; }
    await updateDoc(doc(db, 'plans', planId), upd);
    return true;
  };

  document.addEventListener('visibilitychange', function(){ if(!document.hidden){ tryReload(); } });

  getRedirectResult(auth).catch(function(e){ SYNC.error = String(e && e.code || e); changed(); });
  onAuthStateChanged(auth, async function(u){
    user = u;
    if(!u){
      SYNC.status = 'out'; SYNC.email = ''; SYNC.members = []; SYNC.viewers = []; SYNC.isOwner = false; SYNC.owner = ''; SYNC.pendingOwner = '';
      changed();
      return;
    }
    SYNC.status = 'loading'; SYNC.email = u.email; changed();
    try{ await connect(); }
    catch(e){ SYNC.status = 'in'; SYNC.error = String(e && e.code || e); changed(); }
  });
}
