// ===================================================================
// Fichero: api-data-extensions.js
// Descripción: Todo lo relacionado con Data Extensions y sus campos,
// incluyendo búsqueda y operaciones masivas.
// ===================================================================
import { executeSoapRequest, executeRestRequest } from './api-core.js';
import { findAutomationForActivity } from './api-activities.js'; // Importante para findImportsTargetingDE

/**
 * Construye el fragmento (nodo) XML para la creación o actualización SOAP de un campo individual.
 * @param {object} fieldData - Datos del campo (nombre, tipo, longitud, etc.).
 * @returns {string} Cadena de texto con el formato XML válido para la API SOAP de MC.
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
 * Toma una respuesta en texto XML de la API SOAP y la parsea en un Array de objetos de campos JSON.
 * @param {string} xmlString - Respuesta SOAP en bruto.
 * @returns {Promise<Array>} Arreglo ordenado con la definición de todos los campos extraídos.
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
 * Recupera y parsea la lista completa de todos los campos contenidos en una Data Extension.
 * @param {string} customerKey - External Key de la DE a analizar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Arreglo de campos.
 */
export async function fetchFieldsForDE(customerKey, apiConfig) {
    const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Retrieve</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest><ObjectType>DataExtensionField</ObjectType><Properties>Name</Properties><Properties>ObjectID</Properties><Properties>CustomerKey</Properties><Properties>FieldType</Properties><Properties>IsPrimaryKey</Properties><Properties>IsRequired</Properties><Properties>MaxLength</Properties><Properties>Ordinal</Properties><Properties>Scale</Properties><Properties>DefaultValue</Properties><Filter xsi:type="SimpleFilterPart"><Property>DataExtension.CustomerKey</Property><SimpleOperator>equals</SimpleOperator><Value>${customerKey}</Value></Filter></RetrieveRequest></RetrieveRequestMsg></s:Body></s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    return await parseFullSoapFieldsAsync(responseText);
}

/**
 * Crea una nueva Data Extension desde cero utilizando la API SOAP.
 * @param {object} deData - Configuración total de la DE (nombre, sendable relation, carpetas, array de campos).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<boolean>} Devuelve true si el proceso SOAP termina en OK.
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
  return true;
}

/**
 * Realiza un upsert (Crea o actualiza) una lista de campos sobre una Data Extension existente.
 * @param {string} externalKey - CustomerKey de la DE objetivo.
 * @param {Array} fields - Arreglo de campos a enviar en formato XML.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<boolean>} Devuelve true si la actualización es exitosa.
 */
export async function createOrUpdateFields(externalKey, fields, apiConfig) {
  const fieldsXmlString = fields.map(buildFieldXml).join('');
  const soapPayload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">Update</a:Action><a:To s:mustUnderstand="1">${apiConfig.soapUri}</a:To><fueloauth xmlns="http://exacttarget.com">${apiConfig.accessToken}</fueloauth></s:Header><s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"><Objects xsi:type="DataExtension"><CustomerKey>${externalKey}</CustomerKey><Fields>${fieldsXmlString}</Fields></Objects></UpdateRequest></s:Body></s:Envelope>`;

  await executeSoapRequest(apiConfig.soapUri, soapPayload.trim());
  return true;
}

/**
 * Elimina permanentemente un campo (columna) específico de una Data Extension.
 * @param {string} deExternalKey - CustomerKey de la DE objetivo.
 * @param {string} fieldObjectId - El ObjectID interno exclusivo del campo a borrar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<string>} Respuesta en bruto del servidor tras el borrado.
 */
export async function deleteDataExtensionField(deExternalKey, fieldObjectId, apiConfig) {
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
 * Lista los nombres y CustomerKeys de todas las Data Extensions dentro de una carpeta concreta.
 * @param {string} categoryId - ID de la carpeta a inspeccionar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Arreglo de objetos básicos de DE.
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
 * Busca y retorna datos tabulares (filas) de una DE que coincidan con un criterio exacto.
 * @param {string} deKey - External Key de la DE.
 * @param {string} fieldName - Columna por la cual filtrar.
 * @param {string} searchValue - Valor exacto que debe contener la columna.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de registros (filas) encontrados.
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
 * Realiza un proceso de clonación exacto de una DE: extrae la metadata de la original,
 * extrae sus campos y lanza una petición SOAP para crear una copia idéntica.
 * @param {string} originalDeCustomerKey - Key de la tabla molde.
 * @param {string} newDeName - Nombre que tendrá la tabla destino.
 * @param {string} newDeCustomerKey - Key de la tabla destino (generalmente vacía para auto-generarse).
 * @param {string|number} targetCategoryId - ID de carpeta de destino de la clonada.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} IDs generados (objectID, customerKey, name) de la DE clonada.
 */
export async function cloneDataExtension(originalDeCustomerKey, newDeName, newDeCustomerKey, targetCategoryId, apiConfig) {
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

    const fields = await fetchFieldsForDE(originalDeCustomerKey, apiConfig);
    if (fields.length === 0) throw new Error("No se pudieron recuperar los campos de la DE original.");

    const fieldsForXml = fields.map(f => ({ name: f.name, type: f.type, length: f.length, defaultValue: f.defaultValue, isPrimaryKey: f.isPrimaryKey, isRequired: f.isRequired }));
    const fieldsXmlString = fieldsForXml.map(buildFieldXml).join('');
    const sendableFieldType = fields.find(f => f.name === originalDeDetails.sendableField)?.type;

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
 * Recupera exclusivamente el nombre de una Data Extension basándose en alguna de sus propiedades.
 * @param {string} property - Qué campo evaluar (ej: "ObjectID", "CustomerKey").
 * @param {string} value - Valor que se busca en esa propiedad.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<string>} Nombre de la Data Extension o devuelve el "value" original si no se encuentra.
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

    return nameNode ? nameNode.textContent : value;
}

/**
 * Recupera exclusivamente el nombre de una columna (Field) usando el ObjectID interno del campo.
 * @param {string} fieldObjectId - El ObjectID SOAP del campo.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<string>} El nombre del campo o "Campo Desconocido".
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

/**
 * Busca Data Extensions que coincidan parcialmente (`LIKE`) con un valor dado.
 * @param {string} property - La propiedad objetivo (Name, CustomerKey).
 * @param {string} value - El texto parcial que debe contener.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de DEs encontradas con su info básica.
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
 * Obtiene el ObjectID interno de una Data Extension buscándola por su nombre exacto.
 * @param {string} deName - Nombre estricto de la tabla.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<string>} El ObjectID de la Data Extension encontrada.
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
 * Obtiene CustomerKey, ObjectID y CategoryID de una Data Extension proporcionando su nombre exacto.
 * @param {string} deName - Nombre estricto de la tabla.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Propiedades clave de la Data Extension.
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
 * Recupera todas las actividades "Import Definition" cuyo destino sea el ObjectID proporcionado de una DE.
 * @param {string} deObjectId - El ObjectID de la Data Extension destino.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Arreglo con la info de la importación y los automatismos que la utilizan.
 */
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