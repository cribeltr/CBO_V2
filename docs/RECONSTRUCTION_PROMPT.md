# Prompt de reconstrucción — Gestión MP 2026 v2.5

> Copia y pega este prompt en una nueva conversación de Claude Code, adjuntando el archivo `output/GestionMP_2026_corregido.html`. Eso te dejará en el mismo punto funcional sin tener que recrear nada.

---

## CONTEXTO

Soy Cristián Beltrán Oviedo, ingeniero biomédico del **Hospital HHHA**. Trabajo con una aplicación web de un solo archivo HTML llamada **"Gestión MP 2026"** que uso para gestionar el programa de mantención preventiva (MP) de equipos biomédicos.

El archivo adjunto **`GestionMP_2026_corregido.html`** es la **versión 2.5 estable** de esta app. Toda la lógica, estilos y datos de referencia están en ese único archivo (no hay build, no hay backend). Usa Tailwind CSS, SheetJS (XLSX) y Lucide icons vía CDN. La persistencia es `localStorage`.

## ESTADO ACTUAL FUNCIONAL

**Estoy satisfecho con todo lo implementado hasta v2.5.** No quiero re-hacer nada de lo que ya existe. Quiero **continuar desde aquí** agregando nuevas funcionalidades o ajustando detalles que te pediré.

## REGLAS IMPORTANTES

1. **No reescribas el archivo desde cero**. Lee primero y edita con Edit/Write puntuales.
2. **No cambies funcionalidades existentes** salvo que te lo pida explícitamente. Lo que está, funciona, y borrarlo me obliga a re-validar.
3. **No agregues "valores por defecto"** en los formularios de eventos para `resultado`, `ejecutor` o `estado` — eso causa riesgo de error grave (registrar "operativo" cuando es "no operativo"). Cada uno debe quedarse en blanco.
4. **Mantén el idioma español** en toda la UI y mensajes.
5. **Bump la versión** en el sidebar footer (`v2.X · datos locales`) y en `appVersion` del JSON de grabación cuando hagas cambios significativos.
6. **Sintaxis JS** verifícala antes de entregar con `node -e "new Function(<script>)"` para detectar errores.

## ARQUITECTURA (resumen)

### Storage keys (localStorage)
- `mp_app_state_v1` → `{ eventos, pendientes, agenda }`
- `mp_app_data_v1` → `{ equipos, verif, fileName, loadedAt }` (caché del archivo Excel)
- `mp_app_sync_v1` → `Array<string>` de marcadores "sincronizado"

### Vistas (`VIEWS = ['equipos','hoy','pendientes','verificacion','agenda']`)
1. **Buscar equipos** — tabla virtualizada con filtros + click → modal del equipo
2. **Hoy** — dashboard de pendientes del día
3. **Pendientes** — sección de discrepancias app↔archivo arriba + lista global con buckets
4. **Verificación de carga** — KPIs + tablas de códigos por mes (clickeables, con totales)
5. **Agenda** — Servicios clínicos + Centros de Responsabilidad

### Datos del archivo Excel
Archivo maestro: `Programacion_MP_2026.xlsm` con hojas:
- `PMP_2026` (programación, encabezados fila 7, códigos X/R/RA/PM)
- `Registro_MP-2026` (registro, pares P/R por mes, resultados Si/C1..C8/FS/Baja/NU)

Aliases de encabezados aceptados: `Fam` ≡ `Familia`, `ENU / Baja` ≡ `ENU/Baja`.

### Identificador de equipo
`key = inv:${inv}` si tiene N° Inventario válido, si no `key = id:${id}`.

### `effectiveRegRes(e)` — clave para entender la lógica
Mergea `regRes` del archivo con los eventos MP del usuario. El último por fecha gana (`>=`). Devuelve `{ results, userMonths, ejecutores }`.

## FEATURES DESTACADAS YA IMPLEMENTADAS

- **Botón "Guardar y siguiente"** en form de eventos (cierra todo y deja foco en buscador).
- **Atajos de fecha**: eventos (`Hoy / −1 sem / −1 mes`), pendientes (`Hoy / +1 sem / +1 mes`).
- **Toast con acción "Ver registro"** tras guardar.
- **Discrepancias app↔archivo** en Pendientes (Falta en archivo / Resultado distinto / Sólo en archivo).
- **Verificación clickeable** con fila "Total mes".
- **Fila "Ejecutor"** en tabla de programación del modal del equipo.
- **Agenda** con Supervisor, Encargado y Jefe del CR — visibles también dentro del modal del equipo.
- **Export XLSX** con 5 hojas (Registro / Eventos / Pendientes / Agenda-Contactos / Agenda-Centros).
- **Grabador de sesión** que descarga JSON con todos los clicks/cambios (útil para análisis posterior).
- **Loading overlay** durante parseo del XLSX.
- **Borrar datos** al pie del sidebar con confirmación por escrito ("ELIMINAR").

## EJECUTORES (lista fija en código)

```
Carlos Bahamondes Seguel, Cristián Beltrán Oviedo, Cristina Rozas Urrutia,
Daniel Díaz Neira, Ignacio Berner Bergara, Macarena Toledo, Marco Ulloa,
Matías Soazo Garrido, Personal externo, Ricardo Matus Aroca, Tito Millapán Riquelme
```

## CAUSAS (objeto en código)

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

## FLUJO DE TRABAJO HABITUAL

1. Cargar archivo `Programacion_MP_2026.xlsm` al inicio.
2. Buscar equipo por N° inventario.
3. Abrir modal → "Nuevo registro" → completar fecha (con atajos) + resultado + ejecutor + estado + observación.
4. "Guardar y siguiente" para enchufar próximo equipo, o "Guardar" si quedo en la ficha.
5. Crear pendientes para casos que requieren seguimiento (con fecha de compromiso).
6. Revisar discrepancias app↔archivo en Pendientes cuando re-cargo el archivo maestro.
7. Exportar Excel/JSON periódicamente para respaldo.

## QUÉ HACER AHORA

Cuando comencemos a trabajar, te pediré algo concreto (un cambio, un bug, una feature nueva). Aplica el cambio mínimo sobre el HTML actual, verifica sintaxis, bump versión, y entrégame el HTML actualizado.

Si te pido "audita el programa" o algo amplio, revisa primero qué hay antes de proponer cambios — no asumas que falta algo sin verificar.
