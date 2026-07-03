// Fichero: src/renderer/components/calendar.js
// Descripción: Calendario de automatismos como DRAWER dentro de la vista de Automatismos.
// Se alimenta de los automatismos FILTRADOS en la vista (no hace llamadas propias a la API).

import elements from '../ui/dom-elements.js';

// Automatismos programados a pintar: {name, status, scheduledTime(YYYY-MM-DD), scheduledHour}
let scheduledAutomations = [];
let dailyFiltered = [];

/** Inicializa listeners del drawer del calendario. */
export function init() {
    elements.calendarYearSelect?.addEventListener('change', generateCalendar);

    elements.calendarGrid?.addEventListener('click', (e) => {
        if (e.target.tagName === 'TD' && e.target.dataset.date) {
            document.querySelectorAll('#calendar-grid td.selected').forEach(c => c.classList.remove('selected'));
            e.target.classList.add('selected');
            filterAutomationsForDay(e.target.dataset.date);
        }
    });

    elements.calendarCloseBtn?.addEventListener('click', close);
    elements.calendarBackdrop?.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.calendarDrawer?.classList.contains('open')) close();
    });
}

/**
 * Abre el drawer del calendario con los automatismos filtrados de la vista.
 * @param {Array} automations - Lista filtrada de automatismos (tal cual la vista).
 */
export function open(automations = []) {
    populateYearSelect();
    processAutomations(automations);
    generateCalendar();

    if (elements.automationList) elements.automationList.innerHTML = '<p>Selecciona un día para ver los detalles.</p>';
    if (elements.calendarDrawerCount) {
        elements.calendarDrawerCount.textContent = scheduledAutomations.length
            ? `(${scheduledAutomations.length} programados)`
            : '(sin automatismos programados)';
    }

    elements.calendarDrawer?.classList.add('open');
    elements.calendarBackdrop?.classList.add('active');
}

/** Cierra el drawer del calendario. */
export function close() {
    elements.calendarDrawer?.classList.remove('open');
    elements.calendarBackdrop?.classList.remove('active');
}

/** Reinicia el estado. Lo invoca org-manager al cambiar de cliente/BU. */
export function clearData() {
    scheduledAutomations = [];
    dailyFiltered = [];
    close();
}

/** Normaliza la lista filtrada quedándose con los que tienen próxima ejecución (scheduledTime). */
function processAutomations(automations) {
    scheduledAutomations = [];
    for (const auto of (automations || [])) {
        if (!auto.scheduledTime) continue;
        const d = new Date(auto.scheduledTime);
        if (isNaN(d.getTime())) continue;
        scheduledAutomations.push({
            name: auto.name,
            status: auto.status,
            scheduledTime: d.toISOString().split('T')[0],
            scheduledHour: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
        });
    }
}

/** Dibuja los 12 meses del año seleccionado, resaltando los días con automatismos. */
function generateCalendar() {
    if (!elements.calendarGrid || !elements.calendarYearSelect) return;
    if (elements.calendarYearSelect.options.length === 0) populateYearSelect();

    const year = elements.calendarYearSelect.value;
    elements.calendarGrid.innerHTML = '';
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const days = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

    for (let i = 0; i < 12; i++) {
        const monthDiv = document.createElement('div');
        monthDiv.className = 'calendar-month';
        monthDiv.innerHTML = `<h3>${months[i]} ${year}</h3>`;
        const table = document.createElement('table');
        table.innerHTML = `<thead><tr>${days.map(d => `<th>${d}</th>`).join('')}</tr></thead>`;
        const tbody = document.createElement('tbody');
        const firstDay = (new Date(year, i, 1).getDay() + 6) % 7;
        const totalDays = new Date(year, i + 1, 0).getDate();
        let date = 1;
        for (let rowIdx = 0; rowIdx < 6 && date <= totalDays; rowIdx++) {
            const row = document.createElement('tr');
            for (let colIdx = 0; colIdx < 7; colIdx++) {
                const cell = document.createElement('td');
                if ((rowIdx > 0 || colIdx >= firstDay) && date <= totalDays) {
                    const currentDate = `${year}-${String(i + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
                    cell.innerText = date;
                    cell.dataset.date = currentDate;
                    if (scheduledAutomations.some(a => a.scheduledTime === currentDate)) cell.classList.add('has-automation');
                    if (colIdx >= 5) cell.classList.add('weekend');
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

/** Muestra los automatismos programados del día seleccionado. */
function filterAutomationsForDay(date) {
    if (!elements.automationList) return;
    elements.automationList.innerHTML = '';
    dailyFiltered = scheduledAutomations
        .filter(a => a.scheduledTime === date)
        .sort((a, b) => a.scheduledHour.localeCompare(b.scheduledHour));

    if (dailyFiltered.length > 0) {
        dailyFiltered.forEach(auto => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'automation-item';
            itemDiv.innerHTML = `<div class="automation-name">${auto.name}</div><div class="automation-details">${auto.status} - ${auto.scheduledHour}</div>`;
            elements.automationList.appendChild(itemDiv);
        });
    } else {
        elements.automationList.innerHTML = '<p>No hay automatismos programados este día.</p>';
    }
}

/** Rellena el selector de año con años relevantes. */
function populateYearSelect() {
    if (!elements.calendarYearSelect || elements.calendarYearSelect.options.length > 0) return;
    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 2; i <= currentYear + 3; i++) {
        elements.calendarYearSelect.appendChild(new Option(i, i));
    }
    elements.calendarYearSelect.value = currentYear;
}
