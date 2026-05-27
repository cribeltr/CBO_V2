# Gestión MP 2026 — Especificación Técnica

**Versión actual:** HTML `v4.7` · Code.gs `3.12`
**Hospital:** HHHA (Hernán Henríquez Aravena · Temuco) — Subdepartamento de Equipamiento Clínico
**Autor / Owner:** Cristián Beltrán Oviedo (cribeltr@egresados.ubiobio.cl)
**Norma aplicable:** PR-DC-0113/EQ2.1 V10 (MINSAL · Procedimiento PMP Equipos Médicos Críticos)
**Última actualización:** 2026-05-27

> Documento autosuficiente. Una IA o desarrollador que lo lea junto con `output/GestionMP_2026_corregido.html` y `docs/Code.gs` puede continuar el desarrollo sin contexto previo.

---

## 1. Contexto

App web de un solo archivo HTML para gestionar el **Programa de Mantención Preventiva 2026** de ~966 equipos médicos críticos del HHHA. Reemplaza/complementa al `Programacion_MP_2026.xlsm` (archivo maestro MINSAL) como herramienta diaria del Ingeniero Biomédico:

- Registra eventos de campo (MP, reportes de servicio, visitas técnicas, OCs, envíos, recepciones, etc.).
- Detecta discrepancias entre lo registrado en la app y el archivo maestro.
- Gestiona pendientes con compromisos, recordatorios, seguimientos, tareas y adjuntos.
- Mantiene una agenda institucional (servicios clínicos, CR, empresas).
- Aplica reglas automáticas de reprogramación (PMP) según causales C1-C8.
- Sincroniza con Google Sheets y almacena adjuntos en Google Drive.

## 2. Stack

| Capa | Tecnología |
|------|-----------|
| Front-end | HTML5 + Vanilla JS (ES2020) + Tailwind CSS via CDN |
| Iconos | Lucide via CDN |
| Excel I/O | SheetJS XLSX via CDN |
| Persistencia local | `localStorage` |
| Backend opcional | Google Apps Script (Web App) |
| Hojas | Google Sheets |
| Archivos | Google Drive |

Sin build, sin npm, sin transpilación. Dos archivos:

```
output/GestionMP_2026_corregido.html  (~330 KB)
docs/Code.gs                           (~52 KB)
```

## 3. Arquitectura

```
┌────────────────────────────────────────────────────────┐
│            Apps Script Web App  (URL /exec)            │
│  doGet ─ sin params → sirve Index.html (la app entera) │
│         ?action=read → JSON con el estado en Sheets    │
│         ?action=getMaster → base64 del .xlsm de Drive  │
│  doPost ─ replaceAll, uploadFile, uploadMaster, ...    │
└────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│  Index.html  (cliente — todo el código JS aquí)        │
│                                                        │
│  state {                                               │
│    equipos[], verif{},                                 │
│    eventos{key: [...]}, pendientes{key: [...]},        │
│    agenda{servicios, centros, directorio, empresas},   │
│    masterMeta, historialKey, historialReturnView, ...  │
│  }                                                     │
│                                                        │
│  loadPersisted ← localStorage (state.eventos/pend/agenda)│
│  loadData ← localStorage (caché del .xlsm parseado)    │
│  selectView('equipos'|'hoy'|'pendientes'|...)          │
│                                                        │
│  gasRequest_ ↔ POST /exec    (eventos, pend, agenda)   │
│  gasUploadFile ↔ Drive                                 │
│  gasUploadMaster / gasGetMaster ↔ Drive                │
└────────────────────────────────────────────────────────┘
```

## 4. Persistencia

### localStorage

| Key | Contenido |
|-----|-----------|
| `mp_app_state_v1` | `{ eventos, pendientes, agenda }` |
| `mp_app_data_v1` | `{ equipos, verif, fileName, loadedAt }` |
| `mp_app_sync_v1` | `Array<string>` de marcadores "sincronizado" |
| `mp_app_mi_usuario_v1` | nombre del usuario para filtro Mis pendientes |
| `mp_master_meta_v1` | `{ fileId, name, uploadedAt }` del .xlsm en Drive |
| `mp_app_mig_pendientes_v40` | `Set<eventoId>` procesados por migración v4.0 |
| `mp_app_mig_reprog_v44` | `Set<eventoId>` procesados por migración v4.4 |
| `mp_app_gas_url_v1` | URL del Web App |
| `mp_app_gas_auto_v1` | bool auto-sync |
| `mp_app_sidebar_collapsed_v1` | preferencia sidebar |

### Google Sheets

Hojas mantenidas automáticamente por `Code.gs`:

| Hoja | Visible | Headers principales |
|------|---------|---------------------|
| `Eventos` | sí | ID Evento · N° Inventario · Equipo · Servicio · Familia · Tipo de evento · Fecha · **Fecha registro** · Resultado · Ejecutor · Estado del equipo · Empresa · Técnico · N° Envío · N° Cotización · N° OC · Folio · Folio guía · Observación · Adjuntos (URL) · Actualizado |
| `Pendientes` | sí | ID Pendiente · N° Inventario · Equipo · Servicio · Descripción · Fecha creación · Fecha compromiso · Próximo recordatorio · Fecha cierre · Ejecutor · Estado · Tareas · Seguimientos · **ID Evento asociado** · Adjuntos (URL) · Actualizado |
| `Agenda` / `Agenda_Otros` / `Agenda_CR` / `Agenda_Directorio` / `Agenda_Empresas` / `Agenda_Empresas_Contactos` | ocultas | contactos por servicio + CR + empresas |
| `Sync` | oculta | marcadores |
| `Meta` | oculta | `masterFileId`, `masterUploadedAt`, `attachmentsFolderId`, `version` |
| `Vista - Equipos operativos / no operativos / en ST` | sí | computadas en cada `replaceAll` |
| `Vista - Agenda` / `Vista - Empresas` | sí | computadas |

### Google Drive

```
Drive del owner del Apps Script/
├── MP2026_Maestro/
│   ├── Programacion_MP_2026.xlsm
│   └── Historico/
│       └── 20260527_1130_Programacion_MP_2026.xlsm  (versiones previas con timestamp)
└── MP2026_Adjuntos/
    └── [N° Inventario]/
        ├── ev_<eventoID>_<originalName>.pdf
        └── pend_<pendienteID>_<originalName>.pdf
```

Compartidos `ANYONE_WITH_LINK` (acceso público con link).

## 5. Modelo de datos

### `state.equipos[i]` (parseado del .xlsm)

```js
{
  key: 'inv:2-006472',   // 'inv:NNN', 'id:NNN' o 'general' (especial)
  id, carpeta, inv, equipo, fam, servicio, unidad, ubicacion, procedencia,
  marca, modelo, serie, anio, vur, clas, enuBaja, frecuencia,
  pmpMeses: [12 vals X/R/RA/PM],
  regProg:  [12 vals codes mes 'P'],
  regRes:   [12 vals codes mes 'R'],   // resultado oficial del .xlsm
  regObs,
  empty: bool                            // slot disponible (sin inv)
}
```

### `state.eventos[key][i]`

```js
{
  id: '20260527093700',          // timestamp YYYYMMDDHHMMSS o hash legacy
  tipo: 'mp' | 'reporte_servicio' | 'visita_tecnica' | 'cotizacion' | 'oc'
      | 'envio' | 'solicitud' | 'recepcion' | 'reparacion',
  fecha: 'YYYY-MM-DD',
  creadoEn: ISO timestamp,        // cuándo se registró en la app

  // Denormalizados desde equipos
  inv, equipo, servicio, fam,

  // Específicos por tipo
  resultado: 'Si' | 'C1'..'C8' | 'FS' | 'Baja' | 'NU',  // mp / reporte_servicio
  ejecutor, estado, observacion, comentario,
  empresa, empresaId, contactoId,
  nEnvio, nCotizacion, nOC, folio, folioGuia,

  archivos: [
    { id, nombre, mime, size, url, uploadedAt }
  ]
}
```

> **Nota**: La feature `oficial` introducida en v4.1 fue **revertida en v4.7** por petición del usuario. Eventos legacy con `oficial:false` quedan ignorados al renderizar.

### `state.pendientes[key][i]`

```js
{
  id: timestamp o hash,
  descripcion,
  fecha: 'YYYY-MM-DD',                  // creación
  fechaCompromiso: 'YYYY-MM-DD' | null,
  proximoRecordatorio: 'YYYY-MM-DD' | null,
  fechaCierre: 'YYYY-MM-DD' | null,
  ejecutor: string | null,
  estado: 'creado' | 'abierto' | 'cerrado',
  tareas: [{ id, descripcion, estado, fecha }],
  actualizaciones: [{ id, fecha, tipo, contactadoA, texto }],
  archivos: [...],

  // Denormalizados
  inv, equipo, servicio,

  // Vínculo opcional con evento de origen (v4.1+)
  eventoId: '<id-del-evento-padre>'
}
```

Bucket especial: `state.pendientes['general']` para actividades no atadas a equipo.

### `state.agenda`

```js
{
  servicios: {
    '<nombre del servicio>': {
      supervisor: { nombre, email, anexo, celular } | null,
      encargado:  { ... } | null,
      otros: [{ id, rol, nombre, email, anexo, celular }]
    }
  },
  centros: [{ id, nombre, jefe:{...}, servicios:['Servicio1', ...] }],
  directorio: [{ id, categoria, organizacion, nombre, email, telefono, notas }],
  empresas: [{ id, nombre, direccion, contactos:[{ id, nombre, cargo, email, telefono, celular }] }]
}
```

## 6. Identificadores

### IDs internos (en JSON y en localStorage)

- Eventos/pendientes nuevos (v3.16+): `YYYYMMDDHHMMSS` (14 dígitos, hora local). Anti-colisión: si existe, sufijo `_2`, `_3`…
- Tareas, actualizaciones, agenda items: `uid()` (hash 36 + random).
- IDs legacy (hash `mpabc123def`): se preservan; nada los reescribe.

### IDs en Sheets (presentación)

- Columnas `ID Evento` y `ID Pendiente`: **numérico correlativo** (1, 2, 3…) regenerado en cada `replaceAll`. NO estable a largo plazo.
- Columna `ID Evento asociado` (Pendientes): correlativo del padre, vía mapa interno→correlativo.

### Nombres de archivos en Drive

- `ev_<eventoID>_<originalName>.<ext>` — eventos
- `pend_<pendienteID>_<originalName>.<ext>` — pendientes

Donde `<eventoID>` o `<pendienteID>` es el ID interno timestamp.

## 7. Vistas

`VIEWS = ['equipos','hoy','pendientes','verificacion','agenda','historial']`
`VIEWS_SIDEBAR = ['equipos','hoy','pendientes','verificacion','agenda']`  (historial no aparece en sidebar)

### 7.1 Buscar equipos
- Tabla virtualizada (~966 filas).
- Filtros: búsqueda libre, servicio, familia, marca, modelo, estado del equipo, estado del pendiente.
- Banner azul cuando viene un filtro desde Verificación.
- Click en fila → modal del equipo.

### 7.2 Hoy
- 8 KPI cards.
- Sección "Equipos > 30 días en ST o no operativo" (alerta).
- **Tablas por servicio y por responsable**: columnas `Por iniciar · Vencidos · Hoy · Próx 7 d · Sin fecha · Total`. Click en celda → navega a Pendientes filtrado.
- Secciones: Por recontactar · Vencidos · Para hoy · Próximos 7 días · Sin compromiso · Cerrados hoy · Registros de hoy.

### 7.3 Pendientes
- Toolbar: búsqueda libre, estado (Todos / Por iniciar / Abiertos / Cerrados), ejecutor, chip "Mis pendientes", "Limpiar", botón "Nuevo pendiente general", botón **"+ Archivar"** (plantilla rápida).
- Sección "Pendientes de carga al archivo maestro" (discrepancias app↔.xlsm).
- Chips de período: Todos · Por iniciar · Vencidos · Hoy · Esta semana · Este mes · Sin compromiso.
- Lista agrupada por bucket: Por iniciar · Vencidos · Hoy · Próximos 7 días · Este mes · Más adelante · Sin compromiso.
- Banner azul si vino pre-filtro desde Hoy.

### 7.4 Verificación de carga
- KPIs por código.
- Tablas mes × código clickeables (filtran Equipos).
- Fila "Total mes".
- Sección "Equipos no operativos" con alerta por días.

### 7.5 Agenda
- Tabs: Servicios clínicos · Centros de Responsabilidad · Directorio · Empresas.
- Por cada servicio: 3 tarjetas (Supervisor / Encargado / Jefe CR si asociado) + Otros contactos.
- "Asociar a un CR" si el servicio no está vinculado.

### 7.6 Historial (full-page, no modal)
- Acceso: modal del equipo → botón "Ver historial".
- **Header sticky** con datos del equipo.
- Filtros: búsqueda libre, tipo, ejecutor, fecha desde/hasta, toggle asc/desc, Limpiar.
- Tabla optimizada para lectura (14px, padding 14-16px, line-height 1.55, hover, sticky thead).
- Columnas: Fecha · Evento · Resultado · Observación · Ejecutor · Datos adicionales · **Acciones** (Editar / Crear pendiente asociado).
- Botón **Volver** → restaura vista anterior + reabre modal del equipo.
- Botón **Exportar Excel** → `.xlsx` con header + filtros + tabla completa.

## 8. Tipos de evento (9)

| Key | Label | Campos | Notas |
|-----|-------|--------|-------|
| `mp` | Mantención preventiva | fecha, resultado, ejecutor, estado, observacion | Auto-reprogramación si resultado ∈ C1-C8 |
| `reporte_servicio` | Reporte de servicio | fecha, ejecutor, estado, descripción | Clasifica descripción y auto-spawnea pendientes "creado" |
| `visita_tecnica` | Visita técnica | empresa, contacto, ejecutor, estado, observacion | |
| `cotizacion` | Cotización | empresa, nCotizacion, ejecutor, estado, observacion | |
| `oc` | Orden de Compra | empresa, nOC, ejecutor, estado, observacion | |
| `envio` | Envío a servicio técnico | fecha, nEnvio, empresa, ejecutor, folio, comentario | **Estado `servicio_tecnico` automático** (sin campo en form, v4.7) |
| `solicitud` | Solicitud de trabajo | ejecutor, folio, comentario | estado readonly = no operativo |
| `recepcion` | Recepción | nEnvio, folioGuia, estado | |
| `reparacion` | Reparación | estado | |

## 9. Ciclo de vida

### Pendientes (v4.0+)

```
creado → abierto → cerrado
            ↑          ↓ (Reabrir)
            └──────────┘
```

- `creado`: salido del clasificador, de auto-reprogramación, o creado para activación manual. Badge índigo "Por iniciar".
- `abierto`: en seguimiento activo, con fechaCompromiso.
- `cerrado`: completado.
- Acción **"Iniciar"** (botón en card creado): → abierto + sugiere `fechaCompromiso = +7d` si falta.
- Sidebar badge cuenta `abiertos + creados + discrepancias`.

## 10. Reglas de negocio (PMP)

### Auto-reprogramación por causal (v4.3)

Al guardar un MP con resultado C1-C8:

| Causal | Acción automática |
|--------|-------------------|
| C1, C5, C6, C7, C8 | Pendiente "creado" con `fechaCompromiso = último día del mes siguiente` (norma: ≤30d) |
| C2, C3, C4 | Pendiente "creado" SIN `fechaCompromiso` (esperar reintegro) |

Descripción autogenerada: `"Reprogramar MP por causal CN — <texto>"`. Anti-duplicado por (eventoId + descripción exacta). Aplica en creación y edición.

### Migración retroactiva (v4.4)

`loadPersisted` ejecuta una sola vez por evento (marcador `mp_app_mig_reprog_v44`): para cada MP con resultado C1-C8 sin pendiente de reprogramación, lo crea.

## 11. Clasificador de texto (v3.13)

Heurística regex 100% local (sin LLM):

```
_REG_PENDIENTE     = debe ser, hay que, es necesario, se requiere,
                      se cotizará, se reparará, se reemplazará,
                      queda pendiente, será reemplazado, ...
_REG_RECOMENDACION = se recomienda, recomendable, debiera, debería,
                      conviene, convendría, aconsejable, sugiere, ...
```

Orden: Pendiente → Recomendación → Observación.

### Botón "Analizar" (al lado del textarea Observación/Descripción)
Disponible en MP, Reporte de servicio, Envío, Cotización, OC, Visita técnica.

Modal:
- Cada oración con dropdown (recategorizar) + textarea (editar) + X (descartar).
- **Reorganizar texto** (v3.14): reescribe el textarea con cabecera `TEXTO ORIGINAL:` + secciones `OBSERVACIONES:` / `RECOMENDACIONES:` / `PENDIENTES:`. Texto original preservado siempre.
- **Crear pendientes del equipo**: spawn de pendientes "creado" para las oraciones marcadas como Pendiente.

### Auto-spawn en Reporte de servicio
Al guardar Reporte de servicio, las oraciones tipo Pendiente del campo descripción se convierten en pendientes `estado:'creado'` con `eventoId` apuntando al reporte. Anti-duplicado por descripción exacta.

### Migración v4.0
`loadPersisted` extrae pendientes de observaciones legacy con sección `PENDIENTES:`/`Pendientes:`. Marcador `mp_app_mig_pendientes_v40`.

## 12. Sincronización Google Sheets

### Configuración
- Sidebar → "Google Sheets" → modal con URL del Web App (`/exec`) + switch auto-sync.
- Botones: Probar (ping) · Enviar todo (replaceAll) · Traer desde Sheets (pull).

### Push (`replaceAll`)
- Aplana eventos/pendientes y los ordena cronológicamente.
- Asigna correlativos 1, 2, 3 a `ID Evento` y `ID Pendiente`.
- Resuelve `eventoId` interno → correlativo en `ID Evento asociado`.
- Escribe adjuntos como `RichTextValue` para links clickeables (locale-independent).
- Reescribe completamente las hojas.

### Pull
- HTTP GET `?action=read`.
- `_eventoFromSheet_` / `_pendienteFromSheet_` traducen nombres amigables al formato interno.
- Acepta legacy `'ID'` con fallback.
- Aplica prefijo `inv:` a las keys.

### Discrepancias app↔archivo (v1.6)
- `computeSyncIssues(includeOnlyFile)`:
  - `faltaArchivo`: app tiene MP con resultado, archivo no.
  - `distinto`: app y archivo tienen resultados distintos.
  - `soloArchivo`: archivo tiene, app no (opt-in).
- Marcadores "sincronizado" en `mp_app_sync_v1`.

## 13. Maestro persistente en Drive (v3.10)

### Subida automática
Tras parsear `.xlsm` exitosamente → upload a `MP2026_Maestro/`. Si existía: mover al anterior a `MP2026_Maestro/Historico/` renombrado con timestamp. Guarda `masterFileId`, `masterFileName`, `masterUploadedAt` en `Meta`.

### Restauración en navegador nuevo
Init: si no hay datos locales + `gasState.url` configurado → `tryRestoreMasterFromDrive()`. Descarga el `.xlsm` como base64 (límite 25 MB) → parsea.

### Indicador
Header: **"Maestro: hoy / ayer / hace N días"**. Ámbar si ≥7 días.

## 14. Adjuntos en Drive

- `gasUploadFile(inv, prefix, file)`:
  - base64 → POST `uploadFile`.
  - Code.gs crea archivo en `MP2026_Adjuntos/[inv]/<prefix>_<originalName>`.
  - Comparte `ANYONE_WITH_LINK`.
- Retorna `{id, nombre, mime, size, url, uploadedAt}` — se guarda en `ev.archivos[]` o `p.archivos[]`.
- En Sheets: columna "Adjuntos (URL)" usa `RichTextValue` con links clickeables.
- `gasDeleteFile(id)` mueve a papelera.

## 15. Mobile responsive (v3.10)

- `< 1024px`: sidebar colapsado a 56px.
- `< 768px`:
  - Sidebar = drawer overlay con ☰ hamburguesa.
  - Header compacto, KPIs grid 2 cols.
  - Modales casi pantalla completa.
  - Inputs `font-size: 16px` (anti-zoom iOS).
  - Click en opción del drawer lo cierra.

## 16. Exportaciones

### Excel global (menú ⋮ → "Exportar Excel")
Workbook multi-hoja:
1. `Registro_MP-2026` (mismo formato que el maestro).
2. `Eventos` — 18 cols: ID Evento · Fecha registro · N° Inv · Equipo · Servicio · Tipo · Fecha · Resultado · Ejecutor · Estado · N° envío · Empresa · Folio · Folio guía · Técnico · N° Cotización · N° OC · Observación.
3. `Pendientes` — 15 cols: ID Pendiente · ... · ID Evento asociado.
4. Agenda — Contactos / Centros / Directorio / Empresas.

### Excel del historial
Workbook 1 hoja: 15 cols (ID Evento · Fecha · Fecha registro · Evento · Resultado · Observación · Ejecutor · Estado equipo · N° Envío · N° Cotización · N° OC · Folio · Folio guía · Empresa · Adjuntos).

### Excel equipos filtrados
1 hoja con metadatos + estado + Pendientes por iniciar + Pendientes abiertos.

### JSON
- `exportJSON()`: `mp_datos_<fecha>.json` con `{version:2, exportedAt, eventos, pendientes, agenda}`.
- `importJSON()`: sobrescribe state con confirmación.

## 17. Apps Script (Code.gs)

### Acciones

```
GET  /exec                              → sirve Index.html
GET  /exec?action=read                  → JSON del estado completo
GET  /exec?action=getMaster             → base64 del .xlsm
GET  /exec?action=getMasterMeta         → meta del maestro
POST { action:'replaceAll', payload }
POST { action:'upsertContacto', ... }
POST { action:'upsertCR' / 'deleteCR' }
POST { action:'markSynced' / 'unmarkAllSynced' }
POST { action:'uploadFile', { inv, prefix, name, mime, base64 } }
POST { action:'deleteFile', { id } }
POST { action:'uploadMaster', { name, mime, base64 } }
POST { action:'ping' }
```

### Setup

| Función | Cuándo |
|---------|--------|
| `setup()` | Primera vez. **Aborta si hay datos** (protección anti-borrado v3.7). |
| `setupForce_DESTRUCTIVO()` | Sólo si se requiere reset completo (con respaldo previo). |
| `migrate()` | No destructiva: agrega columnas/hojas faltantes. |
| `hideSystemSheets_()` | Oculta hojas internas. |
| `rebuildFriendlyViews_()` | Recompone hojas "Vista -…". |

`ensureHeadersAligned_(ss)` se ejecuta en cada `replaceAll_` para corregir headers desfasados sin tocar datos.

## 18. Migraciones automáticas

### v4.0 — extracción de pendientes desde observaciones legacy
- Marcador `mp_app_mig_pendientes_v40`.
- Por cada evento con observación `PENDIENTES:`/`Pendientes:` → spawn pendientes "creado" con eventoId.

### v4.4 — pendientes de reprogramación retroactivos
- Marcador `mp_app_mig_reprog_v44`.
- Por cada MP con resultado C1-C8 sin pendiente reprog asociado → `_autoReprogramarMP_`.

### Backfills permanentes en `loadPersisted`
- Eventos sin `creadoEn` → `creadoEn = fecha`.
- Pendientes/eventos sin `inv/equipo/servicio/fam` se completan en próximo save.

## 19. UX / restricciones (NO ROMPER)

1. **No defaults peligrosos**: `resultado`, `ejecutor` y `estado` del form de eventos deben empezar en blanco. Registrar `operativo` cuando es `no operativo` por un default es **error grave** (confirmado por el usuario).
2. Idioma: todo en español.
3. Botón "Borrar datos" requiere doble confirmación + escribir `ELIMINAR`.
4. `setup()` no debe ejecutarse si ya hay datos en las hojas.
5. Atajos de fecha: eventos = `Hoy / -1 sem / -1 mes` (back); pendientes = `Hoy / +1 sem / +1 mes` (forward).
6. Toast tras guardar incluye acción "Ver registro" / "Ver pendiente".
7. El clasificador **siempre** preserva el texto original.
8. `closeHistorial` debe volver al modal del equipo si veniste de ahí.
9. Mobile: tap en sidebar cierra el drawer.
10. **No reintroducir la feature `oficial`** — fue removida explícitamente en v4.7.
11. Envío a ST: el estado del equipo es implícito (`servicio_tecnico` automático), no pedir al usuario.

## 20. Historial de versiones (resumen)

Ver `CHANGELOG.md` para el detalle. Hitos:

| Rango | Lo importante |
|-------|---------------|
| v1.x–v2.x | Base: equipos, eventos, pendientes, agenda, verificación |
| v3.0–v3.6 | Apps Script backend + UI minimalista + app servida desde doGet |
| v3.7–v3.10 | Defensas, mobile responsive, maestro persistente en Drive |
| v3.11–v3.16 | Tablas Hoy por servicio/responsable, IDs correlativos, clasificador, timestamp IDs |
| v3.17–v3.18 | Audit cleanup, modal Historial (luego reemplazado) |
| **v4.0** | Vista Historial full-page, Reporte de servicio, estado pendiente "creado", Excel export |
| **v4.1** | Pendientes por evento + flag oficial (LATER REVERTED en v4.7) |
| **v4.2** | Excel respeta nomenclatura ID + Fecha registro |
| **v4.3** | Auto-reprogramación según PMP |
| **v4.4** | Migración retroactiva de auto-reprogramación |
| **v4.5** | (revertida en v4.7) Sección "Eventos no oficiales" |
| **v4.6** | Recorder fix para vista historial |
| **v4.7** | Rollback oficial, envío sin estado field, historial editable, plantilla "Archivar" |

## 21. Despliegue

1. **Apps Script primera vez:**
   - Crear proyecto vinculado a un Google Sheet vacío.
   - Pegar `Code.gs` completo en `Código.gs`.
   - Crear archivo HTML `Index` y pegar contenido de `output/GestionMP_2026_corregido.html`.
   - Ejecutar `setup()` una vez.
   - Implementar → Web App → Acceso: Cualquiera → Implementar.
2. **Cada actualización:**
   - Reemplazar contenido de `Index` (y `Código.gs` si cambió).
   - Administrar implementaciones → editar (lápiz) → Nueva versión → Implementar.
   - En navegador: Ctrl+Shift+R para descachar.
3. **Configurar URL en la app:**
   - Sidebar → "Google Sheets" → pegar URL `/exec` → Guardar.
   - Activar auto-sync.
4. **Primera carga del maestro:**
   - Header → "Cargar archivo" → seleccionar `Programacion_MP_2026.xlsm`.
   - La app lo sube a Drive automáticamente.

## 22. Anti-patrones / pitfalls

- **No agregar columnas a HEADERS sin migrar**: los índices de columnas para `setAdjuntosCell_` deben actualizarse en paralelo. v4.1 movió Adjuntos URL de col 14 a 15 al agregar "ID Evento asociado".
- **El correlativo del Sheet NO es estable**: cambia en cada push si se reordenan eventos. `eventoId` se persiste como correlativo del sheet en `ID Evento asociado`.
- **Sin Code.gs hay funcionalidad completa offline**, pero los datos sólo viven en localStorage.
- **Pendientes legacy sin `inv/equipo/servicio`**: el lookup vía `p.eq?.*` los maneja, los exports JSON pueden quedar incompletos hasta el siguiente edit.

## 23. Roadmap sugerido

1. Drive: sub-carpetas por año (`MP2026_Adjuntos/<inv>/2026/...`).
2. Búsqueda global única.
3. Notificaciones push vía Apps Script trigger diario.
4. Permisos por usuario.
5. Vista "Equipos por estado" filtrable directa.
6. Reportes mensuales automatizados.
7. LLM opcional (Claude API) para clasificador más preciso, regex como fallback offline.
8. PWA / offline manifest.
9. Tests automatizados (lógica de fechas, clasificador, reconcileOficial).

## 24. Contacto / referencias

- **Owner**: Cristián Beltrán Oviedo (cribeltr@egresados.ubiobio.cl).
- **Hospital**: HHHA · Subdepartamento de Equipamiento Clínico.
- **Normativa**: PR-DC-0113/EQ2.1 V10 (MINSAL).
