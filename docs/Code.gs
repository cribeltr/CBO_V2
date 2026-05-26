/**
 * Gestión MP 2026 — Backend en Google Apps Script
 *
 * Persistencia en una hoja de Google Sheets para que múltiples personas
 * puedan compartir los datos (en lugar de cada uno en su propio localStorage).
 *
 * ============================================================
 * INSTALACIÓN
 * ============================================================
 * 1. Crear una nueva hoja en https://sheets.google.com (nombre sugerido: "MP2026_Backend").
 * 2. Menú: Extensiones → Apps Script.
 * 3. Borrar el contenido del archivo Code.gs por defecto y PEGAR este código.
 * 4. Guardar (icono de disquete).
 * 5. Arriba seleccionar la función `setup` y presionar ▶ Ejecutar.
 *    - Te pedirá autorización la primera vez (cuenta Google, "Avanzado",
 *      "Ir a [proyecto] no verificada", Permitir).
 *    - Crea las 6 hojas con sus encabezados.
 * 6. Implementar: Implementar → Nueva implementación → Tipo: Aplicación web.
 *    - Descripción: "MP 2026 v1"
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier persona (o "Cualquier usuario con acceso a la cuenta de Google" si quieres más restricción)
 * 7. Copiar la URL del Web App (termina en /exec).
 *
 * ============================================================
 * USO DESDE EL HTML
 * ============================================================
 * const URL = 'https://script.google.com/macros/s/AKfycb.../exec';
 *
 * // Cargar TODO al iniciar la app:
 * fetch(URL)
 *   .then(r => r.json())
 *   .then(data => {
 *     state.eventos    = data.eventos    || {};
 *     state.pendientes = data.pendientes || {};
 *     state.agenda     = data.agenda     || { servicios:{}, centros:[] };
 *     syncMarked = new Set(data.syncMarked || []);
 *   });
 *
 * // Guardar TODO (sincronización completa, simple pero más lenta):
 * fetch(URL, {
 *   method: 'POST',
 *   body: JSON.stringify({
 *     action: 'replaceAll',
 *     payload: {
 *       eventos: state.eventos,
 *       pendientes: state.pendientes,
 *       agenda: state.agenda,
 *       syncMarked: [...syncMarked]
 *     }
 *   })
 * }).then(r=>r.json()).then(res => console.log(res));
 *
 * // Upsert puntual (más eficiente):
 * fetch(URL, { method:'POST',
 *   body: JSON.stringify({ action:'upsertEvento',
 *     payload:{ key:'inv:2-006472', evento: {...} } })
 * });
 *
 * NOTA SOBRE CORS:
 * Apps Script Web Apps no envían encabezados CORS estándar pero soportan
 * POSTs simples (text/plain). NO uses `Content-Type: application/json`
 * porque dispara preflight CORS que falla. JSON.stringify ya es texto plano
 * compatible — Apps Script lo recibe en `e.postData.contents`.
 *
 * ============================================================
 * ACCIONES SOPORTADAS
 * ============================================================
 * GET  /exec                               → devuelve todo el estado
 * POST { action:'replaceAll', payload }    → reemplaza todo
 * POST { action:'upsertEvento', payload:{key,evento} }
 * POST { action:'deleteEvento', payload:{id} }
 * POST { action:'upsertPendiente', payload:{key,pendiente} }
 * POST { action:'deletePendiente', payload:{id} }
 * POST { action:'upsertContacto', payload:{servicio,cargo,contacto} }  (contacto=null → borra)
 * POST { action:'upsertCR', payload:{cr} }
 * POST { action:'deleteCR', payload:{id} }
 * POST { action:'markSynced', payload:{marker} }
 * POST { action:'unmarkAllSynced' }
 * POST { action:'uploadFile', payload:{ inv, prefix, name, mime, base64 } } → {id,nombre,mime,size,url,uploadedAt}
 * POST { action:'deleteFile', payload:{ id } }
 * POST { action:'ping' }                   → health check
 *
 * Nota: los archivos adjuntos viven en Drive (carpeta MP2026_Adjuntos/[inv]/) y
 * la metadata (id, nombre, url, size, mime, uploadedAt) se guarda como JSON en
 * la columna "archivos" de Eventos y Pendientes. La hoja "Archivos" se deprecó
 * en v2.11 (no se borra automáticamente; si existe sólo se lee como fallback).
 */

const SS_ID = ''; // Vacío = usa la hoja donde está pegado el script
const SHEET_EVENTOS      = 'Eventos';
const SHEET_PENDIENTES   = 'Pendientes';
const SHEET_AGENDA_SERV     = 'Agenda_Servicios';
const SHEET_AGENDA_OTROS    = 'Agenda_Otros';
const SHEET_AGENDA_CR       = 'Agenda_Centros';
const SHEET_AGENDA_DIR      = 'Agenda_Directorio';
const SHEET_AGENDA_EMP      = 'Agenda_Empresas';
const SHEET_AGENDA_EMP_CON  = 'Agenda_Empresas_Contactos';
const SHEET_ARCHIVOS        = 'Archivos';
const SHEET_SYNC         = 'SyncMarked';
const SHEET_META         = 'Meta';

const HEADERS = {
  [SHEET_EVENTOS]:        ['ID','N° Inventario','Equipo','Servicio','Familia','Tipo de evento','Fecha','Resultado','Ejecutor','Estado del equipo','Empresa','Técnico (visita)','N° Envío','N° Cotización','N° OC','Folio','Folio guía','Observación','Adjuntos (URL)','Actualizado'],
  [SHEET_PENDIENTES]:     ['ID','N° Inventario','Equipo','Servicio','Descripción','Fecha creación','Fecha compromiso','Próximo recordatorio','Fecha cierre','Ejecutor','Estado','Tareas','Seguimientos','Adjuntos (URL)','Actualizado'],
  [SHEET_AGENDA_SERV]:    ['servicio','cargo','nombre','email','anexo','celular'],
  [SHEET_AGENDA_OTROS]:   ['servicio','id','rol','nombre','email','anexo','celular'],
  [SHEET_AGENDA_CR]:      ['id','nombre','jefe_nombre','jefe_email','jefe_anexo','jefe_celular','servicios'],
  [SHEET_AGENDA_DIR]:     ['id','categoria','organizacion','nombre','email','telefono','notas'],
  [SHEET_AGENDA_EMP]:     ['id','nombre','direccion'],
  [SHEET_AGENDA_EMP_CON]: ['empresa_id','id','nombre','cargo','email','telefono','celular'],
  [SHEET_SYNC]:           ['marker','addedAt'],
  [SHEET_META]:           ['key','value']
};
/* Hojas que se ocultan al ejecutar migrate (son internas/técnicas) */
const HIDDEN_SHEETS = [SHEET_AGENDA_SERV, SHEET_AGENDA_OTROS, SHEET_AGENDA_CR, SHEET_AGENDA_DIR, SHEET_AGENDA_EMP, SHEET_AGENDA_EMP_CON, SHEET_SYNC, SHEET_META];
/* Hojas amigables que se reconstruyen desde el cliente en cada sync */
const SHEET_EQ_OPERATIVOS    = 'Equipos - Operativos';
const SHEET_EQ_NO_OPERATIVOS = 'Equipos - No operativos';
const SHEET_EQ_ST            = 'Equipos - En servicio técnico';
const SHEET_AGENDA_FRIENDLY  = 'Agenda';
const SHEET_EMPRESAS_FRIENDLY= 'Empresas';
const FRIENDLY_HEADERS = {
  [SHEET_EQ_OPERATIVOS]:    ['N° Inventario','Equipo','Servicio','Familia','Marca','Modelo','Serie','Desde','Días operativo'],
  [SHEET_EQ_NO_OPERATIVOS]: ['N° Inventario','Equipo','Servicio','Familia','Marca','Modelo','Serie','Desde','Días no operativo','Alerta'],
  [SHEET_EQ_ST]:            ['N° Inventario','Equipo','Servicio','Familia','Marca','Modelo','Serie','Desde envío','Días en ST','Alerta'],
  [SHEET_AGENDA_FRIENDLY]:  ['Servicio','Cargo / Rol','Nombre','Correo','Anexo','Celular','Centro de Responsabilidad'],
  [SHEET_EMPRESAS_FRIENDLY]:['Empresa','Dirección','Contacto','Cargo','Correo','Teléfono','Celular']
};

function getSS_() {
  return SS_ID ? SpreadsheetApp.openById(SS_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

/* ============================================================
   SETUP — Ejecutar UNA vez para crear las hojas
   (Sin alerts UI: se cuelgan en algunos contextos. Mira el "Registro de ejecución")
   ============================================================ */
function setup() {
  Logger.log('Setup: iniciando...');
  const ss = getSS_();
  if (!ss){
    Logger.log('ERROR: no hay hoja activa. ¿Estás ejecutando desde "Extensiones → Apps Script" dentro de una Hoja de Google Sheets? Si entraste directo a script.google.com, abre primero una hoja y crea el script desde ahí.');
    throw new Error('No se encontró Spreadsheet. Abra primero una Hoja de Google Sheets y use Extensiones → Apps Script.');
  }
  Logger.log('Setup: hoja "' + ss.getName() + '" detectada (id=' + ss.getId() + ')');
  Object.keys(HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh){
      sh = ss.insertSheet(name);
      Logger.log('Setup: creada hoja "' + name + '"');
    } else {
      sh.clear();
      Logger.log('Setup: limpiada hoja existente "' + name + '"');
    }
    sh.getRange(1, 1, 1, HEADERS[name].length)
      .setValues([HEADERS[name]])
      .setFontWeight('bold')
      .setBackground('#f1f5f9');
    sh.setFrozenRows(1);
  });
  setMeta_('setupAt', new Date().toISOString());
  setMeta_('version', '1.0');
  Logger.log('Setup completo. ' + Object.keys(HEADERS).length + ' hojas creadas: ' + Object.keys(HEADERS).join(', '));
  return { ok: true, sheets: Object.keys(HEADERS) };
}

/**
 * migrate() — crea SÓLO las hojas que faltan, sin tocar las existentes.
 * Útil al actualizar a v2.10 (añadir Agenda_Otros y Agenda_Directorio sin perder datos).
 * Ejecutar desde el editor: seleccionar "migrate" → ▶ Ejecutar.
 */
function migrate() {
  Logger.log('Migrate: iniciando (no destructivo)...');
  const ss = getSS_();
  if (!ss){ throw new Error('No se encontró Spreadsheet'); }
  let creadas = 0, colsAgregadas = 0;
  Object.keys(HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh){
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, HEADERS[name].length)
        .setValues([HEADERS[name]])
        .setFontWeight('bold')
        .setBackground('#f1f5f9');
      sh.setFrozenRows(1);
      Logger.log('Migrate: creada hoja "' + name + '"');
      creadas++;
      return;
    }
    /* Hoja existe: verificar que tenga TODAS las columnas esperadas; si faltan, agregarlas al final */
    const want = HEADERS[name];
    const lastCol = Math.max(1, sh.getLastColumn());
    const cur = sh.getRange(1, 1, 1, Math.max(lastCol, want.length)).getValues()[0];
    const missing = [];
    want.forEach((h, i) => {
      if ((cur[i] || '') !== h) missing.push({ idx: i, name: h });
    });
    if (missing.length){
      /* Reescribir la fila de encabezados completa para asegurar orden correcto */
      sh.getRange(1, 1, 1, want.length)
        .setValues([want])
        .setFontWeight('bold')
        .setBackground('#f1f5f9');
      Logger.log('Migrate: actualizadas columnas de "' + name + '" (' + missing.map(m=>m.name).join(', ') + ')');
      colsAgregadas += missing.length;
    } else {
      Logger.log('Migrate: hoja "' + name + '" sin cambios');
    }
  });
  /* Ocultar hojas técnicas también al migrar */
  hideSystemSheets_();
  Logger.log('Migrate completo. ' + creadas + ' hoja(s) nueva(s), ' + colsAgregadas + ' columna(s) agregada(s). Hojas técnicas ocultadas.');
  return { ok: true, created: creadas, columnsAdded: colsAgregadas };
}

/* ============================================================
   ENDPOINTS WEB APP
   ============================================================ */
function doGet(e) {
  return jsonOut_(readAll_());
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); }
  catch(err) { return jsonOut_({ ok:false, error:'JSON inválido' }); }

  const action  = body.action || '';
  const payload = body.payload || {};

  try {
    let result;
    switch (action) {
      case 'replaceAll':       result = replaceAll_(payload); break;
      case 'upsertEvento':     result = upsertEvento_(payload); break;
      case 'deleteEvento':     result = deleteEvento_(payload); break;
      case 'upsertPendiente':  result = upsertPendiente_(payload); break;
      case 'deletePendiente':  result = deletePendiente_(payload); break;
      case 'upsertContacto':   result = upsertContacto_(payload); break;
      case 'upsertCR':         result = upsertCR_(payload); break;
      case 'deleteCR':         result = deleteCR_(payload); break;
      case 'markSynced':       result = markSynced_(payload); break;
      case 'unmarkAllSynced':  result = unmarkAllSynced_(); break;
      case 'uploadFile':       result = uploadFile_(payload); break;
      case 'deleteFile':       result = deleteFile_(payload); break;
      case 'ping':             result = { ok:true, pong:new Date().toISOString() }; break;
      default: return jsonOut_({ ok:false, error: 'Acción desconocida: '+action });
    }
    return jsonOut_({ ok:true, result });
  } catch(err) {
    return jsonOut_({ ok:false, error: String(err && err.message || err) });
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   LECTURA
   ============================================================ */
function readAll_() {
  return {
    eventos:    readEventos_(),
    pendientes: readPendientes_(),
    agenda:     readAgenda_(),
    syncMarked: readSync_(),
    serverTime: new Date().toISOString()
  };
}

function readEventos_() {
  const sh = getSS_().getSheetByName(SHEET_EVENTOS);
  if (!sh || sh.getLastRow() < 2) return {};
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const out = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const key = row[1];
    if (!key) continue;
    const obj = {};
    headers.forEach((h, j) => {
      if (h === 'key' || h === 'updatedAt') return;
      let v = row[j];
      if (h === 'archivos') {
        try { v = v ? JSON.parse(v) : []; } catch(_) { v = []; }
      } else if (v === '') {
        v = null;
      }
      obj[h] = v;
    });
    out[key] = out[key] || [];
    out[key].push(obj);
  }
  /* Compatibilidad: si quedan adjuntos viejos en la hoja "Archivos" (legacy) y el evento no tiene archivos en columna, los anexa */
  attachArchivosLegacy_(out, 'evento');
  return out;
}

function readPendientes_() {
  const sh = getSS_().getSheetByName(SHEET_PENDIENTES);
  if (!sh || sh.getLastRow() < 2) return {};
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const out = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const key = row[1];
    if (!key) continue;
    const obj = {};
    headers.forEach((h, j) => {
      if (h === 'key' || h === 'updatedAt') return;
      let v = row[j];
      if (h === 'tareas' || h === 'actualizaciones' || h === 'archivos') {
        try { v = v ? JSON.parse(v) : []; } catch(_) { v = []; }
      } else if (v === '') {
        v = null;
      }
      obj[h] = v;
    });
    out[key] = out[key] || [];
    out[key].push(obj);
  }
  attachArchivosLegacy_(out, 'pendiente');
  return out;
}

function attachArchivosLegacy_(out, parentType) {
  /* Lee la hoja "Archivos" (legacy v2.10) sólo si el item no tiene archivos en su columna nueva */
  const sh = getSS_().getSheetByName(SHEET_ARCHIVOS);
  if (!sh || sh.getLastRow() < 2) return;
  const data = sh.getDataRange().getValues();
  const byId = {};
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (r[0] !== parentType) continue;
    const pid = r[1]; if (!pid) continue;
    (byId[pid] = byId[pid] || []).push({
      id: r[3] || '', nombre: r[4] || '', mime: r[5] || '',
      size: typeof r[6] === 'number' ? r[6] : parseInt(r[6]||0, 10) || 0,
      url: r[7] || '', uploadedAt: r[8] || ''
    });
  }
  Object.keys(out).forEach(k => {
    out[k].forEach(item => {
      if ((!item.archivos || !item.archivos.length) && byId[item.id]) {
        item.archivos = byId[item.id];
      }
    });
  });
}

function readAgenda_() {
  const ssh = getSS_().getSheetByName(SHEET_AGENDA_SERV);
  const osh = getSS_().getSheetByName(SHEET_AGENDA_OTROS);
  const csh = getSS_().getSheetByName(SHEET_AGENDA_CR);
  const dsh = getSS_().getSheetByName(SHEET_AGENDA_DIR);
  const servicios = {};
  if (ssh && ssh.getLastRow() >= 2) {
    const data = ssh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const [servicio, cargo, nombre, email, anexo, celular] = data[i];
      if (!servicio || !cargo) continue;
      if (!servicios[servicio]) servicios[servicio] = { supervisor: null, encargado: null, otros: [] };
      servicios[servicio][cargo] = {
        nombre: nombre || '',
        email: email || '',
        anexo: anexo ? String(anexo) : '',
        celular: celular ? String(celular) : ''
      };
    }
  }
  if (osh && osh.getLastRow() >= 2) {
    const data = osh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const [servicio, id, rol, nombre, email, anexo, celular] = data[i];
      if (!servicio || !id) continue;
      if (!servicios[servicio]) servicios[servicio] = { supervisor: null, encargado: null, otros: [] };
      if (!servicios[servicio].otros) servicios[servicio].otros = [];
      servicios[servicio].otros.push({
        id: String(id), rol: rol||'', nombre: nombre||'', email: email||'',
        anexo: anexo?String(anexo):'', celular: celular?String(celular):''
      });
    }
  }
  /* Asegurar que todo servicio tenga otros: [] */
  Object.keys(servicios).forEach(k=>{ if (!servicios[k].otros) servicios[k].otros = []; });
  const centros = [];
  if (csh && csh.getLastRow() >= 2) {
    const data = csh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const [id, nombre, jn, je, ja, jc, servs] = data[i];
      if (!id || !nombre) continue;
      const jefe = (jn || je || ja || jc)
        ? { nombre: jn||'', email: je||'', anexo: ja?String(ja):'', celular: jc?String(jc):'' }
        : null;
      centros.push({
        id: String(id),
        nombre: String(nombre),
        jefe,
        servicios: servs ? String(servs).split('|').map(s=>s.trim()).filter(Boolean) : []
      });
    }
  }
  const directorio = [];
  if (dsh && dsh.getLastRow() >= 2) {
    const data = dsh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const [id, categoria, organizacion, nombre, email, telefono, notas] = data[i];
      if (!id) continue;
      directorio.push({
        id: String(id),
        categoria: categoria || '',
        organizacion: organizacion || '',
        nombre: nombre || '',
        email: email || '',
        telefono: telefono ? String(telefono) : '',
        notas: notas || ''
      });
    }
  }
  /* Empresas (Agenda_Empresas + Agenda_Empresas_Contactos) */
  const empresas = [];
  const esh = getSS_().getSheetByName(SHEET_AGENDA_EMP);
  const ecsh = getSS_().getSheetByName(SHEET_AGENDA_EMP_CON);
  const empById = {};
  if (esh && esh.getLastRow() >= 2) {
    const data = esh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const [id, nombre, direccion] = data[i];
      if (!id) continue;
      const e = { id: String(id), nombre: nombre||'', direccion: direccion||'', contactos: [] };
      empresas.push(e); empById[e.id] = e;
    }
  }
  if (ecsh && ecsh.getLastRow() >= 2) {
    const data = ecsh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const [empresa_id, id, nombre, cargo, email, telefono, celular] = data[i];
      if (!empresa_id || !id) continue;
      const e = empById[empresa_id];
      if (!e) continue;
      e.contactos.push({
        id: String(id), nombre: nombre||'', cargo: cargo||'',
        email: email||'', telefono: telefono?String(telefono):'', celular: celular?String(celular):''
      });
    }
  }
  return { servicios, centros, directorio, empresas };
}

function readSync_() {
  const sh = getSS_().getSheetByName(SHEET_SYNC);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues().map(r=>r[0]).filter(Boolean);
}

/* ============================================================
   ESCRITURA: REEMPLAZO COMPLETO
   ============================================================ */
function keyToNInv_(key){
  if (!key) return '';
  const s = String(key);
  if (s.indexOf('inv:') === 0) return s.slice(4);
  if (s.indexOf('id:') === 0)  return 'ID-' + s.slice(3);
  return s;
}

function replaceAll_(payload) {
  const ss = getSS_();
  const now = new Date().toISOString();
  const lookup = payload.equiposLookup || {};
  const empMap = {};
  ((payload.agenda && payload.agenda.empresas) || []).forEach(e=>{
    empMap[e.id] = e;
    (e.contactos||[]).forEach(c=>{ empMap[e.id+'|'+c.id] = c; });
  });

  /* Verificar y forzar encabezados antes de escribir (defensivo: si los headers
     quedaron desfasados de una migración previa, los re-alineamos) */
  ensureHeadersAligned_(ss);

  if (payload.eventos) {
    const sh = ss.getSheetByName(SHEET_EVENTOS);
    resetSheet_(sh, HEADERS[SHEET_EVENTOS]);
    const rows = [];
    const formulas = []; /* [{row, col, formula}] */
    Object.entries(payload.eventos).forEach(([key, arr]) => {
      const eqInfo = lookup[key] || {};
      const nInv   = eqInfo.nInv || keyToNInv_(key);
      (arr||[]).forEach(ev => {
        let empresaLbl = ev.empresa || '';
        let tecnicoLbl = '';
        if (ev.empresaId && empMap[ev.empresaId]) empresaLbl = empMap[ev.empresaId].nombre || empresaLbl;
        if (ev.contactoId && ev.empresaId){
          const c = empMap[ev.empresaId+'|'+ev.contactoId];
          if (c) tecnicoLbl = c.nombre + (c.cargo ? ' · '+c.cargo : '');
        }
        const tipoLbl = ({mp:'Mantención preventiva',visita_tecnica:'Visita técnica',cotizacion:'Cotización',oc:'Orden de Compra',envio:'Envío a ST',solicitud:'Solicitud de trabajo',recepcion:'Recepción',reparacion:'Reparación'}[ev.tipo]) || ev.tipo;
        const adjuntos = ev.archivos || [];
        rows.push([
          ev.id||'', nInv, eqInfo.equipo||'', eqInfo.servicio||'', eqInfo.fam||'',
          tipoLbl, ev.fecha||'', ev.resultado||'', ev.ejecutor||'', ev.estado||'',
          empresaLbl, tecnicoLbl, ev.nEnvio||'', ev.nCotizacion||'', ev.nOC||'',
          ev.folio||'', ev.folioGuia||'',
          ev.observacion || ev.comentario || '',
          '',  /* Adjuntos URL: se escribe como fórmula después */
          now
        ]);
        if (adjuntos.length){
          formulas.push({ rowIdx: rows.length - 1, archivos: adjuntos });
        }
      });
    });
    if (rows.length){
      sh.getRange(2, 1, rows.length, HEADERS[SHEET_EVENTOS].length).setValues(rows);
      /* Adjuntos en columna "Adjuntos (URL)" (índice 19, 1-based) — RichTextValue
         para crear links clickeables sin depender de fórmulas / locale. */
      formulas.forEach(f => setAdjuntosCell_(sh, 2 + f.rowIdx, 19, f.archivos));
    }
  }

  if (payload.pendientes) {
    const sh = ss.getSheetByName(SHEET_PENDIENTES);
    resetSheet_(sh, HEADERS[SHEET_PENDIENTES]);
    const rows = [];
    const formulas = [];
    Object.entries(payload.pendientes).forEach(([key, arr]) => {
      const eqInfo = lookup[key] || {};
      const nInv   = eqInfo.nInv || keyToNInv_(key);
      (arr||[]).forEach(p => {
        const tareasTxt = (p.tareas||[]).map(t=>`[${t.estado==='cerrado'?'x':' '}] ${t.descripcion||''}`).join('\n');
        const segsTxt = (p.actualizaciones||[]).slice().sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).map(a=>{
          const tipoLbl = a.tipo ? `[${a.tipo}]` : '';
          const cont = a.contactadoA ? ` → ${a.contactadoA}` : '';
          return `${a.fecha||''} ${tipoLbl}${cont}: ${a.texto||''}`;
        }).join('\n');
        const adjuntos = p.archivos || [];
        rows.push([
          p.id||'', nInv, eqInfo.equipo||'', eqInfo.servicio||'',
          p.descripcion||'', p.fecha||'', p.fechaCompromiso||'', p.proximoRecordatorio||'', p.fechaCierre||'',
          p.ejecutor||'', p.estado||'', tareasTxt, segsTxt, '', now
        ]);
        if (adjuntos.length){
          formulas.push({ rowIdx: rows.length - 1, archivos: adjuntos });
        }
      });
    });
    if (rows.length){
      sh.getRange(2, 1, rows.length, HEADERS[SHEET_PENDIENTES].length).setValues(rows);
      /* Adjuntos columna 14 (1-based) — RichTextValue */
      formulas.forEach(f => setAdjuntosCell_(sh, 2 + f.rowIdx, 14, f.archivos));
    }
  }

  if (payload.agenda && payload.agenda.servicios) {
    const sh = ss.getSheetByName(SHEET_AGENDA_SERV);
    resetSheet_(sh, HEADERS[SHEET_AGENDA_SERV]);
    const rows = [];
    Object.entries(payload.agenda.servicios).forEach(([srv, data]) => {
      ['supervisor','encargado'].forEach(cargo => {
        const c = data && data[cargo];
        if (c && (c.nombre || c.email || c.anexo || c.celular)) {
          rows.push([srv, cargo, c.nombre||'', c.email||'', c.anexo||'', c.celular||'']);
        }
      });
    });
    if (rows.length) sh.getRange(2, 1, rows.length, HEADERS[SHEET_AGENDA_SERV].length).setValues(rows);
    /* Otros contactos */
    const osh = ss.getSheetByName(SHEET_AGENDA_OTROS);
    if (osh){
      resetSheet_(osh, HEADERS[SHEET_AGENDA_OTROS]);
      const orows = [];
      Object.entries(payload.agenda.servicios).forEach(([srv, data]) => {
        ((data && data.otros) || []).forEach(o => {
          if (o && (o.nombre || o.email || o.anexo || o.celular || o.rol)){
            orows.push([srv, o.id || '', o.rol || '', o.nombre||'', o.email||'', o.anexo||'', o.celular||'']);
          }
        });
      });
      if (orows.length) osh.getRange(2, 1, orows.length, HEADERS[SHEET_AGENDA_OTROS].length).setValues(orows);
    }
  }

  if (payload.agenda && payload.agenda.centros) {
    const sh = ss.getSheetByName(SHEET_AGENDA_CR);
    resetSheet_(sh, HEADERS[SHEET_AGENDA_CR]);
    const rows = payload.agenda.centros.map(cr => [
      cr.id, cr.nombre,
      cr.jefe ? (cr.jefe.nombre||'')  : '',
      cr.jefe ? (cr.jefe.email||'')   : '',
      cr.jefe ? (cr.jefe.anexo||'')   : '',
      cr.jefe ? (cr.jefe.celular||'') : '',
      (cr.servicios||[]).join('|')
    ]);
    if (rows.length) sh.getRange(2, 1, rows.length, HEADERS[SHEET_AGENDA_CR].length).setValues(rows);
  }

  if (payload.agenda && Array.isArray(payload.agenda.directorio)) {
    const sh = ss.getSheetByName(SHEET_AGENDA_DIR);
    if (sh){
      resetSheet_(sh, HEADERS[SHEET_AGENDA_DIR]);
      const rows = payload.agenda.directorio.map(d=>[
        d.id || '', d.categoria || '', d.organizacion || '', d.nombre || '',
        d.email || '', d.telefono || '', d.notas || ''
      ]);
      if (rows.length) sh.getRange(2, 1, rows.length, HEADERS[SHEET_AGENDA_DIR].length).setValues(rows);
    }
  }

  if (payload.agenda && Array.isArray(payload.agenda.empresas)) {
    const eshW = ss.getSheetByName(SHEET_AGENDA_EMP);
    const cshW = ss.getSheetByName(SHEET_AGENDA_EMP_CON);
    if (eshW){
      resetSheet_(eshW, HEADERS[SHEET_AGENDA_EMP]);
      const eRows = payload.agenda.empresas.map(e=>[ e.id||'', e.nombre||'', e.direccion||'' ]);
      if (eRows.length) eshW.getRange(2, 1, eRows.length, HEADERS[SHEET_AGENDA_EMP].length).setValues(eRows);
    }
    if (cshW){
      resetSheet_(cshW, HEADERS[SHEET_AGENDA_EMP_CON]);
      const cRows = [];
      payload.agenda.empresas.forEach(e=>{
        (e.contactos||[]).forEach(c=>{
          cRows.push([ e.id||'', c.id||'', c.nombre||'', c.cargo||'', c.email||'', c.telefono||'', c.celular||'' ]);
        });
      });
      if (cRows.length) cshW.getRange(2, 1, cRows.length, HEADERS[SHEET_AGENDA_EMP_CON].length).setValues(cRows);
    }
  }

  if (payload.syncMarked) {
    const sh = ss.getSheetByName(SHEET_SYNC);
    resetSheet_(sh, HEADERS[SHEET_SYNC]);
    const rows = (payload.syncMarked||[]).map(m => [m, now]);
    if (rows.length) sh.getRange(2, 1, rows.length, HEADERS[SHEET_SYNC].length).setValues(rows);
  }

  /* Reconstruir vistas amigables computadas (siempre, en cada sync) */
  rebuildFriendlyViews_(payload);
  /* Mantener ocultas las hojas técnicas */
  hideSystemSheets_();

  setMeta_('lastReplaceAll', now);
  return { wrote: true, at: now };
}

function resetSheet_(sh, headers) {
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#f1f5f9');
}

function adjuntosForCell_(archivos){
  /* Devuelve un objeto descriptor para setAdjuntosCell_ — no usa fórmulas para
     ser locale-independiente. */
  if (!archivos || !archivos.length) return null;
  return archivos;  /* simplemente pasa el array */
}

function setAdjuntosCell_(sh, row, col, archivos){
  /* Crea links clickeables usando RichTextValue (no depende de locale español/chileno
     que requiere ';' en fórmulas). Sirve para 1 o N archivos. */
  const range = sh.getRange(row, col);
  if (!archivos || !archivos.length){
    range.clearContent();
    return;
  }
  let text = '';
  const ranges = [];
  archivos.forEach((a, idx) => {
    const name = String(a.nombre || 'archivo');
    const url  = String(a.url || '');
    const start = text.length;
    text += name;
    const end = text.length;
    if (url) ranges.push({ start, end, url });
    if (idx < archivos.length - 1) text += '\n';
  });
  try {
    const builder = SpreadsheetApp.newRichTextValue().setText(text);
    ranges.forEach(r => { builder.setLinkUrl(r.start, r.end, r.url); });
    range.setRichTextValue(builder.build());
  } catch(err) {
    /* Fallback: si por alguna razón RichText falla, escribir texto + URL como plain */
    Logger.log('setAdjuntosCell_ fallback: ' + err.message);
    const txt = archivos.map(a => `${a.nombre||'archivo'}: ${a.url||''}`).join('\n');
    range.setValue(txt);
  }
}

/* ============================================================
   ESCRITURA: UPSERT/DELETE PUNTUAL
   ============================================================ */
function findRowById_(sh, id) {
  if (!sh || sh.getLastRow() < 2) return -1;
  const ids = sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function upsertEvento_({ key, evento }) {
  if (!key || !evento || !evento.id) throw new Error('Falta key o evento.id');
  const sh = getSS_().getSheetByName(SHEET_EVENTOS);
  const headers = HEADERS[SHEET_EVENTOS];
  const row = headers.map(h => {
    if (h === 'key')       return key;
    if (h === 'updatedAt') return new Date().toISOString();
    return evento[h] != null ? evento[h] : '';
  });
  const existing = findRowById_(sh, evento.id);
  if (existing > 0) sh.getRange(existing, 1, 1, headers.length).setValues([row]);
  else              sh.appendRow(row);
  return { id: evento.id, updated: existing > 0 };
}

function deleteEvento_({ id }) {
  if (!id) throw new Error('Falta id');
  const sh = getSS_().getSheetByName(SHEET_EVENTOS);
  const r = findRowById_(sh, id);
  if (r > 0) sh.deleteRow(r);
  return { deleted: r > 0 };
}

function upsertPendiente_({ key, pendiente }) {
  if (!key || !pendiente || !pendiente.id) throw new Error('Falta key o pendiente.id');
  const sh = getSS_().getSheetByName(SHEET_PENDIENTES);
  const headers = HEADERS[SHEET_PENDIENTES];
  const row = headers.map(h => {
    if (h === 'key')       return key;
    if (h === 'updatedAt') return new Date().toISOString();
    if (h === 'tareas')    return JSON.stringify(pendiente.tareas || []);
    if (h === 'actualizaciones') return JSON.stringify(pendiente.actualizaciones || []);
    return pendiente[h] != null ? pendiente[h] : '';
  });
  const existing = findRowById_(sh, pendiente.id);
  if (existing > 0) sh.getRange(existing, 1, 1, headers.length).setValues([row]);
  else              sh.appendRow(row);
  return { id: pendiente.id, updated: existing > 0 };
}

function deletePendiente_({ id }) {
  if (!id) throw new Error('Falta id');
  const sh = getSS_().getSheetByName(SHEET_PENDIENTES);
  const r = findRowById_(sh, id);
  if (r > 0) sh.deleteRow(r);
  return { deleted: r > 0 };
}

function upsertContacto_({ servicio, cargo, contacto }) {
  if (!servicio || !cargo) throw new Error('Falta servicio o cargo');
  const sh = getSS_().getSheetByName(SHEET_AGENDA_SERV);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === servicio && data[i][1] === cargo) {
      if (!contacto) { sh.deleteRow(i+1); return { deleted: true }; }
      sh.getRange(i+1, 1, 1, 6).setValues([[servicio, cargo,
        contacto.nombre||'', contacto.email||'', contacto.anexo||'', contacto.celular||'']]);
      return { updated: true };
    }
  }
  if (contacto) {
    sh.appendRow([servicio, cargo,
      contacto.nombre||'', contacto.email||'', contacto.anexo||'', contacto.celular||'']);
    return { inserted: true };
  }
  return { noop: true };
}

function upsertCR_({ cr }) {
  if (!cr || !cr.id) throw new Error('Falta cr.id');
  const sh = getSS_().getSheetByName(SHEET_AGENDA_CR);
  const row = [
    cr.id, cr.nombre,
    cr.jefe ? (cr.jefe.nombre||'')  : '',
    cr.jefe ? (cr.jefe.email||'')   : '',
    cr.jefe ? (cr.jefe.anexo||'')   : '',
    cr.jefe ? (cr.jefe.celular||'') : '',
    (cr.servicios||[]).join('|')
  ];
  const existing = findRowById_(sh, cr.id);
  if (existing > 0) sh.getRange(existing, 1, 1, 7).setValues([row]);
  else              sh.appendRow(row);
  return { id: cr.id, updated: existing > 0 };
}

function deleteCR_({ id }) {
  if (!id) throw new Error('Falta id');
  const sh = getSS_().getSheetByName(SHEET_AGENDA_CR);
  const r = findRowById_(sh, id);
  if (r > 0) sh.deleteRow(r);
  return { deleted: r > 0 };
}

function markSynced_({ marker }) {
  if (!marker) throw new Error('Falta marker');
  const sh = getSS_().getSheetByName(SHEET_SYNC);
  if (sh.getLastRow() >= 2) {
    const data = sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues();
    for (let i = 0; i < data.length; i++) if (data[i][0] === marker) return { exists: true };
  }
  sh.appendRow([marker, new Date().toISOString()]);
  return { inserted: true };
}

function unmarkAllSynced_() {
  const sh = getSS_().getSheetByName(SHEET_SYNC);
  const last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);
  return { cleared: true };
}

/* ============================================================
   META
   ============================================================ */
function setMeta_(k, v) {
  const sh = getSS_().getSheetByName(SHEET_META);
  if (!sh) return;
  if (sh.getLastRow() >= 2) {
    const data = sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === k) { sh.getRange(i+2, 2).setValue(v); return; }
    }
  }
  sh.appendRow([k, v]);
}

/* ============================================================
   ADJUNTOS (Google Drive)
   - Carpeta raíz: MP2026_Adjuntos
   - Subcarpeta por inventario
   - Archivos públicos con link (ANYONE_WITH_LINK)
   ============================================================ */
const ATTACHMENTS_ROOT_NAME = 'MP2026_Adjuntos';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function getOrCreateRootFolder_() {
  /* Reutilizar id guardado en Meta si existe (más rápido y robusto) */
  const sh = getSS_().getSheetByName(SHEET_META);
  let storedId = null;
  if (sh && sh.getLastRow() >= 2) {
    const data = sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === 'attachmentsFolderId') { storedId = data[i][1]; break; }
    }
  }
  if (storedId) {
    try {
      const f = DriveApp.getFolderById(storedId);
      if (!f.isTrashed()) return f;
    } catch(_) { /* recreamos abajo */ }
  }
  const folders = DriveApp.getFoldersByName(ATTACHMENTS_ROOT_NAME);
  let folder;
  if (folders.hasNext()) folder = folders.next();
  else folder = DriveApp.createFolder(ATTACHMENTS_ROOT_NAME);
  setMeta_('attachmentsFolderId', folder.getId());
  return folder;
}

function getOrCreateInvFolder_(inv) {
  const root = getOrCreateRootFolder_();
  const name = String(inv || 'sin-inventario').replace(/[\/\\:*?"<>|]/g, '_').slice(0, 80);
  const sub = root.getFoldersByName(name);
  if (sub.hasNext()) return sub.next();
  return root.createFolder(name);
}

function uploadFile_({ inv, prefix, name, mime, base64 }) {
  if (!inv)    throw new Error('Falta inv');
  if (!base64) throw new Error('Falta contenido base64');
  /* Soporta "data:...;base64,XXXX" o sólo "XXXX" */
  const idx = String(base64).indexOf(',');
  const data = idx >= 0 ? base64.slice(idx + 1) : base64;
  const decoded = Utilities.base64Decode(data);
  if (decoded.length > MAX_FILE_SIZE_BYTES) {
    throw new Error('Archivo excede el límite de ' + (MAX_FILE_SIZE_BYTES/1024/1024) + ' MB');
  }
  const blob = Utilities.newBlob(decoded, mime || 'application/octet-stream', name || 'archivo');
  const folder = getOrCreateInvFolder_(inv);
  const safeBase = String(name || 'archivo').replace(/[\/\\:*?"<>|]/g, '_').slice(0, 120);
  const safeName = (prefix ? prefix + '_' : '') + safeBase;
  const file = folder.createFile(blob).setName(safeName);
  /* Compartir como público con link (cualquiera puede ver) */
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch(err) {
    /* Algunas cuentas restringen ANYONE_WITH_LINK; el archivo igual queda creado */
    Logger.log('No se pudo poner público: ' + err.message);
  }
  return {
    id: file.getId(),
    nombre: file.getName(),
    mime: file.getMimeType(),
    size: file.getSize(),
    url: file.getUrl(),
    uploadedAt: new Date().toISOString()
  };
}

function deleteFile_({ id }) {
  if (!id) throw new Error('Falta id');
  try {
    DriveApp.getFileById(id).setTrashed(true);
    return { trashed: true };
  } catch(err) {
    return { ok:false, error: err.message };
  }
}

/* ============================================================
   VISTAS AMIGABLES (computadas en cada sync)
   ============================================================ */
function ensureFriendlySheet_(name){
  const ss = getSS_();
  let sh = ss.getSheetByName(name);
  if (!sh){
    sh = ss.insertSheet(name);
  }
  const headers = FRIENDLY_HEADERS[name];
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#f1f5f9');
  sh.setFrozenRows(1);
  return sh;
}

function rebuildFriendlyViews_(payload){
  const lookup = payload.equiposLookup || {};
  const operativos = [];
  const noOperativos = [];
  const enST = [];
  Object.keys(lookup).forEach(key => {
    const eq = lookup[key];
    const ext = eq.estadoExtended || {};
    const row = [
      eq.nInv||'', eq.equipo||'', eq.servicio||'', eq.fam||'',
      eq.marca||'', eq.modelo||'', eq.serie||''
    ];
    if (ext.estado === 'operativo'){
      operativos.push([...row, ext.desde||'', ext.dias != null ? ext.dias : '']);
    } else if (ext.estado === 'no operativo'){
      const alerta = ext.dias >= 90 ? '🔴 +90 días' : ext.dias >= 60 ? '🔴 +60 días' : ext.dias >= 30 ? '🟠 +30 días' : '';
      noOperativos.push([...row, ext.desde||'', ext.dias != null ? ext.dias : '', alerta]);
    } else if (ext.estado === 'servicio_tecnico'){
      const alerta = ext.dias >= 90 ? '🔴 +90 días' : ext.dias >= 60 ? '🔴 +60 días' : ext.dias >= 30 ? '🟠 +30 días' : '';
      enST.push([...row, ext.desde||'', ext.dias != null ? ext.dias : '', alerta]);
    }
  });
  /* Ordenar: no operativos y ST por más días primero */
  noOperativos.sort((a,b)=> (b[8]||0) - (a[8]||0));
  enST.sort((a,b)=> (b[8]||0) - (a[8]||0));
  operativos.sort((a,b)=> String(a[1]||'').localeCompare(String(b[1]||'')));

  const wOp  = ensureFriendlySheet_(SHEET_EQ_OPERATIVOS);
  if (operativos.length) wOp.getRange(2, 1, operativos.length, FRIENDLY_HEADERS[SHEET_EQ_OPERATIVOS].length).setValues(operativos);
  const wNo  = ensureFriendlySheet_(SHEET_EQ_NO_OPERATIVOS);
  if (noOperativos.length) wNo.getRange(2, 1, noOperativos.length, FRIENDLY_HEADERS[SHEET_EQ_NO_OPERATIVOS].length).setValues(noOperativos);
  const wSt  = ensureFriendlySheet_(SHEET_EQ_ST);
  if (enST.length) wSt.getRange(2, 1, enST.length, FRIENDLY_HEADERS[SHEET_EQ_ST].length).setValues(enST);

  /* Agenda consolidada */
  const agRows = [];
  Object.entries((payload.agenda && payload.agenda.servicios) || {}).forEach(([srv, data])=>{
    const cr = (((payload.agenda && payload.agenda.centros)||[]).find(c => (c.servicios||[]).indexOf(srv) >= 0)) || null;
    const crNombre = cr ? cr.nombre : '';
    if (data.supervisor && (data.supervisor.nombre||data.supervisor.email)){
      agRows.push([srv, 'Supervisor', data.supervisor.nombre||'', data.supervisor.email||'', data.supervisor.anexo||'', data.supervisor.celular||'', crNombre]);
    }
    if (data.encargado && (data.encargado.nombre||data.encargado.email)){
      agRows.push([srv, 'Encargado de Equipos', data.encargado.nombre||'', data.encargado.email||'', data.encargado.anexo||'', data.encargado.celular||'', crNombre]);
    }
    if (cr && cr.jefe && (cr.jefe.nombre||cr.jefe.email)){
      agRows.push([srv, 'Jefe CR', cr.jefe.nombre||'', cr.jefe.email||'', cr.jefe.anexo||'', cr.jefe.celular||'', crNombre]);
    }
    (data.otros||[]).forEach(o=>{
      if (o.nombre || o.email){
        agRows.push([srv, o.rol||'Otro', o.nombre||'', o.email||'', o.anexo||'', o.celular||'', crNombre]);
      }
    });
  });
  agRows.sort((a,b)=> String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
  const wAg = ensureFriendlySheet_(SHEET_AGENDA_FRIENDLY);
  if (agRows.length) wAg.getRange(2, 1, agRows.length, FRIENDLY_HEADERS[SHEET_AGENDA_FRIENDLY].length).setValues(agRows);

  /* Empresas consolidadas */
  const empRows = [];
  ((payload.agenda && payload.agenda.empresas)||[]).forEach(e=>{
    const cs = e.contactos || [];
    if (!cs.length) empRows.push([e.nombre||'', e.direccion||'', '', '', '', '', '']);
    else cs.forEach(c => empRows.push([e.nombre||'', e.direccion||'', c.nombre||'', c.cargo||'', c.email||'', c.telefono||'', c.celular||'']));
  });
  const wEm = ensureFriendlySheet_(SHEET_EMPRESAS_FRIENDLY);
  if (empRows.length) wEm.getRange(2, 1, empRows.length, FRIENDLY_HEADERS[SHEET_EMPRESAS_FRIENDLY].length).setValues(empRows);
}

function hideSystemSheets_(){
  const ss = getSS_();
  /* Ocultar también la hoja legacy "Archivos" si existe */
  const all = HIDDEN_SHEETS.concat([SHEET_ARCHIVOS]);
  all.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh && !sh.isSheetHidden()) {
      try { sh.hideSheet(); } catch(_) {}
    }
  });
}

function ensureHeadersAligned_(ss){
  /* Verifica que cada hoja conocida tenga los encabezados correctos en la fila 1.
     Si no coinciden, los reescribe (sin tocar los datos). */
  Object.keys(HEADERS).forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const want = HEADERS[name];
    const cur = sh.getLastColumn() > 0
      ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), want.length)).getValues()[0]
      : [];
    let mismatch = false;
    for (let i = 0; i < want.length; i++){
      if ((cur[i] || '') !== want[i]) { mismatch = true; break; }
    }
    if (mismatch){
      sh.getRange(1, 1, 1, want.length)
        .setValues([want])
        .setFontWeight('bold')
        .setBackground('#f1f5f9');
      Logger.log('ensureHeadersAligned_: corregidos encabezados de "' + name + '"');
    }
  });
}

function showAllSheets() {
  /* Utilidad para volver a mostrar todas las hojas si el usuario las quiere ver */
  const ss = getSS_();
  ss.getSheets().forEach(sh => { if (sh.isSheetHidden()) sh.showSheet(); });
  Logger.log('Todas las hojas visibles.');
}

/* ============================================================
   TEST RÁPIDO desde el editor (Run → testWriteRead)
   ============================================================ */
function testWriteRead() {
  const out = replaceAll_({
    eventos: { 'inv:TEST-001': [{
      id: 'test-' + Date.now(), tipo: 'mp', fecha: '2026-05-26',
      resultado: 'Si', ejecutor: 'Test', estado: 'operativo',
      observacion: 'Prueba de escritura'
    }]},
    pendientes: { 'inv:TEST-002': [{
      id: 'pt-' + Date.now(), descripcion: 'Prueba', fecha: '2026-05-26',
      estado: 'abierto', tareas: [], actualizaciones: []
    }]},
    agenda: {
      servicios: { 'Test Servicio': { supervisor: { nombre:'Tester', email:'t@x.cl', anexo:'1234', celular:'+56 9' }, encargado: null }},
      centros: [{ id:'cr-test', nombre:'CR Test', jefe:{nombre:'Jefe',email:'j@x.cl',anexo:'9999',celular:''}, servicios:['Test Servicio'] }]
    },
    syncMarked: ['marker-test-1']
  });
  Logger.log('Write: ' + JSON.stringify(out));
  Logger.log('Read: '  + JSON.stringify(readAll_()));
}
