// RUTA: src/renderer/js/modules/calendar.js

import * as api from '../api/sfmc-api.js';
import { getTokenAndConfig } from './config-api.js';
import { logMessage, blockUI, unblockUI } from '../main-renderer.js';

let calendarGrid, calendarYearSelect, automationList, refreshAutomationsBtn;
let allAutomations = [];

function queryElements() {
    calendarGrid = document.getElementById('calendar-grid');
    calendarYearSelect = document.getElementById('calendarYearSelect');
    automationList = document.getElementById('automation-list');
    refreshAutomationsBtn = document.getElementById('refreshAutomationsBtn');
}

function attachListeners() {
    refreshAutomationsBtn.addEventListener('click', handleRefreshAutomations);
    calendarYearSelect.addEventListener('change', generateCalendar);
}

async function handleRefreshAutomations() {
    blockUI();
    logMessage("Recuperando automatizaciones de Journeys...");
    automationList.innerHTML = '<p>Buscando automatizaciones...</p>';
    try {
        const config = await getTokenAndConfig();
        const rawAutomations = await api.getScheduledJourneyAutomations(config);
        processAndStoreAutomations(rawAutomations);

        const clientName = config.clientName || 'default';
        const dataToSave = { client: clientName, automations: allAutomations };
        localStorage.setItem('calendarAutomations', JSON.stringify(dataToSave));
        
        logMessage(`${allAutomations.length} automatizaciones encontradas.`);
        generateCalendar();
        automationList.innerHTML = '<p>Datos actualizados. Selecciona un día.</p>';

    } catch (error) {
        alert(`Error al recuperar automatizaciones: ${error.message}`);
        logMessage(`Error: ${error.message}`);
        automationList.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    } finally {
        unblockUI();
    }
}

function processAndStoreAutomations(items) {
    allAutomations = items.map(auto => {
        const dateObj = new Date(auto.schedule.scheduledTime);
        let scheduledDate = "N/A", scheduledHour = "N/A";
        if (!isNaN(dateObj.getTime())) {
            scheduledDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
            const madridOffset = dateObj.getTimezoneOffset() < -60 ? 2 : 1;
            dateObj.setHours(dateObj.getUTCHours() + madridOffset);
            scheduledHour = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
        }
        return { name: auto.name, status: auto.schedule.scheduleStatus, scheduledDate, scheduledHour };
    });
}

function generateCalendar() {
    if (!calendarGrid) return;
    const year = calendarYearSelect.value;
    calendarGrid.innerHTML = "";
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const daysOfWeek = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
    
    for (let i = 0; i < 12; i++) {
        const monthDiv = document.createElement("div");
        monthDiv.className = "calendar-month";
        monthDiv.innerHTML = `<h3>${months[i]} ${year}</h3>`;
        const table = document.createElement("table");
        table.innerHTML = `<thead><tr>${daysOfWeek.map(d => `<th>${d}</th>`).join('')}</tr></thead>`;
        const tbody = document.createElement("tbody");
        let firstDay = new Date(year, i, 1).getDay();
        firstDay = (firstDay === 0) ? 6 : firstDay - 1;
        const totalDays = new Date(year, i + 1, 0).getDate();
        
        let date = 1;
        for (let j = 0; j < 6; j++) {
            const row = document.createElement("tr");
            for (let k = 0; k < 7; k++) {
                const cell = document.createElement("td");
                if ((j === 0 && k < firstDay) || date > totalDays) {
                    // Celdas vacías
                } else {
                    cell.innerText = date;
                    const currentDateStr = `${year}-${String(i + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
                    cell.dataset.date = currentDateStr;
                    if (allAutomations.some(auto => auto.scheduledDate === currentDateStr)) cell.classList.add("has-automation");
                    if (k >= 5) cell.classList.add("weekend");
                    cell.addEventListener('click', () => {
                        document.querySelectorAll('.calendar-month td.selected').forEach(c => c.classList.remove('selected'));
                        cell.classList.add('selected');
                        filterAutomationsForDay(currentDateStr);
                    });
                    date++;
                }
                row.appendChild(cell);
            }
            tbody.appendChild(row);
            if (date > totalDays) break;
        }
        table.appendChild(tbody);
        monthDiv.appendChild(table);
        calendarGrid.appendChild(monthDiv);
    }
}

function filterAutomationsForDay(date) {
    automationList.innerHTML = '';
    const filtered = allAutomations.filter(auto => auto.scheduledDate === date).sort((a,b) => a.scheduledHour.localeCompare(b.scheduledHour));
    if (filtered.length > 0) {
        filtered.forEach(auto => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'automation-item';
            itemDiv.innerHTML = `<div class="automation-name">${auto.name}</div><div class="automation-details">${auto.status} - ${auto.scheduledHour}</div>`;
            automationList.appendChild(itemDiv);
        });
    } else {
        automationList.innerHTML = "<p>No hay automatizaciones programadas para este día.</p>";
    }
}

function loadInitialData() {
    const savedDataRaw = localStorage.getItem('calendarAutomations');
    const clientConfig = JSON.parse(localStorage.getItem('mcApiConfigs')) || {};
    const lastClient = localStorage.getItem('lastSelectedClient');
    const clientName = clientConfig[lastClient]?.clientName || 'default';

    if (savedDataRaw) {
        const savedData = JSON.parse(savedDataRaw);
        if (savedData.client === clientName) {
            allAutomations = savedData.automations;
            logMessage(`${allAutomations.length} automatizaciones cargadas de memoria.`);
            return;
        }
    }
    allAutomations = [];
    logMessage("No hay datos de calendario para este cliente.");
}

export function initCalendarModule() {
    queryElements();
    attachListeners();
    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
        calendarYearSelect.appendChild(new Option(i, i));
    }
    calendarYearSelect.value = currentYear;
    loadInitialData();
    generateCalendar();
}