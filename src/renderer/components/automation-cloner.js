// Fichero: src/renderer/components/automation-cloner.js
// Descripción: Módulo para la vista de clonación selectiva de un automatismo.
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO DEL MÓDULO ---
let getAuthenticatedConfig;
let currentAutomationDetails = null;

// Mapa de configuración para tipos de actividad clonables.
const CLONABLE_ACTIVITY_TYPES = new Set([
    300 // Query Activity
    // Futuro: Añadir más IDs aquí, como 423 para Script, etc.
]);

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
                    const isClonable = CLONABLE_ACTIVITY_TYPES.has(activity.objectTypeId);
                    
                    activity.isClonable = isClonable;
                    activity.selected = isClonable; // Seleccionado por defecto SÓLO si es clonable
                    activity.newActivityName = `${activity.name}_Copy`;

                    const isQueryActivity = activity.objectTypeId === 300;
                    if (isQueryActivity && activity.targetDataExtensions && activity.targetDataExtensions.length > 0) {
                        activity.newDeName = `${activity.targetDataExtensions[0].name}_Copy`;
                    } else {
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
    const newAutomationName = elements.automationClonerDestName.textContent.trim();
    if (!newAutomationName) {
        ui.showCustomAlert("El nombre del automatismo de destino no puede estar vacío.");
        return;
    }

    const activitiesToClone = currentAutomationDetails.steps.flatMap(step => 
        step.activities ? step.activities.map(activity => ({ ...activity, originalStep: step.step })) : []
    ).filter(activity => activity.isClonable && activity.selected);

    if (activitiesToClone.length === 0) {
        ui.showCustomAlert("No has seleccionado ninguna actividad clonable.");
        return;
    }

    if (!await ui.showCustomConfirm(`Se creará el automatismo "${newAutomationName}" y se clonarán ${activitiesToClone.length} actividades. ¿Continuar?`)) {
        return;
    }

    ui.blockUI("Iniciando proceso de clonación masiva...");
    logger.startLogBuffering();
    const newActivityIdMap = new Map();

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        // --- FASE 1: Clonar todas las actividades y sus dependencias ---
        logger.logMessage(`--- FASE 1: Clonando ${activitiesToClone.length} actividades ---`);
        for (const activity of activitiesToClone) {
            ui.blockUI(`Clonando actividad "${activity.name}"...`);
            if (activity.objectTypeId === 300) { // Es una Query
                try {
                    logger.logMessage(`Procesando Query: "${activity.name}"`);
                    if (!activity.targetDataExtensions || activity.targetDataExtensions.length === 0) throw new Error("La Query de origen no tiene DE de destino.");
                    
                    const originalDEKey = activity.targetDataExtensions[0].key;
                    const originalDEName = activity.targetDataExtensions[0].name;

                    // Obtener detalles de la DE original para conseguir su CategoryID ----
                    logger.logMessage(`  - Obteniendo detalles de la DE original: "${originalDEName}"`);
                    const originalDeDetails = await mcApiService.getDataExtensionDetailsByName(originalDEName, apiConfig);
                    if (!originalDeDetails || !originalDeDetails.categoryId) throw new Error(`No se pudo encontrar la carpeta de la DE original "${originalDEName}".`);

                    // 1. Clonar la Data Extension, pasando el CategoryID correcto
                    const clonedDE = await mcApiService.cloneDataExtension(originalDEKey, activity.newDeName, "", originalDeDetails.categoryId, apiConfig);
                    logger.logMessage(`  - DE clonada: "${clonedDE.name}" en la carpeta ID: ${originalDeDetails.categoryId}`);

                    // 2. Obtener detalles de la Query original
                    const originalQueryDetails  = await mcApiService.fetchQueryDefinitionDetails(activity.activityObjectId, apiConfig);

                    // Pasar el CategoryID de la actividad original a la nueva query ----
                    // El objeto 'activity' ya tiene el categoryId de la carpeta donde vive la query.
                    if (!originalQueryDetails.categoryId) throw new Error("La actividad de Query original no tiene un ID de carpeta asociado.");
                    console.log(originalQueryDetails);
                    // 3. Crear la nueva Query
                    const newQuery = await mcApiService.createClonedQuery(originalQueryDetails , clonedDE, activity.newActivityName, originalQueryDetails.categoryId, apiConfig);
                    logger.logMessage(`  - Query clonada: "${newQuery.name}" en la carpeta ID: ${activity.categoryId}`);

                    // 4. Guardar el mapeo de IDs
                    newActivityIdMap.set(activity.id, newQuery.objectID);

                } catch (error) {
                    throw new Error(`Fallo al clonar la Query "${activity.name}": ${error.message}`);
                }
            }
        }

        // --- FASE 2: Construir y crear el nuevo automatismo ---
        logger.logMessage("--- FASE 2: Construyendo el nuevo automatismo ---");
        ui.blockUI("Construyendo el automatismo final...");

        const groupedByStep = activitiesToClone.reduce((acc, activity) => {
            if (newActivityIdMap.has(activity.id)) {
                if (!acc[activity.originalStep]) acc[activity.originalStep] = [];
                acc[activity.originalStep].push(activity);
            }
            return acc;
        }, {});

        let newStepNumber = 0;
        const newStepsPayload = Object.keys(groupedByStep).sort((a, b) => a - b).map(originalStep => {
            const activitiesInStep = groupedByStep[originalStep].map(activity => ({
                name: activity.newActivityName,
                objectTypeId: activity.objectTypeId,
                displayOrder: activity.displayOrder,
                activityObjectId: newActivityIdMap.get(activity.id)
            }));
            return { stepNumber: newStepNumber++, activities: activitiesInStep };
        });
        
        const payload = {
            name: newAutomationName,
            description: currentAutomationDetails.description || "",
            categoryId: currentAutomationDetails.categoryId,
            key: "",
            steps: newStepsPayload,
            startSource: null
        };

        // Comprobamos si el automatismo original es de tipo "Scheduled" (typeId: 1)
        if (currentAutomationDetails.typeId === 1) {
            
            // CASO 1: La programación existe y es válida. La copiamos.
            if (currentAutomationDetails.schedule && currentAutomationDetails.schedule.icalRecur) {
                logger.logMessage("El automatismo de origen tiene una programación válida. Se copiará.");
                payload.startSource = {
                    typeId: 1,
                    schedule: {
                        icalRecur: currentAutomationDetails.schedule.icalRecur,
                        startDate: currentAutomationDetails.schedule.startDate,
                        timezoneId: currentAutomationDetails.schedule.timezoneId
                    }
                };
            } else {
                // CASO 2: Es de tipo "Scheduled" pero no tiene programación (está en borrador o inactivo).
                // Creamos una programación por defecto para evitar el error de la API.
                logger.logMessage("ADVERTENCIA: El automatismo de origen no tiene programación. Se creará una programación diaria por defecto (hasta 2075).");

                const today = new Date();
                const startDateISO = today.toISOString(); // Formato: YYYY-MM-DDTHH:mm:ss.sssZ
                
                payload.startSource = {
                    typeId: 1,
                    schedule: {
                        // Programación diaria que termina en 2075.
                        icalRecur: "FREQ=DAILY;UNTIL=20750101T000000", 
                        startDate: startDateISO,
                        // Usamos un timezone por defecto. 7 = Romance Standard Time 
                        // Es una suposición razonable si no tenemos otra información.
                        timezoneId: 7 
                    }
                };
            }
        } else {
            // CASO 3: El automatismo original NO es de tipo "Scheduled" (ej. File Drop).
            // Por ahora, lo creamos sin fuente de inicio. Quedará en estado "Borrador".
            logger.logMessage(`El automatismo de origen es de tipo '${currentAutomationDetails.type}'. El clon se creará sin una fuente de inicio.`);
            // payload.startSource ya es null, así que no hacemos nada.
        }

        logger.logMessage("Payload final del automatismo:");
        logger.logApiCall(payload);

        const newAutomation = await mcApiService.createAutomation(payload, apiConfig);
        logger.logApiResponse(newAutomation);

        ui.showCustomAlert(`¡Éxito! El automatismo "${newAutomation.name}" y sus ${activitiesToClone.length} actividades han sido clonados.`);
        goBackFunction();

    } catch (error) {
        logger.logMessage(`ERROR FATAL en el proceso de clonación: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
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
            
            const deNameCellHtml = isQuery
                ? `<td contenteditable="true" data-type="de-name">${activity.newDeName}</td>`
                : `<td style="color: #6c757d; font-style: italic;">${activity.newDeName}</td>`;

            // Añadimos el atributo 'disabled' al checkbox si la actividad no es clonable
            const checkboxHtml = `<input type="checkbox" class="activity-checkbox" ${activity.selected ? 'checked' : ''} ${!activity.isClonable ? 'disabled' : ''}>`;

            return `
                <tr data-step-index="${stepIndex}" data-activity-index="${activityIndex}">
                    <td>${checkboxHtml}</td>
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