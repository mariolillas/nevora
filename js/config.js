// =====================================================================
// Configuración global de la app.
// Para renombrar la app, cambia APP_NAME (y opcionalmente APP_SHORT).
// =====================================================================
export const CONFIG = {
  APP_NAME: 'Nevora',
  APP_SHORT: 'Nevora',
  APP_TAGLINE: 'Dermatoscopía digital · Lesiones y Tricoscopía',
  VERSION: '1.0.0',
  DB_NAME: 'nevora-db',
  DB_VERSION: 1,
  // Texto legal que aparece en pantalla y en los reportes PDF.
  DISCLAIMER:
    'Los resultados de IA son ASISTENCIALES y NO constituyen un diagnóstico médico. ' +
    'Esta aplicación no es un dispositivo médico certificado. Toda decisión clínica debe ' +
    'ser tomada por un profesional de la salud cualificado.',
};

export const BODY_LOCATIONS = [
  'Cuero cabelludo', 'Frente', 'Cara', 'Cuello', 'Pecho', 'Abdomen',
  'Espalda alta', 'Espalda baja', 'Hombro izq.', 'Hombro der.',
  'Brazo izq.', 'Brazo der.', 'Antebrazo izq.', 'Antebrazo der.',
  'Mano izq.', 'Mano der.', 'Glúteo izq.', 'Glúteo der.',
  'Muslo izq.', 'Muslo der.', 'Pierna izq.', 'Pierna der.',
  'Pie izq.', 'Pie der.', 'Otra',
];

export const COUNTRIES = [
  'México', 'Estados Unidos', 'Canadá', 'España', 'Argentina', 'Colombia',
  'Chile', 'Perú', 'Brasil', 'Guatemala', 'Costa Rica', 'Panamá',
  'Ecuador', 'Venezuela', 'Uruguay', 'Paraguay', 'Bolivia', 'Otro',
];
