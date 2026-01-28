// Fichero: src/renderer/components/query-text-finder.js
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

let getAuthenticatedConfig;

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    elements.searchQueriesByTextBtn.addEventListener('click', searchQueriesByText);
    
    // Delegación de eventos para abrir enlaces externos
    elements.querySearchResultsTbody.addEventListener('click', ui.handleExternalLink);

    elements.showQueryTextCheckbox.addEventListener('change', () => {
        const isChecked = elements.showQueryTextCheckbox.checked;
        const displayStyle = isChecked ? '' : 'none';
        const table = elements.querySearchResultsTable;
        table.querySelectorAll('thead th:nth-child(4), tbody td:nth-child(4)').forEach(cell => {
            cell.style.display = displayStyle;
        });
    });
}

// Mantenemos la función para evitar errores de app.js
export function updateOrgInfo(orgInfo) {}

async function searchQueriesByText() {
    ui.blockUI("Buscando en Queries y analizando automatismos...");
    logger.startLogBuffering();
    elements.querySearchResultsTbody.innerHTML = '<tr><td colspan="4">Buscando...</td></tr>';
    
    try {
        const apiConfig = await getAuthenticatedConfig();
        if (!apiConfig || !apiConfig.soapUri) throw new Error("Configuración de API incompleta.");

        mcApiService.setLogger(logger);

        const searchText = elements.querySearchText.value.trim();
        if (!searchText) throw new Error("El campo 'Texto a buscar' no puede estar vacío.");

        logger.logMessage(`Buscando queries con el texto: "${searchText}"`);

        // 1. Buscamos las actividades de Query
        const queriesFound = await mcApiService.searchQueriesBySimpleFilter({
            property: 'QueryText',
            simpleOperator: 'like',
            value: searchText
        }, apiConfig);

        if (!queriesFound || queriesFound.length === 0) {
            elements.querySearchResultsTbody.innerHTML = '<tr><td colspan="4">No se encontraron queries con ese texto.</td></tr>';
            return;
        }

        // 2. ENRIQUECIMIENTO: Buscamos la ubicación usando la función tal cual está en el service
        logger.logMessage(`Encontradas ${queriesFound.length} queries. Analizando ubicación...`);
        
        const enrichedQueries = await Promise.all(queriesFound.map(async (query) => {
            try {
                // Sacamos el ID (ObjectID es el que suele usar Automation Studio)
                const activityId = query.objectID || query.ObjectID || query.id || query.ID;
                
                if (activityId) {
                    // LLAMADA CORREGIDA: Solo 2 parámetros como pide tu mc-api-service.js
                    const autoInfo = await mcApiService.findAutomationForActivity(activityId, apiConfig);
                    query.automations = autoInfo || [];
                }
            } catch (e) {
                console.warn(`No se pudo encontrar automatismo para: ${query.name}`);
                query.automations = [];
            }
            return query;
        }));

        renderTable(enrichedQueries);
        logger.logMessage(`Búsqueda y análisis de ubicación completado.`);

    } catch (error) {
        logger.logMessage(`Error: ${error.message}`);
        elements.querySearchResultsTbody.innerHTML = `<tr><td colspan="4" style="color: red;">Error: ${error.message}</td></tr>`;
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

function renderTable(queries) {
    elements.querySearchResultsTbody.innerHTML = '';
    const showQuery = elements.showQueryTextCheckbox.checked;
    const displayStyle = showQuery ? '' : 'none';
    
    // Sincronizar cabecera
    const header = elements.querySearchResultsTable.querySelector('thead th:nth-child(4)');
    if (header) header.style.display = displayStyle;

    queries.forEach(query => {
        const row = document.createElement('tr');
        
        // Link dinámico
        const mid = elements.businessUnitInput.value;
        const stack = elements.stackKeyInput.value.toLowerCase().replace('s', '').replace('tack', '');
        const objId = query.objectID || query.ObjectID || '';
        const queryLink = `https://mc.s${stack}.exacttarget.com/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23ActivityDetails/300/${objId}`;

        // Nombres y Pasos (Mismo sistema que Origen de Datos)
        const autoNames = (query.automations && query.automations.length > 0)
            ? query.automations.map(a => a.automationName || 'N/A').join('<br>')
            : '---';

        const autoSteps = (query.automations && query.automations.length > 0)
            ? query.automations.map(a => a.step || '---').join('<br>')
            : '---';

        row.innerHTML = `
            <td><a href="${queryLink}" class="external-link" title="Abrir en MC">${query.name}</a></td>
            <td>${autoNames}</td>
            <td>${autoSteps}</td>
            <td style="white-space: pre-wrap; word-break: break-all; display: ${displayStyle};">${query.description || query.queryText || ''}</td>
        `;
        elements.querySearchResultsTbody.appendChild(row);
    });
}