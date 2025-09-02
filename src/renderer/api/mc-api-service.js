// ===================================================================
// Fichero: mc-api-service.js
// Descripción: Módulo centralizado para todas las interacciones con las
// APIs de Marketing Cloud (REST y SOAP). No contiene lógica de DOM.
// ===================================================================

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
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${apiConfig.accessToken}` }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error ${response.status} al recuperar automatismos: ${errorText}`);
  }
  const data = await response.json();
  return data.entry || [];
}

// ... aquí irán futuras funciones de automatismos (activar, parar, etc.)


// ==========================================================
// --- 2. DATA EXTENSIONS & FIELDS API (SOAP) ---
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

    const response = await fetch(apiConfig.soapUri, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: soapPayload
    });
    const responseText = await response.text();
    if (!responseText.includes('<OverallStatus>OK</OverallStatus>')) {
        const errorMatch = responseText.match(/<StatusMessage>(.*?)<\/StatusMessage>/);
        throw new Error(errorMatch ? errorMatch[1] : 'Error desconocido al recuperar campos.');
    }
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

  const response = await fetch(apiConfig.soapUri, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: soapPayload.trim()
  });

  const responseText = await response.text();
  if (!responseText.includes('<OverallStatus>OK</OverallStatus>')) {
      const errorMatch = responseText.match(/<StatusMessage>(.*?)<\/StatusMessage>/);
      throw new Error(errorMatch ? errorMatch[1] : 'Error desconocido al crear la Data Extension.');
  }

  return true; // Éxito
}


// ==========================================================
// --- 3. JOURNEYS API ---
// ==========================================================
// ...


// ==========================================================
// --- 4. SUBSCRIBERS & CONTACTS API ---
// ==========================================================
// ...


// ==========================================================
// --- HELPERS INTERNOS DEL SERVICIO ---
// ==========================================================

/**
 * Parsea una respuesta SOAP de campos de DE y la convierte en un array de objetos.
 * Es una función interna de este servicio.
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
            if (fieldType.toLowerCase() === 'decimal' && getText(node, 'Scale') !== '0') {
                length = `${length},${getText(node, 'Scale')}`;
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
 * @param {object} fieldData - Objeto con los datos del campo (name, type, length, etc.).
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