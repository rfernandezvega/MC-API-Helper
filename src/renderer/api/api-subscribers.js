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