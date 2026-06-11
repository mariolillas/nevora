# Nevora

App web (PWA) de dermatoscopía digital para gestión de pacientes, captura de imágenes
**macro/micro** con la cámara del teléfono, análisis asistido (placeholder) y **reportes PDF**.
Inspirada en el flujo de MoleAnalyzer (lesiones) y TrichoScale (tricoscopía).

> ⚠️ **Aviso médico:** los resultados de IA son **asistenciales y simulados** en esta versión.
> No es un dispositivo médico certificado ni sustituye el criterio de un profesional.

---

## ✨ Qué hace (v1)

- **Pacientes**: nombre, apellidos, fecha de nacimiento, sexo, país, altura, notas.
- **Sesiones** por paciente, de dos tipos:
  - 🔬 **Lesión / Nevo** → AI-Score de malignidad (0–100) + reglas ABCD + recomendación.
  - 💇 **Cabello / Tricoscopía** → densidad, cabellos por folículo, alopecia areata,
    dermatitis seborreica, patrón androgenético.
- **Flujo de captura**: foto **macro** → marcar la lesión con un toque → foto **micro** (con el
  zoom de la cámara) → análisis → **reporte PDF**.
- **Cámara nativa**: usa la app de cámara del teléfono (todo el zoom óptico y calidad real del
  S25 Ultra / iPhone Pro Max).
- **100% offline / privado**: los datos viven en el dispositivo (IndexedDB).
- **Respaldo híbrido**: exportar/importar un `.json` con todo (lo guardas en Google Drive, etc.).
- **Instalable** como app (PWA) en Android e iOS.

---

## 🚀 Publicar en GitHub Pages (para instalarla en el teléfono)

La cámara, el service worker y la instalación PWA **requieren HTTPS**. GitHub Pages lo da gratis.

1. Crea un repositorio nuevo en GitHub, por ejemplo `nevora`.
2. Sube **todo el contenido de esta carpeta** a la raíz del repo (no dentro de una subcarpeta).
   - Por web: *Add file → Upload files* y arrastra todos los archivos y carpetas (`index.html`,
     `css/`, `js/`, `icons/`, `manifest.webmanifest`, `sw.js`, `.nojekyll`).
   - Por terminal:
     ```bash
     git init
     git add .
     git commit -m "Nevora v1"
     git branch -M main
     git remote add origin https://github.com/TU_USUARIO/nevora.git
     git push -u origin main
     ```
3. En el repo: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**,
   rama `main`, carpeta `/ (root)`. Guarda.
4. Espera ~1 min. Tu app quedará en:
   `https://TU_USUARIO.github.io/nevora/`
5. Abre ese enlace **en el teléfono** (Chrome en Android, Safari en iPhone) y:
   - **Android/Chrome**: menú ⋮ → *Instalar app / Agregar a pantalla de inicio*.
   - **iPhone/Safari**: botón compartir → *Agregar a pantalla de inicio*.

---

## 🧪 Probar en tu computadora (opcional)

Los módulos ES requieren un servidor (no funciona con doble-clic en `file://`):

```bash
cd "ruta/a/MarioFinder app"
python -m http.server 8080
```
Luego abre `http://localhost:8080`. (La cámara en escritorio abrirá el selector de archivos;
el flujo real de cámara es en el teléfono.)

---

## 📁 Estructura

```
index.html              · shell de la app + carga jsPDF (CDN)
manifest.webmanifest    · metadatos PWA
sw.js                   · service worker (offline)
css/styles.css          · tema oscuro premium
icons/                  · iconos 192/512
js/
  config.js   · nombre de la app, textos, listas (país, localización)  ← renombrar aquí
  db.js       · IndexedDB (pacientes, sesiones, fotos, análisis)
  camera.js   · captura nativa, compresión, miniaturas, marcador
  ai.js       · análisis SIMULADO (lesión y cabello)   ← conectar IA real aquí
  pdf.js      · reportes PDF
  backup.js   · exportar/importar respaldo
  app.js      · interfaz, router y flujo
```

## 🔧 Personalizar

- **Renombrar la app**: edita `APP_NAME` y `APP_SHORT` en `js/config.js`.
- **Conectar IA real (fase 2)**: reemplaza el cuerpo de `analyzeLesion()` / `analyzeHair()` en
  `js/ai.js` por una llamada a tu backend o API de visión. Mantén la **misma forma del objeto**
  devuelto y el PDF y la UI seguirán funcionando sin cambios.

## 🛣️ Próximos pasos sugeridos (fase 2)

- IA real (modelo en navegador o API de visión con backend).
- Comparación temporal de la misma lesión (seguimiento / *body mapping*).
- Sincronización en la nube y login (Supabase/Firebase) con consentimiento del paciente.
- Integración directa con Google Drive para respaldos automáticos.
