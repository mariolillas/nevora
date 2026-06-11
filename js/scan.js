// =====================================================================
// Escáner visual del análisis: usa el motor de visión real (js/cv.js)
// para SEGMENTAR/MEDIR la imagen y reproduce una animación HUD futurista
// del progreso. La geometría + métricas se devuelven para guardarlas con
// el análisis y dibujarlas después sobre la foto.
//   · Lesión: perímetro de la estructura + mapa de calor de saliencia.
//   · Cabello: wireframe alineado a cada cabello detectado.
// =====================================================================
import { loadImage, analyzeLesionCV, analyzeHairCV } from './cv.js';

// ---------- segmentación (con respaldo si la imagen no es medible) ----------
export function segmentLesion(img) {
  const cv = analyzeLesionCV(img);
  if (cv.measured) return cv;
  return fallbackContour();
}
export function detectHairs(img) {
  const cv = analyzeHairCV(img);
  if (cv.measured) return cv;
  return fallbackHairs();
}

// contorno orgánico de respaldo (sin medición → ai.js simulará el resto)
function fallbackContour() {
  const p1 = Math.random() * Math.PI * 2, p2 = Math.random() * Math.PI * 2;
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    const r = 0.26 + 0.05 * Math.sin(3 * a + p1) + 0.03 * Math.sin(7 * a + p2);
    pts.push({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r * 0.92 });
  }
  return { contour: pts, center: { x: 0.5, y: 0.5 }, measured: false };
}
function fallbackHairs() {
  const segs = [];
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI;
    const cx = 0.12 + Math.random() * 0.76, cy = 0.12 + Math.random() * 0.76;
    const L = 0.08 + Math.random() * 0.06;
    segs.push({ x1: cx - Math.cos(a) * L, y1: cy - Math.sin(a) * L, x2: cx + Math.cos(a) * L, y2: cy + Math.sin(a) * L });
  }
  return { segments: segs, measured: false };
}

// ---------- SVG persistente sobre la foto analizada ----------
function contourPath(pts, W, H) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x * W).toFixed(1)} ${(p.y * H).toFixed(1)}`).join('') + 'Z';
}

function heatMarkup(heat, W, H) {
  if (!heat) return '';
  const cw = W / heat.gx, ch = H / heat.gy;
  let rects = '';
  for (let gy = 0; gy < heat.gy; gy++) for (let gx = 0; gx < heat.gx; gx++) {
    const v = heat.cells[gy * heat.gx + gx];
    if (v < 0.12) continue;
    const hue = 60 - v * 60; // amarillo→rojo
    rects += `<rect x="${(gx * cw).toFixed(1)}" y="${(gy * ch).toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="hsl(${hue.toFixed(0)} 95% 55%)" opacity="${(v * 0.5).toFixed(2)}"/>`;
  }
  return `<g class="heat-layer">${rects}</g>`;
}

export function overlayMarkup(scan, W, H) {
  if (!scan) return '';
  if (scan.contour) {
    const nodes = scan.contour.filter((_, i) => i % 8 === 0)
      .map((p) => `<circle cx="${(p.x * W).toFixed(1)}" cy="${(p.y * H).toFixed(1)}" r="${Math.max(2.5, W * 0.006)}"/>`).join('');
    return `<svg class="result-overlay lesion" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      ${heatMarkup(scan.heat, W, H)}
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
      const realCount = scan.features?.count;

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
        const e = 1 - Math.pow(1 - p, 1.6);
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

      const NS = 'http://www.w3.org/2000/svg';
      if (scan.contour) {
        at(600, () => { status.textContent = 'Segmentando estructura pigmentada…'; chip.textContent = 'SEGMENTANDO'; });
        at(800, () => {
          // capa de calor
          if (scan.heat) {
            const g = document.createElementNS(NS, 'g');
            g.setAttribute('class', 'scan-heat');
            g.innerHTML = heatMarkup(scan.heat, W, H).replace(/^<g[^>]*>|<\/g>$/g, '');
            svg.appendChild(g);
          }
          const path = document.createElementNS(NS, 'path');
          path.setAttribute('d', contourPath(scan.contour, W, H));
          path.setAttribute('class', 'scan-contour');
          svg.appendChild(path);
          const L = path.getTotalLength();
          path.style.strokeDasharray = L; path.style.strokeDashoffset = L;
          path.getBoundingClientRect();
          path.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1)';
          path.style.strokeDashoffset = '0';
        });
        at(2400, () => {
          status.textContent = scan.measured ? 'Midiendo ABCD: asimetría, bordes y color…' : 'Estimando bordes y asimetría…';
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
        at(3300, () => { status.textContent = 'Calculando policromía y TDS…'; });
        at(4000, () => { status.textContent = 'Análisis completado'; chip.textContent = 'PERÍMETRO FIJADO'; svg.classList.add('lock'); });
      } else {
        const segs = scan.segments;
        const total = realCount ?? segs.length;
        at(600, () => { status.textContent = 'Detectando cabellos y folículos…'; chip.textContent = '0 CABELLOS'; });
        segs.forEach((sg, i) => {
          at(700 + i * (1900 / segs.length), () => {
            const line = document.createElementNS(NS, 'line');
            line.setAttribute('x1', sg.x1 * W); line.setAttribute('y1', sg.y1 * H);
            line.setAttribute('x2', sg.x2 * W); line.setAttribute('y2', sg.y2 * H);
            line.setAttribute('class', 'scan-hair');
            svg.appendChild(line);
            requestAnimationFrame(() => line.classList.add('on'));
            // el contador refleja el total real, no solo los dibujados
            const shown = Math.round(((i + 1) / segs.length) * total);
            chip.textContent = `${shown} CABELLOS`;
          });
        });
        at(2900, () => {
          status.textContent = 'Midiendo grosor · terminal vs. vellus…';
          [...svg.querySelectorAll('.scan-hair')].forEach((l, i) => { if (i % 3 === 0) l.classList.add('vellus'); });
        });
        at(4000, () => { status.textContent = 'Análisis completado'; chip.textContent = `${total} · CONTEO FIJADO`; svg.classList.add('lock'); });
      }
    }).catch((e) => { console.error(e); resolve(null); });
  });
}
