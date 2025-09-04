// Fichero: src/renderer/components/automations-manager.js
// Descripción: Módulo que encapsula toda la lógica de la vista "Gestión de Automatismos".

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO DEL MÓDULO ---
let fullAutomationList = [];
let currentPage = 1;
let currentSortColumn = 'name';
let currentSortDirection = 'asc';
const ITEMS_PER_PAGE = 15;


let getAuthenticatedConfig;
let showAutomationClonerView;

// --- 2. LÓGICA DE RENDERIZADO Y FILTRADO ---

/**
 * Se llama cuando se cambia un FILTRO. Resetea la paginación y renderiza.
 */
function applyFiltersAndRender() {
    currentPage = 1;
    renderFilteredTable();
}

/**
 * Aplica los filtros actuales y llama al renderizado final.
 * No resetea la paginación, por lo que es ideal para paginar.
 */
function renderFilteredTable() {
    let filtered = fullAutomationList;
    
    const nameFilter = elements.automationNameFilter.value.toLowerCase().trim();
    if (nameFilter) {
        // Soporta múltiples nombres separados por '|' para el filtro del calendario
        const names = nameFilter.split('|').map(n => n.trim().toLowerCase());
        filtered = filtered.filter(auto => names.some(n => auto.name.toLowerCase().includes(n)));
    }

    const statusFilter = elements.automationStatusFilter.value;
    if (statusFilter) {
        filtered = filtered.filter(auto => auto.status === statusFilter);
    }
    
    renderTable(filtered);
}

/**
 * Dibuja el HTML de la tabla con los datos (ya filtrados y ordenados).
 * @param {Array} automations - La lista de automatismos a mostrar.
 */
function renderTable(automations) {
    sortData(automations); 

    const paginatedItems = automations.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    elements.automationsTbody.innerHTML = '';
    if (paginatedItems.length === 0) {
        elements.automationsTbody.innerHTML = '<tr><td colspan="4">No hay automatismos para mostrar.</td></tr>';
    } else {
        paginatedItems.forEach(auto => {
            const row = document.createElement('tr');
            row.dataset.automationId = auto.id;
            row.innerHTML = `<td>${auto.name || 'Sin Nombre'}</td><td>${formatDate(auto.lastRunTime)}</td><td>${formatDate(auto.scheduledTime)}</td><td>${auto.status || '---'}</td>`;
            elements.automationsTbody.appendChild(row);
        });
    }

    elements.paginationAutomations.style.display = 'flex';
    updatePaginationUI(automations.length);
    updateSortIndicators();
    updateButtonsState();
}

// --- 3. FUNCIONES PÚBLICAS (API del Módulo) ---

/**
 * Inicializa el módulo, configurando todos sus event listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    showAutomationClonerView = dependencies.showAutomationClonerView;

    elements.activateAutomationBtn.addEventListener('click', () => performAction('activate'));
    elements.runAutomationBtn.addEventListener('click', () => performAction('run'));
    elements.stopAutomationBtn.addEventListener('click', () => performAction('pause'));
    elements.cloneAutomationBtn.addEventListener('click', () => inspectAndShowCloner());
    elements.refreshAutomationsTableBtn.addEventListener('click', refreshData);

    elements.automationNameFilter.addEventListener('input', applyFiltersAndRender);
    elements.automationStatusFilter.addEventListener('change', applyFiltersAndRender);
    
    document.querySelector('#automations-table thead').addEventListener('click', handleSort);
    
    elements.prevPageBtnAutomations.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderFilteredTable();
        }
    });
    elements.nextPageBtnAutomations.addEventListener('click', () => {
        const maxPage = parseInt(elements.pageInputAutomations.max, 10) || 1;
        if (currentPage < maxPage) {
            currentPage++;
            renderFilteredTable();
        }
    });
    elements.pageInputAutomations.addEventListener('change', () => {
        let newPage = parseInt(elements.pageInputAutomations.value, 10) || 1;
        const maxPage = parseInt(elements.pageInputAutomations.max, 10) || 1;
        if (newPage < 1) newPage = 1;
        if (newPage > maxPage) newPage = maxPage;
        currentPage = newPage;
        renderFilteredTable();
    });
    elements.pageInputAutomations.addEventListener('blur', () => {
        if(elements.pageInputAutomations.value === '') {
            currentPage = 1;
            renderFilteredTable();
        }
    });
    elements.automationsTbody.addEventListener('click', (e) => {
        const clickedRow = e.target.closest('tr');
        if (!clickedRow || !clickedRow.dataset.automationId) return;
        clickedRow.classList.toggle('selected');
        updateButtonsState();
    });
}

/**
 * Prepara y muestra los datos en la vista. Es el punto de entrada principal.
 * @param {Array<string>} [automationNamesToFilter=null] - Nombres para filtrar desde el calendario.
 */
export async function view(automationNamesToFilter = null) {
    if (fullAutomationList.length === 0) {
        await fetchData();
    }

    // Resetea los filtros de la UI antes de aplicar los nuevos (si los hay)
    elements.automationNameFilter.value = '';
    elements.automationStatusFilter.value = '';

    if (automationNamesToFilter && automationNamesToFilter.length > 0) {
        // Usamos '|' como separador que nuestra lógica de filtro ya puede interpretar como un 'OR'
        elements.automationNameFilter.value = automationNamesToFilter.join(' | ');
    }
    
    applyFiltersAndRender();
}

/**
 * Limpia la caché de datos de este módulo. Se llama al cambiar de cliente.
 */
export function clearCache() {
    fullAutomationList = [];
    currentPage = 1;
    elements.automationNameFilter.value = '';
    elements.automationStatusFilter.innerHTML = '<option value="">Todos los estados</option>';
    elements.automationsTbody.innerHTML = '';
}

// --- 4. LÓGICA INTERNA DEL MÓDULO ---

/**
 * Fuerza una recarga de los datos desde la API.
 */
async function refreshData() {
    clearCache();
    await view();
}

/**
 * Obtiene todos los automatismos desde el mc-api-service.
 */
async function fetchData() {
    ui.blockUI("Recuperando automatismos...");
    logger.startLogBuffering();
    try {
        logger.logMessage("Cargando lista de Automatismos por primera vez...");
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        
        fullAutomationList = await mcApiService.fetchAllAutomations(apiConfig);
        populateStatusFilter(fullAutomationList);
    } catch (error) {
        logger.logMessage(`Error al cargar Automatismos: ${error.message}`);
        ui.showCustomAlert(`Error al cargar Automatismos: ${error.message}`);
        elements.automationsTbody.innerHTML = `<tr><td colspan="4" style="color:red;">Error al cargar: ${error.message}</td></tr>`;
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Realiza una acción masiva sobre los automatismos seleccionados.
 */
async function performAction(actionName) {
    const selectedRows = document.querySelectorAll('#automations-table tbody tr.selected');
    if (selectedRows.length === 0) return;

    const selectedAutomations = Array.from(selectedRows).map(row => fullAutomationList.find(auto => auto.id === row.dataset.automationId)).filter(Boolean);
    if (selectedAutomations.length === 0) return;

    if (!await ui.showCustomConfirm(`¿Seguro que quieres '${actionName}' ${selectedAutomations.length} automatismo(s)?`)) return;

    ui.blockUI(`Realizando acción ${actionName}...`);
    logger.startLogBuffering();
    const successes = [];
    const failures = [];

    try {
        const apiConfig = await getAuthenticatedConfig();
        const actionServiceMap = {
            activate: mcApiService.activateAutomation,
            run: mcApiService.runAutomation,
            pause: mcApiService.pauseAutomation
        };
        for (const auto of selectedAutomations) {
            try {
                logger.logMessage(`Iniciando acción '${actionName}' para el automatismo: "${auto.name}"...`);
                await actionServiceMap[actionName](auto.id, apiConfig);
                successes.push({ name: auto.name });
            } catch (error) {
                logger.logMessage(`FALLO al procesar "${auto.name}": ${error.message}`);
                failures.push({ name: auto.name, reason: error.message });
            }
        }
    } catch (error) {
        logger.logMessage(`Error fatal durante la acción '${actionName}': ${error.message}`);
    } finally {
        const alertSummary = `Acción '${actionName}' completada. Éxitos: ${successes.length}, Fallos: ${failures.length}.`;
        logger.logMessage(alertSummary + (failures.length > 0 ? `\n\n--- Detalles de Fallos ---\n${failures.map(f => `  - ${f.name}: ${f.reason}`).join('\n')}` : ''));
        ui.showCustomAlert(alertSummary);
        ui.unblockUI();
        logger.endLogBuffering();
        await refreshData();
    }
}

/**
 * Recupera los detalles de los automatismos seleccionados y los muestra en el log.
 * Sigue el flujo: 1. Obtiene nombre -> 2. Busca por nombre en API v1 -> 3. Obtiene ID -> 4. Busca detalles por ID.
 */
async function inspectAndShowCloner() {
    const selectedRows = document.querySelectorAll('#automations-table tbody tr.selected');
    
    if (selectedRows.length !== 1) {
        ui.showCustomAlert("Por favor, selecciona exactamente un automatismo para clonar.");
        return;
    }

    const row = selectedRows[0];
    const automationFromList = fullAutomationList.find(auto => auto.id === row.dataset.automationId);
    if (!automationFromList) return;

    if (!await ui.showCustomConfirm(`¿Quieres iniciar la clonación selectiva para "${automationFromList.name}"?`)) {
        return;
    }

    ui.blockUI(`Cargando detalles de "${automationFromList.name}"...`);

    try {
        const apiConfig = await getAuthenticatedConfig();
        
        // Usamos el ID de la lista legacy, que es válido para la API v1 de detalles
        const details = await mcApiService.fetchAutomationDetailsById(automationFromList.id, apiConfig);

        // Llamamos a la función puente de app.js para mostrar la nueva vista
        showAutomationClonerView(details);

    } catch (error) {
        ui.showCustomAlert(`Ocurrió un error al cargar los detalles: ${error.message}.`);
    } finally {
        ui.unblockUI();
    }
}

// --- 5. GESTIÓN DE LA TABLA ---

/**
 * Gestiona el evento de clic en las cabeceras para cambiar el orden.
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
    applyFiltersAndRender();
}

/**
 * Ordena un array de datos basándose en la columna y dirección actuales.
 */
function sortData(dataToSort) {
    const direction = currentSortDirection === 'asc' ? 1 : -1;
    
    dataToSort.sort((a, b) => {
        let valA = a[currentSortColumn];
        let valB = b[currentSortColumn];

        if (valA == null) return 1;
        if (valB == null) return -1;
        
        // Comprueba si la columna es una fecha para ordenarla correctamente
        if (currentSortColumn.includes('Time')) {
            return (new Date(valA) - new Date(valB)) * direction;
        }
        
        // Ordenación alfanumérica para el resto de columnas
        return String(valA).localeCompare(String(valB), undefined, { sensitivity: 'base' }) * direction;
    });
}

// --- 6. HELPERS DE UI ---

/**
 * Rellena el desplegable de filtro de estados.
 */
function populateStatusFilter(automations) {
    const currentSelectedValue = elements.automationStatusFilter.value;
    elements.automationStatusFilter.innerHTML = '<option value="">Todos los estados</option>';
    const statuses = [...new Set(automations.map(auto => auto.status).filter(Boolean))].sort();
    statuses.forEach(status => elements.automationStatusFilter.appendChild(new Option(status, status)));
    elements.automationStatusFilter.value = currentSelectedValue;
}

/**
 * Actualiza el estado de los botones de acción.
 */
function updateButtonsState() {
    const selectedRows = document.querySelectorAll('#automations-table tbody tr.selected');
    if (selectedRows.length === 0) {
        elements.activateAutomationBtn.disabled = true;
        elements.runAutomationBtn.disabled = true;
        elements.stopAutomationBtn.disabled = true;
        elements.cloneAutomationBtn.disabled = true;
        return;
    }

    elements.cloneAutomationBtn.disabled = true;
    if (selectedRows.length === 1) {
        elements.cloneAutomationBtn.disabled = false;
    }

    const selectedAutomations = Array.from(selectedRows).map(row => fullAutomationList.find(auto => auto.id === row.dataset.automationId)).filter(Boolean);
    const statuses = [...new Set(selectedAutomations.map(auto => auto.status))];
    
    if (statuses.length > 1) {
        elements.activateAutomationBtn.disabled = true;
        elements.runAutomationBtn.disabled = true;
        elements.stopAutomationBtn.disabled = true;
        return;
    }

    const singleStatus = statuses[0]?.toLowerCase();
    elements.activateAutomationBtn.disabled = !['pausedschedule', 'stopped'].includes(singleStatus);
    elements.runAutomationBtn.disabled = !['pausedschedule', 'stopped'].includes(singleStatus);
    elements.stopAutomationBtn.disabled = !['scheduled', 'ready'].includes(singleStatus);
    
}

/**
 * Actualiza la UI de los controles de paginación.
 */
function updatePaginationUI(totalItems) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    elements.totalPagesAutomations.textContent = `/ ${totalPages}`;
    elements.pageInputAutomations.value = currentPage;
    elements.pageInputAutomations.max = totalPages;
    elements.prevPageBtnAutomations.disabled = currentPage === 1;
    elements.nextPageBtnAutomations.disabled = currentPage >= totalPages;
}

/**
 * Actualiza los indicadores visuales en las cabeceras de la tabla.
 */
function updateSortIndicators() {
    document.querySelectorAll('#automations-table .sortable-header').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
        if (header.dataset.sortBy === currentSortColumn) {
            header.classList.add(currentSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

/**
 * Formatea una cadena de fecha a un formato legible local.
 */
function formatDate(dateString) {
    if (!dateString || dateString.startsWith('0001-01-01')) return '---';
    try {
        return new Date(dateString).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    } catch (error) {
        return 'Fecha inválida';
    }
}