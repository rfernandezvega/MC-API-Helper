// ===================================================================
// Fichero: api-core.js
// Descripción: Funciones base de red (SOAP/REST) y gestión de logs.
// ===================================================================

let silenceResponses = false;
let apiCallSeq = 0; // correlaciona cada llamada con su respuesta en el log

// Contador de llamadas hechas desde el último volcado. El llamador (org-manager)
// lo lee periódicamente con takePendingApiCalls() y lo acumula por cliente/BU en disco.
let pendingApiCalls = 0;

/**
 * Devuelve el número de llamadas API hechas desde la última vez que se llamó a esta
 * función y reinicia el contador a cero (para acumular el total por cliente/BU).
 * @returns {number}
 */
export function takePendingApiCalls() {
    const n = pendingApiCalls;
    pendingApiCalls = 0;
    return n;
}

export let logger = {
    logApiCall: () => {},
    logApiResponse: () => {}
};

/**
 * Permite a un módulo externo (como app.js) inyectar sus propias funciones de logging.
 * @param {object} loggerInstance - Instancia con métodos logApiCall y logApiResponse.
 */
export function setLogger(loggerInstance) {
    if (loggerInstance && loggerInstance.logApiCall && loggerInstance.logApiResponse) {
        logger = loggerInstance;
    }
}

export function setSilentResponses(silent) {
    silenceResponses = silent;
}

/**
 * Helper INTERNO para ejecutar peticiones SOAP con logging integrado.
 * @param {string} soapUri - La URL del endpoint SOAP.
 * @param {string} soapPayload - El cuerpo (body) XML de la petición.
 * @returns {Promise<string>} Promesa que resuelve con el texto XML de la respuesta.
 * @throws {Error} Si la respuesta de la API no indica un estado de éxito.
 */
export async function executeSoapRequest(soapUri, soapPayload) {
    const callId = ++apiCallSeq;
    pendingApiCalls++;
    logger.logApiCall({ endpoint: soapUri, method: 'POST', payload: soapPayload, _id: callId });

    const response = await fetch(soapUri, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: soapPayload
    });
    const responseText = await response.text();

    logger.logApiResponse({ endpoint: soapUri, status: response.status, body: responseText, _id: callId });

    if (!responseText.includes('<OverallStatus>OK</OverallStatus>') && !responseText.includes('<OverallStatus>MoreDataAvailable</OverallStatus>')) {
        // Intentar extraer el mensaje de error: StatusMessage (Retrieve) o faultstring (SOAP Fault).
        const statusMatch = responseText.match(/<StatusMessage>([\s\S]*?)<\/StatusMessage>/);
        const faultMatch = responseText.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
        let message = statusMatch?.[1] || faultMatch?.[1];
        if (!message) {
            // Sin mensaje reconocible: incluir un fragmento de la respuesta (o el estado HTTP) para diagnosticar.
            const snippet = (responseText || '').trim().slice(0, 300);
            message = snippet
                ? `Respuesta SOAP inesperada (HTTP ${response.status}): ${snippet}`
                : `Respuesta SOAP vacía (HTTP ${response.status}).`;
        }
        throw new Error(message);
    }
    return responseText;
}

/**
 * Helper INTERNO para ejecutar peticiones REST (JSON) con logging integrado.
 * @param {string} url - La URL completa del endpoint REST.
 * @param {object} [options={}] - Opciones de la petición fetch (method, headers, body, etc.).
 * @returns {Promise<object>} Promesa que resuelve con el JSON parseado o un objeto de éxito.
 * @throws {Error} Si el código HTTP no es 2xx o la API devuelve un error.
 */
export async function executeRestRequest(url, options = {}) {
    const callId = ++apiCallSeq;
    pendingApiCalls++;
    logger.logApiCall({ endpoint: url, options, _id: callId });
    const response = await fetch(url, options);
    const responseText = await response.text();

    if (!silenceResponses) {
        logger.logApiResponse({ endpoint: url, status: response.status, body: responseText, _id: callId });
    }

    if (!response.ok) {
        let errorMsg = responseText;
        try { 
            const errJson = JSON.parse(responseText);
            errorMsg = errJson.message || responseText;
        } catch(e) {}
        throw new Error(`Error ${response.status}: ${errorMsg}`);
    }

    if (responseText.trim() === 'OK' || responseText.trim() === '"OK"') {
        return { success: true, message: 'OK' };
    }

    const responseData = responseText ? JSON.parse(responseText) : {};
    return responseData;
}