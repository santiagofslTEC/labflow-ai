# LabFlow AI

El cuaderno de laboratorio que escucha, organiza y analiza.

Asistente conversacional por voz, con interfaz web, para registrar, verificar y analizar mediciones en laboratorios universitarios de ingeniería química. El investigador dicta con las manos ocupadas, confirma lo que el sistema entendió y obtiene tabla, gráfico y respuestas sobre sus datos, sin cifras inventadas.

Proyecto de la Misión TEC × Uniandes · Inteligencia Artificial e Ingeniería de Software · Octubre 2026.

## Documentación

- [Descripción del producto y requerimientos v0.3](docs/product/producto-y-requerimientos-v0.3.md)
- [ML Canvas v1](docs/product/ml-canvas-v1.md)

## Principio de confianza

1. Ninguna medición se guarda sin confirmación explícita del usuario (voz o botón).
2. Toda cifra que el asistente reporta proviene de una herramienta que consulta la base de datos e indica de qué ensayo sale.
3. Cada registro conserva la frase original, el origen (voz o texto) y la hora.
