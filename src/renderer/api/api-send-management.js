// ===================================================================
// Fichero: api-send-management.js
// ===================================================================
import { executeSoapRequest } from './api-core.js';

/**
 * Recupera y procesa en bloque la información de todas las Send Classifications (SOAP).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista enriquecida con información de Sender y Delivery Profiles vinculados.
 */
export async function fetchAllSendClassifications(apiConfig) {
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
                    <ObjectType>SendClassification</ObjectType>
                    <Properties>ObjectID</Properties>
                    <Properties>Name</Properties>
                    <Properties>CustomerKey</Properties>
                    <Properties>SendClassificationType</Properties>
                    <Properties>Description</Properties>
                    <Properties>SenderProfile.CustomerKey</Properties>
                    <Properties>DeliveryProfile.CustomerKey</Properties>
                    <Properties>ModifiedDate</Properties>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const doc = new DOMParser().parseFromString(responseText, "application/xml");
    const results = doc.querySelectorAll("Results");

    return Array.from(results).map(node => ({
        id: node.querySelector("ObjectID")?.textContent,
        name: node.querySelector("Name")?.textContent,
        customerKey: node.querySelector("CustomerKey")?.textContent,
        type: node.querySelector("SendClassificationType")?.textContent,
        description: node.querySelector("Description")?.textContent || "---",
        senderProfile: node.querySelector("SenderProfile > CustomerKey")?.textContent,
        deliveryProfile: node.querySelector("DeliveryProfile > CustomerKey")?.textContent,
        modifiedDate: node.querySelector("ModifiedDate")?.textContent
    }));
}

/**
 * Recupera y procesa en bloque todos los Sender Profiles (SOAP), detectando configuraciones como RMM.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de todos los perfiles de envío extraídos.
 */
export async function fetchAllSenderProfiles(apiConfig) {
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
                    <ObjectType>SenderProfile</ObjectType>
                    <Properties>ObjectID</Properties>
                    <Properties>Name</Properties>
                    <Properties>CustomerKey</Properties>
                    <Properties>FromName</Properties>
                    <Properties>FromAddress</Properties>
                    <Properties>Description</Properties>
                    <Properties>ModifiedDate</Properties>
                    <Properties>UseDefaultRMMRules</Properties>
                    <Properties>AutoForwardToEmailAddress</Properties>
                    <Properties>AutoForwardToName</Properties>
                    <Properties>DirectForward</Properties>
                    <Properties>AutoReply</Properties>
                    <Properties>AutoReplyTriggeredSend.ObjectID</Properties>
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const doc = new DOMParser().parseFromString(responseText, "application/xml");
    const results = doc.querySelectorAll("Results");

    return Array.from(results).map(node => ({
        id: node.querySelector("ObjectID")?.textContent,
        name: node.querySelector("Name")?.textContent,
        customerKey: node.querySelector("CustomerKey")?.textContent,
        fromName: node.querySelector("FromName")?.textContent,
        fromAddress: node.querySelector("FromAddress")?.textContent,
        description: node.querySelector("Description")?.textContent || "---",
        modifiedDate: node.querySelector("ModifiedDate")?.textContent,
        useDefaultRMM: node.querySelector("UseDefaultRMMRules")?.textContent === 'true',
        autoForwardEmail: node.querySelector("AutoForwardToEmailAddress")?.textContent || "---",
        autoForwardName: node.querySelector("AutoForwardToName")?.textContent || "---",
        directForward: node.querySelector("DirectForward")?.textContent === 'true',
        autoReply: node.querySelector("AutoReply")?.textContent === 'true',
        autoReplyTriggeredId: node.querySelector("AutoReplyTriggeredSend > ObjectID")?.textContent || "---"
    }));
}

/**
 * Obtiene el estado y nombre de múltiples Triggered Send Definitions en bloque basado en sus ObjectIDs.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @param {Array<string>} objectIds - Arreglo de IDs internos a recuperar.
 * @returns {Promise<Array>} Resultados de las definiciones de envío.
 */
export async function fetchTriggeredSendDetails(apiConfig, objectIds) {
    if (!objectIds || objectIds.length === 0) return [];

    const filterXml = buildObjectIdFilter(objectIds);

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
                    <Properties>Name</Properties>
                    <Properties>CustomerKey</Properties>
                    <Properties>TriggeredSendStatus</Properties>
                    ${filterXml}
                </RetrieveRequest>
            </RetrieveRequestMsg>
        </s:Body>
    </s:Envelope>`;

    const responseText = await executeSoapRequest(apiConfig.soapUri, soapPayload);
    const doc = new DOMParser().parseFromString(responseText, "application/xml");
    const results = doc.querySelectorAll("Results");

    return Array.from(results).map(node => ({
        id: node.querySelector("ObjectID")?.textContent,
        name: node.querySelector("Name")?.textContent,
        customerKey: node.querySelector("CustomerKey")?.textContent,
        status: node.querySelector("TriggeredSendStatus")?.textContent
    }));
}

/**
 * Helper interno para armar nodos XML `SimpleFilterPart` adaptativos dependiendo si es un ID único o múltiple (IN).
 * @param {Array<string>} objectIds - IDs sobre los que filtrar.
 * @returns {string} Fragmento XML formateado.
 */
function buildObjectIdFilter(objectIds) {
    const operator = objectIds.length === 1 ? 'equals' : 'IN';
    const values = objectIds
        .map(id => `<Value>${id}</Value>`)
        .join('\n                    ');

    return `<Filter xsi:type="SimpleFilterPart">
                <Property>ObjectID</Property>
                <SimpleOperator>${operator}</SimpleOperator>
                ${values}
            </Filter>`;
}

/**
 * Helper recursivo para transformar un árbol lógico JSON a la estructura `<ComplexFilterPart>` de MC SOAP.
 * @param {object} node - Nodo de la estructura de filtro (LeftOperand, RightOperand, etc.).
 * @returns {object} Objeto con la cadena XML resultante y el typo detectado del filtro.
 */
export function buildComplexFilter(node) {
    if (node.Property) {
        const values = Array.isArray(node.Value)
            ? node.Value.map(v => `<Value>${v}</Value>`).join('\n')
            : `<Value>${node.Value}</Value>`;

        return {
            xml: `<Property>${node.Property}</Property>
                <SimpleOperator>${node.SimpleOperator}</SimpleOperator>
                ${values}`,
            type: 'SimpleFilterPart'
        };
    }

    const left  = buildComplexFilter(node.LeftOperand);
    const right = buildComplexFilter(node.RightOperand);

    return {
        xml: `<LeftOperand xsi:type="${left.type}">${left.xml}</LeftOperand>
            <LogicalOperator>${node.LogicalOperator}</LogicalOperator>
            <RightOperand xsi:type="${right.type}">${right.xml}</RightOperand>`,
        type: 'ComplexFilterPart'
    };
}