// =====================================================================
// Capa de datos local: IndexedDB.
// Stores: patients, lesions, sessions, photos (blobs), analyses, settings.
// Todo vive en el dispositivo (privado / offline). El respaldo se
// maneja en backup.js (exportar/importar).
//
// v2: identidad de lesión (§6.1 del PLAN). Jerarquía:
//   Paciente → Lesión (zona de seguimiento) → Sesiones (visitas) → Fotos/Análisis
// Las sesiones v1 sin lesionId se agrupan automáticamente por
// (paciente + tipo + localización) en ensureLesionIdentity().
// =====================================================================
import { CONFIG } from './config.js';

let _db = null;
let _opening = null;

function uid(prefix) {
  // ID ordenable por tiempo + componente aleatorio.
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}${r}`;
}

function autoLabel(type, bodyLocation) {
  const base = type === 'hair' ? 'Tricoscopía' : 'Lesión';
  return `${base} — ${bodyLocation || 'Sin localización'}`;
}

export function openDB() {
  if (_db) return Promise.resolve(_db);
  if (_opening) return _opening;
  _opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const txn = e.target.transaction;
      if (!db.objectStoreNames.contains('patients')) {
        const s = db.createObjectStore('patients', { keyPath: 'id' });
        s.createIndex('byName', 'searchName', { unique: false });
        s.createIndex('byCreated', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('byPatient', 'patientId', { unique: false });
        s.createIndex('byCreated', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('bySession', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains('analyses')) {
        const s = db.createObjectStore('analyses', { keyPath: 'id' });
        s.createIndex('bySession', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      // ----- v2: identidad de lesión -----
      if (!db.objectStoreNames.contains('lesions')) {
        const s = db.createObjectStore('lesions', { keyPath: 'id' });
        s.createIndex('byPatient', 'patientId', { unique: false });
      }
      const sess = txn.objectStore('sessions');
      if (!sess.indexNames.contains('byLesion')) {
        sess.createIndex('byLesion', 'lesionId', { unique: false });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      // Migra datos v1 (sesiones sin lesión) antes de entregar la BD.
      ensureLesionIdentity().then(() => resolve(_db)).catch(reject);
    };
    req.onerror = () => reject(req.error);
  });
  return _opening;
}

function tx(store, mode = 'readonly') {
  return _db.transaction(store, mode).objectStore(store);
}

function reqToPromise(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function getAllByIndex(store, indexName, value) {
  return new Promise((res, rej) => {
    const idx = tx(store).index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}

// ---------- MIGRACIÓN: sesiones sin lesión → lesiones agrupadas ----------
// Agrupa por (paciente + tipo + localización) y crea una lesión por grupo.
// Se ejecuta al abrir la BD y tras importar respaldos v1. Idempotente.
export async function ensureLesionIdentity() {
  const sessions = await reqToPromise(tx('sessions').getAll());
  const orphans = sessions.filter((s) => !s.lesionId);
  if (!orphans.length) return 0;
  const groups = new Map();
  for (const s of orphans) {
    const key = `${s.patientId}|${s.type}|${s.bodyLocation || ''}`;
    if (!groups.has(key)) {
      const lesion = {
        id: uid('les'),
        patientId: s.patientId,
        label: autoLabel(s.type, s.bodyLocation),
        bodyLocation: s.bodyLocation || '',
        type: s.type,
        createdAt: s.createdAt || Date.now(),
      };
      await reqToPromise(tx('lesions', 'readwrite').put(lesion));
      groups.set(key, lesion.id);
    }
    s.lesionId = groups.get(key);
    await reqToPromise(tx('sessions', 'readwrite').put(s));
  }
  return orphans.length;
}

// ---------- PACIENTES ----------
export async function savePatient(p) {
  await openDB();
  if (!p.id) { p.id = uid('pat'); p.createdAt = Date.now(); }
  p.updatedAt = Date.now();
  p.searchName = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase().trim();
  await reqToPromise(tx('patients', 'readwrite').put(p));
  return p;
}

export async function getPatient(id) {
  await openDB();
  return reqToPromise(tx('patients').get(id));
}

export async function listPatients() {
  await openDB();
  const all = await reqToPromise(tx('patients').getAll());
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function deletePatient(id) {
  await openDB();
  const sessions = await getAllByIndex('sessions', 'byPatient', id);
  for (const s of sessions) await deleteSession(s.id);
  const lesions = await getAllByIndex('lesions', 'byPatient', id);
  for (const l of lesions) await reqToPromise(tx('lesions', 'readwrite').delete(l.id));
  await reqToPromise(tx('patients', 'readwrite').delete(id));
}

// ---------- LESIONES (zonas de seguimiento) ----------
export async function saveLesion(l) {
  await openDB();
  if (!l.id) { l.id = uid('les'); l.createdAt = Date.now(); }
  await reqToPromise(tx('lesions', 'readwrite').put(l));
  return l;
}

export async function getLesion(id) {
  await openDB();
  return reqToPromise(tx('lesions').get(id));
}

export async function listLesions(patientId) {
  await openDB();
  const list = await getAllByIndex('lesions', 'byPatient', patientId);
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// Borra la lesión y, en cascada, todas sus visitas (sesiones).
export async function deleteLesion(id) {
  await openDB();
  const sessions = await getAllByIndex('sessions', 'byLesion', id);
  for (const s of sessions) await deleteSession(s.id);
  await reqToPromise(tx('lesions', 'readwrite').delete(id));
}

// ---------- SESIONES ----------
export async function saveSession(s) {
  await openDB();
  if (!s.id) { s.id = uid('ses'); s.createdAt = Date.now(); }
  s.updatedAt = Date.now();
  await reqToPromise(tx('sessions', 'readwrite').put(s));
  return s;
}

export async function getSession(id) {
  await openDB();
  return reqToPromise(tx('sessions').get(id));
}

export async function listSessions(patientId) {
  await openDB();
  const list = await getAllByIndex('sessions', 'byPatient', patientId);
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// Visitas de una lesión, ordenadas de la más antigua a la más reciente.
export async function listSessionsByLesion(lesionId) {
  await openDB();
  const list = await getAllByIndex('sessions', 'byLesion', lesionId);
  return list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function deleteSession(id) {
  await openDB();
  const photos = await getAllByIndex('photos', 'bySession', id);
  for (const ph of photos) await reqToPromise(tx('photos', 'readwrite').delete(ph.id));
  const analyses = await getAllByIndex('analyses', 'bySession', id);
  for (const an of analyses) await reqToPromise(tx('analyses', 'readwrite').delete(an.id));
  await reqToPromise(tx('sessions', 'readwrite').delete(id));
}

// ---------- FOTOS ----------
export async function savePhoto(ph) {
  await openDB();
  if (!ph.id) { ph.id = uid('img'); ph.createdAt = Date.now(); }
  await reqToPromise(tx('photos', 'readwrite').put(ph));
  return ph;
}

export async function getPhoto(id) {
  await openDB();
  return reqToPromise(tx('photos').get(id));
}

export async function listPhotos(sessionId) {
  await openDB();
  const list = await getAllByIndex('photos', 'bySession', sessionId);
  return list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function deletePhoto(id) {
  await openDB();
  await reqToPromise(tx('photos', 'readwrite').delete(id));
}

// ---------- ANÁLISIS (IA) ----------
export async function saveAnalysis(a) {
  await openDB();
  if (!a.id) { a.id = uid('ana'); a.createdAt = Date.now(); }
  await reqToPromise(tx('analyses', 'readwrite').put(a));
  return a;
}

export async function listAnalyses(sessionId) {
  await openDB();
  return getAllByIndex('analyses', 'bySession', sessionId);
}

// ---------- AJUSTES ----------
export async function getSetting(key, fallback = null) {
  await openDB();
  const r = await reqToPromise(tx('settings').get(key));
  return r ? r.value : fallback;
}

export async function setSetting(key, value) {
  await openDB();
  await reqToPromise(tx('settings', 'readwrite').put({ key, value }));
}

// ---------- UTILIDADES DE RESPALDO ----------
const ALL_STORES = ['patients', 'lesions', 'sessions', 'photos', 'analyses', 'settings'];

export async function exportAll() {
  await openDB();
  const dump = {};
  for (const st of ALL_STORES) dump[st] = await reqToPromise(tx(st).getAll());
  return dump;
}

export async function importAll(dump, { merge = true } = {}) {
  await openDB();
  for (const st of ALL_STORES) {
    if (!dump[st]) continue;
    const store = tx(st, 'readwrite');
    if (!merge) await reqToPromise(store.clear());
    for (const item of dump[st]) await reqToPromise(store.put(item));
  }
  // Respaldos v1 no traen lesiones: agruparlas igual que en la migración.
  await ensureLesionIdentity();
}

export async function stats() {
  await openDB();
  return {
    patients: await reqToPromise(tx('patients').count()),
    lesions: await reqToPromise(tx('lesions').count()),
    sessions: await reqToPromise(tx('sessions').count()),
    photos: await reqToPromise(tx('photos').count()),
  };
}
