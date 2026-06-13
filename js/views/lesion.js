// =====================================================================
// Vista LESIÓN (zona de seguimiento): formulario y línea de tiempo de
// visitas con mini-gráfica de evolución del AI-Score.
//   Paciente → Lesión → [visitas en el tiempo] → Comparar
// =====================================================================
import { BODY_LOCATIONS } from '../config.js';
import * as db from '../db.js';
import { bodyMapMarkup, wireBodyMap } from '../bodymap.js';
import { CONTROL_INTERVALS, addMonths } from '../worklist.js';
import {
  chrome, ICON, esc, $, $all, fmtDate, toast, confirmDialog, go,
} from '../ui.js';

// ---------- FORMULARIO (nueva / editar) ----------
export async function renderLesionForm(lesionId, patientId) {
  const l = lesionId ? await db.getLesion(lesionId) : { type: 'lesion', patientId };
  if (lesionId && !l) return go('/');
  const pid = l.patientId;
  const locOpts = BODY_LOCATIONS.map((x) => `<option ${l.bodyLocation === x ? 'selected' : ''}>${x}</option>`).join('');

  chrome(lesionId ? 'Editar lesión' : 'Nueva lesión / zona', `
    <form class="form" id="lform">
      ${lesionId ? '' : `
      <span class="form-label">Tipo de seguimiento</span>
      <div class="new-session">
        <button type="button" class="big-choice lesion ${l.type !== 'hair' ? 'selected' : ''}" data-type="lesion">
          <span class="bc-icon">${ICON.target}</span><span>Lesión / Nevo</span><small>AI-Score de malignidad</small>
        </button>
        <button type="button" class="big-choice hair ${l.type === 'hair' ? 'selected' : ''}" data-type="hair">
          <span class="bc-icon">${ICON.hair}</span><span>Cabello / Tricoscopía</span><small>Alopecia · densidad</small>
        </button>
      </div>`}
      <label>Nombre de la lesión / zona
        <input name="label" value="${esc(l.label || '')}" placeholder="Ej. Nevo espalda alta" required>
      </label>

      <span class="form-label">Localización en el cuerpo</span>
      ${bodyMapMarkup(l.bodyLocation || '')}
      <select name="bodyLocation" id="locSelect" hidden><option value="">—</option>${locOpts}</select>
      <details class="loc-fallback"><summary>Elegir de una lista</summary>
        <div id="locListWrap"></div>
      </details>

      <span class="form-label">Próximo control</span>
      <div class="control-pick" id="controlPick">
        ${CONTROL_INTERVALS.map((iv) => `<button type="button" class="chip-btn" data-months="${iv.months}">${iv.label}</button>`).join('')}
        <button type="button" class="chip-btn" data-months="0">Sin fecha</button>
      </div>
      <input type="date" id="nextControl" value="${l.nextControl ? new Date(l.nextControl).toISOString().slice(0, 10) : ''}">

      <button class="btn btn-primary btn-block" type="submit">${lesionId ? 'Guardar' : 'Crear y abrir'}</button>
      ${lesionId ? `<button class="btn btn-danger-ghost btn-block" type="button" data-del>Eliminar lesión y sus visitas</button>` : ''}
    </form>
  `, { back: lesionId ? `/lesion/${lesionId}` : `/patient/${pid}` });

  let type = l.type || 'lesion';
  $all('[data-type]').forEach((b) => b.addEventListener('click', () => {
    type = b.getAttribute('data-type');
    $all('[data-type]').forEach((x) => x.classList.toggle('selected', x === b));
  }));

  // mapa corporal → escribe en el <select name="bodyLocation">
  const locSelect = $('#locSelect');
  wireBodyMap($('#lform'), (loc) => { locSelect.value = loc; });
  // lista de respaldo (mueve el select a un lugar visible al expandir)
  $('#locListWrap').appendChild(locSelect);
  locSelect.hidden = false;
  locSelect.addEventListener('change', () => {
    // sincroniza el mapa con la lista
    $all('.bm-zone').forEach((z) => z.classList.toggle('active', z.getAttribute('data-loc') === locSelect.value));
    const lbl = $('.bm-selected'); if (lbl && locSelect.value) lbl.textContent = `📍 ${locSelect.value}`;
  });

  // próximo control: chips de intervalo + fecha manual
  const dateInput = $('#nextControl');
  $all('[data-months]').forEach((b) => b.addEventListener('click', () => {
    const m = +b.getAttribute('data-months');
    $all('[data-months]').forEach((x) => x.classList.toggle('active', x === b));
    dateInput.value = m ? new Date(addMonths(Date.now(), m)).toISOString().slice(0, 10) : '';
  }));

  $('#lform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const nextControl = dateInput.value ? new Date(dateInput.value).getTime() : null;
    const saved = await db.saveLesion({ ...l, ...data, type, patientId: pid, nextControl });
    toast(lesionId ? 'Lesión guardada' : 'Lesión creada', 'success');
    go(`/lesion/${saved.id}`);
  });

  const del = $('[data-del]');
  if (del) del.addEventListener('click', async () => {
    const visits = await db.listSessionsByLesion(lesionId);
    if (await confirmDialog(`¿Eliminar esta lesión y sus ${visits.length} visita(s) con fotos y análisis?`)) {
      await db.deleteLesion(lesionId);
      toast('Lesión eliminada');
      go(`/patient/${pid}`);
    }
  });
}

// ---------- DETALLE: línea de tiempo de visitas ----------
export async function renderLesion(id) {
  const l = await db.getLesion(id);
  if (!l) return go('/');
  const p = await db.getPatient(l.patientId);
  const visits = await db.listSessionsByLesion(id); // asc por fecha

  // recolecta thumb + score de cada visita
  const items = [];
  const scores = [];
  for (const s of visits) {
    const photos = await db.listPhotos(s.id);
    const analyses = await db.listAnalyses(s.id);
    const r = analyses[0]?.result || null;
    if (r?.type === 'lesion') scores.push(r.score);
    const macro = photos.find((x) => x.kind === 'macro') || photos[0];
    items.push({ s, thumb: macro?.thumb || null, r, nPhotos: photos.length });
  }

  const timeline = items.length ? `<div class="timeline">${items.slice().reverse().map(({ s, thumb, r, nPhotos }, i) => `
    <button class="tl-item card-press" data-go="/session/${s.id}">
      <span class="tl-rail"><span class="tl-dot ${i === 0 ? 'latest' : ''}"></span></span>
      ${thumb ? `<img class="tl-thumb" src="${thumb}" alt="">` : `<span class="tl-thumb tl-thumb-empty">${ICON.camera}</span>`}
      <span class="tl-info">
        <span class="tl-date">${fmtDate(s.createdAt)} ${i === 0 ? '<em class="tl-tag">reciente</em>' : ''}</span>
        <span class="tl-sub">${nPhotos} foto${nPhotos === 1 ? '' : 's'}${s.notes ? ' · ' + esc(s.notes.slice(0, 36)) + (s.notes.length > 36 ? '…' : '') : ''}</span>
      </span>
      ${r ? scoreBadge(r) : '<span class="tl-noscore">sin análisis</span>'}
      <span class="chev">${ICON.chev}</span>
    </button>`).join('')}</div>` :
    `<div class="empty small">
       <div class="empty-icon">${ICON.camera}</div>
       <p>Aún no hay visitas. Captura la primera para iniciar el seguimiento.</p>
     </div>`;

  // chip de próximo control
  let controlChip = '';
  if (l.nextControl) {
    const days = Math.round((l.nextControl - Date.now()) / 86400000);
    const cls = days < 0 ? 'overdue' : (days <= 14 ? 'soon' : 'ok');
    const txt = days < 0 ? `Control vencido (${-days}d)` : (days === 0 ? 'Control hoy' : `Próximo control en ${days}d`);
    controlChip = `<span class="control-chip ${cls}">${ICON.calendar} ${txt} · ${fmtDate(l.nextControl)}</span>`;
  }

  chrome(l.label, `
    <div class="lesion-head">
      <span class="lesion-icon big ${l.type}">${l.type === 'hair' ? ICON.hair : ICON.target}</span>
      <div class="lh-info">
        <p class="muted">${esc(p.firstName)} ${esc(p.lastName)} · ${esc(l.bodyLocation || 'Sin localización')}</p>
        <span class="type-badge ${l.type}">${l.type === 'hair' ? 'Tricoscopía' : 'Lesión / Nevo'}</span>
      </div>
      <button class="icon-btn" data-go="/lesion/${id}/edit">${ICON.edit}</button>
    </div>
    ${controlChip}

    ${scores.length >= 2 ? `
    <div class="spark-card">
      <div class="spark-head">${ICON.chart}<span>Evolución del AI-Score</span><b>${scores[scores.length - 1]}</b></div>
      ${sparkline(scores)}
    </div>` : ''}

    <div class="actions-row">
      <button class="btn btn-primary" id="newVisit">${ICON.camera} Nueva visita</button>
      <button class="btn btn-outline" data-go="/compare/${id}" ${visits.length < 2 ? 'disabled' : ''}>${ICON.compare} Comparar</button>
    </div>
    ${visits.length < 2 ? '<p class="muted small center">Con 2+ visitas podrás comparar la evolución lado a lado.</p>' : ''}

    <h3 class="section-title">Línea de tiempo (${visits.length})</h3>
    ${timeline}
  `, { back: `/patient/${l.patientId}` });

  $('#newVisit').addEventListener('click', async () => {
    const s = await db.saveSession({
      patientId: l.patientId, lesionId: id, type: l.type,
      bodyLocation: l.bodyLocation || '', notes: '', status: 'open',
    });
    go(`/session/${s.id}`);
  });
}

function scoreBadge(r) {
  if (r.type === 'lesion') {
    return `<span class="tl-score" style="--c:${r.riskColor}"><b>${r.score}</b><small>score</small></span>`;
  }
  return `<span class="tl-score" style="--c:#60a5fa"><b>${r.density}</b><small>/cm²</small></span>`;
}

// mini-gráfica SVG de la serie de AI-Scores
function sparkline(scores) {
  const w = 280, h = 64, pad = 8;
  const min = Math.min(...scores), max = Math.max(...scores);
  const span = (max - min) || 1;
  const px = (i) => pad + (i * (w - 2 * pad)) / (scores.length - 1);
  const py = (v) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const pts = scores.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const lastX = px(scores.length - 1).toFixed(1), lastY = py(scores[scores.length - 1]).toFixed(1);
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline class="spark-line" points="${pts}"/>
    <circle class="spark-dot" cx="${lastX}" cy="${lastY}" r="3.5"/>
  </svg>`;
}
