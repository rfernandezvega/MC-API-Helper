// Fichero: src/renderer/components/customer-finder.js
// Descripción: Módulo que encapsula toda la lógica del Buscador de Clientes.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import * as whatsappFinder from './whatsapp-finder.js';
import { escapeHtml, formatDate } from '../ui/format-utils.js';
import { createTableSorter, createPaginator } from '../ui/table-utils.js';
import { downloadCsv, buildCsvFileName } from '../ui/csv-export.js';

// --- 1. ESTADO DEL MÓDULO ---

let getAuthenticatedConfig; // Dependencia inyectada desde app.js
let currentClientConfig;    // Configuración del cliente activo (para las DEs de búsqueda)

let selectedCustomerRow = null;
let selectedSubscriberData = null;

const DE_ITEMS_PER_PAGE = 5;
// Mapa deKey → { allRows, sorter, paginator } de cada tabla de DE dinámica
let dePaginationStates = new Map();
// Datos de la tabla principal de clientes (su ordenación la gestiona customerSorter)
let customerResultsState = { allRows: [] };
// Controlador de ordenación de la tabla principal (se crea en init; como su thead se
// regenera en cada búsqueda, se re-engancha con attach(thead) tras cada render)
let customerSorter;
// Journeys pintados del cliente seleccionado (origen de su descarga en CSV)
let lastCustomerJourneys = [];

// --- 2. FUNCIONES PÚBLICAS ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.searchCustomerBtn.addEventListener('click', searchCustomer);
    ui.submitOnEnter(elements.customerSearchValue, elements.searchCustomerBtn);
    elements.selectTablesBtn.addEventListener('click', displayDESelection);
    elements.getCustomerJourneysBtn.addEventListener('click', getCustomerJourneys);
    elements.customerSearchTbody.addEventListener('click', handleRowSelection);
    elements.customerJourneysTbody.addEventListener('click', handleJourneyRowSelection);
    elements.ejectCustomerFromJourneysBtn.addEventListener('click', ejectCustomer);

    elements.selectAllDEsCheckbox.addEventListener('change', handleSelectAllDEs);
    elements.searchSelectedDEsBtn.addEventListener('click', startSelectedDESearch);

    elements.downloadCustomerSearchCsvBtn?.addEventListener('click', downloadCustomerResultsCsv);
    elements.downloadCustomerJourneysCsvBtn?.addEventListener('click', downloadCustomerJourneysCsv);
    // Cada bloque de DE se crea dinámicamente: su botón de descarga se atiende por delegación.
    elements.desResultsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.de-download-btn');
        if (btn) downloadDEResultsCsv(btn.dataset.deKey);
    });

    // Sorter de la tabla principal de clientes. La ordenación y paginación de las
    // tablas de DEs dinámicas se crean por bloque en startSelectedDESearch.
    customerSorter = createTableSorter({
        tableSelector: '#customer-search-table',
        types: { createdDate: 'date', unsubscribedDate: 'date' },
        onSort: renderCustomerSearchResults
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
    whatsappFinder.resetWhatsapp();
    elements.customerSearchTbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
    ui.setResultsCount(elements.customerSearchResultsTitle, null);

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

        // Búsqueda adicional en la Audiencia WhatsApp si el toggle está activo.
        if (whatsappFinder.isEnabled()) {
            logger.logMessage('Incluyendo búsqueda en la Audiencia WhatsApp...');
            await whatsappFinder.searchWhatsapp(value, apiConfig);
        }

    } catch (error) {
        logger.logMessage(`Error al buscar clientes: ${error.message}`);
        elements.customerSearchTbody.innerHTML = `<tr><td colspan="6" class="cf-error">Error: ${escapeHtml(error.message)}</td></tr>`;
        ui.setResultsCount(elements.customerSearchResultsTitle, null);
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
    ui.setResultsCount(elements.customerJourneysResultsTitle, null);

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
        elements.customerJourneysTbody.innerHTML = `<tr><td colspan="6" class="cf-error">Error: ${escapeHtml(error.message)}</td></tr>`;
        ui.setResultsCount(elements.customerJourneysResultsTitle, null);
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
            row.innerHTML = `<td><input type="checkbox" class="de-select-checkbox" value="${escapeHtml(config.deKey)}"></td><td>${escapeHtml(config.title)}</td>`;
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
                const allRows = items.map(item => item.values); // Guardamos solo los valores
                const deKey = config.deKey;

                // Los campos de la DE son dinámicos: tratamos como fecha los que
                // contengan 'date' en el nombre (mismo criterio que antes).
                const types = {};
                Object.keys(allRows[0] || {}).forEach(k => {
                    if (k.toLowerCase().includes('date')) types[k] = 'date';
                });

                // Un sorter y un paginador propios por tabla de DE. El thead se
                // regenera en cada render, por lo que se re-engancha con attach().
                const sorter = createTableSorter({
                    tableSelector: `[data-de-key="${deKey}"] table`,
                    types,
                    onSort: () => renderDEPage(deKey)
                });
                const paginator = createPaginator(
                    {
                        pageInput: resultBlock.querySelector('.page-input'),
                        totalLabel: resultBlock.querySelector('.total-pages-span'),
                        prevBtn: resultBlock.querySelector('[data-action="prev"]'),
                        nextBtn: resultBlock.querySelector('[data-action="next"]')
                    },
                    { itemsPerPage: DE_ITEMS_PER_PAGE, onPageChange: () => renderDEPage(deKey) }
                );

                dePaginationStates.set(deKey, { allRows, sorter, paginator });
                renderDEPage(deKey);
            } else {
                resultBlock.querySelector('.table-container').innerHTML = '<p>No se encontraron registros en esta Data Extension.</p>';
            }
        } catch (error) {
            logger.logMessage(`-> Error consultando ${config.deKey}: ${error.message}`);
            resultBlock.querySelector('.table-container').innerHTML = `<p class="cf-error">Error: ${escapeHtml(error.message)}</p>`;
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

// --- 5. DESCARGAS EN CSV ---

/** Descarga en CSV los clientes encontrados, respetando la ordenación de la tabla. */
function downloadCustomerResultsCsv() {
    const sortedRows = customerSorter.sort([...customerResultsState.allRows]);
    downloadCsv({
        headers: ['Subscriber Key', 'Email', 'Estado', 'Fecha Creación', 'Fecha Baja', 'Es Suscriptor'],
        rows: sortedRows.map(sub => [
            sub.subscriberKey, sub.emailAddress, sub.status,
            sub.createdDate, sub.unsubscribedDate, sub.isSubscriber ? 'Sí' : 'No'
        ]),
        fileName: buildCsvFileName('buscador_clientes')
    });
}

/** Descarga en CSV los journeys del cliente seleccionado. */
function downloadCustomerJourneysCsv() {
    downloadCsv({
        headers: ['Nombre del Journey', 'ID', 'Definition Key', 'Versión', 'Fecha Creación', 'Fecha Modificación'],
        rows: lastCustomerJourneys.map(j => [
            j.name, j.id, j.key, j.version,
            formatDate(j.createdDate), formatDate(j.modifiedDate)
        ]),
        fileName: buildCsvFileName('buscador_clientes_journeys')
    });
}

/**
 * Descarga en CSV los registros encontrados en una Data Extension concreta (todas las
 * páginas, no solo la visible) con las columnas propias de esa DE.
 * @param {string} deKey - External Key de la DE cuyo bloque de resultados se exporta.
 */
function downloadDEResultsCsv(deKey) {
    const state = dePaginationStates.get(deKey);
    if (!state) return;
    const sortedRows = state.sorter.sort([...state.allRows]);
    const headers = Object.keys(state.allRows[0] || {});
    downloadCsv({
        headers,
        rows: sortedRows.map(item => headers.map(h => item[h])),
        fileName: buildCsvFileName(`buscador_clientes_${deKey}`)
    });
}

// --- 6. RENDERIZADO Y HELPERS ---

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

    // El thead se regenera en cada búsqueda: los th llevan data-sort-by (lo que
    // espera el sorter) y se re-engancha el listener con attach(thead).
    const thead = elements.customerSearchTbody.parentElement.querySelector('thead');
    thead.innerHTML = `<tr>${headers.map(h => `<th class="sortable-header" data-sort-by="${h.key}">${h.label}</th>`).join('')}</tr>`;
    customerSorter.attach(thead);

    const sortedRows = customerSorter.sort([...customerResultsState.allRows]);

    if (elements.downloadCustomerSearchCsvBtn) {
        elements.downloadCustomerSearchCsvBtn.disabled = !sortedRows || sortedRows.length === 0;
    }
    ui.setResultsCount(elements.customerSearchResultsTitle, sortedRows ? sortedRows.length : 0);

    if (!sortedRows || sortedRows.length === 0) {
        elements.customerSearchTbody.innerHTML = '<tr><td colspan="6">No se encontraron clientes con ese criterio.</td></tr>';
        return;
    }

    sortedRows.forEach((sub, index) => {
        const row = document.createElement('tr');
        row.dataset.subscriberKey = sub.subscriberKey;
        row.dataset.isSubscriber = sub.isSubscriber;
        row.innerHTML = `
            <td>${escapeHtml(sub.subscriberKey)}</td><td>${escapeHtml(sub.emailAddress)}</td><td>${escapeHtml(sub.status)}</td>
            <td>${escapeHtml(sub.createdDate)}</td><td>${escapeHtml(sub.unsubscribedDate)}</td>
            <td>${sub.isSubscriber ? 'Sí' : 'No'}</td>`;
        elements.customerSearchTbody.appendChild(row);

        if (sortedRows.length === 1 && index === 0) {
            row.click();
        }
    });

    customerSorter.updateIndicators();
}

function renderCustomerJourneysTable(journeys) {
    elements.customerJourneysTbody.innerHTML = '';
    lastCustomerJourneys = journeys || [];
    if (elements.downloadCustomerJourneysCsvBtn) {
        elements.downloadCustomerJourneysCsvBtn.disabled = lastCustomerJourneys.length === 0;
    }
    ui.setResultsCount(elements.customerJourneysResultsTitle, lastCustomerJourneys.length);

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
            <td>${escapeHtml(journey.name) || '---'}</td><td>${escapeHtml(journey.id) || '---'}</td>
            <td>${escapeHtml(journey.key) || '---'}</td><td>${escapeHtml(journey.version) || '---'}</td>
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
        <div class="u-flex-between u-mb-10">
            <h4 class="u-m-0">${escapeHtml(title)} <small>(${escapeHtml(deKey)})</small></h4>
            <button class="action-button download-btn de-download-btn" data-de-key="${escapeHtml(deKey)}" disabled title="Descargar los registros en CSV">Descargar</button>
        </div>
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

function renderDEPage(deKey) {
    const state = dePaginationStates.get(deKey);
    if (!state) return;

    const block = elements.desResultsContainer.querySelector(`[data-de-key="${deKey}"]`);
    if (!block) return;

    const sortedRows = state.sorter.sort([...state.allRows]);
    const paginatedRows = state.paginator.paginate(sortedRows);

    const table = block.querySelector('table');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    // La cabecera se regenera con los campos de la DE: data-sort-by es lo que
    // espera el sorter, y attach() re-engancha el listener al thead nuevo.
    const headers = Object.keys(state.allRows[0] || {});
    thead.innerHTML = `<tr>${headers.map(h => `<th class="sortable-header" data-sort-by="${escapeHtml(h)}">${escapeHtml(h)}</th>`).join('')}</tr>`;
    state.sorter.attach(thead);
    tbody.innerHTML = paginatedRows.map(item => `<tr>${headers.map(h => `<td>${escapeHtml(item[h]) || '---'}</td>`).join('')}</tr>`).join('');

    state.sorter.updateIndicators();

    // La descarga exporta todos los registros de la DE, no solo la página visible.
    const downloadBtn = block.querySelector('.de-download-btn');
    if (downloadBtn) downloadBtn.disabled = sortedRows.length === 0;

    // Igual que antes: los controles de paginación solo se muestran si hay más de una página
    const totalPages = Math.ceil(sortedRows.length / DE_ITEMS_PER_PAGE) || 1;
    block.querySelector('.pagination-controls').classList.toggle('hidden', totalPages <= 1);
}

/**
 * Actualiza el estado (habilitado/deshabilitado) del botón de expulsión.
 */
function updateEjectButtonState() {
    const selectedCount = document.querySelectorAll('#customer-journeys-table tbody tr.selected').length;
    elements.ejectCustomerFromJourneysBtn.disabled = selectedCount === 0;
}

function handleSelectAllDEs(e) {
    elements.deSelectionTable.querySelectorAll('tbody input[type="checkbox"]').forEach(cb => {
        cb.checked = e.target.checked;
    });
}