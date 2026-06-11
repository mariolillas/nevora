// =====================================================================
// Vista AJUSTES: datos del profesional, estadísticas y respaldo.
// =====================================================================
import { CONFIG } from '../config.js';
import * as db from '../db.js';
import { AI_ENGINE } from '../ai.js';
import { exportBackup, importBackup } from '../backup.js';
import { chrome, ICON, esc, $, toast, spinner, rerender } from '../ui.js';

export async function renderSettings() {
  const clinician = await db.getSetting('clinician', {});
  const st = await db.stats();
  chrome('Ajustes', `
    <h3 class="section-title">Datos del profesional <small>(aparecen en el PDF)</small></h3>
    <form class="form" id="cform">
      <label>Nombre del profesional<input name="name" value="${esc(clinician.name || '')}"></label>
      <label>Clínica / Consultorio<input name="clinic" value="${esc(clinician.clinic || '')}"></label>
      <button class="btn btn-primary btn-block" type="submit">Guardar</button>
    </form>

    <h3 class="section-title">Respaldo de datos</h3>
    <div class="stats">
      <span><b>${st.patients}</b> pacientes</span>
      <span><b>${st.lesions}</b> lesiones</span>
      <span><b>${st.sessions}</b> visitas</span>
      <span><b>${st.photos}</b> fotos</span>
    </div>
    <p class="muted small">Todo se guarda localmente en este dispositivo. Exporta un respaldo y guárdalo en Google Drive o donde prefieras.</p>
    <button class="btn btn-outline btn-block" id="export">${ICON.download} Exportar respaldo (.json)</button>
    <button class="btn btn-outline btn-block" id="importBtn">${ICON.upload} Importar respaldo</button>
    <input type="file" id="importFile" accept="application/json" hidden>

    <p class="muted small center" style="margin-top:24px">${esc(CONFIG.APP_NAME)} v${CONFIG.VERSION} · Motor IA: ${esc(AI_ENGINE)}</p>
    <p class="disclaimer">${esc(CONFIG.DISCLAIMER)}</p>
  `, { back: '/' });

  $('#cform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    await db.setSetting('clinician', data);
    toast('Guardado', 'success');
  });
  $('#export').addEventListener('click', async () => {
    const close = spinner('Exportando…');
    try { await exportBackup(); toast('Respaldo exportado', 'success'); }
    catch (e) { console.error(e); toast('Error al exportar', 'error'); }
    finally { close(); }
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const close = spinner('Importando…');
    try {
      const r = await importBackup(file, { merge: true });
      toast(`Importado: ${r.patients} pacientes, ${r.photos} fotos`, 'success');
    } catch (err) { console.error(err); toast('Archivo inválido', 'error'); }
    finally { close(); rerender(); }
  });
}
