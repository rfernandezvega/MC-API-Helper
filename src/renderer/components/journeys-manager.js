// Fichero: src/renderer/components/journeys-manager.js
// Descripción: Módulo que encapsula toda la lógica de la vista "Gestión de Journeys".

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO DEL MÓDULO ---

let fullJourneyList = [];
let eventDefinitionsMap = {};
let journeyFolderMap = {};

let currentPage = 1;
let currentSortColumn = 'name';
let currentSortDirection = 'asc';
const ITEMS_PER_PAGE = 15;

let getAuthenticatedConfig; // Dependencia que será inyectada por app.js

// --- 2. FUNCIONES DE RENDERIZADO Y LÓGICA DE TABLA ---

/**
 * Se llama cuando se cambia un FILTRO. Resetea la paginación y renderiza.
 */
function applyFiltersAndRender() {
    currentPage = 1;
    renderFilteredTable();
}

/**
 * Aplica los filtros actuales y llama al renderizado final.
 * No resetea la paginación, ideal para paginar o reordenar.
 */
function renderFilteredTable() {
    let filtered = fullJourneyList;
    
    const nameFilter = elements.journeyNameFilter.value.toLowerCase().trim();
    if (nameFilter) filtered = filtered.filter(j => j.name.toLowerCase().includes(nameFilter));
    
    const typeFilter = elements.journeyTypeFilter.value;
    if (typeFilter) filtered = filtered.filter(j => j.eventType === typeFilter);

    const subtypeFilter = elements.journeySubtypeFilter.value;
    if (subtypeFilter) filtered = filtered.filter(j => j.definitionType === subtypeFilter);
    
    const statusFilter = elements.journeyStatusFilter.value;
    if (statusFilter) filtered = filtered.filter(j => j.status === statusFilter);

    const deFilter = elements.journeyDEFilter.value.toLowerCase().trim();
    if (deFilter) filtered = filtered.filter(j => j.dataExtensionName && j.dataExtensionName.toLowerCase().includes(deFilter));

    renderTable(filtered);
}

/**
 * Renderiza el contenido de la tabla de journeys, aplicando paginación y ordenación.
 * @param {Array} journeys - La lista (ya filtrada) de journeys a mostrar.
 */
function renderTable(journeys) {
    sortData(journeys);
    const paginatedItems = journeys.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    
    elements.journeysTbody.innerHTML = '';
    paginatedItems.forEach(j => {
        const row = document.createElement('tr');
        row.dataset.journeyId = j.id;
        row.innerHTML = `
            <td>${j.name || '---'}</td> <td>${j.version || '---'}</td> <td>${formatDate(j.createdDate)}</td>
            <td>${formatDate(j.modifiedDate)}</td> <td>${j.eventType || '---'}</td> <td>${j.definitionType || '---'}</td>
            <td>${j.status || '---'}</td> <td>${j.location || '---'}</td> <td>${j.dataExtensionName || '---'}</td>
            <td>${j.hasCommunications ? 'Sí' : 'No'}</td> <td>${j.emails.join(', ')}</td>
            <td>${j.sms.join(', ')}</td> <td>${j.pushes.join(', ')}</td>
        `;
        elements.journeysTbody.appendChild(row);
    });

    updatePaginationUI(journeys.length);
    updateSortIndicators();
    updateButtonsState();
}

// --- 3. FUNCIONES PÚBLICAS (API del Módulo) ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas (ej: { getAuthenticatedConfig }).
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    // Listeners de filtros
    elements.journeyNameFilter.addEventListener('input', applyFiltersAndRender);
    elements.journeyTypeFilter.addEventListener('change', applyFiltersAndRender);
    elements.journeySubtypeFilter.addEventListener('change', applyFiltersAndRender);
    elements.journeyStatusFilter.addEventListener('change', applyFiltersAndRender);
    elements.journeyDEFilter.addEventListener('input', applyFiltersAndRender);

    // Listeners de botones de acción
    elements.refreshJourneysTableBtn.addEventListener('click', refreshData);
    elements.getCommunicationsBtn.addEventListener('click', getCommunications);
    elements.drawJourneyBtn.addEventListener('click', drawJourney);
    elements.copyJourneyBtn.addEventListener('click', copyJourney);
    elements.stopJourneyBtn.addEventListener('click', stopJourneys);
    elements.deleteJourneyBtn.addEventListener('click', deleteJourneys);

    // Listeners de la tabla
    document.querySelector('#journeys-table thead').addEventListener('click', handleSort);
    elements.journeysTbody.addEventListener('click', handleRowSelection);

    // Listeners de paginación
    elements.prevPageBtnJourneys.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderFilteredTable();
        }
    });
    elements.nextPageBtnJourneys.addEventListener('click', () => { 
        const maxPage = parseInt(elements.pageInputJourneys.max, 10) || 1;
        if (currentPage < maxPage) {
            currentPage++;
            renderFilteredTable(); 
        } 
    });
    elements.pageInputJourneys.addEventListener('change', () => {
        let newPage = parseInt(elements.pageInputJourneys.value, 10) || 1;
        const maxPage = parseInt(elements.pageInputJourneys.max, 10) || 1;
        if (newPage < 1) newPage = 1;
        if (newPage > maxPage) newPage = maxPage;
        currentPage = newPage;
        renderFilteredTable(); 
    });
    elements.pageInputJourneys.addEventListener('blur', () => {
        if (elements.pageInputJourneys.value === '') {
            currentPage = 1;
            renderFilteredTable(); 
        }
    });

    // Listeners del modal de flujo
    elements.closeFlowBtn.addEventListener('click', closeJourneyFlowModal);
    elements.journeyFlowModal.addEventListener('click', (e) => { if (e.target === elements.journeyFlowModal) closeJourneyFlowModal(); });
    elements.copyFlowBtn.addEventListener('click', copyFlowToClipboard);
}

/**
 * Prepara la vista de "Gestión de Journeys" para ser mostrada.
 * Si los datos no están en caché, los obtiene de la API.
 */
export async function view() {
    if (fullJourneyList.length === 0) {
        await fetchData();
    }
    applyFiltersAndRender();
}

/**
 * Limpia la caché de datos y resetea la UI del módulo. Se llama al cambiar de cliente.
 */
export function clearCache() {
    fullJourneyList = [];
    eventDefinitionsMap = {};
    journeyFolderMap = {};
    elements.journeyNameFilter.value = '';
    elements.journeyTypeFilter.innerHTML = '<option value="">Todos los tipos</option>';
    elements.journeySubtypeFilter.innerHTML = '<option value="">Todos los subtipos</option>';
    elements.journeyStatusFilter.innerHTML = '<option value="">Todos los estados</option>';
    elements.journeyDEFilter.value = '';
    elements.journeysTbody.innerHTML = '';
}

// --- 4. LÓGICA DE DATOS Y API ---

/**
 * Orquesta la obtención de todos los datos necesarios para la vista de Journeys.
 */
async function fetchData() {
    ui.blockUI("Recuperando Journeys...");
    logger.startLogBuffering();
    try {
        logger.logMessage("Cargando lista de Journeys y dependencias...");
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const [events, journeys] = await Promise.all([
            mcApiService.fetchAllEventDefinitions(apiConfig),
            mcApiService.fetchAllJourneys(apiConfig)
        ]);

        eventDefinitionsMap = events;
        journeyFolderMap = await mcApiService.buildJourneyFolderMap(journeys, apiConfig);
        fullJourneyList = enrichJourneys(journeys);

        populateJourneyFilters(fullJourneyList);
    } catch (error) {
        logger.logMessage(`Error al obtener journeys: ${error.message}`);
        ui.showCustomAlert(`Error al cargar Journeys: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Combina la lista de journeys con datos de carpetas y definiciones de eventos.
 * @param {Array} journeys - La lista de journeys cruda de la API.
 * @returns {Array} La lista de journeys enriquecida.
 */
function enrichJourneys(journeys) {
    return journeys.map(journey => ({
        ...journey,
        eventType: eventDefinitionsMap[journey.name]?.type || 'No asociado',
        dataExtensionName: eventDefinitionsMap[journey.name]?.dataExtensionName || 'No asociado',
        location: journeyFolderMap[journey.categoryId] || 'Carpeta raíz',
        emails: [], sms: [], pushes: [], activities: null, hasCommunications: false
    }));
}

/**
 * Fuerza una recarga completa de los datos de journeys desde la API.
 */
async function refreshData() {
    clearCache();
    await view();
}

// --- 5. ACCIONES DE BOTONES ---

/**
 * Obtiene los detalles de las comunicaciones (emails, sms) para los journeys seleccionados.
 */
async function getCommunications() {
    const journeysToProcess = getSelectedJourneys();
    if (journeysToProcess.length === 0) return;

    ui.blockUI("Recuperando comunicaciones...");
    logger.startLogBuffering();
    try {
        logger.logMessage(`Iniciando obtención de detalles de comunicación para ${journeysToProcess.length} journey(s)...`);
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        for (const journey of journeysToProcess) {
            if (journey.hasCommunications){
                logger.logMessage(`Saltando "${journey.name}", los datos ya estaban cargados.`);
                continue;
            }
            logger.logMessage(`Obteniendo actividades para: "${journey.name}"`);
            const details = await mcApiService.fetchJourneyDetailsById(journey.id, apiConfig);
            const comms = parseJourneyActivities(details.activities);
            Object.assign(journey, { ...comms, activities: details.activities || [], hasCommunications: true });
        }
        ui.showCustomAlert("Comunicaciones actualizadas.");
    } catch (error) {
        logger.logMessage(` -> ERROR al obtener detalles para "${error.message}"`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        applyFiltersAndRender();
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Genera y muestra una representación textual del flujo del journey seleccionado.
 */
function drawJourney() {
    const selected = getSelectedJourneys();
    if (selected.length !== 1) return;
    const journey = selected[0];
    if (journey.hasCommunications) {
        const flowText = generateJourneyFlowText(journey);
        showJourneyFlowModal(flowText);
    }
}

/**
 * Orquesta el proceso de clonación de un journey seleccionado.
 */
async function copyJourney() {
    const selected = getSelectedJourneys();
    if (selected.length !== 1) return;
    const journey = selected[0];

    if (!await ui.showCustomConfirm(`Se creará una copia completa de "${journey.name}", incluyendo su Data Extension de entrada. ¿Continuar?`)) return;

    ui.blockUI("Copiando Journey...");
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        logger.logMessage(`PASO 1/6: Obteniendo definición de "${journey.name}"...`);
        const originalJourney = await mcApiService.fetchJourneyDetailsById(journey.id, apiConfig);
        const eventDefId = originalJourney.triggers?.[0]?.metaData?.eventDefinitionId;
        if (!eventDefId) throw new Error("No se pudo encontrar el Event Definition ID del Journey.");
        
        logger.logMessage(`PASO 2/6: Obteniendo Event Definition (ID: ${eventDefId})...`);
        const originalEventDef = await mcApiService.getEventDefinitionById(eventDefId, apiConfig);
        if (!originalEventDef.dataExtensionName) throw new Error("El Event Definition no está asociado a una Data Extension.");

        logger.logMessage(`PASO 3/6: Buscando detalles de la DE "${originalEventDef.dataExtensionName}"...`);
        const deDetails = await mcApiService.getDataExtensionDetailsByName(originalEventDef.dataExtensionName, apiConfig);

        logger.logMessage(`PASO 4/6: Clonando la Data Extension...`);
        const clonedDeInfo = await mcApiService.cloneDataExtension(deDetails.customerKey, `${originalEventDef.dataExtensionName}_Copy`, "", deDetails.categoryId, apiConfig);
        logger.logMessage(`-> Nueva DE creada con Key: ${clonedDeInfo.customerKey}`);

        logger.logMessage(`PASO 5/6: Creando nuevo Event Definition...`);
        const newEventDef = await mcApiService.createClonedEventDefinition(originalEventDef, clonedDeInfo, apiConfig);
        logger.logMessage(`-> Nuevo Event Definition creado con Key: ${newEventDef.eventDefinitionKey}`);

        logger.logMessage(`PASO 6/6: Creando la copia final del Journey...`);
        const copyPayload = prepareJourneyForCopy(originalJourney, originalEventDef, newEventDef);
        const newJourney = await mcApiService.createJourney(copyPayload, apiConfig);
        logger.logMessage(`-> ¡Journey "${newJourney.name}" creado con éxito!`);

        ui.showCustomAlert(`¡Éxito! Se ha creado la copia "${newJourney.name}".`);
        await refreshData();
    } catch (error) {
        logger.logMessage(`ERROR en la copia: ${error.message}`);
        ui.showCustomAlert(`Error en la copia: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Llama a la acción masiva para parar journeys.
 */
async function stopJourneys() {
    await performMassAction('stopJourney', 'parar');
}

/**
 * Llama a la acción masiva para borrar journeys.
 */
async function deleteJourneys() {
    await performMassAction('deleteJourney', 'borrar permanentemente');
}

/**
 * Lógica genérica para ejecutar una acción (parar, borrar) sobre múltiples journeys.
 * @param {string} serviceMethod - El nombre del método en mc-api-service a llamar.
 * @param {string} actionVerb - El verbo que se mostrará al usuario (ej: 'parar').
 */
async function performMassAction(serviceMethod, actionVerb) {
    const journeys = getSelectedJourneys();
    if (journeys.length === 0) return;

    if (!await ui.showCustomConfirm(`¿Seguro que quieres ${actionVerb} ${journeys.length} journey(s)?`)) return;

    ui.blockUI(`${actionVerb.charAt(0).toUpperCase() + actionVerb.slice(1)} journeys...`);
    logger.startLogBuffering();
    const successes = [];
    const failures = [];

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        for (const journey of journeys) {
            try {
                logger.logMessage(`Iniciando acción '${actionVerb}' para el journey: "${journey.name}"`);
                if (serviceMethod === 'stopJourney') {
                    await mcApiService[serviceMethod](journey.id, journey.version, apiConfig);
                } else {
                    await mcApiService[serviceMethod](journey.id, apiConfig);
                }
                successes.push(journey.name);
            } catch (error) {
                logger.logMessage(`FALLO al procesar "${journey.name}": ${error.message}`);
                failures.push({ name: journey.name, reason: error.message });
            }
        }
    } catch (error) {
        logger.logMessage(`Error fatal durante la acción masiva: ${error.message}`);
    } finally {
        ui.showCustomAlert(`Acción completada. Éxitos: ${successes.length}, Fallos: ${failures.length}.`);
        logger.endLogBuffering();
        ui.unblockUI();
        await refreshData();
    }
}

// --- 6. GESTIÓN DE LA TABLA ---

/**
 * Gestiona el evento de clic en las cabeceras para ordenar la tabla.
 * @param {Event} e - El evento de clic.
 */
function handleSort(e) {
    const header = e.target.closest('.sortable-header');
    if (!header) return;
    const newSortColumn = header.dataset.sortBy;
    if (currentSortColumn === newSortColumn) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = newSortColumn;
        currentSortDirection = 'asc';
    }
    applyFiltersAndRender();
}

/**
 * Ordena un array de journeys basándose en la columna y dirección seleccionadas.
 * @param {Array} data - El array de journeys a ordenar.
 */
function sortData(data) {
    data.sort((a, b) => {
        let valA = a[currentSortColumn];
        let valB = b[currentSortColumn];
        const direction = currentSortDirection === 'asc' ? 1 : -1;
        
        if (valA == null) return 1;
        if (valB == null) return -1;

        if (currentSortColumn.includes('Date')) {
            return (new Date(valA) - new Date(valB)) * direction;
        }
        if (typeof valA === 'boolean') {
            return (valA === valB ? 0 : valA ? -1 : 1) * direction;
        }
        return String(valA).localeCompare(String(valB), undefined, { sensitivity: 'base' }) * direction;
    });
}

/**
 * Gestiona la selección y deselección de filas en la tabla.
 * @param {Event} e - El evento de clic.
 */
function handleRowSelection(e) {
    const row = e.target.closest('tr');
    if (!row || !row.dataset.journeyId) return;
    row.classList.toggle('selected');
    updateButtonsState();
}

// --- 7. HELPERS Y FUNCIONES AUXILIARES ---

/**
 * Devuelve un array con los objetos de journey completos que están seleccionados en la tabla.
 * @returns {Array}
 */
function getSelectedJourneys() {
    const selectedIds = Array.from(document.querySelectorAll('#journeys-table tbody tr.selected')).map(row => row.dataset.journeyId);
    return fullJourneyList.filter(j => selectedIds.includes(j.id));
}

/**
 * Actualiza el estado (habilitado/deshabilitado) de todos los botones de acción.
 */
function updateButtonsState() {
    const selected = getSelectedJourneys();
    const count = selected.length;
    elements.getCommunicationsBtn.disabled = count === 0;
    elements.drawJourneyBtn.disabled = !(count === 1 && selected[0].hasCommunications);
    elements.copyJourneyBtn.disabled = !(count === 1 && ['EmailAudience', 'AutomationAudience'].includes(selected[0].eventType));
    elements.stopJourneyBtn.disabled = !(count > 0 && selected.every(j => j.status === 'Published'));
    elements.deleteJourneyBtn.disabled = !(count > 0 && selected.every(j => j.definitionType === 'Quicksend'));
}

/**
 * Rellena los desplegables de filtros con las opciones únicas disponibles.
 * @param {Array} journeys - La lista completa de journeys.
 */
function populateJourneyFilters(journeys) {
    const createOptions = (element, key, label) => {
        const current = element.value;
        element.innerHTML = `<option value="">Todos los ${label}</option>`;
        const values = [...new Set(journeys.map(j => j[key]).filter(Boolean))].sort();
        values.forEach(val => element.appendChild(new Option(val, val)));
        element.value = current;
    };
    createOptions(elements.journeyTypeFilter, 'eventType', 'tipos');
    createOptions(elements.journeySubtypeFilter, 'definitionType', 'subtipos');
    createOptions(elements.journeyStatusFilter, 'status', 'estados');
}

/**
 * Actualiza la UI de los controles de paginación.
 * @param {number} totalItems - El número total de items en la lista filtrada.
 */
function updatePaginationUI(totalItems) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    elements.totalPagesJourneys.textContent = `/ ${totalPages}`;
    elements.pageInputJourneys.value = currentPage;
    elements.pageInputJourneys.max = totalPages;
    elements.prevPageBtnJourneys.disabled = currentPage === 1;
    elements.nextPageBtnJourneys.disabled = currentPage >= totalPages;
}

/**
 * Actualiza los indicadores visuales de ordenación en las cabeceras de la tabla.
 */
function updateSortIndicators() {
    document.querySelectorAll('#journeys-table .sortable-header').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
        if (header.dataset.sortBy === currentSortColumn) {
            header.classList.add(currentSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

/**
 * Muestra el modal con el flujo del journey en formato de texto.
 * @param {string} flowText - El texto preformateado.
 */
function showJourneyFlowModal(flowText) {
    elements.journeyFlowContent.textContent = flowText;
    elements.journeyFlowModal.style.display = 'flex';
}

/**
 * Cierra el modal de visualización del flujo.
 */
function closeJourneyFlowModal() {
    elements.journeyFlowModal.style.display = 'none';
}

/**
 * Copia el contenido del flujo del journey al portapapeles.
 */
function copyFlowToClipboard() {
    navigator.clipboard.writeText(elements.journeyFlowContent.textContent).then(() => {
        const originalText = elements.copyFlowBtn.textContent;
        elements.copyFlowBtn.textContent = '¡Copiado!';
        elements.copyFlowBtn.classList.add('copied');
        setTimeout(() => {
            elements.copyFlowBtn.textContent = originalText;
            elements.copyFlowBtn.classList.remove('copied');
        }, 2000);
    });
}

/**
 * Parsea las actividades de un journey para extraer las comunicaciones.
 * @param {Array} activities - El array de actividades de la API.
 * @returns {object} Un objeto con arrays de emails, sms y pushes.
 */
function parseJourneyActivities(activities = []) {
    const communications = { emails: [], sms: [], pushes: [] };
    if (!activities) return communications;
    for (const activity of activities) {
        if (activity.type === 'EMAILV2') communications.emails.push(activity.name);
        else if (activity.type === 'SMS') communications.sms.push(activity.name);
        else if (['INAPP', 'INBOX', 'MOBILEPUSH'].includes(activity.type)) communications.pushes.push(activity.name);
    }
    return communications;
}

/**
 * Prepara el payload para crear una copia de un Journey.
 * @param {object} originalJourney - El objeto de Journey completo.
 * @param {object} originalEventDef - El objeto de Event Definition original.
 * @param {object} newEventDef - El objeto del nuevo Event Definition.
 * @returns {object} Un objeto JSON listo para ser enviado en la petición de creación.
 */
function prepareJourneyForCopy(originalJourney, originalEventDef, newEventDef) {
    const oldEventDefKey = originalEventDef.eventDefinitionKey;
    const newEventDefKey = newEventDef.eventDefinitionKey;
    
    let journeyString = JSON.stringify(originalJourney);
    const regex = new RegExp(oldEventDefKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    journeyString = journeyString.replace(regex, newEventDefKey);
    
    let finalPayload = JSON.parse(journeyString);

    finalPayload.activities = finalPayload.activities.map(({ id, schema, ...rest }) => rest);

    finalPayload.triggers = finalPayload.triggers.map(trigger => {
        const { id, ...rest } = trigger;
        rest.type = 'EmailAudience'; 
        if (rest.metaData) {
            rest.metaData.eventDefinitionKey = newEventDef.eventDefinitionKey; 
            rest.metaData.eventDefinitionId = newEventDef.id;
        }
        return rest;
    });
    
    delete finalPayload.id;
    delete finalPayload.version;
    delete finalPayload.createdDate;
    delete finalPayload.modifiedDate;
    delete finalPayload.lastPublishedDate;
    delete finalPayload.definitionId;
    delete finalPayload.status;
    delete finalPayload.stats;
    
    finalPayload.name = `${originalJourney.name}_Copy`;
    finalPayload.key = crypto.randomUUID();

    return finalPayload;
}

/**
 * Formatea una cadena de fecha a un formato legible local.
 * @param {string} dateString - La fecha en formato ISO.
 * @returns {string} La fecha formateada o '---'.
 */
function formatDate(dateString) {
    if (!dateString) return '---';
    try {
        return new Date(dateString).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    } catch {
        return 'Fecha inválida';
    }
}

/**
 * Parsea la estructura de un journey y la convierte en una representación textual.
 * @param {object} journey - El objeto de journey completo con sus actividades.
 * @returns {string} El flujo del journey formateado como texto.
 */
function generateJourneyFlowText(journey) {
    if (!journey || !journey.activities || journey.activities.length === 0) {
        return "No se han cargado los detalles de las actividades para este journey.";
    }

    const ACTIVITY_TYPE_MAP = {
        'EMAILV2': '[EMAIL]', 'SMS': '[SMS]', 'MOBILEPUSH': '[PUSH]', 'PUSHNOTIFICATIONACTIVITY': '[PUSH]',
        'WHATSAPPACTIVITY': '[WHATSAPP]', 'INBOX': '[INBOX MSG]', 'INAPP': '[IN-APP MSG]', 'WAIT': '[ESPERA]',
        'WAITBYDURATION': '[ESPERA]', 'WAITBYATTRIBUTE': '[ESPERA POR ATRIBUTO]', 'WAITBYEVENT': '[ESPERA HASTA EVENTO]',
        'WAITUNTILDATE': '[ESPERA HASTA FECHA]', 'STOWAIT': '[ESPERA EINSTEIN STO]', 'MULTICRITERIARDECISION': '[DIVISIÓN]',
        'MULTICRITERIADECISIONV2': '[DIVISIÓN]', 'RANDOMSPLIT': '[DIVISIÓN A/B]', 'RANDOMSPLITV2': '[DIVISIÓN A/B]',
        'ENGAGEMENTDECISION': '[DIVISIÓN POR ENGAGEMENT]', 'ENGAGEMENTSPLITV2': '[DIVISIÓN POR ENGAGEMENT]',
        'PATHOPTIMIZER': '[OPTIMIZADOR DE RUTA]', 'UPDATECONTACTDATA': '[ACTUALIZAR CONTACTO]',
        'UPDATECONTACTDATAV2': '[ACTUALIZAR CONTACTO]', 'ADDAUDIENCE': '[AÑADIR A AUDIENCIA]',
        'CONTACTUPDATE': '[ACTUALIZAR CONTACTO]', 'EINSTEINSPLIT': '[DIVISIÓN EINSTEIN SCORE]',
        'EINSTEINMESSAGINGSPLIT': '[DIVISIÓN EINSTEIN INSIGHTS]', 'EINSTEIN_EMAIL_OPEN': '[DIVISIÓN EINSTEIN OPEN]',
        'EINSTEIN_MC_EMAIL_CLICK': '[DIVISIÓN EINSTEIN CLICK]', 'SALESFORCESALESCLOUDACTIVITY': '[ACCIÓN SALESFORCE]',
        'OBJECTACTIVITY': '[ACCIÓN OBJETO SALESFORCE]', 'LEAD': '[ACCIÓN LEAD SALESFORCE]',
        'CAMPAIGNMEMBER': '[ACCIÓN MIEMBRO DE CAMPAÑA]', 'REST': '[API REST (CUSTOM)]', 'SETCONTACTKEY': '[ESTABLECER CONTACT KEY]',
        'EVENT': '[EVENTO]', 'SMSSYNC': '[SMS]'
    };

    const activitiesMap = new Map(journey.activities.map(act => [act.key, act]));
    const activityKeyToLineNum = new Map();
    const output = [];
    let lineCounter = 1;

    function processActivity(activityKey, prefix) {
        if (!activityKey || activityKeyToLineNum.has(activityKey)) return;

        const activity = activitiesMap.get(activityKey);
        if (!activity) {
            output.push(`${prefix}Error: Actividad con key '${activityKey}' no encontrada.`);
            return;
        }

        const lineNum = lineCounter++;
        activityKeyToLineNum.set(activityKey, lineNum);

        const type = ACTIVITY_TYPE_MAP[activity.type] || `[${activity.type}]`;
        const name = activity.name || '*Actividad sin nombre*';
        let details = '';

        if (activity.type.startsWith('WAIT')) {
            const config = activity.configurationArguments;
            if (config.waitDuration) details = ` (${config.waitDuration} ${config.waitUnit || ''})`;
            else if (config.waitEndDateAttributeExpression) details = ` (hasta ${config.waitEndDateAttributeExpression.replace(/{{|}}/g, '')})`;
        } else if (activity.type.includes('ENGAGEMENT')) {
            const config = activity.configurationArguments;
            const activityName = config.refActivityName || '';
            if (config.statsTypeId === 2) details = ` (Open: ${activityName})`;
            else if (config.statsTypeId === 3) details = ` (Click: ${activityName})`;
        }

        output.push(`${prefix}${lineNum}. ${type} ${name}${details}`);

        const outcomes = activity.outcomes || [];
        
        if (outcomes.length === 1) {
            const nextKey = outcomes[0].next;
            if (nextKey) {
                if (activityKeyToLineNum.has(nextKey)) {
                    output.push(`${prefix}   └─> [UNIÓN] ➡️ ${activityKeyToLineNum.get(nextKey)}`);
                } else {
                    processActivity(nextKey, `${prefix}   `);
                }
            } else {
                output.push(`${prefix}   └─> 🔴`);
            }
        } else if (outcomes.length > 1) {
            outcomes.forEach((outcome, index) => {
                const isLastBranch = index === outcomes.length - 1;
                const branchPrefix = isLastBranch ? '└─' : '├─';
                const nextPrefix = isLastBranch ? '   ' : '│  ';
                
                let branchLabel = `[RAMA ${index + 1}]`;
                if (outcome.metaData && outcome.metaData.label) {
                    branchLabel = `[RAMA: ${outcome.metaData.label}]`;
                } else if (activity.type.includes('RANDOMSPLIT') && outcome.arguments?.percentage) {
                    branchLabel = `[RAMA: ${outcome.arguments.percentage}%]`;
                }

                output.push(`${prefix}${branchPrefix} ${branchLabel}`);
                
                const nextKey = outcome.next;
                if (nextKey) {
                    if (activityKeyToLineNum.has(nextKey)) {
                        output.push(`${prefix}${nextPrefix}  └─> [UNIÓN] ➡️ ${activityKeyToLineNum.get(nextKey)}`);
                    } else {
                        processActivity(nextKey, `${prefix}${nextPrefix}`);
                    }
                } else {
                    output.push(`${prefix}${nextPrefix}  └─> 🔴`);
                }
            });
        }
    }

    const trigger = journey.triggers?.[0];
    if (trigger?.outcomes?.[0]?.next) {
        output.push(`[INICIO] Fuente: ${trigger.type || 'Desconocida'}`);
        processActivity(trigger.outcomes[0].next, '');
    } else if (journey.activities.length > 0) {
        output.push(`[INICIO] Fuente: No definida en Trigger (usando primera actividad)`);
        processActivity(journey.activities[0].key, '');
    }
    
    return output.join('\n');
}