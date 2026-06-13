// =====================================================================
// Mapa corporal tocable (SVG). Vista Frente / Espalda con zonas que
// rellenan la MISMA lista de localizaciones (BODY_LOCATIONS), por lo que
// el valor guardado es compatible con todo (timeline, PDF, comparación).
// Orientación anatómica mirando al paciente: en FRENTE, el lado izquierdo
// de la pantalla es el lado DERECHO del paciente.
// =====================================================================
import { esc } from './ui.js';

// zonas: { loc, cx, cy } sobre un lienzo 100 x 170
const FRONT = [
  { loc: 'Frente', cx: 50, cy: 12 },
  { loc: 'Cara', cx: 50, cy: 20 },
  { loc: 'Cuello', cx: 50, cy: 30 },
  { loc: 'Hombro der.', cx: 33, cy: 37 }, { loc: 'Hombro izq.', cx: 67, cy: 37 },
  { loc: 'Pecho', cx: 50, cy: 44 },
  { loc: 'Brazo der.', cx: 27, cy: 50 }, { loc: 'Brazo izq.', cx: 73, cy: 50 },
  { loc: 'Abdomen', cx: 50, cy: 60 },
  { loc: 'Antebrazo der.', cx: 24, cy: 66 }, { loc: 'Antebrazo izq.', cx: 76, cy: 66 },
  { loc: 'Mano der.', cx: 22, cy: 80 }, { loc: 'Mano izq.', cx: 78, cy: 80 },
  { loc: 'Muslo der.', cx: 43, cy: 92 }, { loc: 'Muslo izq.', cx: 57, cy: 92 },
  { loc: 'Pierna der.', cx: 43, cy: 120 }, { loc: 'Pierna izq.', cx: 57, cy: 120 },
  { loc: 'Pie der.', cx: 43, cy: 146 }, { loc: 'Pie izq.', cx: 57, cy: 146 },
];
const BACK = [
  { loc: 'Cuero cabelludo', cx: 50, cy: 14 },
  { loc: 'Cuello', cx: 50, cy: 30 },
  { loc: 'Hombro izq.', cx: 33, cy: 37 }, { loc: 'Hombro der.', cx: 67, cy: 37 },
  { loc: 'Espalda alta', cx: 50, cy: 46 },
  { loc: 'Brazo izq.', cx: 27, cy: 50 }, { loc: 'Brazo der.', cx: 73, cy: 50 },
  { loc: 'Espalda baja', cx: 50, cy: 62 },
  { loc: 'Antebrazo izq.', cx: 24, cy: 66 }, { loc: 'Antebrazo der.', cx: 76, cy: 66 },
  { loc: 'Mano izq.', cx: 22, cy: 80 }, { loc: 'Mano der.', cx: 78, cy: 80 },
  { loc: 'Glúteo izq.', cx: 43, cy: 78 }, { loc: 'Glúteo der.', cx: 57, cy: 78 },
  { loc: 'Muslo izq.', cx: 43, cy: 96 }, { loc: 'Muslo der.', cx: 57, cy: 96 },
  { loc: 'Pierna izq.', cx: 43, cy: 122 }, { loc: 'Pierna der.', cx: 57, cy: 122 },
  { loc: 'Pie izq.', cx: 43, cy: 146 }, { loc: 'Pie der.', cx: 57, cy: 146 },
];

// silueta humanoide (formas simples)
const SILHOUETTE = `
  <circle cx="50" cy="15" r="11"/>
  <rect x="45" y="25" width="10" height="7" rx="3"/>
  <path d="M30 34 h40 a6 6 0 0 1 6 6 v30 a5 5 0 0 1-5 5 h-3 v-30 h-42 v30 h-3 a5 5 0 0 1-5-5 v-30 a6 6 0 0 1 6-6 z"/>
  <rect x="20" y="40" width="9" height="44" rx="4.5"/>
  <rect x="71" y="40" width="9" height="44" rx="4.5"/>
  <circle cx="24" cy="86" r="5"/><circle cx="76" cy="86" r="5"/>
  <path d="M34 74 h13 v84 a5 5 0 0 1-10 0 z"/>
  <path d="M53 74 h13 v84 a5 5 0 0 1-10 0 z"/>
  <ellipse cx="40" cy="162" rx="6" ry="4"/><ellipse cx="60" cy="162" rx="6" ry="4"/>`;

function zonesSvg(zones, selected) {
  return zones.map((z) =>
    `<circle class="bm-zone ${z.loc === selected ? 'active' : ''}" data-loc="${esc(z.loc)}" cx="${z.cx}" cy="${z.cy}" r="6">
       <title>${esc(z.loc)}</title></circle>`).join('');
}

// Devuelve el HTML del mapa. `selected` = localización actual.
export function bodyMapMarkup(selected = '') {
  return `
    <div class="bodymap" data-view="front">
      <div class="bm-toggle">
        <button type="button" data-bmview="front" class="active">Frente</button>
        <button type="button" data-bmview="back">Espalda</button>
      </div>
      <svg class="bm-svg" viewBox="0 0 100 170" aria-label="Mapa corporal">
        <g class="bm-body">${SILHOUETTE}</g>
        <g class="bm-zones front">${zonesSvg(FRONT, selected)}</g>
        <g class="bm-zones back" hidden>${zonesSvg(BACK, selected)}</g>
      </svg>
      <p class="bm-selected">${selected ? `📍 ${esc(selected)}` : 'Toca una zona del cuerpo'}</p>
    </div>`;
}

// Conecta el mapa: al tocar una zona llama onSelect(loc).
export function wireBodyMap(root, onSelect) {
  const map = root.querySelector('.bodymap');
  if (!map) return;
  const label = map.querySelector('.bm-selected');
  // cambio frente/espalda
  map.querySelectorAll('[data-bmview]').forEach((b) => b.addEventListener('click', () => {
    const v = b.getAttribute('data-bmview');
    map.querySelectorAll('[data-bmview]').forEach((x) => x.classList.toggle('active', x === b));
    map.querySelector('.bm-zones.front').hidden = v !== 'front';
    map.querySelector('.bm-zones.back').hidden = v !== 'back';
  }));
  // selección de zona
  map.querySelectorAll('.bm-zone').forEach((z) => z.addEventListener('click', () => {
    const loc = z.getAttribute('data-loc');
    map.querySelectorAll('.bm-zone').forEach((x) => x.classList.toggle('active', x.getAttribute('data-loc') === loc));
    if (label) label.textContent = `📍 ${loc}`;
    onSelect(loc);
  }));
}
