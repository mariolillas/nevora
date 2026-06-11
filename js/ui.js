// =====================================================================
// Capa de UI compartida: helpers DOM, iconografía, chrome (topbar +
// pantalla + FAB), toasts, modales, sheets y navegación.
// Las vistas viven en js/views/*.js y usan este módulo.
// =====================================================================
import { CONFIG } from './config.js';

export const app = document.getElementById('app');

// ---------- object URLs (se liberan en cada navegación) ----------
let objectURLs = [];
export function url(blob) { const u = URL.createObjectURL(blob); objectURLs.push(u); return u; }
export function clearURLs() { objectURLs.forEach(URL.revokeObjectURL); objectURLs = []; }

// ---------- helpers ----------
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $all = (sel, root = document) => [...root.querySelectorAll(sel)];

export function age(dob) {
  if (!dob) return null;
  const b = new Date(dob), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
  return a;
}

export function initials(p) {
  return ((p.firstName || ' ')[0] + (p.lastName || ' ')[0]).toUpperCase();
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateLong(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
export function daysBetween(a, b) {
  return Math.round(Math.abs(b - a) / 86400000);
}

// ---------- navegación ----------
let _render = null;
export function setRenderer(fn) { _render = fn; }
export function rerender() { if (_render) _render(); }
export function go(hash) {
  if (('#' + hash) === location.hash) rerender();
  else location.hash = hash;
}

// ---------- iconografía (stroke SVG) ----------
const I = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true">${extra}<path d="${d}"/></svg>`;
export const ICON = {
  back: I('M15 18l-6-6 6-6'),
  chev: I('M9 18l6-6-6-6'),
  plus: I('M12 5v14M5 12h14'),
  cog: I('M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.5L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.3 2.5h5l.3-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a7 7 0 0 0 .1-1z', '<circle cx="12" cy="12" r="3"/>'),
  camera: I('M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', '<circle cx="12" cy="13" r="4"/>'),
  pdf: I('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6'),
  trash: I('M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'),
  edit: I('M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z'),
  compare: I('M16 3l5 5-5 5M21 8H9M8 21l-5-5 5-5M3 16h12'),
  target: I('M12 2v3M12 19v3M2 12h3M19 12h3', '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/>'),
  hair: I('M4 21c2-4 1-7 3-10s6-5 13-5c-1 3-2 4-4 5 1 0 2 0 3 1-2 2-4 2-6 2 1 1 1 2 3 2-3 2-5 1-7 3s-2 4-5 2z'),
  calendar: I('M8 2v4M16 2v4M3 10h18', '<rect x="3" y="4" width="18" height="18" rx="2"/>'),
  chart: I('M3 21h18M7 16l4-6 3 3 5-8'),
  check: I('M20 6L9 17l-5-5'),
  x: I('M18 6L6 18M6 6l12 12'),
  user: I('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', '<circle cx="12" cy="7" r="4"/>'),
  search: I('M21 21l-4.3-4.3', '<circle cx="11" cy="11" r="8"/>'),
  swap: I('M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4'),
  download: I('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3'),
  upload: I('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12'),
  eye: I('M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z', '<circle cx="12" cy="12" r="3"/>'),
  eyeOff: I('M17.94 17.94A10 10 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 5.24A9.5 9.5 0 0 1 12 5c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M2 2l20 20'),
};

// ---------- toast ----------
export function toast(msg, type = 'info', action = null) {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="toast-action">${esc(action.label)}</button>` : ''}`;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  if (action) $('.toast-action', t).addEventListener('click', () => { t.remove(); action.onClick(); });
  const ttl = action ? 12000 : 2600;
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, ttl);
}

// ---------- modales ----------
export function confirmDialog(message, { confirmLabel = 'Eliminar', danger = true } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal">
      <p>${esc(message)}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-no>Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmLabel)}</button>
      </div></div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.hasAttribute('data-no')) { wrap.remove(); resolve(false); }
      if (e.target.hasAttribute('data-yes')) { wrap.remove(); resolve(true); }
    });
  });
}

export function spinner(label = 'Procesando…') {
  const s = document.createElement('div');
  s.className = 'modal-backdrop show';
  s.innerHTML = `<div class="modal modal-spin"><div class="spinner"></div><p>${esc(label)}</p></div>`;
  document.body.appendChild(s);
  return () => s.remove();
}

// Bottom sheet (selector deslizante desde abajo). Devuelve { el, close }.
export function sheet(title, bodyHTML) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `<div class="sheet">
    <div class="sheet-grip"></div>
    <div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close>${ICON.x}</button></div>
    <div class="sheet-body">${bodyHTML}</div>
  </div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  const close = () => { wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 250); };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  return { el: wrap, close };
}

// Visor de imagen a pantalla completa.
export function lightbox(src, caption = '') {
  const wrap = document.createElement('div');
  wrap.className = 'lightbox';
  wrap.innerHTML = `<img src="${src}" alt="">${caption ? `<p>${esc(caption)}</p>` : ''}<button class="icon-btn lb-close">${ICON.x}</button>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  wrap.addEventListener('click', () => { wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 200); });
}

// ---------- chrome (estructura común de pantalla) ----------
export function chrome(title, body, { back, fab, actionIcon, actionHash, subtitle } = {}) {
  const action = actionIcon ? `<button class="icon-btn" data-go="${actionHash}">${ICON[actionIcon]}</button>` : '';
  app.innerHTML = `
    <header class="topbar">
      ${back ? `<button class="icon-btn" data-go="${back}">${ICON.back}</button>` : `<span class="brand"><span class="logo-dot"></span>${esc(CONFIG.APP_SHORT)}</span>`}
      <div class="topbar-title"><h1>${esc(title)}</h1>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div>
      <div class="topbar-action">${action}</div>
    </header>
    <main class="screen">${body}</main>
    ${fab ? `<button class="fab" data-go="${fab.hash}" title="${esc(fab.label)}">${ICON.plus}</button>` : ''}`;
  bindGo();
}

// Vincula la navegación declarativa [data-go] dentro de un contenedor.
export function bindGo(root = app) {
  $all('[data-go]', root).forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    go(b.getAttribute('data-go'));
  }));
}
