// =====================================================================
// Vista HOME: lista de pacientes + búsqueda.
// =====================================================================
import { CONFIG } from '../config.js';
import * as db from '../db.js';
import { buildWorklist } from '../worklist.js';
import { chrome, ICON, esc, $, $all, age, initials } from '../ui.js';

const REASON_CLS = { overdue: 'r-overdue', worsening: 'r-worsening', high: 'r-high', soon: 'r-soon' };

export async function renderHome() {
  const patients = await db.listPatients();
  const st = await db.stats();
  const worklist = patients.length ? await buildWorklist() : [];

  // sección "Requiere atención" (cross-paciente)
  const attention = worklist.length ? `
    <div class="attention-block">
      <h3 class="section-title attn-title">⚠ Requiere atención <span class="attn-count">${worklist.length}</span></h3>
      <div class="list">
        ${worklist.slice(0, 8).map((w) => `
          <button class="attn-row card-press" data-go="/lesion/${w.lesionId}">
            <span class="lesion-icon ${w.type}">${w.type === 'hair' ? ICON.hair : ICON.target}</span>
            <span class="attn-info">
              <span class="attn-label">${esc(w.label)}</span>
              <span class="attn-sub">${esc(w.patientName)}${w.bodyLocation ? ' · ' + esc(w.bodyLocation) : ''}</span>
              <span class="attn-reasons">${w.reasons.map((r) => `<span class="attn-tag ${REASON_CLS[r.type] || ''}">${esc(r.text)}</span>`).join('')}</span>
            </span>
            <span class="chev">${ICON.chev}</span>
          </button>`).join('')}
      </div>
      ${worklist.length > 8 ? `<p class="muted small center">y ${worklist.length - 8} más…</p>` : ''}
    </div>` : '';

  const cards = patients.length ? patients.map((p) => `
    <button class="patient-row card-press" data-go="/patient/${p.id}">
      <span class="avatar">${esc(initials(p))}</span>
      <span class="patient-info">
        <span class="patient-name">${esc(p.firstName)} ${esc(p.lastName)}</span>
        <span class="patient-sub">${age(p.dob) != null ? age(p.dob) + ' años · ' : ''}${esc(p.country || '')}</span>
      </span>
      <span class="chev">${ICON.chev}</span>
    </button>`).join('') :
    `<div class="empty">
       <div class="empty-icon">${ICON.user}</div>
       <h3>Sin pacientes aún</h3>
       <p>Crea tu primer paciente para comenzar el seguimiento dermatoscópico.</p>
       <button class="btn btn-primary" data-go="/patient/new">${ICON.plus} Nuevo paciente</button>
     </div>`;

  chrome(CONFIG.APP_NAME, `
    <div class="hero">
      <p class="tagline">${esc(CONFIG.APP_TAGLINE)}</p>
      ${patients.length ? `
      <div class="stats-row">
        <span class="stat-chip">${ICON.user}<b>${st.patients}</b> pacientes</span>
        <span class="stat-chip">${ICON.target}<b>${st.lesions}</b> lesiones</span>
        <span class="stat-chip">${ICON.camera}<b>${st.sessions}</b> visitas</span>
      </div>` : ''}
      <div class="search-wrap">${ICON.search}<input class="search" id="search" placeholder="Buscar paciente…" autocomplete="off"></div>
    </div>
    ${attention}
    ${worklist.length ? '<h3 class="section-title">Pacientes</h3>' : ''}
    <div class="list" id="list">${cards}</div>
  `, { actionIcon: 'cog', actionHash: '/settings', fab: patients.length ? { hash: '/patient/new', label: 'Nuevo paciente' } : null });

  const search = $('#search');
  if (search) search.addEventListener('input', () => {
    const q = search.value.toLowerCase().trim();
    $all('.patient-row', $('#list')).forEach((row) => {
      const name = $('.patient-name', row).textContent.toLowerCase();
      row.style.display = name.includes(q) ? '' : 'none';
    });
  });
}
