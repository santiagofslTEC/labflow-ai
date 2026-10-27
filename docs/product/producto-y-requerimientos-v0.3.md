# LabFlow AI — Descripción del producto y requerimientos v0.3

> Fuente: Google Doc "LabFlow AI — Descripción del producto y requerimientos v0.3" (Drive, 27 oct 2026). Copia en Markdown para el repositorio; si cambia el original, actualizar aquí.

**Misión TEC × Uniandes · Inteligencia Artificial e Ingeniería de Software · Octubre 2026**

**LabFlow AI** — El cuaderno de laboratorio que escucha, organiza y analiza.

Asistente conversacional por voz, con interfaz web, para registrar, verificar y analizar mediciones en laboratorios universitarios de ingeniería química.

> **La propuesta en una frase:** Mientras el investigador trabaja con las manos ocupadas, LabFlow convierte lo que dice en datos estructurados que el usuario confirma antes de guardar, y que luego puede consultar, graficar y resumir.

| Control del documento | |
|---|---|
| Documento | Descripción del producto y especificación de requerimientos |
| Versión | 0.3 — borrador de trabajo (reemplaza la v0.2) |
| Fecha | 27 de octubre de 2026 |
| Equipo | [Integrante 1 · Ingeniería química] · [Integrante 2 · IA / voz] · [Integrante 3 · Producto / web] |
| Estado | En revisión por el equipo antes del pitch del miércoles 28 |

## 00 Cómo se relaciona este documento con los entregables

| Entregable del curso | Dónde está | Estado |
|---|---|---|
| 1. Descripción del producto y requerimientos | Secciones 01 a 06 | Borrador v0.3 |
| 2. ML Canvas | Sección 07 (y [ml-canvas-v1.md](ml-canvas-v1.md)) | Borrador para el pitch (mié 28) |
| 3. Mockups de la UI | Sección 08 — inventario de pantallas | Diseño el jueves 29 |
| 4. Diseño arquitectónico | Sección 09 — vista preliminar | Se detalla el viernes 30 |
| 5. Diseño de pruebas | Sección 10 | Borrador |
| 6. Selección de modelos y model card | Sección 11 — candidatos | Se decide el viernes 30 |

## 01 El problema que resolvemos

En una práctica de laboratorio, medir y registrar compiten por las mismas manos. El estudiante usa guantes, manipula reactivos o vigila un equipo; anotar un valor significa detenerse, quitarse los guantes o confiar en la memoria. Los datos terminan repartidos entre cuadernos, hojas sueltas y celulares, y después hay que transcribirlos a una hoja de cálculo.

Tres problemas concretos: **errores de transcripción** (un 46 que se copia como 64), **datos incompletos** (una variable o unidad que nadie anotó) y **trabajo repetido**. Los faltantes suelen descubrirse cuando el experimento ya terminó.

| Hoy · proceso manual | Con LabFlow · flujo asistido |
|---|---|
| Interrumpir la actividad para escribir | Dictar el resultado sin soltar lo que se está haciendo |
| Copiar los datos a Excel más tarde | Los datos quedan estructurados en el momento, una sola vez |
| Errores al transcribir números y unidades | El usuario confirma cada valor; se guarda la frase original |
| Descubrir valores faltantes al final | El sistema avisa qué mediciones requeridas faltan |
| Construir tablas y gráficos a mano | Pedir el gráfico o el dato en lenguaje natural |

*Pendiente: validar con 3 a 5 estudiantes o auxiliares de laboratorio (ver sección 12).*

## 02 Usuarios y propuesta de valor

| Usuario | Contexto | Qué necesita | Dolor principal |
|---|---|---|---|
| **Estudiante de laboratorio** (principal) | Prácticas de ingeniería química en grupo, sesión de 2–3 h | Informe con tablas y gráficas correctas | Transcribir datos y descubrir faltantes al final |
| **Auxiliar de investigación** | Series de ensayos repetidos durante semanas | Historial ordenado y trazable | Datos dispersos en varios cuadernos y archivos |
| **Profesor / responsable** (secundario) | Revisa informes y bitácoras | Registros completos y verificables | Datos imposibles de rastrear |

### Hipótesis de valor

| Hipótesis | Métrica | Meta del prototipo | Cómo se mide |
|---|---|---|---|
| Menos tiempo documentando | Minutos para registrar 5 ensayos y obtener tabla + gráfico | ≥ 30 % menos que el flujo manual | Prueba cronometrada con 3 usuarios |
| Registros más completos | % de campos requeridos vacíos al cerrar | 0 % | Conteo en ambos flujos |
| Datos confiables | % de valores guardados que coinciden con lo dictado | 100 % tras confirmación; ≥ 90 % sin corregir | Comparación contra el guion |
| Datos listos para analizar | Tiempo del último ensayo a tabla, gráfico y resumen | < 1 minuto | Cronómetro en la demo |

## 03 Así se vive LabFlow

1. **Preparar** — crear el experimento y definir variables y unidades.
2. **Hablar** — dictar resultados con las manos libres, o escribirlos.
3. **Revisar** — ver lo que el sistema entendió, corregir y confirmar.
4. **Entender** — consultar tablas, gráficos y respuestas sobre los datos.

### Guion de la demostración (< 3 min)

- **Investigador:** "Ensayo 3: temperatura 50 grados, duración 15 minutos y rendimiento 73 por ciento."
- **LabFlow:** "Entendí: ensayo 3 · 50 °C · 15 min · **63 %**. ¿Lo guardo?" *(error intencional)*
- **Investigador:** "No, el rendimiento es setenta y tres."
- **LabFlow:** "Corregido: ensayo 3 · 50 °C · 15 min · 73 %. ¿Lo guardo?"
- **Investigador:** "Sí. Ahora muéstrame rendimiento contra temperatura."
- **LabFlow:** guarda y muestra la gráfica.
- **Investigador (tras cinco ensayos):** "¿Cuál fue el mayor rendimiento?"
- **LabFlow:** "El mayor rendimiento registrado es 80 %, en el ensayo 4, a 55 °C."

### Experimento de ejemplo (datos ficticios)

| Ensayo | Temperatura | Duración | Rendimiento |
|---|---|---|---|
| 1 | 40 °C | 15 min | 58 % |
| 2 | 45 °C | 15 min | 64 % |
| 3 | 50 °C | 15 min | 73 % |
| 4 | 55 °C | 15 min | 80 % |
| 5 | 60 °C | 15 min | 76 % |

## 04 Qué hace la IA (y qué no)

| Componente | Qué hace | Tecnología |
|---|---|---|
| Voz a texto | Transcribe dictado en español, incluidos números en palabras | ElevenLabs u otra |
| Extracción estructurada | Frase → {ensayo, variable, valor, unidad}; normaliza unidades; pide aclaración | LLM con salida estructurada (JSON) |
| Agente conversacional | Intención (registrar, corregir, consultar, graficar, protocolo) y llamada a herramienta | LLM con herramientas (p. ej., LangGraph) |
| Consulta del protocolo (deseable) | Responde citando el PDF cargado | RAG |
| Texto a voz | Lee confirmaciones y respuestas cortas | ElevenLabs |

**Lo que la IA no hace:** no calcula (estadísticas, gráficos y tablas son código determinista); no guarda por su cuenta; no inventa valores; no controla equipos ni da instrucciones de seguridad.

> **Principio de confianza**
> 1. Ninguna medición se guarda sin confirmación explícita (voz o botón).
> 2. Toda cifra reportada proviene de una herramienta que consulta la BD e indica de qué ensayo sale.
> 3. Cada registro conserva frase original, origen (voz/texto) y hora.

## 05 Especificación de requerimientos

Prioridades: **Imprescindible** = sin esto no hay demo; **Deseable** = solo cuando el flujo imprescindible funcione de punta a punta; **Opcional** = si sobra tiempo.

### Historias de usuario

| ID | Historia | Requerimientos |
|---|---|---|
| HU-01 | Como estudiante, quiero definir mi experimento y sus variables, para que el asistente sepa qué datos esperar. | RF-01, RF-02 |
| HU-02 | Como estudiante, quiero dictar un resultado sin soltar lo que hago. | RF-03 a RF-07 |
| HU-03 | Como estudiante, quiero revisar y corregir lo que el sistema entendió. | RF-05, RF-06, RF-08 |
| HU-04 | Como auxiliar, quiero ver tabla, gráfico y respuestas sobre mis datos. | RF-09 a RF-11 |
| HU-05 | Como estudiante, quiero que me avisen qué falta medir. | RF-13 |

### Requerimientos funcionales

| ID | Requerimiento | Prioridad | Criterio de aceptación |
|---|---|---|---|
| RF-01 | Crear experimento con título, objetivo y variables (nombre, unidad, rango opcional, requerida) | Imprescindible | Se crea con ≥ 1 variable y aparece en la lista |
| RF-02 | Listar y abrir experimentos | Imprescindible | Tras recargar, experimento y ensayos siguen disponibles |
| RF-03 | Registrar mediciones por voz | Imprescindible | Dictado completo → propuesta con todos sus campos en ≤ 5 s |
| RF-04 | Registrar mediciones por texto | Imprescindible | Misma frase escrita → misma propuesta que dictada |
| RF-05 | Mostrar propuesta y pedir confirmación | Imprescindible | Ningún valor aparece en la tabla antes de confirmar |
| RF-06 | Corregir la propuesta por voz o editando | Imprescindible | La corrección reemplaza el valor; sin duplicados |
| RF-07 | Pedir aclaración ante datos incompletos o ambiguos | Imprescindible | Si falta ensayo o la variable es ambigua, pregunta |
| RF-08 | Editar o eliminar un ensayo guardado | Deseable | Se refleja en tabla y gráfico; registra hora de edición |
| RF-09 | Tabla de ensayos | Imprescindible | Coincide exactamente con lo guardado |
| RF-10 | Gráfico X vs. Y por voz o selector | Imprescindible | Puntos coinciden con la tabla |
| RF-11 | Preguntas: máximo, mínimo, promedio, conteo, valor de un ensayo | Imprescindible | Correcta, indica ensayo de origen; si no hay datos, lo dice |
| RF-12 | Advertir valores fuera de rango / unidades incompatibles | Deseable | "500 °C" con rango 20–100 °C advierte antes de guardar |
| RF-13 | Detectar mediciones pendientes | Deseable | Al "terminar", lista ensayos con requeridas vacías |
| RF-14 | Cargar protocolo PDF y consultarlo | Deseable | Cita el fragmento; si no está, lo dice |
| RF-15 | Exportar a CSV | Deseable | Abre en Excel con mismas filas y columnas |
| RF-16 | Informe preliminar descargable | Opcional | Marcado como borrador generado con IA |

### Requerimientos no funcionales

| ID | Atributo | Requerimiento |
|---|---|---|
| RNF-01 | Idioma | Español; números en palabras y decimales con "coma" o "punto" |
| RNF-02 | Latencia | Propuesta en ≤ 5 s desde fin del dictado (objetivo 3 s) |
| RNF-03 | Precisión de extracción | ≥ 90 % del set de prueba sin corrección |
| RNF-04 | Confiabilidad de cifras | Cero cifras inventadas, incluidas preguntas trampa |
| RNF-05 | Trazabilidad | Frase original, origen, fecha/hora y estado por medición |
| RNF-06 | Usabilidad | Usuario nuevo completa el flujo sin ayuda en < 5 min; estado del micrófono siempre visible |
| RNF-07 | Plataforma | Chrome reciente en laptop |
| RNF-08 | Seguridad y privacidad | Claves de API solo en servidor; no se almacena audio; datos ficticios |
| RNF-09 | Tolerancia a fallos | Si falla la voz, el registro por texto sigue funcionando |

### Reglas de negocio

- **RN-01 · Unidades.** Cada variable tiene unidad por defecto; "grados" → °C, "por ciento" → %.
- **RN-02 · Ensayo repetido.** Si el número de ensayo ya existe, preguntar si es corrección o ensayo nuevo.
- **RN-03 · Dictado por partes.** Los valores se acumulan en la misma propuesta hasta confirmar.
- **RN-04 · Origen de las respuestas.** Toda respuesta numérica indica el ensayo o conjunto de origen.

### Modelo de datos conceptual

| Entidad | Atributos |
|---|---|
| Experimento | id, título, objetivo, fecha de creación, estado (abierto/cerrado) |
| Variable | id, experimento, nombre, unidad, tipo, rango mín/máx, requerida |
| Ensayo | id, experimento, número, fecha y hora |
| Medición | id, ensayo, variable, valor, unidad, origen (voz/texto), frase original, estado (propuesta/confirmada), fecha de edición |
| Protocolo (deseable) | id, experimento, archivo, fragmentos indexados |

## 06 Alcance y supuestos

**Dentro:** un usuario por sesión sin login obligatorio; un experimento de ejemplo con 5–10 ensayos simulados; registro por voz y texto con confirmación; tabla, gráfico y preguntas básicas.

**Fuera:** conexión a instrumentos reales; colaboración multiusuario y permisos; validación regulatoria / BPL; análisis científico complejo.

**Supuestos:** demo en ambiente razonablemente silencioso con micrófono cercano; acceso a ElevenLabs y a un LLM por API con créditos; datos ficticios.

## 07 ML Canvas

Ver [ml-canvas-v1.md](ml-canvas-v1.md).

## 08 Pantallas del prototipo

| Pantalla | Elementos | Prioridad |
|---|---|---|
| P1 · Mis experimentos | Lista con fecha, n.º de ensayos y estado; botón "Nuevo experimento" | Imprescindible |
| P2 · Nuevo experimento | Título, objetivo, tabla editable de variables | Imprescindible |
| P3 · Espacio de trabajo | Micrófono con estado visible; conversación; tarjeta de propuesta (Confirmar / Editar / Descartar); tabla; gráfico con selector de ejes | Imprescindible |
| P4 · Protocolo | Carga de PDF y respuestas con cita | Deseable |
| P5 · Resumen | Pendientes, exportación CSV, informe preliminar | Deseable |

P3 concentra la demo: la tarjeta de propuesta hace visible el principio de confianza.

## 09 Arquitectura preliminar

| Capa | Responsabilidad | Propuesta inicial |
|---|---|---|
| Interfaz web | Pantallas, audio, tarjeta, tabla y gráfico | React + librería de gráficos |
| Servicio de voz | STT y TTS | ElevenLabs |
| API backend | Experimentos, ensayos, orquestación; guarda claves | Python (FastAPI) o Node |
| Agente | Intención y herramientas: `proponer_medicion`, `confirmar`, `corregir`, `consultar_dato`, `graficar`, `buscar_en_protocolo` | LLM + LangGraph |
| Motor de análisis | Estadísticas y datos del gráfico con código verificable | Python (pandas) |
| Almacenamiento | Experimentos, variables, ensayos, mediciones; índice del protocolo | SQLite o Supabase; Chroma o FAISS |

**Flujo principal:** Micrófono → voz a texto → agente → `proponer_medicion` → tarjeta → confirmación → BD → tabla y gráfico actualizados.

### Decisiones abiertas

| Decisión | Opciones | Criterio |
|---|---|---|
| Integración de voz | Plataforma de agentes ElevenLabs vs. solo STT ElevenLabs + agente propio | Control sobre confirmación y herramientas; tiempo de integración |
| LLM | Comercial por API vs. abierto con Ollama | Exactitud en set de prueba, latencia, costo |
| Base de datos | SQLite local vs. Supabase | Facilidad para demo y despliegue |

## 10 Diseño de pruebas

### Pruebas de aceptación

| ID | Prueba | Criterio de éxito | RF |
|---|---|---|---|
| PA-01 | Crear experimento con 3 variables | Aparece con variables y unidades | RF-01 |
| PA-02 | Dictar cinco ensayos | Los cinco registrados tras confirmar | RF-03, RF-05 |
| PA-03 | Corregir un valor mal interpretado | Cambia antes de guardar; sin duplicado | RF-06 |
| PA-04 | Dictar ensayo incompleto | Pregunta por el dato faltante | RF-07 |
| PA-05 | Gráfico rendimiento vs. temperatura | Coincide con la tabla | RF-10 |
| PA-06 | Preguntar máximo | 80 %, ensayo 4, sin inventar | RF-11 |
| PA-07 | Preguntar por ensayo inexistente | Responde que no hay registro | RF-11 |
| PA-08 | Recargar y reabrir | Se recuperan todas las mediciones | RF-02 |
| PA-09 | Sin micrófono, registrar por texto | Flujo completo funciona | RF-04 |

### Set de evaluación de la extracción (30–50 enunciados)

| Categoría | Ejemplo | Resultado esperado |
|---|---|---|
| Estándar | "Ensayo 2, 45 grados, 15 minutos, 64 por ciento" | Propuesta completa |
| Números en palabras y decimales | "Rendimiento sesenta y cuatro coma cinco" | 64,5 % |
| Orden alterado | "64 % de rendimiento en el ensayo 2 a 45 grados" | Propuesta completa |
| Incompleto | "Ensayo 6, 65 grados" | Pide faltantes |
| Corrección | "No, eran 46 grados" | Actualiza la propuesta activa |
| Ambiguo | "El de antes subió a 70" | Pide aclaración |
| Fuera de rango | "Temperatura 500 grados" | Advierte antes de guardar |
| Pregunta trampa | "¿Cuál fue el rendimiento del ensayo 9?" | Indica que no existe |

**Otras pruebas:** unitarias (máx/mín/promedio, normalización de unidades); integración (API ↔ BD, agente ↔ herramientas); usabilidad (3 usuarios externos, cronometrado).

## 11 Modelos candidatos

| Componente | Candidatos | Criterio |
|---|---|---|
| Voz a texto | ElevenLabs (Scribe) · Whisper | WER en español con números; latencia |
| Extracción y agente | LLM comercial con salida estructurada · modelo abierto vía Ollama | Exactitud por campo, cero cifras inventadas, latencia, costo |
| Embeddings (RAG) | Embeddings multilingüe | Calidad de recuperación |
| Texto a voz | ElevenLabs | Naturalidad y latencia en español |

## 12 Riesgos y pendientes

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Ruido o acentos dificultan la transcripción | Alto | Micrófono cercano; texto como respaldo; confirmación visual |
| Confusión de números ("quince" vs. "cincuenta") | Alto | Confirmación obligatoria y validación de rangos |
| El LLM inventa cifras | Alto | Respuestas numéricas solo vía herramientas; preguntas trampa |
| Integración con ElevenLabs toma más tiempo/créditos | Medio | Construir primero el flujo por texto |
| Una sola semana | Medio | Priorización estricta |
| Experimento poco creíble | Bajo | Revisión del integrante de ingeniería química |

**Pendientes:** completar nombres y roles; confirmar experimento final, variables, unidades y rangos; validar el problema con 3–5 usuarios; decidir integración de voz y LLM.

## 13 Equipo y plan de la semana

| Enfoque | Responsabilidad |
|---|---|
| Ingeniería química | Experimento creíble, variables y unidades; verificar resultados; dictados de prueba |
| IA / voz | Voz, agente y extracción; set de evaluación; model card |
| Producto / web | Pantallas, almacenamiento, tabla, gráficos y presentación |

| Día | Actividad del curso | Resultado del equipo |
|---|---|---|
| Mar 27 | Definición de producto; ML Canvas y pitch | Este documento (v0.3) y ML Canvas |
| Mié 28 | Pitch de 10 minutos | Problema, usuario, propuesta de valor, funcionamiento, ML Canvas |
| Jue 29 | GUI y código con IA generativa | Mockups P1–P3 y primera versión del flujo por texto |
| Vie 30 · 8:00 | Pruebas, requerimientos y arquitectura | Secciones 09 y 10 finales; set de evaluación etiquetado |
| Vie 30 · 9:00 | Presentación de avances | Estado del prototipo y resultados preliminares |
| Vie 30 · 10:30 | Selección de modelos y model card; presentación final y demo | Model cards, diapositivas y demo completa |

> **Entregable de la semana:** un prototipo web que permita crear un experimento, dictar cinco mediciones, corregirlas, guardarlas, visualizar un gráfico y responder una pregunta sobre los datos, sin inventar cifras.

**Visión futura:** protocolos inteligentes, comparación entre experimentos, colaboración, integración con instrumentos e informes avanzados.
