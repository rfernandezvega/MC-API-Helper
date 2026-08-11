// Fichero: src/renderer/components/script-text-finder.js
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { buildAutomationUrl, linkCell } from '../ui/mc-links.js';
import { downloadCsv, buildCsvFileName } from '../ui/csv-export.js';

let getAuthenticatedConfig;

// Últimos scripts pintados: son el origen de la descarga en CSV.
let lastScripts = [];

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    if (elements.searchScriptsByTextBtn) {
        elements.searchScriptsByTextBtn.addEventListener('click', handleSearch);
    }
    ui.submitOnEnter(elements.scriptSearchText, elements.searchScriptsByTextBtn);
    elements.scriptSearchResultsTbody.addEventListener('click', ui.handleExternalLink);

    elements.downloadScriptSearchCsvBtn?.addEventListener('click', downloadResultsCsv);
}

/** Descarga en CSV los scripts encontrados con su ubicación en automatismos. */
function downloadResultsCsv() {
    downloadCsv({
        headers: ['Nombre del Script', 'Automatización', 'Paso'],
        rows: lastScripts.map(item => {
            const automations = item.automations || [];
            return [
                item.name || '',
                automations.map(a => a.automationName || 'N/A').join(' | '),
                automations.map(a => a.step || '').join(' | ')
            ];
        }),
        fileName: buildCsvFileName('buscador_texto_scripts')
    });
}

async function handleSearch() {
    const searchText = elements.scriptSearchText.value.trim();
    if (!searchText) return ui.showCustomAlert("Introduce el texto a buscar.");

    ui.blockUI("Buscando en Scripts y analizando automatismos...");
    logger.startLogBuffering();
    elements.scriptSearchResultsTbody.innerHTML = '<tr><td colspan="3">Analizando todos los scripts...</td></tr>';
    lastScripts = [];
    if (elements.downloadScriptSearchCsvBtn) elements.downloadScriptSearchCsvBtn.disabled = true;

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        // Cada búsqueda parte de cero para no reutilizar automatismos ya descargados.
        mcApiService.clearAutomationDetailsCache();

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
    lastScripts = results || [];
    if (elements.downloadScriptSearchCsvBtn) elements.downloadScriptSearchCsvBtn.disabled = lastScripts.length === 0;

    results.forEach(item => {
        const row = document.createElement('tr');
        
        // 1. Construir el enlace dinámico al Script
        const stack = elements.stackKeyInput.value.toLowerCase().replace('s', '').replace('tack', '');

        const scriptLink = `https://mc.s${stack}.exacttarget.com/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23ActivityModal/423/${item.objectID}`;

        // 2. Formatear los nombres de automatizaciones y pasos (lo que ya tenías)
        const autoNames = (item.automations && item.automations.length > 0)
            ? item.automations.map(a => linkCell(a.automationName || 'N/A', buildAutomationUrl(a.automationId))).join('<br>')
            : '---';

        const autoSteps = (item.automations && item.automations.length > 0)
            ? item.automations.map(a => a.step).join('<br>')
            : '---';

        // 3. Pintar la fila con el nombre como enlace externo
        row.innerHTML = `
            <td style="text-align: left; padding-left: 15px;">
                <a href="${scriptLink}" class="external-link" title="Abrir Script en Marketing Cloud">
                    ${item.name}
                </a>
            </td>
            <td>${autoNames}</td>
            <td>${autoSteps}</td>
        `;
        elements.scriptSearchResultsTbody.appendChild(row);
    });
}