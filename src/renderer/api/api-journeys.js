// ===================================================================
// Fichero: api-journeys.js
// ===================================================================
import { executeRestRequest } from './api-core.js';
import { getFolderPath } from './api-helpers.js';

/**
 * Recupera el historial y el estado actual de un contacto dentro de todos los Journeys.
 * @param {string} contactKey - El ContactKey (SubscriberKey) del cliente.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de membresías del contacto en diferentes Journeys.
 */
export async function fetchContactJourneyMemberships(contactKey, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/interactions/contactMembership`;
    const payload = { "ContactKeyList": [contactKey] };

    const options = {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiConfig.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    };

    const responseData = await executeRestRequest(url, options);
    return responseData.results?.contactMemberships || [];
}

/**
 * Recupera los detalles completos de un Journey a partir de su Definition Key.
 * @param {string} definitionKey - Clave única de definición del Journey.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object|null>} Detalles del Journey o null si ocurre un error.
 */
export async function fetchJourneyDetailsByKey(definitionKey, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/interactions/key:${definitionKey}`;
    const options = {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiConfig.accessToken}` }
    };
    try {
        return await executeRestRequest(url, options);
    } catch (error) {
        console.error(`Failed to fetch details for journey key ${definitionKey}:`, error);
        return null;
    }
}

/**
 * Recupera la lista completa de todos los Journeys de la unidad de negocio, gestionando la paginación.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista completa de todos los objetos Journey.
 */
export async function fetchAllJourneys(apiConfig) {
    let allItems = [];
    let page = 1;
    let totalPages = 1;

    do {
        const url = `${apiConfig.restUri}interaction/v1/interactions?$page=${page}&$pageSize=500&extras=activity`;
        const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
        
        const data = await executeRestRequest(url, options);
        
        const pageItems = data.items || [];
        allItems = allItems.concat(pageItems);
        
        totalPages = data.count ? Math.ceil(data.count / 500) : 1;
        page++;

    } while (page <= totalPages);
    
    return allItems;
}

/**
 * Recupera todos los Event Definitions (Entry Sources) activos, gestionando la paginación.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de todas las definiciones de eventos de entrada.
 */
export async function fetchAllEventDefinitions(apiConfig) {
    let allItems = []; 
    let page = 1;
    let totalPages = 1; 

    do {
        const url = `${apiConfig.restUri}interaction/v1/eventDefinitions?$page=${page}&$pageSize=500`;
        const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
        
        const data = await executeRestRequest(url, options);
        
        if (data && Array.isArray(data.items)) {
            allItems = allItems.concat(data.items); 
        }

        if (page === 1 && data && data.count) {
           totalPages = Math.ceil(data.count / 500);
        }
        page++;
    } while (page <= totalPages);
    
    return allItems; 
}

/**
 * Construye un diccionario que mapea categoryIds (carpetas) a sus rutas en texto completo.
 * @param {Array} journeys - Lista de Journeys obtenidos de la API.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Objeto cuyas claves son los IDs de carpeta y valores la ruta.
 */
export async function buildJourneyFolderMap(journeys, apiConfig) {
    const allCategoryIds = [...new Set(journeys.map(j => j.categoryId).filter(Boolean))];
    const folderMap = {};

    for (const id of allCategoryIds) {
        folderMap[id] = await getFolderPath(id, apiConfig);
    }
    
    return folderMap;
}

/**
 * Recupera los detalles técnicos (actividades, diseño) de una versión específica de un Journey por su ID.
 * @param {string} journeyId - ID de la versión del Journey.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Detalles profundos del Journey.
 */
export async function fetchJourneyDetailsById(journeyId, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/interactions/${journeyId}`;
    const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
    return executeRestRequest(url, options);
}

/**
 * Obtiene la configuración de un origen de entrada (Event Definition) por su ID.
 * @param {string} eventDefId - ID del Event Definition.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Objeto de configuración del evento.
 */
export async function getEventDefinitionById(eventDefId, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/eventDefinitions/${eventDefId}`;
    const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
    return executeRestRequest(url, options);
}

/**
 * Detiene (Stop) una versión específica de un Journey activo.
 * @param {string} journeyId - ID del Journey a detener.
 * @param {number|string} version - Número de la versión a detener.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Objeto de respuesta de la API.
 */
export async function stopJourney(journeyId, version, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/interactions/stop/${journeyId}?versionNumber=${version}`;
    const options = {
        method: 'POST',
        headers: { 
            "Authorization": `Bearer ${apiConfig.accessToken}`,
            "Content-Type": "application/json"
        },
        body: '' 
    };
    return executeRestRequest(url, options);
}

/**
 * Borra permanentemente una versión de un Journey en Marketing Cloud.
 * @param {string} journeyId - ID de la versión del Journey.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Promesa que resuelve en {success: true} si se eliminó.
 */
export async function deleteJourney(journeyId, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/interactions/${journeyId}`;
    const options = {
        method: 'DELETE',
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}` }
    };
    await executeRestRequest(url, options);
    return { success: true };
}

/**
 * Crea una copia o un nuevo Journey a partir de un payload JSON.
 * @param {object} journeyPayload - Objeto estructurado con la lógica del Journey.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Detalles del Journey recién creado.
 */
export async function createJourney(journeyPayload, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/interactions/`;
    const options = {
        method: 'POST',
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(journeyPayload)
    };
    return executeRestRequest(url, options);
}

/**
 * Recupera todas las versiones asociadas a un nombre de Journey o descripción.
 * @param {string} nameOrDescription - Nombre exacto o parcial del Journey.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de versiones de ese Journey.
 */
export async function fetchJourneyVersions(nameOrDescription, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/interactions?nameOrDescription=${nameOrDescription}&mostRecentVersionOnly=false`;
    const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
    const data = await executeRestRequest(url, options);
    return data.items || [];
}

/**
 * Crea un origen de entrada (Event Definition) de tipo Data Extension (EmailAudience).
 * @param {object} originalEventDef - Plantilla del evento original para copiar configuración.
 * @param {object} clonedDeInfo - IDs de la nueva Data Extension clonada.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @param {string} newJourneyName - Nombre del nuevo Journey (para asignárselo al evento).
 * @returns {Promise<object>} El Event Definition creado.
 */
export async function createEmailAudienceEventDefinition(originalEventDef, clonedDeInfo, apiConfig, newJourneyName) {
    const keyPrefix = originalEventDef.eventDefinitionKey.split('-')[0];
    const newEventDefKey = `${keyPrefix}-${crypto.randomUUID()}`;

    const payload = {
        type: 'EmailAudience',
        name: newJourneyName,
        description: originalEventDef.description || "",
        mode: originalEventDef.mode || "Production",
        eventDefinitionKey: newEventDefKey,
        dataExtensionId: clonedDeInfo.objectID,
        iconUrl: originalEventDef.iconUrl,
        isVisibleInPicker: originalEventDef.isVisibleInPicker,
        category: originalEventDef.category,
        sourceApplicationExtensionId: originalEventDef.sourceApplicationExtensionId,
        metaData: originalEventDef.metaData,
        schema: originalEventDef.schema,
        arguments: {
            serializedObjectType: 3,
            useHighWatermark: originalEventDef.arguments?.useHighWatermark || false,
            resetHighWatermark: originalEventDef.arguments?.resetHighWatermark || false,
            eventDefinitionKey: newEventDefKey,
            dataExtensionId: clonedDeInfo.objectID,
            criteria: ""
        },
        configurationArguments: {
            unconfigured: false
        }
    };
    const url = `${apiConfig.restUri}interaction/v1/eventDefinitions/`;
    const options = {
        method: 'POST',
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    };
    return executeRestRequest(url, options);
}

/**
 * Crea un origen de entrada (Event Definition) de tipo Automation Studio (AutomationAudience).
 * @param {object} originalEventDef - Plantilla del evento original para copiar configuración.
 * @param {string} automationId - ID de la automatización que gatillará el evento.
 * @param {object} deDetails - IDs de la Data Extension objetivo de la automatización.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @param {string} newJourneyName - Nombre del nuevo Journey.
 * @returns {Promise<object>} El Event Definition creado.
 */
export async function createAutomationAudienceEventDefinition(originalEventDef, automationId, deDetails, apiConfig, newJourneyName) {
    const keyPrefix = originalEventDef.eventDefinitionKey.split('-')[0];
    const newEventDefKey = `${keyPrefix}-${crypto.randomUUID()}`;

    const payload = {
        type: "AutomationAudience",
        name: newJourneyName,
        description: originalEventDef.description || "",
        mode: originalEventDef.mode || "Production",
        eventDefinitionKey: newEventDefKey,
        dataExtensionId: deDetails.objectID,
        iconUrl: originalEventDef.iconUrl || "/images/icon-data-extension.svg",
        isVisibleInPicker: originalEventDef.isVisibleInPicker,
        category: originalEventDef.category || "Audience",
        sourceApplicationExtensionId: originalEventDef.sourceApplicationExtensionId,
        metaData: originalEventDef.metaData,
        arguments: {
            serializedObjectType: 9,
            useHighWatermark: originalEventDef.arguments?.useHighWatermark || false,
            resetHighWatermark: originalEventDef.arguments?.resetHighWatermark || false,
            automationId: automationId,
            eventDefinitionKey: newEventDefKey,
            dataExtensionId: deDetails.objectID,
            criteria: ""
        },
        configurationArguments: {
            unconfigured: false
        }
    };

    const url = `${apiConfig.restUri}interaction/v1/eventDefinitions/`;
    const options = {
        method: 'POST',
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    };
    return executeRestRequest(url, options);
}

/**
 * Expulsa (Eject) forzosamente a un contacto específico de uno o múltiples Journeys activos.
 * @param {string} contactKey - El ContactKey del cliente a expulsar.
 * @param {Array<string>} definitionKeys - Arreglo con las claves de los Journeys.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Respuesta de la API detallando si hubo éxito o error por Journey.
 */
export async function ejectContactFromJourneys(contactKey, definitionKeys, apiConfig) {
    if (!contactKey || !definitionKeys || definitionKeys.length === 0) {
        throw new Error("Se requieren ContactKey y al menos una DefinitionKey para la expulsión.");
    }
    
    const url = `${apiConfig.restUri}interaction/v1/interactions/contactexit`;
    
    const payload = definitionKeys.map(key => ({
        "ContactKey": contactKey,
        "DefinitionKey": key
    }));

    const options = {
        method: 'POST',
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    };
    
    return executeRestRequest(url, options);
}