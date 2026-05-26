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
let currentSortColumn = 'modifiedDate';
let currentSortDirection = 'desc';
const ITEMS_PER_PAGE = 15;

let currentFilteredList = []; 

let getAuthenticatedConfig; // Dependencia que será inyectada por app.js

let showJourneyAnalyzerView;

let lastSelectedIndex = -1;

let isDeColumnVisible = false;


let scanDeCache = new Map(); 
const TARGET_DE_ACTIVITIES = [
    'MULTICRITERIADECISION', 'UPDATECONTACTDATA', 'MULTICRITERIADECISIONEXTENSION', 
    'SALESCLOUDACTIVITY', 'OBJECTACTIVITY', 'DECISION', 'CONTACTUPDATE'
];

// --- 2. FUNCIONES DE RENDERIZADO Y LÓGICA DE TABLA ---

/**
 * Se llama cuando se cambia un FILTRO. Resetea la paginación y renderiza.
 */
function applyFiltersAndRender() {
    currentPage = 1;

    let filtered = fullJourneyList; 

    const nameFilter = elements.journeyNameFilter.value.toLowerCase().trim();
    if (nameFilter) {
        // Dividimos el filtro por el carácter "|" y limpiamos espacios
        const names = nameFilter.split(/[,;|]/).map(n => n.trim().toLowerCase()).filter(n => n !== '');
        // Filtramos si el nombre del journey contiene CUALQUIERA de los términos
        filtered = filtered.filter(j => names.some(n => j.name.toLowerCase().includes(n)));
    }
    
    const typeFilter = elements.journeyTypeFilter.value;
    if (typeFilter) filtered = filtered.filter(j => j.eventType === typeFilter);

    const subtypeFilter = elements.journeySubtypeFilter.value;
    if (subtypeFilter) filtered = filtered.filter(j => j.definitionType === subtypeFilter);
    
    const statusFilter = elements.journeyStatusFilter.value;
    if (statusFilter) filtered = filtered.filter(j => j.status === statusFilter);

    const deFilter = elements.journeyDEFilter.value.toLowerCase().trim();
    if (deFilter) {
        filtered = filtered.filter(j => {
            const entryDeMatch = j.dataExtensionName && j.dataExtensionName.toLowerCase().includes(deFilter);
            const activityDeMatch = j.usedDEs && j.usedDEs.toLowerCase().includes(deFilter);
            return entryDeMatch || activityDeMatch;
        });
    }

    const commsFilter = elements.journeyCommsFilter.checked;
    if (commsFilter) {
        filtered = filtered.filter(j => j.hasCommunications === true);
    }

    currentFilteredList = filtered; // Guardamos la lista filtrada
    updateJourneyCount(); // Actualizamos el contador

    renderFilteredTable();
}

/**
 * Aplica los filtros actuales y llama al renderizado final.
 * No resetea la paginación, ideal para paginar o reordenar.
 */
function renderFilteredTable() {
    renderTable(currentFilteredList);
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
        
        // Chevron CSS con clase
        const chevron = j.hasCommunications 
            ? `<span class="comm-chevron" data-journey-id="${j.id}"></span>` 
            : '';
        
        row.innerHTML = `
            <td>${chevron}  ${j.name || '---'}</td> 
            <td>${j.version || '---'}</td> 
            <td>${formatDate(j.createdDate)}</td>
            <td>${formatDate(j.modifiedDate)}</td>
            <td>${formatDate(j.activity?.lastContactProcessed) || '---'}</td>
            <td>${j.eventType || '---'}</td> 
            <td>${j.definitionType || '---'}</td>
            <td>${j.status || '---'}</td> 
            <td>${j.dataExtensionName || '---'}</td>
            <td class="col-des" style="font-size: 0.85em; color: #333; text-align: left !important; vertical-align: middle; padding: 10px; min-width: 200px;">
                ${j.usedDEs ? j.usedDEs : '<span style="color:#ddd;">---</span>'}
            </td>
        `;
        elements.journeysTbody.appendChild(row);
    });

    updatePaginationUI(journeys.length);
    updateSortIndicators();
    updateButtonsState();
    updateColumnsVisibility();
}

/**
 * Toggle de fila desplegable con comunicaciones.
 */
function toggleCommunicationsRow(journeyId, forceOpen = null) {
    const existingRow = document.querySelector(`tr[data-comms-for="${journeyId}"]`);
    const mainRow = document.querySelector(`tr[data-journey-id="${journeyId}"]`);
    const chevron = mainRow?.querySelector('.comm-chevron');
    
    // Si forceOpen es null, hacer toggle; si es true/false, forzar ese estado
    const shouldOpen = forceOpen !== null ? forceOpen : !existingRow;
    
    if (!shouldOpen && existingRow) {
        // Cerrar
        existingRow.remove();
        if (chevron) chevron.classList.remove('open');
        return;
    }
    
    if (shouldOpen && existingRow) {
        // Ya está abierta, no hacer nada
        return;
    }

    // Abrir
    const journey = currentFilteredList.find(j => j.id === journeyId);
    if (!journey || !journey.hasCommunications) return;

    const commsRow = document.createElement('tr');
    commsRow.dataset.commsFor = journeyId;
    commsRow.style.backgroundColor = '#f9f9f9';

    const commsCell = document.createElement('td');
    commsCell.colSpan = 10;
    commsCell.style.padding = '15px';

    // Emails con tabla completa si hay datos SOAP
    if (journey.emails && journey.emails.length > 0) {
        const emailSection = document.createElement('div');
        emailSection.innerHTML = '<h4 style="margin: 0 0 10px 0;">Emails</h4>';
        
        const hasDetailedData = journey.emails.some(e => typeof e === 'object' && e.customerKey);
        
        if (hasDetailedData) {
            const emailTable = document.createElement('table');
            emailTable.className = 'data-table';
            emailTable.style.width = '100%';
            emailTable.style.marginBottom = '20px';
            
            emailTable.innerHTML = `
                <thead>
                    <tr>
                        <th>Nombre</th>
                        <th>Customer Key</th>
                        <th>Estado</th>
                        <th>Descripción</th>
                        <th>Creado</th>
                        <th>Modificado</th>
                        <th>Completados</th>
                        <th>En cola</th>
                        <th>Errores</th>
                    </tr>
                </thead>
                <tbody>
                    ${journey.emails.map(email => `
                        <tr>
                            <td>${email.name || 'N/A'}</td>
                            <td>${email.customerKey || 'N/A'}</td>
                            <td style="font-weight: bold; color: ${email.status === 'Active' ? '#2e7d32' : '#666'};">${email.status || 'N/A'}</td>
                            <td>${email.description || '-'}</td>
                            <td>${email.created ? new Date(email.created).toLocaleDateString('es-ES') : 'N/A'}</td>
                            <td>${email.modified ? new Date(email.modified).toLocaleDateString('es-ES') : 'N/A'}</td>
                            <td>${email.completed || '0'}</td>
                            <td>${email.queued || '0'}</td>
                            <td style="font-weight: bold; color: ${parseInt(email.errored || '0') > 0 ? '#d32f2f' : '#666'};">${email.errored || '0'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
            emailSection.appendChild(emailTable);
        } else {
            const text = document.createElement('div');
            text.style.marginLeft = '10px';
            text.textContent = journey.emails.map(e => typeof e === 'string' ? e : e.name).join(', ');
            emailSection.appendChild(text);
        }
        
        commsCell.appendChild(emailSection);
    }

    // SMS, Push, WhatsApp sin bullets
    ['sms', 'pushes', 'whatsapps'].forEach(type => {
        if (journey[type] && journey[type].length > 0) {
            const section = document.createElement('div');
            section.style.marginBottom = '15px';
            section.innerHTML = `<h4 style="margin: 0 0 5px 0;">${type.toUpperCase()}</h4>`;
            
            const text = document.createElement('div');
            text.style.marginLeft = '10px';
            text.textContent = journey[type].join(', ');
            section.appendChild(text);
            
            commsCell.appendChild(section);
        }
    });

    commsRow.appendChild(commsCell);
    mainRow.parentNode.insertBefore(commsRow, mainRow.nextSibling);
    
    if (chevron) chevron.classList.add('open');
}

// --- 3. FUNCIONES PÚBLICAS (API del Módulo) ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas (ej: { getAuthenticatedConfig }).
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    showJourneyAnalyzerView = dependencies.showJourneyAnalyzerView;

    // Listeners de filtros
    elements.journeyNameFilter.addEventListener('input', applyFiltersAndRender);
    elements.journeyTypeFilter.addEventListener('change', applyFiltersAndRender);
    elements.journeySubtypeFilter.addEventListener('change', applyFiltersAndRender);
    elements.journeyStatusFilter.addEventListener('change', applyFiltersAndRender);
    elements.journeyDEFilter.addEventListener('input', applyFiltersAndRender);
    elements.journeyCommsFilter.addEventListener('change', applyFiltersAndRender);

    // Listeners de botones de acción
    elements.downloadJourneysCsvBtn.addEventListener('click', downloadJourneysCsv);
    elements.refreshJourneysTableBtn.addEventListener('click', refreshData);
    elements.getCommunicationsBtn.addEventListener('click', handleCommunicationsAction);
    elements.scanDeUsageBtn.addEventListener('click', analyzeDeUsageInFilteredJourneys);

    elements.copyJourneyBtn.addEventListener('click', copyJourney);
    elements.actionsJourneyBtn.addEventListener('click', handleActionsButton);
    elements.getJourneyErrorsBtn.addEventListener('click', handleErrorsButton);
    elements.analyzeJourneyBtn.addEventListener('click', () => inspectAndShowAnalyzer());

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

    isDeColumnVisible = false;
    document.querySelectorAll('.col-comm, .col-des').forEach(el => el.style.display = 'none');
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
        
        const [allEventDefs, journeysResponse] = await Promise.all([
            mcApiService.fetchAllEventDefinitions(apiConfig),
            mcApiService.fetchAllJourneys(apiConfig)
        ]);

        // Validamos que el servicio nos dio un array.
        if (!Array.isArray(allEventDefs)) {
            throw new Error("La respuesta de Event Definitions no es un array. Revisa la función fetchAllEventDefinitions.");
        }
        
        // Extraemos los journeys del objeto de respuesta si es necesario
        const allJourneys = (journeysResponse && Array.isArray(journeysResponse.items)) ? journeysResponse.items : journeysResponse;
        if (!Array.isArray(allJourneys)) {
             throw new Error("El formato de la respuesta de la API de Journeys no es un array.");
        }

        // Creamos el mapa para la búsqueda rápida por nombre (búsqueda primaria)
        eventDefinitionsMap = {};
        for (const item of allEventDefs) {
            if (item.name) {
                eventDefinitionsMap[item.name] = item;
            }
        }
        
        // Se comenta para reducir tiempo de carga
        // journeyFolderMap = await mcApiService.buildJourneyFolderMap(journeys, apiConfig);
        
        // Pasamos la lista de journeys y el array completo de eventos para el enriquecimiento.
        fullJourneyList = enrichJourneys(allJourneys, allEventDefs);

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
 * @param {Array} allEventDefs - La lista completa de Event Definitions para la búsqueda de fallback.
 * @returns {Array} La lista de journeys enriquecida.
 */
function enrichJourneys(journeys, allEventDefs = []) {
    return journeys.map(journey => {
        // --- 1. Intento de Coincidencia Primaria por Nombre (rápida) ---
        let eventDef = eventDefinitionsMap[journey.name];

        // --- 2. Lógica de Fallback por GUID (más fiable) ---
        if (!eventDef) {
            let journeyGuid = null;

            // Extraer el GUID desde la configuración 'defaults.email' del journey
            if (journey.defaults && journey.defaults.email && journey.defaults.email.length > 0) {
                const emailString = journey.defaults.email[0];
                const guidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
                const matchResult = emailString.match(guidRegex);
                if (matchResult) {
                    journeyGuid = matchResult[0];
                }
            }

            // Si encontramos un GUID, lo buscamos en todas las Event Definitions
            if (journeyGuid) {
                for (const currentEventDef of allEventDefs) {
                    if (currentEventDef.eventDefinitionKey) {
                        const firstHyphenIndex = currentEventDef.eventDefinitionKey.indexOf('-');
                        if (firstHyphenIndex > -1) {
                            const eventDefGuid = currentEventDef.eventDefinitionKey.substring(firstHyphenIndex + 1);
                            
                            // Comparamos los GUIDs ignorando mayúsculas/minúsculas
                            if (eventDefGuid.toLowerCase() === journeyGuid.toLowerCase()) {
                                eventDef = currentEventDef; // ¡Coincidencia encontrada!
                                break; // Salimos del bucle, ya no es necesario seguir buscando
                            }
                        }
                    }
                }
            }
        }
        
        // --- 3. Enriquecimiento Final del Objeto Journey ---
        return {
            ...journey,
            eventType: eventDef?.type || 'No asociado',
            dataExtensionName: eventDef?.dataExtensionName || 'No asociado',
            /*location: journeyFolderMap[journey.categoryId] || 'Carpeta raíz',*/
            emails: [], sms: [], pushes: [], whatsapps: [], activities: null, hasCommunications: false
        };
    });
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
 * Obtiene los detalles de las comunicaciones (emails, sms, pushes y whatsapps) para los journeys seleccionados.
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
        
        // Enriquecer emails con SOAP
        try {
            await enrichEmailsWithSOAP(journeysToProcess, apiConfig);
        } catch (soapError) {
            logger.logMessage(`Error enriqueciendo con SOAP: ${soapError.message}`);
        }
        
        ui.showCustomAlert("Comunicaciones actualizadas.");
    } catch (error) {
        logger.logMessage(` -> ERROR al obtener detalles para "${error.message}"`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        renderFilteredTable();
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Obtiene los detalles de las comunicaciones para TODOS los journeys cargados.
 */
async function getAllCommunications() {
    // 1. Usamos la lista filtrada actual
    const journeysToProcess = currentFilteredList;
    const totalCount = journeysToProcess.length;

    if (totalCount === 0) {
        ui.showCustomAlert("No hay journeys en la lista actual para procesar.");
        return;
    }

    const msg = `Vas a obtener las comunicaciones de los ${totalCount} journeys filtrados. 
                 Este proceso puede tardar un poco. ¿Deseas continuar?`;
    
    if (!await ui.showCustomConfirm(msg)) return;

    ui.blockUI(`Procesando 0 de ${totalCount}...`);
    logger.startLogBuffering();

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        let processed = 0;
        // 2. Procesamos uno a uno para evitar colapsar la API/App
        for (const journey of journeysToProcess) {
            processed++;
            if (processed % 5 === 0) { // Actualizamos el mensaje del loader cada 5
                ui.blockUI(`Procesando ${processed} de ${totalCount}...`);
            }

            if (!journey.hasCommunications) {
                try {
                    const details = await mcApiService.fetchJourneyDetailsById(journey.id, apiConfig);
                    const comms = parseJourneyActivities(details.activities);
                    Object.assign(journey, { 
                        ...comms, 
                        activities: details.activities || [], 
                        hasCommunications: true 
                    });
                } catch (err) {
                    logger.logMessage(`Error en "${journey.name}": ${err.message}`);
                    journey.hasCommunications = false;
                }
            }
        }
        
        // Enriquecer emails con SOAP
        try {
            await enrichEmailsWithSOAP(journeysToProcess, apiConfig);
        } catch (soapError) {
            logger.logMessage(`Error enriqueciendo con SOAP: ${soapError.message}`);
        }
        
        ui.showCustomAlert(`Proceso completado: ${totalCount} journeys analizados.`);

    } catch (error) {
        logger.logMessage(`Error general: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        // 3. Renderizamos la tabla SIN resetear la página actual
        renderFilteredTable(); 
        ui.unblockUI();
        logger.endLogBuffering();
    }
}


/**
 * Orquesta el proceso de clonación de un journey seleccionado.
 */
async function copyJourney() {
    const selected = getSelectedJourneys();
    if (selected.length !== 1) return;
    const journey = selected[0];

    if (journey.eventType === 'EmailAudience') {
        await copyEmailAudienceJourney(journey);
    } else if (journey.eventType === 'AutomationAudience') {
        await copyAutomationAudienceJourney(journey);
    } else {
        ui.showCustomAlert(`La clonación para journeys de tipo "${journey.eventType}" aún no está implementada.`);
    }
}

async function copyAutomationAudienceJourney(journey) {
    // PASO 1: Sigue siendo igual, seleccionamos el automatismo y la DE de origen.
    const selection = await ui.showAutomationDESelectorModal({ getAuthenticatedConfig, mcApiService, logger });
    if (!selection) {
        logger.logMessage("Proceso de clonación de AutomationAudience cancelado por el usuario.");
        return;
    }

    ui.blockUI('Preparando configuración...');

    // Obtenemos la configuración de la API ANTES de llamar al modal.
    const apiConfig = await getAuthenticatedConfig();

    // PASO 2: Llamamos al nuevo modal, AHORA SÍ incluyendo 'apiConfig' en las dependencias.
    const finalConfig = await ui.showJourneyClonerModal(journey, { getAuthenticatedConfig, mcApiService, logger, apiConfig }, selection);
    if (!finalConfig) {
        logger.logMessage("Proceso de clonación cancelado en la configuración final.");
        ui.unblockUI();
        return;
    }

    // PASO 3: Ejecutar clonación
    try {
        logger.logMessage("Iniciando el proceso de clonación de Automation Audience Journey...");
        const originalJourneyDetails = await mcApiService.fetchJourneyDetailsById(journey.id, apiConfig);
        const originalEventDef = await mcApiService.getEventDefinitionById(originalJourneyDetails.triggers[0].metaData.eventDefinitionId, apiConfig);
        const newEventDef = await mcApiService.createAutomationAudienceEventDefinition(originalEventDef, selection.automationId, selection.dataExtensionDetails, apiConfig, finalConfig.newJourneyName);

        const journeyPayload = prepareJourneyForCopy('AutomationAudience', originalJourneyDetails, originalEventDef, newEventDef, finalConfig.newJourneyName, finalConfig.newJourneyCategoryId);
        
        const created = await mcApiService.createJourney(journeyPayload, apiConfig);
        logger.logMessage(`Journey "${created.name}" creado exitosamente con ID ${created.id}.`);
        ui.showCustomAlert(`Journey copiado exitosamente: "${created.name}"`);
        await refreshData();
    } catch (error) {
        logger.logMessage(`ERROR al copiar el Journey: ${error.message}`);
        ui.showCustomAlert(`Error al copiar el Journey: ${error.message}`);
    } finally {
        ui.unblockUI();
    }
}


async function copyEmailAudienceJourney(journey) {
    // PASO 1: Recuperar la DE de origen desde el EventDefinition
    ui.blockUI('Recuperando información de la DE de origen...');
    const apiConfig = await getAuthenticatedConfig();
    const originalJourneyDetails = await mcApiService.fetchJourneyDetailsById(journey.id, apiConfig);
    const originalEventDef = await mcApiService.getEventDefinitionById(originalJourneyDetails.triggers[0].metaData.eventDefinitionId, apiConfig);

    const sourceDeExternalKey = journey.dataExtensionName;
    if (!sourceDeExternalKey) {
        ui.showCustomAlert('No se pudo obtener la Data Extension de origen.');
        ui.unblockUI();
        return;
    }

    // PASO 2: Mostrar el modal para configurar la DE destino y la carpeta del journey
    const finalConfig = await ui.showJourneyClonerModal(journey, { getAuthenticatedConfig, mcApiService, logger, apiConfig }, null);
    if (!finalConfig) {
        logger.logMessage('Proceso de clonación cancelado en el modal.');
        ui.unblockUI();
        return;
    }

    // PASO 3: Ejecutar la clonación
    ui.blockUI('Iniciando clonación...');
    logger.startLogBuffering();

    try {
        logger.logMessage(`Iniciando clonación de Journey tipo EmailAudience: "${journey.name}"...`);

        // 3.1: Clonar la DE de entrada
        logger.logMessage(`Clonando Data Extension "${sourceDeExternalKey}"...`);
        const clonedDe = await mcApiService.cloneDataExtension(
            sourceDeExternalKey,
            finalConfig.newDeName,
            finalConfig.newDeFolderId,
            apiConfig
        );

        // 3.2: Crear el nuevo Event Definition apuntando a la DE clonada
        logger.logMessage('Creando nuevo Event Definition...');
        const newEventDef = await mcApiService.createEmailAudienceEventDefinition(originalEventDef, clonedDe, apiConfig, finalConfig.newJourneyName);

        // 3.3: Preparar el payload del Journey y crearlo
        logger.logMessage('Creando el nuevo Journey...');
        const journeyPayload = prepareJourneyForCopy('EmailAudience', originalJourneyDetails, originalEventDef, newEventDef, finalConfig.newJourneyName, finalConfig.newJourneyCategoryId);
        const createdJourney = await mcApiService.createJourney(journeyPayload, apiConfig);

        logger.logMessage(`✅ Journey clonado exitosamente: "${createdJourney.name}" (ID: ${createdJourney.id})`);
        ui.showCustomAlert(`Journey "${createdJourney.name}" creado con éxito.`);
        await refreshData();
    } catch (error) {
        logger.logMessage(`❌ Error en el proceso de clonación: ${error.message}`);
        ui.showCustomAlert(`Error al copiar el Journey: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}


/**
 * BOTÓN PARAR: Parar los journeys seleccionados con opción de "current", "all", o cancelar.
 */
async function stopJourneys() {
    const journeys = getSelectedJourneys();
    if (journeys.length === 0) return;

    // Llamada a la modal de 3 botones (Asegúrate de tenerla en ui-helpers)
    const choice = await ui.showJourneyStopModal(`¿Cómo deseas detener los ${journeys.length} journeys seleccionados?`);
    if (!choice) return;

    ui.blockUI("Procesando parada...");
    logger.startLogBuffering();

    let totalSuccess = 0;
    let totalError = 0;

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        for (const journey of journeys) {
            const res = await processStopAction(journey, choice, apiConfig);
            totalSuccess += res.success;
            totalError += res.error;
        }
        
        ui.showCustomAlert(`Proceso finalizado.\n\n- Versiones paradas: ${totalSuccess}\n- Errores: ${totalError}`);
    } catch (error) {
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        logger.endLogBuffering();
        ui.unblockUI();
        await refreshData();
    }
}

/**
 * BOTÓN BORRAR: Parada automática de todas las versiones si es Multistep
 */
async function deleteJourneys() {
    const journeys = getSelectedJourneys();
    if (journeys.length === 0) return;

    const type = journeys[0].definitionType;
    if (!await ui.showCustomConfirm(`¿Borrar permanentemente ${journeys.length} journey(s) de tipo ${type}?`)) return;

    if (type === 'Multistep') {
        const proceed = await ui.showCustomConfirm("Se detendrán automáticamente TODAS las versiones antes de borrar. ¿Continuar?");
        if (!proceed) return;
    }

    ui.blockUI("Borrando journeys...");
    logger.startLogBuffering();
    
    const successes = [];
    const failures = [];

    try {
        const apiConfig = await getAuthenticatedConfig();
        for (const journey of journeys) {
            try {
                if (type === 'Multistep') {
                    await processStopAction(journey, 'all', apiConfig);
                }
                await mcApiService.deleteJourney(journey.id, apiConfig);
                successes.push(journey.name);
            } catch (error) {
                failures.push({ name: journey.name, reason: error.message });
            }
        }
        ui.showCustomAlert(`Borrado completado.\nÉxitos: ${successes.length}\nFallos: ${failures.length}`);
    } catch (error) {
        ui.showCustomAlert(`Error general: ${error.message}`);
    } finally {
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
        let valA, valB;

        // La fecha de actividad está anidada en a.activity.lastContactProcessed,
        // no directamente en a['activity'], así que la extraemos explícitamente.
        if (currentSortColumn === 'activityDate') {
            valA = a.activity?.lastContactProcessed ?? null;
            valB = b.activity?.lastContactProcessed ?? null;
        } else {
            valA = a[currentSortColumn];
            valB = b[currentSortColumn];
        }

        const direction = currentSortDirection === 'asc' ? 1 : -1;

        // Nulls siempre al final, sin importar la dirección de orden
        if (valA == null && valB == null) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;

        // Fechas: columnas con 'Date' en el nombre + la columna de actividad
        if (currentSortColumn.includes('Date') || currentSortColumn === 'activityDate') {
            return (new Date(valA) - new Date(valB)) * direction;
        }

        if (typeof valA === 'boolean') {
            return (valA === valB ? 0 : valA ? -1 : 1) * direction;
        }

        // Si ambos valores son números (ej: version), comparar como número,
        // no como string — evita que "10" < "2" por orden alfabético.
        if (typeof valA === 'number' && typeof valB === 'number') {
            return (valA - valB) * direction;
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

    const journeyId = row.dataset.journeyId;
    const journey = currentFilteredList.find(j => j.id === journeyId);
    if (!journey) return;

    const rows = Array.from(elements.journeysTbody.querySelectorAll('tr'));
    const currentIndex = rows.indexOf(row);
    const chevron = row.querySelector('.comm-chevron');

    if (e.shiftKey && lastSelectedIndex !== -1) {
        // Shift: seleccionar rango (sin expandir)
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);
        for (let i = start; i <= end; i++) {
            rows[i].classList.add('selected');
        }
    } else {
        // Click simple: TOGGLE selección + expandir si tiene comms
        const wasSelected = row.classList.contains('selected');
        
        if (wasSelected) {
            // Deseleccionar y colapsar
            row.classList.remove('selected');
            const detailsRow = document.querySelector(`tr[data-comms-for="${journeyId}"]`);
            if (detailsRow) {
                detailsRow.remove();
            }
            if (chevron) chevron.classList.remove('open');
        } else {
            // Seleccionar y expandir si hay comunicaciones
            row.classList.add('selected');
            if (journey.hasCommunications) {
                toggleCommunicationsRow(journeyId, true); // true = abrir
                if (chevron) chevron.classList.add('open');
            }
        }
    }

    lastSelectedIndex = currentIndex;
    updateButtonsState();
}

/**
 * Actualiza el estado de los botones de acción en función de la selección.
 */
function updateButtonsState() {
    const selected = getSelectedJourneys();
    const hasSelection = selected.length > 0;
    const isSingleSelection = selected.length === 1;
    
    // Validar compatibilidad para acciones masivas
    let areCompatible = true;
    if (selected.length > 1) {
        const firstType = selected[0].definitionType;
        const firstStatus = selected[0].status;
        
        // Todos deben tener el mismo definitionType y status
        areCompatible = selected.every(j => 
            j.definitionType === firstType && j.status === firstStatus
        );
    }
    
    elements.getCommunicationsBtn.disabled = !hasSelection;
    elements.copyJourneyBtn.disabled = !isSingleSelection;
    elements.actionsJourneyBtn.disabled = !hasSelection || !areCompatible;
    elements.getJourneyErrorsBtn.disabled = !hasSelection;
    elements.analyzeJourneyBtn.disabled = !isSingleSelection;
}

/**
 * Actualiza el estado visible u oculto de las columnas adicionales (DEs en actividades, comunicaciones).
 */
function updateColumnsVisibility() {
    const showDes = isDeColumnVisible;
   
    document.querySelectorAll('.col-des').forEach(el => {
        el.style.display = showDes ? '' : 'none';
    });
}

/**
 * Actualiza los controles de paginación basándose en el total de elementos.
 * @param {number} totalItems - El número total de elementos (filtrados).
 */
function updatePaginationUI(totalItems) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    elements.totalPagesJourneys.textContent = `/ ${totalPages}`;
    elements.pageInputJourneys.value = currentPage;
    elements.pageInputJourneys.max = totalPages;
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
 * @returns {object} Un objeto con arrays de emails, sms, pushes y whatsapps.
 */
function parseJourneyActivities(activities = []) {
    const communications = { emails: [], sms: [], pushes: [], whatsapps: []  };
    if (!activities) return communications;
    
    for (const activity of activities) {
        if (activity.type === 'EMAILV2') {
            // CORRECCIÓN: Usar triggeredSend.key, NO triggeredSendKey
            const triggeredKey = activity.configurationArguments?.triggeredSend?.key || 
                                 activity.configurationArguments?.triggeredSendKey || 
                                 activity.key;
            
            communications.emails.push({
                name: activity.name,
                customerKey: triggeredKey  // Este es el que se busca en SOAP
            });
        }
        else if (['SMS', 'SMSSYNC'].includes(activity.type)) communications.sms.push(activity.name);
        else if (['INAPP', 'INBOX', 'MOBILEPUSH','PUSHINBOXACTIVITY'].includes(activity.type)) communications.pushes.push(activity.name);
        else if (activity.type === 'WHATSAPPACTIVITY') communications.whatsapps.push(activity.name);
    }
    return communications;
}

async function inspectAndShowAnalyzer() {
    const selected = getSelectedJourneys();
    const j = selected[0];
    ui.blockUI(`Cargando análisis de "${j.name}"...`);

    logger.startLogBuffering(); 
    mcApiService.setLogger(logger);
    logger.logMessage(`Iniciando inspección técnica de: ${j.name}`);

    try {
        const apiConfig = await getAuthenticatedConfig();
        const details = await mcApiService.fetchJourneyDetailsById(j.id, apiConfig);
        showJourneyAnalyzerView(details);
    } catch (error) {
        ui.showCustomAlert(error.message);
        ui.unblockUI();
        logger.endLogBuffering(); 
    }
}

/**
 * Prepara el payload para crear una copia de un Journey.
 * @param {object} originalJourney - El objeto de Journey completo.
 * @param {object} originalEventDef - El objeto de Event Definition original.
 * @param {object} newEventDef - El objeto del nuevo Event Definition.
 * @param {string} newJourneyName - El nombre para el nuevo Journey.
 * @param {string} newJourneyCategoryId - El ID de la carpeta para el nuevo Journey.
 * @returns {object} Un objeto JSON listo para ser enviado en la petición de creación.
 */
function prepareJourneyForCopy(journeyType, originalJourney, originalEventDef, newEventDef, newJourneyName, newJourneyCategoryId) {
    const oldEventDefKey = originalEventDef.eventDefinitionKey;
    const newEventDefKey = newEventDef.eventDefinitionKey;
    
    let journeyString = JSON.stringify(originalJourney);
    const regex = new RegExp(oldEventDefKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    journeyString = journeyString.replace(regex, newEventDefKey);
    
    let finalPayload = JSON.parse(journeyString);

    finalPayload.activities = finalPayload.activities.map(({ id, schema, ...rest }) => rest);

    finalPayload.triggers = finalPayload.triggers.map(trigger => {
        const { id, ...rest } = trigger;
        rest.type = journeyType; 
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
    
    // Usamos los nuevos valores del modal
    finalPayload.name = newJourneyName;
    finalPayload.categoryId = newJourneyCategoryId;
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
 * Actualiza el contador de journeys.
 */
function updateJourneyCount() {
    const total = fullJourneyList.length;
    const filtered = currentFilteredList.length;
    elements.journeyCountSpan.textContent = `(${filtered} de ${total})`;
}

/**
 * Genera y descarga un fichero CSV con los journeys filtrados.
 */
function downloadJourneysCsv() {
    if (currentFilteredList.length === 0) {
        ui.showCustomAlert("No hay datos para descargar.");
        return;
    }

    const headers = ['Nombre Journey', 'Versión', 'Fecha creación', 'Fecha modificación', 'Fecha actividad', 'Tipo', 'Subtipo', 'Estado', 'Data Extension', 'DEs en Actividades', 'Descargado', 'Emails', 'SMSs', 'Pushes', 'Whatsapps'];

    const sortedData = [...currentFilteredList]; // Copiamos para no modificar la original
    sortData(sortedData); // Usamos la función de ordenación existente
    
    const rows = sortedData.map(j => [
        `"${j.name || ''}"`,
        `"${j.version || ''}"`,
        `"${formatDate(j.createdDate)}"`,
        `"${formatDate(j.modifiedDate)}"`,
        `"${formatDate(j.activity?.lastContactProcessed) || '---'}"`,
        `"${j.eventType || ''}"`,
        `"${j.definitionType || ''}"`,
        `"${j.status || ''}"`,
        `"${j.dataExtensionName || ''}"`,
        `"${j.usedDEs || ''}"`,
        `"${j.hasCommunications ? 'Sí' : 'No'}"`,
        `"${j.emails.map(e => typeof e === 'object' ? e.name : e).join(' | ')}"`,
        `"${j.sms.join(' | ')}"`,
        `"${j.pushes.join(' | ')}"`,
        `"${j.whatsapps.join(' | ')}"`
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');

    const BOM = "\uFEFF"; // Byte Order Mark para UTF-8
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

    // Lógica para crear y descargar el fichero
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "journeys.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function handleCommunicationsAction() {
    const selectedCount = getSelectedJourneys().length;
    const totalCount = fullJourneyList.length;

    const choice = await ui.showJourneyCommModal(`¿De qué journeys quieres obtener el detalle de comunicaciones?`);
    if (!choice) return;

    if (choice === 'selected') {
        if (selectedCount === 0) {
            ui.showCustomAlert("No has seleccionado ningún journey de la tabla.");
            return;
        }
        await getCommunications(); // Llama a la lógica existente de seleccionados
    } else if (choice === 'all') {
        await getAllCommunications(); // Llama a la lógica existente de todos
    }
}

/**
 * Analiza las actividades de los journeys filtrados para buscar DEs u Objetos SF.
 * Utiliza lógica de resolución de nombres igual que el Journey Analyzer.
 */
async function analyzeDeUsageInFilteredJourneys() {
    const journeysToProcess = currentFilteredList;
    if (journeysToProcess.length === 0) return;

    if (!await ui.showCustomConfirm(`Vas a analizar las DEs en ${journeysToProcess.length} journeys. Es una acción que realiza muchas llamadas a la API y que no hay que ejecutar constantemente. ¿Deseas continuar?`)) return;

    const total = journeysToProcess.length;
    let actual = 0;
    ui.blockUI(`Escaneando 0 de ${total}...`);
    logger.startLogBuffering();

    try {
        isDeColumnVisible = true;
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        for (const journey of journeysToProcess) {
            actual++;
            ui.blockUI(`Escaneando ${actual} de ${total} Journeys...`);
            
            const details = await mcApiService.fetchJourneyDetailsById(journey.id, apiConfig);
            const activities = details.activities || [];
            const journeyUniqueDEs = new Set(); 

            for (const act of activities) {
                // Filtramos por las actividades que nos interesan
                if (TARGET_DE_ACTIVITIES.includes(act.type) || act.type.includes('DECISION')) {
                    
                    // CASO A: Update Contact
                    if (act.arguments?.activityData?.updateContactFields) {
                        const deId = act.arguments.activityData.updateContactFields[0]?.dataExtensionId;
                        const name = await resolveDeNameForScan(deId, apiConfig, journey.dataExtensionName, 'ObjectID');
                        if (name) journeyUniqueDEs.add(name);
                    }
                    
                    // CASO B: Multicriterio + Simple Decision
                    if (act.arguments?.criteria) {
                        for (const crit of act.arguments.criteria) {
                            if (crit.objectSourceDataExtension) {
                                const name = await resolveDeNameForScan(crit.objectSourceDataExtension, apiConfig, journey.dataExtensionName, 'CustomerKey');
                                if (name) journeyUniqueDEs.add(name);
                            }
                            if (crit.values && Array.isArray(crit.values)) {
                                for (const v of crit.values) {
                                    if (v.objectSourceDataExtension) {
                                        const name = await resolveDeNameForScan(v.objectSourceDataExtension, apiConfig, journey.dataExtensionName, 'CustomerKey');
                                        if (name) journeyUniqueDEs.add(name);
                                    }
                                }
                            }
                        }
                    }
                    
                    // CASO C: Sales Cloud Activity
                    if (act.configurationArguments?.objectName) {
                        const sfObj = act.configurationArguments.objectName || 'Desconocido';
                        journeyUniqueDEs.add(`[SF] ${sfObj}`);
                    }
                }
            }

            // Actualizamos la propiedad del journey
            journey.usedDEs = journeyUniqueDEs.size > 0 ? Array.from(journeyUniqueDEs).join(', ') : '';
        }

        ui.showCustomAlert(`Análisis de DEs completado para ${total} journeys.`);
        applyFiltersAndRender();
    } catch (error) {
        ui.showCustomAlert(`Error en el análisis: ${error.message}`);
        logger.logMessage(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}


async function resolveDeNameForScan(identifier, apiConfig, entryDeName, searchBy = 'ObjectID') {
    if (!identifier) return null;

    // Si ya está en la caché, reutilizar
    if (scanDeCache.has(identifier)) {
        return scanDeCache.get(identifier);
    }

    try {
        const result = await mcApiService.searchDataExtensions(searchBy, identifier, apiConfig);
        if (result && result.length > 0) {
            const name = result[0].Name || identifier;
            scanDeCache.set(identifier, name);
            return name;
        } else {
            const fallback = `[No encontrada: ${identifier}]`;
            scanDeCache.set(identifier, fallback);
            return fallback;
        }
    } catch (error) {
        logger.logMessage(`Error resolving ${searchBy}=${identifier}: ${error.message}`);
        const fallback = `[Error: ${identifier}]`;
        scanDeCache.set(identifier, fallback);
        return fallback;
    }
}

/**
 * Procesa la lógica de parada para un Journey, dependiendo de si es Multistep o Scheduled.
 * @param {object} journey - El objeto journey a procesar.
 * @param {string} choice - 'current', 'all', o cancelar (null/undefined).
 * @param {object} apiConfig - La configuración autenticada de la API.
 * @returns {object} Un resumen con número de éxitos y errores.
 */
async function processStopAction(journey, choice, apiConfig) {
    const type = journey.definitionType;
    let successCount = 0;
    let errorCount = 0;

    if (type === 'Multistep') {
        if (choice === 'current') {
            logger.logMessage(`Parando versión actual (v${journey.version}) del Journey: "${journey.name}"...`);
            try {
                await mcApiService.stopJourney(journey.id, journey.version, apiConfig);
                logger.logMessage(`✓ Versión ${journey.version} de "${journey.name}" parada exitosamente.`);
                successCount++;
            } catch (error) {
                logger.logMessage(`✗ Error al parar v${journey.version} de "${journey.name}": ${error.message}`);
                errorCount++;
            }
        } else if (choice === 'all') {
            logger.logMessage(`Parando TODAS las versiones de "${journey.name}"...`);
            try {
                const allVersions = await mcApiService.fetchJourneyVersions(journey.name, apiConfig);
                for (const v of allVersions) {
                    if (v.status === 'Running') {
                        try {
                            await mcApiService.stopJourney(v.id, v.version, apiConfig);
                            logger.logMessage(`✓ Versión ${v.version} parada.`);
                            successCount++;
                        } catch (error) {
                            logger.logMessage(`✗ Error al parar v${v.version}: ${error.message}`);
                            errorCount++;
                        }
                    }
                }
            } catch (error) {
                logger.logMessage(`✗ Error al obtener versiones de "${journey.name}": ${error.message}`);
                errorCount++;
            }
        }
    } else if (type === 'Scheduled') {
        logger.logMessage(`Parando Journey programado: "${journey.name}" (v${journey.version})...`);
        try {
            await mcApiService.stopJourney(journey.id, journey.version, apiConfig);
            logger.logMessage(`✓ Journey "${journey.name}" (v${journey.version}) parado exitosamente.`);
            successCount++;
        } catch (error) {
            logger.logMessage(`✗ Error al parar "${journey.name}": ${error.message}`);
            errorCount++;
        }
    }

    return { success: successCount, error: errorCount };
}

/**
 * Llena los selectores de filtro con los valores únicos de la lista de journeys.
 * @param {Array} journeys - La lista de journeys cargada.
 */
function populateJourneyFilters(journeys) {
    // Tipos únicos
    const types = [...new Set(journeys.map(j => j.eventType).filter(Boolean))];
    elements.journeyTypeFilter.innerHTML = '<option value="">Todos los tipos</option>';
    types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        elements.journeyTypeFilter.appendChild(opt);
    });

    // Subtipos únicos
    const subtypes = [...new Set(journeys.map(j => j.definitionType).filter(Boolean))];
    elements.journeySubtypeFilter.innerHTML = '<option value="">Todos los subtipos</option>';
    subtypes.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        elements.journeySubtypeFilter.appendChild(opt);
    });

    // Estados únicos
    const statuses = [...new Set(journeys.map(j => j.status).filter(Boolean))];
    elements.journeyStatusFilter.innerHTML = '<option value="">Todos los estados</option>';
    statuses.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        elements.journeyStatusFilter.appendChild(opt);
    });
}

/**
 * Devuelve un array con los journeys cuyas filas estén seleccionadas en la tabla.
 * @returns {Array} La lista de journeys seleccionados.
 */
function getSelectedJourneys() {
    const selectedRows = elements.journeysTbody.querySelectorAll('tr.selected');
    const selectedJourneys = [];
    selectedRows.forEach(row => {
        const journeyId = row.dataset.journeyId;
        const journey = currentFilteredList.find(j => j.id === journeyId);
        if (journey) selectedJourneys.push(journey);
    });
    return selectedJourneys;
}

/**
 * Enriquece emails con datos SOAP (TriggeredSendDefinition + Summary).
 */
async function enrichEmailsWithSOAP(journeys, apiConfig) {
    const allEmailCustomerKeys = [];
    journeys.forEach(j => {
        if (j.emails && j.emails.length > 0) {
            j.emails.forEach(e => {
                if (typeof e === 'object' && e.customerKey) {
                    allEmailCustomerKeys.push(e.customerKey);
                }
            });
        }
    });
    
    if (allEmailCustomerKeys.length === 0) {
        logger.logMessage('⚠️ No hay customer keys para enriquecer con SOAP.');
        return;
    }
    
    logger.logMessage(`📧 CustomerKeys encontrados: ${allEmailCustomerKeys.length}`);
    logger.logMessage(`📧 Keys: ${allEmailCustomerKeys.join(', ')}`);
    
    const uniqueKeys = [...new Set(allEmailCustomerKeys)];
    logger.logMessage(`📧 Keys únicos: ${uniqueKeys.length}`);
    
    // PASO 1: Obtener definiciones
    const defsMap = await mcApiService.fetchTriggeredSendDefinitionsByKeys(uniqueKeys, apiConfig);
    logger.logMessage(`✅ Definiciones obtenidas: ${Object.keys(defsMap).length}`);
    logger.logMessage(`✅ Definiciones: ${JSON.stringify(defsMap, null, 2)}`);
    
    // PASO 2: Extraer ObjectIDs
    const objectIds = Object.values(defsMap).map(d => d.objectId).filter(Boolean);
    logger.logMessage(`🔑 ObjectIDs extraídos: ${objectIds.length}`);
    logger.logMessage(`🔑 IDs: ${objectIds.join(', ')}`);
    
    if (objectIds.length === 0) {
        logger.logMessage('❌ No se obtuvieron ObjectIDs de las definiciones. No se pueden obtener métricas.');
        return;
    }
    
    // PASO 3: Obtener métricas
    const summariesMap = await mcApiService.fetchTriggeredSendSummariesByObjectIds(objectIds, apiConfig);
    logger.logMessage(`📊 Métricas obtenidas: ${Object.keys(summariesMap).length}`);
    logger.logMessage(`📊 Summaries: ${JSON.stringify(summariesMap, null, 2)}`);
    
    // PASO 4: Aplicar enriquecimiento
    let enrichedCount = 0;
    journeys.forEach(journey => {
        if (journey.emails && journey.emails.length > 0) {
            journey.emails = journey.emails.map(email => {
                if (typeof email !== 'object') return email;
                
                const def = defsMap[email.customerKey];
                if (def) {
                    const summary = summariesMap[def.objectId] || {};
                    enrichedCount++;
                    
                    logger.logMessage(`✨ Enriqueciendo "${email.name}" (${email.customerKey})`);
                    logger.logMessage(`   ObjectID: ${def.objectId}`);
                    logger.logMessage(`   Status: ${def.status}`);
                    logger.logMessage(`   Sent: ${summary.sent}, Queued: ${summary.queued}, Errored: ${summary.errored}`);
                    
                    return {
                        ...email,
                        status: def.status,
                        description: def.description,
                        created: def.created,
                        modified: def.modified,
                        completed: summary.sent || '0',
                        queued: summary.queued || '0',
                        errored: summary.errored || '0'
                    };
                } else {
                    logger.logMessage(`❌ Email "${email.name}" (${email.customerKey}) -> NO se encontró en SOAP`);
                }
                return email;
            });
        }
    });
    
    logger.logMessage(`🎉 Enriquecimiento completado: ${enrichedCount} emails procesados`);
}

/**
 * Maneja el botón Acciones.
 */
async function handleActionsButton() {
    const selected = getSelectedJourneys();
    
    if (selected.length === 0) {
        ui.showCustomAlert('Por favor selecciona al menos un journey.');
        return;
    }
    
    ui.showJourneyActionsModal(selected.length, {
        onPause: () => pauseJourneys(selected),
        onResume: () => resumeJourneys(selected),
        onStop: () => stopJourneys(),
        onDelete: () => deleteJourneys()
    });
}

/**
 * Pausa journeys seleccionados.
 */
async function pauseJourneys(journeys) {
    const running = journeys.filter(j => j.status === 'Running');
    
    if (running.length === 0) {
        ui.showCustomAlert('No hay journeys en estado "Running" para pausar.');
        return;
    }
    
    ui.showJourneyPauseModal(running.length, async (pauseOptions) => {
        ui.blockUI(`Pausando ${running.length} journey(s)...`);
        logger.startLogBuffering();
        
        try {
            const apiConfig = await getAuthenticatedConfig();
            mcApiService.setLogger(logger);
            let successCount = 0;
            let errorCount = 0;
            
            for (const journey of running) {
                try {
                    await mcApiService.pauseJourney(journey.id, journey.version, pauseOptions, apiConfig);
                    logger.logMessage(`✓ Pausado: ${journey.name}`);
                    successCount++;
                } catch (error) {
                    logger.logMessage(`✗ Error pausando ${journey.name}: ${error.message}`);
                    errorCount++;
                }
            }
            
            ui.showCustomAlert(`Pausados: ${successCount} | Errores: ${errorCount}`);
            await refreshData();
            
        } catch (error) {
            ui.showCustomAlert(`Error al pausar journeys: ${error.message}`);
        } finally {
            ui.unblockUI();
            logger.endLogBuffering();
        }
    });
}

/**
 * Reanuda journeys seleccionados.
 */
async function resumeJourneys(journeys) {
    const paused = journeys.filter(j => j.status === 'Paused');
    
    if (paused.length === 0) {
        ui.showCustomAlert('No hay journeys en estado "Paused" para reanudar.');
        return;
    }
    
    const confirmed = await ui.showCustomConfirm(`¿Deseas reanudar ${paused.length} journey(s)?`);
    if (!confirmed) return;
    
    ui.blockUI(`Reanudando ${paused.length} journey(s)...`);
    logger.startLogBuffering();
    
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        let successCount = 0;
        let errorCount = 0;
        
        for (const journey of paused) {
            try {
                await mcApiService.resumeJourney(journey.id, journey.version, apiConfig);
                logger.logMessage(`✓ Reanudado: ${journey.name}`);
                successCount++;
            } catch (error) {
                logger.logMessage(`✗ Error reanudando ${journey.name}: ${error.message}`);
                errorCount++;
            }
        }
        
        ui.showCustomAlert(`Reanudados: ${successCount} | Errores: ${errorCount}`);
        await refreshData();
        
    } catch (error) {
        ui.showCustomAlert(`Error al reanudar journeys: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Maneja el botón Ver Errores.
 */
async function handleErrorsButton() {
    const selected = getSelectedJourneys();
    
    if (selected.length === 0) {
        ui.showCustomAlert('Por favor selecciona al menos un journey.');
        return;
    }
    
    const journeyIds = selected.map(j => j.id);
    
    elements.gestionJourneysSection.style.display = 'none';
    elements.journeyErrorsSection.style.display = 'flex';
    
    try {
        const journeyErrorsModule = await import('./journey-errors.js');
        journeyErrorsModule.view(journeyIds);
    } catch (error) {
        logger.logMessage(`Error cargando módulo de errores: ${error.message}`);
        ui.showCustomAlert('Error al cargar la vista de errores');
        elements.journeyErrorsSection.style.display = 'none';
        elements.gestionJourneysSection.style.display = 'flex';
    }
}