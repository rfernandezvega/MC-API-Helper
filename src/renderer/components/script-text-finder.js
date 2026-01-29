// Fichero: src/renderer/components/script-text-finder.js
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

let getAuthenticatedConfig;

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    if (elements.searchScriptsByTextBtn) {
        elements.searchScriptsByTextBtn.addEventListener('click', handleSearch);
    }
}

async function handleSearch() {
    const searchText = elements.scriptSearchText.value.trim();
    if (!searchText) return ui.showCustomAlert("Introduce el texto a buscar.");

    ui.blockUI("Buscando en Scripts y analizando automatismos...");
    logger.startLogBuffering();
    elements.scriptSearchResultsTbody.innerHTML = '<tr><td colspan="3">Analizando todos los scripts...</td></tr>';

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        // 1. Buscamos los scripts que contienen el texto
        const scriptsFound = await mcApiService.searchScriptsByText(searchText, apiConfig);

        if (scriptsFound.length === 0) {
            elements.scriptSearchResultsTbody.innerHTML = '<tr><td colspan="3">No se encontró el texto en ningún script.</td></tr>';
            return;
        }

        // 2. Enriquecemos con la ubicación en automatismos
        const enrichedResults = await Promise.all(scriptsFound.map(async (script) => {
            // Pasamos el objeto completo para aprovechar la validación de GUID
            const autoInfo = await mcApiService.findAutomationForActivity(script, apiConfig);
            return { ...script, automations: autoInfo };
        }));

        renderTable(enrichedResults);

    } catch (error) {
        logger.logMessage(`Error: ${error.message}`);
        ui.showCustomAlert(error.message);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

function renderTable(results) {
    elements.scriptSearchResultsTbody.innerHTML = '';

    results.forEach(item => {
        const row = document.createElement('tr');
        
        const autoNames = (item.automations && item.automations.length > 0)
            ? item.automations.map(a => a.automationName).join('<br>')
            : '---';

        const autoSteps = (item.automations && item.automations.length > 0)
            ? item.automations.map(a => a.step).join('<br>')
            : '---';

        row.innerHTML = `
            <td style="text-align: left; padding-left: 15px;">${item.name}</td>
            <td>${autoNames}</td>
            <td>${autoSteps}</td>
        `;
        elements.scriptSearchResultsTbody.appendChild(row);
    });
}