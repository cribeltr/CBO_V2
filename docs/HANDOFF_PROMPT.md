# Prompt de handoff — Gestión MP 2026 v4.7

> **Cómo usar este documento:** copia y pega este contenido en una nueva conversación con la IA, adjuntando además los archivos `output/GestionMP_2026_corregido.html` y `docs/Code.gs`. La IA queda con todo el contexto necesario para continuar.

---

## QUIÉN SOY

Soy **Cristián Beltrán Oviedo**, ingeniero biomédico del **Hospital HHHA** (Hernán Henríquez Aravena · Temuco) · Subdepartamento de Equipamiento Clínico. Uso esta app a diario para gestionar el programa de mantención preventiva de ~966 equipos médicos críticos.

## QUÉ ES LA APP

**Gestión MP 2026** — app web de un solo archivo HTML que reemplaza/complementa el archivo Excel maestro institucional `Programacion_MP_2026.xlsm`. Vive en Google Apps Script (Web App) y guarda datos en localStorage + Google Sheets + Google Drive.

**Versión actual:** HTML `v4.7` · Code.gs `3.12`.

## ARCHIVOS ADJUNTOS

1. `output/GestionMP_2026_corregido.html` — la app entera (~330 KB).
2. `docs/Code.gs` — backend Apps Script (~52 KB).
3. `docs/TECHNICAL_SPEC.md` — especificación detallada.
4. `docs/CHANGELOG.md` — historial de versiones.

Si te falta alguno, **pídelo antes de empezar**. No avances sin tener el HTML completo.

## REGLAS QUE NO PUEDES ROMPER

### 1. Defaults peligrosos prohibidos
Los campos `resultado`, `ejecutor` y `estado` del formulario de eventos **deben empezar en blanco** (option `value=""` seleccionada por defecto). Asignar un default (ej. `operativo`) puede llevar a registrar mal el estado real del equipo y es un **error grave operacional**.

### 2. No re-introducir features removidas
- La feature **`oficial / no oficial`** fue removida en v4.7 (estaba en v4.1-v4.5). No la reintroduzcas.
- `upsertEvento_` y `upsertPendiente_` fueron eliminados en v3.17 — no los restaures (todo el flujo va vía `replaceAll`).

### 3. Idioma
Toda la UI, mensajes, toasts, comentarios visibles al usuario van en **español de Chile**.

### 4. Setup destructivo
`Code.gs::setup()` aborta si ya hay datos en las hojas (protección anti-borrado v3.7). **No la modifiques** para que sea menos defensiva.

### 5. Bump de versión obligatorio
Cualquier cambio funcional debe:
- Incrementar el footer del sidebar (`v4.X · datos locales`).
- Incrementar `appVersion` del JSON del grabador.
- Si Code.gs cambió: incrementar `setMeta_('version', '3.X')`.

### 6. Validación de sintaxis antes de entregar
Siempre correr:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('output/GestionMP_2026_corregido.html','utf8');
const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g;
let m, all = '';
while ((m = re.exec(html))) all += m[1] + '\n;\n';
new Function(all);  // throws if syntax error
"
```

### 7. Comentarios en código
- Sin emojis a menos que el usuario lo pida.
- Sin comentarios "tipo log de cambios" (`// changed in v4.X`).
- Sólo agregar comentarios cuando el "por qué" no es obvio del código.

## CONVENCIONES DE LA APP

### Modelo de datos esenciales

```js
// Equipos: parseados del .xlsm
state.equipos[i] = {
  key: 'inv:NNN' | 'id:NNN',
  id, carpeta, inv, equipo, fam, servicio, unidad, ubicacion, marca, modelo, serie,
  pmpMeses: [12], regProg: [12], regRes: [12], regObs
}

// Eventos: lo que el usuario registra
state.eventos[key][i] = {
  id: 'YYYYMMDDHHMMSS',           // v3.16+, anti-colisión con _2, _3
  tipo: 'mp' | 'reporte_servicio' | 'visita_tecnica' | 'cotizacion' | 'oc'
       | 'envio' | 'solicitud' | 'recepcion' | 'reparacion',
  fecha, creadoEn,
  inv, equipo, servicio, fam,    // denormalizados
  // campos específicos del tipo
  archivos: [{ id, nombre, mime, size, url, uploadedAt }]
}

// Pendientes: tareas operativas
state.pendientes[key][i] = {
  id, descripcion, fecha, fechaCompromiso, proximoRecordatorio, fechaCierre,
  ejecutor, estado: 'creado' | 'abierto' | 'cerrado',
  tareas: [...], actualizaciones: [...], archivos: [...],
  inv, equipo, servicio,
  eventoId: '<id-evento-padre>'   // opcional, vínculo
}

// Bucket especial: state.pendientes['general'] = actividades sin equipo
```

### Tipos de evento (NO TOCAR el orden ni los keys)

| Key | Label |
|-----|-------|
| `mp` | Mantención preventiva |
| `reporte_servicio` | Reporte de servicio (con clasificador) |
| `visita_tecnica` | Visita técnica |
| `cotizacion` | Cotización |
| `oc` | Orden de Compra |
| `envio` | Envío a servicio técnico (estado implícito = `servicio_tecnico`) |
| `solicitud` | Solicitud de trabajo |
| `recepcion` | Recepción |
| `reparacion` | Reparación |

### Estados de equipo
`operativo` · `no operativo` · `servicio_tecnico` · `null` (sin registros)

### Resultados de MP
`Si` · `C1` · `C2` · `C3` · `C4` · `C5` · `C6` · `C7` · `C8` · `FS` · `Baja` · `NU`

### Ejecutores (lista fija, no cambiar)
```
Carlos Bahamondes Seguel, Cristián Beltrán Oviedo, Cristina Rozas Urrutia,
Daniel Díaz Neira, Ignacio Berner Bergara, Macarena Toledo, Marco Ulloa,
Matías Soazo Garrido, Personal externo, Ricardo Matus Aroca, Tito Millapán Riquelme
```

### Causales (texto exacto)
```
C1: Imposibilidad de desocupar el equipo del paciente por indicación clínica
C2: Equipo en servicio técnico
C3: Equipo no operativo, a la espera de repuestos o accesorios
C4: Equipo en préstamo a otro hospital o institución
C5: No disponibilidad de horas hombre del funcionario SEC por alta carga laboral
C6: No disponibilidad de horas hombre del servicio técnico externo
C7: Ausencia justificada del funcionario SEC superior a 15 días
C8: Contingencia hospitalaria
```

### Reglas de reprogramación PMP (no inventar, son norma MINSAL)

Al guardar un MP con resultado C1-C8:
- **C1, C5, C6, C7, C8** → pendiente `estado:'creado'` con `fechaCompromiso = último día del mes siguiente`.
- **C2, C3, C4** → pendiente `estado:'creado'` SIN `fechaCompromiso` (esperar reintegro).

## FLUJO DE TRABAJO TÍPICO DEL USUARIO

1. Cada mañana cargo el `.xlsm` actualizado del MINSAL. La app lo sube a Drive.
2. Recorro los equipos por servicio, registrando MPs del día (botón Nuevo registro).
3. Si encuentro un equipo no operativo creo el evento + pendiente correspondiente.
4. Reviso "Hoy" para ver pendientes vencidos / por iniciar.
5. Reviso "Pendientes" filtrados para gestionar seguimientos.
6. Periódicamente exporto Excel / JSON para respaldo.

## QUÉ PRESERVAR AL HACER CAMBIOS

- Los **IDs internos** (timestamp o hash legacy) — no reescribir.
- El campo `creadoEn` de eventos — no sobrescribir en edición.
- La denormalización `inv/equipo/servicio/fam` — completarla cuando esté vacía, nunca borrarla.
- Los marcadores `mp_app_mig_*` en localStorage — no resetearlos sin razón.
- El estilo `.hist-tbl` (tabla de Historial) — diseñado específicamente para lectura cómoda.
- El módulo "Asociar a un CR" cuando un servicio no tiene CR.
- El backfill de `creadoEn` desde `fecha` en `loadPersisted`.

## CUANDO TE PIDA "AUDITA" O "ANALIZA LA SESIÓN"

El usuario te va a adjuntar archivos `sesion_MP_YYYYMMDDTHHMMSS.json` (log del grabador) y `mp_datos_YYYYMMDD.json` (export JSON). Pasos:

1. **Lee el `appVersion`** del log — confirma con qué versión estaba operando.
2. **Cuenta eventos/pendientes nuevos** comparando con el export.
3. **Identifica errores de UX** (clicks repetidos, abrir/cerrar sin acción, valores que cambian varias veces — indica que el usuario no encontró lo que buscaba).
4. **Detecta inconsistencias** en datos (campos faltantes, IDs duplicados, eventos huérfanos).
5. **Reporta sólo lo accionable**, no narres el log entero.

## CUANDO ME DEVUELVAS CAMBIOS

- Editas en el archivo, validas sintaxis, bumpeas versión.
- Commit con mensaje descriptivo en inglés (sigue los formatos de commits previos).
- Push a la rama `claude/dreamy-curie-mFTeH` (el repo tiene un trigger configurado para esta rama).
- Entregame el archivo HTML (y Code.gs si cambió) vía SendUserFile.
- Resumen ejecutivo al final con: qué cambió, cómo lo pruebo, qué validaste.

## MIS PREFERENCIAS DE COMUNICACIÓN

- Respuestas concisas. Sin emojis salvo que yo los use.
- Si una decisión es ambigua, preguntame antes de implementar (usa AskUserQuestion). No asumas.
- Para exploraciones ("¿se puede hacer X?"), responde en 2-3 frases con una recomendación y los trade-offs. No implementes hasta que confirme.
- Para tareas claras, ejecuta directo sin preguntar.
- Cuando rompas algo grande, dilo arriba del mensaje, no al final.

## STACK / ENTORNO

- HTML + Vanilla JS (ES2020). Sin React, sin npm.
- Tailwind CSS + Lucide + SheetJS — todo vía CDN.
- Apps Script para backend.
- Sin tests automatizados (sólo validación de sintaxis con `node -e "new Function(...)"`).
- El usuario está en Windows, Chrome.

## SI TE PIDO "REDISEÑO COMPLETO"

Antes de hacer nada: lee `TECHNICAL_SPEC.md` y `CHANGELOG.md` completos, identifica qué features estoy usando hoy (mira los exports JSON adjuntos), y pregúntame qué quiero preservar exactamente. **No rehagas desde cero**. Rediseña sobre lo que ya funciona.

## EMPECEMOS

Confirma:
1. Que tienes el HTML, Code.gs, TECHNICAL_SPEC.md y CHANGELOG.md.
2. La versión que muestra el footer del HTML (debería ser `v4.7`).
3. La versión en `Code.gs` (`setMeta_('version', '3.12')`).

Después dime: qué cambio querés hacer.
