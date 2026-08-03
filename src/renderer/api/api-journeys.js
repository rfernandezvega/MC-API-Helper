// ===================================================================
// Fichero: api-journeys.js
// ===================================================================
import { executeRestRequest, executeSoapRequest } from './api-core.js';
import { resolveFolderPaths, clearFolderPathCache } from './api-helpers.js';

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
    // Construir el mapa completo es una operación en sí misma: se parte de caché vacía.
    clearFolderPathCache();

    const allCategoryIds = [...new Set(journeys.map(j => j.categoryId).filter(Boolean))];
    const paths = await resolveFolderPaths(allCategoryIds, apiConfig);

    const folderMap = {};
    allCategoryIds.forEach(id => { folderMap[id] = paths.get(String(id)) || ''; });
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
 * Pausa una versión específica de un Journey publicado.
 * @param {string} journeyId - ID del Journey a pausar.
 * @param {number|string} version - Número de la versión a pausar.
 * @param {object} pauseOptions - Opciones de pausa (ExtendWaitEndDates, PausedDays, etc.).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Objeto de respuesta de la API.
 */
export async function pauseJourney(journeyId, version, pauseOptions, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/interactions/pause/${journeyId}?versionNumber=${version}`;
    const options = {
        method: 'POST',
        headers: {
            "Authorization": `Bearer ${apiConfig.accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(pauseOptions || {})
    };
    return executeRestRequest(url, options);
}

/**
 * Reanuda una versión específica de un Journey pausado.
 * @param {string} journeyId - ID del Journey a reanudar.
 * @param {number|string} version - Número de la versión a reanudar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Objeto de respuesta de la API.
 */
export async function resumeJourney(journeyId, version, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/interactions/resume/${journeyId}?versionNumber=${version}`;
    const options = {
        method: 'POST',
        headers: {
            "Authorization": `Bearer ${apiConfig.accessToken}`,
            "Content-Type": "application/json"
        },
        body: '{}'
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

// ===================================================================
// ===== JOURNEY HISTORY (ERRORES) ===================================
// ===================================================================

/**
 * Recupera el historial de Journey buscando registros en estado Error/Warning para los IDs dados.
 * Itera día por día y por estado, paginando hasta 500 resultados por página (máx. 20 páginas).
 * @param {Array<string>} definitionIds - IDs (definitionId) de los journeys.
 * @param {string} startDate - Fecha inicio en formato 'YYYY-MM-DD'.
 * @param {string} endDate - Fecha fin en formato 'YYYY-MM-DD'.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @param {function} [onProgress] - Callback opcional con mensaje de progreso (string).
 * @returns {Promise<Array>} Lista de registros normalizados con {j, a, t, c, s, e, d}.
 */
export async function fetchJourneyHistoryErrors(journeyIds, startDate, endDate, apiConfig, onProgress) {
    if (!journeyIds || journeyIds.length === 0) return [];
    
    const allErrors = [];
    const statusesToFetch = ['Error', 'Warning'];
    
    // Convertir fechas
    const [startY, startM, startD] = startDate.split('-').map(Number);
    const [endY, endM, endD] = endDate.split('-').map(Number);
    
    const dateCursor = new Date(startY, startM - 1, startD);
    const dateLimit = new Date(endY, endM - 1, endD);
    
    let dayCount = 0;
    const maxDays = 35;
    
    // Función helper para formatear fecha ISO
    const getISOString = (date, time) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}T${time}`;
    };
    
    // Iterar día por día
    while (dateCursor <= dateLimit && dayCount < maxDays) {
        const isoStart = getISOString(dateCursor, '00:00:00Z');
        const isoEnd = getISOString(dateCursor, '23:59:59Z');
        const dateStr = dateCursor.toLocaleDateString('es-ES');
        
        if (onProgress) {
            onProgress(`Buscando errores del ${dateStr}...`);
        }
        
        // Buscar Error y Warning por separado
        for (const status of statusesToFetch) {
            let page = 1;
            let hasMore = true;
            
            while (hasMore && page <= 20) {
                try {
                    const endpoint = `${apiConfig.restUri}interaction/v1/interactions/journeyhistory/search?$page=${page}&$pageSize=500`;
                    
                    const payload = {
                        definitionIds: journeyIds,
                        activityTypes: ['EMAILV2', 'SALESCLOUDACTIVITY'],
                        clientStatuses: [status],
                        start: isoStart,
                        end: isoEnd
                    };
                    
                    const response = await executeRestRequest(endpoint, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiConfig.accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    });
                    
                    if (response.items && response.items.length > 0) {
                        response.items.forEach(item => {
                            const messages = item.result?.messages?.map(m => m.message) || [];
                            
                            allErrors.push({
                                j: item.definitionName || 'N/A',
                                a: item.activityName || 'N/A',
                                t: item.activityType || 'N/A',
                                c: item.contactKey || 'N/A',
                                s: status.toUpperCase(),
                                e: messages,
                                d: item.transactionTime
                            });
                        });
                        
                        // Si devolvió menos de 500, no hay más páginas
                        if (response.items.length < 500) {
                            hasMore = false;
                        } else {
                            page++;
                        }
                    } else {
                        hasMore = false;
                    }
                } catch (error) {
                    hasMore = false;
                }
            }
        }
        
        dateCursor.setDate(dateCursor.getDate() + 1);
        dayCount++;
    }
    
    return allErrors;
}

// ===================================================================
// ===== TRIGGERED SEND (SOAP) =======================================
// ===================================================================

/**
 * Helper interno: extrae el contenido de un tag XML simple desde un bloque de texto.
 * Soporta CDATA y espacios en blanco.
 * @param {string} xml - Bloque XML donde buscar.
 * @param {string} tagName - Nombre del tag.
 * @returns {string} El contenido del tag o cadena vacía.
 */
function extractXmlValue(xml, tagName) {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xml.match(regex);
    if (!match || match.length < 2) return '';
    let val = String(match[1]);
    val = val.replace('<![CDATA[', '').replace(']]>', '');
    return val.replace(/^\s+|\s+$/g, '');
}

/**
 * Recupera la definición SOAP de uno o varios TriggeredSendDefinition por su CustomerKey.
 * @param {Array<string>} customerKeys - Lista de CustomerKey a consultar.
 * @param {object} apiConfig - Configuración autenticada (con soapUri y accessToken).
 * @returns {Promise<object>} Mapa { customerKey: { objectId, status, description, created, modified } }.
 */
export async function fetchTriggeredSendDefinitionsByKeys(customerKeys, apiConfig) {
    if (!customerKeys || customerKeys.length === 0) return {};

    const operator = customerKeys.length === 1 ? 'equals' : 'IN';
    const valuesXml = customerKeys.map(k => `<Value>${k}</Value>`).join('');

    const soapPayload = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
    <s:Header>
        <a:Action s:mustUnderstand="1">Retrieve</a:Action>
        <a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To>
        <fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth>
    </s:Header>
    <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
                <ObjectType>TriggeredSendDefinition</ObjectType>
                <Properties>ObjectID</Properties>
                <Properties>CustomerKey</Properties>
                <Properties>TriggeredSendStatus</Properties>
                <Properties>Description</Properties>
                <Properties>CreatedDate</Properties>
                <Properties>ModifiedDate</Properties>
                <Filter xsi:type="SimpleFilterPart">
                    <Property>CustomerKey</Property>
                    <SimpleOperator>${operator}</SimpleOperator>
                    ${valuesXml}
                </Filter>
            </RetrieveRequest>
        </RetrieveRequestMsg>
    </s:Body>
</s:Envelope>`;

    const respText = await executeSoapRequest(apiConfig.soapUri, soapPayload);

    const resultsMap = {};
    const blocks = respText.split('<Results');
    for (let b = 1; b < blocks.length; b++) {
        const block = blocks[b];
        const ck = extractXmlValue(block, 'CustomerKey');
        if (ck) {
            resultsMap[ck] = {
                objectId: extractXmlValue(block, 'ObjectID'),
                status: extractXmlValue(block, 'TriggeredSendStatus') || 'Desconocido',
                description: extractXmlValue(block, 'Description'),
                created: extractXmlValue(block, 'CreatedDate'),
                modified: extractXmlValue(block, 'ModifiedDate')
            };
        }
    }
    return resultsMap;
}

/**
 * Recupera las métricas agregadas (Sent, Queued, NotSentDueToError) de uno o más TriggeredSends.
 * @param {Array<string>} objectIds - Lista de ObjectID de TriggeredSendDefinition.
 * @param {object} apiConfig - Configuración autenticada (con soapUri y accessToken).
 * @returns {Promise<object>} Mapa { objectId: { sent, queued, errored } }.
 */
export async function fetchTriggeredSendSummariesByObjectIds(objectIds, apiConfig) {
    if (!objectIds || objectIds.length === 0) return {};

    const operator = objectIds.length === 1 ? 'equals' : 'IN';
    const valuesXml = objectIds.map(id => `<Value>${id}</Value>`).join('');

    const soapPayload = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
    <s:Header>
        <a:Action s:mustUnderstand="1">Retrieve</a:Action>
        <a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To>
        <fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth>
    </s:Header>
    <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
                <ObjectType>TriggeredSendSummary</ObjectType>
                <Properties>ObjectID</Properties>
                <Properties>Sent</Properties>
                <Properties>Queued</Properties>
                <Properties>NotSentDueToError</Properties>
                <Filter xsi:type="SimpleFilterPart">
                    <Property>TriggeredSendDefinition.ObjectId</Property>
                    <SimpleOperator>${operator}</SimpleOperator>
                    ${valuesXml}
                </Filter>
            </RetrieveRequest>
        </RetrieveRequestMsg>
    </s:Body>
</s:Envelope>`;

    const respText = await executeSoapRequest(apiConfig.soapUri, soapPayload);

    const resultsMap = {};
    const blocks = respText.split('<Results');
    
    for (let b = 1; b < blocks.length; b++) {
        const block = blocks[b];
        const objId = extractXmlValue(block, 'ObjectID');
        
        if (objId) {
            resultsMap[objId] = {
                sent: extractXmlValue(block, 'Sent') || '0',
                queued: extractXmlValue(block, 'Queued') || '0',
                errored: extractXmlValue(block, 'NotSentDueToError') || '0'
            };
        }
    }
    
    return resultsMap;
}