// ===================================================================
// Fichero: api-search.js
// ===================================================================
import { executeSoapRequest, executeRestRequest, logger } from './api-core.js';
import { getFolderPath } from './api-helpers.js';

export async function searchDataExtensions(property, value, apiConfig) {
  const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>Name</Properties><Properties>CategoryID</Properties><Properties>ObjectID</Properties><Properties>CustomerKey</Properties><Filter xsi:type="SimpleFilterPart"><Property>${property}</Property><SimpleOperator>like</SimpleOperator><Value>%${value}%</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
  
  const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
  
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(responseText, "application/xml");
  const resultNodes = xmlDoc.querySelectorAll("Results");
  
  return Array.from(resultNodes).map(node => ({
    categoryId: node.querySelector("CategoryID")?.textContent,
    deName: node.querySelector("Name")?.textContent,
    objectID: node.querySelector("ObjectID")?.textContent, 
    customerKey: node.querySelector("CustomerKey")?.textContent 
  }));
}

export async function getDEObjectIdByName(deName, apiConfig) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Name</Property><SimpleOperator>equals</SimpleOperator><Value>${deName}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const objectIDNode = new DOMParser().parseFromString(responseText, "application/xml").querySelector("Results > ObjectID");
    if (!objectIDNode) {
        throw new Error(`No se encontró una Data Extension con el nombre exacto "${deName}".`);
    }
    return objectIDNode.textContent;
}

export async function getDataExtensionDetailsByName(deName, apiConfig) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>CustomerKey</Properties><Properties>ObjectID</Properties><Properties>CategoryID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Name</Property><SimpleOperator>equals</SimpleOperator><Value>${deName}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const resultNode = new DOMParser().parseFromString(responseText, "application/xml").querySelector("Results");

    if (!resultNode) {
        throw new Error(`No se pudo encontrar una Data Extension con el nombre exacto "${deName}".`);
    }
    
    return {
        customerKey: resultNode.querySelector("CustomerKey")?.textContent,
        objectID: resultNode.querySelector("ObjectID")?.textContent,
        categoryId: resultNode.querySelector("CategoryID")?.textContent
    };
}

export async function findImportsTargetingDE(deObjectId, apiConfig) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>ImportDefinition</ObjectType><Properties>Name</Properties><Properties>Description</Properties><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>DestinationObject.ObjectID</Property><SimpleOperator>equals</SimpleOperator><Value>${deObjectId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const importDefinitions = Array.from(new DOMParser().parseFromString(responseText, "application/xml").querySelectorAll("Results")).map(node => ({
        name: node.querySelector("Name")?.textContent || 'N/A',
        type: 'Import',
        description: node.querySelector("Description")?.textContent || '---',
        objectID: node.querySelector("ObjectID")?.textContent 
    }));

    const importsWithAutomations = await Promise.all(importDefinitions.map(async (imp) => {
        const automations = await findAutomationForActivity(imp.objectID, apiConfig);
        return { ...imp, automations }; 
    }));

    return importsWithAutomations;
}

export async function searchQueriesBySimpleFilter({ property, simpleOperator, value }, apiConfig) {
    const filterValue = simpleOperator === 'like' ? `%${value}%` : value;
    const filterXml = `<Filter xsi:type="SimpleFilterPart"><Property>${property}</Property><SimpleOperator>${simpleOperator}</SimpleOperator><Value>${filterValue}</Value></Filter>`;
    return findQueriesByFilter(filterXml, apiConfig);
}

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

export async function deleteQuery(queryObjectId, apiConfig) {
    const url = `${apiConfig.restUri}automation/v1/queries/${queryObjectId}`;
    const options = {
        method: 'DELETE',
        headers: { 
            "Authorization": `Bearer ${apiConfig.accessToken}`,
            "Content-Type": "application/json"
        }
    };
    return executeRestRequest(url, options);
}

async function findQueriesByFilter(filterXml, apiConfig) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>QueryDefinition</ObjectType><Properties>Name</Properties><Properties>QueryText</Properties><Properties>TargetUpdateType</Properties><Properties>ObjectID</Properties>${filterXml}</RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);

    const queries = Array.from(new DOMParser().parseFromString(responseText, "application/xml").querySelectorAll("Results")).map(node => ({
        name: node.querySelector("Name")?.textContent || 'N/A',
        type: 'Query',
        description: node.querySelector("QueryText")?.textContent || '---',
        action: node.querySelector("TargetUpdateType")?.textContent || 'N/A',
        objectID: node.querySelector("ObjectID")?.textContent
    }));

    const queriesWithAutomations = await Promise.all(queries.map(async (q) => {
        const automations = await findAutomationForActivity(q.objectID, apiConfig);
        return { ...q, automations }; 
    }));

    return queriesWithAutomations;
}

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

export async function fetchScriptDetails(id, apiConfig) {
    const url = `${apiConfig.restUri}automation/v1/scripts/${id}`;
    return await executeRestRequest(url, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } });
}

export async function fetchDataExtractDetails(id, apiConfig) {
    const url = `${apiConfig.restUri}automation/v1/dataextracts/${id}`;
    return await executeRestRequest(url, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } });
}

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

export async function fetchFileTransferDetails(id, apiConfig) {
    const url = `${apiConfig.restUri}automation/v1/filetransfers/${id}`;
    return await executeRestRequest(url, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } });
}

export async function fetchFileTransferLocation(locationId, apiConfig) {
    const url = `${apiConfig.restUri}data/v1/filetransferlocation/${locationId}`;
    return await executeRestRequest(url, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } });
}

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

export async function findDataFolders(folderName, contentType, apiConfig) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataFolder</ObjectType><Properties>Name</Properties><Properties>ID</Properties><Properties>ParentFolder.ID</Properties><Properties>ContentType</Properties><Filter xsi:type="ComplexFilterPart"><LeftOperand xsi:type="SimpleFilterPart"><Property>Name</Property><SimpleOperator>like</SimpleOperator><Value>%${folderName}%</Value></LeftOperand><LogicalOperator>AND</LogicalOperator><RightOperand xsi:type="SimpleFilterPart"><Property>ContentType</Property><SimpleOperator>equals</SimpleOperator><Value>${contentType}</Value></RightOperand></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(responseText, "application/xml");
    
    const folderNodes = Array.from(xmlDoc.querySelectorAll("Results"));
    const pathPromises = folderNodes.map(async (node) => {
        const id = node.querySelector("ID")?.textContent;
        const name = node.querySelector("Name")?.textContent;
        if (!id || !name) return null;
        const fullPath = await getFolderPath(id, apiConfig);
        return { id, name, fullPath };
    });
    
    return (await Promise.all(pathPromises)).filter(Boolean);
}

export async function getQueriesFromFolder(folderId, apiConfig) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>QueryDefinition</ObjectType><Properties>Name</Properties><Properties>CustomerKey</Properties><Properties>QueryText</Properties><Properties>TargetUpdateType</Properties><Properties>DataExtensionTarget.Name</Properties><Properties>DataExtensionTarget.CustomerKey</Properties><Filter xsi:type="ComplexFilterPart"><LeftOperand xsi:type="SimpleFilterPart"><Property>CategoryID</Property><SimpleOperator>equals</SimpleOperator><Value>${folderId}</Value></LeftOperand><LogicalOperator>AND</LogicalOperator><RightOperand xsi:type="SimpleFilterPart"><Property>Status</Property><SimpleOperator>equals</SimpleOperator><Value>Active</Value></RightOperand></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(responseText, "application/xml");

    return Array.from(xmlDoc.querySelectorAll("Results")).map(node => ({
        name: node.querySelector("Name")?.textContent,
        customerKey: node.querySelector("CustomerKey")?.textContent,
        queryText: node.querySelector("QueryText")?.textContent,
        updateType: node.querySelector("TargetUpdateType")?.textContent,
        targetDE: {
            name: node.querySelector("DataExtensionTarget > Name")?.textContent,
            customerKey: node.querySelector("DataExtensionTarget > CustomerKey")?.textContent
        }
    }));
}

export async function createClonedQuery(originalQuery, clonedDE, newQueryName, targetCategoryId, apiConfig) {
    const createPayload = `
    <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
        <s:Header>
            <a:Action s:mustUnderstand="1">Create</a:Action>
            <a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To>
            <fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth>
        </s:Header>
        <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
            <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
                <Objects xsi:type="QueryDefinition">
                    <CategoryID>${targetCategoryId}</CategoryID>
                    <CustomerKey></CustomerKey>
                    <Name>${newQueryName}</Name>
                    <QueryText><![CDATA[${originalQuery.queryText}]]></QueryText>
                    <TargetType>DE</TargetType>
                    <DataExtensionTarget>
                        <CustomerKey>${clonedDE.customerKey}</CustomerKey>
                        <Name>${clonedDE.name}</Name>
                    </DataExtensionTarget>
                    <TargetUpdateType>${originalQuery.updateType}</TargetUpdateType>
                </Objects>
            </CreateRequest>
        </s:Body>
    </s:Envelope>`;

    const createResponseText = await executeSoapRequest(apiConfig.soapUri, createPayload);
    const createDoc = new DOMParser().parseFromString(createResponseText, "application/xml");
    
    const newObjectID = createDoc.querySelector("Results > NewObjectID")?.textContent;

    if (!newObjectID) {
        throw new Error("La creación de la Query fue exitosa, pero no se pudo extraer el NewObjectID de la respuesta SOAP.");
    }

    return { objectID: newObjectID, name: newQueryName };
}

export async function fetchQueryDefinitionByCustomerKey(customerKey, apiConfig) {
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
                    <ObjectType>QueryDefinition</ObjectType>
                    <Properties>ObjectID</Properties>
                    <Properties>Name</Properties>
                    <Properties>CustomerKey</Properties>
                    <Properties>CategoryID</Properties>
                    <Filter xsi:type="SimpleFilterPart">
                        <Property>CustomerKey</Property>
                        <SimpleOperator>equals</SimpleOperator>
                        <Value>${customerKey}</Value>
                    </Filter>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;
    
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const resultNode = new DOMParser().parseFromString(responseText, "application/xml").querySelector("Results");
    
    if (!resultNode) {
        throw new Error(`No se pudo recuperar la Query Definition con CustomerKey: ${customerKey}`);
    }

    return {
        objectID: resultNode.querySelector("ObjectID")?.textContent,
        customerKey: resultNode.querySelector("CustomerKey")?.textContent,
        name: resultNode.querySelector("Name")?.textContent,
        categoryId: resultNode.querySelector("CategoryID")?.textContent
    };
}

export async function fetchQueryDefinitionDetails(queryObjectId, apiConfig) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
    <s:Header>
        <a:Action s:mustUnderstand="1">Retrieve</a:Action>
        <a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To>
        <fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth>
    </s:Header>
    <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <RetrieveRequest>
            <ObjectType>QueryDefinition</ObjectType>
            <Properties>Name</Properties>
            <Properties>Description</Properties>
            <Properties>CustomerKey</Properties>
            <Properties>QueryText</Properties>
            <Properties>TargetUpdateType</Properties>
            <Properties>DataExtensionTarget.Name</Properties>
            <Properties>DataExtensionTarget.CustomerKey</Properties>
            
            <Filter xsi:type="ComplexFilterPart">
            <LeftOperand xsi:type="SimpleFilterPart">
                <Property>ObjectID</Property>
                <SimpleOperator>equals</SimpleOperator>
                <Value>${queryObjectId}</Value>
            </LeftOperand>
            <LogicalOperator>AND</LogicalOperator>
            <RightOperand xsi:type="SimpleFilterPart">
                <Property>Status</Property>
                <SimpleOperator>equals</SimpleOperator>
                <Value>Active</Value>
            </RightOperand>
            </Filter>

        </RetrieveRequest>
        </RetrieveRequestMsg>
    </s:Body>
    </s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const resultNode = new DOMParser().parseFromString(responseText, "application/xml").querySelector("Results");
    if (!resultNode) throw new Error(`No se encontró Query Definition`);

    return {
        name: resultNode.querySelector("Name")?.textContent,
        customerKey: resultNode.querySelector("CustomerKey")?.textContent,
        description: resultNode.querySelector("Description")?.textContent,
        queryText: resultNode.querySelector("QueryText")?.textContent,
        updateType: resultNode.querySelector("TargetUpdateType")?.textContent,
        targetDE: {
            name: resultNode.querySelector("DataExtensionTarget > Name")?.textContent,
            key: resultNode.querySelector("DataExtensionTarget > CustomerKey")?.textContent
        }
    };
}

export async function createFolder(folderName, parentId, contentType, apiConfig) {
    switch (contentType.toLowerCase()) {
        case 'journey': {
            const url = `${apiConfig.restUri}email/v1/Category`;
            const payload = {
                "Name": folderName,
                "ParentCatId": parentId,
                "CatType": "journey"
            };
            const options = {
                method: 'POST',
                headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            };
            const responseData = await executeRestRequest(url, options);

            if (!responseData || !responseData.categoryId) {
                throw new Error("La respuesta de la API de Journeys no incluyó un 'id'.");
            }
            return responseData.categoryId;
        }

        case 'asset':
        case 'contentbuilder': { 
            const url = `${apiConfig.restUri}asset/v1/content/categories`;
            const payload = {
                "Name": folderName,
                "ParentId": parentId
            };
            const options = {
                method: 'POST',
                headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            };
            const responseData = await executeRestRequest(url, options);

            if (!responseData || !responseData.id) {
                throw new Error("La respuesta de la API de Assets no incluyó un 'id'.");
            }
            return responseData.id;
        }

        default: {
            const customerKey = crypto.randomUUID();
            const clientXml = apiConfig.businessUnit ? `<Client><ClientID>${apiConfig.businessUnit}</ClientID></Client>` : '';

            const soapPayload = `
            <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
                <s:Header>
                    <a:Action s:mustUnderstand="1">Create</a:Action>
                    <a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To>
                    <fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth>
                </s:Header>
                <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                    <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
                        <Objects xsi:type="DataFolder">
                            ${clientXml}
                            <CustomerKey>${customerKey}</CustomerKey>
                            <Name>${folderName}</Name>
                            <Description></Description>
                            <ContentType>${contentType}</ContentType>
                            <IsActive>true</IsActive>
                            <IsEditable>true</IsEditable>
                            <AllowChildren>true</AllowChildren>
                            <ParentFolder>
                                <ID>${parentId}</ID>
                            </ParentFolder>
                        </Objects>
                    </CreateRequest>
                </s:Body>
            </s:Envelope>`;

            const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
            const doc = new DOMParser().parseFromString(responseText, "application/xml");
            const newIdNode = doc.querySelector("Results > NewID");
            const status = doc.querySelector("Results > StatusCode")?.textContent;
            
            if (status !== 'OK' || !newIdNode) {
                const errorMessage = doc.querySelector("Results > StatusMessage")?.textContent || "Error desconocido al crear la carpeta con SOAP.";
                throw new Error(`No se pudo crear la carpeta "${folderName}": ${errorMessage}`);
            }

            return newIdNode.textContent;
        }
    }
}