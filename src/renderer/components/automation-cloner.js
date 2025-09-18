// =======================================================================================
// --- Fichero: src/renderer/components/automation-cloner.js ---
// --- Descripción: Módulo para la vista de clonación selectiva de un automatismo,
// ---              con selección granular de carpetas de destino.
// =======================================================================================

// --- 1. IMPORTACIÓN DE MÓDULOS ---
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 2. ESTADO DEL MÓDULO Y DEPENDENCIAS ---

// Dependencias inyectadas desde app.js para funciones globales.
let getAuthenticatedConfig;
let goBackFunction;

// Objeto de estado principal que almacena los detalles del automatismo y las selecciones del usuario.
let currentAutomationDetails = null;

// Mapa de IDs de tipos de actividad que son clonables. Ampliable en el futuro.
const CLONABLE_ACTIVITY_TYPES = new Set([300]); // 300 = Query Activity

// Mapa para traducir IDs de actividad a nombres legibles para la UI.
const activityTypeMap = {
    300: 'Query Activity', 423: 'Script Activity', 73: 'Data Extract', 53: 'File Transfer', 303: 'Filter Activity'
    // ...se pueden añadir más si se implementa su clonación...
};

// --- 3. FUNCIONES PÚBLICAS (API del Módulo) ---

/**
 * Punto de entrada principal para mostrar y configurar la vista de clonación.
 * Muestra un spinner mientras prepara los datos necesarios.
 * @param {object} automationDetails - Los detalles completos del automatismo a clonar.
 */
export async function view(automationDetails) {
    clearView();
    
    try {
        // Enriquece el objeto base con toda la información de carpetas necesaria.
        currentAutomationDetails = await enrichAutomationDetails(automationDetails);
        // Pinta la interfaz con los datos enriquecidos.
        render();
    } catch (error) {
        ui.showCustomAlert(`Error al preparar el clonador: ${error.message}`);
        goBackFunction(); // Vuelve a la vista anterior si falla la preparación.
    } finally {
        // La responsabilidad de ocultar el spinner se mantiene aquí,
        // ya que es el clonador quien sabe cuándo ha terminado su trabajo.
        ui.unblockUI();
    }
}

/**
 * Inicializa el módulo, configurando todos los listeners de eventos.
 * @param {object} dependencies - Objeto con dependencias externas (ej. goBack).
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    goBackFunction = dependencies.goBack;

     // Listener para actualizar el nombre del automatismo de destino en el estado.
    elements.automationClonerDestName.addEventListener('input', () => {
        if (currentAutomationDetails) {
            currentAutomationDetails.newAutomationName = elements.automationClonerDestName.value;
        }
    });

    // Listeners para la configuración general y los destinos por defecto
    elements.automationClonerContinueBtn.addEventListener('click', cloneAutomation);
    elements.changeAutomationFolderBtn.addEventListener('click', () => selectFolderFor('automation'));
    elements.changeDefaultQueryFolderBtn.addEventListener('click', () => selectFolderFor('defaultQuery'));
    elements.changeDefaultDEFolderBtn.addEventListener('click', () => selectFolderFor('defaultDE'));

    // Listeners delegados en el contenedor de pasos para manejar eventos de la tabla
    const stepsContainer = elements.automationClonerStepsContainer;
    stepsContainer.addEventListener('input', handleActivityNameEdit);
    stepsContainer.addEventListener('click', handleActivityTableClick);
}

// --- 4. LÓGICA DE PREPARACIÓN DE DATOS ---

/**
 * Toma el objeto base del automatismo y le añade las rutas de las carpetas originales
 * y establece los destinos iniciales para la clonación.
 * @param {object} baseDetails - Los detalles básicos del automatismo.
 * @returns {Promise<object>} El objeto de detalles enriquecido y listo para renderizar.
 */
async function enrichAutomationDetails(baseDetails) {
    const apiConfig = await getAuthenticatedConfig();
    mcApiService.setLogger(logger);

    baseDetails.categoryPath = baseDetails.categoryId ? await mcApiService.getFolderPath(baseDetails.categoryId, apiConfig) : 'Raíz';
    baseDetails.newCategoryId = baseDetails.categoryId;
    baseDetails.newCategoryPath = baseDetails.categoryPath;

    // Guardamos el nombre del nuevo automatismo en el estado.
    baseDetails.newAutomationName = `${baseDetails.name}_Copy`;
    
    baseDetails.defaultNewQueryCategoryId = null;
    baseDetails.defaultNewQueryCategoryPath = null;
    baseDetails.defaultNewDECategoryId = null;
    baseDetails.defaultNewDECategoryPath = null;

    for (const step of baseDetails.steps || []) {
        for (const activity of step.activities || []) {
            const isClonable = CLONABLE_ACTIVITY_TYPES.has(activity.objectTypeId);
            activity.isClonable = isClonable;
            activity.selected = isClonable;
            activity.newActivityName = `${activity.name}_Copy`;
            activity.newDeName = 'No aplica';

            if (activity.objectTypeId === 300) {
                const queryDetails = await mcApiService.fetchQueryDefinitionDetails(activity.activityObjectId, apiConfig);
                activity.originalQueryCategoryId = queryDetails.categoryId;
                activity.originalQueryCategoryPath = queryDetails.categoryId ? await mcApiService.getFolderPath(queryDetails.categoryId, apiConfig) : 'Raíz';
                activity.newQueryCategoryId = activity.originalQueryCategoryId;
                activity.newQueryCategoryPath = activity.originalQueryCategoryPath;

                if (activity.targetDataExtensions && activity.targetDataExtensions.length > 0) {
                    const deName = activity.targetDataExtensions[0].name;
                    activity.newDeName = `${deName}_Copy`;
                    const deDetails = await mcApiService.getDataExtensionDetailsByName(deName, apiConfig);
                    activity.originalDeCategoryId = deDetails.categoryId;
                    activity.originalDeCategoryPath = deDetails.categoryId ? await mcApiService.getFolderPath(deDetails.categoryId, apiConfig) : 'Raíz';
                    activity.newDeCategoryId = activity.originalDeCategoryId;
                    activity.newDeCategoryPath = activity.originalDeCategoryPath;
                }
            }
        }
    }
    return baseDetails;
}

// --- 5. LÓGICA DE LA INTERFAZ Y MANEJO DE EVENTOS ---

/**
 * Limpia la vista y resetea el estado para una nueva clonación.
 */
function clearView() {
    currentAutomationDetails = null;
    elements.automationClonerSourceName.value = 'Cargando...';
    elements.automationClonerDestName.value = '';
    elements.automationClonerDestFolder.value = '';
    elements.defaultQueryFolder.value = '';
    elements.defaultDEFolder.value = '';
    elements.automationClonerStepsContainer.innerHTML = '';
    elements.automationClonerContinueBtn.disabled = true;
}

/**
 * Maneja la selección de carpetas para los destinos principales y por defecto.
 * @param {'automation'|'defaultQuery'|'defaultDE'} target
 */
async function selectFolderFor(target) {
    const contentTypeMap = { automation: 'automations', defaultQuery: 'queryactivity', defaultDE: 'dataextension' };
    const selectedFolder = await ui.showFolderSelectorModal(contentTypeMap[target], { getAuthenticatedConfig, mcApiService, logger });

    if (selectedFolder) {
        if (target === 'automation') {
            currentAutomationDetails.newCategoryId = selectedFolder.id;
            currentAutomationDetails.newCategoryPath = selectedFolder.fullPath;
        } else if (target === 'defaultQuery') {
            currentAutomationDetails.defaultNewQueryCategoryId = selectedFolder.id;
            currentAutomationDetails.defaultNewQueryCategoryPath = selectedFolder.fullPath;
            currentAutomationDetails.steps.forEach(step => {
                step.activities.forEach(activity => {
                    if (activity.objectTypeId === 300) {
                        activity.newQueryCategoryId = selectedFolder.id;
                        activity.newQueryCategoryPath = selectedFolder.fullPath;
                    }
                });
            });
        } else if (target === 'defaultDE') {
            currentAutomationDetails.defaultNewDECategoryId = selectedFolder.id;
            currentAutomationDetails.defaultNewDECategoryPath = selectedFolder.fullPath;
            currentAutomationDetails.steps.forEach(step => {
                step.activities.forEach(activity => {
                    if (activity.objectTypeId === 300) {
                        activity.newDeCategoryId = selectedFolder.id;
                        activity.newDeCategoryPath = selectedFolder.fullPath;
                    }
                });
            });
        }
        render();
    }
}

/**
 * Gestiona los clics en la tabla de actividades (checkboxes y celdas de carpeta).
 * @param {Event} e - El evento de clic.
 */
async function handleActivityTableClick(e) {
    const target = e.target;
    const cell = target.closest('td');
    const row = target.closest('tr');
    if (!row) return;

    const stepIndex = parseInt(row.dataset.stepIndex, 10);
    const activityIndex = parseInt(row.dataset.activityIndex, 10);
    const activity = currentAutomationDetails.steps[stepIndex].activities[activityIndex];

    if (cell && cell.classList.contains('folder-cell')) {
        const folderType = cell.dataset.folderType;
        const contentType = (folderType === 'query') ? 'queryactivity' : 'dataextension';
        const selectedFolder = await ui.showFolderSelectorModal(contentType, { getAuthenticatedConfig, mcApiService, logger });

        if (selectedFolder) {
            if (folderType === 'query') {
                activity.newQueryCategoryId = selectedFolder.id;
                activity.newQueryCategoryPath = selectedFolder.fullPath;
            } else {
                activity.newDeCategoryId = selectedFolder.id;
                activity.newDeCategoryPath = selectedFolder.fullPath;
            }
            render();
        }
    } else if (target.matches('.activity-checkbox, .select-all-step')) {
        if (target.matches('.select-all-step')) {
            const isChecked = target.checked;
            currentAutomationDetails.steps[stepIndex].activities.forEach(act => {
                if (act.isClonable) act.selected = isChecked;
            });
        } else {
            activity.selected = target.checked;
        }
        render();
    }
}

/**
 * Gestiona la edición de los nombres de destino.
 * @param {Event} e - El evento 'input'.
 */
function handleActivityNameEdit(e) {
    const cell = e.target.closest('td[contenteditable="true"]');
    if (!cell) return;
    const row = cell.closest('tr');
    const stepIndex = parseInt(row.dataset.stepIndex, 10);
    const activityIndex = parseInt(row.dataset.activityIndex, 10);
    const activity = currentAutomationDetails.steps[stepIndex].activities[activityIndex];
    const newValue = cell.textContent.trim();
    
    if (cell.dataset.type === 'activity-name') {
        activity.newActivityName = newValue;
    } else if (cell.dataset.type === 'de-name') {
        activity.newDeName = newValue;

        const originalDeKey = cell.dataset.originalDeKey;
        if (originalDeKey) {
            // 1. Actualiza el estado de todas las actividades relacionadas en la memoria
            currentAutomationDetails.steps.forEach(step => {
                step.activities.forEach(act => {
                    if (act.targetDataExtensions?.[0]?.key === originalDeKey) {
                        act.newDeName = newValue;
                    }
                });
            });

            // 2. Actualiza la pantalla (DOM) para reflejar el cambio en todas las filas
            const allRelatedCells = elements.automationClonerStepsContainer.querySelectorAll(`td[data-original-de-key="${originalDeKey}"]`);
            allRelatedCells.forEach(relatedCell => {
                if (relatedCell !== cell) { // No actualices la que se está editando
                    relatedCell.textContent = newValue;
                }
            });
        }
    }
}

// --- 6. LÓGICA DE RENDERIZADO ---

/**
 * Pinta toda la interfaz del clonador basándose en el estado actual.
 */
// En: src/renderer/components/automation-cloner.js
function render() {
    if (!currentAutomationDetails) return;

    elements.automationClonerSourceName.value = currentAutomationDetails.name;
    elements.automationClonerDestName.value = currentAutomationDetails.newAutomationName;
    elements.automationClonerDestFolder.value = currentAutomationDetails.newCategoryPath;
    elements.automationClonerContinueBtn.disabled = false;
    elements.defaultQueryFolder.value = currentAutomationDetails.defaultNewQueryCategoryPath || '';
    elements.defaultDEFolder.value = currentAutomationDetails.defaultNewDECategoryPath || '';

    const stepsContainer = elements.automationClonerStepsContainer;
    stepsContainer.innerHTML = ''; 

    currentAutomationDetails.steps.forEach((step, stepIndex) => {
        const stepBlock = document.createElement('div');
        stepBlock.className = 'step-block';

        const activityRows = step.activities.map((activity, activityIndex) => {
            const isQuery = activity.objectTypeId === 300;
            const checkboxHtml = `<input type="checkbox" class="activity-checkbox" ${activity.selected ? 'checked' : ''} ${!activity.isClonable ? 'disabled' : ''}>`;
            
            // Obtenemos la clave original de la DE si existe para usarla como identificador
            const originalDeKey = (isQuery && activity.targetDataExtensions?.length > 0) 
                ? activity.targetDataExtensions[0].key 
                : null;
            
            const queryFolderCell = isQuery ? `<td class="folder-cell" data-folder-type="query" title="Clic para cambiar carpeta">${activity.newQueryCategoryPath || 'Raíz'}</td>` : '<td>-</td>';
            
            // Añadimos el nuevo data-attribute a la celda del nombre de la DE
            const deNameCell = isQuery 
                ? `<td contenteditable="true" data-type="de-name" data-original-de-key="${originalDeKey}" title="${activity.newDeName}">${activity.newDeName}</td>`
                : `<td>${activity.newDeName}</td>`;
            
            const deFolderCell = isQuery ? `<td class="folder-cell" data-folder-type="de" title="Clic para cambiar carpeta">${activity.newDeCategoryPath || 'Raíz'}</td>` : '<td>-</td>';

            return `
                <tr data-step-index="${stepIndex}" data-activity-index="${activityIndex}">
                    <td>${checkboxHtml}</td>
                    <td>${activityTypeMap[activity.objectTypeId] || `Desconocido`}</td>
                    <td title="${activity.name}">${activity.name}</td>
                    <td contenteditable="true" data-type="activity-name" title="${activity.newActivityName}">${activity.newActivityName}</td>
                    ${queryFolderCell}
                    ${deNameCell}
                    ${deFolderCell}
                </tr>`;
        }).join('');

        const clonableActivities = step.activities.filter(a => a.isClonable);
        const allClonableSelected = clonableActivities.length > 0 && clonableActivities.every(a => a.selected);
        
        const activitiesTableHtml = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th><input type="checkbox" class="select-all-step" title="Seleccionar todo" ${allClonableSelected ? 'checked' : ''} ${clonableActivities.length === 0 ? 'disabled' : ''}></th>
                            <th>Tipo</th><th>Nombre Origen</th><th>Nombre Destino (Editable)</th><th>Carpeta Query</th><th>Nombre DE (Editable)</th><th>Carpeta DE</th>
                        </tr>
                    </thead>
                    <tbody>${activityRows}</tbody>
                </table>
            </div>`;
        
        stepBlock.innerHTML = `<h4>Paso ${step.step}</h4> ${activitiesTableHtml}`;
        stepsContainer.appendChild(stepBlock);
    });
}

// --- 7. LÓGICA DE EJECUCIÓN (CLONACIÓN) ---

/**
 * Orquesta el proceso final de clonación.
 */
async function cloneAutomation() {
    const newAutomationName = currentAutomationDetails.newAutomationName.trim();
    if (!newAutomationName) return ui.showCustomAlert("El nombre del automatismo de destino no puede estar vacío.");
    
    const activitiesToClone = currentAutomationDetails.steps.flatMap(s => s.activities).filter(a => a.isClonable && a.selected);
    if (activitiesToClone.length === 0) return ui.showCustomAlert("No has seleccionado ninguna actividad para clonar.");
    
    if (!await ui.showCustomConfirm(`Se clonará el automatismo "${newAutomationName}" y ${activitiesToClone.length} actividades. ¿Continuar?`)) return;

    ui.blockUI("Iniciando clonación...");
    logger.startLogBuffering();

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        const newActivityIdMap = new Map();

        // Mapa para rastrear las DEs ya clonadas.
        // La clave será la CustomerKey de la DE original y el valor será el objeto de la DE clonada.
        const clonedDeMap = new Map();

        logger.logMessage("--- FASE 1: Clonando actividades dependientes ---");
        for (const activity of activitiesToClone) {
            ui.blockUI(`Clonando: ${activity.name}`);
            if (activity.objectTypeId === 300) { // Lógica para Query
                
                // Declaramos la variable 'clonedDE' aquí para que sea accesible en todo el bloque.
                let clonedDE;
                const originalDEKey = activity.targetDataExtensions[0].key;
                const originalQueryDetails = await mcApiService.fetchQueryDefinitionDetails(activity.activityObjectId, apiConfig);

                // Comprobamos si la DE ya ha sido clonada.
                if (clonedDeMap.has(originalDEKey)) {
                    // Si ya existe, la recuperamos del mapa.
                    clonedDE = clonedDeMap.get(originalDEKey);
                    logger.logMessage(`  - DE "${originalDEKey}" ya clonada. Reutilizando: "${clonedDE.name}"`);
                } else {
                    // Si no existe, la clonamos y la guardamos en el mapa.
                    clonedDE = await mcApiService.cloneDataExtension(originalDEKey, activity.newDeName, "", activity.newDeCategoryId, apiConfig);
                    clonedDeMap.set(originalDEKey, clonedDE); // Guardamos el resultado para la próxima vez.
                    logger.logMessage(`  - DE clonada: "${clonedDE.name}" en carpeta ID ${activity.newDeCategoryId}`);
                }
                
                // El resto de la lógica no cambia, simplemente usa la variable 'clonedDE' que hemos preparado.
                const newQuery = await mcApiService.createClonedQuery(originalQueryDetails, clonedDE, activity.newActivityName, activity.newQueryCategoryId, apiConfig);
                logger.logMessage(`  - Query clonada: "${newQuery.name}" en carpeta ID ${activity.newQueryCategoryId}`);
                newActivityIdMap.set(activity.id, newQuery.objectID);
            }
        }

        logger.logMessage("--- FASE 2: Construyendo y creando el nuevo automatismo ---");
        ui.blockUI("Construyendo automatismo...");

        // 1. Primero, creamos un array temporal con los pasos que SÍ tendrán actividades clonadas.
        const potentialSteps = currentAutomationDetails.steps
            .map(step => ({
                // Mapeamos solo las actividades que han sido clonadas con éxito
                activities: step.activities
                    .filter(act => newActivityIdMap.has(act.id))
                    .map(act => ({
                        name: act.newActivityName,
                        objectTypeId: act.objectTypeId,
                        displayOrder: act.displayOrder,
                        activityObjectId: newActivityIdMap.get(act.id)
                    }))
            }))
            // 2. Filtramos para quedarnos solo con los pasos que no están vacíos.
            .filter(step => step.activities.length > 0);

        // 3. Ahora, y solo ahora, mapeamos sobre el array filtrado para asignar números de paso
        //    secuenciales y sin huecos. El 'index' aquí será 0, 1, 2...
        const newStepsPayload = potentialSteps.map((step, index) => ({
            stepNumber: index, // Esto garantiza la secuencia: 1, 2, 3...
            activities: step.activities
        }));
        
        const payload = {
            name: newAutomationName,
            description: currentAutomationDetails.description || "",
            categoryId: currentAutomationDetails.newCategoryId,
            key: crypto.randomUUID(),
            steps: newStepsPayload,
        };
        
        await mcApiService.createAutomation(payload, apiConfig);
        ui.showCustomAlert("¡Éxito! El automatismo y sus actividades han sido clonados.");
        goBackFunction();
    } catch (error) {
        logger.logMessage(`ERROR FATAL: ${error.message}`);
        ui.showCustomAlert(`Error durante la clonación: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}