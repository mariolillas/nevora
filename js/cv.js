// =====================================================================
// Motor de visión por computadora propio (sin librerías externas).
// Implementa, en JS puro sobre <canvas>, las técnicas CLÁSICAS que usa
// el SDK de FotoFinder (OpenCV: segmentación, componentes conexas,
// clasificación por umbral) — pero con código original y legal.
//
//   · Lesión:  segmentación + ABCD real (asimetría, borde, color,
//              diámetro) + mapa de calor de saliencia.
//   · Cabello: detección de estructuras finas oscuras (black-hat por
//              media local), conteo, grosor, terminal/vellus, densidad.
//
// Todo es determinista por imagen (sin azar) → resultados estables.
// =====================================================================
import { loadImage } from './camera.js';

// ---------- mapas base de la imagen (escala de grises + RGB) ----------
function imageMaps(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(24, Math.round(img.naturalWidth * scale));
  const h = Math.max(24, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const rgb = ctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.299 * rgb[i * 4] + 0.587 * rgb[i * 4 + 1] + 0.114 * rgb[i * 4 + 2];
  }
  return { lum, rgb, w, h };
}

// ---------- integral image → media de ventana en O(1) ----------
function integral(src, w, h) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      I[(y + 1) * (w + 1) + (x + 1)] = I[y * (w + 1) + (x + 1)] + row;
    }
  }
  return I;
}
function boxMean(I, w, h, x, y, r) {
  const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r);
  const x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
  const W = w + 1;
  const s = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
  return s / ((x1 - x0) * (y1 - y0));
}

// ---------- Sobel: magnitud + orientación ----------
function sobel(lum, w, h) {
  const mag = new Float32Array(w * h);
  const ang = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] + lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy = -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
      ang[i] = Math.atan2(gy, gx);
    }
  }
  return { mag, ang };
}

// ---------- componentes conexas (8-conexo) sobre máscara binaria ----------
function connectedComponents(mask, w, h, minArea = 1) {
  const label = new Int32Array(w * h).fill(0);
  const comps = [];
  const stack = [];
  let next = 0;
  for (let p = 0; p < w * h; p++) {
    if (!mask[p] || label[p]) continue;
    next++;
    stack.length = 0; stack.push(p);
    label[p] = next;
    let area = 0, sx = 0, sy = 0, minx = w, maxx = 0, miny = h, maxy = 0;
    const px = [];
    while (stack.length) {
      const q = stack.pop();
      const qx = q % w, qy = (q / w) | 0;
      area++; sx += qx; sy += qy; px.push(q);
      if (qx < minx) minx = qx; if (qx > maxx) maxx = qx;
      if (qy < miny) miny = qy; if (qy > maxy) maxy = qy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (mask[n] && !label[n]) { label[n] = next; stack.push(n); }
        }
      }
    }
    if (area >= minArea) {
      comps.push({ area, cx: sx / area, cy: sy / area, minx, maxx, miny, maxy, px });
    }
  }
  return comps;
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function std(a) { const m = mean(a); return a.length ? Math.sqrt(mean(a.map((x) => (x - m) * (x - m)))) : 0; }

// =====================================================================
// LESIÓN — segmentación + ABCD real + saliencia
// =====================================================================
const SCALE_LESION = 256;

// colores dermatoscópicos de referencia (RGB) para la regla de color.
const DERMO_COLORS = [
  { name: 'Blanco', rgb: [225, 220, 215] },
  { name: 'Rojo', rgb: [180, 60, 60] },
  { name: 'Marrón claro', rgb: [175, 130, 95] },
  { name: 'Marrón oscuro', rgb: [110, 75, 55] },
  { name: 'Negro', rgb: [40, 35, 35] },
  { name: 'Azul-gris', rgb: [95, 105, 120] },
];

export function analyzeLesionCV(img) {
  const { lum, rgb, w, h } = imageMaps(img, SCALE_LESION);

  // --- semilla: ventana 3x3 más oscura del centro ---
  let best = Infinity, sx = w >> 1, sy = h >> 1;
  for (let y = (h * 0.28) | 0; y < h * 0.72; y += 2) {
    for (let x = (w * 0.28) | 0; x < w * 0.72; x += 2) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += lum[(y + dy) * w + (x + dx)];
      s /= 9;
      if (s < best) { best = s; sx = x; sy = y; }
    }
  }
  // referencia de piel: media del marco
  let skin = 0, n = 0;
  for (let x = 0; x < w; x += 3) { skin += lum[x] + lum[(h - 1) * w + x]; n += 2; }
  for (let y = 0; y < h; y += 3) { skin += lum[y * w] + lum[y * w + w - 1]; n += 2; }
  skin /= n;
  if (skin - best < 14) return fallbackLesion();

  // --- flood fill por umbral ---
  const th = best + (skin - best) * 0.5;
  const filled = new Uint8Array(w * h);
  const qx = [sx], qy = [sy];
  filled[sy * w + sx] = 1;
  let count = 1; const cap = (w * h * 0.55) | 0;
  while (qx.length && count < cap) {
    const x = qx.pop(), y = qy.pop();
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const i = ny * w + nx;
      if (!filled[i] && lum[i] <= th) { filled[i] = 1; qx.push(nx); qy.push(ny); count++; }
    }
  }
  if (count < w * h * 0.004 || count >= cap) return fallbackLesion();

  // --- centroide + contorno por radio máximo angular ---
  let cx = 0, cy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (filled[y * w + x]) { cx += x; cy += y; }
  cx /= count; cy /= count;

  const BINS = 64;
  const rad = new Float32Array(BINS);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!filled[y * w + x]) continue;
    const a = Math.atan2(y - cy, x - cx);
    const b = Math.min(BINS - 1, ((a + Math.PI) / (2 * Math.PI) * BINS) | 0);
    const r = Math.hypot(x - cx, y - cy);
    if (r > rad[b]) rad[b] = r;
  }
  for (let i = 0; i < BINS; i++) if (rad[i] === 0) rad[i] = rad[(i + BINS - 1) % BINS] || rad[(i + 1) % BINS] || 2;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(BINS);
    for (let i = 0; i < BINS; i++) {
      let s = 0; for (let k = -2; k <= 2; k++) s += rad[(i + k + BINS) % BINS];
      out[i] = s / 5;
    }
    rad.set(out);
  }
  const contour = [];
  for (let i = 0; i < BINS; i++) {
    const a = (i / BINS) * 2 * Math.PI - Math.PI;
    contour.push({
      x: clamp((cx + Math.cos(a) * rad[i]) / w, 0, 1),
      y: clamp((cy + Math.sin(a) * rad[i]) / h, 0, 1),
    });
  }

  // ===== A — Asimetría (plegado de la máscara por sus ejes) =====
  const asymH = foldAsymmetry(filled, w, h, cx, cy, 'h');
  const asymV = foldAsymmetry(filled, w, h, cx, cy, 'v');
  const asymmetry = (asymH > 0.20 ? 1 : 0) + (asymV > 0.20 ? 1 : 0); // 0-2

  // ===== B — Borde (compacidad = P² / 4πA) =====
  let perim = 0;
  for (let i = 0; i < BINS; i++) {
    const p1 = contour[i], p2 = contour[(i + 1) % BINS];
    perim += Math.hypot((p1.x - p2.x) * w, (p1.y - p2.y) * h);
  }
  const compact = (perim * perim) / (4 * Math.PI * count); // 1 = círculo
  const border = clamp(Math.round((compact - 1) * 8), 0, 8); // 0-8

  // ===== C — Colores (clustering a referencias dermatoscópicas) =====
  const share = new Array(DERMO_COLORS.length).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!filled[y * w + x]) continue;
    const i = (y * w + x) * 4;
    share[nearestColor(rgb[i], rgb[i + 1], rgb[i + 2])]++;
  }
  const presentColors = [];
  for (let k = 0; k < share.length; k++) if (share[k] / count > 0.06) presentColors.push(DERMO_COLORS[k].name);
  const colors = clamp(presentColors.length, 1, 6); // 1-6

  // ===== D — "estructuras" proxy (densidad de bordes internos) =====
  const { mag } = sobel(lum, w, h);
  let edgeSum = 0, edgeN = 0;
  for (let p = 0; p < w * h; p++) if (filled[p]) { edgeSum += mag[p]; edgeN++; }
  const edgeDensity = edgeN ? edgeSum / edgeN : 0;
  const structures = clamp(1 + Math.round(edgeDensity / 28), 1, 5); // 1-5

  // diámetro relativo (calibre máx. del contorno / diagonal)
  let dia = 0;
  for (let i = 0; i < BINS; i++) for (let j = i + 1; j < BINS; j++) {
    const d = Math.hypot((contour[i].x - contour[j].x) * w, (contour[i].y - contour[j].y) * h);
    if (d > dia) dia = d;
  }
  const diameterRel = dia / Math.hypot(w, h);

  const tds = +(asymmetry * 1.3 + border * 0.1 + colors * 0.5 + structures * 0.5).toFixed(2);

  // mapa de calor de saliencia (oscuridad relativa a la piel × bordes)
  const heat = saliencyHeat(lum, mag, filled, w, h, skin);

  return {
    contour, center: { x: cx / w, y: cy / h },
    measured: true,
    features: { asymmetry, asymH, asymV, border, compact, colors, presentColors, structures, diameterRel, tds, areaFrac: count / (w * h) },
    heat,
  };
}

// plega la máscara sobre el eje y mide la fracción de no-solape
function foldAsymmetry(mask, w, h, cx, cy, axis) {
  let overlap = 0, total = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    total++;
    let mx = x, my = y;
    if (axis === 'h') mx = Math.round(2 * cx - x); else my = Math.round(2 * cy - y);
    if (mx >= 0 && my >= 0 && mx < w && my < h && mask[my * w + mx]) overlap++;
  }
  return total ? 1 - overlap / total : 0;
}

function nearestColor(r, g, b) {
  let best = 0, bd = Infinity;
  for (let k = 0; k < DERMO_COLORS.length; k++) {
    const c = DERMO_COLORS[k].rgb;
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

// rejilla de calor normalizada 0..1 (downsampled a celdas)
function saliencyHeat(lum, mag, mask, w, h, skin) {
  const GX = 16, GY = 16;
  const cell = new Float32Array(GX * GY);
  const cnt = new Float32Array(GX * GY);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    const gx = Math.min(GX - 1, (x / w * GX) | 0), gy = Math.min(GY - 1, (y / h * GY) | 0);
    const dark = clamp((skin - lum[y * w + x]) / skin, 0, 1);
    cell[gy * GX + gx] += dark * 0.7 + clamp(mag[y * w + x] / 120, 0, 1) * 0.3;
    cnt[gy * GX + gx]++;
  }
  let mx = 0;
  for (let i = 0; i < cell.length; i++) { if (cnt[i]) cell[i] /= cnt[i]; if (cell[i] > mx) mx = cell[i]; }
  if (mx > 0) for (let i = 0; i < cell.length; i++) cell[i] /= mx;
  return { gx: GX, gy: GY, cells: Array.from(cell) };
}

function fallbackLesion() { return { measured: false }; }

// =====================================================================
// CABELLO — detección de estructuras finas (black-hat) + métricas
// =====================================================================
const SCALE_HAIR = 360;

export function analyzeHairCV(img) {
  const { lum, w, h } = imageMaps(img, SCALE_HAIR);

  // black-hat aproximado: pixel oscuro respecto a su media local → cabello
  const I = integral(lum, w, h);
  const r = Math.max(4, Math.round(w * 0.018));
  const mask = new Uint8Array(w * h);
  let hairPx = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const m = boxMean(I, w, h, x, y, r);
    if (m - lum[y * w + x] > 13) { mask[y * w + x] = 1; hairPx++; }
  }
  if (hairPx < w * h * 0.002) return { measured: false };

  // componentes alargados = cabellos
  const minA = Math.max(6, (w * 0.02) | 0);
  const comps = connectedComponents(mask, w, h, minA).filter((c) => {
    const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1;
    const elong = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    return elong >= 2 && c.area <= w * h * 0.08;
  });
  if (comps.length < 4) return { measured: false };

  // grosor y longitud de cada cabello
  const widths = [], segs = [];
  for (const c of comps) {
    const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1;
    const len = Math.max(bw, bh);
    const width = c.area / Math.max(1, len);
    widths.push(width);
    // segmento (eje mayor del bounding box) para el wireframe
    let s;
    if (bw >= bh) s = { x1: c.minx, y1: c.cy, x2: c.maxx, y2: c.cy };
    else s = { x1: c.cx, y1: c.miny, x2: c.cx, y2: c.maxy };
    segs.push({ x1: s.x1 / w, y1: s.y1 / h, x2: s.x2 / w, y2: s.y2 / h, width });
  }

  const count = comps.length;
  const wMean = mean(widths), wStd = std(widths);

  // terminal vs vellus por umbral de grosor (terminal = grueso)
  const tTh = Math.max(1.6, wMean * 0.9);
  let terminals = 0;
  for (const wd of widths) if (wd >= tTh) terminals++;
  const terminalPct = clamp(Math.round((terminals / count) * 100), 0, 100);
  const vellusPct = 100 - terminalPct;

  // anisotricosis = coeficiente de variación del grosor (%)
  const anisotrichosis = clamp(Math.round((wStd / Math.max(0.1, wMean)) * 100), 0, 100);

  // unidades foliculares: clustering de raíces por proximidad
  const units = clusterUnits(comps.map((c) => [c.cx, c.cy]), w * 0.06);
  const hairsPerUnit = +(count / Math.max(1, units)).toFixed(2);

  // densidad y grosor en unidades físicas: ESTIMACIÓN (sin calibración
  // óptica real). Campo macro asumido ≈ 1.6 cm de ancho.
  const FIELD_CM = 1.6;
  const areaCm2 = FIELD_CM * (FIELD_CM * h / w);
  const density = clamp(Math.round(count / areaCm2), 20, 600);
  const follicularUnits = clamp(Math.round(units / areaCm2), 10, 300);
  const pxPerMm = w / (FIELD_CM * 10);
  const avgThickness = clamp(Math.round((wMean / pxPerMm) * 1000), 20, 140); // µm estimado

  return {
    measured: true,
    segments: segs.slice().sort((a, b) => b.width - a.width).slice(0, 60), // top para dibujar
    features: {
      count, density, follicularUnits, hairsPerUnit,
      terminalPct, vellusPct, anisotrichosis, avgThickness,
      estimated: true,
    },
  };
}

// agrupa puntos por distancia (single-link sencillo) → nº de grupos
function clusterUnits(pts, dist) {
  const n = pts.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const d2 = dist * dist;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
    if (dx * dx + dy * dy <= d2) parent[find(i)] = find(j);
  }
  const roots = new Set();
  for (let i = 0; i < n; i++) roots.add(find(i));
  return roots.size;
}

export { loadImage };
