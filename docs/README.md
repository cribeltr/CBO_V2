# Gestión MP 2026 — HHHA Biomédica

Aplicación web monolítica de un solo archivo HTML para gestionar el programa de Mantención Preventiva (MP) de equipos biomédicos del Hospital HHHA.

**Archivo entregable:** `output/GestionMP_2026_corregido.html`
**Versión estable de referencia:** **v2.5** (tag git `v2.5-stable`)
**Rama de desarrollo:** `claude/dreamy-curie-mFTeH`

---

## Tecnologías

- **HTML5 + JavaScript vanilla** (sin build, sin npm).
- **Tailwind CSS** vía CDN (`https://cdn.tailwindcss.com`).
- **SheetJS / XLSX** vía CDN (`https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`).
- **Lucide icons** vía CDN (`https://unpkg.com/lucide@latest`).
- Persistencia: `localStorage` del navegador.
- Sin backend. Funciona offline tras la primera carga (módulos en caché).

## Estructura del proyecto

```
CBO_V2/
├── output/
│   └── GestionMP_2026_corregido.html    ← el app completo (un solo archivo)
└── docs/
    ├── README.md                         ← este archivo
    ├── CHANGELOG.md                      ← historial de versiones
    └── RECONSTRUCTION_PROMPT.md          ← prompt para reconstruir en nueva conversación
```

---

## Datos de entrada

El usuario carga manualmente el archivo Excel maestro:
**`Programacion_MP_2026.xlsm`** — debe contener al menos estas hojas:

- **`PMP_2026`** — programación anual con encabezados en fila 7 (idx 6):
  `Familia | ID | N° Carpeta | N° Inventario | Equipo | Servicio | Unidad | Ubicación | Procedencia | Marca | Modelo | Serie | Año Instalación | Vida Útil Residual | Clasificación | ENU/Baja | (...) | Frecuencia MP | Responsable MP | Ene | Feb | ... | Dic`

  Las celdas mensuales contienen códigos `X | R | RA | PM`.

- **`Registro_MP-2026`** — registro mensual con pares `P|R` por mes (24 columnas: Ene P, Ene R, ..., Dic P, Dic R).
  Los resultados son: `Si | C1..C8 | FS | Baja | NU`.

### Alias de encabezados aceptados (auto-tolerancia)
- `Familia` ≡ `Fam`
- `ENU/Baja` ≡ `ENU / Baja` ≡ `ENU - Baja` ≡ `ENU-Baja` ≡ `ENU Baja`

### Significado de códigos
- **Programación**: `X` (planificada), `R` (realizada), `RA` (realizada anticipadamente), `PM` (postergada por mantención).
- **Resultados**: `Si` (ejecutada), `C1`–`C8` (causas de no ejecución), `FS` (fuera de servicio), `Baja`, `NU` (no ubicado).
- **CAUSAS** (objeto en código): C1–C8 con descripción legible (paciente, repuestos, contingencia, etc.).

---

## Modelo de datos (localStorage)

### Claves
| Clave | Contenido |
|---|---|
| `mp_app_state_v1` | `{ eventos, pendientes, agenda }` |
| `mp_app_data_v1` | `{ equipos, verif, fileName, loadedAt }` (caché del archivo) |
| `mp_app_sync_v1` | `Array<string>` de marcadores "sincronizado" para discrepancias app↔archivo |

### Estructura
```js
state = {
  equipos: Array<Equipo>,        // del archivo Excel
  loaded: boolean,
  fileName: string,
  loadedAt: ISOString,
  verif: { pmpRows, regRows, validos, slots, familias, codeCounts, resCounts, duplicados, parciales, headerWarnings },
  eventos: { [equipoKey]: Array<Evento> },           // registros del usuario
  pendientes: { [equipoKey]: Array<Pendiente> },     // pendientes del usuario
  agenda: {
    servicios: { [servicio]: { supervisor, encargado } },
    centros: Array<{ id, nombre, jefe, servicios }>
  }
}
```

### Tipos
```js
Equipo = { key, rowIndex, fam, id, carpeta, inv, equipo, servicio, unidad,
           ubicacion, procedencia, marca, modelo, serie, anio, vur, clas,
           enuBaja, frecuencia, pmpMeses: [12], regProg: [12], regRes: [12],
           regObs, empty }

Evento = { id, tipo: 'mp'|'envio'|'solicitud'|'recepcion'|'reparacion',
           fecha: ISOdate, ...campos según tipo }
// mp: resultado, ejecutor, estado, observacion
// envio: nEnvio, empresa, ejecutor, folio, estado, comentario
// solicitud: ejecutor, folio, estado, comentario
// recepcion: nEnvio, folioGuia, estado
// reparacion: estado

Pendiente = { id, descripcion, fecha, fechaCompromiso?, fechaCierre?,
              ejecutor?, estado: 'abierto'|'cerrado',
              tareas: [{id, descripcion, estado, fecha}],
              actualizaciones: [{id, fecha, texto}] }

Contacto = { nombre, email, anexo, celular }

CR = { id, nombre, jefe: Contacto|null, servicios: Array<string> }
```

### Identificador de equipo (key)
Se construye en `parseWorkbook()`:
- Si tiene N° Inventario (no vacío, no `N/A`): `inv:${inv}`
- Si no: `id:${id}`

---

## Vistas

Vista | Sidebar id | Descripción
---|---|---
**Buscar equipos** | `equipos` | Tabla virtualizada del inventario (966 filas en archivo de prueba). Filtros: texto, servicio, familia, clasificación, frecuencia, estado equipo, estado pendiente. Click en fila → modal del equipo.
**Hoy** | `hoy` | Dashboard: vencidos, para hoy, próximos 7 días, sin compromiso, cerrados hoy, registros realizados hoy.
**Pendientes** | `pendientes` | Sección "Pendientes de carga al archivo maestro" (discrepancias app↔archivo) + lista global de pendientes agrupados por bucket temporal con filtros.
**Verificación de carga** | `verificacion` | KPIs, equipos por familia, **tablas de códigos/resultados por mes con totales y celdas clickeables** (cada celda filtra Equipos).
**Agenda** | `agenda` | Tab "Servicios clínicos": Supervisor / Encargado / Jefe del CR por servicio. Tab "Centros de Responsabilidad": gestión de CRs con sus servicios asociados.

---

## Features principales (orden cronológico de implementación)

### v1.x — Base y robustez
- Lectura del XLSM maestro con validación de encabezados (con alias).
- Persistencia en localStorage (eventos, pendientes, datos).
- Vistas: Buscar equipos, Hoy, Pendientes, Verificación.
- Modal de ficha del equipo con datos, programación, registros y pendientes.
- Formularios: 5 tipos de evento (MP, envío, solicitud, recepción, reparación) + pendientes con tareas y actualizaciones.
- Export/Import JSON.
- Export XLSX.
- Botón "Borrar datos" (más tarde reubicado y reforzado).
- Botón "Grabar sesión" → descarga JSON con todos los clics, cambios, vistas, scrolls (para depuración).
- Aviso al recargar el archivo si detecta discrepancias con eventos registrados en la app.

### v2.x — UX y agenda
- **Botón "Guardar y siguiente"** en formulario de evento: guarda y vuelve al buscador con cursor listo.
- **Atajos de fecha** junto a inputs: eventos (`Hoy / −1 sem / −1 mes`), pendientes (`Hoy / +1 sem / +1 mes`).
- **Toast con acción "Ver registro"** tras guardar.
- **Discrepancias app↔archivo**: nuevo bloque en Pendientes con "Falta en archivo", "Resultado distinto", "Sólo en archivo" (toggle). Markers "sincronizado" persistentes.
- **Fila "Ejecutor"** en tabla de Programación/Resultado del modal del equipo (nombre abreviado + tooltip).
- **Agenda**: Supervisor + Encargado por servicio, Centros de Responsabilidad con Jefe, asociación de servicios.
- **Tabla de Verificación clickeable** con totales por mes → filtra Equipos.
- **Exportar XLSX incluye Agenda** (2 hojas adicionales).
- **Botón "Borrar datos"** reubicado al pie del sidebar, con triple confirmación (incluyendo escribir "ELIMINAR").
- **Contactos del servicio** en el modal del equipo (3 tarjetas inline).
- **Fix de pérdida de foco** en buscador de Agenda.
- **UI polish**: loading overlay durante parseo, focus rings accesibles, animaciones suaves de modales y toasts, mejor empty state.

---

## Cómo restaurar este punto funcional

### Opción A — Usar el HTML directamente
1. Descargar `output/GestionMP_2026_corregido.html`.
2. Abrirlo en el navegador (doble click o servir vía cualquier servidor estático).
3. Cargar el archivo `Programacion_MP_2026.xlsm`.
4. Listo. Los eventos, pendientes y agenda se guardan en localStorage del navegador.

### Opción B — Restaurar el repositorio
```bash
git clone <repo-url>
cd CBO_V2
git checkout v2.5-stable      # (o git checkout claude/dreamy-curie-mFTeH)
# Abrir output/GestionMP_2026_corregido.html en el navegador
```

### Opción C — Reconstruir con Claude Code en nueva conversación
Usar el archivo `docs/RECONSTRUCTION_PROMPT.md` como prompt inicial junto con el HTML actual adjunto.

---

## Convenciones

- **Idioma:** español (toda la UI y mensajes).
- **Fechas:** ISO interno (`YYYY-MM-DD`), display chileno (`DD-MM-YYYY`).
- **Ejecutores:** lista fija en `EJECUTORES` (11 nombres). Modificar en el código si cambia el equipo.
- **Versión** en sidebar footer (`v2.X · datos locales`) y en el JSON de grabación.
