// Fichero: src/renderer/components/cloud-pages-manager.js
// Descripción: Módulo que encapsula toda la lógica de la vista "Gestión de Cloud Pages".

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { formatCodeWithIndentation, highlightCloudPageCode, buildCodeViewer } from '../ui/code-utils.js';


// --- 1. ESTADO DEL MÓDULO ---

let fullCloudPageList = [];
let currentFilteredList = [];
let currentPage = 1;
let currentSortColumn = 'modifiedDate';
let currentSortDirection = 'desc';
const ITEMS_PER_PAGE = 10;

let getAuthenticatedConfig; // Dependencia que será inyectada por app.js

// --- 2. FUNCIONES PÚBLICAS (API del Módulo) ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas (ej: { getAuthenticatedConfig }).
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.refreshCloudPagesTableBtn.addEventListener('click', refreshData);
    elements.downloadCloudPagesCsvBtn.addEventListener('click', downloadCloudPagesCsv);

    // Listeners para el botón y modal de IDs
    elements.getCloudPageIdsBtn.addEventListener('click', showGetIdsModal);
    elements.cloudPageIdsCancelBtn.addEventListener('click', () => ui.hideModal(elements.cloudPageIdsModal));
    elements.cloudPageIdsImportBtn.addEventListener('click', processPastedIds);

    // Listener centralizado para el tbody (chevron + enlaces externos)
    elements.cloudPagesTbody.addEventListener('click', (e) => {
        const chevron = e.target.closest('.cp-inspect-btn');
        if (chevron) {
            const cloudpageId = chevron.dataset.cloudpageId;
            if (cloudpageId) {
                toggleContentRow(cloudpageId);
                return;
            }
        }
        ui.handleExternalLink(e);
    });
    
    // Los filtros llaman a la función que resetea la paginación a la página 1.
    elements.cloudPageIdFilter.addEventListener('input', applyFiltersAndRender);
    elements.cloudPageNameFilter.addEventListener('input', applyFiltersAndRender);
    elements.cloudPageContentFilter.addEventListener('input', applyFiltersAndRender);
    elements.cloudPageTypeFilter.addEventListener('change', applyFiltersAndRender);
    elements.cloudPagePublishedFilter.addEventListener('change', applyFiltersAndRender);
    elements.cloudPageUrlFilter.addEventListener('change', applyFiltersAndRender);
    
    // El ordenamiento también resetea la paginación.
    document.querySelector('#cloudpages-table thead').addEventListener('click', handleSort);
    
    elements.cloudPageInternalApiLink.addEventListener('click', ui.handleExternalLink);

    // Los botones de paginación llaman a la función que solo renderiza, sin resetear filtros.
    elements.prevPageBtnCloudPages.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderFilteredTable();
        }
    });
    elements.nextPageBtnCloudPages.addEventListener('click', () => {
        const maxPage = parseInt(elements.pageInputCloudPages.max, 10) || 1;
        if (currentPage < maxPage) {
            currentPage++;
            renderFilteredTable();
        }
    });
    elements.pageInputCloudPages.addEventListener('change', () => {
        let newPage = parseInt(elements.pageInputCloudPages.value, 10) || 1;
        const maxPage = parseInt(elements.pageInputCloudPages.max, 10) || 1;
        if (newPage < 1) newPage = 1;
        if (newPage > maxPage) newPage = maxPage;
        currentPage = newPage;
        renderFilteredTable();
    });
    // Listener de seguridad para cuando el campo de página queda vacío.
    elements.pageInputCloudPages.addEventListener('blur', () => {
        if (elements.pageInputCloudPages.value === '') {
            currentPage = 1;
            renderFilteredTable();
        }
    });

    // --- Listeners del Drawer de Detalle ---
    const openCpDrawer = () => {
        elements.cpDetailDrawer.classList.add('open');
        elements.cpDetailBackdrop.classList.add('active');
    };
    const closeCpDrawer = () => {
        elements.cpDetailDrawer.classList.remove('open');
        elements.cpDetailBackdrop.classList.remove('active');
    };
    elements.cpDetailCloseBtn.addEventListener('click', closeCpDrawer);
    elements.cpDetailBackdrop.addEventListener('click', closeCpDrawer);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.cpDetailDrawer.classList.contains('open')) {
            closeCpDrawer();
        }
    });

    elements.cpDetailDownloadBtn.addEventListener('click', () => {
        const clientName = elements.clientNameInput.value.trim() || 'cliente';
        const pageName = (elements.cpDetailTitle.textContent || 'cloudpage').replace(/\s+/g, '_');
        const page = fullCloudPageList.find(p => p.name === elements.cpDetailTitle.textContent);
        if (!page || !page.content) return;

        const blob = new Blob([page.content], { type: 'text/html;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${clientName}_${pageName}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    });
}

/**
 * Prepara la vista de "Gestión de Cloud Pages" para ser mostrada.
 * Si los datos no están en caché, los obtiene de la API.
 */
export async function view() {
    if (fullCloudPageList.length === 0) {
        await fetchData();
    }
    applyFiltersAndRender();
}

/**
 * Limpia la caché de datos y resetea la UI del módulo. Se llama al cambiar de cliente.
 */
export function clearCache() {
    fullCloudPageList = [];
    elements.cloudPageIdFilter.value = '';
    elements.cloudPageNameFilter.value = '';
    elements.cloudPageContentFilter.value = '';
    elements.cloudPageTypeFilter.innerHTML = '<option value="">Todos los tipos</option>';
    elements.cloudPagesTbody.innerHTML = '';
    elements.cloudPagePublishedFilter.value = '';
    elements.cloudPageUrlFilter.value = '';

    if (elements.cloudPageCountSpan) {
        elements.cloudPageCountSpan.textContent = '';
    }
}

// --- 3. LÓGICA DE DATOS Y API ---

/**
 * Fuerza una recarga completa de los datos de Cloud Pages desde la API.
 */
async function refreshData() {
    clearCache();
    await view();
}

/**
 * Orquesta la obtención de todos los datos de Cloud Pages.
 */
async function fetchData() {
    ui.blockUI("Recuperando datos de Cloud Pages...");
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        const clientName = elements.clientNameInput.value.trim();

        // 1. Cargar la caché guardada
        logger.logMessage("Cargando caché local de Cloud Pages...");
        const cacheResult = await window.electronAPI.loadCloudPagesCache(clientName);
        const cachedPagesMap = new Map();
        if (cacheResult.success && cacheResult.data) {
            cacheResult.data.forEach(page => cachedPagesMap.set(page.id, page));
            logger.logMessage(`Se encontraron ${cachedPagesMap.size} Cloud Pages en la caché.`);
        } else {
            logger.logMessage("No se encontró caché local.");
        }

        // 2. Obtener la lista fresca desde la API
        logger.logMessage("Obteniendo lista actualizada de Cloud Pages desde la API...");
        const rawAssets = await mcApiService.fetchAllCloudPages(apiConfig);
        logger.logMessage(`API devolvió ${rawAssets.length} assets. Obteniendo rutas de carpeta...`);
        const assetsWithFolders = await mcApiService.enrichCloudPagesWithFolders(rawAssets, apiConfig);

        // 3. Separar Web Pages (205) como fuente de contenido y el resto como elementos visibles
        logger.logMessage("Separando Web Pages (contenido) de Cloud Pages (visibles)...");

        const webPagesByIdMap = new Map();   // id → asset 205 (para thumbnailRefAssetId)
        const webPagesByNameMap = new Map(); // nombre normalizado → asset 205 (para landing pages viejas)

        const visibleAssets = [];

        for (const asset of assetsWithFolders) {
            if (asset.assetType.id === 205) {
                // Extraer contenido del 205 (views + slots)
                const content205 = extractFullAssetContent(asset);
                webPagesByIdMap.set(asset.id, content205);
                // Guardar también por nombre (lowercase) para matching de LPs viejas
                const normalizedName = (asset.name || '').toLowerCase().trim();
                if (normalizedName) webPagesByNameMap.set(normalizedName, content205);
            } else {
                visibleAssets.push(asset);
            }
        }

        logger.logMessage(`Encontrados ${webPagesByIdMap.size} Web Pages (fuente de contenido) y ${visibleAssets.length} Cloud Pages visibles.`);

        // 4. Fusionar datos de la API con la caché y asignar contenido a las Landing Pages
        fullCloudPageList = visibleAssets.map(apiPage => {
            const cachedPage = cachedPagesMap.get(apiPage.id);

            // Resolver contenido para Landing Pages (247)
            let extractedContent = apiPage.content || '';
            if (apiPage.assetType.id === 247) {
                // Intentar por thumbnailRefAssetId (landing pages nuevas)
                const refId = apiPage.meta?.thumbnailRefAssetId;
                if (refId && webPagesByIdMap.has(refId)) {
                    extractedContent = webPagesByIdMap.get(refId);
                } else {
                    // Intentar por nombre (landing pages viejas sin thumbnailRefAssetId)
                    const normalizedName = (apiPage.name || '').toLowerCase().trim();
                    if (webPagesByNameMap.has(normalizedName)) {
                        extractedContent = webPagesByNameMap.get(normalizedName);
                    }
                }
            }

            const finalContent = (cachedPage?.content) || extractedContent;

            return {
                ...apiPage,
                url: extractCloudPageUrl(apiPage),
                publishDate: apiPage.meta?.cloudPages?.publishDate || null,
                pageId: cachedPage?.pageId || null,
                content: finalContent,
                modifiedByName: apiPage.modifiedBy?.name || '---',
                hasDetailedContent: !!finalContent && !finalContent.trim().startsWith('{')
            };
        });

        // 5. Fallback: Landing Pages que no pudieron resolver contenido
        const unresolved = fullCloudPageList.filter(
            p => p.assetType.id === 247 && !p.hasDetailedContent && p.meta?.thumbnailRefAssetId
        );
        if (unresolved.length > 0) {
            logger.logMessage(`⚠️ ${unresolved.length} Landing Pages sin contenido resuelto. Intentando vía API individual...`);
            const batchSize = 10;
            for (let i = 0; i < unresolved.length; i += batchSize) {
                const batch = unresolved.slice(i, i + batchSize);
                await Promise.all(batch.map(async (page) => {
                    try {
                        const assetDetail = await mcApiService.fetchAssetById(
                            page.meta.thumbnailRefAssetId, apiConfig
                        );
                        page.content = extractFullAssetContent(assetDetail);
                        page.hasDetailedContent = !!page.content && !page.content.trim().startsWith('{');
                    } catch (e) {
                        logger.logMessage(`⚠️ No se pudo obtener contenido de LP ${page.id} (${page.name}): ${e.message}`);
                    }
                }));
            }
        }

        logger.logMessage("Fusión completada. La nueva lista tiene " + fullCloudPageList.length + " elementos.");
        populateCloudPageFilters(fullCloudPageList);

    } catch (error) {
        logger.logMessage(`Error al obtener Cloud Pages: ${error.message}`);
        ui.showCustomAlert(`Error al cargar Cloud Pages: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

// --- 4. RENDERIZADO Y MANIPULACIÓN DE LA TABLA ---

/**
 * Función principal llamada cuando se aplica un FILTRO. Resetea la paginación a 1.
 */
function applyFiltersAndRender() {
    currentPage = 1;
    renderFilteredTable();
}

/**
 * Función que aplica los filtros actuales y llama al renderizado final de la tabla.
 * No resetea la paginación, por lo que es ideal para paginar o reordenar.
 */
function renderFilteredTable() {
    let filtered = fullCloudPageList;
    
    const idFilter = elements.cloudPageIdFilter.value.trim();
    if (idFilter) {
        // Se convierte el pageId a string para poder usar 'includes' y permitir búsquedas parciales
        filtered = filtered.filter(p => p.pageId && String(p.pageId).includes(idFilter));
    }

    const nameFilter = elements.cloudPageNameFilter.value.toLowerCase().trim();
    if (nameFilter) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(nameFilter));
    }

    const contentFilter = elements.cloudPageContentFilter.value.toLowerCase().trim();
    if (contentFilter) {
        filtered = filtered.filter(p => 
            p.content && p.content.toLowerCase().includes(contentFilter)
        );
    }
    
    const typeFilter = elements.cloudPageTypeFilter.value;
    if (typeFilter) {
        filtered = filtered.filter(p => p.assetType.displayName === typeFilter);
    }

    const publishedFilter = elements.cloudPagePublishedFilter.value;
    if (publishedFilter === 'yes') {
        filtered = filtered.filter(p => p.publishDate && !p.publishDate.startsWith('0001'));
    } else if (publishedFilter === 'no') {
        filtered = filtered.filter(p => !p.publishDate || p.publishDate.startsWith('0001'));
    }

    const urlFilter = elements.cloudPageUrlFilter.value;
    if (urlFilter === 'yes') {
        filtered = filtered.filter(p => p.url && p.url.startsWith('http'));
    } else if (urlFilter === 'no') {
        filtered = filtered.filter(p => !p.url || !p.url.startsWith('http'));
    }
    
    currentFilteredList = filtered;
    updateCloudPageCount(); 

    renderTable(currentFilteredList);
}

/**
 * Dibuja el HTML de la tabla con los datos (ya filtrados y ordenados).
 * @param {Array} pages - La lista de Cloud Pages a mostrar en la página actual.
 */
function renderTable(pages) {
    sortData(pages);
    const paginatedItems = pages.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    elements.cloudPagesTbody.innerHTML = '';
    if (paginatedItems.length === 0) {
        elements.cloudPagesTbody.innerHTML = '<tr><td colspan="8">No se encontraron Cloud Pages con los filtros aplicados.</td></tr>';
    } else {
        paginatedItems.forEach(page => {
            const row = document.createElement('tr');
            row.dataset.cloudpageId = String(page.id);
            
            const urlCell = page.url.startsWith('http') 
                ? `<td><a href="${page.url}" class="external-link" title="Abrir URL en el navegador">${page.url}</a></td>` 
                : `<td>${page.url}</td>`;
            
            const inspectBtn = page.hasDetailedContent 
            ? `<span class="cp-inspect-btn" data-cloudpage-id="${page.id}" title="Ver dependencias y código"><svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg></span>` 
            : '';
            
            row.innerHTML = `
                <td>${inspectBtn} ${page.name || '---'}</td>
                <td>${page.assetType.displayName || '---'}</td>
                <td>${formatDate(page.modifiedDate)}</td>
                <td>${page.modifiedByName || '---'}</td>
                <td>${formatDate(page.publishDate)}</td>
                <td>${page.location || '---'}</td>
                ${urlCell}
                <td>${page.pageId || '---'}</td>
            `;
            elements.cloudPagesTbody.appendChild(row);
        });
    }

    updatePaginationUI(pages.length);
    updateSortIndicators();
}

/**
 * Abre un drawer flotante con las dependencias y el código fuente de una Cloud Page.
 * @param {string} cloudpageId - El ID del asset.
 */
function toggleContentRow(cloudpageId) {
    const page = currentFilteredList.find(p => String(p.id) === String(cloudpageId));
    if (!page || !page.hasDetailedContent) return;
 
    // Título del drawer
    elements.cpDetailTitle.textContent = page.name || 'Cloud Page';
 
    // 1. Generar dependencias en columnas
    elements.cpDetailDeps.innerHTML = buildDependenciesGrid(page.content, page.name);
 
    // 2. Generar visor de código fuente
    elements.cpDetailCode.innerHTML = buildCodeViewer(page.content);
 
    // 3. Abrir el drawer
    elements.cpDetailDrawer.classList.add('open');
    elements.cpDetailBackdrop.classList.add('active');
}

/**
 * Gestiona el evento de clic en las cabeceras para cambiar el orden.
 * @param {Event} e - El evento de clic.
 */
function handleSort(e) {
    const header = e.target.closest('.sortable-header');
    if (!header) return;

    const newSortColumn = header.dataset.sortBy;
    if (currentSortColumn === newSortColumn) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = newSortColumn;
        currentSortDirection = 'asc';
    }
    currentPage = 1; // Al reordenar, siempre volvemos a la página 1
    renderFilteredTable();
}

/**
 * Ordena un array de datos basándose en la columna y dirección actuales.
 * @param {Array} data - El array a ordenar.
 */
function sortData(data) {
    const getValue = (obj, key) => key.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
    const direction = currentSortDirection === 'asc' ? 1 : -1;
    
    data.sort((a, b) => {
        let valA = getValue(a, currentSortColumn);
        let valB = getValue(b, currentSortColumn);
        if (valA == null) return 1;
        if (valB == null) return -1;
        if (currentSortColumn.includes('Date')) {
            return (new Date(valA) - new Date(valB)) * direction;
        }
        return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' }) * direction;
    });
}

// --- 5. HELPERS Y FUNCIONES AUXILIARES ---

/**
 * Rellena el desplegable de filtro de tipos con las opciones disponibles.
 * @param {Array} cloudPages - La lista completa de Cloud Pages.
 */
function populateCloudPageFilters(cloudPages) {
    const currentType = elements.cloudPageTypeFilter.value;
    elements.cloudPageTypeFilter.innerHTML = '<option value="">Todos los tipos</option>';
    const types = [...new Set(cloudPages.map(p => p.assetType.displayName).filter(Boolean))].sort();
    types.forEach(type => elements.cloudPageTypeFilter.appendChild(new Option(type, type)));
    elements.cloudPageTypeFilter.value = currentType;
}

/**
 * Actualiza la UI de los controles de paginación.
 * @param {number} totalItems - El número total de items en la lista filtrada.
 */
function updatePaginationUI(totalItems) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    elements.totalPagesCloudPages.textContent = `/ ${totalPages}`;
    elements.pageInputCloudPages.value = currentPage;
    elements.pageInputCloudPages.max = totalPages;
    elements.prevPageBtnCloudPages.disabled = currentPage === 1;
    elements.nextPageBtnCloudPages.disabled = currentPage >= totalPages;
}

/**
 * Actualiza los indicadores visuales (flechas) en las cabeceras de la tabla.
 */
function updateSortIndicators() {
    document.querySelectorAll('#cloudpages-table .sortable-header').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
        if (header.dataset.sortBy === currentSortColumn) {
            header.classList.add(currentSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

/**
 * Intenta extraer la URL de una Cloud Page desde diferentes partes del objeto de la API.
 * @param {object} item - El objeto del asset.
 * @returns {string} La URL encontrada o un mensaje por defecto.
 */
function extractCloudPageUrl(item) {
    try {
        if (item.content?.trim().startsWith('{')) {
            const contentJson = JSON.parse(item.content);
            if (contentJson.url) return contentJson.url;
        }
        if (item.data?.site?.content?.trim().startsWith('{')) {
            const nestedContentJson = JSON.parse(item.data.site.content);
            if (nestedContentJson.url) return nestedContentJson.url;
        }
    } catch (e) { /* Ignorar errores de parseo JSON */ }
    
    if (item.meta?.cloudPages?.url) {
        return item.meta.cloudPages.url;
    }
    
    return 'URL no encontrada';
}

/**
 * Formatea una cadena de fecha a un formato legible local.
 * @param {string} dateString - La fecha en formato ISO.
 * @returns {string} La fecha formateada o '---'.
 */
function formatDate(dateString) {
    if (!dateString) return '---';
    try {
        return new Date(dateString).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    } catch {
        return 'Fecha inválida';
    }
}


/**
 * Muestra el modal para recuperar IDs, generando el enlace dinámico.
 */
async function showGetIdsModal() {
    try {
        const stackKey = elements.stackKeyInput.value;
        if (!stackKey || stackKey === 'No disponible') {
            ui.showCustomAlert("No se pudo determinar el stack (S1, S7, etc.) de la cuenta. Revisa la conexión en la pestaña 'Configuración APIs'.");
            return;
        }
        
        const stackNumber = stackKey.replace('S', '');
        const baseUrl = `https://cloud-pages.s${stackNumber}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages`;
        
        // Generar URL para Landing Pages
        const landingPagesUrl = `${baseUrl}/sites?$page=1&$pageSize=5000&$orderBy=createdDate%20DESC`;
        elements.cloudPageInternalApiLink.href = landingPagesUrl;
        elements.cloudPageInternalApiLink.textContent = landingPagesUrl;

        // Generar URL para Code Resources
       /* const codeResourcesUrl = `${baseUrl}/code-resources?$page=1&$pageSize=5000&$orderBy=createdDate%20DESC`;
        elements.codeResourceInternalApiLink.href = codeResourcesUrl;
        elements.codeResourceInternalApiLink.textContent = codeResourcesUrl;*/

        elements.cloudPageIdsPasteArea.value = '';
        ui.showModal(elements.cloudPageIdsModal);

    } catch (error) {
        ui.showCustomAlert(`Error al preparar el modal: ${error.message}`);
    }

}

/**
 * Procesa el JSON pegado por el usuario y actualiza la tabla.
 */
async function processPastedIds() {
    const jsonText = elements.cloudPageIdsPasteArea.value.trim();
    if (!jsonText) return ui.showCustomAlert("El área de texto está vacía.");
    
    try {
        const data = JSON.parse(jsonText);
        const entities = data?.entities;
        if (!Array.isArray(entities)) throw new Error("Formato JSON no válido o falta la clave 'entities'.");

        const idMap = new Map(entities.map(e => [e.siteAssetId, e.defaultPageId]));
        
        let matchCount = 0;
        fullCloudPageList.forEach(page => {
            if (idMap.has(page.id)) {
                page.pageId = idMap.get(page.id);
                matchCount++;
            }
        });

        // --- GUARDAR EN CACHÉ ---
        const clientName = elements.clientNameInput.value.trim();
        await window.electronAPI.saveCloudPagesCache({ clientName, cloudPagesData: fullCloudPageList });
        logger.logMessage(`Caché guardada con ${matchCount} IDs actualizados.`);
        
        ui.showCustomAlert(`Proceso completado. Se han asignado ${matchCount} IDs y la caché ha sido actualizada.`);
        ui.hideModal(elements.cloudPageIdsModal);
        renderFilteredTable();

    } catch (error) {
        logger.logMessage(`Error al procesar JSON de IDs: ${error.message}`);
        ui.showCustomAlert(`Error al procesar el JSON: ${error.message}.`);
    }
}

/**
 * Genera y descarga un fichero CSV con las Cloud Pages filtradas.
 */
function downloadCloudPagesCsv() {
    if (currentFilteredList.length === 0) {
        ui.showCustomAlert("No hay datos que coincidan con los filtros actuales para descargar.");
        return;
    }

    const headers = ['Page ID', 'Nombre', 'Tipo', 'Fecha Modificacion', 'Modificado por', 'Fecha Publicacion', 'Ubicacion', 'URL'];
    
    // Hacemos una copia de los datos filtrados para ordenarlos
    const sortedData = [...currentFilteredList];
    sortData(sortedData);
    
    const rows = sortedData.map(page => [
        `"${page.pageId || ''}"`,
        `"${page.name || ''}"`,
        `"${page.assetType.displayName || ''}"`,
        `"${formatDate(page.modifiedDate)}"`,
        `"${page.modifiedByName || ''}"`,
        `"${formatDate(page.publishDate)}"`,
        `"${page.location || ''}"`,
        `"${page.url || ''}"`
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cloud_pages.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


/**
 * Actualiza el contador de Cloud Pages en la UI.
 */
function updateCloudPageCount() {
    const total = fullCloudPageList.length;
    const filtered = currentFilteredList.length;
    if (elements.cloudPageCountSpan) {
        elements.cloudPageCountSpan.textContent = `(${filtered} de ${total})`;
    }
}

/**
 * Extrae el contenido completo de un Web Page (tipo 205), 
 * combinando el HTML principal con el contenido de sus slots.
 * @param {object} asset - El objeto del asset Web Page.
 * @returns {string} El HTML completo combinado.
 */
function extractWebPageContent(asset) {
    let fullContent = '';
    
    // Contenido principal del view HTML
    const mainContent = asset?.views?.html?.content || '';
    fullContent += mainContent;
    
    // Contenido de los slots
    const slots = asset?.views?.html?.slots;
    if (slots) {
        for (const slotKey of Object.keys(slots)) {
            const slot = slots[slotKey];
            // Contenido directo del slot
            if (slot.content) fullContent += '\n' + slot.content;
            // Bloques dentro del slot
            if (slot.blocks) {
                for (const blockKey of Object.keys(slot.blocks)) {
                    const block = slot.blocks[blockKey];
                    if (block.content) fullContent += '\n' + block.content;
                }
            }
        }
    }
    
    return fullContent;
}

/**
 * Analiza el contenido de una Cloud Page y devuelve HTML con las dependencias
 * distribuidas en columnas (estilo panel de logs: flex 1 1 0).
 * @param {string} content - El contenido completo HTML/AMPscript/SSJS.
 * @param {string} pageName - Nombre de la página para contexto.
 * @returns {string} HTML con bloques de dependencias en columnas.
 */
function buildDependenciesGrid(content, pageName) {
    if (!content) return '<div class="cp-detail-no-deps">Sin contenido disponible</div>';
 
    const esc = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const sections = [];
 
    // --- 1. Data Extensions ---
    const deRefs = new Map();
    const deFunctions = [
        'Lookup', 'LookupRows', 'LookupOrderedRows', 'ClaimRow',
        'InsertData', 'UpdateData', 'UpsertData', 'DeleteData', 'InsertDE', 'UpdateDE', 'UpsertDE'
    ];
    for (const fn of deFunctions) {
        for (const m of content.matchAll(new RegExp(fn + '\\s*\\(\\s*["\']([^"\']+)["\']', 'gi'))) {
            if (!deRefs.has(m[1])) deRefs.set(m[1], new Set());
            deRefs.get(m[1]).add(fn);
        }
    }
    for (const m of content.matchAll(/DataExtension\.Init\s*\(\s*["']([^"']+)["']\s*\)/gi)) {
        if (!deRefs.has(m[1])) deRefs.set(m[1], new Set());
        deRefs.get(m[1]).add('DataExtension.Init');
    }
    if (deRefs.size > 0) {
        const items = [];
        for (const [deName, functions] of deRefs) {
            items.push(`<strong>${esc(deName)}</strong> <span style="color:#999;">— ${Array.from(functions).join(', ')}</span>`);
        }
        sections.push({ title: 'Data Extensions referenciadas', items });
    }
 
    // --- 2. Parámetros y Atributos ---
    const params = new Set();
    for (const m of content.matchAll(/RequestParameter\s*\(\s*["']([^"']+)["']\s*\)/gi)) params.add(m[1]);
    const attrs = new Set();
    for (const m of content.matchAll(/AttributeValue\s*\(\s*["']([^"']+)["']\s*\)/gi)) attrs.add(m[1]);
    if (params.size > 0 || attrs.size > 0) {
        const items = [];
        for (const p of params) items.push(`<span class="cp-dep-badge parametro">Parámetro</span> ${esc(p)}`);
        for (const a of attrs) items.push(`<span class="cp-dep-badge atributo">Atributo</span> ${esc(a)}`);
        sections.push({ title: 'Parámetros y Atributos', items });
    }
 
    // --- 3. Entradas SSJS ---
    const ssjsItems = [];
    if (/Platform\.Request\.GetPostData\s*\(/i.test(content)) {
        ssjsItems.push(`<span class="cp-dep-badge post-body">POST Body</span> Platform.Request.GetPostData()`);
    }
    for (const m of content.matchAll(/(?:Request\.)?GetQueryStringParameter\s*\(\s*["']([^"']+)["']\s*\)/gi)) {
        ssjsItems.push(`<span class="cp-dep-badge query-param">Query Param</span> ${esc(m[1])}`);
    }
    if (ssjsItems.length > 0) {
        sections.push({ title: 'Entradas de datos (SSJS)', items: ssjsItems });
    }
 
    // --- 4. Content Blocks ---
    const cbs = [];
    for (const m of content.matchAll(/ContentBlockByKey\s*\(\s*["']([^"']+)["']\s*\)/gi)) cbs.push(`ContentBlockByKey("${esc(m[1])}")`);
    for (const m of content.matchAll(/ContentBlockById\s*\(\s*["']?(\d+)["']?\s*\)/gi)) cbs.push(`ContentBlockById(${m[1]})`);
    for (const m of content.matchAll(/ContentBlockByName\s*\(\s*["']([^"']+)["']\s*\)/gi)) cbs.push(`ContentBlockByName("${esc(m[1])}")`);
    if (cbs.length > 0) {
        sections.push({ title: 'Content Blocks', items: cbs });
    }
 
    // --- 5. Triggered Sends ---
    if ([...content.matchAll(/interaction\/v1\/events/gi)].length > 0) {
        const tsItems = [];
        const tsKeys = new Set();
        for (const m of content.matchAll(/["']EventDefinitionKey["']\s*:\s*["']([^"']+)["']/gi)) tsKeys.add(m[1]);
        for (const m of content.matchAll(/eventDefinitionKey['"]\s*:\s*["']([^"']+)["']/gi)) tsKeys.add(m[1]);
        for (const m of content.matchAll(/(?:var\s+)?eventKey\s*=\s*["']([^"']+)["']/gi)) tsKeys.add(m[1]);
        if (tsKeys.size > 0) {
            for (const ts of tsKeys) tsItems.push(`EventDefinitionKey: <strong>${esc(ts)}</strong>`);
        } else {
            tsItems.push(`Llamada a <code>interaction/v1/events</code> detectada`);
        }
        sections.push({ title: 'Triggered Sends', items: tsItems });
    }
 
    // --- 6. HTTP.Post URLs ---
    const httpUrls = new Set();
    for (const m of content.matchAll(/HTTP\.Post\s*\(\s*["']([^"']+)["']/gi)) httpUrls.add(m[1]);
    for (const m of content.matchAll(/HTTP\.Post\s*\(\s*(@\w+|[\w]+Url|[\w]+URL)\b/gi)) {
        const varName = m[1].replace('@', '');
        const varAssign = content.match(new RegExp(`(?:SET\\s+@${varName}|var\\s+${varName})\\s*=\\s*["']([^"']+)["']`, 'i'));
        httpUrls.add(varAssign ? `${m[1]} → ${varAssign[1]}` : `${m[1]} (variable no resuelta)`);
    }
    if (httpUrls.size > 0) {
        sections.push({ title: 'HTTP.Post URLs', items: [...httpUrls].map(u => esc(u)) });
    }
 
    // --- 7. Redirecciones ---
    const redirects = [];
    for (const m of content.matchAll(/CloudPagesURL\s*\(\s*(\d+)\s*\)/gi)) {
        const id = m[1];
        const resolved = fullCloudPageList.find(p => String(p.id) === id || String(p.pageId) === id);
        redirects.push(resolved ? `CloudPagesURL(${id}) → "${esc(resolved.name)}"` : `CloudPagesURL(${id})`);
    }
    for (const m of content.matchAll(/(?:Redirect|RedirectTo)\s*\(\s*["']([^"']+)["']\s*\)/gi)) redirects.push(esc(m[1]));
    for (const m of content.matchAll(/(https:\/\/cloud\.[^\s"'<)]+)/gi)) {
        const matched = fullCloudPageList.find(p => p.url === m[1]);
        redirects.push(matched ? `${esc(m[1])} → "${esc(matched.name)}"` : esc(m[1]));
    }
    if (redirects.length > 0) {
        sections.push({ title: 'Redirecciones / Cloud Pages', items: redirects });
    }
 
    // --- 8. Objetos Salesforce ---
    const sfObjects = new Map();
    for (const op of [
        { fn: 'CreateSalesforceObject', label: 'Create' },
        { fn: 'RetrieveSalesforceObjects', label: 'Retrieve' },
        { fn: 'UpdateSingleSalesforceObject', label: 'Update' },
        { fn: 'DeleteSalesforceObject', label: 'Delete' }
    ]) {
        for (const m of content.matchAll(new RegExp(op.fn + '\\s*\\(\\s*["\']([^"\']+)["\']', 'gi'))) {
            if (!sfObjects.has(m[1])) sfObjects.set(m[1], new Set());
            sfObjects.get(m[1]).add(op.label);
        }
    }
    if (sfObjects.size > 0) {
        const items = [];
        for (const [objName, ops] of sfObjects) {
            items.push(`<strong>${esc(objName)}</strong> <span style="color:#999;">— ${Array.from(ops).join(', ')}</span>`);
        }
        sections.push({ title: 'Objetos Salesforce', items });
    }
 
    // --- Sin dependencias ---
    if (sections.length === 0) {
        return '<div class="cp-detail-no-deps">No se detectaron dependencias en el contenido.</div>';
    }
 
    // --- Renderizar bloques en columnas ---
    let html = '';
    for (const section of sections) {
        html += `
            <div class="cp-dep-block">
                <h4>${section.title}</h4>
                <div class="dep-items">
                    ${section.items.map(text => `<div class="dep-item">${text}</div>`).join('')}
                </div>
            </div>`;
    }
    return html;
}


 

/**
 * Extrae el contenido completo de un asset, combinando el HTML principal 
 * con el contenido de sus slots y bloques internos.
 * @param {object} asset - El objeto completo del asset devuelto por la API.
 * @returns {string} El contenido combinado.
 */
function extractFullAssetContent(asset) {
    let fullContent = '';
    
    // Contenido principal del view HTML
    fullContent += asset?.views?.html?.content || '';
    
    // Contenido de los slots
    const slots = asset?.views?.html?.slots;
    if (slots) {
        for (const slotKey of Object.keys(slots)) {
            const slot = slots[slotKey];
            if (slot.content) fullContent += '\n' + slot.content;
            if (slot.blocks) {
                for (const blockKey of Object.keys(slot.blocks)) {
                    const block = slot.blocks[blockKey];
                    if (block.content) fullContent += '\n' + block.content;
                }
            }
        }
    }
    
    // Contenido directo del asset (por si no tiene views)
    if (!fullContent && asset?.content) {
        fullContent = asset.content;
    }
    
    return fullContent;
}