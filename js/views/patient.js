// =====================================================================
// Vista PACIENTE: formulario (alta/edición) y detalle con pestañas:
//   · Seguimiento — lesiones / zonas con su línea de tiempo (principal)
//   · Visitas — todas las sesiones + comparación ad-hoc de 2 sesiones
// =====================================================================
import { COUNTRIES } from '../config.js';
import * as db from '../db.js';
import {
  chrome, ICON, esc, $, $all, age, initials, fmtDate,
  toast, confirmDialog, go, sheet,
} from '../ui.js';

// ---------- FORMULARIO DE PACIENTE ----------
export async function renderPatientForm(id) {
  const p = id ? await db.getPatient(id) : {};
  if (id && !p) return go('/');
  const optCountries = COUNTRIES.map((c) => `<option ${p.country === c ? 'selected' : ''}>${c}</option>`).join('');
  chrome(id ? 'Editar paciente' : 'Nuevo paciente', `
    <form class="form" id="pform">
      <label>Nombre(s)<input name="firstName" value="${esc(p.firstName || '')}" required></label>
      <label>Apellidos<input name="lastName" value="${esc(p.lastName || '')}" required></label>
      <div class="form-grid2">
        <label>Fecha de nacimiento<input type="date" name="dob" value="${esc(p.dob || '')}"></label>
        <label>Sexo
          <select name="sex">
            <option value="">—</option>
            <option ${p.sex === 'Femenino' ? 'selected' : ''}>Femenino</option>
            <option ${p.sex === 'Masculino' ? 'selected' : ''}>Masculino</option>
            <option ${p.sex === 'Otro' ? 'selected' : ''}>Otro</option>
          </select>
        </label>
      </div>
      <div class="form-grid2">
        <label>País<select name="country"><option value="">—</option>${optCountries}</select></label>
        <label>Altura (cm)<input type="number" name="height" inputmode="numeric" value="${esc(p.height || '')}"></label>
      </div>
      <label>Notas<textarea name="notes" rows="2">${esc(p.notes || '')}</textarea></label>
      <button class="btn btn-primary btn-block" type="submit">Guardar</button>
      ${id ? `<button class="btn btn-danger-ghost btn-block" type="button" data-del="${id}">Eliminar paciente</button>` : ''}
    </form>
  `, { back: id ? `/patient/${id}` : '/' });

  $('#pform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const saved = await db.savePatient({ ...p, ...data });
    toast('Paciente guardado', 'success');
    go(`/patient/${saved.id}`);
  });
  const del = $('[data-del]');
  if (del) del.addEventListener('click', async () => {
    if (await confirmDialog('¿Eliminar este paciente con todas sus lesiones y visitas?')) {
      await db.deletePatient(id); toast('Paciente eliminado'); go('/');
    }
  });
}

// ---------- DETALLE DE PACIENTE ----------
export async function renderPatient(id, q) {
  const p = await db.getPatient(id);
  if (!p) return go('/');
  const tab = q?.get('tab') === 'sessions' ? 'sessions' : 'lesions';
  const lesions = await db.listLesions(id);
  const sessions = await db.listSessions(id);

  let body;
  if (tab === 'lesions') {
    body = await lesionsTab(p, lesions);
  } else {
    body = sessionsTab(p, sessions);
  }

  chrome(`${p.firstName} ${p.lastName}`, `
    <div class="patient-head">
      <span class="avatar avatar-lg">${esc(initials(p))}</span>
      <div class="ph-info">
        <h2>${esc(p.firstName)} ${esc(p.lastName)}</h2>
        <p class="muted">${age(p.dob) != null ? age(p.dob) + ' años · ' : ''}${esc(p.sex || '')}${p.country ? ' · ' + esc(p.country) : ''}</p>
      </div>
      <button class="icon-btn" data-go="/edit/${p.id}">${ICON.edit}</button>
    </div>

    <div class="tabs">
      <button class="tab ${tab === 'lesions' ? 'active' : ''}" data-go="/patient/${id}">${ICON.target} Seguimiento</button>
      <button class="tab ${tab === 'sessions' ? 'active' : ''}" data-go="/patient/${id}?tab=sessions">${ICON.calendar} Visitas (${sessions.length})</button>
    </div>

    ${body}
  `, { back: '/', fab: tab === 'lesions' ? { hash: `/lesion/new/${id}`, label: 'Nueva lesión' } : null });

  // comparación ad-hoc (pestaña visitas)
  const cmpBtn = $('[data-adhoc]');
  if (cmpBtn) cmpBtn.addEventListener('click', () => openAdhocPicker(p, sessions));
}

// pestaña Seguimiento: tarjetas de lesión con resumen de su evolución
async function lesionsTab(p, lesions) {
  if (!lesions.length) {
    return `<div class="empty">
      <div class="empty-icon">${ICON.target}</div>
      <h3>Sin zonas de seguimiento</h3>
      <p>Crea una lesión o zona (ej. "Nevo espalda alta") para acumular visitas y comparar su evolución en el tiempo.</p>
      <button class="btn btn-primary" data-go="/lesion/new/${p.id}">${ICON.plus} Nueva lesión / zona</button>
    </div>`;
  }
  const cards = [];
  for (const l of lesions) {
    const visits = await db.listSessionsByLesion(l.id);
    const last = visits[visits.length - 1];
    let riskDot = '';
    if (last) {
      const an = await db.listAnalyses(last.id);
      const r = an[0]?.result;
      if (r?.type === 'lesion') riskDot = `<span class="risk-dot" style="background:${r.riskColor}" title="Riesgo ${esc(r.risk)}"></span>`;
    }
    cards.push(`
      <button class="lesion-card card-press" data-go="/lesion/${l.id}">
        <span class="lesion-icon ${l.type}">${l.type === 'hair' ? ICON.hair : ICON.target}</span>
        <span class="lesion-info">
          <span class="lesion-label">${riskDot}${esc(l.label)}</span>
          <span class="lesion-sub">${esc(l.bodyLocation || 'Sin localización')} · ${visits.length} visita${visits.length === 1 ? '' : 's'}${last ? ' · última ' + fmtDate(last.createdAt) : ''}</span>
        </span>
        <span class="chev">${ICON.chev}</span>
      </button>`);
  }
  return `<div class="list">${cards.join('')}</div>`;
}

// pestaña Visitas: historial completo + comparación ad-hoc
function sessionsTab(p, sessions) {
  const rows = sessions.length ? sessions.map((s) => `
    <button class="session-row card-press" data-go="/session/${s.id}">
      <span class="type-badge ${s.type}">${s.type === 'hair' ? 'Trico' : 'Lesión'}</span>
      <span class="session-info">
        <span class="session-loc">${esc(s.bodyLocation || 'Sin localización')}</span>
        <span class="session-date">${fmtDate(s.createdAt)}</span>
      </span>
      <span class="chev">${ICON.chev}</span>
    </button>`).join('') :
    `<div class="empty small"><p>Aún no hay visitas. Entra a una lesión y agrega su primera visita.</p></div>`;

  return `
    ${sessions.length >= 2 ? `<button class="btn btn-outline btn-block" data-adhoc>${ICON.compare} Comparar dos visitas (ad-hoc)</button>` : ''}
    <div class="list">${rows}</div>`;
}

// selector de 2 sesiones del mismo tipo para comparación rápida
function openAdhocPicker(p, sessions) {
  const items = sessions.slice().sort((a, b) => a.createdAt - b.createdAt).map((s) => `
    <button class="pick-row" data-pick="${s.id}" data-type="${s.type}">
      <span class="type-badge ${s.type}">${s.type === 'hair' ? 'Trico' : 'Lesión'}</span>
      <span class="pick-info">${esc(s.bodyLocation || 'Sin localización')}<small>${fmtDate(s.createdAt)}</small></span>
      <span class="pick-check">${ICON.check}</span>
    </button>`).join('');

  const sh = sheet('Elige 2 visitas a comparar', `
    <p class="muted small">Selecciona dos visitas del mismo tipo (la más antigua será la visita A).</p>
    <div class="pick-list">${items}</div>
    <button class="btn btn-primary btn-block" data-gocmp disabled>${ICON.compare} Comparar</button>
  `);

  const picked = [];
  $all('[data-pick]', sh.el).forEach((row) => row.addEventListener('click', () => {
    const id = row.getAttribute('data-pick');
    const i = picked.indexOf(id);
    if (i >= 0) { picked.splice(i, 1); row.classList.remove('picked'); }
    else if (picked.length < 2) { picked.push(id); row.classList.add('picked'); }
    // bloquear tipos distintos al primero seleccionado
    const type = picked.length ? $(`[data-pick="${picked[0]}"]`, sh.el).getAttribute('data-type') : null;
    $all('[data-pick]', sh.el).forEach((r) => {
      r.classList.toggle('disabled', !!type && r.getAttribute('data-type') !== type && !r.classList.contains('picked'));
    });
    $('[data-gocmp]', sh.el).disabled = picked.length !== 2;
  }));

  $('[data-gocmp]', sh.el).addEventListener('click', () => {
    const [x, y] = picked.map((id) => sessions.find((s) => s.id === id));
    const [a, b] = x.createdAt <= y.createdAt ? [x, y] : [y, x];
    sh.close();
    go(`/compare-adhoc/${p.id}?a=${a.id}&b=${b.id}`);
  });
}
