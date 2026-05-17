// ===================================================================
// Fichero: api-core.js
// Descripción: Funciones base de red (SOAP/REST) y gestión de logs.
// ===================================================================

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

/**
 * Helper INTERNO para ejecutar peticiones SOAP con logging integrado.
 * @param {string} soapUri - La URL del endpoint SOAP.
 * @param {string} soapPayload - El cuerpo (body) XML de la petición.
 * @returns {Promise<string>} Promesa que resuelve con el texto XML de la respuesta.
 * @throws {Error} Si la respuesta de la API no indica un estado de éxito.
 */
export async function executeSoapRequest(soapUri, soapPayload) {
    logger.logApiCall({ endpoint: soapUri, payload: soapPayload });

    const response = await fetch(soapUri, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: soapPayload
    });
    const responseText = await response.text();

    logger.logApiResponse({ status: response.status, body: responseText });

    if (!responseText.includes('<OverallStatus>OK</OverallStatus>') && !responseText.includes('<OverallStatus>MoreDataAvailable</OverallStatus>')) {
        const errorMatch = responseText.match(/<StatusMessage>(.*?)<\/StatusMessage>/);
        throw new Error(errorMatch ? errorMatch[1] : 'Error desconocido en la respuesta SOAP.');
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
    logger.logApiCall({ endpoint: url, options });
    const response = await fetch(url, options);
    const responseText = await response.text();
    logger.logApiResponse({ status: response.status, body: responseText });

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