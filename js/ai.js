// =====================================================================
// Motor de análisis — VERSIÓN PLACEHOLDER (SIMULADA).
//
// Genera resultados plausibles y ESTABLES por foto (derivados de un hash
// del id de la foto, no aleatorios cada vez) para poder construir y probar
// todo el flujo (UI, reportes PDF) sin IA real todavía.
//
// >>> PARA CONECTAR IA REAL: reemplaza el cuerpo de analyzeLesion() y
//     analyzeHair() por una llamada a tu backend / API de visión.
//     La forma del objeto devuelto debe mantenerse igual para que el
//     resto de la app (PDF, UI) siga funcionando.
// =====================================================================

export const AI_ENGINE = 'Simulado v1 (placeholder)';

// Hash determinista simple (FNV-1a) -> entero sin signo.
function hashStr(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// PRNG determinista (mulberry32) sembrado por el hash.
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

function riskFromScore(score) {
  if (score < 30) return { level: 'Bajo', color: '#2ecc71' };
  if (score < 60) return { level: 'Medio', color: '#f1c40f' };
  return { level: 'Alto', color: '#e74c3c' };
}

// ------------------------------------------------------------------
// ANÁLISIS DE LESIÓN (estilo MoleAnalyzer): AI-Score de malignidad.
// ------------------------------------------------------------------
export function analyzeLesion(photo) {
  const seed = hashStr(photo.id + '|lesion');
  const rnd = seeded(seed);

  const score = range(rnd, 4, 78);            // AI-Score 0-100
  const risk = riskFromScore(score);

  // Sub-características tipo regla ABCD de dermatoscopía.
  const abcd = {
    asymmetry: range(rnd, 0, 2),              // 0-2 ejes
    border: range(rnd, 0, 8),                 // 0-8 segmentos
    colors: range(rnd, 1, 6),                 // nº de colores
    structures: range(rnd, 1, 5),             // estructuras dermatosc.
  };
  const tds = +(abcd.asymmetry * 1.3 + abcd.border * 0.1 +
                abcd.colors * 0.5 + abcd.structures * 0.5).toFixed(2);

  const patterns = [
    'Patrón reticular', 'Patrón globular', 'Patrón homogéneo',
    'Red de pigmento atípica', 'Velo azul-blanquecino',
    'Glóbulos periféricos', 'Estrías radiales', 'Patrón multicomponente',
  ];
  const observed = [];
  const n = range(rnd, 1, 3);
  for (let i = 0; i < n; i++) {
    const p = pick(rnd, patterns);
    if (!observed.includes(p)) observed.push(p);
  }

  let recommendation;
  if (risk.level === 'Bajo') recommendation = 'Hallazgos sugieren lesión benigna. Control de rutina / autoexamen.';
  else if (risk.level === 'Medio') recommendation = 'Hallazgos indeterminados. Se sugiere seguimiento dermatoscópico en 3 meses.';
  else recommendation = 'Hallazgos de atención. Se sugiere valoración dermatológica y considerar biopsia.';

  return {
    type: 'lesion',
    engine: AI_ENGINE,
    score,
    risk: risk.level,
    riskColor: risk.color,
    abcd,
    tds,                                       // Total Dermoscopy Score
    patterns: observed,
    recommendation,
    simulated: true,
  };
}

// ------------------------------------------------------------------
// ANÁLISIS DE CABELLO / TRICOSCOPÍA (estilo TrichoScale).
// ------------------------------------------------------------------
export function analyzeHair(photo) {
  const seed = hashStr(photo.id + '|hair');
  const rnd = seeded(seed);

  const density = range(rnd, 120, 320);        // cabellos / cm²
  const follicularUnits = range(rnd, 60, 130); // UF / cm²
  const hairsPerUnit = +(density / follicularUnits).toFixed(2);
  const terminal = range(rnd, 60, 95);         // % terminal
  const vellus = 100 - terminal;               // % vellus
  const anisotrichosis = range(rnd, 5, 45);    // % variación de grosor
  const avgThickness = range(rnd, 45, 85, 0);  // µm

  // Banderas de hallazgo (probabilísticas pero estables por foto).
  const alopeciaAreata = rnd() < 0.22;
  const seborrheicDermatitis = rnd() < 0.30;
  const androgenetic = anisotrichosis > 25 || vellus > 20;

  const findings = [];
  if (alopeciaAreata) findings.push({
    name: 'Alopecia areata',
    detected: true,
    confidence: range(rnd, 55, 90),
    note: 'Signos compatibles: puntos amarillos / cabellos en signo de exclamación.',
  });
  if (seborrheicDermatitis) findings.push({
    name: 'Dermatitis seborreica',
    detected: true,
    confidence: range(rnd, 50, 85),
    note: 'Descamación perifolicular y eritema del cuero cabelludo.',
  });
  if (androgenetic) findings.push({
    name: 'Patrón androgenético',
    detected: true,
    confidence: range(rnd, 50, 80),
    note: `Anisotricosis ${anisotrichosis}% y miniaturización (vellus ${vellus}%).`,
  });
  if (findings.length === 0) findings.push({
    name: 'Sin hallazgos patológicos evidentes',
    detected: false,
    confidence: range(rnd, 70, 95),
    note: 'Densidad y distribución dentro de rangos normales.',
  });

  return {
    type: 'hair',
    engine: AI_ENGINE,
    density,
    follicularUnits,
    hairsPerUnit,
    terminalPct: terminal,
    vellusPct: vellus,
    anisotrichosis,
    avgThickness,
    findings,
    simulated: true,
  };
}

export function runAnalysis(sessionType, photo) {
  return sessionType === 'hair' ? analyzeHair(photo) : analyzeLesion(photo);
}
