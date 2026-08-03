// ===================================================================
// Fichero: src/renderer/components/journey-errors.js
// Componente: Gestión de errores de Journeys
// ===================================================================

import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import * as mcApiService from '../api/mc-api-service.js';

// --- ESTADO DEL MÓDULO ---
let allErrors = [];
let filteredErrors = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 20;
let selectedJourneyIds = [];
let getAuthenticatedConfig;
let goBackFunction; 

// --- FUNCIÓN DE INICIALIZACIÓN ---

/**
 * Inicializa el componente de errores de journeys.
 * @param {object} dependencies - Dependencias inyectadas (getAuthenticatedConfig).
 * @param {Array<string>} journeyIds - IDs de journeys seleccionados.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    goBackFunction = dependencies.goBack; 
    
    setupEventListeners();
    setDefaultDates();
    
    // Si hay journeys seleccionados, cargar errores automáticamente
    if (selectedJourneyIds.length > 0) {
        loadJourneyErrors();
    }
}

export function view(journeyIds = []) {
    selectedJourneyIds = journeyIds;
    
    if (selectedJourneyIds.length > 0) {
        loadJourneyErrors();
    }
}

/**
 * Configura los event listeners de la vista.
 */
function setupEventListeners() {
    // Botón volver
    elements.journeyErrorsBackBtn.addEventListener('click', goBackFunction);

    // Botón actualizar
    elements.refreshJourneyErrorsBtn.addEventListener('click', loadJourneyErrors);

    // Botón descargar CSV
    elements.downloadJourneyErrorsCsvBtn.addEventListener('click', downloadErrorsCSV);

    // Filtros
    elements.journeyErrorsJourneyFilter.addEventListener('input', applyFilters);
    elements.journeyErrorsStatusFilter.addEventListener('change', applyFilters);
    elements.journeyErrorsActivityFilter.addEventListener('input', applyFilters);
    elements.journeyErrorsTypeFilter.addEventListener('change', applyFilters);

    // Paginación
    elements.prevPageBtnJourneyErrors.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            elements.pageInputJourneyErrors.value = currentPage;
            renderTable();
        }
    });

    elements.nextPageBtnJourneyErrors.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredErrors.length / ITEMS_PER_PAGE);
        if (currentPage < totalPages) {
            currentPage++;
            elements.pageInputJourneyErrors.value = currentPage;
            renderTable();
        }
    });

    elements.pageInputJourneyErrors.addEventListener('change', (e) => {
        const totalPages = Math.ceil(filteredErrors.length / ITEMS_PER_PAGE);
        let newPage = parseInt(e.target.value, 10) || 1;
        if (newPage < 1) newPage = 1;
        if (newPage > totalPages) newPage = totalPages;
        currentPage = newPage;
        e.target.value = currentPage;
        renderTable();
    });
}

/**
 * Establece fechas por defecto: últimos 7 días.
 */
function setDefaultDates() {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const formatDate = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    elements.journeyErrorsStartDate.value = formatDate(sevenDaysAgo);
    elements.journeyErrorsEndDate.value = formatDate(today);
}

/**
 * Carga los errores de los journeys seleccionados.
 */
async function loadJourneyErrors() {
    const startDate = elements.journeyErrorsStartDate.value;
    const endDate = elements.journeyErrorsEndDate.value;

    if (!startDate || !endDate) {
        ui.showCustomAlert('Por favor selecciona un rango de fechas válido.');
        return;
    }

    if (selectedJourneyIds.length === 0) {
        ui.showCustomAlert('No hay journeys seleccionados para buscar errores.');
        return;
    }

    ui.blockUI('Buscando errores de journeys...');
    logger.startLogBuffering();

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        
        logger.logMessage(`Buscando errores para ${selectedJourneyIds.length} journey(s)...`);
        logger.logMessage(`Rango: ${startDate} a ${endDate}`);
        
        // Callback de progreso
        const onProgress = (msg) => {
            ui.blockUI(msg);
            logger.logMessage(msg);
        };

        allErrors = await mcApiService.fetchJourneyHistoryErrors(
            selectedJourneyIds,
            startDate,
            endDate,
            apiConfig,
            onProgress
        );

        logger.logMessage(`✅ Se encontraron ${allErrors.length} errores/warnings`);
        
        filteredErrors = [...allErrors];
        currentPage = 1;
        populateJourneyFilter();
        applyFilters();
        renderTable();

        if (allErrors.length === 0) {
            ui.showCustomAlert('No se encontraron errores en el rango de fechas seleccionado.');
        }
    } catch (error) {
        logger.logMessage(`❌ Error al buscar errores: ${error.message}`);
        ui.showCustomAlert(`Error al buscar errores: ${error.message}`);
        console.error('Error fetching journey errors:', error);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Puebla el filtro de journeys con los nombres únicos encontrados.
 */
function populateJourneyFilter() {
    const uniqueJourneys = [...new Set(allErrors.map(e => e.j))].sort();
    
    elements.journeyErrorsJourneyFilter.innerHTML = '<option value="">Todos</option>';
    uniqueJourneys.forEach(journeyName => {
        const option = document.createElement('option');
        option.value = journeyName;
        option.textContent = journeyName;
        elements.journeyErrorsJourneyFilter.appendChild(option);
    });
}

/**
 * Aplica los filtros sobre los errores cargados.
 */
function applyFilters() {
    const journeyFilter = elements.journeyErrorsJourneyFilter.value;
    const statusFilter = elements.journeyErrorsStatusFilter.value;
    const activityFilter = elements.journeyErrorsActivityFilter.value.toLowerCase();
    const typeFilter = elements.journeyErrorsTypeFilter.value;

    filteredErrors = allErrors.filter(err => {
        if (journeyFilter && err.j !== journeyFilter) return false;
        if (statusFilter && err.s !== statusFilter) return false;
        if (activityFilter && !err.a.toLowerCase().includes(activityFilter)) return false;
        if (typeFilter && err.t !== typeFilter) return false;
        return true;
    });

    currentPage = 1;
    elements.pageInputJourneyErrors.value = 1;
    renderTable();
}

/**
 * Renderiza la tabla de errores con paginación.
 */
function renderTable() {
    const tbody = elements.journeyErrorsTbody;
    tbody.innerHTML = '';

    const totalPages = Math.ceil(filteredErrors.length / ITEMS_PER_PAGE) || 1;
    elements.totalPagesJourneyErrors.textContent = `/ ${totalPages}`;
    elements.journeyErrorsCountSpan.textContent = `(${filteredErrors.length} de ${allErrors.length})`;
    elements.pageInputJourneyErrors.max = totalPages;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageErrors = filteredErrors.slice(start, end);

    if (pageErrors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--sf-text-muted);">No hay errores para mostrar</td></tr>';
        return;
    }

    pageErrors.forEach(err => {
        const row = document.createElement('tr');

        // Journey
        const journeyCell = document.createElement('td');
        journeyCell.textContent = err.j;
        journeyCell.title = err.j;
        row.appendChild(journeyCell);

        // Actividad
        const activityCell = document.createElement('td');
        activityCell.textContent = err.a;
        activityCell.title = err.a;
        row.appendChild(activityCell);

        // Tipo
        const typeCell = document.createElement('td');
        typeCell.textContent = err.t === 'EMAILV2' ? 'Email' : err.t === 'SALESCLOUDACTIVITY' ? 'Salesforce' : err.t;
        row.appendChild(typeCell);

        // Contact Key
        const contactCell = document.createElement('td');
        contactCell.textContent = err.c;
        contactCell.title = err.c;
        row.appendChild(contactCell);

        // Estado
        const statusCell = document.createElement('td');
        statusCell.textContent = err.s;
        statusCell.style.fontWeight = 'bold';
        statusCell.style.color = err.s === 'ERROR' ? '#d32f2f' : '#f57c00';
        row.appendChild(statusCell);

        // Mensajes
        const messagesCell = document.createElement('td');
        if (err.e && err.e.length > 0) {
            messagesCell.textContent = err.e.join(' | ');
            messagesCell.title = err.e.join('\n');
        } else {
            messagesCell.textContent = 'Sin mensaje';
            messagesCell.style.fontStyle = 'italic';
            messagesCell.style.color = 'var(--sf-text-muted)';
        }
        row.appendChild(messagesCell);

        // Fecha
        const dateCell = document.createElement('td');
        if (err.d) {
            try {
                const date = new Date(err.d);
                dateCell.textContent = date.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
            } catch (e) {
                dateCell.textContent = err.d;
            }
        } else {
            dateCell.textContent = 'N/A';
        }
        row.appendChild(dateCell);

        tbody.appendChild(row);
    });
}

/**
 * Descarga los errores como CSV.
 */
function downloadErrorsCSV() {
    if (filteredErrors.length === 0) {
        ui.showCustomAlert('No hay errores para exportar.');
        return;
    }

    const headers = ['Journey', 'Actividad', 'Tipo', 'Contact Key', 'Estado', 'Mensajes', 'Fecha/Hora'];
    const rows = filteredErrors.map(err => [
        err.j || '',
        err.a || '',
        err.t || '',
        err.c || '',
        err.s || '',
        err.e && err.e.length > 0 ? err.e.join(' | ') : 'Sin mensaje',
        err.d ? new Date(err.d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'N/A'
    ]);

    const csvRows = [headers.join(',')];
    rows.forEach(row => {
        const escapedRow = row.map(cell => {
            const str = String(cell);
            return str.includes(',') || str.includes('"') || str.includes('\n') 
                ? `"${str.replace(/"/g, '""')}"` 
                : str;
        });
        csvRows.push(escapedRow.join(','));
    });

    const csvContent = csvRows.join('\n');
    const BOM = '\uFEFF'; // UTF-8 BOM
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `journey_errors_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

/**
 * Limpia la caché del módulo (útil al cambiar de cliente).
 */
export function clearCache() {
    allErrors = [];
    filteredErrors = [];
    currentPage = 1;
    selectedJourneyIds = [];
    elements.journeyErrorsTbody.innerHTML = '';
}