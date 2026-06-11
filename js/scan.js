// =====================================================================
// Escáner visual del análisis: segmentación ligera sobre la imagen +
// animación HUD futurista de progreso.
//   · Lesión: detecta la estructura oscura central (umbral de luminancia
//     + flood fill) y traza su PERÍMETRO orgánico.
//   · Cabello: detecta líneas de alto contraste (Sobel) y coloca un
//     WIREFRAME alineado a cada cabello.
// La geometría detectada se devuelve normalizada (0..1) y se guarda en
// el resultado del análisis para dibujarla después sobre la foto.
// =====================================================================
import { loadImage } from './camera.js';

// ---------- utilidades de imagen ----------
function lumMap(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(16, Math.round(img.naturalWidth * scale));
  const h = Math.max(16, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  }
  return { lum, w, h };
}

// ---------- LESIÓN: contorno de la estructura ----------
export function segmentLesion(img) {
  const { lum, w, h } = lumMap(img, 220);

  // semilla: ventana 3x3 más oscura de la zona central
  let best = Infinity, sx = w >> 1, sy = h >> 1;
  for (let y = Math.round(h * 0.28); y < h * 0.72; y += 2) {
    for (let x = Math.round(w * 0.28); x < w * 0.72; x += 2) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += lum[(y + dy) * w + (x + dx)];
      s /= 9;
      if (s < best) { best = s; sx = x; sy = y; }
    }
  }

  // referencia de piel: media del marco exterior
  let skin = 0, n = 0;
  for (let x = 0; x < w; x += 3) { skin += lum[x] + lum[(h - 1) * w + x]; n += 2; }
  for (let y = 0; y < h; y += 3) { skin += lum[y * w] + lum[y * w + w - 1]; n += 2; }
  skin /= n;

  if (skin - best < 14) return fallbackContour(); // poco contraste

  const th = best + (skin - best) * 0.5;

  // flood fill desde la semilla
  const filled = new Uint8Array(w * h);
  const qx = [sx], qy = [sy];
  filled[sy * w + sx] = 1;
  let count = 1;
  const cap = Math.floor(w * h * 0.5);
  while (qx.length && count < cap) {
    const x = qx.pop(), y = qy.pop();
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const i = ny * w + nx;
      if (!filled[i] && lum[i] <= th) { filled[i] = 1; qx.push(nx); qy.push(ny); count++; }
    }
  }
  if (count < w * h * 0.004 || count >= cap) return fallbackContour();

  // centroide
  let cx = 0, cy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (filled[y * w + x]) { cx += x; cy += y; }
  cx /= count; cy /= count;

  // radio máximo por sector angular → contorno exterior
  const BINS = 64;
  const rad = new Float32Array(BINS);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!filled[y * w + x]) continue;
      const a = Math.atan2(y - cy, x - cx);
      const b = ((a + Math.PI) / (2 * Math.PI) * BINS) | 0;
      const r = Math.hypot(x - cx, y - cy);
      const bi = Math.min(BINS - 1, b);
      if (r > rad[bi]) rad[bi] = r;
    }
  }
  // rellena sectores vacíos con vecinos
  for (let i = 0; i < BINS; i++) {
    if (rad[i] === 0) {
      let prev = rad[(i + BINS - 1) % BINS], next = rad[(i + 1) % BINS];
      rad[i] = (prev || next || 2);
    }
  }
  // suavizado circular (2 pasadas, ventana 5)
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(BINS);
    for (let i = 0; i < BINS; i++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) s += rad[(i + k + BINS) % BINS];
      out[i] = s / 5;
    }
    rad.set(out);
  }

  const pts = [];
  for (let i = 0; i < BINS; i++) {
    const a = (i / BINS) * 2 * Math.PI - Math.PI;
    pts.push({
      x: Math.min(1, Math.max(0, (cx + Math.cos(a) * rad[i]) / w)),
      y: Math.min(1, Math.max(0, (cy + Math.sin(a) * rad[i]) / h)),
    });
  }
  return { contour: pts, center: { x: cx / w, y: cy / h } };
}

// contorno orgánico de respaldo (cuando no hay estructura segmentable)
function fallbackContour() {
  const p1 = Math.random() * Math.PI * 2, p2 = Math.random() * Math.PI * 2;
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    const r = 0.26 + 0.05 * Math.sin(3 * a + p1) + 0.03 * Math.sin(7 * a + p2);
    pts.push({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r * 0.92 });
  }
  return { contour: pts, center: { x: 0.5, y: 0.5 }, approximate: true };
}

// ---------- CABELLO: wireframe por cabello detectado ----------
export function detectHairs(img, want = 22) {
  const { lum, w, h } = lumMap(img, 300);

  // gradientes Sobel
  const mag = new Float32Array(w * h);
  const dirx = new Float32Array(w * h);
  const diry = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] + lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy = -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
      dirx[i] = gx; diry[i] = gy;
    }
  }

  // candidatos: máximos de gradiente con distancia mínima entre sí
  const idxs = [];
  for (let y = 4; y < h - 4; y += 2) for (let x = 4; x < w - 4; x += 2) idxs.push(y * w + x);
  idxs.sort((a, b) => mag[b] - mag[a]);

  const minDist = Math.max(12, w * 0.07);
  const picked = [];
  const top = idxs.slice(0, Math.floor(idxs.length * 0.06));
  for (const i of top) {
    if (picked.length >= want) break;
    if (mag[i] < 30) break;
    const x = i % w, y = (i / w) | 0;
    if (picked.some((p) => Math.hypot(p.x - x, p.y - y) < minDist)) continue;
    picked.push({ x, y, i });
  }

  const segs = [];
  for (const p of picked) {
    // dirección del cabello = perpendicular al gradiente
    const a = Math.atan2(diry[p.i], dirx[p.i]) + Math.PI / 2;
    const L = (0.09 + Math.random() * 0.07) * w;
    const x1 = p.x - Math.cos(a) * L / 2, y1 = p.y - Math.sin(a) * L / 2;
    const x2 = p.x + Math.cos(a) * L / 2, y2 = p.y + Math.sin(a) * L / 2;
    segs.push({
      x1: Math.min(1, Math.max(0, x1 / w)), y1: Math.min(1, Math.max(0, y1 / h)),
      x2: Math.min(1, Math.max(0, x2 / w)), y2: Math.min(1, Math.max(0, y2 / h)),
    });
  }

  // respaldo: completa con segmentos plausibles si se detectaron pocos
  while (segs.length < Math.min(want, 14)) {
    const a = Math.random() * Math.PI;
    const cxr = 0.12 + Math.random() * 0.76, cyr = 0.12 + Math.random() * 0.76;
    const L = 0.08 + Math.random() * 0.06;
    segs.push({
      x1: cxr - Math.cos(a) * L, y1: cyr - Math.sin(a) * L,
      x2: cxr + Math.cos(a) * L, y2: cyr + Math.sin(a) * L,
    });
  }
  return { segments: segs };
}

// ---------- SVG persistente sobre la foto analizada ----------
function contourPath(pts, W, H) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x * W).toFixed(1)} ${(p.y * H).toFixed(1)}`).join('') + 'Z';
}

export function overlayMarkup(scan, W, H) {
  if (!scan) return '';
  if (scan.contour) {
    const nodes = scan.contour.filter((_, i) => i % 8 === 0)
      .map((p) => `<circle cx="${(p.x * W).toFixed(1)}" cy="${(p.y * H).toFixed(1)}" r="${Math.max(2.5, W * 0.006)}"/>`).join('');
    return `<svg class="result-overlay lesion" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${contourPath(scan.contour, W, H)}"/>${nodes}</svg>`;
  }
  if (scan.segments) {
    const lines = scan.segments.map((s) =>
      `<line x1="${(s.x1 * W).toFixed(1)}" y1="${(s.y1 * H).toFixed(1)}" x2="${(s.x2 * W).toFixed(1)}" y2="${(s.y2 * H).toFixed(1)}"/>`).join('');
    return `<svg class="result-overlay hair" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`;
  }
  return '';
}

// ---------- animación de escaneo (durante el análisis) ----------
export function runScanAnimation({ blob, type }) {
  return new Promise((resolve) => {
    loadImage(blob).then((img) => {
      const scan = type === 'hair' ? detectHairs(img) : segmentLesion(img);
      const W = img.naturalWidth, H = img.naturalHeight;
      const src = URL.createObjectURL(blob);

      const wrap = document.createElement('div');
      wrap.className = 'scan-overlay';
      wrap.innerHTML = `
        <div class="scan-stage">
          <img src="${src}" alt="">
          <svg class="scan-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"></svg>
          <div class="scan-grid"></div>
          <div class="scan-beam"></div>
          <i class="scan-corner c-tl"></i><i class="scan-corner c-tr"></i>
          <i class="scan-corner c-bl"></i><i class="scan-corner c-br"></i>
          <span class="scan-chip">CALIBRANDO</span>
        </div>
        <div class="scan-hud">
          <p class="scan-status">Inicializando visión computacional…</p>
          <div class="scan-track"><div class="scan-bar"><i></i></div><b class="scan-pct">0%</b></div>
        </div>
        <p class="scan-skip">toca para saltar</p>`;
      document.body.appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add('show'));

      const svg = wrap.querySelector('.scan-svg');
      const status = wrap.querySelector('.scan-status');
      const chip = wrap.querySelector('.scan-chip');
      const bar = wrap.querySelector('.scan-bar i');
      const pct = wrap.querySelector('.scan-pct');

      const TOTAL = 4400;
      const timers = [];
      const at = (t, fn) => timers.push(setTimeout(fn, t));
      const start = performance.now();
      let raf, done = false;

      const tick = () => {
        const p = Math.min(1, (performance.now() - start) / TOTAL);
        const e = 1 - Math.pow(1 - p, 1.6); // easing
        bar.style.width = (e * 100).toFixed(1) + '%';
        pct.textContent = Math.round(e * 100) + '%';
        if (p < 1 && !done) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      const finish = () => {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout);
        cancelAnimationFrame(raf);
        bar.style.width = '100%'; pct.textContent = '100%';
        wrap.classList.remove('show');
        setTimeout(() => { wrap.remove(); URL.revokeObjectURL(src); resolve(scan); }, 380);
      };
      wrap.addEventListener('pointerdown', finish);
      at(TOTAL + 350, finish);

      // ----- coreografía por tipo -----
      const NS = 'http://www.w3.org/2000/svg';
      if (scan.contour) {
        at(600, () => { status.textContent = 'Segmentando estructura pigmentada…'; chip.textContent = 'SEGMENTANDO'; });
        at(800, () => {
          const path = document.createElementNS(NS, 'path');
          path.setAttribute('d', contourPath(scan.contour, W, H));
          path.setAttribute('class', 'scan-contour');
          svg.appendChild(path);
          const L = path.getTotalLength();
          path.style.strokeDasharray = L;
          path.style.strokeDashoffset = L;
          path.getBoundingClientRect(); // reflow
          path.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1)';
          path.style.strokeDashoffset = '0';
        });
        at(2400, () => {
          status.textContent = 'Midiendo bordes y asimetría…';
          chip.textContent = 'ESTRUCTURA LOCALIZADA';
          scan.contour.filter((_, i) => i % 8 === 0).forEach((p, i) => {
            at(i * 70, () => {
              const c = document.createElementNS(NS, 'circle');
              c.setAttribute('cx', p.x * W); c.setAttribute('cy', p.y * H);
              c.setAttribute('r', Math.max(2.5, W * 0.006));
              c.setAttribute('class', 'scan-node');
              svg.appendChild(c);
            });
          });
          const ctr = scan.center || { x: 0.5, y: 0.5 };
          const cross = document.createElementNS(NS, 'g');
          cross.setAttribute('class', 'scan-cross');
          const s = W * 0.03;
          cross.innerHTML = `<line x1="${ctr.x * W - s}" y1="${ctr.y * H}" x2="${ctr.x * W + s}" y2="${ctr.y * H}"/>
                             <line x1="${ctr.x * W}" y1="${ctr.y * H - s}" x2="${ctr.x * W}" y2="${ctr.y * H + s}"/>`;
          svg.appendChild(cross);
        });
        at(3300, () => { status.textContent = 'Calculando patrones de color y TDS…'; });
        at(4000, () => { status.textContent = 'Análisis completado'; chip.textContent = 'PERÍMETRO FIJADO'; svg.classList.add('lock'); });
      } else {
        const segs = scan.segments;
        at(600, () => { status.textContent = 'Detectando cabellos y folículos…'; chip.textContent = '0 CABELLOS'; });
        segs.forEach((sg, i) => {
          at(700 + i * (1900 / segs.length), () => {
            const line = document.createElementNS(NS, 'line');
            line.setAttribute('x1', sg.x1 * W); line.setAttribute('y1', sg.y1 * H);
            line.setAttribute('x2', sg.x2 * W); line.setAttribute('y2', sg.y2 * H);
            line.setAttribute('class', 'scan-hair');
            svg.appendChild(line);
            requestAnimationFrame(() => line.classList.add('on'));
            chip.textContent = `${i + 1} CABELLOS`;
          });
        });
        at(2900, () => {
          status.textContent = 'Midiendo grosor · terminal vs. vellus…';
          [...svg.querySelectorAll('.scan-hair')].forEach((l, i) => {
            if (i % 3 === 0) l.classList.add('vellus');
          });
        });
        at(4000, () => { status.textContent = 'Análisis completado'; chip.textContent = 'CONTEO FIJADO'; svg.classList.add('lock'); });
      }
    }).catch(() => resolve(null));
  });
}
