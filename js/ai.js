// =====================================================================
// Motor de análisis.
//
// v2: cuando el escáner de visión (js/cv.js) logra MEDIR la imagen, el
// resultado se construye con esas métricas REALES (ABCD de la lesión;
// conteo/grosor/terminal-vellus del cabello). Si la imagen no es medible
// (poco contraste, encuadre pobre), se cae a un PLACEHOLDER SIMULADO
// estable por foto, para no romper el flujo.
//
// La forma del objeto devuelto es la misma en ambos casos → UI y PDF
// funcionan igual. (Para IA real por API: ver §9 del PLAN.)
// =====================================================================

export const AI_ENGINE = 'Visión local v2 (medición real + respaldo simulado)';

// ------------------------------------------------------------------
// Utilidades comunes
// ------------------------------------------------------------------
function hashStr(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
function range(rnd, min, max, dec = 0) {
  const v = min + rnd() * (max - min);
  return dec ? +v.toFixed(dec) : Math.round(v);
}
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function riskFromScore(score) {
  if (score < 30) return { level: 'Bajo', color: '#2ecc71' };
  if (score < 60) return { level: 'Medio', color: '#f1c40f' };
  return { level: 'Alto', color: '#e74c3c' };
}

function recFromRisk(level) {
  if (level === 'Bajo') return 'Hallazgos sugieren lesión benigna. Control de rutina / autoexamen.';
  if (level === 'Medio') return 'Hallazgos indeterminados. Se sugiere seguimiento dermatoscópico en 3 meses.';
  return 'Hallazgos de atención. Se sugiere valoración dermatológica y considerar biopsia.';
}

// ==================================================================
// LESIÓN — desde métricas REALES (regla ABCD medida sobre la imagen)
// ==================================================================
function lesionFromFeatures(f) {
  const abcd = {
    asymmetry: clamp(f.asymmetry, 0, 2),
    border: clamp(f.border, 0, 8),
    colors: clamp(f.colors, 1, 6),
    structures: clamp(f.structures, 1, 5),
  };
  const tds = f.tds ?? +(abcd.asymmetry * 1.3 + abcd.border * 0.1 + abcd.colors * 0.5 + abcd.structures * 0.5).toFixed(2);

  // AI-Score 0-100 a partir de los rasgos medidos (ponderado).
  const borderFrac = clamp((f.compact - 1) / 1.5, 0, 1);
  const diaFactor = clamp((f.diameterRel ?? 0) / 0.5, 0, 1);
  const score = clamp(Math.round(100 * (
    0.32 * (abcd.asymmetry / 2) +
    0.30 * borderFrac +
    0.24 * (abcd.colors / 6) +
    0.14 * diaFactor
  )), 1, 99);
  const risk = riskFromScore(score);

  // Descriptores MEDIDOS (no patrones inventados).
  const desc = [];
  if (abcd.asymmetry === 2) desc.push('Asimetría en ambos ejes');
  else if (abcd.asymmetry === 1) desc.push('Asimetría en un eje');
  else desc.push('Lesión simétrica');
  if (abcd.border >= 5) desc.push('Bordes muy irregulares');
  else if (abcd.border >= 2) desc.push('Bordes algo irregulares');
  else desc.push('Bordes regulares');
  if (f.presentColors?.length) desc.push(`Policromía: ${f.presentColors.join(', ')}`);
  if (abcd.structures >= 4) desc.push('Textura interna heterogénea');

  return {
    type: 'lesion', engine: AI_ENGINE, measured: true,
    score, risk: risk.level, riskColor: risk.color,
    abcd, tds, patterns: desc,
    recommendation: recFromRisk(risk.level),
    simulated: false,
  };
}

// LESIÓN — respaldo simulado estable por foto
function lesionSim(photo) {
  const rnd = seeded(hashStr(photo.id + '|lesion'));
  const score = range(rnd, 4, 78);
  const risk = riskFromScore(score);
  const abcd = {
    asymmetry: range(rnd, 0, 2), border: range(rnd, 0, 8),
    colors: range(rnd, 1, 6), structures: range(rnd, 1, 5),
  };
  const tds = +(abcd.asymmetry * 1.3 + abcd.border * 0.1 + abcd.colors * 0.5 + abcd.structures * 0.5).toFixed(2);
  const patterns = ['Patrón reticular', 'Patrón globular', 'Patrón homogéneo',
    'Red de pigmento atípica', 'Velo azul-blanquecino', 'Glóbulos periféricos',
    'Estrías radiales', 'Patrón multicomponente'];
  const observed = [];
  for (let i = 0, n = range(rnd, 1, 3); i < n; i++) { const p = pick(rnd, patterns); if (!observed.includes(p)) observed.push(p); }
  return {
    type: 'lesion', engine: AI_ENGINE, measured: false,
    score, risk: risk.level, riskColor: risk.color, abcd, tds,
    patterns: observed, recommendation: recFromRisk(risk.level), simulated: true,
  };
}

export function analyzeLesion(photo, scan) {
  if (scan?.measured && scan.features) return lesionFromFeatures(scan.features);
  return lesionSim(photo);
}

// ==================================================================
// CABELLO — desde métricas REALES (conteo CV) con hallazgos por regla
// ==================================================================
function hairFromFeatures(f) {
  const findings = [];
  // Patrón androgenético: regla real sobre miniaturización medida.
  if (f.vellusPct > 20 || f.anisotrichosis > 25) {
    findings.push({
      name: 'Signos de miniaturización (patrón androgenético)',
      detected: true,
      confidence: clamp(Math.round(50 + f.anisotrichosis), 50, 92),
      note: `Anisotricosis ${f.anisotrichosis}% y vellus ${f.vellusPct}% medidos en el campo.`,
    });
  }
  if (f.density < 140) {
    findings.push({
      name: 'Densidad reducida',
      detected: true,
      confidence: clamp(Math.round(60 + (140 - f.density) / 2), 55, 90),
      note: `Densidad estimada ${f.density} cab/cm² por debajo del rango habitual.`,
    });
  }
  if (!findings.length) {
    findings.push({
      name: 'Sin signos de miniaturización evidentes',
      detected: false,
      confidence: clamp(Math.round(70 + (100 - f.anisotrichosis) / 5), 70, 95),
      note: 'Grosor homogéneo y densidad dentro de rangos esperados.',
    });
  }
  // Nota: alopecia areata / dermatitis seborreica requieren valoración
  // clínica; no se infieren por visión clásica → no se reportan aquí.
  return {
    type: 'hair', engine: AI_ENGINE, measured: true,
    density: f.density, follicularUnits: f.follicularUnits, hairsPerUnit: f.hairsPerUnit,
    terminalPct: f.terminalPct, vellusPct: f.vellusPct,
    anisotrichosis: f.anisotrichosis, avgThickness: f.avgThickness,
    hairCount: f.count, estimatedScale: !!f.estimated,
    findings, simulated: false,
  };
}

// CABELLO — respaldo simulado estable por foto
function hairSim(photo) {
  const rnd = seeded(hashStr(photo.id + '|hair'));
  const density = range(rnd, 120, 320);
  const follicularUnits = range(rnd, 60, 130);
  const hairsPerUnit = +(density / follicularUnits).toFixed(2);
  const terminal = range(rnd, 60, 95);
  const vellus = 100 - terminal;
  const anisotrichosis = range(rnd, 5, 45);
  const avgThickness = range(rnd, 45, 85, 0);
  const findings = [];
  if (rnd() < 0.22) findings.push({ name: 'Alopecia areata', detected: true, confidence: range(rnd, 55, 90), note: 'Signos compatibles: puntos amarillos / cabellos en signo de exclamación.' });
  if (rnd() < 0.30) findings.push({ name: 'Dermatitis seborreica', detected: true, confidence: range(rnd, 50, 85), note: 'Descamación perifolicular y eritema del cuero cabelludo.' });
  if (anisotrichosis > 25 || vellus > 20) findings.push({ name: 'Patrón androgenético', detected: true, confidence: range(rnd, 50, 80), note: `Anisotricosis ${anisotrichosis}% y miniaturización (vellus ${vellus}%).` });
  if (!findings.length) findings.push({ name: 'Sin hallazgos patológicos evidentes', detected: false, confidence: range(rnd, 70, 95), note: 'Densidad y distribución dentro de rangos normales.' });
  return {
    type: 'hair', engine: AI_ENGINE, measured: false,
    density, follicularUnits, hairsPerUnit, terminalPct: terminal, vellusPct: vellus,
    anisotrichosis, avgThickness, findings, simulated: true,
  };
}

export function analyzeHair(photo, scan) {
  if (scan?.measured && scan.features) return hairFromFeatures(scan.features);
  return hairSim(photo);
}

// ------------------------------------------------------------------
export function runAnalysis(sessionType, photo, scan) {
  return sessionType === 'hair' ? analyzeHair(photo, scan) : analyzeLesion(photo, scan);
}
