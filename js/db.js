// =====================================================================
// Capa de datos local: IndexedDB.
// Stores: patients, sessions, photos (blobs), analyses, settings.
// Todo vive en el dispositivo (privado / offline). El respaldo se
// maneja en backup.js (exportar/importar).
// =====================================================================
import { CONFIG } from './config.js';

let _db = null;

function uid(prefix) {
  // ID ordenable por tiempo + componente aleatorio.
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}${r}`;
}

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
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
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
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
  await reqToPromise(tx('patients', 'readwrite').delete(id));
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
  const list = await getAllByIndex('sessions', 'byPatient', patientId);
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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
  const list = await getAllByIndex('photos', 'bySession', sessionId);
  return list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function deletePhoto(id) {
  await openDB();
  await reqToPromise(tx('photos', 'readwrite').delete(id));
}

// ---------- ANÁLISIS (IA simulada) ----------
export async function saveAnalysis(a) {
  await openDB();
  if (!a.id) { a.id = uid('ana'); a.createdAt = Date.now(); }
  await reqToPromise(tx('analyses', 'readwrite').put(a));
  return a;
}

export async function listAnalyses(sessionId) {
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
export async function exportAll() {
  await openDB();
  const stores = ['patients', 'sessions', 'photos', 'analyses', 'settings'];
  const dump = {};
  for (const st of stores) dump[st] = await reqToPromise(tx(st).getAll());
  return dump;
}

export async function importAll(dump, { merge = true } = {}) {
  await openDB();
  const stores = ['patients', 'sessions', 'photos', 'analyses', 'settings'];
  for (const st of stores) {
    if (!dump[st]) continue;
    const store = tx(st, 'readwrite');
    if (!merge) await reqToPromise(store.clear());
    for (const item of dump[st]) await reqToPromise(store.put(item));
  }
}

export async function stats() {
  await openDB();
  return {
    patients: await reqToPromise(tx('patients').count()),
    sessions: await reqToPromise(tx('sessions').count()),
    photos: await reqToPromise(tx('photos').count()),
  };
}
