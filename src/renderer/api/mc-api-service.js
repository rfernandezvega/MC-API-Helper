// ===================================================================
// Fichero: mc-api-service.js
// Descripción: Módulo centralizado para todas las interacciones con las
// APIs de Marketing Cloud (REST y SOAP). No contiene lógica de DOM ni logs de UI.
// ===================================================================

// Caché en memoria para almacenar las rutas de carpetas ya resueltas.
// Se resetea cada vez que la aplicación se recarga por completo.
const folderPathCache = new Map();

// Objeto para registrar las llamadas. Será "inyectado" desde app.js
let logger = {
    logApiCall: () => {}, // Funciones vacías por defecto
    logApiResponse: () => {}
};

/**
 * Permite a un módulo externo (como app.js) inyectar sus propias funciones de logging.
 * @param {object} loggerInstance - Un objeto con los métodos logApiCall y logApiResponse.
 */
export function setLogger(loggerInstance) {
    if (loggerInstance && loggerInstance.logApiCall && loggerInstance.logApiResponse) {
        logger = loggerInstance;
    }
}


// ==========================================================
// --- 1. AUTOMATIONS API ---
// ==========================================================

/**
 * Recupera la lista completa de todas las definiciones de automatismos (API REST).
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<Array>} Una promesa que resuelve con la lista de automatismos.
 * @throws {Error} Si la llamada a la API falla.
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
 * Activa la programación de un automatismo.
 * Encapsula la lógica de obtener primero los detalles para el scheduleObject.
 * @param {string} automationId - El ID del automatismo a activar.
 * @param {object} apiConfig - El objeto de configuración de API.
 * @returns {Promise<object>} La respuesta de la API.
 */
export async function activateAutomation(automationId, apiConfig) {
    // 1. Obtener detalles para conseguir el scheduleObject.
    const detailsUrl = `${apiConfig.restUri}legacy/v1/beta/bulk/automations/automation/definition/${automationId}`;
    const autoDetails = await executeRestRequest(detailsUrl, { 
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } 
    });

    if (!autoDetails.scheduleObject?.id) {
        throw new Error("No se encontró un 'scheduleObject.id' para poder activar el automatismo.");
    }
    
    // 2. Construir el payload y ejecutar la acción de activación.
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
 * Lanza una ejecución única de un automatismo.
 * @param {string} automationId - El ID del automatismo a ejecutar.
 * @param {object} apiConfig - El objeto de configuración de API.
 * @returns {Promise<object>} La respuesta de la API.
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
 * Pausa la programación de un automatismo.
 * @param {string} automationId - El ID del automatismo a pausar.
 * @param {object} apiConfig - El objeto de configuración de API.
 * @returns {Promise<object>} La respuesta de la API.
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
 * Recupera los detalles completos de un automatismo, incluyendo sus pasos y actividades (API REST v1).
 * @param {string} automationId - El ID del automatismo.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<object>} Una promesa que resuelve con el objeto de detalle del automatismo.
 */
export async function fetchAutomationDetailsById(automationId, apiConfig) {
    const url = `${apiConfig.restUri}automation/v1/automations/${automationId}`;
    const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
    return await executeRestRequest(url, options);
}


/**
 * Crea un nuevo automatismo a partir de un payload definido (API REST v1).
 * @param {object} automationPayload - El cuerpo (body) de la petición para crear el automatismo.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<object>} Una promesa que resuelve con el objeto del nuevo automatismo creado.
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
 * Busca un automatismo por su nombre exacto (API REST v1).
 * @param {string} automationName - El nombre del automatismo a buscar.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<Array>} Una promesa que resuelve con la lista de automatismos encontrados (puede estar vacía).
 */
export async function findAutomationByName(automationName, apiConfig) {
    const encodedName = encodeURIComponent(automationName);
    const url = `${apiConfig.restUri}automation/v1/automations?$filter=name%20eq%20'${encodedName}'`;
    const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
    const data = await executeRestRequest(url, options);
    return data.items || [];
}

/**
 * Recupera la configuración de notificaciones de un automatismo específico.
 * @param {string} automationId - El ID del automatismo.
 * @param {object} apiConfig - El objeto de configuración de API.
 * @returns {Promise<object>} La respuesta con los workers de notificación.
 */
export async function fetchAutomationNotifications(automationId, apiConfig) {
    // Nota: El endpoint es /legacy/v1/beta/automations/notifications/ (sin el "bulk")
    const url = `${apiConfig.restUri}/legacy/v1/beta/automations/notifications/${automationId}`;
    const options = { 
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } 
    };
    return await executeRestRequest(url, options);
}

// ==========================================================
// --- 2. DATA EXTENSIONS & FIELDS API (SOAP & REST) ---
// ==========================================================

/**
 * Recupera todos los campos de una Data Extension específica usando la API SOAP.
 * @param {string} customerKey - La External Key de la Data Extension.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<Array>} Una promesa que resuelve con la lista de campos de la DE.
 * @throws {Error} Si la llamada a la API SOAP falla.
 */
export async function fetchFieldsForDE(customerKey, apiConfig) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtensionField</ObjectType><Properties>Name</Properties><Properties>ObjectID</Properties><Properties>CustomerKey</Properties><Properties>FieldType</Properties><Properties>IsPrimaryKey</Properties><Properties>IsRequired</Properties><Properties>MaxLength</Properties><Properties>Ordinal</Properties><Properties>Scale</Properties><Properties>DefaultValue</Properties><Filter xsi:type="SimpleFilterPart"><Property>DataExtension.CustomerKey</Property><SimpleOperator>equals</SimpleOperator><Value>${customerKey}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    return await parseFullSoapFieldsAsync(responseText);
}

/**
 * Crea una nueva Data Extension con sus campos usando la API SOAP.
 * @param {object} deData - Un objeto que contiene los detalles de la DE.
 * @param {string} deData.name - Nombre de la DE.
 * @param {string} deData.externalKey - External Key de la DE.
 * @param {string} deData.description - Descripción.
 * @param {string} deData.folderId - ID de la carpeta (opcional).
 * @param {boolean} deData.isSendable - Si la DE es sendable.
 * @param {string} deData.subscriberKeyField - El campo que actúa como Subscriber Key.
 * @param {string} deData.subscriberKeyType - El tipo de dato del campo Subscriber Key.
 * @param {Array} deData.fields - Un array con los objetos de los campos.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<boolean>} Resuelve a true si la creación fue exitosa.
 * @throws {Error} Si la llamada a la API SOAP falla.
 */
export async function createDataExtension(deData, apiConfig) {
  const clientXml = apiConfig.businessUnit ? `<Client><ClientID>${apiConfig.businessUnit}</ClientID></Client>` : '';
  const descriptionXml = deData.description ? `<Description>${deData.description}</Description>` : '';
  const folderXml = deData.folderId ? `<CategoryID>${deData.folderId}</CategoryID>` : '';
  
  const sendableXml = deData.isSendable 
    ? `<SendableDataExtensionField><CustomerKey>${deData.subscriberKeyField}</CustomerKey><Name>${deData.subscriberKeyField}</Name><FieldType>${deData.subscriberKeyType}</FieldType></SendableDataExtensionField><SendableSubscriberField><Name>Subscriber Key</Name><Value/></SendableSubscriberField>` 
    : '';
    
  const fieldsXmlString = deData.fields.map(buildFieldXml).join('');

  const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Create</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension">${clientXml}<CustomerKey>${deData.externalKey}</CustomerKey>${descriptionXml}<Name>${deData.name}</Name>${folderXml}<IsSendable>${deData.isSendable}</IsSendable>${sendableXml}<Fields>${fieldsXmlString}</Fields></Objects></CreateRequest></s:Body></s:Envelope>`;

  await executeSoapRequest(apiConfig.soapUri, soapPayload.trim());
  return true; // Éxito
}

/**
 * Crea o actualiza (upsert) campos en una Data Extension existente.
 * @param {string} externalKey - La External Key de la DE a modificar.
 * @param {Array} fields - Un array con los objetos de los campos a añadir/actualizar.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<boolean>} Resuelve a true si la operación fue exitosa.
 */
export async function createOrUpdateFields(externalKey, fields, apiConfig) {
  const fieldsXmlString = fields.map(buildFieldXml).join('');
  const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Update</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension"><CustomerKey>${externalKey}</CustomerKey><Fields>${fieldsXmlString}</Fields></Objects></UpdateRequest></s:Body></s:Envelope>`;

  await executeSoapRequest(apiConfig.soapUri, soapPayload.trim());
  return true;
}

/**
 * Elimina un campo específico de una Data Extension.
 * @param {string} deExternalKey - La External Key de la DE que contiene el campo.
 * @param {string} fieldObjectId - El ObjectID del campo a eliminar.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<boolean>} Resuelve a true si el borrado fue exitoso.
 */
export async function deleteDataExtensionField(deExternalKey, fieldObjectId, apiConfig) {
  // 1. Construimos el bloque Client solo si tenemos el Business Unit (MID)
  const clientBlock = apiConfig.businessUnit 
    ? `<Client><ID>${apiConfig.businessUnit}</ID></Client>` 
    : '';

  const soapPayload = `
    <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
      <s:Header>
        <fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth>
        <a:Action s:mustUnderstand="1">Delete</a:Action>
        <a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To>
      </s:Header>
      <s:Body xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
          <Objects xsi:type="DataExtension">
            ${clientBlock}
            <CustomerKey>${deExternalKey}</CustomerKey>
            <Fields>
              <Field>
                <ObjectID>${fieldObjectId}</ObjectID>
              </Field>
            </Fields>
          </Objects>
        </DeleteRequest>
      </s:Body>
    </s:Envelope>`;

  return await executeSoapRequest(apiConfig.soapUri, soapPayload.trim());
}

/**
 * Recupera la lista de Data Extensions de una carpeta específica.
 * @param {string} categoryId - El ID de la carpeta.
 * @param {object} apiConfig - La configuración de la API.
 * @returns {Promise<Array>} Una lista de objetos DE { name, customerKey }.
 */
export async function getDEsFromFolder(categoryId, apiConfig) {
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
                    <ObjectType>DataExtension</ObjectType>
                    <Properties>CustomerKey</Properties>
                    <Properties>Name</Properties>
                    <Filter xsi:type="SimpleFilterPart">
                        <Property>CategoryID</Property>
                        <SimpleOperator>equals</SimpleOperator>
                        <Value>${categoryId}</Value>
                    </Filter>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(responseText, "application/xml");

    return Array.from(xmlDoc.querySelectorAll("Results")).map(node => ({
        name: node.querySelector("Name")?.textContent,
        customerKey: node.querySelector("CustomerKey")?.textContent
    }));
}

/**
 * Busca filas en una Data Extension que coincidan con un filtro simple.
 * @param {string} deKey - La External Key de la Data Extension a consultar.
 * @param {string} fieldName - El nombre de la columna por la que filtrar.
 * @param {string} searchValue - El valor a buscar en la columna.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<Array>} Un array con los objetos de fila encontrados.
 */
export async function searchDataExtensionRows(deKey, fieldName, searchValue, apiConfig) {
    const filter = encodeURIComponent(`"${fieldName}"='${searchValue}'`);
    const url = `${apiConfig.restUri}data/v1/customobjectdata/key/${deKey}/rowset?$filter=${filter}`;
    const options = {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiConfig.accessToken}` }
    };
    const responseData = await executeRestRequest(url, options);
    return responseData.items || [];
}

/**
 * Clona una Data Extension, incluyendo su estructura y campos.
 * @param {string} originalDeCustomerKey - La CustomerKey de la DE a clonar.
 * @param {string} newDeName - El nombre para la nueva DE.
 * @param {string} newDeCustomerKey - La Customer Key para la nueva DE (puede ser vacía para autogenerar).
 * @param {string} targetCategoryId - El ID de la carpeta donde se guardará la nueva DE.
 * @param {object} apiConfig - El objeto de configuración de la API.
 * @returns {Promise<{objectID: string, customerKey: string, name: string}>} - Promesa con IDs y nombre de la nueva DE.
 */
export async function cloneDataExtension(originalDeCustomerKey, newDeName, newDeCustomerKey, targetCategoryId, apiConfig) {
    // 1. Recuperar detalles de la DE original
    const retrieveDeDetailsPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>Name</Properties><Properties>Description</Properties><Properties>IsSendable</Properties><Properties>SendableDataExtensionField.Name</Properties><Properties>SendableSubscriberField.Name</Properties><Filter xsi:type="SimpleFilterPart"><Property>CustomerKey</Property><SimpleOperator>equals</SimpleOperator><Value>${originalDeCustomerKey}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    const deDetailsText = await executeSoapRequest(apiConfig.soapUri, retrieveDeDetailsPayload);
    const deParser = new DOMParser();
    const deDoc = deParser.parseFromString(deDetailsText, "application/xml");
    const deResultNode = deDoc.querySelector("Results");

    if (!deResultNode) {
        throw new Error(`No se encontraron detalles para la Data Extension con CustomerKey: ${originalDeCustomerKey}`);
    }

    const originalDeDetails = {
        name: deResultNode.querySelector("Name")?.textContent,
        description: deResultNode.querySelector("Description")?.textContent || "",
        isSendable: deResultNode.querySelector("IsSendable")?.textContent === 'true',
        sendableField: deResultNode.querySelector("SendableDataExtensionField > Name")?.textContent
    };

    // 2. Recuperar todos los campos de la DE original
    const fields = await fetchFieldsForDE(originalDeCustomerKey, apiConfig);
    if (fields.length === 0) throw new Error("No se pudieron recuperar los campos de la DE original.");

    // Mapeamos los campos al formato que espera buildFieldXml
    const fieldsForXml = fields.map(f => ({ name: f.name, type: f.type, length: f.length, defaultValue: f.defaultValue, isPrimaryKey: f.isPrimaryKey, isRequired: f.isRequired }));
    const fieldsXmlString = fieldsForXml.map(buildFieldXml).join('');
    const sendableFieldType = fields.find(f => f.name === originalDeDetails.sendableField)?.type;

    // 3. Crear la nueva DE
    const descriptionXml = originalDeDetails.description ? `<Description>${originalDeDetails.description}</Description>` : '';
    const clientXml = apiConfig.businessUnit ? `<Client><ClientID>${apiConfig.businessUnit}</ClientID></Client>` : '';
    const categoryXml = targetCategoryId ? `<CategoryID>${targetCategoryId}</CategoryID>` : '';

    let sendableXml = '';
    if (originalDeDetails.isSendable && originalDeDetails.sendableField && sendableFieldType) {
        sendableXml = `<SendableDataExtensionField><CustomerKey>${originalDeDetails.sendableField}</CustomerKey><Name>${originalDeDetails.sendableField}</Name><FieldType>${sendableFieldType}</FieldType></SendableDataExtensionField><SendableSubscriberField><Name>Subscriber Key</Name><Value/></SendableSubscriberField>`;
    }

    const createDePayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Create</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension">${clientXml}<CustomerKey>${newDeCustomerKey}</CustomerKey>${descriptionXml}<Name>${newDeName}</Name>${categoryXml}<IsSendable>${originalDeDetails.isSendable}</IsSendable>${sendableXml}<Fields>${fieldsXmlString}</Fields></Objects></CreateRequest></s:Body></s:Envelope>`;
    const createResponseText = await executeSoapRequest(apiConfig.soapUri, createDePayload);

    const createParser = new DOMParser();
    const createDoc = createParser.parseFromString(createResponseText, "application/xml");
    if (createDoc.querySelector("OverallStatus")?.textContent !== 'OK') {
        const errorMessage = createDoc.querySelector("StatusMessage")?.textContent || "Error desconocido al crear la DE clonada.";
        throw new Error(errorMessage);
    }
    
    // 4. Recuperar la DE recién creada para obtener sus IDs
    const retrieveNewDePayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>CustomerKey</Properties><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Name</Property><SimpleOperator>equals</SimpleOperator><Value>${newDeName}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    const newDeText = await executeSoapRequest(apiConfig.soapUri, retrieveNewDePayload);
    const newDeDoc = new DOMParser().parseFromString(newDeText, "application/xml");
    const newDeNode = newDeDoc.querySelector("Results");

    if (!newDeNode) {
        throw new Error(`No se pudo recuperar la DE recién creada con el nombre "${newDeName}".`);
    }
    
    const newObjectID = newDeNode.querySelector("ObjectID")?.textContent;
    const createdCustomerKey = newDeNode.querySelector("CustomerKey")?.textContent;
    if (!newObjectID || !createdCustomerKey) {
        throw new Error("No se pudo obtener el ID/Key de la nueva DE creada tras la recuperación.");
    }

    return { objectID: newObjectID, customerKey: createdCustomerKey, name: newDeName };
}
/**
 * Recupera el nombre de una Data Extension filtrando por la propiedad especificada
 * @param {string} property - Propiedad de búsqueda ('ObjectID', 'CustomerKey', etc.)
 * @param {string} value - Valor a buscar
 */
export async function fetchDataExtensionName(property, value, apiConfig) {
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
                    <ObjectType>DataExtension</ObjectType>
                    <Properties>Name</Properties>
                    <Filter xsi:type="SimpleFilterPart">
                        <Property>${property}</Property>
                        <SimpleOperator>equals</SimpleOperator>
                        <Value>${value}</Value>
                    </Filter>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const doc = new DOMParser().parseFromString(responseText, "application/xml");
    const nameNode = doc.querySelector("Results > Name");

    // Si no encuentra el nombre, devuelve el valor original como fallback
    return nameNode ? nameNode.textContent : value;
}

/**
 * Recupera el nombre de un campo de una Data Extension usando su ObjectID
 */
export async function fetchFieldNameById(fieldObjectId, apiConfig) {
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
                    <ObjectType>DataExtensionField</ObjectType>
                    <Properties>Name</Properties>
                    <Filter xsi:type="SimpleFilterPart">
                        <Property>ObjectID</Property>
                        <SimpleOperator>equals</SimpleOperator>
                        <Value>${fieldObjectId}</Value>
                    </Filter>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const doc = new DOMParser().parseFromString(responseText, "application/xml");
    return doc.querySelector("Results > Name")?.textContent || "Campo Desconocido";
}

// ==========================================================
// --- 3. JOURNEYS API ---
// ==========================================================

/**
 * Obtiene las membresías de un contacto en todos los Journeys.
 * @param {string} contactKey - El Contact Key del suscriptor a buscar.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<Array>} Un array con los objetos de membresía.
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
 * Obtiene los detalles completos de un Journey específico por su Definition Key.
 * @param {string} definitionKey - La 'key' del Journey a recuperar.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<object>} El objeto de detalle del Journey.
 */
export async function fetchJourneyDetailsByKey(definitionKey, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/interactions/key:${definitionKey}`;
    const options = {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiConfig.accessToken}` }
    };
    // Esta función no debe lanzar un error si falla una sola llamada,
    // por lo que envolvemos la petición en un try/catch.
    try {
        return await executeRestRequest(url, options);
    } catch (error) {
        // En lugar de lanzar un error que detenga Promise.all,
        // devolvemos null para que el llamador pueda filtrarlo.
        console.error(`Failed to fetch details for journey key ${definitionKey}:`, error);
        return null;
    }
}

/**
 * Recupera la lista COMPLETA de todos los journeys, manejando la paginación.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<Array>} Una promesa que resuelve a la lista completa de journeys.
 */
export async function fetchAllJourneys(apiConfig) {
    let allItems = [];
    let page = 1;
    let totalPages = 1;

    do {
        const url = `${apiConfig.restUri}interaction/v1/interactions?$page=${page}&$pageSize=500`;
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
 * Recupera todas las Event Definitions activas, manejando la paginación.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<object>} Un mapa que relaciona el nombre del EventDefinition con sus datos.
 */
export async function fetchAllEventDefinitions(apiConfig) {
    let allItems = []; 
    let page = 1;
    let totalPages = 1; 

    do {
        const url = `${apiConfig.restUri}interaction/v1/eventDefinitions?$page=${page}&$pageSize=500`;
        const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
        
        const data = await executeRestRequest(url, options);
        
        // Si la página actual tiene items, los añadimos al array general
        if (data && Array.isArray(data.items)) {
            allItems = allItems.concat(data.items); 
        }

        // Calculamos el total de páginas solo en la primera llamada para ser eficientes
        if (page === 1 && data && data.count) {
           totalPages = Math.ceil(data.count / 500);
        }
        page++;
    } while (page <= totalPages);
    
    return allItems; 
}

/**
 * Construye un mapa de rutas de carpetas de Journeys a partir de una lista de journeys.
 * @param {Array} journeys - La lista completa de objetos Journey.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<object>} Un mapa de { categoryId: 'Ruta > Completa' }.
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
 * Obtiene los detalles completos de una interacción (Journey), incluyendo sus actividades.
 * @param {string} journeyId - El ID del Journey.
 * @param {object} apiConfig - El objeto de configuración de API.
 * @returns {Promise<object>} El objeto de detalle del Journey.
 */
export async function fetchJourneyDetailsById(journeyId, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/interactions/${journeyId}`;
    const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
    return executeRestRequest(url, options);
}

/**
 * Obtiene los detalles de una Event Definition por su ID.
 * @param {string} eventDefId - El ID del Event Definition.
 * @param {object} apiConfig - El objeto de configuración de API.
 * @returns {Promise<object>} El objeto de la Event Definition.
 */
export async function getEventDefinitionById(eventDefId, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/eventDefinitions/${eventDefId}`;
    const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
    return executeRestRequest(url, options);
}

/**
 * Detiene una versión específica de un Journey.
 * @param {string} journeyId - El ID del Journey a detener.
 * @param {number} version - El número de versión a detener.
 * @param {object} apiConfig - El objeto de configuración de API.
 * @returns {Promise<object>} La respuesta de la API.
 */
export async function stopJourney(journeyId, version, apiConfig) {
    // El ID que recibe aquí debe ser el ID de la versión (journey.id)
    const url = `${apiConfig.restUri}interaction/v1/interactions/stop/${journeyId}?versionNumber=${version}`;
    
    const options = {
        method: 'POST',
        headers: { 
            "Authorization": `Bearer ${apiConfig.accessToken}`,
            "Content-Type": "application/json"
        },
        // IMPORTANTE: String vacío, no "{}"
        body: '' 
    };
    return executeRestRequest(url, options);
}

/**
 * Borra permanentemente un Journey.
 * @param {string} journeyId - El ID del Journey a borrar.
 * @param {object} apiConfig - El objeto de configuración de API.
 * @returns {Promise<object>} Una respuesta de éxito genérica.
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
 * Crea una copia de un Journey a partir de un payload preparado.
 * @param {object} journeyPayload - El payload del journey a crear.
 * @param {object} apiConfig - El objeto de configuración de la API.
 * @returns {Promise<object>} El nuevo objeto de journey creado.
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
 * Recupera todas las versiones de un Journey basándose en su nameOrDescription.
 * @param {string} definitionId - El ID común a todas las versiones.
 * @param {object} apiConfig - Configuración de API.
 */
export async function fetchJourneyVersions(nameOrDescription, apiConfig) {
    const url = `${apiConfig.restUri}interaction/v1/interactions?nameOrDescription=${nameOrDescription}&mostRecentVersionOnly=false`;
    const options = { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } };
    const data = await executeRestRequest(url, options);
    return data.items || [];
}

/**
 * Crea un nuevo Event Definition apuntando a una DE clonada.
 * @param {object} originalEventDef - El objeto del Event Definition original.
 * @param {{objectID: string, customerKey: string}} clonedDeInfo - IDs de la nueva DE.
 * @param {object} apiConfig - El objeto de configuración de la API.
 * @returns {Promise<object>} - Una promesa que resuelve con el nuevo Event Definition creado.
 */
export async function createEmailAudienceEventDefinition(originalEventDef, clonedDeInfo, apiConfig, newJourneyName) {
     // Extraemos el prefijo del eventDefinitionKey original (ej: "EmailAudience", "DEAudience", etc.)
    const keyPrefix = originalEventDef.eventDefinitionKey.split('-')[0];
    
    // Creamos la nueva clave usando el prefijo original y un nuevo UUID
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
 * Crea un nuevo Event Definition de tipo AutomationAudience.
 * @param {object} originalEventDef - El objeto del Event Definition original para copiar metadatos.
 * @param {string} automationId - El ID del automatismo de origen seleccionado.
 * @param {object} deDetails - Objeto con los detalles de la DE de entrada ({ objectID, customerKey, name }).
 * @param {object} apiConfig - El objeto de configuración de la API.
 * @returns {Promise<object>} - Una promesa que resuelve con el nuevo Event Definition creado.
 */
export async function createAutomationAudienceEventDefinition(originalEventDef, automationId, deDetails, apiConfig, newJourneyName) {
     // Extraemos el prefijo del eventDefinitionKey original (ej: "EmailAudience", "DEAudience", etc.)
    const keyPrefix = originalEventDef.eventDefinitionKey.split('-')[0];
    
    // Creamos la nueva clave usando el prefijo original y un nuevo UUID
    const newEventDefKey = `${keyPrefix}-${crypto.randomUUID()}`;

    const payload = {
        type: "AutomationAudience",
        name: newJourneyName,
        description: originalEventDef.description || "",
        mode: originalEventDef.mode || "Production",
        eventDefinitionKey: newEventDefKey,
        dataExtensionId: deDetails.objectID, // El ObjectID de la DE seleccionada
        iconUrl: originalEventDef.iconUrl || "/images/icon-data-extension.svg",
        isVisibleInPicker: originalEventDef.isVisibleInPicker,
        category: originalEventDef.category || "Audience",
        sourceApplicationExtensionId: originalEventDef.sourceApplicationExtensionId,
        metaData: originalEventDef.metaData,
        // Construimos los argumentos con los nuevos IDs
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
 * Solicita la expulsión de un contacto de una o más interacciones (Journeys).
 * @param {string} contactKey - La ContactKey del cliente a expulsar.
 * @param {Array<string>} definitionKeys - Un array con las Definition Keys de los Journeys.
 * @param {object} apiConfig - El objeto de configuración de la API.
 * @returns {Promise<object>} La respuesta de la API, que incluye un array de errores si los hubo.
 */
export async function ejectContactFromJourneys(contactKey, definitionKeys, apiConfig) {
    if (!contactKey || !definitionKeys || definitionKeys.length === 0) {
        throw new Error("Se requieren ContactKey y al menos una DefinitionKey para la expulsión.");
    }
    
    const url = `${apiConfig.restUri}interaction/v1/interactions/contactexit`;
    
    // El payload es un array de objetos, uno por cada journey del que se va a expulsar.
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

// ==========================================================
// --- 4. SUBSCRIBERS & CONTACTS API ---
// ==========================================================
/**
 * Recupera el nombre de una Send Classification por su ID
 */
export async function fetchSendClassificationNameById(objectId, apiConfig) {
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
                    <ObjectType>SendClassification</ObjectType>
                    <Properties>Name</Properties>
                    <Filter xsi:type="SimpleFilterPart">
                        <Property>ObjectID</Property>
                        <SimpleOperator>equals</SimpleOperator>
                        <Value>${objectId}</Value>
                    </Filter>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const doc = new DOMParser().parseFromString(responseText, "application/xml");
    return doc.querySelector("Results > Name")?.textContent || "Clasificación Desconocida";
}

/**
 * Recupera el nombre de una Publication List (o All Subscribers) por su ID
 */
export async function fetchListNameById(listId, apiConfig) {
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
                    <ObjectType>List</ObjectType>
                    <Properties>ListName</Properties>
                    <Filter xsi:type="SimpleFilterPart">
                        <Property>ID</Property>
                        <SimpleOperator>equals</SimpleOperator>
                        <Value>${listId}</Value>
                    </Filter>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const doc = new DOMParser().parseFromString(responseText, "application/xml");
    return doc.querySelector("Results > ListName")?.textContent || "Lista Desconocida";
}

/**
 * Busca un suscriptor por una propiedad específica usando la API SOAP.
 * @param {string} property - La propiedad por la que buscar ('SubscriberKey' o 'EmailAddress').
 * @param {string} value - El valor a buscar.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<Array>} Un array de objetos de suscriptor.
 */
export async function searchSubscriberByProperty(property, value, apiConfig) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>Subscriber</ObjectType><Properties>CreatedDate</Properties><Properties>Client.ID</Properties><Properties>EmailAddress</Properties><Properties>SubscriberKey</Properties><Properties>Status</Properties><Properties>UnsubscribedDate</Properties><Filter xsi:type="SimpleFilterPart"><Property>${property}</Property><SimpleOperator>equals</SimpleOperator><Value>${value}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(responseText, "application/xml");

    return Array.from(xmlDoc.querySelectorAll("Results")).map(node => ({
        subscriberKey: node.querySelector("SubscriberKey")?.textContent || '---', 
        emailAddress: node.querySelector("EmailAddress")?.textContent || '---', 
        status: node.querySelector("Status")?.textContent || '---', 
        createdDate: node.querySelector("CreatedDate") ? new Date(node.querySelector("CreatedDate").textContent).toLocaleString() : '---', 
        unsubscribedDate: node.querySelector("UnsubscribedDate") ? new Date(node.querySelector("UnsubscribedDate").textContent).toLocaleString() : '---', 
        isSubscriber: true 
    }));
}

/**
 * Busca un contacto por su ContactKey usando la API REST.
 * @param {string} contactKey - El ContactKey del contacto a buscar.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<Array>} Un array que contiene el objeto del contacto si se encuentra.
 */
export async function searchContactByKey(contactKey, apiConfig) {
    const contactUrl = `${apiConfig.restUri}contacts/v1/addresses/search/ContactKey`;
    const contactPayload = { "filterConditionOperator": "Is", "filterConditionValue": contactKey };

    const response = await fetch(contactUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiConfig.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(contactPayload)
    });

    const responseData = await response.json();
    if (!response.ok) {
        throw new Error(responseData.message || `Error API al buscar contactos: ${response.statusText}`);
    }

    const addresses = responseData?.addresses;
    if (!addresses || addresses.length === 0) return [];
    
    const contactData = addresses[0];
    const key = contactData.contactKey?.value || '---';
    const primaryValueSet = contactData.valueSets?.find(vs => vs.definitionKey === 'Primary');
    let createdDate = '---';
    if (primaryValueSet) {
        const createdDateValueObject = primaryValueSet.values?.find(v => v.definitionKey === 'CreatedDate');
        if (createdDateValueObject?.innerValue) {
            createdDate = new Date(createdDateValueObject.innerValue).toLocaleString();
        }
    }
    return [{
        subscriberKey: key, emailAddress: '---', status: '---',
        createdDate: createdDate, unsubscribedDate: '---', isSubscriber: false
    }];
}

// ==========================================================
// --- 5. VALIDATORS API ---
// ==========================================================

/**
 * Valida una dirección de email usando la API REST de Marketing Cloud.
 * @param {string} email - La dirección de email a validar.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<object>} Una promesa que resuelve con el objeto de respuesta de la API.
 */
export async function validateEmail(email, apiConfig) {
  const url = `${apiConfig.restUri}address/v1/validateEmail`;
  const payload = {
    "email": email,
    "validators": ["SyntaxValidator", "MXValidator", "ListDetectiveValidator"]
  };
  const options = {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiConfig.accessToken}`
    },
    body: JSON.stringify(payload)
  };
  
  // Simplemente llamamos a nuestro helper y devolvemos el resultado.
  return executeRestRequest(url, options);
}

// ==========================================================
// --- 6. SEARCH & DISCOVERY API (QUERIES, FOLDERS, ETC) ---
// ==========================================================

/**
 * Busca Data Extensions por una propiedad y un valor.
 * @param {string} property - La propiedad por la que buscar (ej. 'Name', 'CustomerKey').
 * @param {string} value - El valor a buscar (puede ser parcial).
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<Array>} Una promesa que resuelve a un array de objetos DE con { categoryId, deName }.
 */
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

/**
 * Encuentra el ObjectID de una Data Extension a partir de su nombre.
 * @param {string} deName - El nombre exacto de la DE.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<string>} El ObjectID de la Data Extension.
 */
export async function getDEObjectIdByName(deName, apiConfig) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtension</ObjectType><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>Name</Property><SimpleOperator>equals</SimpleOperator><Value>${deName}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const objectIDNode = new DOMParser().parseFromString(responseText, "application/xml").querySelector("Results > ObjectID");
    if (!objectIDNode) {
        throw new Error(`No se encontró una Data Extension con el nombre exacto "${deName}".`);
    }
    return objectIDNode.textContent;
}

/**
 * Encuentra los detalles clave (CustomerKey, ObjectID, CategoryID) de una Data Extension por su nombre.
 * @param {string} deName - El nombre exacto de la DE.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<{customerKey: string, objectID: string, categoryId: string}>} Los detalles de la DE.
 */
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

/**
 * Busca todas las Import Definitions que apuntan a una Data Extension específica.
 * @param {string} deObjectId - El ObjectID de la DE de destino.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<Array>} Un array de objetos de importación encontrados.
 */
export async function findImportsTargetingDE(deObjectId, apiConfig) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>ImportDefinition</ObjectType><Properties>Name</Properties><Properties>Description</Properties><Properties>ObjectID</Properties><Filter xsi:type="SimpleFilterPart"><Property>DestinationObject.ObjectID</Property><SimpleOperator>equals</SimpleOperator><Value>${deObjectId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const importDefinitions = Array.from(new DOMParser().parseFromString(responseText, "application/xml").querySelectorAll("Results")).map(node => ({
        name: node.querySelector("Name")?.textContent || 'N/A',
        type: 'Import',
        description: node.querySelector("Description")?.textContent || '---',
        objectID: node.querySelector("ObjectID")?.textContent // Necesitamos el ObjectID para buscar el automatismo
    }));

    // Enriquecer cada import con la lista de automatizaciones donde se usa
    const importsWithAutomations = await Promise.all(importDefinitions.map(async (imp) => {
        const automations = await findAutomationForActivity(imp.objectID, apiConfig);
        return { ...imp, automations }; // Añadimos el array de automatizaciones
    }));

    return importsWithAutomations;
}

/**
 * Busca Query Activities basándose en un filtro simple (propiedad, operador, valor).
 * @param {object} filter - Objeto con los detalles del filtro.
 * @param {string} filter.property - La propiedad de la API por la que filtrar (ej. 'QueryText').
 * @param {string} filter.simpleOperator - El operador a usar (ej. 'equals', 'like').
 * @param {string} filter.value - El valor a buscar.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<Array>} Un array de objetos de query encontrados.
 */
export async function searchQueriesBySimpleFilter({ property, simpleOperator, value }, apiConfig) {
    const filterValue = simpleOperator === 'like' ? `%${value}%` : value;
    const filterXml = `<Filter xsi:type="SimpleFilterPart"><Property>${property}</Property><SimpleOperator>${simpleOperator}</SimpleOperator><Value>${filterValue}</Value></Filter>`;
    return findQueriesByFilter(filterXml, apiConfig);
}

/**
 * Busca la automatización a la que pertenece una actividad de query.
 * Modificado para encontrar y devolver TODAS las automatizaciones a las que pertenece una query/actividad.
 * @param {object} query - El objeto de la query (o cualquier actividad con objectID).
 * @param {object} apiConfig - Configuración de la API.
 * @returns {Promise<Array<{automationName: string, step: string}>>} Un array de objetos, cada uno representando una ocurrencia en un automatismo.
 */
export async function findAutomationForActivity(activityOrId, apiConfig) {
    // Ajuste para que acepte tanto el ID de ayer (string) como el objeto de hoy
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
                        // Usamos toLowerCase() para que el match sea seguro contra cambios de mayúsculas
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
 * Borra una Query Definition por su ObjectID usando el endpoint de Automation V1.
 */
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

/**
 * Busca Query Definitions usando un fragmento de filtro SOAP genérico.
 * @param {string} filterXml - El fragmento XML del filtro a aplicar.
 * @param {object} apiConfig - El objeto de configuración de API autenticado.
 * @returns {Promise<Array>} Una promesa que resuelve a un array de queries encontradas.
 */
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

    // Enriquecer cada query con la lista de automatizaciones donde se usa
    const queriesWithAutomations = await Promise.all(queries.map(async (q) => {
        const automations = await findAutomationForActivity(q.objectID, apiConfig);
        return { ...q, automations }; // Añadimos el array de automatizaciones
    }));

    return queriesWithAutomations;
}

/**
 * Busca una actividad específica basándose en el tipo seleccionado.
 */
export async function searchActivityTargeted(type, value, apiConfig) {
    
    // Mapeo de actividades que ahora buscaremos vía REST (más fiable)
    const restMappings = {
        'Script': { 
            endpoint: 'automation/v1/scripts', 
            idField: 'ssjsActivityId', nameField: 'name', keyField: 'key', label: 'Script' 
        },
        'FileTransferActivity': { 
            endpoint: 'automation/v1/fileTransfers', 
            idField: 'id', nameField: 'name', keyField: 'customerKey', label: 'File Transfer' 
        },
        'DataExtractActivity': { 
            endpoint: 'automation/v1/dataextracts', 
            idField: 'dataExtractDefinitionId', nameField: 'name', keyField: 'key', label: 'Data Extract' 
        },
        'FilterActivity': { 
            endpoint: 'automation/v1/filters', 
            idField: 'filterActivityId', nameField: 'name', keyField: 'customerKey', label: 'Filter' 
        }
    };

    if (restMappings[type]) {
        return await findActivityViaRest(restMappings[type], value, apiConfig);
    }

    // Para el resto (Queries, Imports, Emails), seguimos usando SOAP
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

/**
 * Recupera los detalles técnicos de un Import Definition vía SOAP (Sin FieldMaps)
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

export async function fetchFileTransferDetails(id, apiConfig) {
    const url = `${apiConfig.restUri}automation/v1/filetransfers/${id}`;
    return await executeRestRequest(url, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } });
}

export async function fetchFileTransferLocation(locationId, apiConfig) {
    const url = `${apiConfig.restUri}data/v1/filetransferlocation/${locationId}`;
    return await executeRestRequest(url, { headers: { "Authorization": `Bearer ${apiConfig.accessToken}` } });
}
/**
 * Recupera los detalles de una definición de envío de Email por su ObjectID
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
 * BUSCADOR REST GENÉRICO: Recorre cualquier endpoint paginado de Automation (Scripts, Transfers, etc.)
 * y busca por ID, Name o CustomerKey.
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

        // Buscamos el match exacto en los 3 campos posibles
        const found = items.find(i => 
            (i[idField] && i[idField].toLowerCase() === term) ||
            (i[nameField] && i[nameField].toLowerCase() === term) ||
            (i[keyField] && i[keyField].toLowerCase() === term)
        );

        if (found) {
            return { 
                objectID: found[idField],   // El ID que usaremos para vincular con Automation
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
 * Helper para buscar en SOAP usando las propiedades correctas.
 */
async function findActivityInSoap(soapType, label, keyPropertyName, value, apiConfig) {
    try {
        // 1. Construimos el filtro base (OR entre Name y Key)
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

        // 2. Si es QueryDefinition, envolvemos el filtro anterior en un AND con Status = Active
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
        const results = xmlDoc.querySelectorAll("Results"); // Cambiar selector a All

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
 * Busca texto dentro del código de todos los Scripts (SSJS).
 * Reutiliza la misma lógica de IDs que findScriptActivityRest.
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

            // Filtramos los que contienen el texto
            const matches = items.filter(s => s.script && s.script.toLowerCase().includes(term));
            
            matches.forEach(m => {
                // Solo añadimos si tiene ID, para evitar el error de conversión SOAP después
                if (m.ssjsActivityId) {
                    results.push({
                        objectID: m.ssjsActivityId,
                        customerKey: m.key,
                        name: m.name,
                        soapType: 'ScriptActivity', // Importante para la lógica inteligente
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

/**
 * Busca carpetas por nombre y tipo de contenido.
 * @param {string} folderName - El nombre (o parte del nombre) a buscar.
 * @param {string} contentType - 'queryactivity' o 'dataextension'.
 * @param {object} apiConfig - La configuración de la API.
 * @returns {Promise<Array>} Lista de objetos de carpeta con { id, name, fullPath }.
 */
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

/**
 * Recupera las queries de una carpeta específica.
 * @param {string} folderId - El ID de la carpeta de queries.
 * @param {object} apiConfig - La configuración de la API.
 * @returns {Promise<Array>} Lista de objetos de query.
 */
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

/**
 * Crea una nueva Query Activity clonada y devuelve su ObjectID.
 * Este método es más eficiente ya que extrae el ObjectID directamente de la
 * respuesta de la creación, evitando una segunda llamada a la API.
 * @param {object} originalQuery - El objeto de la query original.
 * @param {object} clonedDE - El objeto de la DE clonada (con nueva key y nombre).
 * @param {string} newQueryName - El nombre de la Query.
 * @param {string} targetCategoryId - El ID de la carpeta donde se guardará la query.
 * @param {object} apiConfig - La configuración de la API.
 * @returns {Promise<{objectID: string, name: string}>} - Promesa con el ObjectID y el nombre de la nueva query.
 */
export async function createClonedQuery(originalQuery, clonedDE, newQueryName, targetCategoryId, apiConfig) {
    // --- PASO ÚNICO: Crear la Query y extraer el NewObjectID de la respuesta ---
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
    
    // Extraemos el NewObjectID, que es lo que la API nos devuelve.
    const newObjectID = createDoc.querySelector("Results > NewObjectID")?.textContent;

    if (!newObjectID) {
        // Esta comprobación de seguridad es por si la API cambia en el futuro.
        throw new Error("La creación de la Query fue exitosa, pero no se pudo extraer el NewObjectID de la respuesta SOAP.");
    }

    // Devolvemos el objeto que necesita el clonador de automatismos.
    return { objectID: newObjectID, name: newQueryName };
}


/**
 * Recupera los detalles de una Query Definition por su CustomerKey.
 * @param {string} customerKey - La CustomerKey de la Query Definition.
 * @param {object} apiConfig - La configuración de la API.
 * @returns {Promise<{objectID: string, customerKey: string, name: string}>} Un objeto con los detalles clave de la query.
 */
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

/**
 * Recupera los detalles completos de una Query Definition por su ObjectID.
 * @param {string} queryObjectId - El ObjectID de la Query Definition.
 * @param {object} apiConfig - La configuración de la API.
 * @returns {Promise<object>} Un objeto con los detalles de la query.
 */
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

/**
 * Crea una única carpeta en Marketing Cloud.
 * Esta función actúa como un router, eligiendo la API correcta (REST o SOAP)
 * basándose en el tipo de contenido proporcionado.
 * @param {string} folderName - El nombre de la nueva carpeta.
 * @param {number} parentId - El ID de la carpeta padre.
 * @param {string} contentType - El tipo de contenido ('journey', 'asset', 'dataextension', etc.).
 * @param {object} apiConfig - La configuración de la API.
 * @returns {Promise<string>} - Una promesa que resuelve con el ID de la carpeta creada.
 */
export async function createFolder(folderName, parentId, contentType, apiConfig) {
    
    // Usamos un switch para manejar los diferentes tipos de contenido
    switch (contentType.toLowerCase()) {
        
        // --- CASO 1: Carpetas de Journey (API REST específica) ---
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

        // --- CASO 2: Carpetas de Content Builder / Asset (API REST) ---
        case 'asset':
        case 'contentbuilder': { // Añadimos ambos por si acaso
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

        // --- CASO 3: Resto de tipos (Data Extension, Query, etc. - API SOAP) ---
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

// ==========================================================
// --- 7. CONTENT BUILDER API ---
// ==========================================================

/**
 * Recupera la lista COMPLETA de todos los assets de tipo Cloud Page, manejando paginación.
 * @param {object} apiConfig - La configuración de la API autenticada.
 * @returns {Promise<Array>} Una promesa que resuelve a la lista de assets.
 */
export async function fetchAllCloudPages(apiConfig) {
    let allItems = [];
    let page = 1;
    let totalCount = 0;
    const pageSize = 500;

    const queryBody = {
        "query": {
            "property": "assetType.id",
            "simpleOperator": "in",
            "values": [240, 241, 242, 243, 244, 245, 247, 248, 249]
        },
        "sort": [{ "property": "id", "direction": "ASC" }],
        "fields": ["id", "name", "assetType", "modifiedDate", "category", "content", "meta"]
    };

    do {
        const url = `${apiConfig.restUri}asset/v1/content/assets/query`;
        const body = { ...queryBody, page: { page: page, pageSize: pageSize } };
        const options = {
            method: 'POST',
            headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(body)
        };
        
        const data = await executeRestRequest(url, options);

        const pageItems = data.items || [];
        allItems = allItems.concat(pageItems);
        totalCount = data.count;
        page++;

    } while (allItems.length < totalCount && totalCount > 0); // Añadida una comprobación extra
    
    return allItems;
}

/**
 * Enriquece una lista de assets de Cloud Page con la ruta de su carpeta.
 * @param {Array} items - La lista de assets de la API.
 * @param {object} apiConfig - La configuración de la API.
 * @returns {Promise<Array>} La lista enriquecida.
 */
export async function enrichCloudPagesWithFolders(items, apiConfig) {
    const pathPromises = items.map(async (item) => {
        const location = item.category.id ? await getFolderPath(item.category.id, apiConfig) : 'Carpeta Raíz';
        return {
            ...item,
            location: location
        };
    });
    return Promise.all(pathPromises);
}

/**
 * Busca assets en Content Builder en dos pasos: primero por nombre y, si no hay resultados, por ID.
 * @param {string} searchValue - El término de búsqueda introducido por el usuario.
 * @param {object} apiConfig - La configuración de la API autenticada.
 * @returns {Promise<Array>} Una promesa que resuelve a la lista de assets encontrados.
 */
export async function searchContentAssets(searchValue, apiConfig) {

    // --- Helper interno para ejecutar una consulta paginada y devolver todos los resultados ---
    const executePaginatedQuery = async (queryPayload) => {
        let allItems = [];
        let page = 1;
        let totalCount = 0;
        const pageSize = 500;

        const queryBody = {
            "query": queryPayload,
            "sort": [{ "property": "id", "direction": "ASC" }],
            "fields": ["id", "name", "assetType", "category"]
        };

        do {
            const url = `${apiConfig.restUri}asset/v1/content/assets/query`;
            const body = { ...queryBody, page: { page: page, pageSize: pageSize } };
            const options = {
                method: 'POST',
                headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify(body)
            };
            
            const data = await executeRestRequest(url, options);

            const pageItems = data.items || [];
            allItems = allItems.concat(pageItems);
            totalCount = data.count;
            page++;

        } while (allItems.length < totalCount && totalCount > 0);
        
        return allItems;
    };

    // --- INICIO: Lógica principal de búsqueda en dos pasos ---

    // 1. Buscar por Nombre
    logger.logMessage(`Paso 1/2: Buscando contenidos por nombre que contenga "${searchValue}"...`);
    const nameQuery = {
        "property": "name",
        "simpleOperator": "like",
        "value": searchValue
    };
    let results = await executePaginatedQuery(nameQuery);

    // 2. Si se encuentran resultados por nombre, los devolvemos y terminamos.
    if (results.length > 0) {
        logger.logMessage(`Búsqueda por nombre exitosa. Se encontraron ${results.length} resultado(s).`);
        return results;
    }

    // 3. Si no hay resultados, intentamos buscar por ID.
    logger.logMessage(`Paso 2/2: No se encontraron resultados por nombre. Buscando por ID exacto "${searchValue}"...`);
    try {
        const idQuery = {
            "property": "id",
            "simpleOperator": "equal",
            "value": searchValue
        };
        results = await executePaginatedQuery(idQuery);
        logger.logMessage(`Búsqueda por ID completada. Se encontraron ${results.length} resultado(s).`);
        return results;
    } catch (error) {
        // 4. Capturamos el error específico de conversión y lo tratamos como "cero resultados".
        if (error.message && error.message.toLowerCase().includes("error converting value")) {
            logger.logMessage("La búsqueda por ID falló (valor de entrada no numérico). Se considera que no hay resultados.");
            return []; // Devolvemos un array vacío, como si no hubiera encontrado nada.
        } else {
            // Si es cualquier otro error (autenticación, red, etc.), lo lanzamos para que se muestre al usuario.
            throw error;
        }
    }
}
// ==========================================================
// --- USUARIOS Y PERMISOS ---
// ==========================================================

/**
 * Recupera todos los usuarios de la cuenta (SOAP)
 */
export async function fetchAllUsers(apiConfig) {
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
                    <ObjectType>AccountUser</ObjectType>
                    <Properties>ID</Properties>
                    <Properties>Email</Properties>
                    <Properties>Name</Properties>
                    <Properties>ModifiedDate</Properties>
                    <Properties>ActiveFlag</Properties>
                    <Properties>CreatedDate</Properties>
                    <Properties>IsAPIUser</Properties>
                    <Properties>UserID</Properties>
                    <Properties>LastSuccessfulLogin</Properties>
                    <Properties>Roles</Properties>
                    <Properties>CustomerKey</Properties>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;
 
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const doc = new DOMParser().parseFromString(responseText, "application/xml");
    const results = doc.querySelectorAll("Results");
 
    // Helper: texto de un hijo DIRECTO (evita coger IDs de subelementos como Roles>Role>ID)
    const directChild = (node, tag) =>
        Array.from(node.children).find(n => n.tagName === tag)?.textContent || null;
 
    // Helper: PartnerProperties es un array de {Name, Value} — Email e IsAPIUser vienen aquí
    const partnerProp = (node, propName) => {
        const entries = Array.from(node.querySelectorAll('PartnerProperties'));
        const entry = entries.find(e => e.querySelector('Name')?.textContent === propName);
        return entry ? entry.querySelector('Value')?.textContent || null : null;
    };
 
    const users = [];
    results.forEach(node => {
        const rawRoles = Array.from(node.querySelectorAll("Roles Role"));
        
        // Filtrar roles individuales
        const filteredRoles = rawRoles
            .map(r => ({
                name: r.querySelector("Name")?.textContent || "Sin nombre",
                objectId: r.querySelector("ObjectID")?.textContent
            }))
            .filter(r => !r.name.includes("Individual role for"));
 
        // REQUISITO: Si no tiene roles válidos tras el filtro, no incluir usuario
        if (filteredRoles.length === 0 && rawRoles.length > 0) return;
 
        // IsAPIUser viene en PartnerProperties con valor "True"/"False"
        const isApiRaw = partnerProp(node, 'isAPIUser') || partnerProp(node, 'IsAPIUser') || directChild(node, 'IsAPIUser') || 'false';
 
        users.push({
            id:           directChild(node, 'ID') || "---",
            name:         directChild(node, 'Name') || "Sin Nombre",
            email:        partnerProp(node, 'email') || partnerProp(node, 'Email') || directChild(node, 'Email') || "---",
            userName:     directChild(node, 'UserID') || "---",
            customerKey:  directChild(node, 'CustomerKey') || "---",
            isActive:     directChild(node, 'ActiveFlag') === 'true',
            isApi:        isApiRaw.toLowerCase() === 'true',
            lastLogin:    directChild(node, 'LastSuccessfulLogin') || null,
            createdDate:  directChild(node, 'CreatedDate') || null,
            modifiedDate: directChild(node, 'ModifiedDate') || null,
            roles: filteredRoles
        });
    });
 
    return users;
}

/**
 * Recupera permisos detallados de una lista de Roles (ObjectIDs)
 */
export async function fetchRolesPermissions(roleIds, apiConfig) {
    // Si no hay roles, devolver vacío
    if (!roleIds || roleIds.length === 0) return {};

    // Construimos los filtros para cada ObjectID
    const filterNodes = roleIds.map(id => `
        <Filter xsi:type="SimpleFilterPart">
            <Property>ObjectID</Property>
            <SimpleOperator>equals</SimpleOperator>
            <Value>${id}</Value>
        </Filter>`).join('');
    
    let allPermissions = {};

    for (const id of roleIds) {
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
                        <ObjectType>Role</ObjectType>
                        <Properties>ObjectID</Properties>
                        <Properties>Permissions</Properties>
                        <Filter xsi:type="SimpleFilterPart">
                            <Property>ObjectID</Property>
                            <SimpleOperator>equals</SimpleOperator>
                            <Value>${id}</Value>
                        </Filter>
                    </RetrieveRequest>
                </RetrieveRequestMsg>
            </s:Body>
        </s:Envelope>`;

        const resp = await executeSoapRequest(apiConfig.soapUri, soapPayload);
        const doc = new DOMParser().parseFromString(resp, "application/xml");
        
        doc.querySelectorAll("Permissions > Permission").forEach(p => {
            const objType = p.querySelector("ObjectType")?.textContent || "General";
            const name = p.querySelector("Name")?.textContent;
            const isAllowed = p.querySelector("IsAllowed")?.textContent === 'true';

            if (!allPermissions[objType]) allPermissions[objType] = {};
            // Si un rol lo permite, queda como permitido (lógica OR de roles)
            if (isAllowed) allPermissions[objType][name] = true;
            else if (allPermissions[objType][name] === undefined) allPermissions[objType][name] = false;
        });
    }
    return allPermissions;
}

// ==========================================================
// --- HELPERS INTERNOS DEL SERVICIO ---
// ==========================================================

/**
 * Parsea una respuesta SOAP de campos de DE y la convierte en un array de objetos.
 * @param {string} xmlString - La respuesta XML de la API.
 * @returns {Promise<Array>} Un array de objetos, cada uno representando un campo.
 */
function parseFullSoapFieldsAsync(xmlString) {
    return new Promise(resolve => {
        const fields = [];
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "application/xml");
        const getText = (node, tagName) => node.querySelector(tagName)?.textContent || '';
        xmlDoc.querySelectorAll("Results").forEach(node => {
            const fieldType = getText(node, 'FieldType');
            let length = getText(node, 'MaxLength');

            if (fieldType.toLowerCase() === 'decimal') {
                // Obtenemos la escala de la respuesta SOAP. Si no viene, asumimos '0'.
                const scale = getText(node, 'Scale') || '0';
                length = `${length},${scale}`;
            }
          
            fields.push({
                name: getText(node, 'Name'),
                type: fieldType,
                length: length,
                defaultValue: getText(node, 'DefaultValue'),
                isPrimaryKey: getText(node, 'IsPrimaryKey') === 'true',
                isRequired: getText(node, 'IsRequired') === 'true',
                ordinal: parseInt(getText(node, 'Ordinal'), 10) || 0,
                objectId: getText(node, 'ObjectID')
            });
        });
        resolve(fields.sort((a, b) => a.ordinal - b.ordinal));
    });
}

/**
 * Construye el fragmento XML para un único campo de Data Extension.
 * @param {object} fieldData - Objeto con los datos del campo.
 * @returns {string} La cadena XML para el campo.
 */
export function buildFieldXml(fieldData) {
    const { name, type, length, defaultValue, isPrimaryKey, isRequired } = fieldData;
    let fieldXml = '';
    const commonNodes = `<CustomerKey>${name}</CustomerKey><Name>${name}</Name><IsRequired>${isRequired}</IsRequired><IsPrimaryKey>${isPrimaryKey}</IsPrimaryKey>`;
    const defaultValueNode = defaultValue ? `<DefaultValue>${defaultValue}</DefaultValue>` : '';
    switch (type.toLowerCase()) {
        case 'text': fieldXml = `<Field>${commonNodes}<FieldType>Text</FieldType>${length ? `<MaxLength>${length}</MaxLength>` : ''}${defaultValueNode}</Field>`; break;
        case 'number': fieldXml = `<Field>${commonNodes}<FieldType>Number</FieldType>${defaultValueNode}</Field>`; break;
        case 'date': fieldXml = `<Field>${commonNodes}<FieldType>Date</FieldType>${defaultValueNode}</Field>`; break;
        case 'boolean': fieldXml = `<Field>${commonNodes}<FieldType>Boolean</FieldType>${defaultValueNode}</Field>`; break;
        case 'emailaddress': fieldXml = `<Field>${commonNodes}<FieldType>EmailAddress</FieldType></Field>`; break;
        case 'phone': fieldXml = `<Field>${commonNodes}<FieldType>Phone</FieldType></Field>`; break;
        case 'locale': fieldXml = `<Field>${commonNodes}<FieldType>Locale</FieldType></Field>`; break;
        case 'decimal':
            const [maxLength, scale] = (length || ',').split(',').map(s => s.trim());
            fieldXml = `<Field>${commonNodes}<FieldType>Decimal</FieldType>${maxLength ? `<MaxLength>${maxLength}</MaxLength>` : ''}${scale ? `<Scale>${scale}</Scale>` : ''}${defaultValueNode}</Field>`;
            break;
        default: return '';
    }
    return fieldXml.replace(/\s+/g, ' ').trim();
}

/**
 * Obtiene la ruta completa de una carpeta de forma recursiva, utilizando una caché.
 * @param {string} folderId - El ID de la carpeta a buscar.
 * @param {object} apiConfig - La configuración de la API autenticada.
 * @returns {Promise<string>} La ruta completa de la carpeta.
 */
export async function getFolderPath(folderId, apiConfig) {
    if (!folderId || isNaN(parseInt(folderId))) return '';

    if (folderPathCache.has(folderId)) {
        return folderPathCache.get(folderId);
    }

    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataFolder</ObjectType><Properties>Name</Properties><Properties>ParentFolder.ID</Properties><Filter xsi:type="SimpleFilterPart"><Property>ID</Property><SimpleOperator>equals</SimpleOperator><Value>${folderId}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;
    
    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const resultNode = new DOMParser().parseFromString(responseText, "application/xml").querySelector("Results");
    
    if (!resultNode) {
        folderPathCache.set(folderId, ''); 
        return '';
    }
    
    const name = resultNode.querySelector("Name")?.textContent;
    const parentId = resultNode.querySelector("ParentFolder > ID")?.textContent;
    
    const parentPath = await getFolderPath(parentId, apiConfig); 
    
    const fullPath = parentPath ? `${parentPath} > ${name}` : name;

    folderPathCache.set(folderId, fullPath);

    return fullPath;
}

// ==========================================================
// --- LLAMADAS GENERICAS DEL SERVICIO ---
// ==========================================================

/**
 * Helper INTERNO para ejecutar peticiones SOAP.
 * @param {string} soapUri - El endpoint SOAP.
 * @param {string} soapPayload - El cuerpo XML de la petición.
 * @returns {Promise<string>} El texto de la respuesta XML.
 * @throws {Error} Si la petición SOAP no devuelve un estado OK.
 */
async function executeSoapRequest(soapUri, soapPayload) {
    // Loguea la llamada ANTES de ejecutarla
    logger.logApiCall({ endpoint: soapUri, payload: soapPayload });

    const response = await fetch(soapUri, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: soapPayload
    });
    const responseText = await response.text();

    // Loguea la respuesta DESPUÉS de recibirla
    logger.logApiResponse({ status: response.status, body: responseText });

    if (!responseText.includes('<OverallStatus>OK</OverallStatus>') && !responseText.includes('<OverallStatus>MoreDataAvailable</OverallStatus>')) {
        const errorMatch = responseText.match(/<StatusMessage>(.*?)<\/StatusMessage>/);
        throw new Error(errorMatch ? errorMatch[1] : 'Error desconocido en la respuesta SOAP.');
    }
    return responseText;
}

/**
 * Helper INTERNO para ejecutar peticiones REST (JSON) con logging integrado.
 * @param {string} url - La URL completa del endpoint.
 * @param {object} options - El objeto de opciones para fetch (method, headers, body).
 * @returns {Promise<object>} El cuerpo de la respuesta parseado como JSON.
 */
async function executeRestRequest(url, options = {}) {
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

    // Si la respuesta es "OK" (con o sin comillas), la devolvemos como objeto
    if (responseText.trim() === 'OK' || responseText.trim() === '"OK"') {
        return { success: true, message: 'OK' };
    }

    const responseData = responseText ? JSON.parse(responseText) : {};
    return responseData;
}