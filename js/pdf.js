// =====================================================================
// Generación de reportes PDF con jsPDF (cargado por CDN: window.jspdf).
// Un reporte cubre una SESIÓN: datos del paciente, fotos macro/micro
// con marcador de lesión, resultados del análisis y disclaimer.
// =====================================================================
import { CONFIG } from './config.js';
import { renderWithMarker, blobToDataURL } from './camera.js';

const COL = {
  bg: '#0e1117', ink: '#1b2330', accent: '#3b82f6',
  sub: '#6b7280', line: '#d0d5dd',
};

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function ageFromDob(dob) {
  if (!dob) return '—';
  const b = new Date(dob), now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return `${a} años`;
}

export async function generateReport({ patient, session, photos, analyses, clinician }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  let y = 0;

  // ---------- Encabezado ----------
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(CONFIG.APP_NAME, M, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor('#93c5fd');
  doc.text(CONFIG.APP_TAGLINE, M, 19);
  doc.setTextColor('#cbd5e1');
  const typeLabel = session.type === 'hair' ? 'Reporte de Tricoscopía' : 'Reporte de Lesión';
  doc.text(typeLabel, W - M, 13, { align: 'right' });
  doc.setFontSize(8);
  doc.text(fmtDate(session.createdAt), W - M, 19, { align: 'right' });
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
      let dataURL;
      if (photo.kind === 'macro' && photo.marker) {
        dataURL = await renderWithMarker(photo.blob, photo.marker, 1400);
      } else {
        dataURL = await blobToDataURL(photo.blob);
      }
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
      // Tarjeta de AI-Score
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
      // Tricoscopía
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

  // ---------- Pie: disclaimer + clínico ----------
  const footerY = H - 24;
  doc.setDrawColor(COL.line); doc.line(M, footerY, W - M, footerY);
  if (clinician && (clinician.name || clinician.clinic)) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(COL.ink);
    doc.text([clinician.name, clinician.clinic].filter(Boolean).join(' · '), M, footerY + 5);
  }
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor('#9ca3af');
  const dis = doc.splitTextToSize(CONFIG.DISCLAIMER, W - 2 * M);
  doc.text(dis, M, footerY + 10);

  const fname = `${CONFIG.APP_SHORT}_${(patient.lastName || 'paciente')}_${session.type}_${new Date(session.createdAt).toISOString().slice(0, 10)}.pdf`;
  return { doc, filename: fname.replace(/\s+/g, '') };
}

export async function downloadReport(args) {
  const { doc, filename } = await generateReport(args);
  doc.save(filename);
}
