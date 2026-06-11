// =====================================================================
// Vista SESIÓN (una visita): workflow de captura macro/micro, marcador
// de lesión, análisis IA y reporte PDF de la visita.
// =====================================================================
import { CONFIG, BODY_LOCATIONS } from '../config.js';
import * as db from '../db.js';
import { captureFromCamera, compressImage, makeThumb } from '../camera.js';
import { runAnalysis } from '../ai.js';
import { downloadReport } from '../pdf.js';
import {
  chrome, ICON, esc, url, $, $all, initials, fmtDate,
  toast, confirmDialog, spinner, go, rerender,
} from '../ui.js';

export async function renderSession(id) {
  const s = await db.getSession(id);
  if (!s) return go('/');
  const p = await db.getPatient(s.patientId);
  const lesion = s.lesionId ? await db.getLesion(s.lesionId) : null;
  const photos = await db.listPhotos(id);
  const analyses = await db.listAnalyses(id);
  const macro = photos.find((x) => x.kind === 'macro');
  const micro = photos.find((x) => x.kind === 'micro');
  const isHair = s.type === 'hair';
  const backTo = lesion ? `/lesion/${lesion.id}` : `/patient/${s.patientId}`;

  const locOpts = BODY_LOCATIONS.map((l) => `<option ${s.bodyLocation === l ? 'selected' : ''}>${l}</option>`).join('');

  function photoCard(kind, photo, title, hint) {
    if (photo) {
      const marked = kind === 'macro' && photo.marker;
      return `<div class="photo-card filled">
        <div class="photo-wrap">
          <img src="${url(photo.blob)}" alt="${kind}">
          ${marked ? `<span class="pin" style="left:${photo.marker.x * 100}%;top:${photo.marker.y * 100}%"></span>` : ''}
          ${kind === 'macro' ? `<button class="mark-btn ${photo.marker ? 'done' : ''}" data-mark="${photo.id}">${photo.marker ? '✓ Lesión marcada' : '＋ Marcar lesión'}</button>` : ''}
        </div>
        <div class="photo-foot">
          <span>${esc(title)}</span>
          <div class="photo-foot-actions">
            <button class="mini-btn" data-recapture="${kind}" data-replace="${photo.id}">↻ Repetir</button>
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
    `<button class="btn btn-primary btn-block" data-analyze ${(!macro && !micro) ? 'disabled' : ''}>
       ✨ Analizar con IA ${(!macro && !micro) ? '(captura una foto primero)' : ''}
     </button>`;

  chrome(isHair ? 'Visita · Tricoscopía' : 'Visita · Lesión', `
    <div class="session-patient">
      <span class="avatar">${esc(initials(p))}</span>
      <div class="sp-info"><strong>${esc(p.firstName)} ${esc(p.lastName)}</strong>
      <small class="muted">${lesion ? esc(lesion.label) + ' · ' : ''}${fmtDate(s.createdAt)}</small></div>
      <span class="type-badge ${s.type}">${isHair ? 'Trico' : 'Lesión'}</span>
    </div>

    <label class="inline-field">Localización en el cuerpo
      <select id="loc"><option value="">—</option>${locOpts}</select>
    </label>

    <h3 class="section-title"><span class="step-n">1</span> Imagen macro <small>(panorámica)</small></h3>
    ${photoCard('macro', macro, 'Foto macro', 'Toma una vista amplia de la zona')}

    <h3 class="section-title"><span class="step-n">2</span> Imagen micro <small>(zoom dermatoscópico)</small></h3>
    ${photoCard('micro', micro, 'Foto micro', 'Usa el zoom de la cámara sobre la lesión')}

    <h3 class="section-title"><span class="step-n">3</span> Análisis IA <small class="sim">simulado</small></h3>
    <div id="analysisArea">${analysisCard}</div>

    <h3 class="section-title"><span class="step-n">4</span> Reporte</h3>
    <button class="btn btn-outline btn-block" data-pdf ${(!macro && !micro) ? 'disabled' : ''}>${ICON.pdf} Generar reporte PDF</button>

    <label class="inline-field">Notas de la visita
      <textarea id="notes" rows="2" placeholder="Observaciones clínicas…">${esc(s.notes || '')}</textarea>
    </label>

    <button class="btn btn-danger-ghost btn-block" data-delsession>Eliminar visita</button>
    <p class="disclaimer">${esc(CONFIG.DISCLAIMER)}</p>
  `, { back: backTo, subtitle: lesion ? lesion.label : undefined });

  // guardar localización / notas
  $('#loc').addEventListener('change', async (e) => { s.bodyLocation = e.target.value; await db.saveSession(s); });
  $('#notes').addEventListener('change', async (e) => { s.notes = e.target.value; await db.saveSession(s); });

  // capturar / recapturar
  $all('[data-capture],[data-recapture]').forEach((b) => b.addEventListener('click', async () => {
    const kind = b.getAttribute('data-capture') || b.getAttribute('data-recapture');
    await capturePhoto(id, kind, b.getAttribute('data-replace'));
  }));

  // marcar lesión
  const markBtn = $('[data-mark]');
  if (markBtn) markBtn.addEventListener('click', () => openMarker(markBtn.getAttribute('data-mark')));

  // borrar foto
  $all('[data-delphoto]').forEach((b) => b.addEventListener('click', async () => {
    await db.deletePhoto(b.getAttribute('data-delphoto'));
    rerender();
  }));

  // analizar / re-analizar
  async function analyze(existingId) {
    const target = micro || macro;
    if (!target) return;
    const close = spinner('Analizando imagen…');
    await new Promise((r) => setTimeout(r, 900)); // simula procesamiento
    const result = runAnalysis(s.type, target);
    await db.saveAnalysis({ id: existingId, sessionId: id, photoId: target.id, type: s.type, result });
    close();
    toast('Análisis completado', 'success');
    rerender();
  }
  const aBtn = $('[data-analyze]');
  if (aBtn) aBtn.addEventListener('click', () => analyze(undefined));
  const reBtn = $('[data-reanalyze]');
  if (reBtn) reBtn.addEventListener('click', () => analyze(analyses[0]?.id));

  // PDF de la visita
  $('[data-pdf]').addEventListener('click', async () => {
    const close = spinner('Generando PDF…');
    try {
      const clinician = await db.getSetting('clinician', {});
      await downloadReport({ patient: p, session: s, photos, analyses, clinician });
      toast('PDF generado', 'success');
    } catch (e) { console.error(e); toast('Error al generar PDF', 'error'); }
    finally { close(); }
  });

  // borrar visita
  $('[data-delsession]').addEventListener('click', async () => {
    if (await confirmDialog('¿Eliminar esta visita completa (fotos y análisis)?')) {
      await db.deleteSession(id); toast('Visita eliminada'); go(backTo);
    }
  });
}

// tarjeta de resultados (lesión: anillo de score · cabello: métricas)
export function renderAnalysisCard(a) {
  if (a.type === 'lesion') {
    return `<div class="analysis-card">
      <div class="ring" style="--p:${a.score};--c:${a.riskColor}">
        <div class="ring-in"><b>${a.score}</b><small>AI-Score</small></div>
      </div>
      <div class="analysis-body">
        <strong class="risk-line" style="color:${a.riskColor}">Riesgo ${a.risk}</strong>
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

// captura una foto, la comprime y la guarda
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
  finally { close(); rerender(); }
}

// editor de marcador de lesión sobre la macro
async function openMarker(photoId) {
  const photo = await db.getPhoto(photoId);
  const wrap = document.createElement('div');
  wrap.className = 'marker-overlay';
  wrap.innerHTML = `
    <div class="marker-top">
      <button class="btn btn-ghost" data-cancel>Cancelar</button>
      <span>Toca la lesión</span>
      <button class="btn btn-primary" data-save disabled>Guardar</button>
    </div>
    <div class="marker-stage">
      <div class="marker-img">
        <img id="markimg" src="${url(photo.blob)}">
        <span class="pin big" id="pin" style="display:${photo.marker ? 'block' : 'none'};left:${(photo.marker?.x ?? 0.5) * 100}%;top:${(photo.marker?.y ?? 0.5) * 100}%"></span>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  let marker = photo.marker || null;
  const pin = $('#pin', wrap), saveBtn = $('[data-save]', wrap);
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
    rerender();
  });
}
