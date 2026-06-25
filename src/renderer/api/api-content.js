// ===================================================================
// Fichero: api-content.js
// ===================================================================
import { executeRestRequest, logger, setSilentResponses } from './api-core.js';
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
            "values": [205, 240, 241, 242, 243, 244, 245, 247, 248, 249]
        },
        "sort": [{ "property": "id", "direction": "ASC" }],
        "fields": [
            "id", "name", "assetType", "modifiedDate", "category", 
            "content", "meta", "views", "memberId", "customerKey", 
            "status", "modifiedBy"
        ]
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

/**
 * Recupera el detalle completo de un asset por su ID.
 */
export async function fetchAssetById(assetId, apiConfig) {
    const url = `${apiConfig.restUri}asset/v1/content/assets/${assetId}`;
    const options = {
        method: 'GET',
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}` }
    };
    return await executeRestRequest(url, options);
}

 
/**
 * Recupera todos los contenidos de Content Builder dividiendo las peticiones por tipo de asset.
 * Así cada query ataca un subset más pequeño y el usuario ve progreso real.
 * @param {Array} contentTypesConfig - El array CONTENT_TYPES_CONFIG con los grupos de tipos.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @param {function} onProgress - Callback para actualizar la UI con el progreso.
 * @returns {Promise<Array>} Lista de contenidos transformados.
 */
export async function fetchAllContentAssets(contentTypesConfig, getAuthenticatedConfig, onProgress, onGroupComplete) {
    const emailTypeIds = [207, 208, 209];
    const jsonMessageTypeIds = [230];
    const pageSize = 50;
    let allResults = [];

    let apiConfig = await getAuthenticatedConfig();

    // Silenciar log de respuestas para evitar acumular GBs en el buffer
    setSilentResponses(true);

    let requestCount = 0;
    const REFRESH_EVERY = 10; // cada 10 llamadas, verificar token

    async function ensureFreshToken() {
        requestCount++;
        if (requestCount % REFRESH_EVERY === 0) {
            logger.logMessage('⟳ Verificando token...');
            apiConfig = await getAuthenticatedConfig();
        }
    }

    // Deduplicar los grupos de tipos para no repetir el 230
    const typeGroups = [];
    const seen = new Set();
    for (const config of contentTypesConfig) {
        const key = config.assetTypeIds.join(',');
        if (!seen.has(key)) {
            seen.add(key);
            typeGroups.push({ name: config.displayName, ids: config.assetTypeIds });
        }
    }

    for (let g = 0; g < typeGroups.length; g++) {
        const group = typeGroups[g];
        let page = 1;
        let totalCount = 0;
        let groupCount = 0;

        if (onProgress) onProgress(`Descargando ${group.name}...`);
        logger.logMessage(`Consultando tipo "${group.name}" (IDs: ${group.ids.join(', ')})...`);

        const queryBody = {
            "query": {
                "property": "assetType.id",
                "simpleOperator": "in",
                "values": group.ids
            },
            "sort": [{ "property": "id", "direction": "ASC" }],
            "fields": [
                "id", "name", "assetType", "createdDate", "modifiedDate",
                "content", "views", "category", "customerKey"
            ]
        };

        do {
            await ensureFreshToken();

            const url = `${apiConfig.restUri}asset/v1/content/assets/query`;
            const body = { ...queryBody, page: { page: page, pageSize: pageSize } };
            const options = {
                method: 'POST',
                headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify(body)
            };

            const data = await executeRestRequest(url, options);
            const pageItems = data.items || [];

            for (const raw of pageItems) {
                allResults.push(transformAsset(raw, emailTypeIds, jsonMessageTypeIds));
            }

            groupCount += pageItems.length;
            totalCount = data.count;

            if (onProgress) onProgress(`Descargando ${group.name}... ${groupCount}/${totalCount}`);
            logger.logMessage(`  ${group.name} — Pág ${page}: ${pageItems.length} items (${groupCount}/${totalCount})`);
            page++;

            // Guardar cada 500 items
            if (onGroupComplete && groupCount % 500 === 0) {
                await onGroupComplete(allResults);
            }

        } while (groupCount < totalCount && totalCount > 0);

        logger.logMessage(`✓ ${group.name}: ${groupCount} contenidos.`);

        if (onGroupComplete) await onGroupComplete(allResults);
    }

    logger.logMessage(`Total: ${allResults.length} contenidos obtenidos.`);

    setSilentResponses(false);

    return allResults;
}

/**
 * Transforma un asset crudo de la API al formato plano que usa content-manager.
 */
function transformAsset(a, emailTypeIds, jsonMessageTypeIds) {
    const item = {
        id: a.id,
        name: a.name,
        customerKey: a.customerKey || null,
        assetTypeId: a.assetType?.id,
        assetTypeName: a.assetType?.displayName,
        createdDate: a.createdDate,
        modifiedDate: a.modifiedDate,
        content: a.content
    };

    if (emailTypeIds.includes(item.assetTypeId)) {
        const attrs = a?.data?.email?.attributes
            ?.filter(attr => attr.value)
            .map(attr => `${attr.order}: ${attr.value}`)
            .join('\n') || null;

        item.templateId = a?.views?.html?.template?.id ?? null;
        item.templateName = a?.views?.html?.template?.name ?? null;
        item.attributes = attrs;
        item.subject = a?.views?.subjectline?.content ?? null;
        item.preheader = a?.views?.preheader?.content ?? null;

        // Contenido principal + bloques de slots
        let fullContent = a?.views?.html?.content || '';
        const slotBlockIds = [];
        const slots = a?.views?.html?.slots;
        if (slots) {
            for (const slotKey in slots) {
                const blocks = slots[slotKey]?.blocks;
                if (blocks) {
                    for (const blockKey in blocks) {
                        const block = blocks[blockKey];
                        if (block.content) fullContent += '\n' + block.content;
                        // Recoger IDs de bloques arrastrados
                        const refId = block.meta?.options?.id || block.id;
                        if (refId) slotBlockIds.push(String(refId));
                    }
                }
            }
        }
        item.content = fullContent || a.content || null;
        item.slotBlockIds = slotBlockIds.length > 0 ? slotBlockIds : null;
    } else if (jsonMessageTypeIds.includes(item.assetTypeId)) {
        const viewKeys = Object.keys(a?.views || {});
        const findView = (name) => viewKeys.find(k => k.toLowerCase() === name.toLowerCase());

        const pushKey = findView('push');
        const smsKey = findView('sms') || findView('sMS');
        const waKey = findView('whatsAppTemplate') || findView('whatsapptemplate');

        const pushData = pushKey ? a.views[pushKey]?.meta?.options?.customBlockData : null;
        const smsData = smsKey ? a.views[smsKey]?.meta?.options?.customBlockData : null;
        const waData = waKey ? a.views[waKey]?.meta?.options?.customBlockData : null;
        const customData = pushData || smsData || waData;

        // Tipo por channel
        item.type = customData?.channel || null;

        item.title = customData?.['display:title'] ?? null;
        item.subtitle = customData?.['display:subtitle'] ?? null;
        item.message = customData?.['display:message'] ?? a.content ?? null;

        // Push tiene openBehavior
        item.actionType = customData?.['openBehavior:actionType']?.label ?? null;
        item.actionUrl = customData?.['openBehavior:action'] ?? null;

        // Push tiene media
        item.media = [
            customData?.['display:media:image:url'] ? `Imagen: ${customData['display:media:image:url']}` : null,
            customData?.['display:media:video:url'] ? `Video: ${customData['display:media:video:url']}` : null
        ].filter(Boolean).join('\n') || null;
    }

    if (jsonMessageTypeIds.includes(item.assetTypeId)) {
        item.content = null;
    }

    return item;
}