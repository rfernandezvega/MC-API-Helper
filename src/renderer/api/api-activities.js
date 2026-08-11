// ===================================================================
// Fichero: api-activities.js
// Descripción: Búsqueda y recuperación de detalles de Actividades varias 
// (Scripts, Extracts, Transfers, Emails, Imports)
// ===================================================================
import { executeSoapRequest, executeRestRequest, logger } from './api-core.js';

// Tamaño de página de las colecciones REST de Automation Studio. Si la API lo recorta,
// el bucle sigue siendo correcto porque avanza según los elementos realmente devueltos.
const REST_PAGE_SIZE = 250;

// Definiciones de automatismo ya descargadas en la operación en curso. Varias actividades
// suelen pertenecer al mismo automatismo, y antes se pedía su JSON completo una vez por
// actividad. Se vacía al empezar cada operación para no servir datos obsoletos.
const automationDetailsCache = new Map();

/**
 * Vacía la caché de definiciones de automatismo. Debe llamarse al inicio de cada
 * operación (una búsqueda, un análisis) para que los datos se pidan frescos.
 */
export function clearAutomationDetailsCache() {
    automationDetailsCache.clear();
}

/**
 * Registra en la caché un automatismo que el llamador ya tiene descargado, para que
 * las búsquedas de uso no vuelvan a pedirlo a la API.
 * @param {object} automation - Definición del automatismo (debe incluir su id).
 */
export function primeAutomationDetailsCache(automation) {
    if (automation?.id) {
        automationDetailsCache.set(String(automation.id).toLowerCase(), Promise.resolve(automation));
    }
}

/**
 * Descarga la definición de un automatismo reutilizando la de la operación en curso.
 * @param {string} automationId - ID del automatismo.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} JSON completo del automatismo.
 */
function fetchAutomationOnce(automationId, apiConfig) {
    const key = String(automationId).toLowerCase();
    const cached = automationDetailsCache.get(key);
    if (cached) return cached;

    // Se cachea la promesa para que peticiones simultáneas compartan una sola llamada.
    const url = `${apiConfig.restUri}automation/v1/automations/${automationId}`;
    const promise = executeRestRequest(url, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } });
    automationDetailsCache.set(key, promise);
    return promise;
}

/**
 * Indaga en todos los programas SOAP para detectar a qué Automatismo o automatismos
 * pertenece el ObjectID de una actividad concreta, devolviendo también su Step.
 * @param {string|object} activityOrId - El ID o el Objeto que porta el ID de la actividad a buscar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Arreglo indicando nombre del automatismo y número de paso.
 */
export async function findAutomationForActivity(activityOrId, apiConfig) {
    const activityObjectId = (typeof activityOrId === 'object') ? activityOrId.objectID : activityOrId;
    
    if (!activityObjectId || activityObjectId === 'undefined') return [];

    const result = [];
    const retrieveActivitiesPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>Activity</ObjectType><Properties>Program.ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Definition.ObjectID</Property><SimpleOperator>equals</SimpleOperator><Value>${activityObjectId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    
    try {
        const responseText = await executeSoapRequest(apiConfig.soapUri, retrieveActivitiesPayload);
        const xmlDoc = new DOMParser().parseFromString(responseText, "application/xml");
        const programIdNodes = xmlDoc.querySelectorAll("Results > Program > ObjectID");

        if (programIdNodes.length === 0) return [];

        const uniqueAutomationIds = new Set();
        programIdNodes.forEach(node => uniqueAutomationIds.add(node.textContent));

        for (const automationId of uniqueAutomationIds) {
            try {
                const autoData = await fetchAutomationOnce(automationId, apiConfig);
                let stepName = 'N/A';
                if (autoData.steps) {
                    for (const step of autoData.steps) {
                        if (step.activities?.some(a => 
                            (a.activityObjectId || "").toLowerCase() === activityObjectId.toLowerCase() || 
                            (a.id || "").toLowerCase() === activityObjectId.toLowerCase() ||
                            (a.ssjsActivityId || "").toLowerCase() === activityObjectId.toLowerCase()
                        )) {
                            stepName = step.step || 'N/A';
                            break;
                        }
                    }
                }
                result.push({ automationName: autoData.name || 'N/A', step: stepName, automationId });
            } catch (error) {
                result.push({ automationName: `Error (${automationId})`, step: '---', automationId });
            }
        }
    } catch (e) {
        console.error("Error en findAutomationForActivity:", e);
    }
    return result;
}

/**
 * Es un "enrutador" que busca varias actividades a la vez según su tipo: las de automatismos
 * modernos (Scripts, FileTransfer...) recorriendo la colección REST una sola vez para todos
 * los términos, y las Legacy (Queries, Sends) con un único Retrieve SOAP.
 * @param {string} type - Tipo interno de actividad (Ej: "Script", "FilterActivity").
 * @param {Array<string>} values - Nombres, keys o IDs a rastrear.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Actividades encontradas (vacío si no hay ninguna).
 */
export async function searchActivitiesTargeted(type, values, apiConfig) {
    const terms = [...new Set((values || []).map(v => String(v).trim()).filter(Boolean))];
    if (terms.length === 0) return [];

    const restMappings = {
        'Script': { endpoint: 'automation/v1/scripts', idField: 'ssjsActivityId', nameField: 'name', keyField: 'key', label: 'Script' },
        'FileTransferActivity': { endpoint: 'automation/v1/fileTransfers', idField: 'id', nameField: 'name', keyField: 'customerKey', label: 'File Transfer' },
        'DataExtractActivity': { endpoint: 'automation/v1/dataextracts', idField: 'dataExtractDefinitionId', nameField: 'name', keyField: 'key', label: 'Data Extract' },
        'FilterActivity': { endpoint: 'automation/v1/filters', idField: 'filterActivityId', nameField: 'name', keyField: 'customerKey', label: 'Filter' }
    };

    if (restMappings[type]) {
        return await findActivitiesViaRest(restMappings[type], terms, apiConfig);
    }

    const soapLabels = {
        'QueryDefinition': 'SQL Query',
        'ImportDefinition': 'Data Copy or Import',
        'EmailSendDefinition': 'Send Email'
    };

    return await findActivitiesInSoap(type, soapLabels[type], 'CustomerKey', terms, apiConfig);
}

/**
 * Obtiene los detalles internos del código de un Script (SSJS) dada su ID en REST v1.
 * @param {string} id - El ssjsActivityId del script.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Estructura del script en JSON.
 */
export async function fetchScriptDetails(id, apiConfig) {
    const url = `${apiConfig.restUri}automation/v1/scripts/${id}`;
    return await executeRestRequest(url, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } });
}

/**
 * Obtiene el JSON estructurado de las opciones y reglas un Data Extract usando Automation v1.
 * @param {string} id - ID de la extracción.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Configuración de extracción.
 */
export async function fetchDataExtractDetails(id, apiConfig) {
    const url = `${apiConfig.restUri}automation/v1/dataextracts/${id}`;
    return await executeRestRequest(url, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } });
}

/**
 * Extrae la configuración (Separador, errores permitidos, nombre de archivo) de un Import Definition mediante SOAP.
 * @param {string} importObjectId - ObjectID interno de la importación.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Ajustes vitales de la importación.
 */
export async function fetchImportDefinitionDetails(importObjectId, apiConfig) {
    const soapPayload = `
    <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
        <s:Header>
            <a:Action s:mustUnderstand="1">Retrieve</a:Action>
            <a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To>
            <fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth>
        </s:Header>
        <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
                <RetrieveRequest>
                    <ObjectType>ImportDefinition</ObjectType>
                    <Properties>Name</Properties>
                    <Properties>FieldMappingType</Properties>
                    <Properties>UpdateType</Properties>
                    <Properties>AllowErrors</Properties>
                    <Properties>Delimiter</Properties>
                    <Properties>FileSpec</Properties>
                    <Properties>FileType</Properties>
                    <Properties>HeaderLines</Properties>
                    <Filter xsi:type="SimpleFilterPart">
                        <Property>ObjectID</Property>
                        <SimpleOperator>equals</SimpleOperator>
                        <Value>${importObjectId}</Value>
                    </Filter>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const doc = new DOMParser().parseFromString(responseText, "application/xml");
    const result = doc.querySelector("Results");

    if (!result) return null;

    return {
        name: result.querySelector("Name")?.textContent,
        fieldMappingType: result.querySelector("FieldMappingType")?.textContent,
        updateType: result.querySelector("UpdateType")?.textContent,
        allowErrors: result.querySelector("AllowErrors")?.textContent === 'true',
        delimiter: result.querySelector("Delimiter")?.textContent,
        fileSpec: result.querySelector("FileSpec")?.textContent,
        fileType: result.querySelector("FileType")?.textContent,
        headerLines: result.querySelector("HeaderLines")?.textContent
    };
}

/**
 * Obtiene la configuración base de FileTransfer vía API REST v1.
 * @param {string} id - ID del Transfer.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} JSON con el objeto FileTransfer.
 */
export async function fetchFileTransferDetails(id, apiConfig) {
    const url = `${apiConfig.restUri}automation/v1/filetransfers/${id}`;
    return await executeRestRequest(url, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } });
}

/**
 * Consulta la API de FileLocations para identificar dónde físicamente extrae o deja un fichero MC.
 * @param {string} locationId - ID numérico de la ubicación SFTP, Safehouse, etc.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Configuración del destino.
 */
export async function fetchFileTransferLocation(locationId, apiConfig) {
    const url = `${apiConfig.restUri}data/v1/filetransferlocation/${locationId}`;
    return await executeRestRequest(url, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } });
}

/**
 * Rastrea mediante SOAP la configuración (Remitente, Asunto) de un Email Send Definition.
 * @param {string} objectId - ObjectID del Definition de Envío.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Objeto base con descripción y correos (Subject, CC, Bcc).
 */
export async function fetchEmailSendDefinitionDetails(objectId, apiConfig) {
    const soapPayload = `
    <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
        <s:Header>
            <a:Action s:mustUnderstand="1">Retrieve</a:Action>
            <a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To>
            <fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth>
        </s:Header>
        <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
                <RetrieveRequest>
                    <ObjectType>EmailSendDefinition</ObjectType>
                    <Properties>Name</Properties>
                    <Properties>CustomerKey</Properties>
                    <Properties>Description</Properties>
                    <Properties>EmailSubject</Properties>
                    <Properties>CCEmail</Properties>
                    <Properties>BccEmail</Properties>
                    <Filter xsi:type="SimpleFilterPart">
                        <Property>ObjectID</Property>
                        <SimpleOperator>equals</SimpleOperator>
                        <Value>${objectId}</Value>
                    </Filter>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;

    try {
        const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
        const doc = new DOMParser().parseFromString(responseText, "application/xml");
        const result = doc.querySelector("Results");
        if (!result) return null;

        return {
            name: result.querySelector("Name")?.textContent,
            customerKey: result.querySelector("CustomerKey")?.textContent,
            description: result.querySelector("Description")?.textContent,
            subject: result.querySelector("EmailSubject")?.textContent,
            cc: result.querySelector("CCEmail")?.textContent,
            bcc: result.querySelector("BccEmail")?.textContent
        };
    } catch (e) {
        return null;
    }
}

/**
 * Helper Interno para paginar a través de colecciones REST (como todos los Scripts o Extracts)
 * y hacer un match exacto por nombre, key o id, evitando las limitaciones de los filtros nativos
 * ineficientes de MC. Recorre la colección UNA sola vez para todos los términos: antes se
 * repetía el recorrido completo por cada valor buscado.
 * @param {object} config - Mapping con endpoints y llaves de acceso del tipo de objeto.
 * @param {Array<string>} searchTerms - Lo que el usuario escribió.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Actividades localizadas.
 */
async function findActivitiesViaRest(config, searchTerms, apiConfig) {
    const { endpoint, idField, nameField, keyField, label } = config;
    let page = 1;
    let totalCount = 0;
    let allProcessed = 0;
    let lastPageCount = 0;
    const pending = new Set(searchTerms.map(t => t.toLowerCase()));
    const found = [];

    logger.logMessage(`Buscando ${pending.size} ${label}(s) vía REST (exhaustivo)...`);

    do {
        const url = `${apiConfig.restUri}${endpoint}?$page=${page}&$pageSize=${REST_PAGE_SIZE}`;
        const data = await executeRestRequest(url, {
            headers: { "Authorization": `Bearer ${apiConfig.accessToken}` }
        });

        const items = data.items || [];
        totalCount = data.count || 0;
        lastPageCount = items.length;
        allProcessed += items.length;

        for (const item of items) {
            const match = [item[idField], item[nameField], item[keyField]]
                .find(v => v && pending.has(String(v).toLowerCase()));

            if (match) {
                pending.delete(String(match).toLowerCase());
                found.push({
                    objectID: item[idField],
                    customerKey: item[keyField],
                    name: item[nameField],
                    typeLabel: label
                });
            }
        }

        // Se corta en cuanto están todos localizados, sin recorrer el resto de páginas.
        if (pending.size === 0) break;

        page++;
        // lastPageCount corta el bucle si la API deja de devolver elementos antes del total.
    } while (allProcessed < totalCount && totalCount > 0 && lastPageCount > 0);

    return found;
}

/**
 * Helper interno para actividades compatibles con SOAP. Realiza una búsqueda inyectando un OR
 * complejo entre "Name" o "CustomerKey" para encontrar lo que introdujo el usuario, contemplando exclusiones
 * de Status (Active) según el tipo de objeto.
 * @param {string} soapType - (QueryDefinition, EmailSendDefinition, etc).
 * @param {string} label - Texto legible asociado ("SQL Query").
 * @param {string} keyPropertyName - Normalmente CustomerKey.
 * @param {Array<string>} values - Textos de búsqueda a inyectar en el XML.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Coincidencias de búsqueda.
 */
async function findActivitiesInSoap(soapType, label, keyPropertyName, values, apiConfig) {
    try {
        return await retrieveActivitiesInSoap(soapType, label, keyPropertyName, values, apiConfig);
    } catch (e) {
        if (values.length === 1) {
            console.error(`Error buscando ${soapType}:`, e);
            return [];
        }
    }

    // Repliegue por si el tenant no admite el operador IN: se consulta término a término.
    const results = [];
    for (const value of values) {
        try {
            results.push(...await retrieveActivitiesInSoap(soapType, label, keyPropertyName, [value], apiConfig));
        } catch (e) {
            console.error(`Error buscando ${soapType} "${value}":`, e);
        }
    }
    return results;
}

/**
 * Lanza el Retrieve SOAP de actividades para un conjunto de términos y parsea la respuesta.
 * @param {string} soapType - (QueryDefinition, EmailSendDefinition, etc).
 * @param {string} label - Texto legible asociado ("SQL Query").
 * @param {string} keyPropertyName - Normalmente CustomerKey.
 * @param {Array<string>} values - Textos de búsqueda a inyectar en el XML.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Coincidencias de búsqueda.
 */
async function retrieveActivitiesInSoap(soapType, label, keyPropertyName, values, apiConfig) {
    // Un único Retrieve con IN para todos los términos, en vez de uno por término.
    const valuesXml = values.map(v => `<Value><![CDATA[${v}]]></Value>`).join('');
    const matchOperator = values.length === 1 ? 'equals' : 'IN';

    const nameOrKeyFilter = `
            <LeftOperand xsi:type="SimpleFilterPart">
                <Property>Name</Property>
                <SimpleOperator>${matchOperator}</SimpleOperator>
                ${valuesXml}
            </LeftOperand>
            <LogicalOperator>OR</LogicalOperator>
            <RightOperand xsi:type="SimpleFilterPart">
                <Property>${keyPropertyName}</Property>
                <SimpleOperator>${matchOperator}</SimpleOperator>
                ${valuesXml}
            </RightOperand>`;

    let filterXml = `
        <Filter xsi:type="ComplexFilterPart">
            ${nameOrKeyFilter}
        </Filter>`;

    if (soapType === 'QueryDefinition') {
        filterXml = `
        <Filter xsi:type="ComplexFilterPart">
            <LeftOperand xsi:type="ComplexFilterPart">
                ${nameOrKeyFilter}
            </LeftOperand>
            <LogicalOperator>AND</LogicalOperator>
            <RightOperand xsi:type="SimpleFilterPart">
                <Property>Status</Property>
                <SimpleOperator>equals</SimpleOperator>
                <Value>Active</Value>
            </RightOperand>
        </Filter>`;
    }

    const soapPayload = `
    <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <s:Header>
            <a:Action s:mustUnderstand="1">Retrieve</a:Action>
            <a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To>
            <fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth>
        </s:Header>
        <s:Body>
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
                <RetrieveRequest>
                    <ObjectType>${soapType}</ObjectType>
                    <Properties>ObjectID</Properties>
                    <Properties>CustomerKey</Properties>
                    <Properties>Name</Properties>
                    ${filterXml}
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const xmlDoc = new DOMParser().parseFromString(responseText, "application/xml");

    return Array.from(xmlDoc.querySelectorAll("Results")).map(result => ({
        objectID: result.querySelector("ObjectID")?.textContent,
        customerKey: result.querySelector("CustomerKey")?.textContent,
        name: result.querySelector("Name")?.textContent,
        typeLabel: label,
        soapType: soapType
    }));
}

/**
 * Realiza una búsqueda profunda cargando todo el código SSJS de todos los scripts y haciendo
 * un barrido string.includes() masivo en la máquina para encontrar un trozo de código o variable concreta.
 * @param {string} searchText - Fragmento literal de código SSJS a localizar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de todos los Scripts que en su código alojan dicho string.
 */
export async function searchScriptsByText(searchText, apiConfig) {
    let page = 1;
    let totalCount = 0;
    let allProcessed = 0;
    let lastPageCount = 0;
    const results = [];
    const term = searchText.toLowerCase();

    try {
        do {
            const url = `${apiConfig.restUri}automation/v1/scripts?$page=${page}&$pageSize=${REST_PAGE_SIZE}`;
            const data = await executeRestRequest(url, {
                headers: { "Authorization": `Bearer ${apiConfig.accessToken}` }
            });

            const items = data.items || [];
            totalCount = data.count || 0;
            lastPageCount = items.length;
            allProcessed += items.length;

            const matches = items.filter(s => s.script && s.script.toLowerCase().includes(term));
            
            matches.forEach(m => {
                if (m.ssjsActivityId) {
                    results.push({
                        objectID: m.ssjsActivityId,
                        customerKey: m.key,
                        name: m.name,
                        soapType: 'ScriptActivity',
                        typeLabel: 'Script'
                    });
                }
            });

            page++;
            // lastPageCount corta el bucle si la API deja de devolver elementos antes del total.
        } while (allProcessed < totalCount && totalCount > 0 && lastPageCount > 0);

        return results;
    } catch (error) {
        console.error("Error buscando texto en scripts:", error);
        throw error;
    }
}