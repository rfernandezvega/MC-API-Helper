// Fichero: src/renderer/components/calendar.js
// Descripción: Módulo que encapsula toda la lógica y eventos del Calendario de Automatizaciones.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO DEL MÓDULO ---

let allScheduledAutomations = []; // Caché de automatismos *programados*.
let dailyFilteredAutomations = [];// Subconjunto para el día seleccionado.
let calendarDataForClient = ''; // Nombre del cliente para el cual se cargaron los datos.

let getAuthenticatedConfig; // Dependencia inyectada desde app.js
let showAutomationsView;    // Función para navegar a la vista de automatismos

// --- 2. FUNCIONES PÚBLICAS ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    showAutomationsView = dependencies.showAutomationsView;

    elements.refreshAutomationsBtn.addEventListener('click', () => refreshAutomations(false));
    elements.refreshJourneyAutomationsBtn.addEventListener('click', () => refreshAutomations(true));
    elements.calendarYearSelect.addEventListener('change', generateCalendar);

    elements.calendarGrid.addEventListener('click', (e) => {
        if (e.target.tagName === 'TD' && e.target.dataset.date) {
            document.querySelectorAll('.calendar-month td.selected').forEach(c => c.classList.remove('selected'));
            e.target.classList.add('selected');
            filterAutomationsForDay(e.target.dataset.date);
        }
    });

    elements.automationListHeader.addEventListener('click', () => {
        if (elements.automationListHeader.classList.contains('clickable')) {
            const automationNames = dailyFilteredAutomations.map(a => a.name);
            showAutomationsView(automationNames);
        }
    });
}

/**
 * Prepara y muestra la vista del calendario.
 */
export function view() {
    ui.showSection('calendario-section', null, true); // No gestiona el historial global
    populateCalendarYearSelect();

    const savedDataRaw = localStorage.getItem('calendarAutomations');
    if (savedDataRaw) {
        const savedData = JSON.parse(savedDataRaw);
        if (savedData.client === elements.clientNameInput.value) {
            allScheduledAutomations = savedData.automations;
            calendarDataForClient = savedData.client;
            logger.logMessage(`${allScheduledAutomations.length} automatismos cargados de memoria para el calendario.`);
            generateCalendar();
            return;
        }
    }
    clearData(); // Limpia si no hay datos o son de otro cliente
}

/**
 * Limpia los datos y la UI del calendario.
 */
export function clearData() {
    allScheduledAutomations = [];
    calendarDataForClient = '';
    if (elements.automationList) elements.automationList.innerHTML = '<p>Selecciona un día para ver los detalles.</p>';
    if (elements.calendarGrid) generateCalendar();
}

// --- 3. LÓGICA DE DATOS Y API ---

/**
 * Orquesta la recarga de datos de automatismos desde la API.
 * @param {boolean} journeysOnly - Si es true, filtra solo automatismos que contienen journeys.
 */
async function refreshAutomations(journeysOnly) {
    clearData();
    ui.blockUI(journeysOnly ? "Refrescando Journeys..." : "Refrescando automatismos...");
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const allItems = await mcApiService.fetchAllAutomations(apiConfig);
        let scheduledItems = allItems.filter(item => item.status === 'Scheduled' && item.scheduledTime);

        if (journeysOnly) {
            scheduledItems = scheduledItems.filter(auto => auto.processes?.some(proc => proc.workerCounts?.some(wc => wc.objectTypeId === 952)));
            logger.logMessage(`Se encontraron ${scheduledItems.length} automatismos de Journeys programados.`);
        } else {
            logger.logMessage(`Se encontraron ${scheduledItems.length} automatismos programados.`);
        }

        processAndStoreAutomations(scheduledItems);

        const currentClient = elements.clientNameInput.value;
        localStorage.setItem('calendarAutomations', JSON.stringify({ client: currentClient, automations: allScheduledAutomations }));
        calendarDataForClient = currentClient;
        
        generateCalendar();
        logger.logMessage(`Calendario actualizado con ${allScheduledAutomations.length} ítems.`);
    } catch (e) {
        logger.logMessage(`Error al refrescar datos del calendario: ${e.message}`);
        ui.showCustomAlert(`Error: ${e.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Procesa los datos crudos de la API a un formato simple para el calendario.
 * @param {Array} items - Array de automatismos crudos de la API.
 */
function processAndStoreAutomations(items) {
    allScheduledAutomations = items.map(auto => {
        const dateObj = new Date(auto.scheduledTime);
        return { 
            name: auto.name, 
            status: auto.status, 
            scheduledTime: dateObj.toISOString().split('T')[0], 
            scheduledHour: dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) 
        };
    });
}

// --- 4. RENDERIZADO Y HELPERS DE UI ---

/**
 * Dibuja la estructura completa del calendario para el año seleccionado.
 */
function generateCalendar() {
    if (elements.calendarYearSelect.options.length === 0) {
        populateCalendarYearSelect();
    }
    const year = elements.calendarYearSelect.value;
    elements.calendarGrid.innerHTML = "";
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const days = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
    for (let i = 0; i < 12; i++) {
        const monthDiv = document.createElement("div");
        monthDiv.className = "calendar-month";
        monthDiv.innerHTML = `<h3>${months[i]} ${year}</h3>`;
        const table = document.createElement("table");
        table.innerHTML = `<thead><tr>${days.map(d => `<th>${d}</th>`).join('')}</tr></thead>`;
        const tbody = document.createElement("tbody");
        let firstDay = (new Date(year, i, 1).getDay() + 6) % 7;
        const totalDays = new Date(year, i + 1, 0).getDate();
        let date = 1;
        for (let rowIdx = 0; rowIdx < 6 && date <= totalDays; rowIdx++) {
            const row = document.createElement("tr");
            for (let colIdx = 0; colIdx < 7; colIdx++) {
                const cell = document.createElement("td");
                if ((rowIdx > 0 || colIdx >= firstDay) && date <= totalDays) {
                    const currentDate = `${year}-${String(i + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
                    cell.innerText = date;
                    cell.dataset.date = currentDate;
                    if (allScheduledAutomations.some(auto => auto.scheduledTime === currentDate)) {
                        cell.classList.add("has-automation");
                    }
                    if (colIdx >= 5) cell.classList.add("weekend");
                    date++;
                }
                row.appendChild(cell);
            }
            tbody.appendChild(row);
        }
        table.appendChild(tbody);
        monthDiv.appendChild(table);
        elements.calendarGrid.appendChild(monthDiv);
    }
}

/**
 * Muestra en la barra lateral las automatizaciones para un día específico.
 * @param {string} date - La fecha seleccionada en formato YYYY-MM-DD.
 */
function filterAutomationsForDay(date) {
    elements.automationList.innerHTML = '';
    dailyFilteredAutomations = allScheduledAutomations.filter(auto => auto.scheduledTime === date).sort((a, b) => a.scheduledHour.localeCompare(b.scheduledHour));
    elements.automationListHeader.classList.toggle('clickable', dailyFilteredAutomations.length > 0);
    if (dailyFilteredAutomations.length > 0) {
        dailyFilteredAutomations.forEach(auto => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'automation-item';
            itemDiv.innerHTML = `<div class="automation-name">${auto.name}</div><div class="automation-details">${auto.status} - ${auto.scheduledHour}</div>`;
            elements.automationList.appendChild(itemDiv);
        });
    } else {
        elements.automationList.innerHTML = "<p>No hay automatizaciones programadas.</p>";
    }
}

/**
 * Rellena el selector de año del calendario con años relevantes.
 */
function populateCalendarYearSelect() {
    if (elements.calendarYearSelect.options.length > 0) return; // Evita re-rellenar
    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 2; i <= currentYear + 3; i++) {
        elements.calendarYearSelect.appendChild(new Option(i, i));
    }
    elements.calendarYearSelect.value = currentYear;
}