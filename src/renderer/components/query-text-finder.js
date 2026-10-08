// Fichero: src/renderer/components/query-text-finder.js
import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { buildAutomationUrl, linkCell } from '../ui/mc-links.js';
import { sqlBox } from '../ui/sql-highlight.js';
import { downloadCsv, buildCsvFileName } from '../ui/csv-export.js';

let getAuthenticatedConfig;

// Últimas queries pintadas: son el origen de la descarga en CSV.
let lastQueries = [];

// Estado del toggle "Mostrar Query" (botón, no checkbox).
let showQueryText = true;

/** Actualiza el color del botón según el estado (verde activo / gris inactivo). */
function updateShowQueryToggleUI() {
    const btn = elements.showQueryTextBtn;
    if (!btn) return;
    btn.style.color = '#fff';
    btn.style.background = showQueryText ? 'var(--sf-green)' : 'var(--sf-text-muted)'; // tokens: verde activo / gris inactivo, legible en oscuro
}

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    elements.searchQueriesByTextBtn.addEventListener('click', searchQueriesByText);
    ui.submitOnEnter(elements.querySearchText, elements.searchQueriesByTextBtn);

    // Delegación de eventos para abrir enlaces externos
    elements.querySearchResultsTbody.addEventListener('click', ui.handleExternalLink);

    updateShowQueryToggleUI();
    elements.showQueryTextBtn?.addEventListener('click', () => {
        showQueryText = !showQueryText;
        updateShowQueryToggleUI();
        const displayStyle = showQueryText ? '' : 'none';
        elements.querySearchResultsTable.querySelectorAll('thead th:nth-child(4), tbody td:nth-child(4)').forEach(cell => {
            cell.style.display = displayStyle;
        });
    });

    elements.downloadQuerySearchCsvBtn?.addEventListener('click', downloadResultsCsv);
}

/**
 * Descarga en CSV las queries encontradas. El texto de la query se exporta siempre
 * (aunque su columna esté oculta) ya saneado de saltos de línea y comillas.
 */
function downloadResultsCsv() {
    downloadCsv({
        headers: ['Nombre de la Query', 'Automatización', 'Paso', 'Query Text'],
        rows: lastQueries.map(query => {
            const automations = query.automations || [];
            return [
                query.name || '',
                automations.map(a => a.automationName || 'N/A').join(' | '),
                automations.map(a => a.step || '').join(' | '),
                query.description || query.queryText || ''
            ];
        }),
        fileName: buildCsvFileName('buscador_texto_queries')
    });
}

// Mantenemos la función para evitar errores de app.js
export function updateOrgInfo(orgInfo) {}

async function searchQueriesByText() {
    ui.blockUI("Buscando en Queries y analizando automatismos...");
    logger.startLogBuffering();
    elements.querySearchResultsTbody.innerHTML = '<tr><td colspan="4">Buscando...</td></tr>';
    lastQueries = [];
    if (elements.downloadQuerySearchCsvBtn) elements.downloadQuerySearchCsvBtn.disabled = true;
    ui.setResultsCount(elements.querySearchResultsTitle, null);

    try {
        const apiConfig = await getAuthenticatedConfig();
        if (!apiConfig || !apiConfig.soapUri) throw new Error("Configuración de API incompleta.");

        mcApiService.setLogger(logger);
        // Cada búsqueda parte de cero para no reutilizar automatismos ya descargados.
        mcApiService.clearAutomationDetailsCache();

        const searchText = elements.querySearchText.value.trim();
        if (!searchText) throw new Error("El campo 'Texto a buscar' no puede estar vacío.");

        logger.logMessage(`Buscando queries con el texto: "${searchText}"`);

        // 1. Buscamos las actividades de Query
        const queriesFound = await mcApiService.searchQueriesBySimpleFilter({
            property: 'QueryText',
            simpleOperator: 'like',
            value: searchText
        }, apiConfig);

        if (!queriesFound || queriesFound.length === 0) {
            elements.querySearchResultsTbody.innerHTML = '<tr><td colspan="4">No se encontraron queries con ese texto.</td></tr>';
            ui.setResultsCount(elements.querySearchResultsTitle, 0);
            return;
        }

        // searchQueriesBySimpleFilter ya devuelve cada query con sus automatismos resueltos,
        // así que aquí no hay que volver a pedirlos: solo se pintan.
        logger.logMessage(`Encontradas ${queriesFound.length} queries. Analizando ubicación...`);

        renderTable(queriesFound);
        logger.logMessage(`Búsqueda y análisis de ubicación completado.`);

    } catch (error) {
        logger.logMessage(`Error: ${error.message}`);
        elements.querySearchResultsTbody.innerHTML = `<tr><td colspan="4" style="color: red;">Error: ${error.message}</td></tr>`;
        ui.setResultsCount(elements.querySearchResultsTitle, null);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

function renderTable(queries) {
    elements.querySearchResultsTbody.innerHTML = '';
    lastQueries = queries || [];
    if (elements.downloadQuerySearchCsvBtn) elements.downloadQuerySearchCsvBtn.disabled = lastQueries.length === 0;
    ui.setResultsCount(elements.querySearchResultsTitle, lastQueries.length);
    const showQuery = showQueryText;
    const displayStyle = showQuery ? '' : 'none';
    
    // Sincronizar cabecera
    const header = elements.querySearchResultsTable.querySelector('thead th:nth-child(4)');
    if (header) header.style.display = displayStyle;

    queries.forEach(query => {
        const row = document.createElement('tr');
        
        // Link dinámico
        const mid = elements.activeMidInput.value;
        const stack = elements.stackKeyInput.value.toLowerCase().replace('s', '').replace('tack', '');
        const objId = query.objectID || query.ObjectID || '';
        const queryLink = `https://mc.s${stack}.exacttarget.com/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23ActivityDetails/300/${objId}`;

        // Nombres y Pasos (Mismo sistema que Origen de Datos)
        const autoNames = (query.automations && query.automations.length > 0)
            ? query.automations.map(a => linkCell(a.automationName || 'N/A', buildAutomationUrl(a.automationId))).join('<br>')
            : '---';

        const autoSteps = (query.automations && query.automations.length > 0)
            ? query.automations.map(a => a.step || '---').join('<br>')
            : '---';

        row.innerHTML = `
            <td><a href="${queryLink}" class="external-link" title="Abrir en MC">${query.name}</a></td>
            <td>${autoNames}</td>
            <td>${autoSteps}</td>
            <td style="display: ${displayStyle};">${sqlBox(query.description || query.queryText)}</td>
        `;
        elements.querySearchResultsTbody.appendChild(row);
    });
}