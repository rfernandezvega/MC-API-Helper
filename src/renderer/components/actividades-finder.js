// Fichero: src/renderer/components/actividades-finder.js
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

let getAuthenticatedConfig;

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    elements.searchActivityBtn.addEventListener('click', searchActivityUsage);
    
    // Delegación de eventos para abrir los enlaces de los automatismos en el navegador
    elements.activityUsageTbody.addEventListener('click', ui.handleExternalLink);
}

async function searchActivityUsage() {
    const value = elements.activitySearchValue.value.trim();
    const selectedType = elements.activityTypeSelect.value; // Capturamos el tipo

    if (!value) return ui.showCustomAlert("Introduce un nombre o External Key.");

    ui.blockUI(`Buscando ${selectedType}...`);
    logger.startLogBuffering();
    
    // Reset de UI
    elements.activityUsageTbody.innerHTML = '';
    elements.activityInfoBlock.classList.add('hidden');
    elements.activityResultsBlock.classList.add('hidden');

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        // LLAMADA DIRIGIDA: Pasamos el tipo seleccionado
        logger.logMessage(`Buscando ${selectedType} con valor: "${value}"`);
        const activity = await mcApiService.searchActivityTargeted(selectedType, value, apiConfig);

        if (!activity) {
            ui.showCustomAlert(`No se encontró ningún ${selectedType} con ese nombre o clave.`);
            return;
        }

        // El resto sigue igual (buscar automatismos y pintar)
        const autoInfo = await mcApiService.findAutomationForActivity(activity, apiConfig);
        renderResults(activity, autoInfo);

    } catch (error) {
        logger.logMessage(`Error: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Rellena la ficha de detalles y la tabla de automatismos.
 */
function renderResults(activity, automations) {
    // A. Rellenar Ficha de Detalles
    elements.infoActivityName.textContent = activity.name || '---';
    elements.infoActivityType.textContent = activity.typeLabel || '---';
    elements.infoActivityKey.textContent = activity.customerKey || '---';
    
    // Mostramos el bloque de ficha
    elements.activityInfoBlock.classList.remove('hidden');

    // B. Rellenar Tabla de Automatismos
    elements.activityUsageTbody.innerHTML = '';
    
    if (!automations || automations.length === 0) {
        elements.activityUsageTbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding: 20px;"><i>Esta actividad no se encuentra en ninguna automatización.</i></td></tr>';
    } else {
        automations.forEach(auto => {
            const row = document.createElement('tr');
            
            // Construimos el enlace al automatismo (si tenemos info del stack)
            const mid = elements.businessUnitInput.value;
            const stack = elements.stackKeyInput.value.toLowerCase().replace('s', '').replace('tack', '');
            // Nota: Si findAutomationForActivity devolviera el ID del automatismo podrías poner el link exacto.
            // Por ahora, solo pintamos el nombre y el paso.
            
            row.innerHTML = `
                <td style="text-align: left; padding-left: 20px;">${auto.automationName}</td>
                <td>${auto.step}</td>
            `;
            elements.activityUsageTbody.appendChild(row);
        });
    }

    // Mostramos el bloque de la tabla
    elements.activityResultsBlock.classList.remove('hidden');
}