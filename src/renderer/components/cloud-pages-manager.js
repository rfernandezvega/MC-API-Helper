// Fichero: src/renderer/components/cloud-pages-manager.js
// Descripción: Módulo que encapsula toda la lógica de la vista "Gestión de Cloud Pages".

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO DEL MÓDULO ---

let fullCloudPageList = [];
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
    
    // Los filtros llaman a la función que resetea la paginación a la página 1.
    elements.cloudPageNameFilter.addEventListener('input', applyFiltersAndRender);
    elements.cloudPageTypeFilter.addEventListener('change', applyFiltersAndRender);
    
    // El ordenamiento también resetea la paginación.
    document.querySelector('#cloudpages-table thead').addEventListener('click', handleSort);
    
    // Listener para abrir enlaces externos en la tabla.
    elements.cloudPagesTbody.addEventListener('click', (e) => {
        const link = e.target.closest('a.external-link');
        if (link) { 
            e.preventDefault(); 
            window.electronAPI.openExternalLink(link.href); 
        }
    });

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
    elements.cloudPageNameFilter.value = '';
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
            url: extractCloudPageUrl(item) 
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
    
    const nameFilter = elements.cloudPageNameFilter.value.toLowerCase().trim();
    if (nameFilter) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(nameFilter));
    }
    
    const typeFilter = elements.cloudPageTypeFilter.value;
    if (typeFilter) {
        filtered = filtered.filter(p => p.assetType.displayName === typeFilter);
    }
    
    renderTable(filtered);
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
        elements.cloudPagesTbody.innerHTML = '<tr><td colspan="5">No se encontraron Cloud Pages con los filtros aplicados.</td></tr>';
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
                <td>${page.location || '---'}</td>
                ${urlCell}
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
    const getValue = (obj, key) => (key === 'assetType.displayName') ? obj.assetType?.displayName : obj[key];
    const direction = currentSortDirection === 'asc' ? 1 : -1;
    
    data.sort((a, b) => {
        let valA = getValue(a, currentSortColumn);
        let valB = getValue(b, currentSortColumn);
        if (valA == null) return 1;
        if (valB == null) return -1;
        if (currentSortColumn.includes('Date')) {
            return (new Date(valA) - new Date(valB)) * direction;
        }
        return String(valA).localeCompare(String(valB), undefined, { sensitivity: 'base' }) * direction;
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