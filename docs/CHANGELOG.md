# CHANGELOG — Gestión MP 2026

Cada versión es un commit independiente en la rama `claude/dreamy-curie-mFTeH`.

---

## v2.5 — UI polish + auditoría de foco *(estado estable de referencia)*
**Commit:** `85e01f2`
- Loading overlay con spinner durante el parseo del XLSX (mensajes: Leyendo / Procesando / Construyendo).
- Focus rings accesibles (`:focus-visible`) en botones, inputs y chips.
- Transiciones suaves en hover/active de todos los botones.
- Animación de entrada en modales (slide + fade) y toasts.
- Sombras más definidas en modales y empty state.
- Hover en inputs y en `<summary>` de detalles colapsables.
- Header con `flex-wrap` para pantallas más angostas.
- Empty state "Cargue el archivo" rediseñado: card con sombra + botón directo "Cargar archivo maestro".
- Sidebar footer con clase `sidebar-link` (estilo discreto hover rojo).

## v2.4 — Fix pérdida de foco en buscador Agenda
**Commit:** `f798431`
- Refactor: separar `renderAgenda()` (toolbar + body) de `renderAgendaBody()` (sólo body).
- El input `#ag-q` ya no se re-crea al escribir → no pierde foco.

## v2.3 — Contactos del servicio en modal del equipo
**Commit:** `1f7b2f2`
- Nuevo bloque `contactosServicioBlockHTML(e)` dentro del modal del equipo.
- Muestra Supervisor / Encargado / Jefe del CR en 3 tarjetas inline compactas.
- Email clickeable (`mailto:`), celular clickeable (`tel:`).
- Si no hay CR asignado: tarjeta ámbar con botón "Asociar a un CR".
- Counter `(N/3 registrados)` en el título.

## v2.2 — Export Agenda + Borrar datos reforzado
**Commit:** `c21473c`
- Nuevas hojas en XLSX export: `Agenda - Contactos`, `Agenda - Centros`.
- Botón "Borrar datos" removido del header.
- Reubicado al pie del sidebar como link discreto.
- Confirmación reforzada: doble `confirm` + `prompt` pidiendo escribir `ELIMINAR`.

## v2.1 — Atajos de fecha en pendientes (suma)
**Commit:** `34cddda`
- `dateShortcuts(inputId, mode)` con modo `'fwd'` para sumar (+1 sem, +1 mes) en pendientes.
- Mantiene `'back'` (defecto, resta) para formularios de eventos.

## v2.0 — Verificación clickeable + totales por mes
**Commit:** `b370676`
- Fila "Total mes" al final de cada tabla en Verificación.
- Celdas clickeables: filtran la vista Equipos por código/resultado + mes.
- Banner azul en Equipos cuando el filtro proviene de Verificación + botón "Quitar filtro".

## v1.9 — Jefe del CR visible desde Servicios
**Commit:** `30abd52`
- En la pestaña "Servicios clínicos" de Agenda, cada servicio muestra ahora 3 tarjetas (Supervisor + Encargado + Jefe del CR).
- Si el servicio no está asociado a ningún CR: tarjeta ámbar con botón "Asociar a un CR".
- Nuevo modal `openAsociarCRModal(servicio)` para elegir un CR existente o crear uno nuevo.

## v1.8 — Agenda
**Commit:** `635da23`
- Nuevo sidebar item "Agenda" (icon `users`).
- Vista con tabs: "Servicios clínicos" (Supervisor + Encargado por servicio) y "Centros de Responsabilidad" (CRs con Jefe y servicios asociados).
- Persistencia en `state.agenda`, incluida en STORAGE_KEY.
- Export/import JSON v2 incluye agenda.

## v1.7 — Fila "Ejecutor" en Programación
**Commit:** `a1d2a27`
- `effectiveRegRes()` ahora devuelve también `ejecutores` por mes.
- Nueva fila "Ejecutor" en la tabla del modal del equipo con nombres abreviados (Primer + Inicial) y tooltip con nombre completo.

## v1.6 — Detección de discrepancias app↔archivo
**Commit:** `17e8fa2`
- Nueva función `computeSyncIssues(includeOnlyFile)`.
- Nueva sección "Pendientes de carga al archivo maestro" en vista Pendientes.
- Sub-secciones: "Falta en archivo" (rojo), "Resultado distinto" (ámbar), "Sólo en archivo" (toggle azul).
- Botón "Sincronizado" por cada caso → persistido en `mp_app_sync_v1`.
- Badge sidebar Pendientes suma operativos + discrepancias.
- Toast al re-cargar archivo si hay discrepancias.

## v1.5 — Guardar y siguiente + atajos de fecha + toast acción
**Commit:** `a4ea4c9`
- Botón verde "Guardar y siguiente" en formulario de evento.
- Atajos de fecha `Hoy / −1 sem / −1 mes` junto a inputs de fecha.
- Toast con acción "Ver registro" / "Ver pendiente" tras guardar.

## v1.4 — Alias de encabezados
**Commit:** `1343862`
- `PMP_HEADER_ALIASES`: acepta `Fam` como `Familia` y variantes de `ENU/Baja` sin advertencia.

## v1.3 — Grabador de sesión
**Commit:** `4eb4478`
- Botón "Grabar sesión" → captura clicks, change, submit, keydown, scroll, view_change.
- Descarga JSON al detener con metadata (viewport, archivo, conteos).
- Aviso `beforeunload` si hay grabación activa.

## v1.2 — Borrar datos
**Commit:** `a637a29`
- Botón rojo "Borrar datos" en header con doble confirmación (luego reubicado en v2.2).

## v1.1 — Inicial corregido
**Commit:** `bb237af`
- Punto de partida: archivo del usuario auditado + 10 bugs corregidos.
- Cambios principales:
  - `effectiveRegRes`: `>=` para que último evento en misma fecha gane.
  - Badge "hoy" no cuenta pendientes sin compromiso.
  - Chip "Todos" respeta filtro de estado.
  - Date display en `eventoLogCardHTML`.
  - Defensive `target.tipo = tipo` en edición.
  - `data-*` attrs en lugar de `onclick="...(${e.key})"` para evitar quote-injection.
  - Validación más estricta del import JSON.
  - Removido dead code `pendFilters.vencidos`.
