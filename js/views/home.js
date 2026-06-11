// =====================================================================
// Vista HOME: lista de pacientes + búsqueda.
// =====================================================================
import { CONFIG } from '../config.js';
import * as db from '../db.js';
import { chrome, ICON, esc, $, $all, age, initials } from '../ui.js';

export async function renderHome() {
  const patients = await db.listPatients();
  const st = await db.stats();

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
