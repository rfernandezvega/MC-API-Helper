import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { buildAutomationUrl, linkCell } from '../ui/mc-links.js';
import { downloadCsv, buildCsvFileName } from '../ui/csv-export.js';

let getAuthenticatedConfig;
let lastSelectedIndex = -1; // Para el Shift + Click

// Datos pintados en cada tabla: son el origen de sus descargas en CSV.
let lastActivities = [];
let lastUsageRows = [];

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    
    // Listener para el botón de buscar
    elements.searchActivityBtn.addEventListener('click', searchActivityUsage);
    
    // Listener para el botón de borrar
    elements.deleteActivityBtn.addEventListener('click', deleteSelectedActivities);
    
    // Controlar visibilidad del botón según el tipo seleccionado
    elements.activityTypeSelect.addEventListener('change', updateDeleteButtonVisibility);
    
    // Selección de filas
    elements.activityListTbody.addEventListener('click', handleRowSelection);
    
    // Delegación para enlaces externos
    elements.activityUsageTbody.addEventListener('click', ui.handleExternalLink);

    // Descargas de cada tabla de resultados
    elements.downloadActivityListCsvBtn?.addEventListener('click', downloadActivityListCsv);
    elements.downloadActivityUsageCsvBtn?.addEventListener('click', downloadActivityUsageCsv);

    // Inicializar estado del botón
    updateDeleteButtonVisibility();
}

/** Descarga en CSV las actividades encontradas. */
function downloadActivityListCsv() {
    downloadCsv({
        headers: ['Nombre', 'External Key'],
        rows: lastActivities.map(a => [a.name || '', a.customerKey || '']),
        fileName: buildCsvFileName('buscador_actividades')
    });
}

/** Descarga en CSV la ubicación de las actividades dentro de los automatismos. */
function downloadActivityUsageCsv() {
    downloadCsv({
        headers: ['Actividad', 'External Key', 'Automatización', 'Paso'],
        rows: lastUsageRows,
        fileName: buildCsvFileName('buscador_actividades_uso')
    });
}

/**
 * Muestra u oculta el botón de borrar según el tipo de actividad.
 */
function updateDeleteButtonVisibility() {
    const isQuery = elements.activityTypeSelect.value === 'QueryDefinition';
    if (isQuery) {
        elements.deleteActivityBtn.classList.remove('hidden');
        // Aseguramos que el contenedor del botón (header) no oculte el botón
        elements.deleteActivityBtn.style.display = 'inline-block';
    } else {
        elements.deleteActivityBtn.classList.add('hidden');
        elements.deleteActivityBtn.style.display = 'none';
    }
}

async function searchActivityUsage() {
    const rawValue = elements.activitySearchValue.value.trim();
    const selectedType = elements.activityTypeSelect.value;

    if (!rawValue) return ui.showCustomAlert("Introduce al menos un nombre o External Key.");

    // Separar por , ; o |
    const valuesToSearch = rawValue.split(/[,;|]+/).map(v => v.trim()).filter(v => v !== "");

    ui.blockUI(`Buscando ${valuesToSearch.length} actividades...`);
    logger.startLogBuffering();
    
    // Reset UI
    elements.activityListTbody.innerHTML = '';
    elements.activityUsageTbody.innerHTML = '';
    elements.activityInfoBlock.classList.add('hidden');
    elements.activityResultsBlock.classList.add('hidden');
    lastActivities = [];
    lastUsageRows = [];
    if (elements.downloadActivityListCsvBtn) elements.downloadActivityListCsvBtn.disabled = true;
    if (elements.downloadActivityUsageCsvBtn) elements.downloadActivityUsageCsvBtn.disabled = true;

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        // Cada búsqueda parte de cero para no reutilizar automatismos ya descargados.
        mcApiService.clearAutomationDetailsCache();

        logger.logMessage(`Buscando: ${valuesToSearch.map(v => `"${v}"`).join(', ')}`);

        // Todos los términos se resuelven en un solo recorrido: antes cada valor repetía
        // la paginación completa de la colección.
        let allFoundActivities = await mcApiService.searchActivitiesTargeted(selectedType, valuesToSearch, apiConfig);

        // Quitar duplicados por ObjectID
        allFoundActivities = allFoundActivities.filter((v, i, a) => a.findIndex(t => t.objectID === v.objectID) === i);

        if (allFoundActivities.length === 0) {
            ui.showCustomAlert(`No se encontró ninguna actividad con los valores proporcionados.`);
            return;
        }

        renderActivityList(allFoundActivities, apiConfig);

        updateDeleteButtonVisibility(); 

    } catch (error) {
        logger.logMessage(`Error: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

function renderActivityList(activities, apiConfig) {
    elements.activityListTbody.innerHTML = '';
    lastActivities = activities || [];
    if (elements.downloadActivityListCsvBtn) elements.downloadActivityListCsvBtn.disabled = lastActivities.length === 0;

    activities.forEach((activity, index) => {
        const row = document.createElement('tr');
        row.dataset.index = index;
        row.dataset.activityData = JSON.stringify(activity);
        row.innerHTML = `
            <td>${activity.name || '---'}</td>
            <td>${activity.customerKey || '---'}</td>
        `;
        elements.activityListTbody.appendChild(row);
    });

    elements.activityInfoBlock.classList.remove('hidden');
    // Al renderizar la lista, también buscamos el uso de todas de golpe para la tabla inferior
    findUsageForAll(activities, apiConfig);
}

async function findUsageForAll(activities, apiConfig) {
    elements.activityUsageTbody.innerHTML = '';
    elements.activityResultsBlock.classList.remove('hidden');

    // Los usos se buscan en paralelo; la caché de automatismos evita que varias
    // actividades del mismo automatismo vuelvan a descargar su definición.
    const usages = await Promise.all(
        activities.map(async (activity) => ({
            activity,
            automations: await mcApiService.findAutomationForActivity(activity, apiConfig)
        }))
    );

    lastUsageRows = [];
    for (const { activity, automations } of usages) {
        if (automations && automations.length > 0) {
            automations.forEach(auto => {
                lastUsageRows.push([activity.name, activity.customerKey, auto.automationName, auto.step]);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${activity.name}</td>
                    <td><small>${activity.customerKey}</small></td>
                    <td class="u-text-left" style="padding-left: 20px;">${linkCell(auto.automationName, buildAutomationUrl(auto.automationId))}</td>
                    <td>${auto.step}</td>
                `;
                elements.activityUsageTbody.appendChild(row);
            });
        }
    }
    
    if (elements.activityUsageTbody.innerHTML === '') {
        elements.activityUsageTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;"><i>Ninguna de estas actividades se usa en automatismos.</i></td></tr>';
    }

    if (elements.downloadActivityUsageCsvBtn) elements.downloadActivityUsageCsvBtn.disabled = lastUsageRows.length === 0;
}

/**
 * Maneja la selección de filas con soporte para Shift, Ctrl y Deselección.
 */
function handleRowSelection(e) {
    const row = e.target.closest('tr');
    if (!row) return;

    const rows = Array.from(elements.activityListTbody.querySelectorAll('tr'));
    const currentIndex = rows.indexOf(row);
    const isSelected = row.classList.contains('selected');

    // Caso A: SHIFT + CLICK (Selección de rango)
    if (e.shiftKey && lastSelectedIndex !== -1) {
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);
        
        rows.forEach((r, i) => {
            if (i >= start && i <= end) r.classList.add('selected');
        });
    } 
    // Caso B: CTRL / CMD + CLICK (Añadir/Quitar individual)
    else if (e.ctrlKey || e.metaKey) {
        row.classList.toggle('selected');
    } 
    // Caso C: CLICK NORMAL
    else {
        const selectedRows = rows.filter(r => r.classList.contains('selected'));
        
        // Si la fila ya estaba seleccionada y era la única, la deseleccionamos (Toggle simple)
        if (isSelected && selectedRows.length === 1) {
            row.classList.remove('selected');
        } else {
            // En cualquier otro caso, limpiamos todo y seleccionamos solo esta
            rows.forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
        }
    }

    lastSelectedIndex = currentIndex;
}

async function deleteSelectedActivities() {
    const selectedRows = Array.from(elements.activityListTbody.querySelectorAll('tr.selected'));
    
    if (selectedRows.length === 0) {
        return ui.showCustomAlert("Por favor, selecciona al menos una fila de la tabla.");
    }

    const activitiesToDelete = selectedRows.map(row => JSON.parse(row.dataset.activityData));
    const count = activitiesToDelete.length;
    
    // El popup personalizado
    const confirm = await ui.showCustomConfirm(`¿Seguro que quieres borrar ${count} Queries? Esta acción no se puede deshacer.`);
    
    if (!confirm) return;

    ui.blockUI(`Borrando ${count} queries...`);
    logger.startLogBuffering();

    let successCount = 0;
    let errorCount = 0;

    try {
        const apiConfig = await getAuthenticatedConfig();

        // Bucle de borrado secuencial (más seguro para la API)
        for (const activity of activitiesToDelete) {
            try {
                logger.logMessage(`Intentando borrar: ${activity.name} (${activity.objectID})`);
                await mcApiService.deleteQuery(activity.objectID, apiConfig);
                successCount++;
            } catch (err) {
                errorCount++;
                logger.logMessage(`Error borrando ${activity.name}: ${err.message}`);
            }
        }

        // Feedback final
        if (errorCount === 0) {
            ui.showCustomAlert(`Se han borrado correctamente las ${successCount} queries.`);
        } else {
            ui.showCustomAlert(`Proceso finalizado con errores. Éxitos: ${successCount}, Errores: ${errorCount}. Revisa los logs para más detalles.`);
        }

        // Refrescamos la búsqueda para que desaparezcan de la tabla
        searchActivityUsage();

    } catch (error) {
        ui.showCustomAlert(`Error crítico en el proceso: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}