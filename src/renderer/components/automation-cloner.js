// Fichero: src/renderer/components/automation-cloner.js
// Descripción: Módulo para la vista de clonación selectiva de un automatismo.
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO DEL MÓDULO ---
let getAuthenticatedConfig;
let currentAutomationDetails = null;

const activityTypeMap = {
    771: 'Salesforce Send', 300: 'Query Activity', 73: 'Data Extract', 53: 'File Transfer',
    303: 'Filter Activity', 749: 'Fire Event', 43: 'Import File', 423: 'Script Activity',
    42: 'Guided Send', 467: 'Wait Activity', 1000: 'Verification Activity', 45: 'Refresh Group',
    425: 'Data Factory Utility', 725: 'Send SMS', 726: 'Import Mobile Contacts', 
    724: 'Refresh Mobile Filtered List', 783: 'Send GroupConnect', 84: 'Report Definition', 736: 'Send Push',
    952: 'Journey Event'
};

let goBackFunction;

// --- 2. FUNCIONES PÚBLICAS (API del Módulo) ---

/**
 * Punto de entrada principal para mostrar la vista.
 * @param {object} automationDetails - Los detalles completos del automatismo a clonar.
 */
export function view(automationDetails) {
    clearView();

    if (automationDetails && automationDetails.steps) {
        automationDetails.steps.forEach(step => {
            if (step.activities) {
                step.activities.forEach(activity => {
                    activity.selected = true;
                    activity.newActivityName = `${activity.name}_Copy`;

                    const isQueryActivity = activity.objectTypeId === 300;

                    // Aplicamos la nueva regla de negocio
                    if (isQueryActivity && activity.targetDataExtensions && activity.targetDataExtensions.length > 0) {
                        const originalDeName = activity.targetDataExtensions[0].name;
                        activity.newDeName = `${originalDeName}_Copy`;
                    } else if (isQueryActivity) {
                        // Es una Query sin DE de destino (caso raro)
                        activity.newDeName = '';
                    } else {
                        // Para cualquier otra actividad que NO sea Query
                        activity.newDeName = 'No aplica';
                    }
                });
            }
        });
    }

    currentAutomationDetails = automationDetails;
    render();
}

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    goBackFunction = dependencies.goBack;

    elements.automationClonerContinueBtn.addEventListener('click', () => {
        cloneAutomation();
    });

    // Nuevos listeners para la tabla de actividades
    const stepsContainer = elements.automationClonerStepsContainer;
    stepsContainer.addEventListener('input', handleActivityNameEdit);
    stepsContainer.addEventListener('click', handleActivitySelection);
}

// --- 2. FUNCIONES AUXILIARES ---

/**
 * Orquesta el proceso de clonación del esqueleto del automatismo.
 */
async function cloneAutomation() {
    const newName = elements.automationClonerDestName.textContent.trim();
    if (!newName) {
        ui.showCustomAlert("El nombre del automatismo de destino no puede estar vacío.");
        return;
    }

    if (!await ui.showCustomConfirm(`Se creará un nuevo automatismo llamado "${newName}" sin actividades. ¿Continuar?`)) {
        return;
    }

    ui.blockUI(`Creando automatismo "${newName}"...`);
    logger.startLogBuffering();

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        // 1. Construir el payload
        const payload = {
            name: newName,
            description: currentAutomationDetails.description || "",
            categoryId: currentAutomationDetails.categoryId,
            key: "", // La API generará una
            steps: [], // Array de pasos vacío, como se pidió
            startSource: null,
        };

        // 2. Construir el objeto startSource si el original es de tipo "scheduled"
        if (currentAutomationDetails.schedule && currentAutomationDetails.typeId === 1) {
            payload.startSource = {
                typeId: 1, // 1 = Scheduled
                schedule: {
                    icalRecur: currentAutomationDetails.schedule.icalRecur,
                    startDate: currentAutomationDetails.schedule.startDate,
                    timezoneId: currentAutomationDetails.schedule.timezoneId
                }
            };
        } else {
            // Para otros tipos como File Drop (typeId: 2), se necesitaría otra lógica.
            // Por ahora, si no es scheduled, no le ponemos schedule.
            logger.logMessage("El automatismo de origen no es de tipo 'Scheduled'. Se creará sin schedule.");
        }

        logger.logMessage("Creando automatismo con el siguiente payload:");
        logger.logApiCall(payload);

        const newAutomation = await mcApiService.createAutomation(payload, apiConfig);
        logger.logApiResponse(newAutomation);
        logger.logMessage(`Éxito. Nuevo automatismo creado con ID: ${newAutomation.id}`);
        
        ui.showCustomAlert(`Automatismo "${newName}" creado con éxito.`);
        
        // Volvemos a la lista de automatismos
        goBackFunction();

    } catch (error) {
        logger.logMessage(`ERROR al crear el automatismo: ${error.message}`);
        ui.showCustomAlert(`Error al crear el automatismo: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Gestiona la edición de los nombres de las actividades de destino.
 * @param {Event} e - El evento 'input'.
 */
function handleActivityNameEdit(e) {
    const cell = e.target.closest('td[contenteditable="true"]');
    if (!cell) return;

    const row = cell.closest('tr');
    const stepIndex = parseInt(row.dataset.stepIndex, 10);
    const activityIndex = parseInt(row.dataset.activityIndex, 10);
    const dataType = cell.dataset.type;
    const newValue = cell.textContent.trim();

    const activity = currentAutomationDetails.steps[stepIndex].activities[activityIndex];

    if (dataType === 'activity-name') {
        activity.newActivityName = newValue;
    } else if (dataType === 'de-name') {
        activity.newDeName = newValue;
    }
}

/**
 * Gestiona la selección/deselección de actividades.
 * @param {Event} e - El evento 'click'.
 */
function handleActivitySelection(e) {
    const target = e.target;
    if (target.type !== 'checkbox') return;

    const row = target.closest('tr');
    const stepIndex = parseInt(target.dataset.stepIndex || row?.dataset.stepIndex, 10);

    // Caso 1: Se hizo clic en el checkbox "Seleccionar todo" del paso
    if (target.classList.contains('select-all-step')) {
        const isChecked = target.checked;
        const activities = currentAutomationDetails.steps[stepIndex].activities;
        activities.forEach(activity => activity.selected = isChecked);
        
        // Sincronizar los checkboxes de las filas
        const stepBlock = target.closest('.step-block');
        stepBlock.querySelectorAll('.activity-checkbox').forEach(cb => cb.checked = isChecked);
    }
    // Caso 2: Se hizo clic en el checkbox de una actividad individual
    else if (target.classList.contains('activity-checkbox')) {
        const activityIndex = parseInt(row.dataset.activityIndex, 10);
        currentAutomationDetails.steps[stepIndex].activities[activityIndex].selected = target.checked;

        // Sincronizar el checkbox "Seleccionar todo" del paso
        const stepBlock = target.closest('.step-block');
        const allActivities = currentAutomationDetails.steps[stepIndex].activities;
        const areAllSelected = allActivities.every(activity => activity.selected);
        stepBlock.querySelector('.select-all-step').checked = areAllSelected;
    }
}

/**
 * Limpia la vista y resetea el estado.
 */
function clearView() {
    currentAutomationDetails = null;
    elements.automationClonerSourceName.textContent = 'Cargando...';
    elements.automationClonerDestName.textContent = ''; // Limpiamos la celda editable
    elements.automationClonerStepsContainer.innerHTML = '';
    elements.automationClonerContinueBtn.disabled = true; // Deshabilitamos por defecto
}

// --- 4. LÓGICA DE RENDERIZADO ---


/**
 * Pinta la información del automatismo en el DOM.
 */
function render() {
    if (!currentAutomationDetails) return;

    elements.automationClonerSourceName.textContent = currentAutomationDetails.name;
    elements.automationClonerDestName.textContent = `${currentAutomationDetails.name}_Copy`;
    elements.automationClonerContinueBtn.disabled = false;

    const stepsContainer = elements.automationClonerStepsContainer;
    stepsContainer.innerHTML = ''; 

    if (!currentAutomationDetails.steps || currentAutomationDetails.steps.length === 0) {
        stepsContainer.innerHTML = '<p>Este automatismo no tiene pasos configurados.</p>';
        return;
    }

    currentAutomationDetails.steps.forEach((step, stepIndex) => {
        const stepBlock = document.createElement('div');
        stepBlock.className = 'step-block';
        stepBlock.style.marginBottom = '20px';

        let activitiesTableHtml = '<p>Este paso no tiene actividades.</p>';

        if (step.activities && step.activities.length > 0) {
            const activityRows = step.activities.map((activity, activityIndex) => {
                const isQuery = activity.objectTypeId === 300;

                // Generamos la celda de la DE condicionalmente
                const deNameCellHtml = isQuery
                    ? `<td contenteditable="true" data-type="de-name">${activity.newDeName}</td>`
                    : `<td style="color: #6c757d; font-style: italic;">${activity.newDeName}</td>`;

                return `
                    <tr data-step-index="${stepIndex}" data-activity-index="${activityIndex}">
                        <td><input type="checkbox" class="activity-checkbox" ${activity.selected ? 'checked' : ''}></td>
                        <td>${activityTypeMap[activity.objectTypeId] || `Desconocido (${activity.objectTypeId})`}</td>
                        <td>${activity.name}</td>
                        <td contenteditable="true" data-type="activity-name">${activity.newActivityName}</td>
                        ${deNameCellHtml} 
                    </tr>`;
            }).join('');

            activitiesTableHtml = `
                <div class="table-container" style="max-height: 300px;">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 5%;"><input type="checkbox" class="select-all-step" data-step-index="${stepIndex}" title="Seleccionar/Deseleccionar todo" checked></th>
                                <th>Tipo</th>
                                <th>Nombre Origen</th>
                                <th>Nombre Destino (Editable)</th>
                                <th>Nombre DE Destino (Editable)</th>
                            </tr>
                        </thead>
                        <tbody>${activityRows}</tbody>
                    </table>
                </div>`;
        }
        
        stepBlock.innerHTML = `<h4>Paso ${step.step}</h4> ${activitiesTableHtml}`;
        stepsContainer.appendChild(stepBlock);
    });
}