// =====================================================================
// Generación de reportes PDF con jsPDF (cargado por CDN: window.jspdf).
//   · generateReport          — una VISITA (sesión): fotos + análisis.
//   · generateComparisonReport — COMPARACIÓN de dos visitas (§6.1):
//     dos columnas A|B con macro/micro, tabla de evolución y veredicto.
// =====================================================================
import { CONFIG } from './config.js';
import { renderWithMarker, blobToDataURL } from './camera.js';

const COL = {
  bg: '#0e1117', ink: '#1b2330', accent: '#3b82f6',
  sub: '#6b7280', line: '#d0d5dd',
};

// colores por severidad de delta (tabla de evolución)
const SEV_INK = { bad: '#be123c', warn: '#b45309', ok: '#059669', flat: '#6b7280' };
// tintes del recuadro de veredicto
const VERDICT_TINT = {
  stable: { fill: '#e7f9f2', ink: '#0f9d76' },
  minor: { fill: '#fef5e0', ink: '#b45309' },
  attention: { fill: '#fde8ec', ink: '#be123c' },
};

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(ts) {
  return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ageFromDob(dob) {
  if (!dob) return '—';
  const b = new Date(dob), now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return `${a} años`;
}

async function photoDataURL(photo, maxSide = 1400) {
  if (photo.marker) return renderWithMarker(photo.blob, photo.marker, maxSide);
  return blobToDataURL(photo.blob);
}

// encabezado de marca común
function brandHeader(doc, W, M, rightTitle, rightSub) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(CONFIG.APP_NAME, M, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor('#93c5fd');
  doc.text(CONFIG.APP_TAGLINE, M, 19);
  doc.setTextColor('#cbd5e1');
  doc.text(rightTitle, W - M, 13, { align: 'right' });
  doc.setFontSize(8);
  doc.text(rightSub, W - M, 19, { align: 'right' });
}

// pie común: línea + profesional + disclaimer
function footer(doc, W, H, M, clinician) {
  const footerY = H - 24;
  doc.setDrawColor(COL.line); doc.line(M, footerY, W - M, footerY);
  if (clinician && (clinician.name || clinician.clinic)) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(COL.ink);
    doc.text([clinician.name, clinician.clinic].filter(Boolean).join(' · '), M, footerY + 5);
  }
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor('#9ca3af');
  const dis = doc.splitTextToSize(CONFIG.DISCLAIMER, W - 2 * M);
  doc.text(dis, M, footerY + 10);
}

function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'lesion';
}

// =====================================================================
// REPORTE DE VISITA (sesión)
// =====================================================================
export async function generateReport({ patient, session, photos, analyses, clinician }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  let y = 0;

  const typeLabel = session.type === 'hair' ? 'Reporte de Tricoscopía' : 'Reporte de Lesión';
  brandHeader(doc, W, M, typeLabel, fmtDate(session.createdAt));
  y = 34;

  // ---------- Datos del paciente ----------
  doc.setTextColor(COL.ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Paciente', M, y); y += 2;
  doc.setDrawColor(COL.line); doc.line(M, y, W - M, y); y += 6;

  const rows = [
    ['Nombre', `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || '—'],
    ['Fecha de nacimiento', patient.dob ? `${patient.dob} (${ageFromDob(patient.dob)})` : '—'],
    ['Sexo', patient.sex || '—'],
    ['País', patient.country || '—'],
    ['Altura', patient.height ? `${patient.height} cm` : '—'],
    ['Localización', session.bodyLocation || '—'],
  ];
  doc.setFontSize(9.5);
  const colW = (W - 2 * M) / 2;
  rows.forEach((r, i) => {
    const cx = M + (i % 2) * colW;
    const cy = y + Math.floor(i / 2) * 7;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(COL.sub);
    doc.text(r[0] + ':', cx, cy);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(COL.ink);
    doc.text(String(r[1]), cx + 34, cy);
  });
  y += Math.ceil(rows.length / 2) * 7 + 4;

  if (session.notes) {
    doc.setFont('helvetica', 'italic'); doc.setTextColor(COL.sub); doc.setFontSize(9);
    const lines = doc.splitTextToSize('Notas: ' + session.notes, W - 2 * M);
    doc.text(lines, M, y); y += lines.length * 4.5 + 2;
  }

  // ---------- Imágenes ----------
  const macro = photos.find((p) => p.kind === 'macro');
  const micro = photos.find((p) => p.kind === 'micro');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(COL.ink);
  doc.text('Imágenes', M, y); y += 2;
  doc.line(M, y, W - M, y); y += 5;

  const imgW = (W - 2 * M - 8) / 2;
  const imgH = imgW * 0.75;
  async function placeImage(photo, label, x) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(COL.sub);
    doc.text(label, x, y);
    if (photo) {
      const dataURL = await photoDataURL(photo, 1400);
      try {
        doc.addImage(dataURL, 'JPEG', x, y + 1.5, imgW, imgH, undefined, 'FAST');
      } catch (e) { /* imagen inválida: omitir */ }
      doc.setDrawColor(COL.line); doc.rect(x, y + 1.5, imgW, imgH);
    } else {
      doc.setDrawColor(COL.line); doc.setFillColor('#f3f4f6');
      doc.rect(x, y + 1.5, imgW, imgH, 'FD');
      doc.setTextColor('#9ca3af');
      doc.text('Sin imagen', x + imgW / 2, y + 1.5 + imgH / 2, { align: 'center' });
    }
  }
  await placeImage(macro, 'MACRO (panorámica + marcador de lesión)', M);
  await placeImage(micro, 'MICRO (dermatoscopía con zoom)', M + imgW + 8);
  y += imgH + 10;

  // ---------- Resultados del análisis ----------
  const analysis = analyses && analyses[0] ? analyses[0].result : null;
  if (analysis) {
    if (y > H - 70) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(COL.ink);
    doc.text('Evaluación asistida por IA', M, y); y += 2;
    doc.line(M, y, W - M, y); y += 6;

    if (analysis.type === 'lesion') {
      doc.setFillColor(analysis.riskColor || '#888');
      doc.roundedRect(M, y, 56, 26, 2, 2, 'F');
      doc.setTextColor('#ffffff'); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
      doc.text(String(analysis.score), M + 8, y + 16);
      doc.setFontSize(8); doc.text('AI-SCORE', M + 8, y + 22);
      doc.setFontSize(11);
      doc.text(`Riesgo ${analysis.risk}`, M + 26, y + 14);

      const dx = M + 64;
      doc.setTextColor(COL.ink); doc.setFontSize(9);
      const det = [
        `Asimetría: ${analysis.abcd.asymmetry}/2`,
        `Borde: ${analysis.abcd.border}/8`,
        `Colores: ${analysis.abcd.colors}`,
        `Estructuras: ${analysis.abcd.structures}`,
        `TDS: ${analysis.tds}`,
        `Patrones: ${analysis.patterns.join(', ') || '—'}`,
      ];
      det.forEach((t, i) => {
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(t, W - dx - M);
        doc.text(lines, dx, y + 4 + i * 4);
      });
      y += 30;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(COL.ink);
      const rec = doc.splitTextToSize('Recomendación: ' + analysis.recommendation, W - 2 * M);
      doc.text(rec, M, y); y += rec.length * 4.5 + 2;
    } else {
      const metrics = [
        ['Densidad', `${analysis.density} cab/cm²`],
        ['Unidades foliculares', `${analysis.follicularUnits} UF/cm²`],
        ['Cabellos por folículo', `${analysis.hairsPerUnit}`],
        ['Terminal / Vellus', `${analysis.terminalPct}% / ${analysis.vellusPct}%`],
        ['Anisotricosis', `${analysis.anisotrichosis}%`],
        ['Grosor medio', `${analysis.avgThickness} µm`],
      ];
      doc.setFontSize(9.5);
      metrics.forEach((r, i) => {
        const cx = M + (i % 2) * colW;
        const cy = y + Math.floor(i / 2) * 7;
        doc.setFont('helvetica', 'bold'); doc.setTextColor(COL.sub);
        doc.text(r[0] + ':', cx, cy);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(COL.ink);
        doc.text(String(r[1]), cx + 38, cy);
      });
      y += Math.ceil(metrics.length / 2) * 7 + 3;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(COL.ink);
      doc.text('Hallazgos:', M, y); y += 5;
      analysis.findings.forEach((f) => {
        const dot = f.detected ? '●' : '○';
        doc.setFont('helvetica', 'bold'); doc.setTextColor(f.detected ? '#b45309' : '#15803d');
        doc.text(`${dot} ${f.name} (${f.confidence}%)`, M, y); y += 4.5;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(COL.sub); doc.setFontSize(8.5);
        const ln = doc.splitTextToSize(f.note, W - 2 * M - 4);
        doc.text(ln, M + 4, y); y += ln.length * 4 + 1.5;
        doc.setFontSize(9.5);
      });
    }
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor('#9ca3af');
    doc.text(`Motor: ${analysis.engine}`, M, y); y += 5;
  }

  footer(doc, W, H, M, clinician);

  const fname = `${CONFIG.APP_SHORT}_${(patient.lastName || 'paciente')}_${session.type}_${new Date(session.createdAt).toISOString().slice(0, 10)}.pdf`;
  return { doc, filename: fname.replace(/\s+/g, '') };
}

export async function downloadReport(args) {
  const { doc, filename } = await generateReport(args);
  doc.save(filename);
}

// =====================================================================
// REPORTE DE COMPARACIÓN (dos columnas: visita A | visita B)
// =====================================================================
export async function generateComparisonReport({
  patient, lesion, sessionA, sessionB, photosA, photosB,
  analysisA, analysisB, rows, verdict, days, clinician,
}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const colW = (W - 2 * M - 6) / 2;       // dos columnas A|B
  const xA = M, xB = M + colW + 6;
  let y = 0;

  const dA = fmtDateShort(sessionA.createdAt);
  const dB = fmtDateShort(sessionB.createdAt);

  brandHeader(doc, W, M, 'Reporte de comparación', `${dA}  →  ${dB}`);
  y = 34;

  // salto de página si no cabe `need` mm
  const ensure = (need) => {
    if (y + need > H - 28) { doc.addPage(); y = 20; }
  };

  // ---------- Paciente + lesión + periodo ----------
  doc.setTextColor(COL.ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Seguimiento', M, y); y += 2;
  doc.setDrawColor(COL.line); doc.line(M, y, W - M, y); y += 6;

  const info = [
    ['Paciente', `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || '—'],
    ['Edad', patient.dob ? ageFromDob(patient.dob) : '—'],
    ['Lesión / zona', lesion ? lesion.label : 'Comparación ad-hoc'],
    ['Localización', (lesion?.bodyLocation || sessionB.bodyLocation) || '—'],
    ['Periodo', `${dA} → ${dB}`],
    ['Tiempo transcurrido', `${days} días`],
  ];
  doc.setFontSize(9.5);
  info.forEach((r, i) => {
    const cx = M + (i % 2) * ((W - 2 * M) / 2);
    const cy = y + Math.floor(i / 2) * 7;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(COL.sub);
    doc.text(r[0] + ':', cx, cy);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(COL.ink);
    doc.text(String(r[1]), cx + 38, cy);
  });
  y += Math.ceil(info.length / 2) * 7 + 4;

  // ---------- Encabezados de columna ----------
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.setFillColor('#eef2ff');
  doc.roundedRect(xA, y, colW, 8, 1.5, 1.5, 'F');
  doc.roundedRect(xB, y, colW, 8, 1.5, 1.5, 'F');
  doc.setTextColor('#3730a3');
  doc.text(`VISITA A · ${dA}`, xA + colW / 2, y + 5.5, { align: 'center' });
  doc.text(`VISITA B · ${dB}`, xB + colW / 2, y + 5.5, { align: 'center' });
  y += 12;

  // ---------- Pares de imágenes ----------
  const imgH = colW * 0.66;
  async function imagePair(kind, label) {
    const pa = (photosA || []).find((p) => p.kind === kind);
    const pb = (photosB || []).find((p) => p.kind === kind);
    if (!pa && !pb) return;
    ensure(imgH + 10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(COL.sub);
    doc.text(label, M, y); y += 1.5;
    async function cell(photo, x) {
      if (photo) {
        const dataURL = await photoDataURL(photo, 1200);
        try {
          doc.addImage(dataURL, 'JPEG', x, y, colW, imgH, undefined, 'FAST');
        } catch (e) { /* imagen inválida: omitir */ }
        doc.setDrawColor(COL.line); doc.rect(x, y, colW, imgH);
      } else {
        doc.setDrawColor(COL.line); doc.setFillColor('#f3f4f6');
        doc.rect(x, y, colW, imgH, 'FD');
        doc.setTextColor('#9ca3af'); doc.setFont('helvetica', 'normal');
        doc.text('Sin imagen', x + colW / 2, y + imgH / 2, { align: 'center' });
      }
    }
    await cell(pa, xA);
    await cell(pb, xB);
    y += imgH + 6;
  }
  await imagePair('macro', 'MACRO (panorámica + marcador)');
  await imagePair('micro', 'MICRO (dermatoscopía con zoom)');

  // ---------- Tabla de evolución ----------
  if (rows && rows.length) {
    ensure(12 + rows.length * 6 + 8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(COL.ink);
    doc.text('Tabla de evolución', M, y); y += 2;
    doc.setDrawColor(COL.line); doc.line(M, y, W - M, y); y += 5;

    const tW = W - 2 * M;
    const cMetric = M + 2, cA = M + tW * 0.40, cB = M + tW * 0.58, cD = M + tW * 0.78;
    doc.setFillColor('#f1f5f9');
    doc.rect(M, y - 4, tW, 6.5, 'F');
    doc.setFontSize(8.5); doc.setTextColor(COL.sub);
    doc.text('MÉTRICA', cMetric, y);
    doc.text(`A · ${dA}`, cA, y);
    doc.text(`B · ${dB}`, cB, y);
    doc.text('CAMBIO', cD, y);
    y += 6;

    doc.setFontSize(9);
    rows.forEach((r) => {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(COL.ink);
      doc.text(String(r.label), cMetric, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(r.a), cA, y);
      doc.text(String(r.b), cB, y);
      const arrow = r.dir > 0 ? '▲' : (r.dir < 0 ? '▼' : '=');
      doc.setFont('helvetica', 'bold'); doc.setTextColor(SEV_INK[r.sev] || COL.ink);
      doc.text(`${arrow} ${r.delta}`, cD, y);
      doc.setDrawColor('#eceff3'); doc.line(M, y + 1.8, W - M, y + 1.8);
      y += 6;
    });
    y += 4;
  } else {
    ensure(10);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(COL.sub);
    doc.text('Sin tabla de evolución: una o ambas visitas no tienen análisis IA.', M, y);
    y += 8;
  }

  // ---------- Veredicto ----------
  if (verdict) {
    ensure(24);
    const tint = VERDICT_TINT[verdict.level] || VERDICT_TINT.stable;
    doc.setFillColor(tint.fill);
    doc.setDrawColor(tint.ink);
    doc.roundedRect(M, y, W - 2 * M, 18, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(tint.ink);
    doc.text(`Evolución: ${verdict.label}`, M + 5, y + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    const det = doc.splitTextToSize(`${verdict.detail} Veredicto asistencial automático — no diagnóstico.`, W - 2 * M - 10);
    doc.text(det, M + 5, y + 12);
    y += 24;
  }

  // ---------- Recomendación (de la visita más reciente) ----------
  if (analysisB?.recommendation) {
    ensure(12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(COL.ink);
    const rec = doc.splitTextToSize('Recomendación (visita B): ' + analysisB.recommendation, W - 2 * M);
    doc.text(rec, M, y); y += rec.length * 4.5 + 2;
  }
  if (analysisA && analysisB) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor('#9ca3af');
    doc.text(`Motor: ${analysisB.engine}`, M, y); y += 4;
  }

  footer(doc, W, H, M, clinician);

  const fname = `${CONFIG.APP_SHORT}_${(patient.lastName || 'paciente')}_comparacion_${slug(lesion?.label)}_` +
    `${new Date(sessionA.createdAt).toISOString().slice(0, 10)}_${new Date(sessionB.createdAt).toISOString().slice(0, 10)}.pdf`;
  return { doc, filename: fname.replace(/\s+/g, '') };
}

export async function downloadComparisonReport(args) {
  const { doc, filename } = await generateComparisonReport(args);
  doc.save(filename);
}
