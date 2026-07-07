// Fichero: src/renderer/components/audit/audit-state.js
// Descripción: Estado compartido de un escaneo de auditoría: datos de drill-down, datos para el
// PDF, mapa de usuarios (cruce entre pestañas) y contador de llamadas API. Sin dependencias de UI.
//
// Por qué un módulo de estado: las pestañas se han partido en módulos independientes pero
// comparten el mismo drillData/pdfData/usersById y el mismo contador de llamadas. Como los
// módulos ES son singletons, todas las pestañas y el orquestador importan estas funciones y
// operan sobre las MISMAS variables internas (bindings vivos), sin tener que ir pasando un
// objeto de contexto por cada llamada.

// Estado interno del escaneo en curso (se reinicia con initAuditState).
let auditDrillData = {};   // key -> { title, columns, rows: [] }
let globalPdfData  = {};   // sectionId -> { kpis, cards, callouts }
let usersById      = {};   // id / userName -> user (lo rellena auditUsers, lo leen otras pestañas)
let apiCalls       = 0;    // nº de llamadas a la API consumidas por el escaneo

/** Reinicia todo el estado del escaneo (al entrar en la vista o al lanzar uno nuevo). */
export function initAuditState() {
    auditDrillData = {};
    globalPdfData  = {};
    usersById      = {};
    apiCalls       = 0;
}

// ---------- Drill-down ----------

/** Registra (si no existe) una tabla de detalle para una métrica. */
export function registerDrill(key, title, columns) {
    if (!auditDrillData[key]) auditDrillData[key] = { title, columns, rows: [] };
}

/** Añade una fila a la tabla de detalle indicada (si está registrada). */
export function addDrillRow(key, rowArray) {
    if (auditDrillData[key]) auditDrillData[key].rows.push(rowArray);
}

/** Sustituye por completo una entrada de drill (usado por el análisis detallado de automatismos). */
export function setDrillEntry(key, entry) {
    auditDrillData[key] = entry;
}

/** Devuelve la entrada de drill de una clave (para el modal y las descargas). */
export function getDrillEntry(key) {
    return auditDrillData[key];
}

/** Devuelve el objeto completo de drill (para el export masivo y el guardado en caché). */
export function getDrillData() {
    return auditDrillData;
}

/** Restaura el drillData desde la caché de una auditoría guardada. */
export function setDrillData(obj) {
    auditDrillData = obj || {};
}

// ---------- Datos para el PDF ----------

/** Registra los datos (KPIs, tarjetas y callouts) de una sección para el informe PDF.
 *  Los callouts se guardan como objetos {type, title, message}: el PDF resuelve el color. */
export function registerPdfData(sectionId, kpis, cards, callouts = []) {
    globalPdfData[sectionId] = { kpis, cards, callouts };
}

/** Devuelve el objeto de datos del PDF (para generarlo y guardarlo en caché). */
export function getPdfData() {
    return globalPdfData;
}

/** Restaura el pdfData desde la caché de una auditoría guardada. */
export function setPdfData(obj) {
    globalPdfData = obj || {};
}

// ---------- Usuarios (cruce entre pestañas) ----------

/** Indexa los usuarios por id y por userName para resolver propietarios en otras pestañas. */
export function registerUsers(users) {
    (users || []).forEach(u => {
        usersById[String(u.id)] = u;
        if (u.userName) usersById[u.userName] = u;
    });
}

/**
 * Resuelve un owner a nombre legible.
 * La API de automatismos devuelve createdBy/modifiedBy como objetos {id, name, email};
 * otras veces llega un id primitivo que se cruza contra el mapa de usuarios.
 * @param {object|string|number} owner
 * @returns {string}
 */
export function getUserLabel(owner) {
    if (!owner) return 'Sin propietario';

    // Caso: objeto {id, name, email} devuelto por la API de automatismos
    if (typeof owner === 'object') {
        const name  = owner.name  || '';
        const email = owner.email || '';
        if (name && email) return `${name} (${email})`;
        if (name)          return name;
        if (email)         return email;
        if (owner.id)      return `ID: ${owner.id}`;
        return 'Sin propietario';
    }

    // Caso: ID primitivo (string o número)
    const str = String(owner).trim();
    if (!str) return 'Sin propietario';
    const u = usersById[str];
    if (u) return `${u.name} (${u.userName})`;
    if (isNaN(Number(str))) return str;   // texto legible
    return `ID: ${str}`;
}

// ---------- Contador de llamadas API ----------

/** Suma llamadas al contador del escaneo. */
export function incApiCalls(n = 1) {
    apiCalls += n;
}

/** Devuelve el total de llamadas API del escaneo. */
export function getApiCalls() {
    return apiCalls;
}
