// Fichero: src/renderer/ui/logger.js
// Descripción: Gestiona toda la lógica para mostrar mensajes, peticiones y respuestas
// de la API en el panel de logs de la interfaz de usuario.

import elements from './dom-elements.js';

// Las variables de buffer ahora viven aquí, encapsuladas dentro del módulo.
let logBuffer = [];
let requestBuffer = [];
let responseBuffer = [];

/**
 * Limpia los búferes para iniciar un nuevo registro de log.
 */
export function startLogBuffering() {
    logBuffer = [];
    requestBuffer = [];
    responseBuffer = [];
}

/**
 * Formatea y muestra el contenido acumulado de los búferes en el DOM.
 */
export function endLogBuffering() {
    const separator = '\n\n----------------------------------------\n\n';
    const formatEntry = (entry) => (typeof entry === 'object') ? JSON.stringify(entry, null, 2) : entry;

    elements.logMessagesEl.textContent = logBuffer.map(formatEntry).join(separator);
    elements.logRequestEl.textContent = requestBuffer.map(formatEntry).join(separator);
    elements.logResponseEl.textContent = responseBuffer.map(formatEntry).join(separator);
}

/**
 * Añade un mensaje informativo al búfer de logs.
 * @param {string} message - El texto a añadir.
 */
export function logMessage(message) {
    logBuffer.push(message);
}

/**
 * Añade los detalles de una petición API al búfer de peticiones.
 * @param {object|string} requestData - El objeto de la petición o texto plano.
 */
export function logApiCall(requestData) {
    requestBuffer.push(requestData);
}

/**
 * Añade los detalles de una respuesta API al búfer de respuestas.
 * @param {object|string} responseData - El objeto de la respuesta o texto plano.
 */
export function logApiResponse(responseData) {
    responseBuffer.push(responseData);
}