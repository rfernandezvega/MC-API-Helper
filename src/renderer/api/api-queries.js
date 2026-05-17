// ===================================================================
// Fichero: api-queries.js
// Descripción: Búsqueda, clonación y borrado de Query Activities.
// ===================================================================
import { executeSoapRequest, executeRestRequest } from './api-core.js';
import { findAutomationForActivity } from './api-activities.js'; // Importante para recuperar automatismos

/**
 * Genera un wrapper sobre la función principal de búsqueda de SQL Queries adaptando operadores básicos.
 * @param {object} filter - Filtros estructurados (property, simpleOperator, value).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de Query Definitions y sus automatismos asociados.
 */
export async function searchQueriesBySimpleFilter({ property, simpleOperator, value }, apiConfig) {
    const filterValue = simpleOperator === 'like' ? `%${value}%` : value;
    const filterXml = `<Filter xsi:type="SimpleFilterPart"><Property>${property}</Property><SimpleOperator>${simpleOperator}</SimpleOperator><Value>${filterValue}</Value></Filter>`;
    return findQueriesByFilter(filterXml, apiConfig);
}

/**
 * Función interna centralizada para ejecutar cualquier Retrieval SOAP de QueryDefinition en base a un filtro inyectado.
 * @param {string} filterXml - Estructura XML del tag Filter de Marketing Cloud.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Arreglo de queries extraídas.
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
        return { ...q, automations }; 
    }));

    return queriesWithAutomations;
}

/**
 * Borra una actividad de Query Definition usando la API REST v1.
 * @param {string} queryObjectId - El ObjectID técnico de la consulta a borrar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Promesa de eliminación resuelta.
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
 * Inspecciona una carpeta específica para recuperar toda la información estructural de las Queries que la componen.
 * @param {string|number} folderId - ID de la categoría (carpeta).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Array con datos de cada Query (QueryText, Target, Action, etc.).
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
 * Clona una Query Activity inyectando los datos del molde SQL con un nuevo nombre, apuntando al nuevo TargetDE clonado
 * y guardándolo en la carpeta deseada en una sola llamada SOAP.
 * @param {object} originalQuery - Propiedades de la Query padre original.
 * @param {object} clonedDE - Información generada de la nueva tabla de destino.
 * @param {string} newQueryName - Nombre final de la nueva Query.
 * @param {string|number} targetCategoryId - Carpeta donde vivirá la query clonada.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} IDs y nombre base de la nueva query (para gatillar en el nuevo automatismo).
 */
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

/**
 * Obtiene los identificadores principales (ObjectID, Category, Nombre) utilizando el ExternalKey de una Query.
 * @param {string} customerKey - External/Customer Key de la query.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Objeto con las llaves de identificación extraídas.
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
 * Devuelve un desglose profundo (SQL Text, Action, Target, Description) pasándole el ObjectID de una consulta.
 * @param {string} queryObjectId - ObjectID técnico de la consulta.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} Detalles enriquecidos del QueryDefinition.
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