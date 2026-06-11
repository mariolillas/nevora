// =====================================================================
// Captura de imagen y utilidades.
//
// Estrategia: usamos la CÁMARA NATIVA del teléfono vía <input capture>.
// Esto aprovecha todo el zoom óptico/digital y la calidad real del
// dispositivo (S25 Ultra / iPhone Pro Max) — muy superior al zoom por
// software de getUserMedia, sobre todo en iOS, lo cual es clave para las
// tomas MICRO con zoom.
// =====================================================================

// Abre la cámara nativa y devuelve un File (o null si se cancela).
export function captureFromCamera() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';        // cámara trasera
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    input.addEventListener('change', () => {
      settled = true;
      const f = input.files && input.files[0] ? input.files[0] : null;
      input.remove();
      resolve(f);
    });
    // Fallback: si el usuario cancela, no siempre dispara 'change'.
    window.addEventListener('focus', function onFocus() {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => { if (!settled) { input.remove(); resolve(null); } }, 800);
    });
    input.click();
  });
}

// También permite elegir de galería (sin capture).
export function pickFromGallery() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const f = input.files && input.files[0] ? input.files[0] : null;
      input.remove();
      resolve(f);
    });
    input.click();
  });
}

// Carga un File/Blob en un HTMLImageElement.
export function loadImage(blobOrFile) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blobOrFile);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// Redimensiona/comprime a JPEG. Devuelve { blob, width, height }.
export async function compressImage(blobOrFile, maxSide = 2000, quality = 0.86) {
  const img = await loadImage(blobOrFile);
  let { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  return { blob, width: w, height: h };
}

// Genera una miniatura cuadrada (dataURL) para listados.
export async function makeThumb(blobOrFile, size = 200) {
  const img = await loadImage(blobOrFile);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - s) / 2;
  const sy = (img.naturalHeight - s) / 2;
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.75);
}

// Dibuja un marcador (pin) sobre una imagen y devuelve un dataURL.
// marker = { x, y } en coordenadas normalizadas 0..1.
export async function renderWithMarker(blobOrFile, marker, maxSide = 1400) {
  const img = await loadImage(blobOrFile);
  let { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.round(w * scale); h = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  if (marker) {
    const cx = marker.x * w, cy = marker.y * h;
    const r = Math.max(14, w * 0.025);
    ctx.lineWidth = Math.max(3, w * 0.006);
    ctx.strokeStyle = '#ff3b5c';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // cruz
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.6, cy); ctx.lineTo(cx - r * 0.5, cy);
    ctx.moveTo(cx + r * 0.5, cy); ctx.lineTo(cx + r * 1.6, cy);
    ctx.moveTo(cx, cy - r * 1.6); ctx.lineTo(cx, cy - r * 0.5);
    ctx.moveTo(cx, cy + r * 0.5); ctx.lineTo(cx, cy + r * 1.6);
    ctx.stroke();
  }
  return canvas.toDataURL('image/jpeg', 0.85);
}

// Dibuja la geometría del escáner (perímetro de lesión o wireframes de
// cabello + mapa de calor) sobre la imagen para incrustarla en el PDF.
export async function renderWithScan(blobOrFile, scan, marker, maxSide = 1400) {
  const img = await loadImage(blobOrFile);
  let { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.round(w * scale); h = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  // mapa de calor (lesión)
  if (scan?.heat) {
    const cw = w / scan.heat.gx, ch = h / scan.heat.gy;
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let gy = 0; gy < scan.heat.gy; gy++) for (let gx = 0; gx < scan.heat.gx; gx++) {
      const v = scan.heat.cells[gy * scan.heat.gx + gx];
      if (v < 0.12) continue;
      ctx.globalAlpha = v * 0.45;
      ctx.fillStyle = `hsl(${60 - v * 60}, 95%, 55%)`;
      ctx.fillRect(gx * cw, gy * ch, cw + 1, ch + 1);
    }
    ctx.restore();
  }

  // perímetro de lesión
  if (scan?.contour) {
    ctx.lineWidth = Math.max(2, w * 0.005);
    ctx.strokeStyle = '#a78bfa'; ctx.fillStyle = 'rgba(167,139,250,0.12)';
    ctx.beginPath();
    scan.contour.forEach((p, i) => { const x = p.x * w, y = p.y * h; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // wireframes de cabello
  if (scan?.segments) {
    ctx.lineWidth = Math.max(1.5, w * 0.004); ctx.lineCap = 'round';
    ctx.strokeStyle = '#38bdf8';
    for (const s of scan.segments) {
      ctx.beginPath(); ctx.moveTo(s.x1 * w, s.y1 * h); ctx.lineTo(s.x2 * w, s.y2 * h); ctx.stroke();
    }
  }

  if (marker) {
    const cx = marker.x * w, cy = marker.y * h, r = Math.max(14, w * 0.025);
    ctx.lineWidth = Math.max(3, w * 0.006); ctx.strokeStyle = '#ff3b5c';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

export function dataURLToBlob(dataURL) {
  const [head, body] = dataURL.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
