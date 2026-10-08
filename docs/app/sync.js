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
   - Sin sesión, la App funciona como siempre, solo en el móvil.
   La parte visible (Configuración > Cuenta) está en app.js: renderAccount() lee window.SYNC. */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, updateDoc, collection, query, where, limit, getDocs, onSnapshot,
  serverTimestamp, arrayUnion, arrayRemove, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

// Datos compartidos del plan. El idioma, el aspecto y los avisos ya vistos son de cada móvil.
const SHARED_KEYS = [
  'kid-name', 'app-settings', 'app-activities', 'app-events', 'app-tasks', 'app-blocks',
  'deleted-cats', 'addresses', 'places', 'school-cal', 'school-cal-mode', 'no-school-manual', 'no-school-read', 'school-read-answers'
];

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
const SYNC = window.SYNC = { status: ALLOWED ? 'loading' : 'unavailable', email: '', isOwner: false, members: [], owner: '', error: '' };
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
    if(!planId){ return; }
    pushQueue.add(k);
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flushPush, 600);
  }
  async function flushPush(){
    if(!planId || !user){ return; }
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
    applyingRemote = true;
    try{ if(v === null || v === undefined){ localStorage.removeItem(k); } else { localStorage.setItem(k, v); } }
    finally{ applyingRemote = false; }
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
  function tryReload(){
    if(!reloadPending){ return; }
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
        const v = ch.type === 'removed' ? null : ch.doc.data().v;
        if(applyRemote(k, v)){ any = true; }
      });
      if(any){ scheduleReload(); }
    }, function(e){ SYNC.error = String(e.code || e); changed(); });
    unsubPlan = onSnapshot(doc(db, 'plans', planId), function(snap){
      const d = snap.data() || {};
      SYNC.members = d.memberEmails || [];
      SYNC.owner = d.ownerEmail || '';
      SYNC.isOwner = d.owner === (user && user.uid);
      // Si el dueño te quita del plan, se deja de sincronizar
      if(user && SYNC.members.length && !SYNC.members.includes(user.email.toLowerCase())){ leavePlan(); }
      changed();
    }, function(e){ SYNC.error = String(e.code || e); changed(); });
  }

  async function leavePlan(){
    if(unsubKv){ unsubKv(); unsubKv = null; }
    if(unsubPlan){ unsubPlan(); unsubPlan = null; }
    planId = null;
    if(user){ await setDoc(doc(db, 'users', user.uid), { planId: null }, { merge: true }); }
    await connect();
  }

  // ---- Al iniciar sesión: buscar el plan (propio o invitado) o crear uno ----
  async function connect(){
    const email = user.email.toLowerCase();
    const me = await getDoc(doc(db, 'users', user.uid));
    planId = me.exists() ? me.data().planId : null;
    if(planId){
      const p = await getDoc(doc(db, 'plans', planId)).catch(function(){ return null; });
      if(!p || !p.exists() || !(p.data().memberEmails || []).includes(email)){ planId = null; }
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
    SYNC.status = 'in';
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
    if(unsubKv){ unsubKv(); unsubKv = null; }
    if(unsubPlan){ unsubPlan(); unsubPlan = null; }
    planId = null;
    await signOut(auth);
  };
  window.syncAddMember = async function(email){
    email = String(email || '').trim().toLowerCase();
    if(!planId || !SYNC.isOwner || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ return false; }
    await updateDoc(doc(db, 'plans', planId), { memberEmails: arrayUnion(email) });
    return true;
  };
  window.syncRemoveMember = async function(email){
    if(!planId || !SYNC.isOwner || email === SYNC.owner){ return false; }
    await updateDoc(doc(db, 'plans', planId), { memberEmails: arrayRemove(email) });
    return true;
  };

  document.addEventListener('visibilitychange', function(){ if(!document.hidden){ tryReload(); } });

  getRedirectResult(auth).catch(function(e){ SYNC.error = String(e && e.code || e); changed(); });
  onAuthStateChanged(auth, async function(u){
    user = u;
    if(!u){
      SYNC.status = 'out'; SYNC.email = ''; SYNC.members = []; SYNC.isOwner = false; SYNC.owner = '';
      changed();
      return;
    }
    SYNC.status = 'loading'; SYNC.email = u.email; changed();
    try{ await connect(); }
    catch(e){ SYNC.status = 'in'; SYNC.error = String(e && e.code || e); changed(); }
  });
}
