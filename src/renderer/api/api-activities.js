// ===================================================================
// Fichero: api-activities.js
// Descripción: Búsqueda y recuperación de detalles de Actividades varias 
// (Scripts, Extracts, Transfers, Emails, Imports)
// ===================================================================
import { executeSoapRequest, executeRestRequest, logger } from './api-core.js';

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
            const url = `${apiConfig.restUri}automation/v1/automations/${automationId}`;
            const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
            try {
                const autoData = await executeRestRequest(url, options);
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
                result.push({ automationName: autoData.name || 'N/A', step: stepName });
            } catch (error) {
                result.push({ automationName: `Error (${automationId})`, step: '---' });
            }
        }
    } catch (e) {
        console.error("Error en findAutomationForActivity:", e);
    }
    return result;
}

/**
 * Es un "enrutador" que dirige búsquedas por un término específico dependiendo del tipo de actividad:
 * Si es de automatismos modernos (Scripts, FileTransfer...) lanza peticiones REST iterativas. 
 * Si es Legacy (Queries, Sends) enruta hacia SOAP.
 * @param {string} type - Tipo interno de actividad (Ej: "Script", "FilterActivity").
 * @param {string} value - El nombre o ID a rastrear.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object|null>} Resultado mapeado con el identificador final encontrado.
 */
export async function searchActivityTargeted(type, value, apiConfig) {
    const restMappings = {
        'Script': { endpoint: 'automation/v1/scripts', idField: 'ssjsActivityId', nameField: 'name', keyField: 'key', label: 'Script' },
        'FileTransferActivity': { endpoint: 'automation/v1/fileTransfers', idField: 'id', nameField: 'name', keyField: 'customerKey', label: 'File Transfer' },
        'DataExtractActivity': { endpoint: 'automation/v1/dataextracts', idField: 'dataExtractDefinitionId', nameField: 'name', keyField: 'key', label: 'Data Extract' },
        'FilterActivity': { endpoint: 'automation/v1/filters', idField: 'filterActivityId', nameField: 'name', keyField: 'customerKey', label: 'Filter' }
    };

    if (restMappings[type]) {
        return await findActivityViaRest(restMappings[type], value, apiConfig);
    }

    const soapLabels = {
        'QueryDefinition': 'SQL Query',
        'ImportDefinition': 'Data Copy or Import',
        'EmailSendDefinition': 'Send Email'
    };

    return await findActivityInSoap(type, soapLabels[type], 'CustomerKey', value, apiConfig);
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
 * Helper Interno para paginar exhaustivamente a través de colecciones REST (como todos los Scripts o Extracts)
 * y hacer un match exacto por nombre, key o id, evitando las limitaciones de los filtros nativos ineficientes de MC.
 * @param {object} config - Mapping con endpoints y llaves de acceso del tipo de objeto.
 * @param {string} searchTerm - Lo que el usuario escribió.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object|null>} Información localizada de la actividad o null.
 */
async function findActivityViaRest(config, searchTerm, apiConfig) {
    const { endpoint, idField, nameField, keyField, label } = config;
    let page = 1;
    const pageSize = 50; 
    let totalCount = 0;
    let allProcessed = 0;
    const term = searchTerm.toLowerCase();

    logger.logMessage(`Buscando ${label} vía REST (exhaustivo)...`);

    do {
        const url = `${apiConfig.restUri}${endpoint}?$page=${page}&$pageSize=${pageSize}`;
        const data = await executeRestRequest(url, { 
            headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } 
        });

        const items = data.items || [];
        totalCount = data.count || 0;
        allProcessed += items.length;

        const found = items.find(i => 
            (i[idField] && i[idField].toLowerCase() === term) ||
            (i[nameField] && i[nameField].toLowerCase() === term) ||
            (i[keyField] && i[keyField].toLowerCase() === term)
        );

        if (found) {
            return { 
                objectID: found[idField], 
                customerKey: found[keyField], 
                name: found[nameField], 
                typeLabel: label 
            };
        }

        page++;
    } while (allProcessed < totalCount && totalCount > 0);

    return null;
}

/**
 * Helper interno para actividades compatibles con SOAP. Realiza una búsqueda inyectando un OR
 * complejo entre "Name" o "CustomerKey" para encontrar lo que introdujo el usuario, contemplando exclusiones
 * de Status (Active) según el tipo de objeto.
 * @param {string} soapType - (QueryDefinition, EmailSendDefinition, etc).
 * @param {string} label - Texto legible asociado ("SQL Query").
 * @param {string} keyPropertyName - Normalmente CustomerKey.
 * @param {string} value - Texto de búsqueda a inyectar en el XML.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Coincidencias de búsqueda.
 */
async function findActivityInSoap(soapType, label, keyPropertyName, value, apiConfig) {
    try {
        let filterXml = `
            <Filter xsi:type="ComplexFilterPart">
                <LeftOperand xsi:type="SimpleFilterPart">
                    <Property>Name</Property>
                    <SimpleOperator>equals</SimpleOperator>
                    <Value><![CDATA[${value}]]></Value>
                </LeftOperand>
                <LogicalOperator>OR</LogicalOperator>
                <RightOperand xsi:type="SimpleFilterPart">
                    <Property>${keyPropertyName}</Property>
                    <SimpleOperator>equals</SimpleOperator>
                    <Value><![CDATA[${value}]]></Value>
                </RightOperand>
            </Filter>`;

        if (soapType === 'QueryDefinition') {
            filterXml = `
            <Filter xsi:type="ComplexFilterPart">
                <LeftOperand xsi:type="ComplexFilterPart">
                    <LeftOperand xsi:type="SimpleFilterPart">
                        <Property>Name</Property>
                        <SimpleOperator>equals</SimpleOperator>
                        <Value><![CDATA[${value}]]></Value>
                    </LeftOperand>
                    <LogicalOperator>OR</LogicalOperator>
                    <RightOperand xsi:type="SimpleFilterPart">
                        <Property>${keyPropertyName}</Property>
                        <SimpleOperator>equals</SimpleOperator>
                        <Value><![CDATA[${value}]]></Value>
                    </RightOperand>
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
        const results = xmlDoc.querySelectorAll("Results");

        if (results.length > 0) {
            return Array.from(results).map(result => ({
                objectID: result.querySelector("ObjectID")?.textContent,
                customerKey: result.querySelector("CustomerKey")?.textContent,
                name: result.querySelector("Name")?.textContent,
                typeLabel: label,
                soapType: soapType
            }));
        }
        return [];
    } catch (e) { 
        console.error(`Error buscando ${soapType}:`, e);
    }
    return null;
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
    const pageSize = 50; 
    let totalCount = 0;
    let allProcessed = 0;
    const results = [];
    const term = searchText.toLowerCase();

    try {
        do {
            const url = `${apiConfig.restUri}automation/v1/scripts?$page=${page}&$pageSize=${pageSize}`;
            const data = await executeRestRequest(url, { 
                headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } 
            });

            const items = data.items || [];
            totalCount = data.count || 0;
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
        } while (allProcessed < totalCount && totalCount > 0);

        return results;
    } catch (error) {
        console.error("Error buscando texto en scripts:", error);
        throw error;
    }
}