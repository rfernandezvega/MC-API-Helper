// ===================================================================
// Fichero: api-subscribers.js
// ===================================================================
import { executeSoapRequest, executeRestRequest } from './api-core.js';

/**
 * Recupera el nombre legible de una clasificación de envío (Send Classification) por su ObjectID.
 * @param {string} objectId - ID interno de la Send Classification.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<string>} El nombre de la clasificación o "Clasificación Desconocida".
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
 * Recupera el nombre legible de una Lista (como Publication List) por su ListID.
 * @param {string|number} listId - El ID numérico de la Lista.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<string>} El nombre de la Lista o "Lista Desconocida".
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
 * Busca un suscriptor global en Marketing Cloud mediante la API SOAP.
 * @param {string} property - La propiedad a evaluar (ej: "SubscriberKey" o "EmailAddress").
 * @param {string} value - Valor a buscar exacto.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de objetos con los datos básicos del suscriptor (Key, Email, Status...).
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
 * Busca detalles de un Contacto en Contact Builder mediante la API REST.
 * @param {string} contactKey - El ContactKey a consultar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista (generalmente de 1 elemento) con datos del contacto.
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

// ===================================================================
// ===== CONTACT BUILDER: ATTRIBUTE MODEL (para el Generador ERD) =====
// ===================================================================

/**
 * Recupera el ID del schema de Contactos (necesario para listar los attribute groups).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<string|null>} El ID del schema o null.
 */
export async function fetchContactsSchemaId(apiConfig) {
    const url = `${apiConfig.restUri}contacts/v1/schema`;
    const data = await executeRestRequest(url, { headers: { Authorization: `Bearer ${apiConfig.accessToken}` } });
    return data.items?.[0]?.id || data.id || null;
}

// Helper interno: pagina un endpoint de grupos.
async function _fetchGroupsPaginated(apiConfig, baseUrl) {
    let all = [];
    let page = 1;
    let count = 0;
    const pageSize = 50;
    do {
        const url = `${baseUrl}?$page=${page}&$pageSize=${pageSize}`;
        const data = await executeRestRequest(url, { headers: { Authorization: `Bearer ${apiConfig.accessToken}` } });
        const items = data.items || [];
        all = all.concat(items);
        count = data.count || all.length;
        page++;
    } while (all.length < count && count > 0);
    return all;
}

/**
 * Recupera los Attribute Groups (con su nombre y flag de sistema) de Contact Builder.
 * Intenta el flujo por schema (schema → schemas/{id}/attributeGroups) y, si no obtiene
 * resultados, prueba el endpoint sin schema.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de attribute groups (items).
 */
export async function fetchAttributeGroups(apiConfig) {
    // 1) Vía schema (flujo confirmado)
    let schemaId = null;
    try { schemaId = await fetchContactsSchemaId(apiConfig); } catch { /* ignore */ }
    if (schemaId) {
        try {
            const groups = await _fetchGroupsPaginated(apiConfig, `${apiConfig.restUri}contacts/v1/schemas/${schemaId}/attributeGroups`);
            if (groups.length) return groups;
        } catch { /* ignore */ }
    }
    // 2) Fallback sin schema
    try {
        return await _fetchGroupsPaginated(apiConfig, `${apiConfig.restUri}contacts/v1/attributeGroups`);
    } catch { /* ignore */ }
    return [];
}

/**
 * Recupera todas las definiciones de Attribute Sets de Contact Builder, gestionando paginación.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista completa de attribute sets (items).
 */
export async function fetchAttributeSetDefinitions(apiConfig) {
    let all = [];
    let page = 1;
    let count = 0;
    const pageSize = 50;
    do {
        const url = `${apiConfig.restUri}contacts/v1/attributeSetDefinitions?$page=${page}&$pageSize=${pageSize}`;
        const data = await executeRestRequest(url, { headers: { Authorization: `Bearer ${apiConfig.accessToken}` } });
        const items = data.items || [];
        all = all.concat(items);
        count = data.count || all.length;
        page++;
    } while (all.length < count && count > 0);
    return all;
}