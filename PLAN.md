# Nevora — Plan Maestro

> Documento de referencia completo del proyecto. Sirve como **spec para el rediseño** y para retomar el contexto en cualquier sesión nueva (incluido un rediseño profundo con Fable 5).
>
> Ubicación del proyecto: `G:\Mi unidad\Claude\MarioFinder app`
> Repo: https://github.com/mariolillas/nevora · App: https://mariolillas.github.io/nevora/
> Última actualización del plan: 2026-06-11 · Versión app: 2.0.0 (rediseño + seguimiento §6.1)

---

## 1. Visión y propósito

**Nevora** es una aplicación web instalable (PWA) de **dermatoscopía digital** que usa la **cámara del teléfono** (Galaxy S25 Ultra / iPhone Pro Max) para:

1. Organizar **pacientes** (nombre, apellidos, fecha de nacimiento, sexo, país, altura, notas).
2. Capturar **sesiones de fotos** por paciente, en dos modalidades:
   - 🔬 **Lesión / Nevo** → evaluación de malignidad con **AI-Score** (estilo *MoleAnalyzer pro*).
   - 💇 **Cabello / Tricoscopía** → alopecia areata, dermatitis seborreica, densidad y conteo de cabellos por folículo (estilo *TrichoScale AI*).
3. Generar **reportes PDF** clínicos.

**Diferenciador clave vs. la competencia:** los productos de FotoFinder (incluido Skeen) dependen de **hardware externo** (dermatoscopio USB "skeen optics", FTDI). Nevora usa la **cámara nativa del teléfono** → mucho más accesible, sin hardware propietario.

### Propósito del negocio
El usuario (Mario, grupomfz.com) trabaja con productos FotoFinder y quiere una alternativa propia/de marca más accesible. Mercado: México/Latinoamérica (español) + inglés.

---

## 2. Mercado y competencia

| Producto | Empresa | Enfoque | Nevora lo replica con… |
|---|---|---|---|
| **MoleAnalyzer pro** | FotoFinder | AI-Score de malignidad de lesiones/nevos | Modalidad "Lesión": AI-Score 0–100, reglas ABCD, recomendación |
| **TrichoScale AI** | FotoFinder | Análisis de cabello/cuero cabelludo | Modalidad "Cabello": densidad, cab/folículo, alopecia areata, dermatitis seborreica |
| **Skeen** (`kiosk_2.1.1.apk`) | FotoFinder | Teledermatología con dermatoscopio USB | Mismo flujo de casos pero con cámara del teléfono |

### Hallazgos de la ingeniería inversa de Skeen
- App **Flutter** (lógica compilada en `libapp.so`, no legible línea por línea).
- Diseñada para hardware USB externo **"skeen optics"** (chip FTDI, fabricante FotoFinder). Confirmado en `skeen_case_config_1.0.0.json`.
- Usa **ML Kit** (Google) para leer QR/códigos de barras (registro de casos).
- **No usa la cámara del teléfono** → el enfoque de Nevora es distinto y la lógica de Skeen no era reutilizable.
- APK ya descompilada en: `G:\Mi unidad\Claude\SQL Xpert\skeen_apks\kiosk_decompiled`.

### IA offline embebida en el APK (análisis 2026-06-11)
- **3 modelos PyTorch cifrados** (~170 MB c/u) en `assets/flutter_assets/assets/`: `mn_220821.pt.ffai` (MoleAnalyzer / AI-Score de nevos), `bm_240418.pt.ffai`, `cm_240328.pt.ffai`, + `model_config.xml.ffai`. Cabecera propietaria **`FFAI`** (FotoFinder AI), datos cifrados; la clave vive en `libffcoreai.so`.
- **Motor:** `libffcoreai.so`/`-jni.so` = **PyTorch Mobile (TorchScript/LibTorch)** con Vulkan/Metal y **Grad-CAM** (de ahí el mapa de calor de MoleAnalyzer).
- **Cabello:** `libhair_analyzer_sdk.so` = **OpenCV clásico** (segmentación, LDA terminal/vellus, conteo por contornos, salida SVG con `Terminal:`/`Vellus:`/`Hair Count`/`Hair Thickness`) — **no** deep learning.
- ⚠️ **Decisión:** los modelos están cifrados a propósito (PI de FotoFinder) y son dispositivo médico regulado → **NO** se descifran ni reutilizan en Nevora (ilegal + riesgo regulatorio). En su lugar se **replicaron las TÉCNICAS de forma legal** con código propio (`js/cv.js`). Vía legítima si se quiere su IA: licencia/SDK con FotoFinder.

---

## 3. Nombre y marca

- **Nombre elegido: Nevora** (de "nevo"; abstracto, premium, fácil en español e inglés).
- Se evaluaron 12 candidatos; la mayoría chocaban con productos/competidores reales (DermaVue, DermaQ, DermaIQ son casi el mismo producto → descartados).
- Alternativas limpias de respaldo: **Pielara** (acuñado, mercado latino), **Cutalix**, **Soraderm**.
- ⚠️ **Pendiente legal:** la búsqueda web confirma *uso*, no *registro*. Antes de comprometer la marca, hacer búsqueda formal en **IMPI (México)** y **USPTO (EE.UU.)** + registrar dominio `.com`.
- El nombre vive en **una sola constante**: `js/config.js → CONFIG.APP_NAME` / `APP_SHORT`. Cambiarlo ahí lo propaga a toda la app y los PDFs.

### Estilo visual
- **Tema oscuro / moderno premium** (azules/índigo sobre fondo oscuro). Tipo apps premium.
- Paleta actual (CSS variables en `css/styles.css`): fondo `#0b0f17`, acentos `#3b82f6` / `#6366f1`.
- Icono: lente dermatoscópica con punto/lesión central (generado con Pillow, `icons/icon-192.png` y `-512.png`).

---

## 4. Decisiones tomadas (confirmadas por el usuario)

| Tema | Decisión | Notas |
|---|---|---|
| **Motor de IA (v2)** | **Visión por computadora local + respaldo simulado** | `js/cv.js` MIDE la imagen (ABCD real de lesión; conteo/grosor/terminal-vellus de cabello con técnicas OpenCV propias). Si la imagen no es medible, cae al placeholder simulado estable por foto. Etiquetado "no diagnóstico". |
| **IA (test)** | **Claude Vision API vía proxy** (siguiente paso) | Opus 4.8 o Sonnet 4.6. Centavos por análisis. Ver §9. |
| **Almacenamiento** | **Híbrido** | Local primero (IndexedDB) + exportar/importar respaldo `.json`. Drive directo = fase 2. |
| **Alcance v1** | Flujo completo funcional sin IA real | Pacientes + cámara macro/micro + marcar lesión + sesiones + PDF. |
| **Estilo** | Moderno/oscuro premium | — |
| **Cámara** | **Captura nativa** (`<input capture>`) | Aprovecha zoom óptico real; mejor que getUserMedia, sobre todo en iOS. |
| **Hosting** | **GitHub Pages** (PWA, HTTPS) | Instalable en el teléfono. |

---

## 5. Funcionalidades (v1 — implementadas)

- **Pacientes:** alta/edición/borrado, búsqueda, lista ordenada por actividad.
- **Sesiones:** dos tipos (lesión / cabello), historial por paciente, localización en el cuerpo (selector), notas.
- **Captura:** foto macro + foto micro (cámara nativa), compresión a JPEG, miniaturas.
- **Marcar lesión:** sobre la macro, toque para colocar un pin (coordenadas normalizadas); se dibuja en el PDF.
- **Análisis IA (simulado):**
  - Lesión: AI-Score 0–100, riesgo bajo/medio/alto, ABCD (asimetría, borde, colores, estructuras), TDS, patrones, recomendación.
  - Cabello: densidad (cab/cm²), unidades foliculares, cab/folículo, terminal/vellus %, anisotricosis, grosor, hallazgos (alopecia areata, dermatitis seborreica, patrón androgenético) con % de confianza.
- **Reportes PDF:** encabezado de marca, datos del paciente, fotos macro (con marcador) y micro, resultados del análisis, datos del profesional, disclaimer.
- **Respaldo:** exportar/importar `.json` con todo (fotos en base64).
- **Ajustes:** datos del profesional (aparecen en el PDF), estadísticas, respaldo.
- **PWA:** instalable, funciona offline (service worker), icono propio.

---

## 6. Workflow de captura (flujo por sesión)

```
Paciente → Nueva sesión (Lesión o Cabello)
   1. Localización en el cuerpo (selector)
   2. Foto MACRO (cámara nativa) → tocar para marcar la lesión (pin)
   3. Foto MICRO (cámara nativa con zoom dermatoscópico)
   4. Analizar con IA → AI-Score / hallazgos
   5. Generar reporte PDF
   (Notas de la sesión en cualquier momento)
```

---

## 6.1 Seguimiento y comparación de imágenes (workflow recomendado)

Funcionalidad clave para el rediseño: **comparar la misma lesión/zona entre dos citas** (ej. cita 1 en enero vs. cita 2 en febrero) y emitir un **reporte de comparación en PDF**. Es el equivalente al *mole monitoring* de FotoFinder.

### Concepto central: identidad de lesión a través del tiempo
El problema: hoy cada sesión es independiente; no hay forma de saber que "el nevo de la espalda de enero" y "el de febrero" son **la misma lesión**. La solución correcta es darle **identidad persistente a la lesión**:

- Nueva entidad **`lesions`** (o "zonas de seguimiento") por paciente: `{ id, patientId, label, bodyLocation, type, createdAt }`.
- Cada **sesión/captura se asocia a una lesión** (`sessions.lesionId`). Así una lesión acumula una **línea de tiempo** de visitas.
- Al crear una sesión, el usuario elige: *lesión nueva* o *seguimiento de una lesión existente* del paciente.

Esto habilita el flujo natural: **Paciente → Lesión "Nevo espalda alta" → [Enero, Febrero, Marzo…] → Comparar**.

### Workflow recomendado
```
Paciente → Lesión (zona de seguimiento) → línea de tiempo de visitas
   → botón "Comparar"
   → elegir 2 visitas (por defecto: la más antigua vs. la más reciente)
   → Pantalla de comparación lado a lado
   → "Generar reporte de comparación (PDF)"
```

### Pantalla de comparación (lado a lado)
- **Macro** visita A | visita B (con sus marcadores).
- **Micro** visita A | visita B.
- **Tabla de deltas** con flechas y cambio:
  - Lesión: AI-Score (Δ y ↑/↓), cambio de categoría de riesgo, cambios ABCD, diámetro (mm) si hay escala.
  - Cabello: densidad, cab/folículo, % vellus, anisotricosis (Δ y % de cambio).
- **Veredicto de evolución**: `Estable` / `Cambios menores` / `Atención — cambios significativos` (regla simple sobre el ΔAI-Score y Δtamaño; etiquetado "asistencial, no diagnóstico").
- Opcional avanzado: *overlay* / control deslizante para superponer ambas imágenes; alineación; mapa de calor de diferencias.

### Reporte de comparación (PDF)
- Encabezado de marca + paciente + lesión + rango de fechas (A → B).
- **Dos columnas** (visita A | visita B): macro, micro, métricas.
- **Tabla de evolución** con deltas y veredicto.
- Recomendación + disclaimer.
- Nombre: `Nevora_<apellido>_comparacion_<lesion>_<fechaA>_<fechaB>.pdf`.

### Modos de comparación
1. **Por lesión (recomendado / principal):** misma lesión, dos visitas. Es el seguimiento clínico real.
2. **Por sesión (rápido / ad-hoc):** elegir dos sesiones cualesquiera del paciente para comparar sin identidad de lesión. Útil como primer paso o cuando no se modeló la identidad.

> **Sugerencia de implementación en dos pasos:** primero el modo **ad-hoc** (comparar dos sesiones del mismo paciente, menos cambios) y luego la **identidad de lesión** con línea de tiempo (lo robusto y vendible). El reporte PDF de comparación se construye igual en ambos.

---

## 7. Arquitectura técnica (v1)

- **Stack:** Vanilla JS + **ES modules**, sin paso de build (para servir directo en GitHub Pages).
- **PWA:** `manifest.webmanifest` + `sw.js` (service worker, cache-first para assets, network-first para navegación).
- **PDF:** `jsPDF` cargado por CDN (cacheado por el SW).
- **Imágenes:** `<canvas>` para compresión, miniaturas y dibujo del marcador.
- **Router:** basado en `location.hash` (`#/`, `#/patient/:id`, `#/session/:id`, `#/settings`).
- **Requisitos de contexto seguro (HTTPS):** cámara, service worker e instalación PWA → GitHub Pages lo cubre.

### Estructura de archivos
```
index.html              · shell + carga jsPDF (CDN)
manifest.webmanifest    · metadatos PWA
sw.js                   · service worker (offline) — subir versión de CACHE al cambiar archivos
.nojekyll               · evita procesamiento Jekyll en GitHub Pages
css/styles.css          · tema oscuro premium
icons/                  · iconos 192/512
js/
  config.js   · APP_NAME, textos, listas (país, localización)   ← renombrar app aquí
  db.js       · IndexedDB v2 (pacientes, lesions, sesiones, fotos, análisis, ajustes)
                + migración automática v1→v2 (agrupa sesiones en lesiones)
  camera.js   · captura nativa, compresión, miniaturas, marcador
  ai.js       · análisis SIMULADO (lesión y cabello)   ← conectar IA real aquí
  evolution.js· deltas A→B entre visitas + veredicto de evolución (§6.1)
  pdf.js      · reporte de visita + reporte de COMPARACIÓN (2 columnas)
  backup.js   · exportar/importar respaldo
  ui.js       · helpers de UI (chrome, iconos, toasts, modales, sheets)
  views/      · home, patient, lesion, session, compare, settings
  app.js      · router por hash + registro SW (aviso de actualización)
README.md     · guía de despliegue
PLAN.md       · este documento
```

---

## 8. Modelo de datos (IndexedDB — `nevora-db`)

```
patients  { id, firstName, lastName, dob, sex, country, height, notes,
            searchName, createdAt, updatedAt }
sessions  { id, patientId, type:'lesion'|'hair', bodyLocation, notes,
            status, createdAt, updatedAt }
photos    { id, sessionId, kind:'macro'|'micro', blob, thumb,
            width, height, marker:{x,y}|null, createdAt }
analyses  { id, sessionId, photoId, type, result:{…}, createdAt }
settings  { key, value }   // p.ej. key:'clinician' → {name, clinic}
```

Borrado en cascada: borrar paciente → borra sus sesiones → borra fotos y análisis.

**Para el seguimiento/comparación (rediseño, ver §6.1)** se añade identidad de lesión:
```
lesions   { id, patientId, label, bodyLocation, type, createdAt }
sessions  { …, lesionId }   // cada sesión se asocia a una lesión (zona de seguimiento)
```
Jerarquía resultante: **Paciente → Lesión → Sesiones (visitas en el tiempo) → Fotos/Análisis**.

---

## 9. Estrategia de IA (la decisión más importante)

### Realidad sobre Claude
- La **suscripción de Claude** (chat/Claude Code) **no se puede usar dentro de una app**. La app necesita una **API key** de `console.anthropic.com` → **facturación aparte, por uso (pago por token)**.
- Un sitio estático (GitHub Pages) **no puede guardar la API key** en el navegador (quedaría expuesta). Se necesita un **proxy serverless** que la guarde en secreto.

### Plan por fases
1. **Fase actual (v1):** IA **placeholder simulada** en `js/ai.js`. Etiquetada "no diagnóstico".
2. **Fase test (siguiente paso):** **Claude Vision API** vía **proxy serverless**.
   - Proxy en **Cloudflare Workers** (plan gratis) o **Vercel/Netlify Functions**.
   - La app envía la foto (base64) al proxy → el proxy llama a Claude con la API key → devuelve `{score, risk, abcd, findings, …}`.
   - **Modelos:** `claude-opus-4-8` (mejor calidad) o `claude-sonnet-4-6` (más económico). Para análisis dermatológico descriptivo, Opus 4.8.
   - **Salida estructurada:** usar `output_config.format` (JSON schema) para que la respuesta tenga exactamente la forma que ya consume la UI y el PDF.
   - **Costo aproximado por análisis:** ~**2–5¢ USD** con Opus 4.8, ~**1–3¢** con Sonnet 4.6. Para el test (2 personas, ~cientos de análisis) = **pocos dólares en total**.
3. **Fase lanzamiento:** revisar opciones serias:
   - Modelo clínicamente **validado** / dispositivo médico certificado (camino regulatorio).
   - Backend dedicado, autenticación, cumplimiento de privacidad (datos médicos).
   - Posible modelo propio entrenado (HAM10000 u otros datasets dermatológicos).

### Cómo conectar IA real (sin romper nada)
Reemplazar el cuerpo de `analyzeLesion()` / `analyzeHair()` en `js/ai.js` por una llamada `fetch` al proxy. **Mantener la misma forma del objeto devuelto** → el PDF y la UI siguen funcionando sin cambios.

### ⚠️ Aviso médico (siempre presente)
Los resultados de IA son **asistenciales, NO diagnóstico**. Nevora **no es un dispositivo médico certificado**. Toda decisión clínica la toma un profesional. (Texto en `CONFIG.DISCLAIMER`, visible en pantalla y en cada PDF.)

---

## 10. Reportes PDF

- Generados con `jsPDF` (cliente). Un reporte = una sesión.
- Contenido: encabezado de marca, datos del paciente (con edad calculada), localización, foto macro con marcador + foto micro, tarjeta de resultados (AI-Score con color de riesgo para lesión; métricas + hallazgos para cabello), datos del profesional, disclaimer.
- Nombre de archivo: `Nevora_<apellido>_<tipo>_<fecha>.pdf`.

---

## 11. Almacenamiento y respaldo

- **Local:** todo en IndexedDB del dispositivo (privado, offline, sin costo de servidor).
- **Respaldo:** exportar `.json` con todo (fotos en base64) → guardar en Google Drive, correo, etc. Importar para restaurar/migrar.
- **Fase 2:** integración OAuth directa con Google Drive; o backend en la nube (Supabase/Firebase) con login y sincronización entre dispositivos (requiere consentimiento del paciente y cumplimiento de privacidad por ser datos médicos).

---

## 12. Despliegue (GitHub Pages)

1. Subir **el contenido de la carpeta** a un repo nuevo (todo a la raíz).
2. **Settings → Pages → Source: rama `main`, carpeta `/ (root)`**.
3. Abrir `https://USUARIO.github.io/REPO/` en el teléfono → menú → *Instalar app*.
4. Cámara + SW + instalación requieren HTTPS → GitHub Pages lo da gratis.
5. Al cambiar archivos, **subir la versión de `CACHE` en `sw.js`** para forzar actualización.

Prueba local: `python -m http.server 8080` dentro de la carpeta (los ES modules necesitan servidor, no `file://`).

---

## 13. Estado actual

✅ **v2.0.0 — rediseño completo (Fable 5) implementado:**
- **Identidad de lesión (§6.1):** store `lesions` + `sessions.lesionId` (DB v2) con **migración
  automática** de datos v1 (agrupa sesiones por paciente+tipo+localización; también al importar
  respaldos v1). Jerarquía Paciente → Lesión → línea de tiempo de visitas.
- **Pantalla de comparación** por lesión y ad-hoc: macro/micro A|B con marcadores, tabla de
  deltas, veredicto de evolución (estable / menores / atención) y sparkline de AI-Score.
- **Reporte PDF de comparación** a dos columnas con tabla de evolución y veredicto.
- **UI premium:** design system con tokens, glass topbar, anillos de score, timeline,
  microinteracciones, estados vacíos, bottom sheets, lightbox, toast de "nueva versión".
- Código reestructurado: `ui.js` + `views/*` + `evolution.js`; SW cache `nevora-v2`.
- Publicado en GitHub Pages: https://mariolillas.github.io/nevora/

⏳ **Pendiente:**
- Conectar **Claude Vision** real (proxy + reemplazo en `ai.js`).
- Probar en teléfono real vía GitHub Pages.
- Búsqueda formal de marca **Nevora** (IMPI/USPTO) + dominio.

---

## 14. Objetivos del rediseño en Fable 5

> Esta sección guía la reconstrucción/mejora profunda de la app. La v1 es un MVP funcional; el rediseño debe elevar diseño, robustez y experiencia.

### Metas de diseño
- **UI de nivel producto premium**: pulir tipografía, espaciado, microinteracciones, animaciones sutiles, estados vacíos, transiciones entre pantallas.
- **Identidad de marca Nevora** coherente (logo, paleta, iconografía dermatológica).
- **Accesibilidad** y ergonomía móvil (zonas táctiles, una mano, modo oscuro/claro opcional).

### Mejoras funcionales candidatas
- **Comparación temporal / seguimiento** de la misma lesión entre citas + **reporte PDF de comparación** → **ver §6.1 (workflow detallado)**. Prioridad alta para esta etapa.
- **Mapa corporal interactivo** para ubicar lesiones.
- **Cámara en vivo opcional** con overlay (regla de medición, retícula) además de la captura nativa.
- **Galería por paciente** y línea de tiempo de sesiones.
- **Múltiples lesiones por sesión** (varias macro/micro y marcadores).
- **Mediciones** (diámetro de lesión en mm con referencia de escala).
- **Plantillas de reporte** configurables y branding por clínica.
- **Búsqueda/filtros** avanzados, etiquetas, prioridad de riesgo.

### Mejoras técnicas candidatas
- Evaluar si conviene un **framework ligero** (p.ej. Preact/Lit) manteniendo despliegue sin build complejo, o seguir vanilla bien estructurado.
- **Capa de IA** desacoplada (interfaz `analyze()` con backends intercambiables: simulado / Claude Vision / modelo propio).
- **Proxy de IA** (Cloudflare Worker) versionado en el repo.
- Tests básicos del flujo de datos.
- Manejo de errores y estados de carga más robustos.

### Restricciones a respetar en el rediseño
- Seguir siendo **PWA instalable** servible en GitHub Pages (HTTPS).
- **Captura nativa** como vía principal de cámara (calidad/zoom).
- **Local-first** + respaldo; privacidad de datos médicos.
- Mantener el **disclaimer** y el carácter **no diagnóstico** mientras no haya validación clínica.
- Nombre y textos centralizados en `config.js`.

---

## 15. Roadmap

- **Fase 1 (hecho):** MVP funcional con IA simulada, PDF, PWA, respaldo. Renombrado a Nevora.
- **Fase 1.5 (siguiente — rediseño en Fable 5):** reconstrucción UI premium + **seguimiento y comparación de lesiones (§6.1)** con reporte PDF de comparación; luego proxy + Claude Vision real; prueba en teléfono.
- **Fase 2:** Drive/nube + login; mediciones en mm; multi-lesión por sesión; mapa corporal.
- **Fase 3 (lanzamiento):** modelo clínicamente validado / ruta de dispositivo médico; cumplimiento de privacidad; branding por clínica; facturación.

---

## 16. Consideraciones legales / médicas

- **No es dispositivo médico certificado** (en su estado actual). No debe usarse como diagnóstico.
- **Datos sensibles** (salud + fotos de pacientes): requieren consentimiento informado y cumplimiento (LFPDPPP en México, GDPR/HIPAA según mercado) antes de cualquier sincronización en la nube.
- Enviar fotos a una API de IA = **los datos salen del dispositivo**; informarlo y obtener consentimiento.
- Marca **Nevora**: pendiente registro formal (IMPI/USPTO) + dominio.

---

## 17. Referencias

- Proyecto: `G:\Mi unidad\Claude\MarioFinder app`
- APK Skeen descompilada: `G:\Mi unidad\Claude\SQL Xpert\skeen_apks\kiosk_decompiled`
- Competencia: MoleAnalyzer pro y TrichoScale AI (FotoFinder).
- Modelos Claude para IA: `claude-opus-4-8` (mejor), `claude-sonnet-4-6` (económico), `claude-haiku-4-5` (más barato/rápido). API: `console.anthropic.com`.
