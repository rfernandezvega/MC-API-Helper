// ===================================================================
// Fichero: api-content.js
// ===================================================================
import { executeRestRequest, logger, setSilentResponses } from './api-core.js';
import { resolveFolderPaths } from './api-helpers.js';

/** Formatea una duración en segundos a un texto de estimación (~X s / ~X min / ~X h). */
function etaFromSeconds(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '';
    const s = Math.round(seconds);
    if (s < 60) return `~${s} s`;
    const m = Math.floor(s / 60);
    const remS = s % 60;
    if (m < 60) return remS ? `~${m} min ${remS} s` : `~${m} min`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return remM ? `~${h} h ${remM} min` : `~${h} h`;
}

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
    // Todas las carpetas se resuelven en bloque, así que el coste es la profundidad del
    // árbol y no el número de assets (que aquí son todos los de la BU).
    const paths = await resolveFolderPaths(
        items.map(item => item.category?.id).filter(Boolean),
        apiConfig
    );

    return items.map(item => ({
        ...item,
        location: item.category?.id ? (paths.get(String(item.category.id)) || 'Carpeta Raíz') : 'Carpeta Raíz'
    }));
}

/** Tope de páginas por búsqueda: evita un bucle sin fin si la API devolviera siempre páginas llenas. */
const MAX_QUERY_PAGES = 150;

/**
 * Ejecuta una query paginada contra el endpoint de búsqueda de assets de Content Builder,
 * acumulando páginas mientras lleguen llenas.
 * No se usa el `count` de la respuesta para parar porque con `mustcontain` (y con
 * `scope=ours,shared`) puede venir por debajo del real y cortaba la búsqueda antes de tiempo.
 * @param {object} queryPayload - Cuerpo de "query" (property/simpleOperator/value) a enviar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @param {Array<string>|null} fields - Campos a solicitar por cada asset; null para recibir el asset completo.
 * @param {number} pageSize - Tamaño de página (más pequeño cuando se piden campos pesados como `content`).
 * @param {string} [scope='ours'] - Alcance de la búsqueda vía query param `scope`: 'ours' (solo la
 *   BU activa) o 'ours,shared' (BU activa + Shared Content). El endpoint es siempre el mismo
 *   (`.../assets/query`); no existe una ruta separada para compartidos bajo `assets/` (da 404).
 * @returns {Promise<Array>} Todos los items encontrados, sin filtrar y sin duplicados por id.
 */
async function executePaginatedQuery(queryPayload, apiConfig, fields, pageSize, scope = 'ours') {
    const itemsById = new Map();
    let page = 1;
    let pageItems = [];

    const queryBody = {
        "query": queryPayload,
        "sort": [{ "property": "id", "direction": "ASC" }]
    };
    if (fields) queryBody.fields = fields;

    do {
        const url = `${apiConfig.restUri}asset/v1/content/assets/query?scope=${scope}`;
        const body = { ...queryBody, page: { page: page, pageSize: pageSize } };
        const options = {
            method: 'POST',
            headers: { "Authorization": `Bearer ${apiConfig.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(body)
        };

        const data = await executeRestRequest(url, options);

        pageItems = data.items || [];
        // Con scope=ours,shared un mismo asset puede repetirse entre páginas.
        pageItems.forEach(item => itemsById.set(String(item.id), item));
        page++;

    } while (pageItems.length === pageSize && page <= MAX_QUERY_PAGES);

    return [...itemsById.values()];
}

/**
 * Sustituye las comillas tipográficas (“ ” „ ‟ « » ‘ ’ ‚ ‛) por comillas rectas. Los editores de
 * Content Builder y el texto pegado desde Word las meten a menudo, y sin igualarlas un texto
 * escrito con comillas rectas no casaría con el contenido.
 * @param {string} str - Texto a normalizar.
 * @returns {string} El texto con comillas rectas.
 */
function normalizeQuotes(str) {
    if (!str) return '';
    return String(str)
        .replace(/[“”„‟«»]/g, '"')
        .replace(/[‘’‚‛]/g, "'");
}

/**
 * Prepara el valor que se manda al operador `mustcontain`: el texto del usuario, recortado y con
 * las comillas normalizadas, sin envolverlo en `%"…"%`. Ese envoltorio forzaba una frase exacta
 * contra el índice de texto de la API, que trocea por guiones y otros signos, y se dejaba fuera
 * contenidos que sí llevaban el texto (p. ej. `mc-deep-link`). Así la API devuelve de más y el
 * cribado local (`assetContainsText`) descarta lo que no lo contiene.
 * @param {string} text - Texto de búsqueda introducido por el usuario.
 * @returns {string} El valor a enviar en la query.
 */
function buildMustContainValue(text) {
    return normalizeQuotes(String(text).trim());
}

/**
 * Claves de metadatos que no forman parte del contenido y se saltan al cribar, a cualquier
 * profundidad (también en los bloques incrustados en los slots, que traen los suyos). Sin
 * excluirlas, un asset casaba solo porque su carpeta, su nombre o su propietario contenían el
 * texto aunque su código no lo llevara.
 */
const NON_CONTENT_KEYS = new Set([
    'name', 'description', 'customerKey', 'category', 'assetType', 'owner', 'createdBy',
    'modifiedBy', 'createdDate', 'modifiedDate', 'status', 'sharingProperties', 'fileProperties',
    'thumbnail', 'availableViews', 'tags', 'memberId', 'enterpriseId', 'objectID', 'legacyData',
    'modelVersion', 'locked'
]);

/**
 * Junta en un único texto los valores de cadena del contenido de un asset (content, design,
 * superContent, las vistas con sus slots y bloques, data, meta...) para poder buscar dentro de él,
 * saltándose los metadatos de `NON_CONTENT_KEYS`.
 * Se recorre el objeto en vez de serializarlo con JSON.stringify porque este escapa comillas y
 * saltos de línea, y entonces un texto como `href="#activities"` no casaría nunca.
 * @param {object} item - Asset devuelto por la API.
 * @returns {string} Todo su texto concatenado, con comillas normalizadas y en minúsculas.
 */
function collectSearchableText(item) {
    const parts = [];
    const walk = (value) => {
        if (typeof value === 'string') parts.push(value);
        else if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') {
            Object.entries(value).forEach(([key, child]) => {
                if (!NON_CONTENT_KEYS.has(key)) walk(child);
            });
        }
    };
    walk(item);
    return normalizeQuotes(parts.join('\n')).toLowerCase();
}

/**
 * Indica si el contenido de un asset contiene el texto buscado, sin distinguir mayúsculas ni
 * comillas tipográficas. Solo mira contenido, no metadatos (ver `collectSearchableText`).
 * @param {object} item - Asset completo devuelto por la API.
 * @param {string} needle - Texto buscado, ya normalizado y en minúsculas.
 * @returns {boolean} true si el texto aparece en el contenido del asset.
 */
function assetContainsText(item, needle) {
    return collectSearchableText(item).includes(needle);
}

/**
 * Indica si un asset está compartido con otras BUs: tiene destinatarios en
 * `sharingProperties.sharedWith`. Es la única fuente para marcar `isShared` (ya no hay
 * endpoint separado para compartidos: con `scope=ours,shared` propios y compartidos llegan
 * mezclados en la misma respuesta, así que solo los datos del propio item lo distinguen).
 * @param {object} item - Item devuelto por la API.
 * @returns {boolean} true si el asset tiene BUs de destino en sharingProperties.sharedWith.
 */
function hasSharedWith(item) {
    return Array.isArray(item?.sharingProperties?.sharedWith) && item.sharingProperties.sharedWith.length > 0;
}

/**
 * Busca contenido en Content Builder según el tipo de búsqueda elegido en la picklist del Buscador.
 * @param {string} searchValue - Texto o número a buscar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @param {string} [searchType='name'] - 'name' (like), 'id' (exacto) o 'content' (dentro del cuerpo).
 *   La búsqueda por 'content' se apoya en el operador `mustcontain` (ver `buildMustContainValue`),
 *   pero como devuelve assets que no llevan el texto, después se criba en local contra el cuerpo
 *   ya descargado, igual que hace el buscador de la vista de Contenidos.
 * @param {boolean} [includeShared=false] - Si es true, la query se manda con `scope=ours,shared`
 *   para traer en la misma llamada los assets de la BU activa y los de Shared Content.
 * @returns {Promise<Array>} Lista de resultados coincidentes, cada uno con la marca `isShared`.
 */
export async function searchContentAssets(searchValue, apiConfig, searchType = 'name', includeShared = false) {
    const scope = includeShared ? 'ours,shared' : 'ours';
    const sharedSuffix = includeShared ? ' (incluyendo Shared Content)' : '';
    // El cuerpo se pide SIEMPRE: hace falta para cribar en local los falsos positivos de
    // `mustcontain`, y en las búsquedas por nombre/id evita tener que volver a la API asset por
    // asset para enseñar el código, que salen muchas más llamadas que traerlo de una vez.
    // sharingProperties es barato y alimenta la marca isShared en los tres tipos de búsqueda.
    const fields = ["id", "name", "assetType", "category", "sharingProperties", "content", "views", "data"];
    // Equilibrio entre número de llamadas y peso de cada respuesta: con el cuerpo dentro, 500 por
    // página tarda demasiado y 100 multiplica las llamadas.
    const pageSize = 200;
    const markShared = (items) => items.map(item => ({ ...item, isShared: hasSharedWith(item) }));

    // El cuerpo de los contenidos desbordaría el buffer del panel de logs.
    setSilentResponses(true);
    try {
        if (searchType === 'id') {
            logger.logMessage(`Buscando contenidos por ID exacto "${searchValue}"${sharedSuffix}...`);
            try {
                const idQuery = { "property": "id", "simpleOperator": "equal", "value": searchValue };
                const results = markShared(await executePaginatedQuery(idQuery, apiConfig, fields, pageSize, scope));
                logger.logMessage(`Búsqueda por ID completada. Total ${results.length} resultado(s)${sharedSuffix}.`);
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

        if (searchType === 'content') {
            logger.logMessage(`Buscando contenidos cuyo cuerpo contenga "${searchValue}"${sharedSuffix}...`);
            const mustContainValue = buildMustContainValue(searchValue);
            const contentQuery = {
                "property": "content",
                "simpleOperator": "mustcontain",
                "value": mustContainValue
            };
            // Sin `fields` la API devuelve el asset completo: si el texto está en un campo que no
            // se pidiera (superContent, meta, legacyData…), el cribado local lo descartaría aunque
            // la API lo hubiera encontrado. Al venir más pesado se baja la página a 80.
            const rawResults = markShared(await executePaginatedQuery(contentQuery, apiConfig, null, 80, scope));

            // `mustcontain` devuelve assets que no llevan el texto, así que se criba en local
            // contra el asset ya descargado y se descarta lo que de verdad no lo contiene.
            const needle = mustContainValue.toLowerCase();
            const results = rawResults.filter(item => assetContainsText(item, needle));
            logger.logMessage(`La API devolvió ${rawResults.length} resultado(s)${sharedSuffix}; tras descartar los que no contienen "${searchValue}" quedan ${results.length}.`);
            return results;
        }

        logger.logMessage(`Buscando contenidos cuyo nombre contenga "${searchValue}"${sharedSuffix}...`);
        const nameQuery = { "property": "name", "simpleOperator": "like", "value": searchValue };
        const results = markShared(await executePaginatedQuery(nameQuery, apiConfig, fields, pageSize, scope));
        logger.logMessage(`Búsqueda por nombre completada. Total ${results.length} resultado(s)${sharedSuffix}.`);
        return results;
    } finally {
        setSilentResponses(false);
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
 * Borra (DELETE) un asset de Content Builder por su ID.
 * @param {string|number} assetId - ID del asset a eliminar.
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @returns {Promise<object>} { success: true } si se eliminó correctamente.
 */
export async function deleteContentAsset(assetId, apiConfig) {
    const url = `${apiConfig.restUri}asset/v1/content/assets/${assetId}`;
    const options = {
        method: 'DELETE',
        headers: { "Authorization": `Bearer ${apiConfig.accessToken}` }
    };
    await executeRestRequest(url, options);
    return { success: true };
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
        const groupStart = Date.now();

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
                "content", "views", "category", "customerKey", "legacyData"
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

            if (onProgress) {
                let sub = '';
                const elapsed = (Date.now() - groupStart) / 1000;
                if (groupCount > 0 && totalCount > groupCount && elapsed > 0) {
                    const rate = groupCount / elapsed; // items/seg
                    const eta = etaFromSeconds((totalCount - groupCount) / rate);
                    if (eta) sub = `Tiempo estimado restante: ${eta}`;
                }
                onProgress(`Descargando ${group.name}... ${groupCount}/${totalCount}`, sub);
            }
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

        // ID legacy del email clásico → permite emparejar con triggeredSend.emailId de los Journeys
        item.legacyId = a?.legacyData?.legacyId ?? null;
        item.templateId = a?.views?.html?.template?.id ?? null;
        item.templateName = a?.views?.html?.template?.name ?? null;
        item.attributes = attrs;
        item.subject = a?.views?.subjectline?.content ?? null;
        item.preheader = a?.views?.preheader?.content ?? null;

        // Contenido ensamblado + estructura de componentes (igual que la vista de detalle del
        // Buscador, incluyendo bloques inline). No resuelve ContentBlockBy* ni rutas para no
        // ralentizar la descarga masiva; los nombres de assets se resuelven luego contra la caché.
        const components = [];
        if (item.templateId != null || item.templateName) {
            components.push({ kind: 'template', id: item.templateId != null ? String(item.templateId) : '', name: item.templateName || '', type: 'Template', ref: '' });
        }

        let fullContent = a?.views?.html?.content || '';
        const slotBlockIds = [];
        const slots = a?.views?.html?.slots;
        if (slots) {
            for (const slotKey in slots) {
                const slot = slots[slotKey];
                let slotHtml = slot?.content || '';
                // Etiqueta del slot (para "Referenciado por")
                let slotLabel = '';
                if (slot?.design) {
                    const lm = slot.design.match(/<p[^>]*>(.*?)<\/p>/i);
                    if (lm && lm[1]) slotLabel = lm[1].trim();
                }
                const slotRef = slotLabel ? `Slot: ${slotLabel}` : '';
                const blocks = slot?.blocks;
                if (blocks) {
                    for (const blockKey in blocks) {
                        const block = blocks[blockKey];
                        const blockContent = block?.content || '';
                        const blockRegex = new RegExp(
                            `<div[^>]*data-type=["']block["'][^>]*data-key=["']${blockKey}["'][^>]*>\\s*</div>`,
                            'gi'
                        );
                        slotHtml = slotHtml.replace(blockRegex, blockContent);

                        const refId = block?.meta?.options?.id;
                        const ownId = (block?.id != null && /^\d+$/.test(String(block.id))) ? String(block.id) : '';
                        const blockType = block?.assetType?.displayName || block?.assetType?.name || '---';
                        const blockName = block?.name || block?.fileProperties?.fileName || '';
                        if (refId) {
                            // Bloque arrastrado: referencia a un asset guardado por meta.options.id
                            slotBlockIds.push(String(refId));
                            components.push({ kind: 'ref', id: String(refId), name: '', type: blockType, ref: slotRef });
                        } else if (ownId) {
                            // Bloque real embebido: tiene id de asset propio (no es inline)
                            slotBlockIds.push(ownId);
                            components.push({ kind: 'block', id: ownId, name: blockName, type: blockType, ref: slotRef });
                        } else if (blockContent) {
                            // Bloque inline de verdad: creado dentro del email, sin id de asset
                            components.push({ kind: 'inline', id: '', name: blockName || `Bloque inline (${blockKey})`, type: blockType, ref: slotRef });
                        }
                    }
                }
                const slotRegex = new RegExp(
                    `<div[^>]*data-type=["']slot["'][^>]*data-key=["']${slotKey}["'][^>]*>[\\s\\S]*?</div>`,
                    'gi'
                );
                fullContent = fullContent.replace(slotRegex, slotHtml);
            }
        }
        item.content = fullContent || a.content || null;
        item.slotBlockIds = slotBlockIds.length > 0 ? slotBlockIds : null;

        // ContentBlockBy* en el contenido base del email (mismo criterio que la tabla de
        // componentes del Buscador: no se rastrean los macros embebidos dentro de bloques inline)
        const codeForRefs = a.content || a?.views?.html?.content || '';
        const macroPatterns = [
            { re: /ContentBlockBy[Ii][Dd]\s*\(\s*["']?(\d+)["']?\s*\)/gi, t: 'Id' },
            { re: /ContentBlockBy[Kk]ey\s*\(\s*["']([^"']+)["']\s*\)/gi, t: 'Key' },
            { re: /ContentBlockBy[Nn]ame\s*\(\s*["']([^"']+)["']\s*\)/gi, t: 'Name' }
        ];
        const seenMacro = new Set();
        for (const p of macroPatterns) {
            let mm;
            while ((mm = p.re.exec(codeForRefs)) !== null) {
                const k = `${p.t}:${mm[1]}`;
                if (seenMacro.has(k)) continue;
                seenMacro.add(k);
                components.push({ kind: 'macro', fromBase: true, macroType: p.t, macroValue: mm[1], id: p.t === 'Id' ? mm[1] : '', name: '', type: `ContentBlockBy${p.t}`, ref: `ContentBlockBy${p.t}` });
            }
        }
        item.components = components.length > 0 ? components : null;
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

        // Referencia a plantilla WhatsApp
        if (customData?.template?.id) {
            item.waTemplateRefId = String(customData.template.id);
        }

        // Parámetros de variables (mensaje + título)
        const msgParams = customData?.['display:message:parameters'];
        const titleParams = customData?.['display:title:parameters'];
        const allParams = [];
        
        if (msgParams) {
            for (const [key, param] of Object.entries(msgParams)) {
                allParams.push(`\${${key}} → ${param['display:argument'] || '---'} (${param['display:argument:format'] || 'text'})`);
            }
        }
        if (titleParams) {
            for (const [key, param] of Object.entries(titleParams)) {
                allParams.push(`Media \${${key}} → ${param['display:argument'] || '---'} (${param['display:argument:format'] || 'text'})`);
            }
        }
        item.waParams = allParams.length > 0 ? allParams.join('\n') : null;

        // URL real de la imagen si existe
        if (titleParams) {
            const firstParam = Object.values(titleParams)[0];
            if (firstParam?.['display:argument:format'] === 'link' && firstParam?.['display:argument']) {
                item.waMediaUrl = firstParam['display:argument'];
            }
        }

        // Media type y botones desde selectedTemplate o customData directo
        const selectedTemplate = customData?.selectedTemplate;
        item.waMediaType = customData?.['display:title:format'] || selectedTemplate?.['display:title:format'] || null;
        if (selectedTemplate) {
            if (selectedTemplate['display:buttons']) {
                item.waButtons = Object.values(selectedTemplate['display:buttons'])
                    .filter(b => b.title)
                    .map(b => `${b.title || '---'} (${b.actionType || '---'}${b.value ? ': ' + b.value : ''})`)
                    .join(' | ');
            }
        }

        // Nombre de la plantilla WA
        item.waTemplateName = customData?.templateName || null;
    }

    if (jsonMessageTypeIds.includes(item.assetTypeId)) {
        item.content = null;
    }

    // WhatsApp Templates (235)
    if (item.assetTypeId === 235) {
        const viewKeys = Object.keys(a?.views || {});
        const waViewKey = viewKeys.find(k => k.toLowerCase().includes('whatsapp'));
        const customData = waViewKey ? a.views[waViewKey]?.meta?.options?.customBlockData : null;

        if (customData) {
            item.waTemplateName = customData.templateName || null;
            item.waCategory = customData.category || null;

            // Idiomas
            const langs = customData['display:languages:approved'] || [];
            item.waLanguages = langs.join(', ') || null;

            // Buscar contenido del primer idioma
            const langContent = customData['display:languages:content'];
            const firstLang = langContent ? langContent[Object.keys(langContent)[0]] : null;

            if (firstLang) {
                // Componentes
                item.waComponents = (firstLang['display:components'] || []).join(', ') || null;

                // Mensaje
                item.message = firstLang['display:message'] || null;

                // Botones
                const buttons = firstLang['display:buttons'];
                if (buttons) {
                    item.waButtons = Object.values(buttons).map(b => 
                        `${b.title || '---'} (${b.actionType || '---'}${b.value ? ': ' + b.value : ''})`
                    ).join(' | ');

                    const footer = firstLang['display:footer'] || firstLang['display:buttons']?.['display:footer'];
                    item.waFooter = footer || null;
                }

                // Parámetros del primer idioma
                const msgParams = firstLang['display:message:parameters'];
                const titleParams = firstLang['display:title:parameters'];
                const allParams = [];
                
                if (msgParams) {
                    for (const [key, param] of Object.entries(msgParams)) {
                        allParams.push(`\${${key}} → ${param['display:argument'] || '---'} (${param['display:argument:format'] || 'text'})`);
                    }
                }
                if (titleParams) {
                    for (const [key, param] of Object.entries(titleParams)) {
                        allParams.push(`Header \${${key}} → ${param['display:argument'] || '---'} (${param['display:argument:format'] || 'text'})`);
                    }
                }
                item.waParams = allParams.length > 0 ? allParams.join('\n') : null;

                // Tiene imagen
                const titleFormat = firstLang['display:title:format'];
                item.waMediaType = titleFormat ? titleFormat : null;
            }
        }
    }

    return item;
}