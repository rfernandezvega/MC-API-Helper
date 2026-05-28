// ===================================================================
// Fichero: api-helpers.js
// Descripción: Funciones transversales como la caché y rutas de carpetas.
// ===================================================================
import { executeSoapRequest } from './api-core.js';

export const folderPathCache = new Map();

/**
 * Obtiene la ruta de carpetas completa (forma recursiva) a partir de un ID de carpeta.
 * Utiliza una caché en memoria para no repetir peticiones SOAP idénticas.
 * @param {string|number} folderId - ID de la carpeta a consultar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<string>} La ruta en formato texto (ej: "Carpeta Raíz > Subcarpeta").
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