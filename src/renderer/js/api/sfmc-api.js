// RUTA: src/renderer/js/api/sfmc-api.js

/**
 * @file Módulo de comunicación con SFMC.
 * Este módulo NO hace llamadas fetch directamente. Prepara los datos de la petición
 * y los envía a través del puente de Electron (preload.js) para que el proceso
 * principal (`main.js`) ejecute la llamada de red real, evitando así problemas de CORS.
 */

/**
 * Función interna que actúa como un reemplazo de 'fetch'.
 * Envía los detalles de la petición al proceso principal a través del puente IPC.
 * @param {string} url - La URL del endpoint de la API.
 * @param {object} options - Un objeto similar a las opciones de fetch: { method, headers, body }.
 * @returns {Promise<any>} El cuerpo de la respuesta, parseado si es JSON.
 */
async function callThroughBridge(url, options) {
    try {
        // Llama a la función expuesta en preload.js. Esta es la única comunicación con el exterior.
        const response = await window.electronAPI.makeApiCall({ url, options });

        // El proceso principal devuelve el cuerpo como texto. Intentamos parsearlo.
        let body;
        try {
            body = JSON.parse(response.body);
        } catch (e) {
            body = response.body; // Si falla el parseo, es texto (XML/SOAP).
        }

        // Si el código de estado indica un error, lanzamos una excepción.
        if (response.status < 200 || response.status >= 300) {
            const errorMessage = body.error_description || body.message || (typeof body === 'string' ? body : `Error ${response.status}`);
            // Para errores SOAP, el mensaje útil está dentro del XML.
            if (typeof body === 'string' && body.includes('<StatusMessage>')) {
                const errorMatch = body.match(/<StatusMessage>(.*?)<\/StatusMessage>/);
                if (errorMatch) throw new Error(errorMatch[1]);
            }
            throw new Error(errorMessage);
        }

        return body;
    } catch (error) {
        console.error("Error en la llamada a través del puente IPC:", error);
        throw new Error(error.message || 'Fallo la comunicación con el proceso principal');
    }
}

/**
 * Obtiene un token de autenticación de SFMC.
 */
export async function getToken(creds) {
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            "grant_type": "client_credentials",
            "client_id": creds.clientId,
            "client_secret": creds.clientSecret,
            "account_id": creds.businessUnit
        })
    };
    const data = await callThroughBridge(creds.authUri, options);
    
    data.soap_instance_url_formatted = data.soap_instance_url ? data.soap_instance_url + 'Service.asmx' : '';
    data.rest_instance_url_formatted = data.rest_instance_url || '';
    return data;
}

/**
 * Recupera todos los campos de una Data Extension.
 */
export async function getDEFields(config, deExternalKey) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtensionField</ObjectType><Properties>Name</Properties><Properties>ObjectID</Properties><Properties>CustomerKey</Properties><Properties>FieldType</Properties><Properties>IsPrimaryKey</Properties><Properties>IsRequired</Properties><Properties>MaxLength</Properties><Properties>Ordinal</Properties><Properties>Scale</Properties><Properties>DefaultValue</Properties><Filter xsi:type="SimpleFilterPart"><Property>DataExtension.CustomerKey</Property><SimpleOperator>equals</SimpleOperator><Value>${deExternalKey}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        body: soapPayload
    };
    const responseText = await callThroughBridge(config.soapUri, options);
    
    const fields = [];
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(responseText, "application/xml");
    const resultsNodes = xmlDoc.querySelectorAll("Results");
    if (resultsNodes.length === 0 && !responseText.includes("OK")) {
        throw new Error("No se encontraron campos o la DE no existe.");
    }
    const getText = (node, tagName) => node.querySelector(tagName)?.textContent || '';
    resultsNodes.forEach(node => {
        const fieldType = getText(node, 'FieldType');
        let length = getText(node, 'MaxLength');
        if (fieldType.toLowerCase() === 'decimal') {
            const scale = getText(node, 'Scale');
            if (scale && scale !== '0') length = `${length},${scale}`;
        }
        fields.push({
            mc: getText(node, 'Name'), type: fieldType, len: length,
            defaultValue: getText(node, 'DefaultValue'),
            pk: getText(node, 'IsPrimaryKey') === 'true',
            req: getText(node, 'IsRequired') === 'true',
            ordinal: parseInt(getText(node, 'Ordinal'), 10) || 0,
            objectId: getText(node, 'ObjectID')
        });
    });
    return fields.sort((a, b) => a.ordinal - b.ordinal);
}

/**
 * Elimina un campo de una Data Extension.
 */
export async function deleteDEField(config, deExternalKey, fieldObjectId) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth><a:Action s:mustUnderstand="1">Delete</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To></s:Header><s:Body xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension"><CustomerKey>${deExternalKey}</CustomerKey><Fields><Field><ObjectID>${fieldObjectId}</ObjectID></Field></Fields></Objects></DeleteRequest></s:Body></s:Envelope>`;
    const options = { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload };
    return await callThroughBridge(config.soapUri, options);
}

const buildFieldXml = (field) => {
    const customerKey = field.name;
    let fieldXml = '';
    const commonNodes = `<CustomerKey>${customerKey}</CustomerKey><Name>${field.name}</Name><IsRequired>${field.isPrimaryKey ? true : field.isRequired}</IsRequired><IsPrimaryKey>${field.isPrimaryKey}</IsPrimaryKey>`;
    const defaultValueNode = field.defaultValue ? `<DefaultValue>${field.defaultValue}</DefaultValue>` : '';
    switch (field.type.toLowerCase()) {
        case 'text': fieldXml = `<Field>${commonNodes}<FieldType>Text</FieldType>${field.length ? `<MaxLength>${field.length}</MaxLength>` : ''}${defaultValueNode}</Field>`; break;
        case 'number': fieldXml = `<Field>${commonNodes}<FieldType>Number</FieldType>${defaultValueNode}</Field>`; break;
        case 'date': fieldXml = `<Field>${commonNodes}<FieldType>Date</FieldType>${defaultValueNode}</Field>`; break;
        case 'boolean': fieldXml = `<Field>${commonNodes}<FieldType>Boolean</FieldType>${defaultValueNode}</Field>`; break;
        case 'emailaddress': fieldXml = `<Field>${commonNodes}<FieldType>EmailAddress</FieldType><MaxLength>254</MaxLength></Field>`; break;
        case 'phone': fieldXml = `<Field>${commonNodes}<FieldType>Phone</FieldType><MaxLength>50</MaxLength></Field>`; break;
        case 'locale': fieldXml = `<Field>${commonNodes}<FieldType>Locale</FieldType><MaxLength>5</MaxLength></Field>`; break;
        case 'decimal':
            const [maxLength, scale] = (field.length || '18,0').split(',').map(s => s.trim());
            fieldXml = `<Field>${commonNodes}<FieldType>Decimal</FieldType>${maxLength ? `<MaxLength>${maxLength}</MaxLength>` : ''}${scale ? `<Scale>${scale}</Scale>` : ''}${defaultValueNode}</Field>`;
            break;
        default: return '';
    }
    return fieldXml;
};

/**
 * Crea o actualiza campos en una Data Extension (Upsert).
 */
export async function createOrUpdateDEFields(config, deExternalKey, fieldsData) {
    const fieldsXmlString = fieldsData.map(buildFieldXml).join('');
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Update</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Options /><Objects xsi:type="DataExtension"><CustomerKey>${deExternalKey}</CustomerKey><Fields>${fieldsXmlString}</Fields></Objects></UpdateRequest></s:Body></s:Envelope>`;
    const options = { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload };
    return await callThroughBridge(config.soapUri, options);
}

/**
 * Crea una nueva Data Extension.
 */
export async function createDataExtension(config, deData, fieldsData) {
    const fieldsXmlString = fieldsData.map(buildFieldXml).join('');
    const clientXml = config.businessUnit ? `<Client><ID>${config.businessUnit}</ID></Client>` : '';
    const descriptionXml = deData.description ? `<Description>${deData.description}</Description>` : '';
    const folderXml = deData.folderId ? `<CategoryID>${deData.folderId}</CategoryID>` : '';
    let sendableXml = '';
    if (deData.isSendable) {
        sendableXml = `<SendableDataExtensionField><CustomerKey>${deData.subscriberKey}</CustomerKey><Name>${deData.subscriberKey}</Name><FieldType>${deData.subscriberKeyType}</FieldType></SendableDataExtensionField><SendableSubscriberField><Name>Subscriber Key</Name><Value/></SendableSubscriberField>`;
    }

    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Create</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension">${clientXml}<CustomerKey>${deData.externalKey}</CustomerKey>${descriptionXml}<Name>${deData.name}</Name>${folderXml}<IsSendable>${deData.isSendable}</IsSendable>${sendableXml}<Fields>${fieldsXmlString}</Fields></Objects></CreateRequest></s:Body></s:Envelope>`;
    const options = { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload };
    return await callThroughBridge(config.soapUri, options);
}

/**
 * Busca una Data Extension por Nombre o CustomerKey.
 */
export async function findDE(config, property, value) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>Name</Properties><Properties>CategoryID</Properties><Filter xsi:type="SimpleFilterPart"><Property>${property}</Property><SimpleOperator>equals</SimpleOperator><Value>${value}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    const options = { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload };
    const responseText = await callThroughBridge(config.soapUri, options);
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(responseText, "application/xml");
    const resultNode = xmlDoc.querySelector("Results");
    if (!resultNode) throw new Error("No se encontró la Data Extension con los criterios especificados.");
    
    const categoryId = resultNode.querySelector("CategoryID")?.textContent;
    const deName = resultNode.querySelector("Name")?.textContent;
    return { categoryId: parseInt(categoryId, 10) || 0, deName };
}

/**
 * Recupera la ruta completa de una carpeta de forma recursiva.
 */
export async function getFolderPath(config, folderId) {
    if (!folderId || folderId === 0) return '';
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataFolder</ObjectType><Properties>Name</Properties><Properties>ParentFolder.ID</Properties><Filter xsi:type="SimpleFilterPart"><Property>ID</Property><SimpleOperator>equals</SimpleOperator><Value>${folderId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    const options = { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapPayload };
    const responseText = await callThroughBridge(config.soapUri, options);

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(responseText, "application/xml");
    const resultNode = xmlDoc.querySelector("Results");
    if(!resultNode) return '';

    const name = resultNode.querySelector("Name")?.textContent;
    const parentId = resultNode.querySelector("ParentFolder > ID")?.textContent;

    const parentPath = await getFolderPath(config, parentId);
    return parentPath ? `${parentPath} > ${name}` : name;
}

/**
 * Valida una dirección de email usando la API REST.
 */
export async function validateEmail(config, email) {
    const validateUrl = `${config.restUri}address/v1/validateEmail`;
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.token}` },
        body: JSON.stringify({
            "email": email,
            "validators": ["SyntaxValidator", "MXValidator", "ListDetectiveValidator"]
        })
    };
    return await callThroughBridge(validateUrl, options);
}

/**
 * Obtiene todas las automatizaciones de Journeys programadas.
 */
export async function getScheduledJourneyAutomations(config) {
    let allItems = [];
    let page = 1;
    let totalPages = 1;

    const options = { method: 'GET', headers: { 'Authorization': `Bearer ${config.token}` } };
    do {
        const url = `${config.restUri}automation/v1/automations?$page=${page}`;
        const data = await callThroughBridge(url, options);
        allItems.push(...data.items);
        totalPages = Math.ceil(data.count / data.pageSize);
        page++;
    } while (page <= totalPages);

    const scheduledItems = allItems.filter(item => 
        item.schedule && (item.schedule.scheduleStatus === 'Scheduled' || item.schedule.scheduleStatus === 'active')
    );

    const journeyAutomations = [];
    for (const item of scheduledItems) {
        const detailUrl = `${config.restUri}automation/v1/automations/${item.id}`;
        const detailData = await callThroughBridge(detailUrl, options);
        if (detailData.steps && detailData.steps.some(step => step.activities.some(activity => activity.objectTypeId === 952))) {
            journeyAutomations.push(item);
        }
    }
    return journeyAutomations;
}

// --- FUNCIONES PARA BUSCADOR DE ORÍGENES ---

async function findAutomationForActivity(config, activityObjectId) {
    try {
        const url = `${config.restUri}automation/v1/activities/${activityObjectId}/automations`;
        const options = { method: 'GET', headers: { 'Authorization': `Bearer ${config.token}` } };
        const data = await callThroughBridge(url, options);
        if (data.items && data.items.length > 0) {
            const auto = data.items[0];
            const detailUrl = `${config.restUri}automation/v1/automations/${auto.id}`;
            const autoDetail = await callThroughBridge(detailUrl, options);
            let step = 'N/A';
            autoDetail.steps?.forEach(s => {
                s.activities?.forEach(a => { if(a.activityObjectId === activityObjectId) step = s.step; });
            });
            return { automationName: autoDetail.name, step: step };
        }
    } catch (error) {
        console.warn(`No se pudo encontrar automatización para la actividad ${activityObjectId}:`, error.message);
    }
    return { automationName: '---', step: '---' };
}

/**
 * Orquesta la búsqueda de todos los orígenes de datos para una DE.
 */
export async function findDataSources(config, deName) {
    const getDeObjectId = async () => {
        const payload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Name</Property><SimpleOperator>equals</SimpleOperator><Value>${deName}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
        const options = { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: payload };
        const text = await callThroughBridge(config.soapUri, options);
        const xml = new DOMParser().parseFromString(text, "application/xml");
        const node = xml.querySelector("Results > ObjectID");
        if (!node) throw new Error(`No se encontró una DE con el nombre "${deName}".`);
        return node.textContent;
    };
    
    const findImports = async (deObjectId) => {
        const payload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>ImportDefinition</ObjectType><Properties>Name</Properties><Properties>Description</Properties><Filter xsi:type="SimpleFilterPart"><Property>DestinationObject.ObjectID</Property><SimpleOperator>equals</SimpleOperator><Value>${deObjectId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
        const options = { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: payload };
        const text = await callThroughBridge(config.soapUri, options);
        const imports = [];
        const xml = new DOMParser().parseFromString(text, "application/xml");
        xml.querySelectorAll("Results").forEach(node => imports.push({
            name: node.querySelector("Name")?.textContent || '', type: 'Import',
            description: node.querySelector("Description")?.textContent || '',
            automationName: 'N/A', step: 'N/A', action: 'N/A'
        }));
        return imports;
    };
    
    const findQueries = async () => {
        const payload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${config.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${config.token}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>QueryDefinition</ObjectType><Properties>Name</Properties><Properties>QueryText</Properties><Properties>TargetUpdateType</Properties><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>DataExtensionTarget.Name</Property><SimpleOperator>equals</SimpleOperator><Value>${deName}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
        const options = { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: payload };
        const text = await callThroughBridge(config.soapUri, options);
        const queries = [];
        const xml = new DOMParser().parseFromString(text, "application/xml");
        xml.querySelectorAll("Results").forEach(node => queries.push({
            name: node.querySelector("Name")?.textContent || '', type: 'Query',
            description: node.querySelector("QueryText")?.textContent || '',
            action: node.querySelector("TargetUpdateType")?.textContent || '',
            objectID: node.querySelector("ObjectID")?.textContent || '',
        }));
        return queries;
    };

    const deObjectId = await getDeObjectId();
    const [imports, queries] = await Promise.all([findImports(deObjectId), findQueries()]);
    const queriesWithAutomation = await Promise.all(
        queries.map(async (q) => ({ ...q, ...(await findAutomationForActivity(config, q.objectID)) }))
    );
    return [...imports, ...queriesWithAutomation].sort((a, b) => a.name.localeCompare(b.name));
}