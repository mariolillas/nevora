// =====================================================================
// Worklist de atención (cross-paciente) + control de re-citas.
// Recorre Paciente → Lesión → visitas y arma una lista priorizada de
// lo que requiere atención: control vencido, riesgo alto o evolución
// con veredicto "Atención". Lo consume la pantalla de inicio.
// =====================================================================
import * as db from './db.js';
import { buildComparison } from './evolution.js';

const SEV = { worsening: 3, overdue: 2, high: 2, soon: 1 };

// now: timestamp actual (inyectado para evitar Date.now en módulos puros)
export async function buildWorklist(now = Date.now()) {
  const items = [];
  const patients = await db.listPatients();
  for (const p of patients) {
    const lesions = await db.listLesions(p.id);
    for (const l of lesions) {
      const visits = await db.listSessionsByLesion(l.id); // asc por fecha
      const reasons = [];

      // ---- control programado ----
      if (l.nextControl) {
        const days = Math.round((l.nextControl - now) / 86400000);
        if (days < 0) reasons.push({ type: 'overdue', sev: SEV.overdue, text: `Control vencido hace ${-days} día${-days === 1 ? '' : 's'}` });
        else if (days <= 14) reasons.push({ type: 'soon', sev: SEV.soon, text: `Control en ${days} día${days === 1 ? '' : 's'}` });
      }

      // ---- riesgo / evolución (sobre las visitas analizadas) ----
      if (visits.length) {
        const last = visits[visits.length - 1];
        const lastAn = (await db.listAnalyses(last.id))[0]?.result;
        if (lastAn?.type === 'lesion' && lastAn.risk === 'Alto') {
          reasons.push({ type: 'high', sev: SEV.high, text: `Riesgo alto (AI-Score ${lastAn.score})` });
        }
        if (visits.length >= 2) {
          const prev = visits[visits.length - 2];
          const prevAn = (await db.listAnalyses(prev.id))[0]?.result;
          if (lastAn && prevAn && lastAn.type === prevAn.type) {
            const cmp = buildComparison({ type: last.type, analysisA: prevAn, analysisB: lastAn, dateA: prev.createdAt, dateB: last.createdAt });
            if (cmp.verdict?.level === 'attention') {
              reasons.push({ type: 'worsening', sev: SEV.worsening, text: 'Cambios significativos entre visitas' });
            }
          }
        }
      }

      if (reasons.length) {
        const sev = Math.max(...reasons.map((r) => r.sev));
        items.push({
          lesionId: l.id, patientId: p.id,
          patientName: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
          label: l.label, type: l.type, bodyLocation: l.bodyLocation,
          reasons, sev,
        });
      }
    }
  }
  // prioriza: mayor severidad primero
  items.sort((a, b) => b.sev - a.sev);
  return items;
}

// Intervalos rápidos para programar el próximo control.
export const CONTROL_INTERVALS = [
  { label: '1 mes', months: 1 },
  { label: '3 meses', months: 3 },
  { label: '6 meses', months: 6 },
  { label: '12 meses', months: 12 },
];

export function addMonths(ts, months) {
  const d = new Date(ts);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}
