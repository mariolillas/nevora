// =====================================================================
// Respaldo híbrido: local primero + exportar/importar archivo.
// El export incluye TODO (pacientes, sesiones, fotos en base64, ajustes)
// en un solo .json que puedes guardar en Google Drive, correo, etc.
// (Integración OAuth directa con Drive: fase 2.)
// =====================================================================
import { exportAll, importAll } from './db.js';
import { blobToDataURL, dataURLToBlob } from './camera.js';
import { CONFIG } from './config.js';

export async function exportBackup() {
  const dump = await exportAll();
  // Serializar blobs de fotos a base64.
  for (const ph of dump.photos || []) {
    if (ph.blob instanceof Blob) ph.blob = await blobToDataURL(ph.blob);
  }
  const payload = {
    app: CONFIG.APP_NAME,
    version: CONFIG.VERSION,
    exportedAt: new Date().toISOString(),
    data: dump,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${CONFIG.APP_SHORT}_respaldo_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBackup(file, { merge = true } = {}) {
  const text = await file.text();
  const payload = JSON.parse(text);
  const dump = payload.data || payload;
  // Reconstruir blobs.
  for (const ph of dump.photos || []) {
    if (typeof ph.blob === 'string' && ph.blob.startsWith('data:')) {
      ph.blob = dataURLToBlob(ph.blob);
    }
  }
  await importAll(dump, { merge });
  return {
    patients: (dump.patients || []).length,
    sessions: (dump.sessions || []).length,
    photos: (dump.photos || []).length,
  };
}
