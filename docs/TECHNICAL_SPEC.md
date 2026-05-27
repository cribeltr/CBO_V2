# Gestión MP 2026 — Documento Técnico

> **Propósito de este documento**: especificación completa del sistema "Gestión MP 2026" para que un agente de IA (o un nuevo desarrollador) pueda entender la totalidad del sistema, su propósito, lógica interna, restricciones y áreas de oportunidad. Debe ser autosuficiente: la IA receptora **no necesita leer el código fuente** para razonar sobre mejoras.

---

## 1. Contexto y objetivo del negocio

### 1.1 Dominio
Hospital **HHHA** (Hospital Doctor Hernán Henríquez Aravena), Chile. Área **Ingeniería Biomédica**. El equipo gestiona el ciclo de vida operacional de **~966 equipos médicos críticos** (ventiladores, monitores, desfibriladores, DEA, incubadoras, máquinas de anestesia, etc.) repartidos en >50 servicios clínicos.

### 1.2 Problema que resuelve
La unidad biomédica recibe del MINSAL un **archivo Excel maestro** llamado `Programacion_MP_2026.xlsm` con dos hojas oficiales:

- **`PMP_2026`**: programación anual del año en curso. Cada fila es un equipo. Columnas:
  - Identificación: ID, N° Carpeta, N° Inventario, Equipo (nombre), Familia, Servicio, Unidad, Ubicación, Procedencia (Adquisición/Arriendo/Comodato), Marca, Modelo, Serie, Año Instalación, Vida Útil Residual, Clasificación (Fija/Portátil), ENU/Baja, Observación, Frecuencia MP (Anual/Semestral/Trimestral...), Responsable MP.
  - Programación mensual: 12 columnas (Ene–Dic) con códigos: `X` (programada), `R` (realizada), `RA` (realizada anticipadamente), `PM` (postergada).

- **`Registro_MP-2026`**: registro de resultados. Misma identificación de equipos. Por cada mes hay un par `P` (programación) y `R` (resultado). Resultados posibles: `Si` (ejecutada OK), `C1`–`C8` (causas de no ejecución), `FS` (fuera de servicio), `Baja`, `NU` (no ubicado).

**Causas C1–C8** (literal de la nomenclatura oficial):
- **C1**: Imposibilidad de desocupar el equipo del paciente por indicación clínica
- **C2**: Equipo en servicio técnico
- **C3**: Equipo no operativo, a la espera de repuestos o accesorios
- **C4**: Equipo en préstamo a otro hospital o institución
- **C5**: No disponibilidad de horas hombre del funcionario SEC por alta carga laboral
- **C6**: No disponibilidad de horas hombre del servicio técnico externo
- **C7**: Ausencia justificada del funcionario SEC superior a 15 días
- **C8**: Contingencia hospitalaria

### 1.3 Usuario primario
Un ingeniero biomédico (Cristián Beltrán Oviedo) que:
1. Recorre los equipos en terreno, ejecuta o supervisa MPs.
2. Coordina con los **ejecutores** (técnicos SEC). Lista fija de 11 personas.
3. Registra eventos: MPs realizadas, envíos a ST, recepciones, reparaciones, visitas técnicas, cotizaciones, órdenes de compra.
4. Mantiene seguimiento de **pendientes** (tareas administrativas que delega: ej. "conseguir pauta de monitoreo firmada del servicio").
5. Genera reportes mensuales/anuales.
6. Es el responsable último ante el MINSAL.

### 1.4 Objetivo del programa
Reemplazar el trabajo manual en Excel (lento, propenso a error, sin historial) por una **aplicación web** que:
- Lee el .xlsm maestro y lo muestra navegable.
- Permite registrar eventos enlazados a cada equipo.
- Permite gestionar pendientes con seguimiento estructurado.
- Mantiene una **agenda institucional** (supervisores, jefes, técnicos externos).
- Sincroniza datos con Google Sheets para compartir/respaldar.
- Exporta a Excel el archivo "Registro_MP-2026" actualizado para entregar al MINSAL.

---

## 2. Arquitectura

### 2.1 Stack
- **Frontend**: HTML monolítico de un solo archivo (~244 KB). JavaScript vanilla, sin build, sin npm. Tailwind CSS y Lucide icons vía CDN. SheetJS (XLSX) vía CDN para leer/escribir Excel.
- **Backend (opcional)**: Google Apps Script Web App (~45 KB). Apps Script V8 runtime. Persiste en Google Sheets. Adjuntos en Google Drive.
- **Modelo de despliegue dual**:
  - **Local**: el HTML se abre como archivo (`file://...`). Funciona completo sin red.
  - **Hosted**: Apps Script `doGet` sirve el HTML cuando se accede a la URL `/exec`. URL pública compartible.

### 2.2 Persistencia (3 capas)

| Capa | Para qué | Tamaño |
|---|---|---|
| **localStorage del navegador** | Datos del usuario entre sesiones (eventos, pendientes, agenda, marcadores sync). | Hasta ~5–10 MB |
| **Google Sheets (vía Apps Script)** | Respaldo / compartición / vista colaborativa. | Sin límite práctico para nuestro volumen |
| **Google Drive (vía Apps Script)** | Adjuntos: PDFs de cotizaciones, OC, fotos, pautas firmadas. | Hasta 10 MB por archivo, sin límite total |

El **archivo .xlsm maestro NO se persiste** entre sesiones (sólo en memoria). El usuario debe re-cargarlo al iniciar. Esto es intencional: la fuente de verdad del inventario es el .xlsm que entrega el MINSAL; cambia sólo cuando hay altas/bajas.

### 2.3 Diagrama de flujo simplificado
```
[Archivo .xlsm maestro]  ──carga──> [state.equipos en memoria]
                                          │
                  ┌────────────────────────┤
                  │                        │
[Eventos/pendientes en localStorage]      [Vistas en pantalla]
                  │
                  ├──auto-push──> [Apps Script Web App] ──> [Google Sheets]
                  │                                              │
                  ├──upload──>   [Apps Script Web App] ──> [Google Drive]
                  │
                  └──exportXLSX──> [Excel descargado]
```

---

## 3. Modelo de datos

### 3.1 Estructura en memoria (objeto `state`)
```js
state = {
  equipos: Array<Equipo>,         // del archivo Excel maestro
  loaded: boolean,                 // ¿se cargó el .xlsm?
  fileName: string,                // nombre del archivo cargado
  loadedAt: ISOString,
  verif: { pmpRows, regRows, validos, slots, familias, codeCounts, resCounts, duplicados, parciales, headerWarnings },
  eventos: { [equipoKey]: Array<Evento> },           // registros del usuario
  pendientes: { [equipoKey]: Array<Pendiente> },     // pendientes del usuario
  agenda: {
    servicios: { [nombreServicio]: { supervisor, encargado, otros: [] } },
    centros: Array<CentroResponsabilidad>,
    directorio: Array<ContactoDirectorio>,
    empresas: Array<Empresa>
  }
}
```

### 3.2 Tipos
```typescript
type Equipo = {
  key: string;            // identificador interno: 'inv:2-006472' o 'id:1234' si no hay N° Inv válido
  rowIndex: number;       // fila original en el .xlsm
  fam: string;            // Familia
  id: number | string;    // ID secuencial del archivo
  carpeta: string;
  inv: string | null;     // N° Inventario (puede ser null)
  equipo: string;         // Nombre del equipo (ej. "Desfibrilador")
  servicio: string;
  unidad: string;
  ubicacion: string;
  procedencia: string;    // Adquisición / Arriendo / Comodato
  marca: string;
  modelo: string;
  serie: string;
  anio: number;           // Año instalación
  vur: number;            // Vida útil residual (años)
  clas: string;           // Fija / Portátil / Crítica
  enuBaja: string;
  frecuencia: string;     // MP: Anual / Semestral / Trimestral / Bimestral / Mensual
  pmpMeses: Array<string | null>;  // 12 elementos. Códigos: X/R/RA/PM o null
  regProg:  Array<string | null>;  // del .xlsm Registro_MP-2026 columnas P
  regRes:   Array<string | null>;  // del .xlsm Registro_MP-2026 columnas R (Si/C1..C8/FS/Baja/NU)
  regObs:   string | null;
  empty: boolean;         // true si la fila representa un slot vacío
};

type Evento = {
  id: string;             // uid()
  tipo: 'mp' | 'visita_tecnica' | 'cotizacion' | 'oc' | 'envio' | 'solicitud' | 'recepcion' | 'reparacion';
  fecha: ISOdate;
  ejecutor?: string;
  estado?: 'operativo' | 'no operativo';
  observacion?: string;
  comentario?: string;
  archivos?: Array<Adjunto>;
  // Específicos según tipo:
  resultado?: 'Si' | 'C1'..'C8' | 'FS' | 'Baja' | 'NU';  // mp
  empresaId?: string;     // visita_tecnica, cotizacion, oc — ref a state.agenda.empresas
  contactoId?: string;    // visita_tecnica — ref a contacto dentro de la empresa
  nCotizacion?: string;   // cotizacion
  nOC?: string;           // oc
  nEnvio?: string;        // envio, recepcion
  empresa?: string;       // envio (texto libre, legacy)
  folio?: string;         // envio, solicitud
  folioGuia?: string;     // recepcion
};

type Pendiente = {
  id: string;
  descripcion: string;
  fecha: ISOdate;             // creación
  fechaCompromiso?: ISOdate;
  fechaCierre?: ISOdate;
  proximoRecordatorio?: ISOdate;
  ejecutor?: string;
  estado: 'abierto' | 'cerrado';
  tareas: Array<Tarea>;
  actualizaciones: Array<Seguimiento>;
  archivos?: Array<Adjunto>;
};

type Tarea = { id, descripcion, estado: 'abierto'|'cerrado', fecha };

type Seguimiento = {
  id: string;
  fecha: ISOdate;
  texto: string;
  tipo?: 'delegacion' | 'recordatorio' | 'avance' | 'bloqueo' | 'cierre';
  contactadoA?: string;       // nombre del ejecutor contactado
};

type Adjunto = { id, nombre, mime, size, url, uploadedAt };  // id es ID de Drive

type CentroResponsabilidad = {
  id: string;
  nombre: string;
  jefe: Contacto | null;
  servicios: string[];        // nombres de servicios asociados
};

type Empresa = {
  id: string;
  nombre: string;
  direccion: string;
  contactos: Array<EmpresaContacto>;
};

type EmpresaContacto = { id, nombre, cargo, email, telefono, celular };

type ContactoDirectorio = {
  id, categoria: 'ST externo' | 'Proveedor' | 'Jefatura' | 'Otro',
  organizacion, nombre, email, telefono, notas
};

type Contacto = { nombre, email, anexo, celular };
```

### 3.3 Claves (`key`) — política
- Equipos con N° Inventario válido (no vacío, no `'N/A'`): `'inv:'+N°Inv` (ej. `'inv:2-006472'`).
- Equipos sin N° Inventario válido: `'id:'+ID` (ej. `'id:1234'`).
- En la UI y exportes se muestra **sin** el prefijo `inv:` — sólo el inventario o `ID-1234`.

### 3.4 Constantes de configuración
- `PROGRAM_YEAR = 2026` — año de la programación PMP. Filtra qué MPs cuentan en la tabla anual. Cambiar a `2027` el próximo año.
- `EJECUTORES` — array fijo de 11 nombres (técnicos SEC + personal externo).
- `RESULTADOS` — `['Si','C1'..'C8','FS','Baja','NU']`.
- `CAUSAS` — diccionario C1–C8 → descripción.
- `MONTHS` / `MONTHS_FULL` — abreviadas / completas.
- `TIPOS_EVENTO` — 8 tipos con `{label, icon, color}`.
- `DIRECTORIO_CATEGORIAS` — 4 categorías.
- `SEGUIMIENTO_TIPOS` — 5 tipos de seguimiento en pendientes.

### 3.5 LocalStorage — claves
| Clave | Contenido |
|---|---|
| `mp_app_state_v1` | `{ eventos, pendientes, agenda }` |
| `mp_app_data_v1` | `{ equipos, verif, fileName, loadedAt }` (caché opcional del .xlsm parseado) |
| `mp_app_sync_v1` | `Array<string>` markers de discrepancias sincronizadas |
| `mp_app_gas_url_v1` | URL del Web App de Apps Script |
| `mp_app_gas_auto_v1` | `'1'` / `'0'` — auto-sync activado |
| `mp_app_mi_usuario_v1` | Nombre del usuario actual (para filtro "Mis pendientes") |
| `mp_sidebar_collapsed_v1` | `'1'` / `'0'` — estado del sidebar |

---

## 4. Vistas y navegación

La aplicación tiene **5 vistas** en el sidebar lateral:

### 4.1 Buscar equipos
- Tabla virtualizada (puede manejar 966 filas sin lag) con 15 columnas.
- 3 columnas sticky a la izquierda: ID, Inv., Equipo.
- Resto: Familia, Carpeta, Servicio, Unidad, Ubicación, Procedencia, Marca, Modelo, Serie, Estado Equipo, Días en estado, Estado Pendiente.
- **Filtros**: texto libre (inv/serie/equipo/marca/modelo/servicio/unidad/ubicación), servicio, familia, clasificación, frecuencia, estado equipo, estado pendiente.
- **Filtro adicional desde Verificación**: banner azul cuando se entró filtrando por X código en Y mes; botón "Quitar filtro" y "Exportar filtrado".
- **Click en fila** → abre el modal del equipo.

### 4.2 Hoy (dashboard)
KPIs en cards:
- Vencidos (pendientes con fechaCompromiso < hoy)
- Por recontactar (proximoRecordatorio <= hoy)
- Para hoy
- Próximos 7 días
- Sin compromiso
- Cerrados hoy
- Registros hoy
- Alerta > 30d (equipos no operativos o en ST con más de 30 días)

Secciones colapsables con tarjetas de pendientes.

### 4.3 Pendientes (gestión global)
- Búsqueda + filtros (estado, ejecutor, período: vencidos/hoy/semana/mes/sin compromiso).
- Chip **"Mis pendientes"** (filtra por `state.miUsuario`).
- Sección destacada **"Pendientes de carga al archivo maestro"** (discrepancias entre eventos en la app vs Registro_MP-2026 del .xlsm: equipos con MP en app pero archivo vacío, o con resultado distinto).
- Lista agrupada por bucket: Vencidos / Hoy / Próximos 7 días / Este mes / Más adelante / Sin compromiso.

### 4.4 Verificación de carga
- KPIs: filas leídas, equipos válidos, slots vacíos, equipos por familia.
- Tabla **"Estado actual de los equipos"** con 5 cards clickeables (Operativos, No operativos, En ST, Sin registros, Total) — al hacer click filtran "Buscar equipos".
- Tabla **"Códigos PMP por mes"** (X/R/RA/PM × 12 meses) con totales — celdas clickeables filtran.
- Tabla **"Resultados por mes"** (Si/C1..C8/FS/Baja/NU × 12 meses) + fila destacada **"Sin resultado"** (programados sin registro). Celdas clickeables filtran.
- Sección "Inconsistencias detectadas" (claves duplicadas, slots vacíos, encabezados que no coinciden).

### 4.5 Agenda
Cuatro pestañas:
1. **Servicios clínicos**: por cada servicio del .xlsm, tarjetas con Supervisor / Encargado de Equipos / Jefe del CR + bloque "Otros contactos" (lista libre con rol).
   - Chips de filtro: Todos / Completos (3/3) / Incompletos / Sin contactos.
   - Chips por CR asignado.
2. **Centros de Responsabilidad**: crear y editar CRs, asignar servicios, registrar Jefe.
3. **Empresas**: registro de empresas externas (ST, proveedores). Cada empresa tiene N contactos con nombre, cargo, email, teléfono, celular.
4. **Directorio**: contactos sueltos no atados a un servicio (categorizados).

---

## 5. Funcionalidades clave

### 5.1 Ficha del equipo (modal)
Al abrir un equipo:
1. **Cabecera**: nombre + N° Inv + serie + ID + badges (Estado actual + Días en estado si aplica).
2. **Datos** (grid 4 columnas): ID, Carpeta, Inv, Serie, Equipo, Familia, Servicio, Unidad, Ubicación, Procedencia, Marca, Modelo, Año, Vida útil, Clasificación, Frecuencia MP.
3. **Contactos del servicio** (colapsable): Supervisor + Encargado + Jefe CR + Otros contactos.
4. **Línea de tiempo** (horizontal scrollable): todos los eventos del equipo ordenados cronológicamente. Click en un ítem hace scroll al registro completo.
5. **Programación MP 2026**: tabla de 3 filas (Programación / Resultado / Ejecutor) × 12 columnas (Ene-Dic). El resultado mergea archivo + eventos del usuario, con punto azul si viene de la app.
6. **Registros asociados**: lista completa de eventos en orden inverso cronológico. Botón "+ Nuevo registro".
7. **Pendientes**: lista de pendientes del equipo + botón "+ Nuevo pendiente".

### 5.2 Tipos de evento — campos por tipo

| Tipo | Campos específicos |
|---|---|
| `mp` (MP) | fecha, resultado, ejecutor, estado, observación |
| `visita_tecnica` | fecha, empresaId, contactoId (técnico de la empresa), ejecutor, estado, observación |
| `cotizacion` | fecha, nCotizacion, empresaId, ejecutor, estado opcional, observación |
| `oc` (Orden de Compra) | fecha, nOC, empresaId, ejecutor, estado opcional, observación |
| `envio` (a ST) | fecha, nEnvio, empresa (texto), ejecutor, folio, estado, comentario |
| `solicitud` (de trabajo) | fecha, ejecutor, folio, estado (no operativo por defecto), comentario |
| `recepcion` | fecha, nEnvio, folioGuia, estado |
| `reparacion` | fecha, estado |

Todos los tipos soportan **adjuntos** (subidos a Drive, hasta 10 MB cada uno).

### 5.3 Lógica del "Estado actual" del equipo
Función `getEquipoEstadoExtended(e)`. Recorre los eventos del equipo en orden cronológico ascendente:
```pseudo
stStart = null    // inicio del período en ST sin recepción
estado = null     // último estado conocido
estStart = null   // fecha del cambio al estado actual

para cada ev en eventos ordenados por fecha asc:
  si ev.tipo === 'envio':
    si stStart es null: stStart = ev.fecha
  sino si ev.tipo === 'recepcion':
    stStart = null
    si ev.estado y ev.estado != estado: estado=ev.estado, estStart=ev.fecha
  sino si ev.estado:
    si ev.estado != estado: estado=ev.estado, estStart=ev.fecha

si stStart: return { estado: 'servicio_tecnico', desde: stStart, dias: hoy-stStart }
si estado === 'operativo': return { estado: 'operativo', desde: estStart, dias: 0 }
si estado === 'no operativo': return { estado: 'no operativo', desde: estStart, dias: hoy-estStart }
return { estado: null, desde: null, dias: 0 }
```

**Reglas**:
- "Servicio técnico" gana sobre cualquier otro estado mientras haya un `envio` sin `recepcion` posterior.
- El contador de "días no operativo" **no se resetea** con eventos intermedios que no cambian el estado (decisión del usuario: el equipo lleva N días caído desde el primer evento que lo dejó así).
- **Alertas**: ámbar a 30 días, rojo a 60, rojo intenso a 90.

### 5.4 Programación MP — filtro por año
Función `effectiveRegRes(e)`. Mergea `regRes` del archivo con eventos MP del usuario.
- **Sólo cuenta eventos del año `PROGRAM_YEAR`** (= 2026 actualmente). Un MP de octubre 2025 con resultado C3 **NO aparece** en la columna Octubre de la tabla 2026 — queda sólo en el historial del equipo. Esto evita que MPs históricas inflen los conteos del año en curso.
- Para eventos del año correcto: el último por fecha del mes gana (si hay 2 MPs el mismo mes, prevalece el más reciente).
- Mismo principio aplica a la detección de discrepancias app↔archivo.

### 5.5 Discrepancias app ↔ archivo maestro
Función `computeSyncIssues(includeOnlyFile)`. Compara los resultados de la app contra el `regRes` del .xlsm:
- **Falta en archivo**: app tiene MP con resultado, archivo está vacío en ese mes.
- **Resultado distinto**: app y archivo tienen valores diferentes en ese mes.
- **Sólo en archivo** (opcional): archivo tiene resultado pero la app no.

Cada caso se muestra en "Pendientes > Pendientes de carga al archivo maestro". Botón "Sincronizado" persiste un marker para ocultarlo. Si el caso cambia (ej. el resultado en app se modifica) reaparece automáticamente.

### 5.6 Sincronización con Google Sheets
- URL del Web App configurable; cuando la app está hosteada en Apps Script, se auto-configura.
- **`replaceAll`**: payload completo (eventos + pendientes + agenda + syncMarked + `equiposLookup`). Reemplaza todas las hojas. Auto-disparo debounced 1.5s tras cada `savePersisted`.
- `equiposLookup` enriquece las hojas amigables con datos del .xlsm (Equipo, Servicio, Familia, etc.).
- **Pull**: `fetch(URL + '?action=read')` devuelve JSON con todo el estado. El usuario lo dispara manualmente desde el modal de configuración.
- Indicador de estado: ⚫ off / 🟢 ok / 🔵 syncing / 🟠 pending / 🔴 error.

### 5.7 Hojas en Google Sheets (estructura amigable)
**Visibles**:
- `Eventos` (20 columnas amigables: ID, N° Inventario, Equipo, Servicio, Familia, Tipo de evento, Fecha, Resultado, Ejecutor, Estado del equipo, Empresa, Técnico (visita), N° Envío, N° Cotización, N° OC, Folio, Folio guía, Observación, Adjuntos (URL), Actualizado).
- `Pendientes` (15 columnas).
- `Equipos - Operativos` (vista computada).
- `Equipos - No operativos` (vista computada, ordenada por más días primero, columna Alerta 🟠/🔴/🔴).
- `Equipos - En servicio técnico` (vista computada).
- `Agenda` (consolidada: servicio + cargo/rol + datos + CR asociado).
- `Empresas` (empresa + contactos consolidados).
- `Agenda - Directorio`.

**Ocultas (sistema)**:
- `Agenda_Servicios`, `Agenda_Otros`, `Agenda_Centros`, `Agenda_Empresas`, `Agenda_Empresas_Contactos`, `Agenda_Directorio`, `SyncMarked`, `Meta`.

### 5.8 Adjuntos (Google Drive)
- Estructura: `MP2026_Adjuntos/[N° Inventario]/ev_[id]_archivo.pdf` o `pe_[id]_archivo.pdf`.
- Validación cliente: máximo 10 MB por archivo.
- Archivo público con link (`ANYONE_WITH_LINK`).
- En el Sheet aparece como link clickeable (usando `RichTextValue`, no fórmula, para evitar problemas de locale es-CL).
- Drag & drop o click para subir.

### 5.9 Funcionalidades de UX especiales
- **"Guardar y siguiente"** en formulario de evento: guarda → cierra modal del equipo → enfoca buscador limpio.
- **Atajos de fecha**: Hoy / −1 sem / −1 mes / −6 m / −1 año (eventos) y Hoy / +1 sem / +1 mes (pendientes).
- **Toast con acción "Ver registro"**: tras guardar, link rápido para reabrir el modal.
- **Detector de typos**: al guardar pendiente, valida `,,`, dobles espacios, palabras mal escritas (paura→pauta, febreo→febrero, etc.).
- **Grabador de sesión**: registra clicks, cambios, scrolls; descarga JSON al detener. Para depuración / análisis.
- **Sidebar contraíble**: ahorra espacio horizontal. Estado persistido.
- **Header con menú "Más opciones"**: agrupa exportar / importar / grabar.
- **Filtro "Mis pendientes"**: muestra sólo lo asignado al usuario actual (configurable).
- **Línea de tiempo del equipo**: visualización horizontal de la cronología de eventos.

---

## 6. Integración con Google Apps Script

### 6.1 Hojas creadas por `setup()` / `migrate()`
10 hojas (8 técnicas + 2 amigables principales). `migrate` es no-destructivo: agrega columnas faltantes sin perder datos.

### 6.2 Acciones del Web App
| Verbo | Acción | Para qué |
|---|---|---|
| GET `/exec` | (sin params) | Sirve el HTML de la app |
| GET `/exec?action=read` | — | Devuelve todo el estado en JSON |
| POST `/exec` | `replaceAll` | Reemplaza todo desde el cliente |
| POST `/exec` | `upsertEvento/Pendiente/Contacto/CR` | Inserción puntual |
| POST `/exec` | `delete*` | Borrado puntual |
| POST `/exec` | `markSynced` / `unmarkAllSynced` | Marcadores de discrepancias |
| POST `/exec` | `uploadFile` | Sube archivo base64 a Drive, retorna metadata |
| POST `/exec` | `deleteFile` | Mueve archivo a papelera |
| POST `/exec` | `ping` | Health check |

### 6.3 Restricción técnica importante (CORS)
Apps Script no acepta `Content-Type: application/json` desde el navegador (preflight CORS falla). La app envía POSTs **sin** Content-Type, con el JSON como body. Apps Script lo recibe en `e.postData.contents`.

### 6.4 Restricción de locale
Apps Script HYPERLINK formulas dependen del locale del Sheet (es-CL usa `;` en lugar de `,`). Para evitar este problema, los adjuntos clickeables se crean con `SpreadsheetApp.newRichTextValue().setLinkUrl()` (locale-independiente).

---

## 7. Restricciones y limitaciones conocidas

### 7.1 Funcionales
1. **Programación anual fija**: `PROGRAM_YEAR = 2026` hardcoded. Cambio anual requiere editar 1 línea.
2. **Excel maestro recargable**: el .xlsm debe cargarse en cada sesión. No hay forma de mantenerlo persistente entre sesiones (el archivo binario no se almacena para evitar problemas de cuota localStorage).
3. **Sincronización 1-direccional automática**: solo push automático del cliente al Sheet. Pull es manual. No hay resolución de conflictos: en multi-dispositivo, el último push gana (replaceAll completo).
4. **Sin autenticación granular**: el Web App es accesible a "Cualquiera con el link" (configurable). No hay distintos roles dentro de la app — cualquiera con la URL puede leer y escribir.
5. **Adjuntos públicos**: subidos a Drive con `ANYONE_WITH_LINK`. Si el usuario los necesita privados, debe ajustar permisos manualmente en Drive.

### 7.2 Técnicas
- **Tamaño localStorage**: ~5-10 MB. El equipo cargado (state.equipos) cabe; eventos+pendientes están lejos del límite.
- **Tamaño de archivo subido**: 10 MB cliente / 50 MB Apps Script (límite del runtime). Validado en cliente.
- **Apps Script invocations**: cuotas Google (20.000 ejecuciones/día en cuentas gratis; sobrado para uso esperado).
- **CDN dependency**: Tailwind, XLSX, Lucide vía CDN. Sin internet en el navegador, la app no carga. Soluciones: descarga local de los assets.
- **Browser compatibility**: probado en Chrome/Edge. Usa fetch/async/await/optional chaining — incompatible con IE11.
- **No multi-tenant**: pensada para 1 instalación = 1 hospital. Datos en localStorage del navegador. Si dos usuarios la usan en el mismo dispositivo, comparten datos.

### 7.3 De diseño / UX
- 8 colores distintos para tipos de evento (mp/visita/cotización/oc/envio/solicitud/recepción/reparación). El usuario los aprende pero hay carga cognitiva.
- Tabla de equipos con 15 columnas → scroll horizontal en pantallas <1800px.
- Modal del equipo es largo (datos + contactos + timeline + programación + registros + pendientes). Funciona como scroll pero podría tener tabs.
- El input HTML `<input type="date">` es lento para fechas pasadas — atajos `−1 año / −6 m` mitigan.

---

## 8. Patrones técnicos relevantes

### 8.1 Virtualización de tabla
La tabla de equipos usa virtualización casera: sólo se renderizan las filas visibles + 5 de buffer. Compatible con 1000+ filas sin lag perceptible. Listener de scroll en el contenedor; cleanup de resize-listener al destruir.

### 8.2 Debouncing
- Input de búsqueda: 180 ms.
- Push automático a Sheets: 1500 ms (acumula varios cambios en una sola petición).

### 8.3 Idempotencia
- Sync (`replaceAll`) es idempotente: enviar dos veces el mismo payload resulta en el mismo estado.
- Adjuntos: si subes el mismo archivo dos veces, queda doble en Drive (cliente no deduplica). El metadata en evento sí registra ambos.

### 8.4 Trazabilidad
- Cada evento y pendiente tiene `id` único (`uid()`).
- Cada adjunto guarda `uploadedAt`.
- Cada fila en Sheets tiene columna `Actualizado` con timestamp ISO.
- El grabador de sesión genera un JSON detallado para debugging.

### 8.5 Migración progresiva
- Versión del schema (v1 → v2 → ... → v3.6) en `appVersion` del JSON exportado.
- `loadPersisted` y `migrate` en Apps Script son **no destructivas** y normalizan estructuras viejas.
- Campos nuevos (ej. `archivos`, `proximoRecordatorio`) son opcionales y se inicializan defensivamente.

---

## 9. Flujo de trabajo típico del usuario

### Diario
1. Abre la app (local o vía URL `/exec`).
2. Carga `Programacion_MP_2026.xlsm` con click en "Cargar archivo".
3. Sincronización automática "tira" el último estado de Sheets si está hosteado.
4. Va a "Hoy": revisa qué tiene vencido, qué debe recontactar.
5. Busca un equipo por N° Inv.
6. Click en el equipo → modal.
7. "+ Nuevo registro" → completa: fecha, resultado, ejecutor, estado, observación. Adjunta PDF si aplica.
8. "Guardar y siguiente" → vuelve al buscador con cursor listo para el próximo.

### Cuando se delega
1. Crea un pendiente: "Conseguir pauta de monitoreo de abril del servicio X".
2. Asigna a Carlos Bahamondes Seguel.
3. Fija "Próximo recordatorio: en 1 semana".
4. La semana siguiente: en "Hoy" → "Por recontactar" aparece. Llama a Carlos.
5. Click "+ Seguimiento" → tipo `Recordatorio` → "Aún no la tiene, dice mañana".
6. Cuando Carlos entrega: tipo `Cierre` → se cierra automáticamente.

### Mensual / trimestral
1. Va a "Verificación de carga".
2. Click en "Sin resultado · Mayo" → ve todos los equipos programados que aún no tienen registro de mayo.
3. Procesa cada uno.
4. Click en "No operativos" → ve los equipos no operativos con días en ese estado. Llama a las empresas para activar OCs / cotizaciones.

### Fin de mes
1. "Más opciones → Exportar Excel" → descarga `MP_2026_AAAA-MM-DD.xlsx` con 5 hojas listas para entregar al MINSAL.

---

## 10. Áreas de oportunidad / mejoras potenciales

Para que la IA receptora razone sobre mejoras:

### 10.1 UX
- **Tabla configurable**: permitir al usuario elegir qué columnas mostrar/ocultar.
- **Vistas guardadas**: filtros frecuentes (ej. "Equipos no operativos UCI") guardados como botones rápidos.
- **Plantillas de pendiente**: los más usados son "Pauta de monitoreo diario [meses]". Un dropdown de plantillas aceleraría.
- **Calendario visual** de programación MP: vista tipo "agenda" con MPs futuras.
- **Búsqueda fuzzy**: actualmente exacta. Tolerar typos en queries.

### 10.2 Datos
- **Validación cruzada al cargar el .xlsm**: detectar slots, IDs duplicados, dependencias entre P y R (no debería haber R sin P).
- **Historial de cambios del .xlsm**: comparar versiones para ver qué equipos se dieron de alta/baja entre cargas.
- **Tendencias**: gráfico de "MPs cumplidas vs programadas por mes".
- **KPIs anuales**: % cumplimiento anual del programa por servicio / familia.

### 10.3 Colaboración
- **Conflict resolution**: detectar si otro usuario modificó algo en Sheets desde la última sync.
- **Notificaciones**: cuando un pendiente "Por recontactar" llega a su fecha (push del navegador o email).
- **Permisos por rol**: ejecutores deberían poder marcar tareas como cerradas pero no editar pendientes ajenos.

### 10.4 Performance
- **Server-side filter** para "Buscar equipos" cuando son >10k filas. Hoy todo cliente.
- **Lazy load** del archivo .xlsm (parsear sólo el sheet visible).
- **Service Worker** para offline: usar la app sin conexión, sincronizar al volver.

### 10.5 Datos del MINSAL
- **API directa con MINSAL/SSS**: en lugar de cargar .xlsm, consumir endpoint oficial. Pensar en formato esperado.
- **Multi-año**: comparar PMP 2025 vs 2026 lado a lado.

### 10.6 Arquitectura
- Migrar de Apps Script a un backend Node/Postgres si crece más allá de 1 hospital.
- Separar HTML / CSS / JS en archivos cuando salga del modo "monolito".

---

## 11. Versionado actual

**Versión vigente al momento de este documento: v3.6**

Historial resumido (commits en rama `claude/dreamy-curie-mFTeH`):

| Versión | Hito |
|---|---|
| v1.0 | Base: cargar .xlsm, registrar eventos MP, vista calendar |
| v1.3 | Grabador de sesión |
| v1.6 | Detección de discrepancias app↔archivo |
| v1.8 | Agenda básica (supervisores, encargados, CR) |
| v2.0 | Verificación clickeable + filtro desde tabla → equipos |
| v2.5 | Polish UI: loading overlay, focus rings, animaciones |
| v2.6 | Seguimientos estructurados + recordatorios |
| v2.9 | Adjuntos a Drive (10 MB) |
| v2.10 | Agenda con "Otros contactos" + Directorio |
| v2.12 | Tipo `visita_tecnica` + sección Empresas |
| v2.13 | Tipos `cotizacion` y `oc` + fix año en Programación |
| v3.0 | Estado extendido + días en estado + alertas, header minimalista, Sheets amigable |
| v3.2 | Fix locale es-CL en formulas |
| v3.3 | Adjuntos como `RichTextValue` (definitivo) + timeline + "Mis pendientes" |
| v3.4 | Auditoría completa + null-safety |
| v3.5 | Polish visual final (border-radius, spacing, touch targets) |
| v3.6 | App accesible vía URL `/exec` (Apps Script HTML service) |

---

## 12. Archivos del proyecto

```
CBO_V2/
├── output/
│   ├── GestionMP_2026_corregido.html    ← App completa (entregable principal, ~244 KB)
│   └── GestionMP_2026_v2.5-stable.zip   ← Backup del punto v2.5 estable
├── docs/
│   ├── Code.gs                           ← Backend Apps Script (~45 KB)
│   ├── README.md                         ← Arquitectura y operación
│   ├── CHANGELOG.md                      ← Historial de versiones
│   ├── RECONSTRUCTION_PROMPT.md          ← Prompt para reconstruir contexto en otra conversación
│   └── TECHNICAL_SPEC.md                 ← Este documento
└── .git/                                  ← Versionado completo
```

---

## 13. Cómo razonar sobre mejoras

Si una IA va a analizar este programa para optimizarlo, debe considerar:

1. **El usuario es uno solo en este momento**, pero el sistema podría escalar a múltiples ingenieros biomédicos en otros hospitales (cada uno con su propio .xlsm y agenda).

2. **El trabajo es repetitivo**: el ingeniero hace los mismos 7-10 clicks para registrar una MP. Cualquier ahorro de pasos × 966 equipos = horas al año.

3. **Las decisiones tienen consecuencias clínicas**: registrar mal el estado de un equipo médico no es trivial. La validación, los avisos ("MP de año pasado no cuenta en 2026"), las confirmaciones existen por seguridad.

4. **El Excel maestro es ley**: cambia poco, viene del ministerio, no puede ser modificado por la app. La app SOLO añade información encima sin tocar el .xlsm original.

5. **El trabajo offline importa**: en pasillos de hospital la wifi a veces falla. La app sigue funcionando con localStorage, sincroniza al volver.

6. **Compatible con flujo de oficina pre-digital**: muchos registros vienen de PDFs firmados, OCs físicas, cotizaciones por email. Por eso los adjuntos son centrales — son el "papel" digitalizado.

7. **Lectura de Sheets compartida**: el Sheet sirve para que jefatura/auditoría revise el avance sin abrir la app. Por eso las hojas amigables tienen nombres en español y datos legibles, no IDs internos.

8. **Confianza > velocidad**: las nuevas features se prueban iterativamente con sesiones grabadas. El usuario priorizó "todo funciona y no pierdo datos" sobre "más rápido pero con riesgo".

---

*Documento generado a fecha de la entrega v3.6. Para preguntas sobre el código fuente, abrir `output/GestionMP_2026_corregido.html` y `docs/Code.gs` en el repo.*
