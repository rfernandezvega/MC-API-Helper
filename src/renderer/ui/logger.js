// Fichero: src/renderer/ui/logger.js
// Descripción: Gestiona toda la lógica para mostrar mensajes, peticiones y respuestas
// de la API en el panel de logs de la interfaz de usuario.

import elements from './dom-elements.js';

// Búferes del log. `timeline` empareja cada llamada con su respuesta (por _id) para poder
// seguir el hilo petición → respuesta en orden.
let logBuffer = [];
let timeline = [];              // [{ id, endpoint, method, request, response }]
let timelineById = new Map();   // id -> entrada del timeline

/**
 * Limpia los búferes para iniciar un nuevo registro de log.
 */
export function startLogBuffering() {
    logBuffer = [];
    timeline = [];
    timelineById = new Map();
}

/**
 * Convierte un objeto a JSON indentado (con recuperación segura ante errores).
 */
function prettyJson(value) {
    try { return JSON.stringify(value, null, 2); } catch (e) { return String(value); }
}

/**
 * Indenta XML "en una línea" para que sea legible. Usa el algoritmo clásico de saltos
 * entre etiquetas + indentación por profundidad; no altera el contenido de texto.
 */
function formatXml(xml) {
    try {
        const withBreaks = xml.replace(/>\s*</g, '>\n<').trim();
        let pad = 0;
        return withBreaks.split('\n').map(rawNode => {
            const node = rawNode.trim();
            if (!node) return '';
            // Cierre de etiqueta: reducir indentación antes de pintar.
            if (/^<\/\w/.test(node)) pad = Math.max(pad - 1, 0);
            const line = '  '.repeat(pad) + node;
            // Apertura de etiqueta (no self-closing, no declaración, sin cierre en la misma línea).
            if (/^<\w[^>]*[^/]>$/.test(node) && !node.startsWith('<?')) pad++;
            return line;
        }).join('\n');
    } catch (e) {
        return xml;
    }
}

/**
 * Formatea un payload/body en texto: JSON indentado si es JSON, XML indentado si es XML,
 * o el texto tal cual en cualquier otro caso.
 */
function formatBody(text) {
    if (typeof text !== 'string') return prettyJson(text);
    const t = text.trim();
    if (!t) return text;
    if (t[0] === '{' || t[0] === '[') {
        try { return prettyJson(JSON.parse(t)); } catch (e) { /* no era JSON válido */ }
    }
    if (t[0] === '<') return formatXml(t);
    return text;
}

/**
 * Formatea una entrada del log (petición o respuesta) de forma legible, extrayendo y
 * formateando por separado endpoint, método, cabeceras y cuerpo (JSON o XML).
 */
function formatEntry(entry) {
    if (entry == null) return '';
    if (typeof entry === 'string') return formatBody(entry);
    if (typeof entry !== 'object') return String(entry);

    const parts = [];
    if (entry.endpoint) parts.push(`▶ Endpoint: ${entry.endpoint}`);
    if (entry.status !== undefined) parts.push(`◀ Status: ${entry.status}`);

    // Petición REST: opciones (método, cabeceras, cuerpo).
    if (entry.options && typeof entry.options === 'object') {
        if (entry.options.method) parts.push(`Método: ${entry.options.method}`);
        if (entry.options.headers) parts.push(`Headers:\n${prettyJson(entry.options.headers)}`);
        if (entry.options.body !== undefined) parts.push(`Body:\n${formatBody(entry.options.body)}`);
    }

    // Petición SOAP.
    if (entry.payload !== undefined) parts.push(`Payload:\n${formatBody(entry.payload)}`);

    // Respuesta (SOAP o REST).
    if (entry.body !== undefined) parts.push(`Body:\n${formatBody(entry.body)}`);

    // Si no hemos reconocido ningún campo conocido, volcar el objeto entero como JSON.
    if (parts.length === 0) return prettyJson(entry);
    return parts.join('\n');
}

/** Método HTTP de una entrada (SOAP siempre es POST). */
function entryMethod(e) {
    return e.request?.method || e.request?.options?.method || (e.request ? 'POST' : '');
}

/** Texto formateado de la PETICIÓN de una entrada. Se muestra el CUERPO (lo relevante);
 *  las cabeceras se omiten (solo llevan el token de auth). El endpoint ya va en la cabecera. */
function formatRequest(e) {
    if (!e.request) return '(sin petición)';
    const body = (e.request.payload !== undefined) ? e.request.payload : e.request.options?.body;
    if (body !== undefined && body !== null && body !== '') return formatBody(body);
    return '(sin cuerpo — p. ej. GET)';
}

/** Texto formateado de la RESPUESTA de una entrada. */
function formatResponse(e) {
    if (!e.response) return '(sin respuesta registrada)';
    const lines = [`Status ${e.response.status}`];
    if (e.response.body !== undefined) lines.push(formatBody(e.response.body));
    return lines.join('\n');
}

/** Cabecera de una entrada para la vista colapsada / descarga. */
function entryHeader(e, n) {
    const method = entryMethod(e);
    const status = e.response ? `Status ${e.response.status}` : 'sin respuesta';
    return `#${n}  ${method ? method + '  ' : ''}${e.endpoint || ''}  ·  ${status}`;
}

/** Renderiza una entrada como texto (para la descarga). */
function renderTimelineEntry(e, n) {
    return `${entryHeader(e, n)}\n\n▶ Petición\n${formatRequest(e)}\n\n◀ Respuesta\n${formatResponse(e)}`;
}

/** Construye el texto completo del hilo llamada→respuesta (para la descarga). */
export function getTranscriptText() {
    const separator = '\n\n════════════════════════════════════════\n\n';
    return timeline.map((e, i) => renderTimelineEntry(e, i + 1)).join(separator);
}

/** Texto del panel de mensajes (para la descarga). */
export function getMessagesText() {
    const separator = '\n\n----------------------------------------\n\n';
    return logBuffer.map(formatEntry).join(separator);
}

/** Construye el <details> colapsable de una entrada (cabecera + petición + respuesta). */
function buildEntryDetails(e, n) {
    const det = document.createElement('details');
    det.className = 'log-entry';
    if (e.response && e.response.status >= 400) det.classList.add('error');

    const summary = document.createElement('summary');
    summary.textContent = entryHeader(e, n);
    det.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'log-entry-body';

    const reqLabel = document.createElement('div');
    reqLabel.className = 'log-label';
    reqLabel.textContent = '▶ Petición';
    const reqPre = document.createElement('pre');
    reqPre.textContent = formatRequest(e);

    const resLabel = document.createElement('div');
    resLabel.className = 'log-label';
    resLabel.textContent = '◀ Respuesta';
    const resPre = document.createElement('pre');
    resPre.textContent = formatResponse(e);

    body.append(reqLabel, reqPre, resLabel, resPre);
    det.appendChild(body);
    return det;
}

/**
 * Formatea y muestra el contenido acumulado de los búferes en el DOM.
 * El transcript se pinta como lista de entradas colapsables (una por id).
 */
export function endLogBuffering() {
    elements.logMessagesEl.textContent = getMessagesText();
    const container = elements.logTranscriptEl;
    if (container) {
        container.innerHTML = '';
        timeline.forEach((e, i) => container.appendChild(buildEntryDetails(e, i + 1)));
    }
}

/**
 * Añade un mensaje informativo al búfer de logs.
 * @param {string} message - El texto a añadir.
 */
export function logMessage(message) {
    logBuffer.push(message);
}

/**
 * Registra una petición API. Crea la entrada del timeline correlacionable por _id.
 * @param {object|string} requestData - Objeto de la petición (endpoint, payload/options, _id).
 */
export function logApiCall(requestData) {
    const id = (requestData && requestData._id != null) ? requestData._id : `auto_${timeline.length}`;
    const entry = {
        id,
        endpoint: requestData?.endpoint || '',
        method: requestData?.method,
        request: requestData,
        response: undefined
    };
    timeline.push(entry);
    timelineById.set(id, entry);
}

/**
 * Registra una respuesta API y la empareja con su petición por _id.
 * @param {object|string} responseData - Objeto de la respuesta (status, body, _id).
 */
export function logApiResponse(responseData) {
    const id = (responseData && responseData._id != null) ? responseData._id : null;
    const entry = (id != null) ? timelineById.get(id) : null;
    if (entry) {
        entry.response = responseData;
        if (!entry.endpoint && responseData?.endpoint) entry.endpoint = responseData.endpoint;
    } else {
        // Respuesta sin petición correlacionada: se añade como entrada suelta.
        timeline.push({ id: id ?? `resp_${timeline.length}`, endpoint: responseData?.endpoint || '', request: undefined, response: responseData });
    }
}