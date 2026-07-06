// Fichero: src/renderer/components/automations-manager.js
// Descripción: Módulo que encapsula toda la lógica de la vista "Gestión de Automatismos".

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import * as calendar from './calendar.js';
import { escapeHtml, formatDate } from '../ui/format-utils.js';
import { createTableSorter, createPaginator, renderStatusBadge } from '../ui/table-utils.js';

// --- 1. ESTADO DEL MÓDULO ---
let fullAutomationList = [];
const ITEMS_PER_PAGE = 15;

// Controladores reutilizables de ordenación y paginación (WP-4/WP-5), instanciados en
// init(). La ordenación inicial se mantiene: 'lastRunTime' (fecha) descendente.
let sorter = null;
let paginator = null;

let currentFilteredList = [];

let getAuthenticatedConfig;
let showAutomationClonerView;
let showAutomationAnalyzerView;

let isNotifColumnsVisible = false;
let lastSelectedIndex = -1;

// --- 2. LÓGICA DE RENDERIZADO Y FILTRADO ---

/**
 * Se llama cuando se cambia un FILTRO. Resetea la paginación y renderiza.
 */
function applyFiltersAndRender() {
    // update() vuelve a página 1 sin disparar onPageChange (el render lo hacemos aquí)
    paginator?.update(0, 1);
    renderFilteredTable();
}

/**
 * Aplica los filtros actuales y llama al renderizado final.
 * No resetea la paginación, por lo que es ideal para paginar.
 */
function renderFilteredTable() {
    let filtered = fullAutomationList;
    
    const nameFilter = elements.automationNameFilter.value.toLowerCase().trim();
    if (nameFilter) {
        // Soporta múltiples nombres separados por '|' para el filtro del calendario
        const names = nameFilter.split(/[,;|]/).map(n => n.trim().toLowerCase()).filter(n => n !== '');
        filtered = filtered.filter(auto => names.some(n => auto.name.toLowerCase().includes(n)));
    }

    const statusFilter = elements.automationStatusFilter.value;
    if (statusFilter) {
        filtered = filtered.filter(auto => auto.status === statusFilter);
    }

    const journeyFilter = elements.automationJourneyFilter.value;
    if (journeyFilter === 'yes') {
        filtered = filtered.filter(auto => auto.launchesJourney);
    } else if (journeyFilter === 'no') {
        filtered = filtered.filter(auto => !auto.launchesJourney);
    }

    // Filtro por rango de fechas
    const dateField = elements.automationDateField.value;
    const dateFrom = elements.automationDateFrom.value;
    const dateTo = elements.automationDateTo.value;
    if (dateField && (dateFrom || dateTo)) {
        filtered = filtered.filter(auto => ui.isDateInRange(auto[dateField], dateFrom, dateTo));
    }

    // Filtro por notificaciones (solo aplica cuando se han cargado)
    const notifFilter = isNotifColumnsVisible ? elements.automationNotifFilter.value.toLowerCase().trim() : '';
    if (notifFilter) {
        filtered = filtered.filter(auto => {
            const err = (auto.notifications?.Error || '').toLowerCase();
            const comp = (auto.notifications?.Complete || '').toLowerCase();
            return err.includes(notifFilter) || comp.includes(notifFilter);
        });
    }

    currentFilteredList = filtered; // Guardamos la lista filtrada
    updateAutomationCount(); // Actualizamos el contador
    
    renderTable(filtered);
}

/**
 * Dibuja el HTML de la tabla con los datos (ya filtrados y ordenados).
 * @param {Array} automations - La lista de automatismos a mostrar.
 */
function renderTable(automations) {
    if (sorter) sorter.sort(automations);

    // paginate() recalcula el total de páginas y devuelve solo la página actual
    const paginatedItems = paginator ? paginator.paginate(automations) : automations;

    elements.automationsTbody.innerHTML = '';
    if (paginatedItems.length === 0) {
        elements.automationsTbody.innerHTML = '<tr><td colspan="7">No hay automatismos para mostrar.</td></tr>';
    } else {
        paginatedItems.forEach(auto => {
            const row = document.createElement('tr');
            row.dataset.automationId = auto.id;

            const errorNotif = auto.notifications?.Error ?? '---';
            const completeNotif = auto.notifications?.Complete ?? '---';
            const journeyIcon = auto.launchesJourney ? 'Sí' : 'No';

            // Datos de la API (nombre, estado, notificaciones): se escapan antes de interpolar
            row.innerHTML = `
                <td>${escapeHtml(auto.name) || 'Sin Nombre'}</td>
                <td>${formatDate(auto.lastRunTime)}</td>
                <td>${formatDate(auto.scheduledTime)}</td>
                <td>${auto.status ? renderStatusBadge(auto.status) : '---'}</td>
                <td class="ta-center">${journeyIcon}</td>
                <td class="col-notif">${escapeHtml(errorNotif)}</td>
                <td class="col-notif">${escapeHtml(completeNotif)}</td>
            `;
            elements.automationsTbody.appendChild(row);
        });
    }

    elements.paginationAutomations.style.display = 'flex';
    if (sorter) sorter.updateIndicators();
    updateButtonsState();
    updateNotifColumnsVisibility();
}

// --- 3. FUNCIONES PÚBLICAS (API del Módulo) ---

/**
 * Inicializa el módulo, configurando todos sus event listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    showAutomationClonerView = dependencies.showAutomationClonerView;
    showAutomationAnalyzerView = dependencies.showAutomationAnalyzerView;

    elements.downloadAutomationsCsvBtn.addEventListener('click', downloadAutomationsCsv);
    elements.actionsAutomationBtn.addEventListener('click', showAutomationActionsModal);
    elements.automationJourneyFilter.addEventListener('change', applyFiltersAndRender);
    elements.cloneAutomationBtn.addEventListener('click', () => inspectAndShowCloner());
    elements.refreshAutomationsTableBtn.addEventListener('click', refreshData);
    // Abre el calendario (drawer) con los automatismos actualmente filtrados en la vista.
    elements.calendarBtn?.addEventListener('click', () => calendar.open(currentFilteredList));
    elements.getNotificationsBtn.addEventListener('click', loadNotificationsForVisibleRows);
    elements.analyzeAutomationBtn.addEventListener('click', () => analyzeSelectedAutomation());

    elements.automationNameFilter.addEventListener('input', applyFiltersAndRender);
    elements.automationStatusFilter.addEventListener('change', applyFiltersAndRender);
    elements.automationNotifFilter.addEventListener('input', applyFiltersAndRender);
    elements.automationDateField.addEventListener('change', applyFiltersAndRender);
    elements.automationDateFrom.addEventListener('change', applyFiltersAndRender);
    elements.automationDateTo.addEventListener('change', applyFiltersAndRender);
    
    // Ordenación — controlador reutilizable (las columnas *Time se ordenan como fecha).
    // Al ordenar se resetea la paginación, igual que hacía el handleSort local.
    sorter = createTableSorter({
        tableSelector: '#automations-table',
        initialColumn: 'lastRunTime',
        initialDirection: 'desc',
        types: { lastRunTime: 'date', scheduledTime: 'date' },
        onSort: applyFiltersAndRender
    });
    sorter.attach();

    // Paginación — controlador reutilizable sobre los 4 controles estándar
    paginator = createPaginator(
        {
            pageInput: elements.pageInputAutomations,
            totalLabel: elements.totalPagesAutomations,
            prevBtn: elements.prevPageBtnAutomations,
            nextBtn: elements.nextPageBtnAutomations
        },
        { itemsPerPage: ITEMS_PER_PAGE, onPageChange: renderFilteredTable }
    );

    // Si el input de página queda vacío al perder el foco, volvemos a la página 1
    elements.pageInputAutomations.addEventListener('blur', () => {
        if (elements.pageInputAutomations.value === '') {
            // update() cambia de página sin disparar onPageChange; el render es explícito
            paginator.update(0, 1);
            renderFilteredTable();
        }
    });
    elements.automationsTbody.addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (!row || !row.dataset.automationId) return;

    const rows = Array.from(elements.automationsTbody.querySelectorAll('tr'));
    const currentIndex = rows.indexOf(row);

    if (e.shiftKey && lastSelectedIndex !== -1) {
        const start = Math.min(currentIndex, lastSelectedIndex);
        const end = Math.max(currentIndex, lastSelectedIndex);
        for (let i = start; i <= end; i++) {
            rows[i].classList.add('selected');
        }
    } else {
        row.classList.toggle('selected');
    }

    lastSelectedIndex = currentIndex;
    updateButtonsState();
});
}

/**
 * Prepara y muestra los datos en la vista. Es el punto de entrada principal.
 * @param {Array<string>} [automationNamesToFilter=null] - Nombres para filtrar desde el calendario.
 */
export async function view(automationNamesToFilter = null) {
    if (fullAutomationList.length === 0) {
        await fetchData();
    }

    // Resetea los filtros de la UI antes de aplicar los nuevos (si los hay)
    elements.automationNameFilter.value = '';
    elements.automationStatusFilter.value = '';

    if (automationNamesToFilter && automationNamesToFilter.length > 0) {
        // Usamos '|' como separador que nuestra lógica de filtro ya puede interpretar como un 'OR'
        elements.automationNameFilter.value = automationNamesToFilter.join(' | ');
    }
    
    applyFiltersAndRender();
}

/**
 * Limpia la caché de datos de este módulo. Se llama al cambiar de cliente.
 */
export function clearCache() {
    fullAutomationList = [];
    paginator?.update(0, 1);
    elements.automationNameFilter.value = '';
    elements.automationStatusFilter.innerHTML = '<option value="">Todos los estados</option>';
    elements.automationsTbody.innerHTML = '';
    elements.automationJourneyFilter.value = '';
    elements.automationNotifFilter.value = '';
    elements.automationNotifFilter.style.display = 'none';
    elements.automationDateField.value = '';
    elements.automationDateFrom.value = '';
    elements.automationDateTo.value = '';
    isNotifColumnsVisible = false;
}

// --- 4. LÓGICA INTERNA DEL MÓDULO ---

/**
 * Fuerza una recarga de los datos desde la API.
 */
async function refreshData() {
    clearCache();
    await view();
}

/**
 * Obtiene todos los automatismos desde el mc-api-service.
 */
async function fetchData() {
    ui.blockUI("Recuperando automatismos...");
    logger.startLogBuffering();
    try {
        logger.logMessage("Cargando lista de Automatismos por primera vez...");
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        
        fullAutomationList = await mcApiService.fetchAllAutomations(apiConfig);

        // Filtrar automatismos de sistema (empiezan por el MID de la BU activa)
        let mid = elements.activeMidInput?.value?.trim();
        if (mid) {
            fullAutomationList = fullAutomationList.filter(a => !a.name.startsWith(mid));
        }

        // Calcular si cada automatismo lanza un journey (objectTypeId 952)
        fullAutomationList.forEach(auto => {
            auto.launchesJourney = (auto.processes || []).some(proc =>
                (proc.workerCounts || []).some(wc => wc.objectTypeId === 952)
            );
        });

        populateStatusFilter(fullAutomationList);
    } catch (error) {
        logger.logMessage(`Error al cargar Automatismos: ${error.message}`);
        ui.showCustomAlert(`Error al cargar Automatismos: ${error.message}`);
        elements.automationsTbody.innerHTML = `<tr><td colspan="7" class="error-text">Error al cargar: ${escapeHtml(error.message)}</td></tr>`;
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Realiza una acción masiva sobre los automatismos seleccionados.
 */
async function performAction(actionName) {
    const selectedRows = document.querySelectorAll('#automations-table tbody tr.selected');
    if (selectedRows.length === 0) return;

    const selectedAutomations = Array.from(selectedRows).map(row => fullAutomationList.find(auto => auto.id === row.dataset.automationId)).filter(Boolean);
    if (selectedAutomations.length === 0) return;

    if (!await ui.showCustomConfirm(`¿Seguro que quieres '${actionName}' ${selectedAutomations.length} automatismo(s)?`)) return;

    ui.blockUI(`Realizando acción ${actionName}...`);
    logger.startLogBuffering();
    const successes = [];
    const failures = [];

    try {
        const apiConfig = await getAuthenticatedConfig();
        const actionServiceMap = {
            activate: mcApiService.activateAutomation,
            run: mcApiService.runAutomation,
            pause: mcApiService.pauseAutomation
        };
        for (const auto of selectedAutomations) {
            try {
                logger.logMessage(`Iniciando acción '${actionName}' para el automatismo: "${auto.name}"...`);
                await actionServiceMap[actionName](auto.id, apiConfig);
                successes.push({ name: auto.name });
            } catch (error) {
                logger.logMessage(`FALLO al procesar "${auto.name}": ${error.message}`);
                failures.push({ name: auto.name, reason: error.message });
            }
        }
    } catch (error) {
        logger.logMessage(`Error fatal durante la acción '${actionName}': ${error.message}`);
    } finally {
        const alertSummary = `Acción '${actionName}' completada. Éxitos: ${successes.length}, Fallos: ${failures.length}.`;
        logger.logMessage(alertSummary + (failures.length > 0 ? `\n\n--- Detalles de Fallos ---\n${failures.map(f => `  - ${f.name}: ${f.reason}`).join('\n')}` : ''));
        ui.showCustomAlert(alertSummary);
        ui.unblockUI();
        logger.endLogBuffering();
        await refreshData();
    }
}

/**
 * Muestra el modal de acciones sobre automatismos (Activar/Ejecutar/Parar).
 */
function showAutomationActionsModal() {
    const selectedRows = document.querySelectorAll('#automations-table tbody tr.selected');
    if (selectedRows.length === 0) return;

    const modal = elements.automationActionsModal;
    elements.automationActionsMessage.textContent = `Has seleccionado ${selectedRows.length} automatismo(s). ¿Qué acción deseas realizar?`;

    // Calcular estados para habilitar/deshabilitar botones del modal
    const selectedAutomations = Array.from(selectedRows)
        .map(row => fullAutomationList.find(auto => auto.id === row.dataset.automationId))
        .filter(Boolean);
    const statuses = [...new Set(selectedAutomations.map(a => a.status?.toLowerCase()))];
    const isSingleStatus = statuses.length === 1;
    const singleStatus = statuses[0];

    elements.automationActionsActivateBtn.disabled = !(isSingleStatus && ['pausedschedule', 'stopped'].includes(singleStatus));
    elements.automationActionsRunBtn.disabled = !(isSingleStatus && ['pausedschedule', 'stopped'].includes(singleStatus));
    elements.automationActionsStopBtn.disabled = !(isSingleStatus && ['scheduled', 'ready'].includes(singleStatus));

    // Limpiar listeners previos clonando botones
    const cloneAndReplace = (el) => {
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        return newEl;
    };

    const activateBtn = cloneAndReplace(elements.automationActionsActivateBtn);
    const runBtn = cloneAndReplace(elements.automationActionsRunBtn);
    const stopBtn = cloneAndReplace(elements.automationActionsStopBtn);
    const cancelBtn = cloneAndReplace(elements.automationActionsCancelBtn);

    // Actualizar referencias
    elements.automationActionsActivateBtn = activateBtn;
    elements.automationActionsRunBtn = runBtn;
    elements.automationActionsStopBtn = stopBtn;
    elements.automationActionsCancelBtn = cancelBtn;

    // Re-aplicar disabled después de clonar
    activateBtn.disabled = !(isSingleStatus && ['pausedschedule', 'stopped'].includes(singleStatus));
    runBtn.disabled = !(isSingleStatus && ['pausedschedule', 'stopped'].includes(singleStatus));
    stopBtn.disabled = !(isSingleStatus && ['scheduled', 'ready'].includes(singleStatus));

    activateBtn.addEventListener('click', () => { modal.style.display = 'none'; performAction('activate'); });
    runBtn.addEventListener('click', () => { modal.style.display = 'none'; performAction('run'); });
    stopBtn.addEventListener('click', () => { modal.style.display = 'none'; performAction('pause'); });
    cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });

    modal.style.display = 'flex';
}

/**
 * Recupera los detalles de los automatismos seleccionados y los muestra en el log.
 * Sigue el flujo: 1. Obtiene nombre -> 2. Busca por nombre en API v1 -> 3. Obtiene ID -> 4. Busca detalles por ID.
 */
async function inspectAndShowCloner() {
    const selectedRows = document.querySelectorAll('#automations-table tbody tr.selected');
    
    if (selectedRows.length !== 1) {
        ui.showCustomAlert("Por favor, selecciona exactamente un automatismo para clonar.");
        return;
    }

    const row = selectedRows[0];
    const automationFromList = fullAutomationList.find(auto => auto.id === row.dataset.automationId);
    if (!automationFromList) return;

    if (automationFromList.status === 'Building') {
        ui.showCustomAlert("No se puede clonar un automatismo que está en estado 'Building'.");
        return;
    }

    if (!await ui.showCustomConfirm(`¿Quieres iniciar la clonación selectiva para "${automationFromList.name}"?`)) {
        return;
    }

    ui.blockUI(`Cargando detalles de "${automationFromList.name}"...`);

    try {
        const apiConfig = await getAuthenticatedConfig();
        
        // Usamos el ID de la lista legacy, que es válido para la API v1 de detalles
        const details = await mcApiService.fetchAutomationDetailsById(automationFromList.id, apiConfig);

        // Llamamos a la función puente de app.js para mostrar la nueva vista
        showAutomationClonerView(details);

    } catch (error) {
        ui.showCustomAlert(`Ocurrió un error al cargar los detalles: ${error.message}.`);
    } 
}

async function analyzeSelectedAutomation() {
    const selectedRows = document.querySelectorAll('#automations-table tbody tr.selected');
    const row = selectedRows[0];
    const automationFromList = fullAutomationList.find(auto => auto.id === row.dataset.automationId);
    
    ui.blockUI(`Cargando análisis de "${automationFromList.name}"...`);
    try {
        const apiConfig = await getAuthenticatedConfig();
        // Obtenemos los detalles v1 (pasos y actividades)
        const details = await mcApiService.fetchAutomationDetailsById(automationFromList.id, apiConfig);
        
        // Llamamos a la nueva vista
        showAutomationAnalyzerView(details);
    } catch (error) {
        ui.showCustomAlert(`Error al cargar el analizador: ${error.message}`);
        ui.unblockUI();
    }
}

// --- 5. HELPERS DE UI ---

/**
 * Rellena el desplegable de filtro de estados.
 */
function populateStatusFilter(automations) {
    const currentSelectedValue = elements.automationStatusFilter.value;
    elements.automationStatusFilter.innerHTML = '<option value="">Todos los estados</option>';
    const statuses = [...new Set(automations.map(auto => auto.status).filter(Boolean))].sort();
    statuses.forEach(status => elements.automationStatusFilter.appendChild(new Option(status, status)));
    elements.automationStatusFilter.value = currentSelectedValue;
}

/**
 * Actualiza el estado de los botones de acción.
 */
function updateButtonsState() {
    const selectedRows = document.querySelectorAll('#automations-table tbody tr.selected');
    if (selectedRows.length === 0) {
        elements.actionsAutomationBtn.disabled = true;
        elements.cloneAutomationBtn.disabled = true;
        elements.analyzeAutomationBtn.disabled = true;
        return;
    }

    elements.analyzeAutomationBtn.disabled = (selectedRows.length !== 1);
    elements.cloneAutomationBtn.disabled = true;

    if (selectedRows.length === 1) {
        const selectedAutomation = fullAutomationList.find(auto => auto.id === selectedRows[0].dataset.automationId);
        if (selectedAutomation && selectedAutomation.status !== 'Building') {
            elements.cloneAutomationBtn.disabled = false;
        }
    }

    // Validar compatibilidad de estados para acciones masivas
    const selectedAutomations = Array.from(selectedRows)
        .map(row => fullAutomationList.find(auto => auto.id === row.dataset.automationId))
        .filter(Boolean);
    const statuses = [...new Set(selectedAutomations.map(auto => auto.status))];
    elements.actionsAutomationBtn.disabled = (statuses.length > 1);
}

/**
 * Muestra u oculta las columnas de notificaciones según el flag.
 */
function updateNotifColumnsVisibility() {
    const display = isNotifColumnsVisible ? '' : 'none';
    document.querySelectorAll('#automations-table .col-notif').forEach(el => {
        el.style.display = display;
    });
    // El filtro por notificaciones aparece junto con las columnas
    if (elements.automationNotifFilter) {
        elements.automationNotifFilter.style.display = isNotifColumnsVisible ? '' : 'none';
    }
}

/**
 * Actualiza el contador de automatismos.
 */
function updateAutomationCount() {
    const total = fullAutomationList.length;
    const filtered = currentFilteredList.length;
    elements.automationCountSpan.textContent = `(${filtered} de ${total})`;
}

/**
 * Genera y descarga un fichero CSV con los automatismos filtrados.
 */
function downloadAutomationsCsv() {
    if (currentFilteredList.length === 0) {
        ui.showCustomAlert("No hay datos para descargar.");
        return;
    }

    // Cabeceras base
    let headers = ['Nombre', 'Última Ejecución', 'Próxima Ejecución', 'Estado', 'Lanza Journey'];
    
    // Comprobar si algún elemento tiene notificaciones para añadir cabeceras
    const hasNotifs = currentFilteredList.some(a => a.notifications);
    if (hasNotifs) {
        headers.push('Errores', 'Ejecuciones');
    }

    const sortedData = [...currentFilteredList];
    if (sorter) sorter.sort(sortedData);
    
    const rows = sortedData.map(auto => {
        let rowData = [
            `"${auto.name || ''}"`,
            `"${formatDate(auto.lastRunTime)}"`,
            `"${formatDate(auto.scheduledTime)}"`,
            `"${auto.status || ''}"`,
            `"${auto.launchesJourney ? 'Sí' : 'No'}"`
        ];

        if (hasNotifs) {
            rowData.push(`"${auto.notifications?.Error || ''}"`);
            rowData.push(`"${auto.notifications?.Complete || ''}"`);
        }

        return rowData.join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    
    const BOM = "\uFEFF"; // Byte Order Mark para UTF-8
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

    // Lógica para crear y descargar el fichero
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "automatismos.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


/**
 * Carga las notificaciones para todos los automatismos que están visibles actualmente (filtrados).
 */
async function loadNotificationsForVisibleRows() {
    if (currentFilteredList.length === 0) return;

    ui.blockUI(`Cargando notificaciones de ${currentFilteredList.length} automatismos...`);
    logger.startLogBuffering();

    try {
        const apiConfig = await getAuthenticatedConfig();
        
        // Ejecutamos las llamadas en paralelo para mayor velocidad
        const promises = currentFilteredList.map(async (auto) => {
            try {
                const data = await mcApiService.fetchAutomationNotifications(auto.id, apiConfig);
                
                // Inicializamos el objeto de notificaciones en el automatismo
                auto.notifications = {
                    Error: '---',
                    Complete: '---'
                };

                if (data && data.workers && data.workers.length > 0) {
                    // Agrupamos los emails por tipo (Error o Complete)
                    const errors = data.workers
                        .filter(w => w.notificationType === 'Error')
                        .map(w => w.definition)
                        .join(' ');
                    
                    const completes = data.workers
                        .filter(w => w.notificationType === 'Complete')
                        .map(w => w.definition)
                        .join(' ');

                    auto.notifications.Error = errors || '---';
                    auto.notifications.Complete = completes || '---';
                }
            } catch (err) {
                console.error(`Error cargando notificación para ${auto.id}`, err);
                auto.notifications = { Error: 'Error API', Complete: 'Error API' };
            }
        });

        await Promise.all(promises);
        logger.logMessage("Notificaciones cargadas correctamente.");
        
        isNotifColumnsVisible = true;

        // Volvemos a renderizar la tabla para mostrar los nuevos datos
        renderFilteredTable();

    } catch (error) {
        logger.logMessage(`Error general al cargar notificaciones: ${error.message}`);
        ui.showCustomAlert("Error al cargar notificaciones.");
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}