// ===================================================================
// Fichero: api-content.js
// ===================================================================
import { executeRestRequest, logger } from './api-core.js';
import { getFolderPath } from './api-helpers.js';

/**
 * Recupera la lista completa de todos los assets que son de tipo "Cloud Page" en la instancia.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista masiva de assets (Landing Pages, Code Resources, etc.).
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

    } while (allItems.length < totalCount && totalCount > 0); 
    
    return allItems;
}

/**
 * Mapea y enriquece una lista de assets añadiendo su ruta de carpeta completa ("location").
 * @param {Array} items - Arreglo de assets de Content Builder.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} El mismo arreglo, pero cada objeto incluye la propiedad `location`.
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
 * Busca cualquier tipo de contenido en Content Builder. Intenta buscar primero por nombre (like);
 * si no encuentra, asume que es un ID e intenta buscar por ID exacto.
 * @param {string} searchValue - Texto o número a buscar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<Array>} Lista de resultados coincidentes.
 */
export async function searchContentAssets(searchValue, apiConfig) {
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

    logger.logMessage(`Paso 1/2: Buscando contenidos por nombre que contenga "${searchValue}"...`);
    const nameQuery = {
        "property": "name",
        "simpleOperator": "like",
        "value": searchValue
    };
    let results = await executePaginatedQuery(nameQuery);

    if (results.length > 0) {
        logger.logMessage(`Búsqueda por nombre exitosa. Se encontraron ${results.length} resultado(s).`);
        return results;
    }

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
        if (error.message && error.message.toLowerCase().includes("error converting value")) {
            logger.logMessage("La búsqueda por ID falló (valor de entrada no numérico). Se considera que no hay resultados.");
            return []; 
        } else {
            throw error;
        }
    }
}