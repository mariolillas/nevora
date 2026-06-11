// =====================================================================
// Nevora — punto de entrada: router por hash + service worker.
// Las pantallas viven en js/views/*.js; los helpers de UI en js/ui.js.
//
// Rutas:
//   #/                          lista de pacientes
//   #/patient/new · #/edit/:id  formulario de paciente
//   #/patient/:id[?tab=…]       detalle (seguimiento | visitas)
//   #/lesion/new/:patientId     nueva lesión / zona
//   #/lesion/:id[/edit]         línea de tiempo de la lesión
//   #/session/:id               visita (captura + análisis + PDF)
//   #/compare/:lesionId?a=&b=   comparación por lesión
//   #/compare-adhoc/:patientId?a=&b=  comparación rápida
//   #/settings                  ajustes
// =====================================================================
import * as db from './db.js';
import { app, esc, clearURLs, setRenderer, toast } from './ui.js';
import { renderHome } from './views/home.js';
import { renderPatient, renderPatientForm } from './views/patient.js';
import { renderLesion, renderLesionForm } from './views/lesion.js';
import { renderSession } from './views/session.js';
import { renderCompare } from './views/compare.js';
import { renderSettings } from './views/settings.js';

async function render() {
  clearURLs();
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const q = new URLSearchParams(qs || '');
  const [r, a, b] = path.split('/').filter(Boolean);
  try {
    if (!r) return await renderHome();
    if (r === 'patient' && a === 'new') return await renderPatientForm();
    if (r === 'patient' && a) return await renderPatient(a, q);
    if (r === 'edit' && a) return await renderPatientForm(a);
    if (r === 'lesion' && a === 'new' && b) return await renderLesionForm(null, b);
    if (r === 'lesion' && a && b === 'edit') return await renderLesionForm(a);
    if (r === 'lesion' && a) return await renderLesion(a);
    if (r === 'session' && a) return await renderSession(a);
    if (r === 'compare' && a) return await renderCompare({ lesionId: a, q });
    if (r === 'compare-adhoc' && a) return await renderCompare({ patientId: a, q });
    if (r === 'settings') return await renderSettings();
    return await renderHome();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="screen"><div class="empty"><h3>Algo salió mal</h3><p class="error">${esc(e.message)}</p><button class="btn btn-primary" onclick="location.hash='/';location.reload()">Volver al inicio</button></div></div>`;
  }
}

setRenderer(render);
window.addEventListener('hashchange', render);

// Arranque: deja terminar la animación del splash (solo en la carga
// inicial) y haz un fade-out antes del primer render.
const SPLASH_MIN = 1900;
const bootStart = Date.now();
db.openDB().then(async () => {
  const splash = document.getElementById('splash');
  if (splash) {
    const left = SPLASH_MIN - (Date.now() - bootStart);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    splash.classList.add('out');
    await new Promise((r) => setTimeout(r, 420));
  }
  await render();
}).catch((e) => {
  console.error(e);
  app.innerHTML = `<div class="screen"><p class="error">No se pudo abrir la base de datos local: ${esc(e?.message || e)}</p></div>`;
});

// ---------- service worker + aviso de nueva versión ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Nueva versión disponible', 'info', { label: 'Actualizar', onClick: () => location.reload() });
        }
      });
    });
  }).catch(() => {});
}
