// src/renderer/components/automation-analyzer.js
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

let getAuthenticatedConfig;
let goBackFunction;

const activityTypeMap = {
    42: 'Email', 43: 'Import', 45: 'Group', 53: 'File Transfer', 73: 'Data Extract', 84: 'Report',
    300: 'SQL Query', 303: 'Filter', 423: 'SSJS Script', 425: 'ELT', 427: 'Build Audience', 467: 'Wait',
    724: 'Mobile List Refresh', 725: 'MobileConnect', 726: 'Mobile Import', 733: 'InteractionStudio',
    736: 'MobilePush', 749: 'IS Event', 756: 'IS Date Event', 771: 'SF Send', 783: 'GroupConnect',
    1010: 'Thunderhead', 1101: 'IS Decision', 1701: 'Einstein Rec', 1000: 'Verification',
};

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    goBackFunction = dependencies.goBack;
    elements.automationAnalyzerBackBtn.addEventListener('click', goBackFunction);
}

export async function view(automationDetails) {
    elements.analyzerAutomationNameTitle.textContent = automationDetails.name;
    elements.automationAnalyzerStepsContainer.innerHTML = '';
    
    try {
        await renderAnalysis(automationDetails);
    } catch (error) {
        ui.showCustomAlert(`Error en el análisis: ${error.message}`);
    } finally {
        ui.unblockUI();
    }
}

async function renderAnalysis(automation) {
    const apiConfig = await getAuthenticatedConfig();
    mcApiService.setLogger(logger);
    const container = elements.automationAnalyzerStepsContainer;

    for (const step of automation.steps || []) {
        const stepBlock = document.createElement('div');
        stepBlock.className = 'step-block';
        
        let rowsHtml = '';
        for (const act of step.activities || []) {
            const typeLabel = activityTypeMap[act.objectTypeId] || 'Otra';
            
            // Reutilizamos la lógica de búsqueda de impactos (reutilización)
            ui.blockUI(`Analizando: ${act.name}...`);
            const usages = await mcApiService.findAutomationForActivity(act.activityObjectId, apiConfig);
            
            // Filtramos el automatismo actual para ver dónde más se usa
            const otherUsages = usages.filter(u => u.automationName !== automation.name);
            
            let usageHtml = '<span style="color: #28a745;">✓ Solo en este automatismo</span>';
            if (otherUsages.length > 0) {
                const list = otherUsages.map(u => `<li>${u.automationName} (Paso: ${u.step})</li>`).join('');
                // Añadido: list-style: none y padding-left: 0
                usageHtml = `<span style="color: #dc3545; font-weight:bold;">⚠ Usado en ${otherUsages.length} más:</span><ul style="margin:5px 0; padding-left:0; font-size:0.85em; list-style:none;">${list}</ul>`;
            }

            rowsHtml += `
                <tr>
                    <td style="width:15%">${typeLabel}</td>
                    <td style="width:35%; font-weight:bold; text-align:left;">${act.name}</td>
                    <td style="width:50%; text-align:left;">${usageHtml}</td>
                </tr>`;
        }

        stepBlock.innerHTML = `
            <h4>Paso ${step.step}</h4>
            <div class="table-container">
                <table>
                    <thead>
                        <tr><th>Tipo</th><th>Nombre Actividad</th><th>Presencia en otros Automatismos</th></tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>`;
        container.appendChild(stepBlock);
    }
}