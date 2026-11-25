// Fichero: src/renderer/components/cloudpages-cache.js
// Descripción: Descarga y caché de Cloud Pages con su contenido COMPARTIDA entre la vista de
// Cloud Pages y la Auditoría. Fuente única: ClientCache/cloudpages_<cliente>.json.
// Reutiliza el contenido ya cacheado de una página si no ha cambiado (mismo modifiedDate), de
// modo que solo se piden una a una las Landing Pages nuevas o modificadas cuyo contenido no
// llega en el listado.

import * as mcApiService from '../api/mc-api-service.js';
import * as logger from '../ui/logger.js';

// Tipo de asset que guarda el contenido real de una Landing Page (247).
const WEB_PAGE_TYPE_ID = 205;
const LANDING_PAGE_TYPE_ID = 247;

/** Escapa un texto para usarlo literal dentro de una expresión regular. */
function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Indica si un texto contiene el hueco de un slot o bloque de Content Builder
 * (<div data-type="slot|block" data-key="clave">), con los atributos en cualquier orden.
 * @param {string} text - HTML donde buscar.
 * @param {'slot'|'block'} type - Tipo de hueco.
 * @param {string} key - Clave del slot o bloque.
 * @returns {boolean}
 */
function hasPlaceholder(text, type, key) {
    if (!text || !key) return false;
    const k = escapeRegExp(key);
    const re = new RegExp(`<[^>]*(data-type=["']${type}["'][^>]*data-key=["']${k}["']|data-key=["']${k}["'][^>]*data-type=["']${type}["'])`, 'i');
    return re.test(text);
}

/** Quita de un texto los huecos de bloque (<div data-type="block" ...></div>), que no son código. */
function stripBlockPlaceholders(text) {
    return String(text || '').replace(/<div[^>]*data-type=["']block["'][^>]*>\s*<\/div>/gi, '');
}

/**
 * Recorre los slots de un contenedor y recoge el contenido de los que Marketing Cloud pinta:
 * solo los slots con hueco en el HTML del contenedor y, dentro de ellos, los bloques con hueco
 * en el slot. Los slots y bloques sin hueco son restos que Content Builder guarda en el JSON pero
 * no publica, y se descartan. Los bloques pueden tener a su vez slots (layouts), por eso es recursivo.
 * @param {string} containerHtml - HTML donde deben estar los huecos de los slots.
 * @param {object} slots - Mapa clave → slot del JSON del asset.
 * @param {Array<{slot:string, block:string|null, content:string}>} out - Acumulador.
 */
function collectPlacedSlots(containerHtml, slots, out) {
    if (!slots || typeof slots !== 'object') return;
    for (const [slotKey, slot] of Object.entries(slots)) {
        if (!slot || !hasPlaceholder(containerHtml, 'slot', slotKey)) continue;
        const slotHtml = slot.content || '';
        const ownContent = stripBlockPlaceholders(slotHtml).trim();
        if (ownContent) out.push({ slot: slotKey, block: null, content: ownContent });
        for (const [blockKey, block] of Object.entries(slot.blocks || {})) {
            if (!block || !hasPlaceholder(slotHtml, 'block', blockKey)) continue;
            const blockContent = String(block.content || '');
            if (blockContent.trim()) out.push({ slot: slotKey, block: blockKey, content: blockContent });
            collectPlacedSlots(blockContent, block.slots, out);
        }
    }
}

/**
 * Separa el contenido de un asset en el código de la página (lo mismo que muestra el Code View
 * de Marketing Cloud) y el contenido de los slots/bloques colocados en ella.
 * @param {object} asset - Asset completo devuelto por la API.
 * @returns {{content: string, slotBlocks: Array<{slot:string, block:string|null, content:string}>}}
 */
export function extractCloudPageParts(asset) {
    const html = asset?.views?.html?.content || '';
    if (!html) return { content: asset?.content || '', slotBlocks: [] };
    const slotBlocks = [];
    collectPlacedSlots(html, asset.views.html.slots, slotBlocks);
    return { content: html, slotBlocks };
}

/**
 * Devuelve el texto completo de un asset para analizarlo: su código más el de los slots y bloques
 * colocados (sin los restos no publicados).
 * @param {object} asset - Asset completo devuelto por la API.
 * @returns {string}
 */
export function extractFullAssetContent(asset) {
    const { content, slotBlocks } = extractCloudPageParts(asset);
    return [content, ...slotBlocks.map(b => b.content)].filter(Boolean).join('\n');
}

/**
 * Devuelve una copia de la Cloud Page cacheada cuyo content incluye también los slots y bloques
 * colocados, para que los análisis (dependencias, auditoría, mapa) vean todo el código que se publica.
 * @param {object} page - Cloud Page de la caché.
 * @returns {object}
 */
export function withSlotContent(page) {
    if (!page || !Array.isArray(page.slotBlocks) || page.slotBlocks.length === 0) return page;
    return { ...page, content: [page.content || '', ...page.slotBlocks.map(b => b.content)].join('\n') };
}

/**
 * Extrae la URL publicada de una Cloud Page probando las rutas donde puede venir según el tipo
 * de asset (content JSON embebido, data.site o meta.cloudPages).
 * @param {object} item - Asset de Cloud Page devuelto por la API.
 * @param {string} [fallback=''] - Valor a devolver si no se encuentra URL.
 * @returns {string} URL o el valor de fallback.
 */
export function extractCloudPageUrl(item, fallback = '') {
    try {
        if (item.content?.trim().startsWith('{')) {
            const contentJson = JSON.parse(item.content);
            if (contentJson.url) return contentJson.url;
        }
        if (item.data?.site?.content?.trim().startsWith('{')) {
            const nestedContentJson = JSON.parse(item.data.site.content);
            if (nestedContentJson.url) return nestedContentJson.url;
        }
    } catch (e) { /* el contenido no era JSON: se sigue con meta */ }

    return item.meta?.cloudPages?.url || fallback;
}

/**
 * Carga la caché de Cloud Pages de un cliente/BU.
 * @param {string} clientName - Clave de caché del contexto activo.
 * @returns {Promise<Array|null>} Lista cacheada o null si no hay caché.
 */
export async function loadCloudPagesCache(clientName) {
    if (!clientName) return null;
    const result = await window.electronAPI.loadCloudPagesCache(clientName);
    return (result?.success && Array.isArray(result.data)) ? result.data : null;
}

/**
 * Guarda la lista de Cloud Pages (con contenido) en la caché del cliente/BU.
 * @param {string} clientName - Clave de caché del contexto activo.
 * @param {Array} pages - Lista de Cloud Pages a guardar.
 * @returns {Promise<void>}
 */
export async function saveCloudPagesCache(clientName, pages) {
    if (!clientName) return;
    const result = await window.electronAPI.saveCloudPagesCache({ clientName, cloudPagesData: pages });
    if (!result?.success) logger.logMessage(`No se pudo guardar la caché de Cloud Pages: ${result?.error || 'error desconocido'}`);
}

/**
 * Descarga la lista actual de Cloud Pages con su contenido, la fusiona con la caché (conserva
 * Page IDs importados y reutiliza el contenido de las páginas sin cambios) y guarda el resultado.
 * Los Web Pages (205) no se devuelven: son la fuente del contenido de las Landing Pages (247).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @param {string} clientName - Clave de caché del contexto activo.
 * @param {{onProgress?: function(string)}} [options] - onProgress recibe un texto de estado.
 * @returns {Promise<{pages: Array, apiCalls: number}>} Lista resultante y llamadas API estimadas.
 */
export async function fetchCloudPagesWithContent(apiConfig, clientName, { onProgress } = {}) {
    const progress = (msg) => { logger.logMessage(msg); if (onProgress) onProgress(msg); };
    let apiCalls = 0;

    const cached = await loadCloudPagesCache(clientName);
    const cachedById = new Map((cached || []).map(p => [p.id, p]));
    logger.logMessage(cached ? `Se encontraron ${cachedById.size} Cloud Pages en la caché.` : 'No se encontró caché local de Cloud Pages.');

    progress('Obteniendo lista de Cloud Pages desde la API...');
    const rawAssets = await mcApiService.fetchAllCloudPages(apiConfig);
    apiCalls += Math.max(1, Math.ceil(rawAssets.length / 500));

    progress(`Resolviendo carpetas de ${rawAssets.length} assets...`);
    const assetsWithFolders = await mcApiService.enrichCloudPagesWithFolders(rawAssets, apiConfig);

    // Los Web Pages (205) se indexan por id y por nombre porque la Landing Page los referencia
    // por thumbnailRefAssetId, pero en algunas instancias ese campo no viene.
    const webPagesById = new Map();
    const webPagesByName = new Map();
    const visibleAssets = [];
    for (const asset of assetsWithFolders) {
        if (asset.assetType?.id === WEB_PAGE_TYPE_ID) {
            const parts205 = extractCloudPageParts(asset);
            const meta205 = {
                content: parts205.content,
                slotBlocks: parts205.slotBlocks,
                modifiedByName: asset.modifiedBy?.name || null,
                modifiedDate: asset.modifiedDate || null
            };
            webPagesById.set(asset.id, meta205);
            const normalizedName = (asset.name || '').toLowerCase().trim();
            if (normalizedName) webPagesByName.set(normalizedName, meta205);
        } else {
            visibleAssets.push(asset);
        }
    }
    logger.logMessage(`Encontrados ${webPagesById.size} Web Pages (fuente de contenido) y ${visibleAssets.length} Cloud Pages visibles.`);

    const pages = visibleAssets.map(apiPage => {
        const cachedPage = cachedById.get(apiPage.id);
        const ownParts = apiPage.content ? { content: apiPage.content, slotBlocks: [] } : extractCloudPageParts(apiPage);
        let extractedContent = ownParts.content;
        let extractedSlots = ownParts.slotBlocks;
        let resolvedModifiedBy = null;
        let resolvedModifiedDate = null;

        if (apiPage.assetType?.id === LANDING_PAGE_TYPE_ID) {
            const refId = apiPage.meta?.thumbnailRefAssetId;
            const meta205 = (refId && webPagesById.get(refId))
                || webPagesByName.get((apiPage.name || '').toLowerCase().trim())
                || null;
            if (meta205) {
                extractedContent = meta205.content;
                extractedSlots = meta205.slotBlocks;
                resolvedModifiedBy = meta205.modifiedByName;
                resolvedModifiedDate = meta205.modifiedDate;
            } else {
                // Sin Web Page asociada el content de la LP es solo su JSON de metadatos.
                extractedContent = '';
                extractedSlots = [];
            }
        }

        const modifiedDate = resolvedModifiedDate || apiPage.modifiedDate;
        // El contenido recién descargado manda; el de la caché solo se usa si la página no ha
        // cambiado y la API no lo ha devuelto (LPs que necesitan llamada individual). Las entradas
        // sin slotBlocks son del formato anterior, que mezclaba los restos de slots en el código,
        // y no se reutilizan.
        const sameVersion = cachedPage && cachedPage.modifiedDate === modifiedDate && Array.isArray(cachedPage.slotBlocks);
        const useCached = !extractedContent && sameVersion;
        const finalContent = (useCached ? cachedPage.content : extractedContent) || '';
        const finalSlots = useCached ? cachedPage.slotBlocks : extractedSlots;

        return {
            ...apiPage,
            url: extractCloudPageUrl(apiPage, 'URL no encontrada'),
            publishDate: apiPage.meta?.cloudPages?.publishDate || null,
            pageId: cachedPage?.pageId || null,
            content: finalContent,
            slotBlocks: finalSlots || [],
            modifiedByName: resolvedModifiedBy || apiPage.modifiedBy?.name || '---',
            modifiedDate,
            hasDetailedContent: !!finalContent && !finalContent.trim().startsWith('{')
        };
    });

    // Landing Pages cuyo contenido no llegó en el listado: se piden una a una en lotes.
    const unresolved = pages.filter(
        p => p.assetType?.id === LANDING_PAGE_TYPE_ID && !p.hasDetailedContent && p.meta?.thumbnailRefAssetId
    );
    if (unresolved.length > 0) {
        const batchSize = 10;
        for (let i = 0; i < unresolved.length; i += batchSize) {
            progress(`Descargando contenido de Landing Pages (${Math.min(i + batchSize, unresolved.length)} de ${unresolved.length})...`);
            const batch = unresolved.slice(i, i + batchSize);
            await Promise.all(batch.map(async (page) => {
                try {
                    apiCalls++;
                    const assetDetail = await mcApiService.fetchAssetById(page.meta.thumbnailRefAssetId, apiConfig);
                    const parts = extractCloudPageParts(assetDetail);
                    page.content = parts.content;
                    page.slotBlocks = parts.slotBlocks;
                    page.hasDetailedContent = !!page.content && !page.content.trim().startsWith('{');
                } catch (e) {
                    logger.logMessage(`No se pudo obtener el contenido de la LP ${page.id} (${page.name}): ${e.message}`);
                }
            }));
        }
    }

    await saveCloudPagesCache(clientName, pages);
    logger.logMessage(`Caché de Cloud Pages actualizada con ${pages.length} elementos.`);
    return { pages, apiCalls };
}
