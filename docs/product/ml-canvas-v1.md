# LabFlow AI — ML Canvas (iteración 1)

> Fuente: "LabFlow_AI_ML_Canvas_v1.docx" (Drive, 27 oct 2026). Plantilla OwnML Machine Learning Canvas v1.2 de Louis Dorard, Ph.D., licencia [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — [ownml.co](https://www.ownml.co/).

Diseñado para: LabFlow AI · Por: Equipo LabFlow · Fecha: 27/10/2026 · Iteración: 1

## Prediction task
- **Tipo:** voz a texto + clasificación de intención + extracción estructurada sobre lo dictado.
- **Entidad:** cada enunciado del usuario dentro del experimento activo.
- **Salidas:** intención (registrar, corregir, consultar, graficar, protocolo) y campos {ensayo, variable, valor, unidad}, o "falta información".
- **Se observa:** de inmediato, cuando el usuario confirma o corrige la propuesta.

## Decisions
- Se muestra una tarjeta: "Entendí: ensayo 3 · 50 °C · 15 min · 73 %. ¿Lo guardo?"
- Solo se guarda tras confirmación explícita (voz o botón).
- Si faltan campos, hay ambigüedad o un valor fuera de rango, se pide aclaración en vez de suponer.
- Consultas y gráficos llaman a funciones deterministas sobre los datos guardados; la IA no calcula cifras.

## Value proposition
- **Beneficiarios:** estudiantes de ingeniería química y auxiliares de investigación (secundario: profesores).
- **Dolores:** interrumpir el experimento para anotar; errores al transcribir a Excel; datos o unidades faltantes descubiertos al final; tablas y gráficos a mano.
- **Solución:** cuaderno de laboratorio por voz: dictar, confirmar y obtener tabla, gráfico y respuestas al instante.
- **Integración:** app web en laptop junto al banco: micrófono, tarjeta de confirmación, tabla y gráfico; texto como respaldo.
- **Meta:** ≥ 30 % menos tiempo documentando y 0 % de campos requeridos vacíos.

## Data collection
- **Set inicial:** 30–50 enunciados escritos y grabados por el equipo, etiquetados a mano (números en palabras, correcciones, ambiguos, fuera de rango).
- **Actualización:** cada propuesta y su versión confirmada o corregida forman un nuevo par etiquetado.
- Revisión semanal de fallos para ampliar el set. El MVP no almacena audio.

## Data sources
- Definición del experimento en la BD: variables, unidades y rangos.
- Transcripciones del servicio de voz (API de ElevenLabs).
- Tabla de mediciones confirmadas con su frase original (SQLite o Supabase).
- Protocolo del laboratorio en PDF (deseable, para RAG).
- Modelos preentrenados vía API: STT, LLM y TTS.

## Impact simulation
- **Costo de error:** guardar un valor incorrecto es grave (mitigado por la confirmación); una aclaración innecesaria solo añade fricción.
- **Simulación:** se corre el set de evaluación antes de cada cambio de prompt o modelo.
- **Criterios de despliegue:** ≥ 90 % de exactitud por campo, 0 cifras inventadas en preguntas trampa, latencia ≤ 5 s.
- **Equidad:** probar con distintas voces y acentos; el texto siempre está disponible.

## Making predictions
- Tiempo real: una predicción por enunciado, aprox. cada 1–2 min.
- Presupuesto: ≤ 5 s desde el fin del dictado hasta la tarjeta (objetivo 3 s).
- Recursos: APIs en la nube llamadas desde el backend; laptop con Chrome.

## Building models
- No se entrena desde cero: 1 modelo STT, 1 LLM para extracción y agente, embeddings para RAG (deseable).
- Se actualizan cambiando prompt, esquema JSON o modelo; cada cambio se valida contra el set.
- Selección final el viernes 30 (Scribe vs. Whisper; LLM por API vs. Ollama).

## Features
- Transcripción del enunciado.
- Contexto del experimento activo: variables, unidades y rangos.
- Último ensayo registrado y propuesta pendiente.
- Historial corto de la conversación.
- Transformaciones: normalizar números en palabras y decimales ("coma"), y unidades ("grados" → °C, "por ciento" → %).

## Monitoring
- **Calidad del modelo:** % de propuestas corregidas, tasa de aclaraciones, latencia promedio.
- **Impacto para el usuario:** tiempo para registrar 5 ensayos vs. flujo manual; % de campos requeridos vacíos.
- **Técnico:** errores de herramientas o del servicio de voz.
- **Revisión:** tras cada sesión de prueba y semanalmente.
