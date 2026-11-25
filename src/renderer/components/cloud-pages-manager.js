// Fichero: src/renderer/components/cloud-pages-manager.js
// Descripción: Módulo que encapsula toda la lógica de la vista "Gestión de Cloud Pages".

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { formatCodeWithIndentation, highlightCloudPageCode, buildCodeViewer } from '../ui/code-utils.js';
import { escapeHtml, formatDate } from '../ui/format-utils.js';
import { createTableSorter, createPaginator } from '../ui/table-utils.js';
import { getRowsPerPage } from './settings.js';
import { fetchCloudPagesWithContent, loadCloudPagesCache, withSlotContent } from './cloudpages-cache.js';
import { buildReferenceGraph, countMissingPageIds, isCodeResource, detectBlockReferences } from './audit/cloudpages-security.js';
import { buildCloudPagesMap, handleCpMapClick, enableCpMapDrag, fitCpMaps } from './audit/cloudpages-map.js';


// --- 1. ESTADO DEL MÓDULO ---

let fullCloudPageList = [];
let currentFilteredList = [];
// Datos de los content blocks del mapa leídos de la caché de Contenidos ("Id:123" → {name, assetType} | null).
const blockInfoCache = new Map();
// Si el mapa de referencias muestra los content blocks.
let mapShowBlocks = false;

// Controladores reutilizables de ordenación y paginación (WP-4/WP-5), instanciados en
// init(). La ordenación inicial se mantiene: 'modifiedDate' (fecha) descendente.
let sorter = null;
let paginator = null;

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

    // Mapa de referencias entre Cloud Pages (mismo análisis que la Auditoría, sobre la lista cargada)
    elements.cloudPagesMapBtn.addEventListener('click', showReferenceMap);
    elements.cloudPagesMapCloseBtn.addEventListener('click', () => ui.hideModal(elements.cloudPagesMapModal));
    elements.cloudPagesMapModal.addEventListener('click', (e) => {
        if (e.target === elements.cloudPagesMapModal) ui.hideModal(elements.cloudPagesMapModal);
    });
    elements.cloudPagesMapBody.addEventListener('click', handleCpMapClick);
    enableCpMapDrag(elements.cloudPagesMapBody);
    // El botón de content blocks se pinta dentro del mapa, así que se escucha por delegación.
    elements.cloudPagesMapBody.addEventListener('click', (e) => {
        if (!e.target.closest('.cpmap-blocks-toggle')) return;
        mapShowBlocks = !mapShowBlocks;
        renderReferenceMap(mapShowBlocks);
    });

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
    elements.cloudPageLocationFilter?.addEventListener('input', applyFiltersAndRender);
    elements.cloudPageTypeFilter.addEventListener('change', applyFiltersAndRender);
    elements.cloudPagePublishedFilter.addEventListener('change', applyFiltersAndRender);
    elements.cloudPageUrlFilter.addEventListener('change', applyFiltersAndRender);
    elements.cloudPageDateField.addEventListener('change', applyFiltersAndRender);
    elements.cloudPageDateFrom.addEventListener('change', applyFiltersAndRender);
    elements.cloudPageDateTo.addEventListener('change', applyFiltersAndRender);
    
    // Ordenación — controlador reutilizable (las columnas *Date se ordenan como fecha).
    // El reordenado también resetea la paginación, como hacía el handleSort local.
    sorter = createTableSorter({
        tableSelector: '#cloudpages-table',
        initialColumn: 'modifiedDate',
        initialDirection: 'desc',
        types: { modifiedDate: 'date', publishDate: 'date' },
        onSort: applyFiltersAndRender
    });
    sorter.attach();

    elements.cloudPageInternalApiLink.addEventListener('click', ui.handleExternalLink);

    // Paginación — controlador reutilizable sobre los 4 controles estándar
    paginator = createPaginator(
        {
            pageInput: elements.pageInputCloudPages,
            totalLabel: elements.totalPagesCloudPages,
            prevBtn: elements.prevPageBtnCloudPages,
            nextBtn: elements.nextPageBtnCloudPages
        },
        { itemsPerPage: () => getRowsPerPage('cloudpages'), onPageChange: renderFilteredTable }
    );

    // Listener de seguridad para cuando el campo de página queda vacío.
    elements.pageInputCloudPages.addEventListener('blur', () => {
        if (elements.pageInputCloudPages.value === '') {
            // update() cambia de página sin disparar onPageChange; el render es explícito
            paginator.update(0, 1);
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
        if (e.key !== 'Escape') return;
        if (elements.cpDetailDrawer.classList.contains('open')) closeCpDrawer();
        if (elements.cloudPagesMapModal.style.display === 'flex') ui.hideModal(elements.cloudPagesMapModal);
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
 * Usa la caché del cliente/BU (la generan esta vista y la Auditoría) y solo va a la API si no
 * existe. Para traer cambios recientes está el botón Refrescar.
 */
export async function view() {
    if (fullCloudPageList.length === 0) {
        const clientName = elements.clientNameInput.value.trim();
        // La caché puede pesar varios MB y tardar unos segundos en leerse.
        ui.blockUI('Cargando Cloud Pages desde la caché...');
        let cached = null;
        try {
            cached = await loadCloudPagesCache(clientName);
        } finally {
            ui.unblockUI();
        }
        // Si el usuario cambió de cliente mientras se leía la caché, no se pinta la de otro.
        if (cached && cached.length > 0 && elements.clientNameInput.value.trim() === clientName) {
            fullCloudPageList = cached;
            logger.logMessage(`Cloud Pages cargadas desde la caché (${cached.length}). Pulsa Refrescar para obtener los cambios recientes.`);
            populateCloudPageFilters(fullCloudPageList);
        } else {
            await fetchData();
        }
    }
    applyFiltersAndRender();
}

/**
 * Limpia la caché de datos y resetea la UI del módulo. Se llama al cambiar de cliente.
 */
export function clearCache() {
    fullCloudPageList = [];
    blockInfoCache.clear();
    elements.cloudPageIdFilter.value = '';
    elements.cloudPageNameFilter.value = '';
    elements.cloudPageContentFilter.value = '';
    if (elements.cloudPageLocationFilter) elements.cloudPageLocationFilter.value = '';
    elements.cloudPageTypeFilter.innerHTML = '<option value="">Todos los tipos</option>';
    elements.cloudPagesTbody.innerHTML = '';
    elements.cloudPagePublishedFilter.value = '';
    elements.cloudPageUrlFilter.value = '';
    elements.cloudPageDateField.value = '';
    elements.cloudPageDateFrom.value = '';
    elements.cloudPageDateTo.value = '';

    if (elements.cloudPageCountSpan) {
        elements.cloudPageCountSpan.textContent = '';
    }
}

// --- 3. LÓGICA DE DATOS Y API ---

/**
 * Fuerza una recarga completa de los datos de Cloud Pages desde la API (actualiza la caché).
 */
async function refreshData() {
    clearCache();
    await fetchData();
    applyFiltersAndRender();
}

/**
 * Descarga las Cloud Pages con su contenido mediante el módulo compartido de caché (que
 * conserva los Page IDs importados y guarda el resultado) y rellena los filtros.
 */
async function fetchData() {
    ui.blockUI("Recuperando datos de Cloud Pages...");
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        const clientName = elements.clientNameInput.value.trim();

        const { pages } = await fetchCloudPagesWithContent(apiConfig, clientName, {
            onProgress: (msg) => ui.blockUI(msg)
        });
        fullCloudPageList = pages;
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
    // update() vuelve a página 1 sin disparar onPageChange (el render lo hacemos aquí)
    paginator?.update(0, 1);
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
        // Se busca también en los slots y bloques colocados, que forman parte de lo publicado.
        filtered = filtered.filter(p => {
            const text = withSlotContent(p).content;
            return text && text.toLowerCase().includes(contentFilter);
        });
    }
    
    // Búsqueda parcial en la ruta de carpeta (p. ej. "Formularios" encuentra todo lo que cuelga de ella).
    const locationFilter = (elements.cloudPageLocationFilter?.value || '').toLowerCase().trim();
    if (locationFilter) {
        filtered = filtered.filter(p => String(p.location || '').toLowerCase().includes(locationFilter));
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

    // Filtro por rango de fechas
    const dateField = elements.cloudPageDateField.value;
    const dateFrom = elements.cloudPageDateFrom.value;
    const dateTo = elements.cloudPageDateTo.value;
    if (dateField && (dateFrom || dateTo)) {
        filtered = filtered.filter(p => ui.isDateInRange(p[dateField], dateFrom, dateTo));
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
    if (sorter) sorter.sort(pages);

    // paginate() recalcula el total de páginas y devuelve solo la página actual
    const paginatedItems = paginator ? paginator.paginate(pages) : pages;

    elements.cloudPagesTbody.innerHTML = '';
    if (paginatedItems.length === 0) {
        elements.cloudPagesTbody.innerHTML = '<tr><td colspan="9">No se encontraron Cloud Pages con los filtros aplicados.</td></tr>';
    } else {
        paginatedItems.forEach(page => {
            const row = document.createElement('tr');
            row.dataset.cloudpageId = String(page.id);

            // Datos de la API (nombre, tipo, autor, ubicación, url): se escapan antes de interpolar
            const urlCell = page.url.startsWith('http')
                ? `<td><a href="${escapeHtml(page.url)}" class="external-link" title="Abrir URL en el navegador">${escapeHtml(page.url)}</a></td>`
                : `<td>${escapeHtml(page.url)}</td>`;

            const inspectBtn = page.hasDetailedContent
            ? `<span class="cp-inspect-btn" data-cloudpage-id="${page.id}" title="Ver dependencias y código"><svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg></span>`
            : '';

            row.innerHTML = `
                <td class="ta-center">${inspectBtn}</td>
                <td>${escapeHtml(page.name) || '---'}</td>
                <td>${escapeHtml(page.assetType.displayName) || '---'}</td>
                <td>${formatDate(page.modifiedDate)}</td>
                <td>${escapeHtml(page.modifiedByName) || '---'}</td>
                <td>${formatDate(page.publishDate)}</td>
                <td>${escapeHtml(page.location) || '---'}</td>
                ${urlCell}
                <td>${escapeHtml(page.pageId) || '---'}</td>
            `;
            elements.cloudPagesTbody.appendChild(row);
        });
    }

    if (sorter) sorter.updateIndicators();
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
 
    // 1. Dependencias: se analizan el código y los slots/bloques colocados
    elements.cpDetailDeps.innerHTML = buildDependenciesGrid(withSlotContent(page).content, page.name, page.slotBlocks);

    // 2. Código fuente: solo el de la página, como el Code View de Marketing Cloud
    elements.cpDetailCode.innerHTML = buildCodeViewer(page.content);
 
    // 3. Abrir el drawer
    elements.cpDetailDrawer.classList.add('open');
    elements.cpDetailBackdrop.classList.add('active');
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
 * Abre el mapa de referencias de las Cloud Pages que muestra la tabla con los filtros actuales:
 * qué páginas referencian a cuáles por URL, ruta relativa o id, con un resumen y el aviso de
 * Landing Pages sin Page ID importado.
 */
function showReferenceMap() {
    if (fullCloudPageList.length === 0) {
        ui.showCustomAlert('No hay Cloud Pages cargadas. Pulsa Refrescar para descargarlas.');
        return;
    }
    if (currentFilteredList.length === 0) {
        ui.showCustomAlert('Ninguna Cloud Page cumple los filtros actuales.');
        return;
    }
    mapShowBlocks = false;
    renderReferenceMap(false);
    ui.showModal(elements.cloudPagesMapModal);
}

/** HTML del botón que muestra u oculta los content blocks, según el estado actual del mapa. */
function mapBlocksButtonHtml() {
    return `<button type="button" class="action-button cpmap-blocks-toggle${mapShowBlocks ? ' is-active' : ''}" ` +
        `title="Añade los bloques que usa cada página: ContentBlockBy* y Reference Content colocados en slots">` +
        `${mapShowBlocks ? 'Ocultar content blocks' : 'Mostrar content blocks'}</button>`;
}

/**
 * Pinta el mapa de referencias en el modal, con o sin los content blocks que usa cada página.
 * Muestra las páginas filtradas en la tabla y sus referencias; las páginas fuera del filtro que
 * llaman o son llamadas por ellas aparecen atenuadas. El grafo se calcula sobre todas las páginas
 * para poder resolver las URLs y los ids de las que no están en el filtro.
 * @param {boolean} withBlocks - Si se añaden los content blocks como nodos.
 */
async function renderReferenceMap(withBlocks) {
    const analysisPages = fullCloudPageList.map(withSlotContent);
    const graph = buildReferenceGraph(analysisPages);

    const isFiltered = currentFilteredList.length < fullCloudPageList.length;
    const filteredIds = new Set(currentFilteredList.map(p => String(p.id)));
    const inFilter = (p) => !isFiltered || filteredIds.has(String(p.id));
    const scopePages = analysisPages.filter(inFilter);

    const pageEdges = graph.edges.filter(e => inFilter(e.from) || inFilter(e.to));
    const selfRefPages = [...graph.selfRefs.keys()].filter(inFilter);
    const unresolvedCount = [...graph.unresolved.keys()].filter(inFilter).length;
    const selfRefIds = new Set(selfRefPages.map(p => String(p.id)));
    const { total, missing } = countMissingPageIds(isFiltered ? currentFilteredList : fullCloudPageList);

    // Páginas fuera del filtro que aparecen por estar conectadas con alguna filtrada.
    const outsideIds = new Set();
    if (isFiltered) {
        for (const e of pageEdges) {
            if (!inFilter(e.from)) outsideIds.add(String(e.from.id));
            if (!inFilter(e.to)) outsideIds.add(String(e.to.id));
        }
    }

    let nodes = analysisPages;
    let edges = pageEdges;
    let blockSummary = '';
    if (withBlocks) {
        const blocks = await buildBlockNodes(scopePages);
        nodes = [...analysisPages, ...blocks.nodes];
        edges = [...pageEdges, ...blocks.edges];
        blockSummary = ` · ${blocks.nodes.length} content blocks usados por ${blocks.pagesWithBlocks} Cloud Pages` +
            (blocks.unnamed > 0 ? ` (${blocks.unnamed} sin nombre: no están en la caché de Contenidos)` : '');
    }

    const scopeText = isFiltered
        ? `Filtro aplicado: ${scopePages.length} de ${fullCloudPageList.length} Cloud Pages` +
          (outsideIds.size > 0 ? ` (${outsideIds.size} páginas fuera del filtro, atenuadas, por estar conectadas)` : '') + ' · '
        : '';
    let summary = `${scopeText}${pageEdges.length} referencias entre ${scopePages.length} Cloud Pages · ` +
        `${selfRefPages.length} páginas se referencian a sí mismas · ` +
        `${unresolvedCount} páginas usan ids que no se han podido asociar.${blockSummary}`;
    if (missing > 0) {
        summary += ` ${missing} de ${total} Landing Pages no tienen Page ID: usa "Recuperar IDs" para resolver las referencias por CloudPagesURL(id).`;
    }
    elements.cloudPagesMapSummary.textContent = summary;
    elements.cloudPagesMapBody.innerHTML = buildCloudPagesMap(nodes, edges, selfRefIds, isCodeResource, { outsideIds, leftActionsHtml: mapBlocksButtonHtml() });
    // Se ajusta cuando el modal ya está visible y el recuadro tiene tamaño.
    requestAnimationFrame(() => fitCpMaps(elements.cloudPagesMapBody));
}

/**
 * Crea un nodo por cada content block que referencian las páginas (ContentBlockBy* con valor
 * literal, incluidos los Reference Content de los slots) y una arista página → bloque. Los nombres
 * se leen de la caché de Contenidos sin llamar a la API; se guardan en memoria para no releerla.
 * @param {Array<object>} analysisPages - Cloud Pages con el contenido de sus slots incluido.
 * @returns {Promise<{nodes:Array<object>, edges:Array<object>, pagesWithBlocks:number, unnamed:number}>}
 */
async function buildBlockNodes(analysisPages) {
    const refsByPage = analysisPages.map(p => ({ page: p, refs: detectBlockReferences(p.content) }));
    const all = new Map();
    for (const { refs } of refsByPage) for (const r of refs) all.set(`${r.by}:${r.value.toLowerCase()}`, r);

    const pending = [...all.entries()].filter(([k]) => !blockInfoCache.has(k)).map(([, r]) => r);
    if (pending.length > 0 && window.electronAPI?.lookupClientContents) {
        ui.blockUI('Leyendo los nombres de los content blocks de la caché de Contenidos...');
        try {
            const res = await window.electronAPI.lookupClientContents(elements.clientNameInput.value.trim(), {
                ids: pending.filter(r => r.by === 'Id').map(r => r.value),
                keys: pending.filter(r => r.by === 'Key').map(r => r.value),
                names: pending.filter(r => r.by === 'Name').map(r => r.value)
            });
            for (const r of pending) {
                const v = r.value.toLowerCase();
                const hit = (res?.items || []).find(it =>
                    (r.by === 'Id' && String(it.id) === r.value) ||
                    (r.by === 'Key' && String(it.customerKey).toLowerCase() === v) ||
                    (r.by === 'Name' && String(it.name).toLowerCase() === v));
                blockInfoCache.set(`${r.by}:${v}`, hit || null);
            }
        } catch (e) {
            logger.logMessage(`No se pudo leer la caché de Contenidos para el mapa: ${e.message}`);
        } finally {
            ui.unblockUI();
        }
    }

    const nodes = new Map();
    const edges = [];
    let pagesWithBlocks = 0;
    for (const { page, refs } of refsByPage) {
        if (refs.length) pagesWithBlocks++;
        for (const r of refs) {
            const key = `${r.by}:${r.value.toLowerCase()}`;
            if (!nodes.has(key)) {
                const info = blockInfoCache.get(key);
                const refLabel = `ContentBlockBy${r.by}(${r.by === 'Id' ? r.value : `"${r.value}"`})`;
                nodes.set(key, {
                    id: `cb:${key}`, isContentBlock: true, named: !!info,
                    name: info?.name || refLabel, refLabel,
                    assetType: { displayName: info?.assetType ? `Content block · ${info.assetType}` : 'Content block' }
                });
            }
            edges.push({ from: page, to: nodes.get(key), vias: [`ContentBlockBy${r.by}`] });
        }
    }
    const list = [...nodes.values()];
    return { nodes: list, edges, pagesWithBlocks, unnamed: list.filter(n => !n.named).length };
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
    if (sorter) sorter.sort(sortedData);
    
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
 * Analiza el contenido de una Cloud Page y devuelve HTML con las dependencias
 * distribuidas en columnas (estilo panel de logs: flex 1 1 0).
 * @param {string} content - Código de la página más el de sus slots/bloques colocados.
 * @param {string} pageName - Nombre de la página para contexto.
 * @param {Array<{slot:string, block:string|null, content:string}>} [slotBlocks] - Slots y bloques
 *        colocados; los que no incluyen un ContentBlockBy* se listan como bloque de slot.
 * @returns {string} HTML con bloques de dependencias en columnas.
 */
function buildDependenciesGrid(content, pageName, slotBlocks = []) {
    if (!content) return '<div class="cp-detail-no-deps">Sin contenido disponible</div>';

    // Alias local del helper compartido de escape (sustituye a la copia que había aquí)
    const esc = escapeHtml;
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
            items.push(`<strong>${esc(deName)}</strong> <span class="dep-item-fns">— ${Array.from(functions).join(', ')}</span>`);
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
    // Cada referencia se lista una vez aunque aparezca en el código y en un slot.
    const cbs = new Set();
    for (const m of content.matchAll(/ContentBlockByKey\s*\(\s*["']([^"']+)["']\s*\)/gi)) cbs.add(`ContentBlockByKey("${esc(m[1])}")`);
    for (const m of content.matchAll(/ContentBlockById\s*\(\s*["']?(\d+)["']?\s*\)/gi)) cbs.add(`ContentBlockById(${m[1]})`);
    for (const m of content.matchAll(/ContentBlockByName\s*\(\s*["']([^"']+)["']\s*\)/gi)) cbs.add(`ContentBlockByName("${esc(m[1])}")`);
    // Los bloques de slot con contenido propio (no una referencia) no salen en el código de la
    // página, así que se indica que existen y dónde están.
    for (const sb of slotBlocks || []) {
        if (/ContentBlockBy(Key|Id|Name)\s*\(/i.test(sb.content)) continue;
        cbs.add(sb.block
            ? `Bloque HTML en slot <code>${esc(sb.slot)}</code> (clave <code>${esc(sb.block)}</code>)`
            : `Contenido del slot <code>${esc(sb.slot)}</code>`);
    }
    if (cbs.size > 0) {
        sections.push({ title: 'Content Blocks', items: [...cbs] });
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
            items.push(`<strong>${esc(objName)}</strong> <span class="dep-item-fns">— ${Array.from(ops).join(', ')}</span>`);
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

