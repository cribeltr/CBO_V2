# Gestión MP 2026 — HHHA Biomédica

Aplicación web de un solo archivo HTML para gestionar el programa de Mantención Preventiva 2026 de ~966 equipos médicos críticos del **Hospital HHHA** (Hernán Henríquez Aravena · Temuco).

**Versión vigente:** HTML `v4.7` · Code.gs `3.12`

## Estructura del repositorio

```
CBO_V2/
├── output/
│   └── GestionMP_2026_corregido.html   ← la app (pegar en Index.html del Apps Script)
└── docs/
    ├── Code.gs                          ← backend Apps Script
    ├── TECHNICAL_SPEC.md                ← arquitectura, modelo de datos, reglas
    ├── HANDOFF_PROMPT.md                ← prompt para reanudar trabajo con IA
    ├── CHANGELOG.md                     ← historial de versiones
    └── README.md                        ← este archivo
```

## Despliegue rápido

1. Crear proyecto Google Apps Script vinculado a un Google Sheet vacío.
2. Pegar `docs/Code.gs` en `Código.gs`. Guardar.
3. Crear archivo HTML `Index` y pegar `output/GestionMP_2026_corregido.html`. Guardar.
4. Ejecutar función `setup()` una vez.
5. **Implementar → Web App → Acceso: Cualquiera con el enlace → Implementar**.
6. Copiar la URL `/exec` y abrirla en el navegador.

Para nuevas versiones: reemplazar contenido de `Index` (y `Código.gs` si cambió) → Administrar implementaciones → editar → Nueva versión → Implementar → Ctrl+Shift+R en el navegador.

## Stack

- HTML5 + Vanilla JS + Tailwind CSS (CDN) + Lucide (CDN) + SheetJS XLSX (CDN).
- Sin build, sin npm, sin transpilación.
- Persistencia: `localStorage` + Google Sheets + Google Drive.

## Features principales

- Carga del `.xlsm` maestro (PMP MINSAL) + caché local + persistencia en Drive.
- Registro de 9 tipos de eventos: MP, Reporte de servicio, Visita técnica, Cotización, OC, Envío a ST, Solicitud, Recepción, Reparación.
- Pendientes con estados `creado / abierto / cerrado`, tareas, seguimientos, adjuntos.
- Vista Hoy con KPIs y tablas por servicio / responsable.
- Vista Historial full-page por equipo con filtros y export Excel.
- Clasificador de texto que separa Observaciones / Recomendaciones / Pendientes.
- Auto-reprogramación según causales PMP (C1-C8).
- Sincronización con Google Sheets (Web App).
- Adjuntos en Google Drive con links públicos.
- Detección de discrepancias app ↔ archivo maestro.
- Agenda institucional (servicios, CR, directorio, empresas).
- Responsive móvil con drawer hamburguesa.

## Continuar el desarrollo con una IA

Abrir `docs/HANDOFF_PROMPT.md`. Copiar todo. Pegar en una nueva conversación de Claude/ChatGPT/etc. **junto con** `output/GestionMP_2026_corregido.html`, `docs/Code.gs`, `docs/TECHNICAL_SPEC.md` y `docs/CHANGELOG.md`. Ya queda con todo el contexto.

## Contacto

- **Owner**: Cristián Beltrán Oviedo (cribeltr@egresados.ubiobio.cl).
- **Hospital**: HHHA · Subdepartamento de Equipamiento Clínico.
- **Normativa**: PR-DC-0113/EQ2.1 V10 (MINSAL · Procedimiento PMP Equipos Médicos Críticos).
