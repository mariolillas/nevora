// =====================================================================
// Nevora — app principal (router + pantallas + interacción).
// =====================================================================
import { CONFIG, BODY_LOCATIONS, COUNTRIES } from './config.js';
import * as db from './db.js';
import { captureFromCamera, pickFromGallery, compressImage, makeThumb } from './camera.js';
import { runAnalysis, AI_ENGINE } from './ai.js';
import { downloadReport } from './pdf.js';
import { exportBackup, importBackup } from './backup.js';

const app = document.getElementById('app');
let objectURLs = [];

// ---------- utilidades ----------
function url(blob) { const u = URL.createObjectURL(blob); objectURLs.push(u); return u; }
function clearURLs() { objectURLs.forEach(URL.revokeObjectURL); objectURLs = []; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function age(dob) {
  if (!dob) return null;
  const b = new Date(dob), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
  return a;
}
function initials(p) {
  return ((p.firstName || ' ')[0] + (p.lastName || ' ')[0]).toUpperCase();
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

function confirmDialog(message) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal">
      <p>${esc(message)}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-no>Cancelar</button>
        <button class="btn btn-danger" data-yes>Eliminar</button>
      </div></div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.hasAttribute('data-no')) { wrap.remove(); resolve(false); }
      if (e.target.hasAttribute('data-yes')) { wrap.remove(); resolve(true); }
    });
  });
}

function spinner(label = 'Procesando…') {
  const s = document.createElement('div');
  s.className = 'modal-backdrop';
  s.innerHTML = `<div class="modal modal-spin"><div class="spinner"></div><p>${esc(label)}</p></div>`;
  document.body.appendChild(s);
  return () => s.remove();
}

// ---------- router ----------
function go(hash) { location.hash = hash; }
window.addEventListener('hashchange', render);
window.addEventListener('load', () => { db.openDB().then(render); });

async function render() {
  clearURLs();
  const h = location.hash.replace(/^#/, '') || '/';
  const [, route, id] = h.split('/');
  try {
    if (!route) return renderHome();
    if (route === 'patient' && id === 'new') return renderPatientForm();
    if (route === 'patient' && id) return renderPatient(id);
    if (route === 'edit' && id) return renderPatientForm(id);
    if (route === 'session' && id) return renderSession(id);
    if (route === 'settings') return renderSettings();
    return renderHome();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="screen"><p class="error">Error: ${esc(e.message)}</p></div>`;
  }
}

// ---------- chrome ----------
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  cog: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.5L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.3 2.5h5l.3-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a7 7 0 0 0 .1-1z"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  pdf: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
};

function chrome(title, body, { back, fab, actionIcon, actionHash } = {}) {
  const action = actionIcon ? `<button class="icon-btn" data-go="${actionHash}">${ICON[actionIcon]}</button>` : '';
  app.innerHTML = `
    <header class="topbar">
      ${back ? `<button class="icon-btn" data-go="${back}">${ICON.back}</button>` : `<span class="brand"><span class="logo-dot"></span>${esc(CONFIG.APP_SHORT)}</span>`}
      <h1>${esc(title)}</h1>
      <div class="topbar-action">${action}</div>
    </header>
    <main class="screen">${body}</main>
    ${fab ? `<button class="fab" data-go="${fab.hash}" title="${esc(fab.label)}">${ICON.plus}</button>` : ''}`;
}

// ---------- HOME (lista de pacientes) ----------
async function renderHome() {
  const patients = await db.listPatients();
  const cards = patients.length ? patients.map((p) => `
    <button class="patient-row" data-go="/patient/${p.id}">
      <span class="avatar">${esc(initials(p))}</span>
      <span class="patient-info">
        <span class="patient-name">${esc(p.firstName)} ${esc(p.lastName)}</span>
        <span class="patient-sub">${age(p.dob) != null ? age(p.dob) + ' años · ' : ''}${esc(p.country || '')}</span>
      </span>
      <span class="chev">${ICON.back}</span>
    </button>`).join('') :
    `<div class="empty">
       <div class="empty-icon">${ICON.camera}</div>
       <h3>Sin pacientes aún</h3>
       <p>Crea tu primer paciente para comenzar una sesión de fotos.</p>
     </div>`;

  chrome(CONFIG.APP_NAME, `
    <div class="hero">
      <p class="tagline">${esc(CONFIG.APP_TAGLINE)}</p>
      <input class="search" id="search" placeholder="Buscar paciente…" autocomplete="off">
    </div>
    <div class="list" id="list">${cards}</div>
  `, { actionIcon: 'cog', actionHash: '/settings', fab: { hash: '/patient/new', label: 'Nuevo paciente' } });

  bindGo();
  const search = $('#search');
  if (search) search.addEventListener('input', () => {
    const q = search.value.toLowerCase().trim();
    $all('.patient-row', $('#list')).forEach((row) => {
      const name = $('.patient-name', row).textContent.toLowerCase();
      row.style.display = name.includes(q) ? '' : 'none';
    });
  });
}

// ---------- FORMULARIO DE PACIENTE ----------
async function renderPatientForm(id) {
  const p = id ? await db.getPatient(id) : {};
  const optCountries = COUNTRIES.map((c) => `<option ${p.country === c ? 'selected' : ''}>${c}</option>`).join('');
  chrome(id ? 'Editar paciente' : 'Nuevo paciente', `
    <form class="form" id="pform">
      <label>Nombre(s)<input name="firstName" value="${esc(p.firstName || '')}" required></label>
      <label>Apellidos<input name="lastName" value="${esc(p.lastName || '')}" required></label>
      <label>Fecha de nacimiento<input type="date" name="dob" value="${esc(p.dob || '')}"></label>
      <label>Sexo
        <select name="sex">
          <option value="">—</option>
          <option ${p.sex === 'Femenino' ? 'selected' : ''}>Femenino</option>
          <option ${p.sex === 'Masculino' ? 'selected' : ''}>Masculino</option>
          <option ${p.sex === 'Otro' ? 'selected' : ''}>Otro</option>
        </select>
      </label>
      <label>País<select name="country"><option value="">—</option>${optCountries}</select></label>
      <label>Altura (cm)<input type="number" name="height" inputmode="numeric" value="${esc(p.height || '')}"></label>
      <label>Notas<textarea name="notes" rows="2">${esc(p.notes || '')}</textarea></label>
      <button class="btn btn-primary btn-block" type="submit">Guardar</button>
      ${id ? `<button class="btn btn-danger-ghost btn-block" type="button" data-del="${id}">Eliminar paciente</button>` : ''}
    </form>
  `, { back: id ? `/patient/${id}` : '/' });

  bindGo();
  $('#pform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    const saved = await db.savePatient({ ...p, ...data });
    toast('Paciente guardado', 'success');
    go(`/patient/${saved.id}`);
  });
  const del = $('[data-del]');
  if (del) del.addEventListener('click', async () => {
    if (await confirmDialog('¿Eliminar este paciente y todas sus sesiones?')) {
      await db.deletePatient(id); toast('Paciente eliminado'); go('/');
    }
  });
}

// ---------- DETALLE DE PACIENTE ----------
async function renderPatient(id) {
  const p = await db.getPatient(id);
  if (!p) return go('/');
  const sessions = await db.listSessions(id);

  const sesList = sessions.length ? sessions.map((s) => `
    <button class="session-row" data-go="/session/${s.id}">
      <span class="type-badge ${s.type}">${s.type === 'hair' ? 'Tricoscopía' : 'Lesión'}</span>
      <span class="session-info">
        <span class="session-loc">${esc(s.bodyLocation || 'Sin localización')}</span>
        <span class="session-date">${fmtDate(s.createdAt)}</span>
      </span>
      <span class="chev">${ICON.back}</span>
    </button>`).join('') :
    `<p class="muted center">Aún no hay sesiones. Crea una abajo.</p>`;

  chrome(`${p.firstName} ${p.lastName}`, `
    <div class="patient-head">
      <span class="avatar avatar-lg">${esc(initials(p))}</span>
      <div>
        <h2>${esc(p.firstName)} ${esc(p.lastName)}</h2>
        <p class="muted">${age(p.dob) != null ? age(p.dob) + ' años · ' : ''}${esc(p.sex || '')}${p.country ? ' · ' + esc(p.country) : ''}${p.height ? ' · ' + esc(p.height) + ' cm' : ''}</p>
      </div>
      <button class="icon-btn" data-go="/edit/${p.id}">${ICON.cog}</button>
    </div>

    <h3 class="section-title">Nueva sesión</h3>
    <div class="new-session">
      <button class="big-choice lesion" data-new-session="lesion">
        <span class="bc-icon">🔬</span><span>Lesión / Nevo</span><small>AI-Score de malignidad</small>
      </button>
      <button class="big-choice hair" data-new-session="hair">
        <span class="bc-icon">💇</span><span>Cabello / Tricoscopía</span><small>Alopecia · densidad</small>
      </button>
    </div>

    <h3 class="section-title">Historial de sesiones (${sessions.length})</h3>
    <div class="list">${sesList}</div>
  `, { back: '/' });

  bindGo();
  $all('[data-new-session]').forEach((b) => b.addEventListener('click', async () => {
    const type = b.getAttribute('data-new-session');
    const s = await db.saveSession({ patientId: id, type, bodyLocation: '', notes: '', status: 'open' });
    go(`/session/${s.id}`);
  }));
}

// ---------- SESIÓN (workflow de captura) ----------
async function renderSession(id) {
  const s = await db.getSession(id);
  if (!s) return go('/');
  const p = await db.getPatient(s.patientId);
  const photos = await db.listPhotos(id);
  const analyses = await db.listAnalyses(id);
  const macro = photos.find((x) => x.kind === 'macro');
  const micro = photos.find((x) => x.kind === 'micro');
  const isHair = s.type === 'hair';

  const locOpts = BODY_LOCATIONS.map((l) => `<option ${s.bodyLocation === l ? 'selected' : ''}>${l}</option>`).join('');

  function photoCard(kind, photo, title, hint) {
    if (photo) {
      const marked = kind === 'macro' && photo.marker;
      return `<div class="photo-card filled" data-kind="${kind}">
        <div class="photo-wrap">
          <img src="${url(photo.blob)}" alt="${kind}">
          ${marked ? `<span class="pin" style="left:${photo.marker.x * 100}%;top:${photo.marker.y * 100}%"></span>` : ''}
          ${kind === 'macro' ? `<button class="mark-btn" data-mark="${photo.id}">${photo.marker ? '✓ Lesión marcada' : '＋ Marcar lesión'}</button>` : ''}
        </div>
        <div class="photo-foot">
          <span>${esc(title)}</span>
          <div>
            <button class="mini-btn" data-recapture="${kind}">Repetir</button>
            <button class="mini-btn danger" data-delphoto="${photo.id}">${ICON.trash}</button>
          </div>
        </div>
      </div>`;
    }
    return `<button class="photo-card empty" data-capture="${kind}">
      <span class="pc-icon">${ICON.camera}</span>
      <strong>${esc(title)}</strong>
      <small>${esc(hint)}</small>
    </button>`;
  }

  const analysis = analyses[0] ? analyses[0].result : null;
  const analysisCard = analysis ? renderAnalysisCard(analysis) :
    `<button class="btn btn-primary btn-block" data-analyze id="analyzeBtn" ${(!macro && !micro) ? 'disabled' : ''}>
       Analizar con IA ${(!macro && !micro) ? '(captura una foto primero)' : ''}
     </button>`;

  chrome(isHair ? 'Sesión · Tricoscopía' : 'Sesión · Lesión', `
    <div class="session-patient">
      <span class="avatar">${esc(initials(p))}</span>
      <div><strong>${esc(p.firstName)} ${esc(p.lastName)}</strong>
      <small class="muted">${fmtDate(s.createdAt)}</small></div>
      <span class="type-badge ${s.type}">${isHair ? 'Tricoscopía' : 'Lesión'}</span>
    </div>

    <label class="inline-field">Localización en el cuerpo
      <select id="loc"><option value="">—</option>${locOpts}</select>
    </label>

    <h3 class="section-title">1 · Imagen macro <small>(panorámica)</small></h3>
    ${photoCard('macro', macro, 'Foto macro', 'Toma una vista amplia de la zona')}

    <h3 class="section-title">2 · Imagen micro <small>(zoom dermatoscópico)</small></h3>
    ${photoCard('micro', micro, 'Foto micro', 'Usa el zoom de la cámara sobre la lesión')}

    <h3 class="section-title">3 · Análisis IA <small class="sim">simulado</small></h3>
    <div id="analysisArea">${analysisCard}</div>

    <h3 class="section-title">4 · Reporte</h3>
    <button class="btn btn-outline btn-block" data-pdf ${(!macro && !micro) ? 'disabled' : ''}>${ICON.pdf} Generar reporte PDF</button>

    <label class="inline-field">Notas de la sesión
      <textarea id="notes" rows="2" placeholder="Observaciones clínicas…">${esc(s.notes || '')}</textarea>
    </label>

    <button class="btn btn-danger-ghost btn-block" data-delsession>Eliminar sesión</button>
    <p class="disclaimer">${esc(CONFIG.DISCLAIMER)}</p>
  `, { back: `/patient/${s.patientId}` });

  bindGo();

  // guardar localización / notas
  $('#loc').addEventListener('change', async (e) => { s.bodyLocation = e.target.value; await db.saveSession(s); });
  $('#notes').addEventListener('change', async (e) => { s.notes = e.target.value; await db.saveSession(s); });

  // capturar / recapturar
  $all('[data-capture],[data-recapture]').forEach((b) => b.addEventListener('click', async () => {
    const kind = b.getAttribute('data-capture') || b.getAttribute('data-recapture');
    await capturePhoto(id, kind, b.hasAttribute('data-recapture') ? macro && kind === 'macro' ? macro.id : (micro && kind === 'micro' ? micro.id : null) : null);
  }));

  // marcar lesión
  const markBtn = $('[data-mark]');
  if (markBtn) markBtn.addEventListener('click', () => openMarker(markBtn.getAttribute('data-mark'), id));

  // borrar foto
  $all('[data-delphoto]').forEach((b) => b.addEventListener('click', async () => {
    await db.deletePhoto(b.getAttribute('data-delphoto')); render();
  }));

  // analizar
  const aBtn = $('[data-analyze]');
  if (aBtn) aBtn.addEventListener('click', async () => {
    const target = micro || macro;
    if (!target) return;
    const close = spinner('Analizando imagen…');
    await new Promise((r) => setTimeout(r, 900)); // simula procesamiento
    const result = runAnalysis(s.type, target);
    await db.saveAnalysis({ sessionId: id, photoId: target.id, type: s.type, result });
    close();
    toast('Análisis completado', 'success');
    render();
  });

  // re-analizar
  const reBtn = $('[data-reanalyze]');
  if (reBtn) reBtn.addEventListener('click', async () => {
    const existing = await db.listAnalyses(id);
    for (const a of existing) await db.openDB();
    const target = micro || macro;
    const close = spinner('Re-analizando…');
    await new Promise((r) => setTimeout(r, 700));
    const result = runAnalysis(s.type, target);
    await db.saveAnalysis({ id: existing[0]?.id, sessionId: id, photoId: target.id, type: s.type, result });
    close(); render();
  });

  // PDF
  $('[data-pdf]').addEventListener('click', async () => {
    const close = spinner('Generando PDF…');
    try {
      const clinician = await db.getSetting('clinician', {});
      await downloadReport({ patient: p, session: s, photos, analyses, clinician });
      toast('PDF generado', 'success');
    } catch (e) { console.error(e); toast('Error al generar PDF', 'error'); }
    finally { close(); }
  });

  // borrar sesión
  $('[data-delsession]').addEventListener('click', async () => {
    if (await confirmDialog('¿Eliminar esta sesión completa?')) {
      await db.deleteSession(id); toast('Sesión eliminada'); go(`/patient/${s.patientId}`);
    }
  });
}

function renderAnalysisCard(a) {
  if (a.type === 'lesion') {
    return `<div class="analysis-card">
      <div class="score-badge" style="background:${a.riskColor}">
        <span class="score-num">${a.score}</span><span class="score-lbl">AI-Score</span>
      </div>
      <div class="analysis-body">
        <strong>Riesgo ${a.risk}</strong>
        <ul class="kv">
          <li><span>Asimetría</span><b>${a.abcd.asymmetry}/2</b></li>
          <li><span>Borde</span><b>${a.abcd.border}/8</b></li>
          <li><span>Colores</span><b>${a.abcd.colors}</b></li>
          <li><span>TDS</span><b>${a.tds}</b></li>
        </ul>
        <p class="muted small">${esc(a.patterns.join(' · '))}</p>
        <p class="rec">${esc(a.recommendation)}</p>
      </div>
      <button class="mini-btn full" data-reanalyze>↻ Re-analizar</button>
    </div>`;
  }
  return `<div class="analysis-card">
    <div class="analysis-body wide">
      <ul class="kv grid2">
        <li><span>Densidad</span><b>${a.density} /cm²</b></li>
        <li><span>UF</span><b>${a.follicularUnits} /cm²</b></li>
        <li><span>Cab/folículo</span><b>${a.hairsPerUnit}</b></li>
        <li><span>Terminal/Vellus</span><b>${a.terminalPct}/${a.vellusPct}%</b></li>
        <li><span>Anisotricosis</span><b>${a.anisotrichosis}%</b></li>
        <li><span>Grosor</span><b>${a.avgThickness} µm</b></li>
      </ul>
      <div class="findings">
        ${a.findings.map((f) => `<div class="finding ${f.detected ? 'pos' : 'neg'}">
          <b>${f.detected ? '●' : '○'} ${esc(f.name)}</b> <span>${f.confidence}%</span>
          <small>${esc(f.note)}</small></div>`).join('')}
      </div>
    </div>
    <button class="mini-btn full" data-reanalyze>↻ Re-analizar</button>
  </div>`;
}

// captura una foto, la comprime y guarda
async function capturePhoto(sessionId, kind, replaceId) {
  const file = await captureFromCamera();
  if (!file) return;
  const close = spinner('Guardando imagen…');
  try {
    const { blob, width, height } = await compressImage(file, kind === 'micro' ? 2400 : 2000);
    const thumb = await makeThumb(blob);
    if (replaceId) await db.deletePhoto(replaceId);
    await db.savePhoto({ sessionId, kind, blob, thumb, width, height, marker: null });
    toast('Imagen guardada', 'success');
  } catch (e) { console.error(e); toast('Error con la imagen', 'error'); }
  finally { close(); render(); }
}

// editor de marcador de lesión sobre la macro
async function openMarker(photoId, sessionId) {
  const photo = await db.getPhoto(photoId);
  const wrap = document.createElement('div');
  wrap.className = 'marker-overlay';
  wrap.innerHTML = `
    <div class="marker-top">
      <button class="btn btn-ghost" data-cancel>Cancelar</button>
      <span>Toca la lesión</span>
      <button class="btn btn-primary" data-save disabled>Guardar</button>
    </div>
    <div class="marker-stage" id="stage">
      <img id="markimg" src="${url(photo.blob)}">
      <span class="pin big" id="pin" style="display:${photo.marker ? 'block' : 'none'};left:${(photo.marker?.x ?? 0.5) * 100}%;top:${(photo.marker?.y ?? 0.5) * 100}%"></span>
    </div>`;
  document.body.appendChild(wrap);
  let marker = photo.marker || null;
  const stage = $('#stage', wrap), pin = $('#pin', wrap), saveBtn = $('[data-save]', wrap);
  if (marker) saveBtn.disabled = false;
  $('#markimg', wrap).addEventListener('click', (e) => {
    const r = $('#markimg', wrap).getBoundingClientRect();
    marker = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    pin.style.display = 'block';
    pin.style.left = marker.x * 100 + '%';
    pin.style.top = marker.y * 100 + '%';
    saveBtn.disabled = false;
  });
  $('[data-cancel]', wrap).addEventListener('click', () => wrap.remove());
  saveBtn.addEventListener('click', async () => {
    photo.marker = marker;
    await db.savePhoto(photo);
    wrap.remove();
    toast('Lesión marcada', 'success');
    render();
  });
}

// ---------- AJUSTES ----------
async function renderSettings() {
  const clinician = await db.getSetting('clinician', {});
  const st = await db.stats();
  chrome('Ajustes', `
    <h3 class="section-title">Datos del profesional <small>(aparecen en el PDF)</small></h3>
    <form class="form" id="cform">
      <label>Nombre del profesional<input name="name" value="${esc(clinician.name || '')}"></label>
      <label>Clínica / Consultorio<input name="clinic" value="${esc(clinician.clinic || '')}"></label>
      <button class="btn btn-primary btn-block" type="submit">Guardar</button>
    </form>

    <h3 class="section-title">Respaldo de datos</h3>
    <div class="stats">
      <span><b>${st.patients}</b> pacientes</span>
      <span><b>${st.sessions}</b> sesiones</span>
      <span><b>${st.photos}</b> fotos</span>
    </div>
    <p class="muted small">Todo se guarda localmente en este dispositivo. Exporta un respaldo y guárdalo en Google Drive o donde prefieras.</p>
    <button class="btn btn-outline btn-block" id="export">⬇ Exportar respaldo (.json)</button>
    <button class="btn btn-outline btn-block" id="importBtn">⬆ Importar respaldo</button>
    <input type="file" id="importFile" accept="application/json" hidden>

    <p class="muted small center" style="margin-top:24px">${esc(CONFIG.APP_NAME)} v${CONFIG.VERSION} · Motor IA: ${esc(AI_ENGINE)}</p>
    <p class="disclaimer">${esc(CONFIG.DISCLAIMER)}</p>
  `, { back: '/' });

  bindGo();
  $('#cform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    await db.setSetting('clinician', data);
    toast('Guardado', 'success');
  });
  $('#export').addEventListener('click', async () => {
    const close = spinner('Exportando…');
    try { await exportBackup(); toast('Respaldo exportado', 'success'); }
    catch (e) { toast('Error al exportar', 'error'); }
    finally { close(); }
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const close = spinner('Importando…');
    try {
      const r = await importBackup(file, { merge: true });
      toast(`Importado: ${r.patients} pacientes, ${r.photos} fotos`, 'success');
    } catch (err) { console.error(err); toast('Archivo inválido', 'error'); }
    finally { close(); render(); }
  });
}

// re-vincula handlers data-go y data-back tras cada render
function bindGo() {
  $all('[data-go]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault(); go(b.getAttribute('data-go'));
  }));
}
