// =====================================================================
// Vista COMPARACIÓN (§6.1): dos visitas lado a lado (A = anterior,
// B = reciente) con macro/micro, tabla de deltas y veredicto de
// evolución. Funciona por lesión (principal) y ad-hoc (2 sesiones).
// =====================================================================
import { CONFIG } from '../config.js';
import * as db from '../db.js';
import { buildComparison } from '../evolution.js';
import { downloadComparisonReport } from '../pdf.js';
import {
  chrome, ICON, esc, url, $, $all, fmtDate, toast, spinner, go, lightbox,
} from '../ui.js';

export async function renderCompare({ lesionId, patientId, q }) {
  // ----- contexto: lesión o ad-hoc -----
  let lesion = null, sessions = [], patient = null;
  if (lesionId) {
    lesion = await db.getLesion(lesionId);
    if (!lesion) return go('/');
    patient = await db.getPatient(lesion.patientId);
    sessions = await db.listSessionsByLesion(lesionId); // asc
  } else {
    patient = await db.getPatient(patientId);
    if (!patient) return go('/');
    sessions = (await db.listSessions(patientId)).slice().sort((a, b) => a.createdAt - b.createdAt);
  }
  const backTo = lesion ? `/lesion/${lesion.id}` : `/patient/${patient.id}?tab=sessions`;

  if (sessions.length < 2) {
    chrome('Comparar', `<div class="empty">
      <div class="empty-icon">${ICON.compare}</div>
      <h3>Se necesitan 2 visitas</h3>
      <p>Captura al menos dos visitas para comparar la evolución.</p>
    </div>`, { back: backTo });
    return;
  }

  // ----- visitas A y B (default: más antigua vs. más reciente) -----
  const find = (id) => sessions.find((s) => s.id === id);
  let sA = find(q?.get('a')) || sessions[0];
  let sB = find(q?.get('b')) || sessions[sessions.length - 1];
  if (sA.id === sB.id) sB = sessions[sessions.length - 1] !== sA ? sessions[sessions.length - 1] : sessions[0];

  const sameType = sA.type === sB.type;
  const base = lesion ? `/compare/${lesion.id}` : `/compare-adhoc/${patient.id}`;

  // ----- datos de ambas visitas -----
  const [photosA, photosB, anA, anB] = await Promise.all([
    db.listPhotos(sA.id), db.listPhotos(sB.id),
    db.listAnalyses(sA.id), db.listAnalyses(sB.id),
  ]);
  const A = anA[0]?.result || null;
  const B = anB[0]?.result || null;

  const cmp = sameType
    ? buildComparison({ type: sA.type, analysisA: A, analysisB: B, dateA: sA.createdAt, dateB: sB.createdAt })
    : { days: 0, rows: null, verdict: null };

  // ----- selectores de visita -----
  const opts = (sel) => sessions.map((s) =>
    `<option value="${s.id}" ${s.id === sel.id ? 'selected' : ''}>${fmtDate(s.createdAt)}${lesion ? '' : ' · ' + (s.type === 'hair' ? 'Trico' : 'Lesión')}</option>`).join('');

  // ----- pares de imágenes -----
  function imgPair(kind, title) {
    const pa = photosA.find((x) => x.kind === kind);
    const pb = photosB.find((x) => x.kind === kind);
    if (!pa && !pb) return '';
    const cell = (ph, tag) => ph ? `
      <div class="cmp-cell" data-zoom="${tag}:${kind}">
        <img src="${url(ph.blob)}" alt="">
        ${ph.marker ? `<span class="pin" style="left:${ph.marker.x * 100}%;top:${ph.marker.y * 100}%"></span>` : ''}
        <span class="cmp-tag">${tag}</span>
      </div>` :
      `<div class="cmp-cell empty-cell"><span>${ICON.camera}</span><small>Sin foto</small></div>`;
    return `
      <h3 class="section-title">${esc(title)}</h3>
      <div class="cmp-pair">${cell(pa, 'A')}${cell(pb, 'B')}</div>`;
  }

  // ----- tabla de deltas -----
  let deltaTable = '';
  if (!sameType) {
    deltaTable = `<p class="note warn">Las visitas son de tipos distintos (lesión vs. tricoscopía); no es posible comparar métricas.</p>`;
  } else if (!cmp.rows) {
    deltaTable = `<p class="note">Analiza ambas visitas con IA para ver la tabla de evolución.
      ${!A ? `<br>· La visita A (${fmtDate(sA.createdAt)}) no tiene análisis.` : ''}
      ${!B ? `<br>· La visita B (${fmtDate(sB.createdAt)}) no tiene análisis.` : ''}</p>`;
  } else {
    deltaTable = `
      <div class="delta-table">
        <div class="dt-row dt-head">
          <span>Métrica</span><span>A · ${fmtDate(sA.createdAt)}</span><span>B · ${fmtDate(sB.createdAt)}</span><span>Δ</span>
        </div>
        ${cmp.rows.map((r) => `
        <div class="dt-row">
          <span class="dt-label">${esc(r.label)}</span>
          <span class="dt-a">${esc(String(r.a))}</span>
          <span class="dt-b">${esc(String(r.b))}</span>
          <span class="dt-delta sev-${r.sev}">${r.dir > 0 ? '▲' : (r.dir < 0 ? '▼' : '＝')} ${esc(r.delta)}</span>
        </div>`).join('')}
      </div>`;
  }

  const verdictHtml = cmp.verdict ? `
    <div class="verdict v-${cmp.verdict.level}" style="--c:${cmp.verdict.color}">
      <b>${cmp.verdict.level === 'attention' ? '⚠ ' : (cmp.verdict.level === 'stable' ? '✓ ' : '')}${esc(cmp.verdict.label)}</b>
      <span>${esc(cmp.verdict.detail)}</span>
      <small>Veredicto asistencial automático — no diagnóstico.</small>
    </div>` : '';

  chrome('Comparación', `
    <div class="cmp-context">
      <strong>${esc(lesion ? lesion.label : 'Comparación rápida')}</strong>
      <span class="muted">${esc(patient.firstName)} ${esc(patient.lastName)}${cmp.days ? ` · ${cmp.days} días entre visitas` : ''}</span>
    </div>

    <div class="visit-pickers">
      <label>Visita A <select id="selA">${opts(sA)}</select></label>
      <button class="icon-btn swap" id="swap" title="Intercambiar">${ICON.swap}</button>
      <label>Visita B <select id="selB">${opts(sB)}</select></label>
    </div>

    ${imgPair('macro', 'Macro · panorámica')}
    ${imgPair('micro', 'Micro · dermatoscopía')}

    <h3 class="section-title">Evolución</h3>
    ${deltaTable}
    ${verdictHtml}

    <button class="btn btn-primary btn-block" data-cmppdf ${(!sameType) ? 'disabled' : ''}>${ICON.pdf} Generar reporte de comparación</button>
    <p class="disclaimer">${esc(CONFIG.DISCLAIMER)}</p>
  `, { back: backTo, subtitle: lesion ? `${patient.firstName} ${patient.lastName}` : undefined });

  // cambiar visitas
  const nav = (a, b) => go(`${base}?a=${a}&b=${b}`);
  $('#selA').addEventListener('change', (e) => nav(e.target.value, sB.id));
  $('#selB').addEventListener('change', (e) => nav(sA.id, e.target.value));
  $('#swap').addEventListener('click', () => nav(sB.id, sA.id));

  // zoom de imagen
  $all('[data-zoom]').forEach((c) => c.addEventListener('click', () => {
    const img = $('img', c);
    if (!img) return;
    const [tag, kind] = c.getAttribute('data-zoom').split(':');
    const s = tag === 'A' ? sA : sB;
    lightbox(img.src, `Visita ${tag} · ${kind} · ${fmtDate(s.createdAt)}`);
  }));

  // PDF de comparación
  const pdfBtn = $('[data-cmppdf]');
  if (pdfBtn && !pdfBtn.disabled) pdfBtn.addEventListener('click', async () => {
    const close = spinner('Generando PDF de comparación…');
    try {
      const clinician = await db.getSetting('clinician', {});
      await downloadComparisonReport({
        patient, lesion,
        sessionA: sA, sessionB: sB,
        photosA, photosB,
        analysisA: A, analysisB: B,
        rows: cmp.rows, verdict: cmp.verdict, days: cmp.days,
        clinician,
      });
      toast('PDF de comparación generado', 'success');
    } catch (e) { console.error(e); toast('Error al generar PDF', 'error'); }
    finally { close(); }
  });
}
