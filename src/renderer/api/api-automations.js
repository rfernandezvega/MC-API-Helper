// ===================================================================
// Fichero: api-automations.js
// ===================================================================
import { executeRestRequest } from './api-core.js';

/**
 * Recupera la lista completa de todas las definiciones de automatismos usando la API REST legacy.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de objetos de automatismos.
 */
export async function fetchAllAutomations(apiConfig) {
  if (!apiConfig || !apiConfig.restUri || !apiConfig.accessToken) {
    throw new Error("Configuración de API no válida proporcionada a fetchAllAutomations.");
  }
    const url = `${apiConfig.restUri}/legacy/v1/beta/bulk/automations/automation/definition/`;
    const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
    const data = await executeRestRequest(url, options);
    return data.entry || [];
}

/**
 * Activa (Schedule) un automatismo pausado o detenido.
 * @param {string} automationId - ID interno del automatismo.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Objeto de respuesta de la API tras la activación.
 */
export async function activateAutomation(automationId, apiConfig) {
    const detailsUrl = `${apiConfig.restUri}legacy/v1/beta/bulk/automations/automation/definition/${automationId}`;
    const autoDetails = await executeRestRequest(detailsUrl, { 
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } 
    });

    if (!autoDetails.scheduleObject?.id) {
        throw new Error("No se encontró un 'scheduleObject.id' para poder activar el automatismo.");
    }
    
    const payload = { id: automationId, scheduleObject: { id: autoDetails.scheduleObject.id } };
    const actionUrl = `${apiConfig.restUri}legacy/v1/beta/bulk/automations/automation/definition/?action=schedule`;
    const options = {
        method: 'POST',
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    };
    
    return executeRestRequest(actionUrl, options);
}

/**
 * Inicia la ejecución inmediata (Run Once) de un automatismo.
 * @param {string} automationId - ID interno del automatismo.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Objeto de respuesta indicando el inicio de ejecución.
 */
export async function runAutomation(automationId, apiConfig) {
    const url = `${apiConfig.restUri}legacy/v1/beta/bulk/automations/automation/definition/?action=start`;
    const payload = { id: automationId };
    const options = {
        method: 'POST',
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    };
    return executeRestRequest(url, options);
}

/**
 * Pausa la programación (Schedule) de un automatismo activo.
 * @param {string} automationId - ID interno del automatismo.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Objeto de respuesta tras pausar la programación.
 */
export async function pauseAutomation(automationId, apiConfig) {
    const url = `${apiConfig.restUri}legacy/v1/beta/bulk/automations/automation/definition/?action=pauseSchedule`;
    const payload = { id: automationId };
    const options = {
        method: 'POST',
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    };
    return executeRestRequest(url, options);
}

/**
 * Recupera los detalles técnicos y los pasos (steps/activities) de un automatismo.
 * @param {string} automationId - ID interno del automatismo.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Objeto con la estructura completa del automatismo.
 */
export async function fetchAutomationDetailsById(automationId, apiConfig) {
    const url = `${apiConfig.restUri}automation/v1/automations/${automationId}`;
    const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
    return await executeRestRequest(url, options);
}

/**
 * Crea un nuevo automatismo en Marketing Cloud a partir de un payload JSON.
 * @param {object} automationPayload - Definición estructural del nuevo automatismo.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Objeto con los datos del automatismo creado.
 */
export async function createAutomation(automationPayload, apiConfig) {
    const url = `${apiConfig.restUri}automation/v1/automations`;
    const options = {
        method: 'POST',
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(automationPayload)
    };
    return executeRestRequest(url, options);
}

/**
 * Busca automatismos que coincidan exactamente con un nombre dado.
 * @param {string} automationName - Nombre a buscar (sensible a mayúsculas/minúsculas).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de automatismos que coinciden con la búsqueda.
 */
export async function findAutomationByName(automationName, apiConfig) {
    const encodedName = encodeURIComponent(automationName);
    const url = `${apiConfig.restUri}automation/v1/automations?$filter=name%20eq%20'${encodedName}'`;
    const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
    const data = await executeRestRequest(url, options);
    return data.items || [];
}

/**
 * Recupera las direcciones de correo configuradas para recibir notificaciones del automatismo.
 * @param {string} automationId - ID interno del automatismo.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Datos sobre las notificaciones (error, complete, etc.).
 */
export async function fetchAutomationNotifications(automationId, apiConfig) {
    const url = `${apiConfig.restUri}/legacy/v1/beta/automations/notifications/${automationId}`;
    const options = { 
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } 
    };
    return await executeRestRequest(url, options);
}