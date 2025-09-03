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

// --- 2. FUNCIONES PÚBLICAS ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.searchCustomerBtn.addEventListener('click', searchCustomer);
    elements.getDEsBtn.addEventListener('click', getCustomerDEs);
    elements.getCustomerJourneysBtn.addEventListener('click', getCustomerJourneys);
    elements.customerSearchTbody.addEventListener('click', handleRowSelection);
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
    ui.blockUI("Buscando cliente...");
    logger.startLogBuffering();
    
    // Resetear estado y UI
    if (selectedCustomerRow) selectedCustomerRow.classList.remove('selected');
    selectedCustomerRow = null;
    selectedSubscriberData = null;
    elements.getDEsBtn.disabled = true;
    elements.getCustomerJourneysBtn.disabled = true;
    elements.customerJourneysResultsBlock.classList.add('hidden');
    elements.customerSendsResultsBlock.classList.add('hidden');
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

        renderCustomerSearchResults(finalResults);
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

/**
 * Obtiene los datos del cliente en las Data Extensions configuradas.
 */
async function getCustomerDEs() {
    if (!selectedSubscriberData?.subscriberKey) return;
    
    ui.blockUI("Buscando en Data Extensions...");
    logger.startLogBuffering();
    
    elements.customerSendsResultsBlock.classList.remove('hidden');
    elements.sendsResultsContainer.innerHTML = '';

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger); 
        const searchValue = selectedSubscriberData.subscriberKey;
        const configs = currentClientConfig?.dvConfigs?.filter(c => c.deKey && c.field) || [];

        if (configs.length === 0) {
            elements.sendsResultsContainer.innerHTML = '<p>No hay Data Extensions configuradas para la búsqueda.</p>';
            return; 
        }
        
        logger.logMessage(`Iniciando búsqueda para '${searchValue}' en ${configs.length} DE(s) configurada(s).`);

        for (const config of configs) {
            const resultBlock = createResultBlock(config.title, config.deKey);
            elements.sendsResultsContainer.appendChild(resultBlock);
            const tableContainer = resultBlock.querySelector('.table-container');

            try {
                logger.logMessage(`-> Consultando DE: ${config.deKey} en el campo "${config.field}"...`);
                const items = await mcApiService.searchDataExtensionRows(config.deKey, config.field, searchValue, apiConfig);
                renderDETable(tableContainer, items);
            } catch (error) {
                logger.logMessage(`-> Error consultando ${config.deKey}: ${error.message}`);
                tableContainer.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
            }
        }
        logger.logMessage("Búsqueda en Data Extensions completada.");
    } catch (error) {
        logger.logMessage(`Error fatal durante la búsqueda en DEs: ${error.message}`);
        elements.sendsResultsContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
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
    elements.getDEsBtn.disabled = false;
    
    // Ocultar resultados anteriores al seleccionar un nuevo cliente
    elements.customerJourneysResultsBlock.classList.add('hidden');
    elements.customerSendsResultsBlock.classList.add('hidden');
}

// --- 5. RENDERIZADO Y HELPERS ---

function renderCustomerSearchResults(results) {
    elements.customerSearchTbody.innerHTML = '';
    if (!results || results.length === 0) {
        elements.customerSearchTbody.innerHTML = '<tr><td colspan="6">No se encontraron clientes con ese criterio.</td></tr>';
        return;
    }
    results.forEach((sub, index) => {
        const row = document.createElement('tr');
        row.dataset.subscriberKey = sub.subscriberKey;
        row.dataset.isSubscriber = sub.isSubscriber;
        row.innerHTML = `
            <td>${sub.subscriberKey}</td><td>${sub.emailAddress}</td><td>${sub.status}</td>
            <td>${sub.createdDate}</td><td>${sub.unsubscribedDate}</td>
            <td>${sub.isSubscriber ? 'Sí' : 'No'}</td>`;
        elements.customerSearchTbody.appendChild(row);
        
        // Auto-seleccionar si solo hay un resultado
        if (results.length === 1 && index === 0) {
            row.click();
        }
    });
}

function renderCustomerJourneysTable(journeys) {
    elements.customerJourneysTbody.innerHTML = '';
    if (!journeys || journeys.length === 0) {
        elements.customerJourneysTbody.innerHTML = '<tr><td colspan="6">Este contacto no se encuentra en ningún Journey activo.</td></tr>';
        return;
    }
    journeys.forEach(journey => {
        const row = document.createElement('tr');
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
    resultBlock.className = 'sends-dataview-block';
    resultBlock.innerHTML = `
        <h4>${title} <small>(${deKey})</small></h4>
        <div class="table-container"><p>Buscando...</p></div>`;
    return resultBlock;
}

function renderDETable(container, items) {
    if (!items || items.length === 0) {
        container.innerHTML = '<p>No se encontraron registros en esta Data Extension.</p>';
        return;
    }
    const headers = Object.keys(items[0].values);
    const table = document.createElement('table');
    const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    const tbodyRows = items.map(item => `<tr>${headers.map(h => `<td>${item.values[h] || '---'}</td>`).join('')}</tr>`).join('');
    table.innerHTML = `${thead}<tbody>${tbodyRows}</tbody>`;
    container.innerHTML = '';
    container.appendChild(table);
}