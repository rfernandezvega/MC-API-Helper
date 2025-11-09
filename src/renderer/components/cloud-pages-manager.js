// Fichero: src/renderer/components/cloud-pages-manager.js
// Descripción: Módulo que encapsula toda la lógica de la vista "Gestión de Cloud Pages".

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO DEL MÓDULO ---

let fullCloudPageList = [];
let currentFilteredList = [];
let currentPage = 1;
let currentSortColumn = 'name';
let currentSortDirection = 'asc';
const ITEMS_PER_PAGE = 15;

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

    // Listeners para el modal de Contenidos
    elements.getCloudPageContentsBtn.addEventListener('click', showGetContentsModal);
    elements.cloudPageContentsCancelBtn.addEventListener('click', () => ui.hideModal(elements.cloudPageContentsModal));
    elements.cloudPageCopyScriptBtn.addEventListener('click', copyContentScriptToClipboard);
    elements.cloudPageContentsImportBtn.addEventListener('click', processPastedContents);
    
    // Los filtros llaman a la función que resetea la paginación a la página 1.
    elements.cloudPageIdFilter.addEventListener('input', applyFiltersAndRender);
    elements.cloudPageNameFilter.addEventListener('input', applyFiltersAndRender);
    elements.cloudPageContentFilter.addEventListener('input', applyFiltersAndRender);
    elements.cloudPageTypeFilter.addEventListener('change', applyFiltersAndRender);
    
    // El ordenamiento también resetea la paginación.
    document.querySelector('#cloudpages-table thead').addEventListener('click', handleSort);
    
    // Listener centralizado para abrir enlaces externos
    elements.cloudPagesTbody.addEventListener('click', ui.handleExternalLink);
    elements.cloudPageInternalApiLink.addEventListener('click', ui.handleExternalLink);
    elements.codeResourceInternalApiLink.addEventListener('click', ui.handleExternalLink);
    elements.cloudPageCbLink.addEventListener('click', ui.handleExternalLink);

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
    ui.blockUI("Recuperando Cloud Pages...");
    logger.startLogBuffering();
    try {
        logger.logMessage("Cargando lista de Cloud Pages por primera vez...");
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const rawAssets = await mcApiService.fetchAllCloudPages(apiConfig);
        logger.logMessage(`Se encontraron ${rawAssets.length} assets. Obteniendo rutas de carpeta...`);

        const assetsWithFolders = await mcApiService.enrichCloudPagesWithFolders(rawAssets, apiConfig);
        logger.logMessage("Rutas obtenidas. Procesando URLs y renderizando tabla...");
        
        fullCloudPageList = assetsWithFolders.map(item => ({
            ...item,
            url: extractCloudPageUrl(item),
            publishDate: item.meta?.cloudPages?.publishDate || null,
            pageId: null,
            content: item.content || '' 
        }));
        
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
    
    currentFilteredList = filtered;

    renderTable(currentFilteredList);
}

/**
 * Dibuja el HTML de la tabla con los datos (ya filtrados y ordenados).
 * @param {Array} pages - La lista de Cloud Pages a mostrar en la página actual.
 */
function renderTable(pages) {
    sortData(pages); // Ordena la lista filtrada actual
    const paginatedItems = pages.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    elements.cloudPagesTbody.innerHTML = '';
    if (paginatedItems.length === 0) {
        elements.cloudPagesTbody.innerHTML = '<tr><td colspan="7">No se encontraron Cloud Pages con los filtros aplicados.</td></tr>';
    } else {
         paginatedItems.forEach(page => {
            const row = document.createElement('tr');
            const urlCell = page.url.startsWith('http') 
                ? `<td><a href="${page.url}" class="external-link" title="Abrir URL en el navegador">${page.url}</a></td>` 
                : `<td>${page.url}</td>`;
            row.innerHTML = `
                <td>${page.name || '---'}</td>
                <td>${page.assetType.displayName || '---'}</td>
                <td>${formatDate(page.modifiedDate)}</td>
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
        const landingPagesUrl = `${baseUrl}/landing-pages?$page=1&$pageSize=5000&$orderBy=createdDate%20DESC`;
        elements.cloudPageInternalApiLink.href = landingPagesUrl;
        elements.cloudPageInternalApiLink.textContent = landingPagesUrl;

        // Generar URL para Code Resources
        const codeResourcesUrl = `${baseUrl}/code-resources?$page=1&$pageSize=5000&$orderBy=createdDate%20DESC`;
        elements.codeResourceInternalApiLink.href = codeResourcesUrl;
        elements.codeResourceInternalApiLink.textContent = codeResourcesUrl;

        elements.cloudPageIdsPasteArea.value = '';
        ui.showModal(elements.cloudPageIdsModal);

    } catch (error) {
        ui.showCustomAlert(`Error al preparar el modal: ${error.message}`);
    }
}

/**
 * Procesa el JSON pegado por el usuario y actualiza la tabla.
 */
function processPastedIds() {
    const jsonText = elements.cloudPageIdsPasteArea.value.trim();
    if (!jsonText) {
        ui.showCustomAlert("El área de texto está vacía. Por favor, pega el contenido del JSON.");
        return;
    }
    
    try {
        const data = JSON.parse(jsonText);
        const entities = data?.entities;
        
        if (!Array.isArray(entities) || entities.length === 0) {
            throw new Error("El JSON no tiene el formato esperado o la lista 'entities' está vacía.");
        }

        // Detectar el tipo de JSON basándose en una propiedad única
        let jsonType = '';
        if (entities[0].hasOwnProperty('landingPageId')) {
            jsonType = 'Landing Pages';
        } else if (entities[0].hasOwnProperty('codeResourceId')) {
            jsonType = 'Code Resources';
        } else {
            throw new Error("El formato del JSON no corresponde ni a Landing Pages ni a Code Resources.");
        }

        logger.logMessage(`Detectado JSON de tipo: ${jsonType}.`);

        // La lógica de mapeo es la misma para ambos, ya que usan siteAssetId y pageId
        const idMap = new Map(entities.map(e => [e.siteAssetId, e.pageId]));
        
        let matchCount = 0;
        fullCloudPageList.forEach(page => {
            if (idMap.has(page.id)) {
                page.pageId = idMap.get(page.id);
                matchCount++;
            }
        });

        logger.logMessage(`Se han importado los IDs. ${matchCount} Cloud Pages fueron actualizadas.`);
        ui.showCustomAlert(`Proceso completado con JSON de ${jsonType}. Se han asignado ${matchCount} IDs en la tabla.`);
        
        ui.hideModal(elements.cloudPageIdsModal);
        renderFilteredTable(); // Refrescar la tabla para mostrar los nuevos IDs

    } catch (error) {
        logger.logMessage(`Error al procesar JSON de IDs: ${error.message}`);
        ui.showCustomAlert(`Error al procesar el JSON: ${error.message}. Asegúrate de haber copiado el texto completo y válido.`);
    }
}

/**
 * Muestra el modal para recuperar contenidos, generando el enlace y script dinámicos.
 */
async function showGetContentsModal() {
    try {
        const stackKey = elements.stackKeyInput.value;
        if (!stackKey || stackKey === 'No disponible') {
            ui.showCustomAlert("No se pudo determinar el stack (S1, S7, etc.) de la cuenta. Revisa la conexión.");
            return;
        }
        
        const stackNumber = stackKey.replace('S', '');
        
        // 1. Generar URL dinámica para Content Builder
        const cbUrl = `https://content-builder.s${stackNumber}.marketingcloudapps.com/`;
        elements.cloudPageCbLink.href = cbUrl;
        elements.cloudPageCbLink.textContent = cbUrl;

        // 2. Generar Script dinámico (VERSIÓN CORREGIDA)
        const scriptContent = `(async () => {
    const baseUrl = "https://content-builder.s${stackNumber}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/";
    const validTypeIds = [240, 241, 242, 243, 244, 245, 247, 248, 249];
    const pageSize = 500;
    let page = 1;
    let allResults = [];

    console.log("🚀 Buscando assets de tipos:", validTypeIds.join(", "));

    while (true) {
        const url = \`\${baseUrl}?$page=\${page}&$pageSize=\${pageSize}&$orderBy=modifiedDate%20desc\`;
        console.log(\`📄 Consultando página \${page}...\`);
        const res = await fetch(url);
        if (!res.ok) { console.error(\`❌ Error en la página \${page}: \${res.status}\`); break; }
        const data = await res.json();

        const items = data.items || [];
        if (items.length === 0) break;

        for (const a of items) {
            const typeId = a?.assetType?.id;
            if (!validTypeIds.includes(typeId)) continue;

            let content = a.content || null;
            let urlPublica = null;

            try {
                const parsed = JSON.parse(a.content || "{}");
                if (parsed.url) urlPublica = parsed.url;
            } catch {}

            if (typeId === 247 && a.meta?.thumbnailRefAssetId) {
                try {
                    const subUrl = \`\${baseUrl}\${a.meta.thumbnailRefAssetId}\`;
                    const subRes = await fetch(subUrl);
                    if (subRes.ok) {
                        const subData = await subRes.json();
                        content = subData?.views?.html?.content || subData.content || content;
                    } else {
                        console.warn(\`⚠️ No se pudo obtener el contenido de la landing \${a.id} (\${a.name})\`);
                    }
                } catch (e) {
                    console.warn(\`⚠️ Error al cargar contenido de landing \${a.id}:\`, e);
                }
            }

            allResults.push({
                id: a.id,
                name: a.name || "(sin nombre)",
                assetTypeId: typeId,
                assetTypeName: a.assetType?.name || "(desconocido)",
                url: urlPublica,
                content: content
            });
        }

        if (items.length < pageSize) break;
        page++;
    }

    const finalJson = { items: allResults };    
    console.log("✅ JSON generado con", allResults.length, "elementos. Haz click derecho en el siguiente elemento para copiarlo");
    console.log(finalJson);
    
})();`;

        elements.cloudPageFetchScript.textContent = scriptContent;
        elements.cloudPageContentsPasteArea.value = '';
        ui.showModal(elements.cloudPageContentsModal);

    } catch (error) {
        ui.showCustomAlert(`Error al preparar el modal de contenidos: ${error.message}`);
    }
}

/**
 * Copia el contenido del script de la modal al portapapeles.
 */
function copyContentScriptToClipboard() {
    const scriptText = elements.cloudPageFetchScript.textContent;
    navigator.clipboard.writeText(scriptText)
        .then(() => ui.showCustomAlert("¡Código copiado al portapapeles!"))
        .catch(err => ui.showCustomAlert(`Error al copiar: ${err.message}`));
}

/**
 * Procesa el JSON de contenidos pegado por el usuario y actualiza la tabla.
 */
function processPastedContents() {
    const jsonText = elements.cloudPageContentsPasteArea.value.trim();
    if (!jsonText) {
        ui.showCustomAlert("El área de texto está vacía. Pega el contenido del JSON generado.");
        return;
    }
    
    try {
        const data = JSON.parse(jsonText);
        const items = data?.items;
        
        if (!Array.isArray(items)) {
            throw new Error("El JSON no tiene el formato esperado o la lista 'items' no existe.");
        }

        const contentMap = new Map(items.map(item => [item.id, { content: item.content, url: item.url }]));
        
        let matchCount = 0;
        fullCloudPageList.forEach(page => {
            if (contentMap.has(page.id)) {
                const enrichedData = contentMap.get(page.id);
                page.content = enrichedData.content;
                // También actualizamos la URL por si el script la encontró de forma más fiable
                if (enrichedData.url) {
                    page.url = enrichedData.url;
                }
                matchCount++;
            }
        });

        logger.logMessage(`Se han importado los contenidos. ${matchCount} Cloud Pages fueron actualizadas.`);
        ui.showCustomAlert(`Proceso completado. Se ha actualizado el contenido de ${matchCount} Cloud Pages en la tabla.`);
        
        ui.hideModal(elements.cloudPageContentsModal);
        renderFilteredTable(); // Refrescar la tabla para mostrar los nuevos contenidos y aplicar filtros

    } catch (error) {
        logger.logMessage(`Error al procesar JSON de contenidos: ${error.message}`);
        ui.showCustomAlert(`Error al procesar el JSON: ${error.message}. Asegúrate de haber copiado el texto completo y válido.`);
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

    const headers = ['Page ID', 'Nombre', 'Tipo', 'Fecha Modificacion', 'Fecha Publicacion', 'Ubicacion', 'URL'];
    
    // Hacemos una copia de los datos filtrados para ordenarlos
    const sortedData = [...currentFilteredList];
    sortData(sortedData);
    
    const rows = sortedData.map(page => [
        `"${page.pageId || ''}"`,
        `"${page.name || ''}"`,
        `"${page.assetType.displayName || ''}"`,
        `"${formatDate(page.modifiedDate)}"`,
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