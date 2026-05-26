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
  [SHEET_EVENTOS]:        ['id','key','tipo','fecha','resultado','ejecutor','estado','observacion','comentario','nEnvio','empresa','folio','folioGuia','empresaId','contactoId','updatedAt','archivos'],
  [SHEET_PENDIENTES]:     ['id','key','descripcion','fecha','fechaCompromiso','fechaCierre','proximoRecordatorio','ejecutor','estado','tareas','actualizaciones','updatedAt','archivos'],
  [SHEET_AGENDA_SERV]:    ['servicio','cargo','nombre','email','anexo','celular'],
  [SHEET_AGENDA_OTROS]:   ['servicio','id','rol','nombre','email','anexo','celular'],
  [SHEET_AGENDA_CR]:      ['id','nombre','jefe_nombre','jefe_email','jefe_anexo','jefe_celular','servicios'],
  [SHEET_AGENDA_DIR]:     ['id','categoria','organizacion','nombre','email','telefono','notas'],
  [SHEET_AGENDA_EMP]:     ['id','nombre','direccion'],
  [SHEET_AGENDA_EMP_CON]: ['empresa_id','id','nombre','cargo','email','telefono','celular'],
  [SHEET_SYNC]:           ['marker','addedAt'],
  [SHEET_META]:           ['key','value']
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
  Logger.log('Migrate completo. ' + creadas + ' hoja(s) nueva(s), ' + colsAgregadas + ' columna(s) agregada(s).');
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
function replaceAll_(payload) {
  const ss = getSS_();
  const now = new Date().toISOString();

  if (payload.eventos) {
    const sh = ss.getSheetByName(SHEET_EVENTOS);
    resetSheet_(sh, HEADERS[SHEET_EVENTOS]);
    const rows = [];
    Object.entries(payload.eventos).forEach(([key, arr]) => {
      (arr||[]).forEach(ev => {
        rows.push(HEADERS[SHEET_EVENTOS].map(h => {
          if (h === 'key')       return key;
          if (h === 'updatedAt') return now;
          if (h === 'archivos')  return JSON.stringify(ev.archivos || []);
          return ev[h] != null ? ev[h] : '';
        }));
      });
    });
    if (rows.length) sh.getRange(2, 1, rows.length, HEADERS[SHEET_EVENTOS].length).setValues(rows);
  }

  if (payload.pendientes) {
    const sh = ss.getSheetByName(SHEET_PENDIENTES);
    resetSheet_(sh, HEADERS[SHEET_PENDIENTES]);
    const rows = [];
    Object.entries(payload.pendientes).forEach(([key, arr]) => {
      (arr||[]).forEach(p => {
        rows.push(HEADERS[SHEET_PENDIENTES].map(h => {
          if (h === 'key')       return key;
          if (h === 'updatedAt') return now;
          if (h === 'tareas')    return JSON.stringify(p.tareas || []);
          if (h === 'actualizaciones') return JSON.stringify(p.actualizaciones || []);
          if (h === 'archivos')  return JSON.stringify(p.archivos || []);
          return p[h] != null ? p[h] : '';
        }));
      });
    });
    if (rows.length) sh.getRange(2, 1, rows.length, HEADERS[SHEET_PENDIENTES].length).setValues(rows);
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
