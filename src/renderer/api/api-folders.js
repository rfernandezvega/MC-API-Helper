// ===================================================================
// Fichero: api-folders.js
// Descripción: Gestión, búsqueda y creación de carpetas en MC.
// ===================================================================
import { executeSoapRequest, executeRestRequest } from './api-core.js';
import { getFolderPath } from './api-helpers.js';

/**
 * Localiza carpetas según fragmentos de su nombre limitando la búsqueda al tipo de contenido (ej. DataExtension).
 * @param {string} folderName - Texto parcial o exacto de la carpeta a buscar.
 * @param {string} contentType - Tipo de objeto que alberga (dataextension, queryactivity, etc.).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista con IDs y la ruta completa precalculada de cada resultado.
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
 * Actúa como enrutador lógico para generar una carpeta nueva usando SOAP o REST
 * dependiendo de lo que el tipo de contenido demande (Journeys y Assets van por REST, el resto por SOAP).
 * @param {string} folderName - Nombre de la nueva carpeta a crear.
 * @param {number|string} parentId - ID de la carpeta contenedora.
 * @param {string} contentType - Tipo de contenido (journey, asset, dataextension, etc.).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<string>} El ID único generado tras crear la carpeta.
 */
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