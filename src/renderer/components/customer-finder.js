// Fichero: src/renderer/components/customer-finder.js
// Descripción: Módulo que encapsula toda la lógica del Buscador de Clientes.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO DEL MÓDULO ---

let getAuthenticatedConfig; // Dependencia inyectada desde app.js
let currentClientConfig;    // Configuración del cliente activo (para las DEs de búsqueda)

let selectedCustomerRow = null;
let selectedSubscriberData = null;

const DE_ITEMS_PER_PAGE = 5; 
// Mapa para guardar el estado de paginación y ordenación de cada tabla de DE
let dePaginationStates = new Map(); 
// Objeto para guardar el estado de la tabla principal de clientes
let customerResultsState = { allRows: [], sortColumn: null, sortDirection: 'asc' };

// --- 2. FUNCIONES PÚBLICAS ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.searchCustomerBtn.addEventListener('click', searchCustomer);
    elements.selectTablesBtn.addEventListener('click', displayDESelection);
    elements.getCustomerJourneysBtn.addEventListener('click', getCustomerJourneys);
    elements.customerSearchTbody.addEventListener('click', handleRowSelection);
    elements.customerJourneysTbody.addEventListener('click', handleJourneyRowSelection);
    elements.ejectCustomerFromJourneysBtn.addEventListener('click', ejectCustomer);

    elements.selectAllDEsCheckbox.addEventListener('change', handleSelectAllDEs);
    elements.searchSelectedDEsBtn.addEventListener('click', startSelectedDESearch);

    // Delegación de eventos para la ordenación y paginación
    document.getElementById('clientes-tab').addEventListener('click', e => {
        // Manejar clics en cabeceras ordenables
        const header = e.target.closest('.sortable-header');
        if (header) {
            handleSortClick(e);
            return;
        }

        // Manejar clics en botones de paginación
        const paginationButton = e.target.closest('.pagination-arrow');
        if (paginationButton) {
            handlePaginationClick(e);
            return;
        }
    });

    // Delegación de eventos para el input de página
    document.getElementById('clientes-tab').addEventListener('change', e => {
        const pageInput = e.target.closest('.page-input');
        if (pageInput) {
            handlePageInputChange(e);
        }
    });
}

/**
 * Actualiza la configuración del cliente activo. Es crucial para saber en qué DEs buscar.
 * @param {object} clientConfig - El objeto de configuración del cliente actual.
 */
export function updateClientConfig(clientConfig) {
    currentClientConfig = clientConfig;
}

// --- 3. LÓGICA PRINCIPAL ---

/**
 * Orquesta la búsqueda de un cliente por Subscriber Key o Email.
 */
async function searchCustomer() {
    elements.deSelectionBlock.classList.add('hidden');
    elements.customerDesResultsBlock.classList.add('hidden');

    ui.blockUI("Buscando cliente...");
    logger.startLogBuffering();
    
    // Resetear estado y UI
    if (selectedCustomerRow) selectedCustomerRow.classList.remove('selected');
    selectedCustomerRow = null;
    selectedSubscriberData = null;
    elements.selectTablesBtn.disabled = true;
    elements.getCustomerJourneysBtn.disabled = true;
    elements.customerJourneysResultsBlock.classList.add('hidden');
    elements.customerDesResultsBlock.classList.add('hidden');
    elements.customerSearchTbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const value = elements.customerSearchValue.value.trim();
        if (!value) throw new Error("El campo de búsqueda no puede estar vacío.");
        
        logger.logMessage(`Iniciando búsqueda de cliente con el valor: "${value}"`);
        let finalResults = [];

        logger.logMessage(`Paso 1/3: Buscando como Suscriptor por SubscriberKey...`);
        finalResults = await mcApiService.searchSubscriberByProperty('SubscriberKey', value, apiConfig);

        if (finalResults.length === 0) {
            logger.logMessage(`Paso 2/3: No encontrado. Buscando como Suscriptor por EmailAddress...`);
            finalResults = await mcApiService.searchSubscriberByProperty('EmailAddress', value, apiConfig);
        }

        if (finalResults.length === 0) {
            logger.logMessage(`Paso 3/3: No encontrado. Buscando como Contacto por ContactKey...`);
            finalResults = await mcApiService.searchContactByKey(value, apiConfig);
        }

        customerResultsState.allRows = finalResults;
        renderCustomerSearchResults();

        logger.logMessage(`Búsqueda completada. Se encontraron ${finalResults.length} resultado(s).`);

    } catch (error) {
        logger.logMessage(`Error al buscar clientes: ${error.message}`);
        elements.customerSearchTbody.innerHTML = `<tr><td colspan="6" style="color: red;">Error: ${error.message}</td></tr>`;
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Obtiene los Journeys en los que se encuentra el cliente seleccionado.
 */
async function getCustomerJourneys() {
    if (!selectedSubscriberData?.subscriberKey) return;
    
    ui.blockUI("Buscando Journeys del cliente...");
    logger.startLogBuffering();
    elements.customerJourneysResultsBlock.classList.remove('hidden');
    elements.customerJourneysTbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
    
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        const contactKey = selectedSubscriberData.subscriberKey;
        logger.logMessage(`Buscando Journeys para el Contact Key: ${contactKey}`);

        const memberships = await mcApiService.fetchContactJourneyMemberships(contactKey, apiConfig);
        if (memberships.length === 0) {
            renderCustomerJourneysTable([]);
            logger.logMessage("El contacto no está en ningún Journey.");
            return; 
        }
        
        const uniqueKeys = [...new Set(memberships.map(m => m.definitionKey))];
        logger.logMessage(`Membresías encontradas en ${uniqueKeys.length} Journey(s) únicos. Obteniendo detalles...`);
        
        const detailPromises = uniqueKeys.map(key => mcApiService.fetchJourneyDetailsByKey(key, apiConfig));
        const journeyDetails = (await Promise.all(detailPromises)).filter(Boolean);

        renderCustomerJourneysTable(journeyDetails);
        logger.logMessage(`Detalles obtenidos para ${journeyDetails.length} Journey(s).`);

    } catch (error) {
        logger.logMessage(`Error al buscar journeys del cliente: ${error.message}`);
        elements.customerJourneysTbody.innerHTML = `<tr><td colspan="6" style="color: red;">Error: ${error.message}</td></tr>`;
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

function displayDESelection() {
    if (!selectedSubscriberData?.subscriberKey) return;
    
    const configs = currentClientConfig?.dvConfigs?.filter(c => c.deKey && c.field) || [];
    const tbody = elements.deSelectionTable.querySelector('tbody');
    tbody.innerHTML = '';

    if (configs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2">No hay Data Extensions configuradas para buscar.</td></tr>';
    } else {
        configs.forEach(config => {
            const row = document.createElement('tr');
            // Usamos deKey como valor para el checkbox
            row.innerHTML = `<td><input type="checkbox" class="de-select-checkbox" value="${config.deKey}"></td><td>${config.title}</td>`;
            tbody.appendChild(row);
        });
    }

    elements.selectAllDEsCheckbox.checked = false;
    elements.deSelectionBlock.classList.remove('hidden');
    // Ocultamos resultados anteriores
    elements.customerDesResultsBlock.classList.add('hidden');
}

async function startSelectedDESearch() {
    const selectedCheckboxes = elements.deSelectionTable.querySelectorAll('tbody input:checked');
    if (selectedCheckboxes.length === 0) {
        ui.showCustomAlert("Por favor, selecciona al menos una tabla.");
        return;
    }

    ui.blockUI("Buscando en Data Extensions...");
    logger.startLogBuffering();

    elements.deSelectionBlock.classList.add('hidden');
    elements.customerDesResultsBlock.classList.remove('hidden');
    elements.desResultsContainer.innerHTML = '';
    dePaginationStates.clear();

    const selectedDEKeys = Array.from(selectedCheckboxes).map(cb => cb.value);
    const configs = currentClientConfig?.dvConfigs.filter(c => selectedDEKeys.includes(c.deKey)) || [];
    const apiConfig = await getAuthenticatedConfig();
    mcApiService.setLogger(logger);
    
    for (const config of configs) {
        const resultBlock = createResultBlock(config.title, config.deKey);
        elements.desResultsContainer.appendChild(resultBlock);
        
        try {
            ui.blockUI(`Buscando en "${config.title}"...`);
            logger.logMessage(`-> Consultando DE: ${config.deKey} en el campo "${config.field}"...`);
            const items = await mcApiService.searchDataExtensionRows(config.deKey, config.field, selectedSubscriberData.subscriberKey, apiConfig);

            if (items.length > 0) {
                dePaginationStates.set(config.deKey, {
                    allRows: items.map(item => item.values), // Guardamos solo los valores
                    currentPage: 1,
                    sortColumn: null,
                    sortDirection: 'asc'
                });
                renderDEPage(config.deKey, 1);
            } else {
                resultBlock.querySelector('.table-container').innerHTML = '<p>No se encontraron registros en esta Data Extension.</p>';
            }
        } catch (error) {
            logger.logMessage(`-> Error consultando ${config.deKey}: ${error.message}`);
            resultBlock.querySelector('.table-container').innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        }
    }

    logger.logMessage("Búsqueda en Data Extensions completada.");
    logger.endLogBuffering();
    ui.unblockUI();
}

// --- 4. MANIPULACIÓN DE EVENTOS Y UI ---

/**
 * Gestiona la selección de una fila en la tabla de resultados de clientes.
 * @param {Event} e - El evento de clic.
 */
function handleRowSelection(e) {
    const clickedRow = e.target.closest('tr');
    if (!clickedRow?.dataset.subscriberKey) return;

    if (selectedCustomerRow) selectedCustomerRow.classList.remove('selected');
    clickedRow.classList.add('selected');
    selectedCustomerRow = clickedRow;
    
    selectedSubscriberData = { 
        subscriberKey: clickedRow.dataset.subscriberKey, 
        isSubscriber: clickedRow.dataset.isSubscriber === 'true' 
    };
    
    // Siempre que hay una clave (SubscriberKey o ContactKey), podemos buscar en DEs y Journeys.
    elements.getCustomerJourneysBtn.disabled = false;
    elements.selectTablesBtn.disabled = false;
    
    // Ocultar resultados anteriores al seleccionar un nuevo cliente
    elements.customerJourneysResultsBlock.classList.add('hidden');
    elements.customerDesResultsBlock.classList.add('hidden'); // Oculta resultados de DEs
    elements.deSelectionBlock.classList.add('hidden');     // Oculta el selector de DEs
    elements.ejectCustomerFromJourneysBtn.disabled = true;
}

/**
 * Gestiona la selección y deselección de filas en la tabla de journeys.
 * @param {Event} e - El evento de clic.
 */
function handleJourneyRowSelection(e) {
    const clickedRow = e.target.closest('tr');
    if (!clickedRow?.dataset.definitionKey) return;
    
    clickedRow.classList.toggle('selected');
    updateEjectButtonState();
}

/**
 * Orquesta el proceso de expulsión del cliente de los journeys seleccionados.
 */
async function ejectCustomer() {
    const selectedRows = document.querySelectorAll('#customer-journeys-table tbody tr.selected');
    if (selectedRows.length === 0 || !selectedSubscriberData?.subscriberKey) return;

    const definitionKeys = Array.from(selectedRows).map(row => row.dataset.definitionKey);
    const contactKey = selectedSubscriberData.subscriberKey;

    const confirmation = await ui.showCustomConfirm(
        `¿Estás seguro de que quieres expulsar al cliente con ContactKey "${contactKey}" de ${selectedRows.length} journey(s) seleccionados?`
    );

    if (!confirmation) return;

    ui.blockUI("Expulsando cliente de los Journeys...");
    logger.startLogBuffering();

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        logger.logMessage(`Iniciando expulsión de ${contactKey} de ${definitionKeys.length} journey(s).`);
        const result = await mcApiService.ejectContactFromJourneys(contactKey, definitionKeys, apiConfig);
        
        const errors = result.errors || [];
        const successCount = definitionKeys.length - errors.length;

        let summary = `Proceso de expulsión completado.\nÉxitos: ${successCount}`;
        if (errors.length > 0) {
            summary += `\nFallos: ${errors.length}\n\nDetalles:\n`;
            errors.forEach(err => {
                summary += `- Contacto ${err.contactKey}: ${err.message || 'Error desconocido'}\n`;
            });
            logger.logMessage(`Fallos en la expulsión: ${JSON.stringify(errors)}`);
        }
        
        ui.showCustomAlert(summary);
        logger.logMessage(summary);
        
        // Refrescar la tabla para mostrar que el cliente ya no está en esos journeys
        await getCustomerJourneys();

    } catch (error) {
        logger.logMessage(`Error fatal durante la expulsión: ${error.message}`);
        ui.showCustomAlert(`Error al expulsar: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

// --- 5. RENDERIZADO Y HELPERS ---

function renderCustomerSearchResults() {
    elements.customerSearchTbody.innerHTML = '';
    
    const headers = [
        { label: 'Subscriber Key', key: 'subscriberKey' },
        { label: 'Email', key: 'emailAddress' },
        { label: 'Estado', key: 'status' },
        { label: 'Fecha Creación', key: 'createdDate' },
        { label: 'Fecha Baja', key: 'unsubscribedDate' },
        { label: 'Es Suscriptor', key: 'isSubscriber' }
    ];

    const thead = elements.customerSearchTbody.parentElement.querySelector('thead');
    thead.innerHTML = `<tr>${headers.map(h => `<th class="sortable-header" data-column="${h.key}">${h.label}</th>`).join('')}</tr>`;

    const sortedRows = sortData(customerResultsState.allRows, customerResultsState.sortColumn, customerResultsState.sortDirection);
    
    if (!sortedRows || sortedRows.length === 0) {
        elements.customerSearchTbody.innerHTML = '<tr><td colspan="6">No se encontraron clientes con ese criterio.</td></tr>';
        return;
    }

    sortedRows.forEach((sub, index) => {
        const row = document.createElement('tr');
        row.dataset.subscriberKey = sub.subscriberKey;
        row.dataset.isSubscriber = sub.isSubscriber;
        row.innerHTML = `
            <td>${sub.subscriberKey}</td><td>${sub.emailAddress}</td><td>${sub.status}</td>
            <td>${sub.createdDate}</td><td>${sub.unsubscribedDate}</td>
            <td>${sub.isSubscriber ? 'Sí' : 'No'}</td>`;
        elements.customerSearchTbody.appendChild(row);
        
        if (sortedRows.length === 1 && index === 0) {
            row.click();
        }
    });
    
    updateSortIndicators(elements.customerSearchTbody.parentElement, customerResultsState);
}

function renderCustomerJourneysTable(journeys) {
    elements.customerJourneysTbody.innerHTML = '';

    // Deshabilitamos el botón cada vez que se renderiza la tabla, hasta que se seleccione algo
    updateEjectButtonState();

    if (!journeys || journeys.length === 0) {
        elements.customerJourneysTbody.innerHTML = '<tr><td colspan="6">Este contacto no se encuentra en ningún Journey activo.</td></tr>';
        return;
    }
    journeys.forEach(journey => {
        const row = document.createElement('tr');

        row.dataset.definitionKey = journey.key;
        
        row.innerHTML = `
            <td>${journey.name || '---'}</td><td>${journey.id || '---'}</td>
            <td>${journey.key || '---'}</td><td>${journey.version || '---'}</td>
            <td>${new Date(journey.createdDate).toLocaleString()}</td>
            <td>${new Date(journey.modifiedDate).toLocaleString()}</td>`;
        elements.customerJourneysTbody.appendChild(row);
    });
}

function createResultBlock(title, deKey) {
    const resultBlock = document.createElement('div');
    resultBlock.className = 'sends-dataview-block'; // Puedes renombrar esta clase si quieres
    resultBlock.dataset.deKey = deKey; // Importante para identificar el bloque
    resultBlock.innerHTML = `
        <h4>${title} <small>(${deKey})</small></h4>
        <div class="table-container">
            <table><thead></thead><tbody></tbody></table>
        </div>
        <div class="pagination-controls hidden">
            <button class="action-button pagination-arrow" data-action="prev">&laquo;</button>
            <input type="number" class="page-input" min="1">
            <span class="total-pages-span">/ 1</span>
            <button class="action-button pagination-arrow" data-action="next">&raquo;</button>
        </div>`;
    return resultBlock;
}

function renderDEPage(deKey, pageNum) {
    const state = dePaginationStates.get(deKey);
    if (!state) return;

    const block = elements.desResultsContainer.querySelector(`[data-de-key="${deKey}"]`);
    if (!block) return;

    const sortedRows = sortData(state.allRows, state.sortColumn, state.sortDirection);
    const totalPages = Math.ceil(sortedRows.length / DE_ITEMS_PER_PAGE);
    pageNum = Math.max(1, Math.min(pageNum, totalPages));
    state.currentPage = pageNum;

    const startIndex = (pageNum - 1) * DE_ITEMS_PER_PAGE;
    const paginatedRows = sortedRows.slice(startIndex, startIndex + DE_ITEMS_PER_PAGE);

    const table = block.querySelector('table');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    
    const headers = Object.keys(state.allRows[0] || {});
    thead.innerHTML = `<tr>${headers.map(h => `<th class="sortable-header" data-column="${h}">${h}</th>`).join('')}</tr>`;
    tbody.innerHTML = paginatedRows.map(item => `<tr>${headers.map(h => `<td>${item[h] || '---'}</td>`).join('')}</tr>`).join('');
    
    updateSortIndicators(table, state);
    updateDEPaginationUI(block, pageNum, totalPages);
}

/**
 * Actualiza el estado (habilitado/deshabilitado) del botón de expulsión.
 */
function updateEjectButtonState() {
    const selectedCount = document.querySelectorAll('#customer-journeys-table tbody tr.selected').length;
    elements.ejectCustomerFromJourneysBtn.disabled = selectedCount === 0;
}

/**
 * Ordena un array de objetos por una clave específica.
 */
function sortData(data, column, direction) {
    if (!column) return [...data];
    const sortedData = [...data];
    const dir = direction === 'asc' ? 1 : -1;
    sortedData.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        if (valA == null) return 1;
        if (valB == null) return -1;
        // Asumimos que los nombres de campo que contienen 'date' son fechas
        if (typeof column === 'string' && column.toLowerCase().includes('date')) {
            return (new Date(valA) - new Date(valB)) * dir;
        }
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    });
    return sortedData;
}

/**
 * Actualiza los indicadores visuales (flechas) en las cabeceras de una tabla.
 */
function updateSortIndicators(tableElement, state) {
    tableElement.querySelectorAll('.sortable-header').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.column === state.sortColumn) {
            th.classList.add(state.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

/**
 * Actualiza la UI de los controles de paginación para una tabla de DE.
 */
function updateDEPaginationUI(block, pageNum, totalPages) {
    const paginationControls = block.querySelector('.pagination-controls');
    if (totalPages > 1) {
        paginationControls.classList.remove('hidden');
        const pageInput = paginationControls.querySelector('.page-input');
        pageInput.value = pageNum;
        pageInput.max = totalPages;
        paginationControls.querySelector('.total-pages-span').textContent = `/ ${totalPages}`;
        paginationControls.querySelector('[data-action="prev"]').disabled = (pageNum === 1);
        paginationControls.querySelector('[data-action="next"]').disabled = (pageNum === totalPages);
    } else {
        paginationControls.classList.add('hidden');
    }
}

function handleSortClick(e) {
    const header = e.target.closest('.sortable-header');
    const columnKey = header.dataset.column;
    const table = header.closest('table');

    if (table.id === 'customer-search-table') {
        if (customerResultsState.sortColumn === columnKey) {
            customerResultsState.sortDirection = customerResultsState.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            customerResultsState.sortColumn = columnKey;
            customerResultsState.sortDirection = 'asc';
        }
        renderCustomerSearchResults();
    } else {
        const block = table.closest('[data-de-key]');
        if (!block) return;
        const deKey = block.dataset.deKey;
        const state = dePaginationStates.get(deKey);
        if (!state) return;
        if (state.sortColumn === columnKey) {
            state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortColumn = columnKey;
            state.sortDirection = 'asc';
        }
        renderDEPage(deKey, state.currentPage);
    }
}

function handlePaginationClick(e) {
    const button = e.target.closest('.pagination-arrow');
    const block = button.closest('[data-de-key]');
    const deKey = block.dataset.deKey;
    const state = dePaginationStates.get(deKey);
    let newPage = state.currentPage;
    if (button.dataset.action === 'prev') newPage--;
    if (button.dataset.action === 'next') newPage++;
    renderDEPage(deKey, newPage);
}

function handlePageInputChange(e) {
    const input = e.target.closest('.page-input');
    const block = input.closest('[data-de-key]');
    const deKey = block.dataset.deKey;
    const newPage = parseInt(input.value, 10);
    renderDEPage(deKey, newPage);
}

function handleSelectAllDEs(e) {
    elements.deSelectionTable.querySelectorAll('tbody input[type="checkbox"]').forEach(cb => {
        cb.checked = e.target.checked;
    });
}