// =====================================================================
// Motor de comparación temporal (§6.1 del PLAN).
// Calcula los deltas entre dos visitas (A = anterior, B = reciente) y
// emite un veredicto de evolución asistencial (NO diagnóstico):
//   estable / cambios menores / atención (cambios significativos).
// Lo consumen la pantalla de comparación y el PDF de comparación.
// =====================================================================

export const VERDICTS = {
  stable: { level: 'stable', label: 'Estable', color: '#2dd4a7' },
  minor: { level: 'minor', label: 'Cambios menores', color: '#fbbf24' },
  attention: { level: 'attention', label: 'Atención — cambios significativos', color: '#fb7185' },
};

const RISK_RANK = { Bajo: 0, Medio: 1, Alto: 2 };

function signed(n, dec = 0) {
  const v = dec ? +n.toFixed(dec) : Math.round(n);
  return (v > 0 ? '+' : '') + v;
}

// row: { label, a, b, delta, dir(-1|0|1), sev('ok'|'flat'|'warn'|'bad') }
function numRow(label, a, b, { unit = '', dec = 0, warnAt = 1, badAt = Infinity, worseDir = 1, pct = false } = {}) {
  const d = b - a;
  const dAbs = Math.abs(d);
  const dir = d === 0 ? 0 : (d > 0 ? 1 : -1);
  let sev = 'flat';
  if (d !== 0) {
    const worse = dir === worseDir;
    if (!worse) sev = 'ok';
    else sev = dAbs >= badAt ? 'bad' : (dAbs >= warnAt ? 'warn' : 'flat');
  }
  const fmt = (v) => (dec ? +v.toFixed(dec) : Math.round(v)) + unit;
  let delta = d === 0 ? '=' : signed(d, dec) + unit;
  if (pct && a !== 0 && d !== 0) delta += ` (${signed((d / a) * 100)}%)`;
  return { label, a: fmt(a), b: fmt(b), delta, dir, sev };
}

// ------------------------------------------------------------------
// LESIÓN: AI-Score, riesgo, ABCD, TDS.
// ------------------------------------------------------------------
function compareLesion(A, B, days) {
  const rows = [
    numRow('AI-Score', A.score, B.score, { warnAt: 5, badAt: 15 }),
    riskRow(A.risk, B.risk),
    numRow('Asimetría', A.abcd.asymmetry, B.abcd.asymmetry, { unit: '/2' }),
    numRow('Borde', A.abcd.border, B.abcd.border, { unit: '/8', warnAt: 2 }),
    numRow('Colores', A.abcd.colors, B.abcd.colors, {}),
    numRow('Estructuras', A.abcd.structures, B.abcd.structures, {}),
    numRow('TDS', A.tds, B.tds, { dec: 2, warnAt: 0.5, badAt: 1.5 }),
  ];

  // Regla de veredicto (asistencial): |ΔScore| ≥ 15 o sube la categoría
  // de riesgo → atención; |ΔScore| ≥ 5 o algún componente ABCD sube → menores.
  const dScore = B.score - A.score;
  const riskUp = (RISK_RANK[B.risk] ?? 0) > (RISK_RANK[A.risk] ?? 0);
  const abcdUp = ['asymmetry', 'border', 'colors', 'structures']
    .some((k) => (B.abcd[k] ?? 0) > (A.abcd[k] ?? 0));

  let v;
  if (Math.abs(dScore) >= 15 || riskUp) v = VERDICTS.attention;
  else if (Math.abs(dScore) >= 5 || abcdUp) v = VERDICTS.minor;
  else v = VERDICTS.stable;

  const detail = `ΔAI-Score ${signed(dScore)} y riesgo ${A.risk} → ${B.risk} en ${days} días.`;
  return { rows, verdict: { ...v, detail } };
}

function riskRow(a, b) {
  const ra = RISK_RANK[a] ?? 0, rb = RISK_RANK[b] ?? 0;
  const dir = rb === ra ? 0 : (rb > ra ? 1 : -1);
  return {
    label: 'Riesgo', a, b,
    delta: dir === 0 ? '=' : (dir > 0 ? 'Subió' : 'Bajó'),
    dir, sev: dir > 0 ? 'bad' : (dir < 0 ? 'ok' : 'flat'),
  };
}

// ------------------------------------------------------------------
// CABELLO / TRICOSCOPÍA: densidad, UF, vellus, anisotricosis, grosor.
// "Peor" = densidad/grosor a la baja; vellus/anisotricosis al alza.
// ------------------------------------------------------------------
function compareHair(A, B, days) {
  const dDenPct = A.density ? ((B.density - A.density) / A.density) * 100 : 0;
  const dVellus = B.vellusPct - A.vellusPct;

  const rows = [
    numRow('Densidad', A.density, B.density, { unit: ' /cm²', worseDir: -1, warnAt: A.density * 0.075, badAt: A.density * 0.15, pct: true }),
    numRow('Unidades foliculares', A.follicularUnits, B.follicularUnits, { unit: ' /cm²', worseDir: -1, warnAt: A.follicularUnits * 0.075, badAt: A.follicularUnits * 0.15 }),
    numRow('Cabellos por folículo', A.hairsPerUnit, B.hairsPerUnit, { dec: 2, worseDir: -1, warnAt: 0.15, badAt: 0.4 }),
    numRow('Terminal', A.terminalPct, B.terminalPct, { unit: '%', worseDir: -1, warnAt: 5, badAt: 10 }),
    numRow('Vellus', A.vellusPct, B.vellusPct, { unit: '%', worseDir: 1, warnAt: 5, badAt: 10 }),
    numRow('Anisotricosis', A.anisotrichosis, B.anisotrichosis, { unit: '%', worseDir: 1, warnAt: 5, badAt: 12 }),
    numRow('Grosor medio', A.avgThickness, B.avgThickness, { unit: ' µm', worseDir: -1, warnAt: 5, badAt: 12 }),
  ];

  // Veredicto: |Δdensidad| ≥ 15% o Δvellus ≥ 10 pts → atención;
  // la mitad de esos umbrales → cambios menores.
  let v;
  if (Math.abs(dDenPct) >= 15 || Math.abs(dVellus) >= 10) v = VERDICTS.attention;
  else if (Math.abs(dDenPct) >= 7.5 || Math.abs(dVellus) >= 5) v = VERDICTS.minor;
  else v = VERDICTS.stable;

  const detail = `Densidad ${signed(dDenPct)}% y vellus ${signed(dVellus)} pts en ${days} días.`;
  return { rows, verdict: { ...v, detail } };
}

// ------------------------------------------------------------------
// API principal.
// analysisA/analysisB pueden ser null (visita sin analizar) → rows null.
// ------------------------------------------------------------------
export function buildComparison({ type, analysisA, analysisB, dateA, dateB }) {
  const days = Math.round(Math.abs((dateB || 0) - (dateA || 0)) / 86400000);
  if (!analysisA || !analysisB) return { days, rows: null, verdict: null };
  const result = type === 'hair'
    ? compareHair(analysisA, analysisB, days)
    : compareLesion(analysisA, analysisB, days);
  return { days, ...result };
}
