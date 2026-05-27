# CHANGELOG — Gestión MP 2026

> Versión vigente: **HTML v4.7** · **Code.gs 3.12**.
> Cada entrada describe los cambios visibles + las funciones JS / endpoints afectados.
> Rama de desarrollo: `claude/dreamy-curie-mFTeH`.

---

## v4.7 — Rollback "no oficial", envío implícito, historial editable, plantilla Archivar

- **Rollback**: feature `oficial / no oficial` removida completamente (estaba en v4.1-v4.5).
  - Quitado `oficial:false` default en `saveEvento`.
  - Quitado `_oficialBadge_`, `reconcileOficial_` (y sus llamadas), `_eventosNoOficiales_`, `renderEventosNoOficialesSection_`, `marcarEventoOficial_`, `noOfState`.
  - Quitado contenedor `#p-noof-section` de la vista Pendientes.
  - Columna "Oficial" eliminada de los exports Excel (global y de historial).
- **Envío a servicio técnico**: campo "Estado del equipo" quitado del form. Banner cian explicativo. `estado:'servicio_tecnico'` se asigna automáticamente al guardar. `eventoCard` para `envio` muestra chip naranja "En servicio técnico".
- **Historial editable**: nueva columna "Acciones" en la tabla full-page con 2 botones por fila:
  - ✏️ Pencil → abre modal del equipo + form del evento para editar.
  - ➕ Plus-circle → abre modal + form de pendiente con `eventoId` enlazado.
- **Plantilla rápida "+ Archivar"**: botón nuevo en toolbar de Pendientes que crea de un click un pendiente "Archivar" en bucket `general`, asignado a `getMiUsuario()`, compromiso hoy, estado abierto. Sin pasar por el form.

## v4.6 — Recorder fix

- `recCurrentView()` cae a inspeccionar `view-*` containers cuando ningún sidebar-btn tiene `.active` — devuelve `'historial'` correctamente en lugar de `null`.

## v4.5 — Sección "Eventos no oficiales" (REVERTIDA en v4.7)

- Nueva sección en Pendientes con filtros (Todos / Sólo MP / Sólo internos), botón "Marcar oficial" por fila y "Marcar todos como oficial".

## v4.4 — Migración retroactiva de auto-reprogramación

- `loadPersisted` ejecuta una pasada (marcador `mp_app_mig_reprog_v44`) sobre eventos MP con resultado C1-C8 sin pendiente de reprogramación. Crea los faltantes via `_autoReprogramarMP_`. Toast informativo.

## v4.3 — Auto-reprogramación según PMP

- Norma PR-DC-0113/EQ2.1 V10:
  - C1/C5/C6/C7/C8 → pendiente "creado" con `fechaCompromiso = último día del mes siguiente`.
  - C2/C3/C4 → pendiente "creado" sin `fechaCompromiso`.
- Nueva función `_autoReprogramarMP_(key, ev)`, `_ultimoDiaMesSiguiente_(fechaISO)` (maneja años bisiestos, rollover de año).
- Anti-duplicado por `eventoId + descripción`.
- Aplica en creación y edición.

## v4.2 — Excel respeta nomenclatura ID y agrega Fecha registro

- Excel historial: nuevas columnas **ID Evento · Fecha registro · Oficial**.
- Excel global Eventos: agrega **ID Evento · Fecha registro · Oficial** al inicio.
- Excel global Pendientes: agrega **ID Pendiente** al inicio + **ID Evento asociado** al final.
- exportEquiposFiltrados: divide "Pendientes abiertos" en "Por iniciar" + "Abiertos".

## v4.1 — Flag oficial + pendientes por evento (PARCIALMENTE REVERTIDA en v4.7)

- `oficial: false` al crear evento.
- `reconcileOficial_()` ejecutado tras cargar el .xlsm: si MP coincide con regRes del maestro → `oficial:true`.
- `_oficialBadge_()` muestra chip "No oficial" (MP) / "Interno" (no-MP) / nada (oficial).
- **Pendientes por evento**: nuevo botón ➕ en cada evento card; `openPendienteForm(key, editId, eventoId)`; banner azul al editar; `p.eventoId` persistido.
- Code.gs: nueva columna "ID Evento asociado" en hoja Pendientes (col 14); índice de Adjuntos URL movido de 14 a 15.
- `_pendientesDelEventoHTML_()` renderiza pendientes asociados inline bajo cada evento card.

## v4.0 — Vista Historial full-page, Reporte de servicio, estado "creado"

- **Vista Historial full-page** reemplaza al modal Historial/PDF de v3.18.
  - Nueva entrada en `VIEWS = [...,'historial']` (no en sidebar).
  - Header sticky con datos del equipo.
  - Filtros: tipo, ejecutor, fecha desde/hasta, búsqueda libre, toggle asc/desc.
  - Tabla `.hist-tbl` optimizada para lectura.
  - Botón "Volver" restaura vista anterior + reabre modal del equipo.
  - **Export Excel** reemplaza export PDF (eliminado).
- **Nuevo tipo `reporte_servicio`** (9°): fecha, ejecutor, estado, descripción.
  - Al guardar, las oraciones tipo Pendiente del campo descripción se convierten en pendientes `estado:'creado'` con `eventoId` apuntando al reporte.
- **Estado pendiente `creado`**:
  - Lifecycle: `creado → abierto → cerrado`.
  - Sidebar badge cuenta `abiertos + creados + discrepancias`.
  - Vista Pendientes: chip "Por iniciar", bucket "Por iniciar" arriba.
  - Acción `startPendiente(key, pid)`: creado → abierto + sugiere fechaCompromiso +7d.
  - Tablas Hoy: columna "Por iniciar" añadida.
- **Migración v4.0** en `loadPersisted` (marcador `mp_app_mig_pendientes_v40`): extrae pendientes de observaciones legacy con sección `PENDIENTES:`.

## v3.18 — Modal Historial/PDF (REEMPLAZADO en v4.0)

- Modal con filtros + export a PDF vía print-window. Quedó obsoleto al convertirse en vista full-page.

## v3.17 — Audit cleanup

- Eliminados `upsertEvento_`, `deleteEvento_`, `upsertPendiente_`, `deletePendiente_`, `findRowById_` (dead code).
- `getMaster_` con safeguard de 25 MB.
- `flatPendientes` asigna `eq: null` explícito en lugar de undefined.
- Botón "Analizar" usa helper `_analizarObsClick(btn)` con `btn.closest`.

## v3.16 — IDs timestamp + prefijo pend_

- Nueva función `timestampUid(existing)` que genera ID `YYYYMMDDHHMMSS` con anti-colisión `_2`, `_3`…
- `saveEvento`, `savePendiente`, clasificador "Crear pendientes" usan timestampUid.
- Prefijo de archivos: `ev_<id>_...` y `pend_<id>_...` (antes `pe_`).
- `allEventoIds_()` y `allPendienteIds_()` helpers.

## v3.15 — Denormalización + backfill creadoEn

- `saveEvento` / `savePendiente` / clasificador "Crear pendientes" pueblan `inv/equipo/servicio/fam` desde `state.equipos.find(...)` al crear y rellenan vacíos al editar.
- `loadPersisted` hace backfill `creadoEn = fecha` para eventos legacy.

## v3.14 — Clasificador preserva texto original

- "Reorganizar texto" agrega cabecera `TEXTO ORIGINAL:` con el texto original íntegro arriba de las secciones estructuradas.
- "Crear pendientes del equipo" deja el textarea intacto.

## v3.13 — Clasificador de texto

- Heurística regex local: `_REG_PENDIENTE`, `_REG_RECOMENDACION`, `_splitSentences_`, `classifyObservacion`.
- Botón "Analizar" en MP, Envío, Cotización, OC, Visita técnica.
- Modal con dropdown recategorizar, edit textarea, X descartar.
- Acciones: Reorganizar texto, Crear pendientes del equipo.

## v3.12 — ID numérico correlativo + Fecha registro

- Code.gs HEADERS: `ID Evento` (era `ID`), `ID Pendiente` (era `ID`), nueva columna `Fecha registro` en Eventos (entre Fecha y Resultado).
- `replaceAll_` ordena cronológicamente y asigna correlativos `i+1`.
- Adjuntos URL de Eventos pasa de col 19 → 20.
- `_eventoFromSheet_` / `_pendienteFromSheet_` aceptan ambos nombres (compat).
- HTML: `saveEvento` setea `creadoEn = ahora()` al crear nuevo.

## v3.11 — Filtros marca/modelo + tablas Hoy por servicio/responsable + pendientes generales

- Filtros Buscar equipos: reemplazado Clasificación/Frecuencia por Marca/Modelo.
- Hoy: tablas por servicio y por responsable (cols Vencidos/Hoy/Próx 7d/Sin fecha/Total). Click → Pendientes filtrado.
- Pendientes: botón "Nuevo pendiente general" + bucket `state.pendientes['general']` + chip "Por iniciar".
- Banner de pre-filtro azul cuando se viene desde Hoy.

## v3.10 — Maestro persistente en Drive + responsive móvil

- Code.gs: `uploadMaster_`, `getMaster_`, `getMasterMeta_` + carpeta `MP2026_Maestro/` + subcarpeta `Historico/`.
- HTML: `gasUploadMaster`, `gasGetMaster`, `tryRestoreMasterFromDrive`. Indicador "Maestro: hoy / hace N días" en header.
- Responsive: media queries `<1024px` (sidebar colapsado) y `<768px` (drawer overlay, header compacto, modales casi pantalla completa, inputs 16px anti-zoom iOS).
- Botón hamburguesa en header móvil.

## v3.9 — Reverse mapping de Sheets a internal

- `_eventoFromSheet_` / `_pendienteFromSheet_` / `_remapByKey_` traducen los nombres amigables de Sheets al formato interno al hacer pull.
- Agrega prefijo `inv:` a las keys.
- Convierte fechas ISO a `YYYY-MM-DD`.
- Reconstruye tareas y seguimientos desde el texto.

## v3.8 — Pendientes/Hoy/Agenda visibles sin .xlsm

- `selectView` permite ver Pendientes/Hoy/Agenda sin haber cargado el maestro. Solo Equipos/Verificación lo exigen.

## v3.7 — setup() defensivo + null-guards

- `setup()` aborta si hay datos en las hojas (protección anti-borrado).
- Nueva `setupForce_DESTRUCTIVO()` para reset explícito.
- Null-guards en `showLoading`, `selectView`, `updateEquipos`, `renderPendientes`.

## v3.6 — App servida desde doGet

- Code.gs `doGet` retorna `Index.html` con placeholder reemplazado por la URL.
- HTML accesible vía `https://script.google.com/macros/s/.../exec`.

## v3.0–v3.5 — Apps Script backend + UI polish

- Migración a Apps Script Web App como backend. Sincronización con Sheets. Adjuntos en Drive. Loading overlay. Focus rings. Modales con animación. Header con flex-wrap. Sidebar contraíble.

## v2.0–v2.5 — Verificación, agenda, atajos de fecha

- v2.0 Verificación clickeable con totales por mes.
- v2.1 Atajos de fecha en pendientes (suma).
- v2.2 Export Agenda + Borrar datos en sidebar.
- v2.3 Contactos del servicio en modal del equipo.
- v2.4 Fix pérdida de foco en buscador Agenda.
- v2.5 UI polish + auditoría de foco.

## v1.0–v1.9 — Base

- v1.1 Inicial corregido (10 bugs fix sobre prototipo del usuario).
- v1.2 Borrar datos.
- v1.3 Grabador de sesión.
- v1.4 Alias de encabezados (`Fam` ≡ `Familia`).
- v1.5 Guardar y siguiente + atajos de fecha + toast con acción.
- v1.6 Detección de discrepancias app↔archivo.
- v1.7 Fila Ejecutor en Programación.
- v1.8 Agenda (servicios clínicos + CR).
- v1.9 Jefe del CR visible desde Servicios.
