// Fichero: src/renderer/components/data-source-finder.js
// Descripción: Módulo que encapsula la lógica del Buscador de Orígenes de Datos.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { buildAutomationUrl, linkCell } from '../ui/mc-links.js';
import { sqlBox } from '../ui/sql-highlight.js';
import { downloadCsv, buildCsvFileName } from '../ui/csv-export.js';

// --- 1. ESTADO DEL MÓDULO ---

let getAuthenticatedConfig; // Dependencia inyectada desde app.js
let lastSources = [];       // Últimas actividades pintadas (origen de la descarga en CSV)

// --- 2. FUNCIONES PÚBLICAS ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
// Estado del toggle "Mostrar Query" (botón, no checkbox).
let showSourceQuery = true;

/** Actualiza el color del botón según el estado (verde activo / gris inactivo). */
function updateShowQueryToggleUI() {
    const btn = elements.showSourceQueryBtn;
    if (!btn) return;
    btn.style.color = '#fff';
    btn.style.background = showSourceQuery ? 'var(--sf-green)' : 'var(--sf-text-muted)'; // tokens: verde activo / gris inactivo, legible en oscuro
}

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.findDataSourcesBtn.addEventListener('click', findDataSources);
    ui.submitOnEnter(elements.deNameToFindInput, elements.findDataSourcesBtn);
    // Los nombres de automatismo son enlaces externos: se abren en el navegador.
    elements.dataSourcesTbody.addEventListener('click', ui.handleExternalLink);

    // --- Toggle para mostrar/ocultar la columna de descripción/query ---
    updateShowQueryToggleUI();
    elements.showSourceQueryBtn?.addEventListener('click', () => {
        showSourceQuery = !showSourceQuery;
        updateShowQueryToggleUI();
        const displayStyle = showSourceQuery ? '' : 'none';
        // Aplica el estilo a la columna 6 (Descripción / Query)
        const table = document.getElementById('data-sources-table');
        if (table) {
            table.querySelectorAll('thead th:nth-child(6), tbody td:nth-child(6)').forEach(cell => {
                cell.style.display = displayStyle;
            });
        }
    });

    elements.downloadDataSourcesCsvBtn?.addEventListener('click', downloadResultsCsv);
}

/**
 * Descarga en CSV las actividades encontradas. La query se exporta siempre, aunque su
 * columna esté oculta en la tabla, porque es el dato que se suele querer revisar fuera.
 */
function downloadResultsCsv() {
    downloadCsv({
        headers: ['Actividad', 'Tipo', 'Automatización', 'Paso', 'Acción', 'Descripción / Query'],
        rows: lastSources.map(source => {
            const automations = source.automations || [];
            return [
                source.name || '',
                source.type || '',
                automations.map(a => a.automationName || 'N/A').join(' | '),
                automations.map(a => a.step || '').join(' | '),
                source.action || '',
                source.description || ''
            ];
        }),
        fileName: buildCsvFileName('buscador_origenes_datos')
    });
}

// --- 3. LÓGICA PRINCIPAL ---

/**
 * Orquesta la búsqueda de actividades (Imports, Queries) que tienen como destino una DE.
 */
async function findDataSources() {
    ui.blockUI("Buscando orígenes de datos...");
    logger.startLogBuffering();
    
    elements.dataSourcesTbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        // Cada búsqueda parte de cero para no reutilizar automatismos ya descargados.
        mcApiService.clearAutomationDetailsCache();

        const deName = elements.deNameToFindInput.value.trim();
        if (!deName) {
            throw new Error('Introduzca el nombre de la Data Extension.');
        }
        
        logger.logMessage(`Buscando orígenes para la DE: "${deName}"`);
        
        logger.logMessage(`Paso 1/2: Obteniendo ObjectID de la DE...`);
        const deObjectId = await mcApiService.getDEObjectIdByName(deName, apiConfig);
        logger.logMessage(`-> ObjectID encontrado: ${deObjectId}`);

        logger.logMessage(`Paso 2/2: Buscando Imports y Queries en paralelo...`);
        const [imports, queries] = await Promise.all([
            mcApiService.findImportsTargetingDE(deObjectId, apiConfig),
            mcApiService.searchQueriesBySimpleFilter({
                property: 'DataExtensionTarget.Name',
                simpleOperator: 'equals',
                value: deName
            }, apiConfig)
        ]);
        logger.logMessage(`-> Encontrados ${imports.length} Imports y ${queries.length} Queries.`);

        const allSources = [...imports, ...queries].sort((a, b) => a.name.localeCompare(b.name));
        
        renderTable(allSources);
        logger.logMessage(`Búsqueda completada. Se encontraron ${allSources.length} actividades en total.`);

    } catch (error) {
        logger.logMessage(`Error al buscar orígenes: ${error.message}`);
        elements.dataSourcesTbody.innerHTML = `<tr><td colspan="6" style="color: red;">Error: ${error.message}</td></tr>`;
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

// --- 4. RENDERIZADO DE LA TABLA ---

/**
 * Dibuja la tabla con las actividades encontradas.
 * @param {Array} sources - Array de actividades (imports, queries).
 */
function renderTable(sources) {
    elements.dataSourcesTbody.innerHTML = '';
    lastSources = sources || [];
    if (elements.downloadDataSourcesCsvBtn) elements.downloadDataSourcesCsvBtn.disabled = lastSources.length === 0;

    // --- Estado actual del toggle para el renderizado ---
    const displayStyle = showSourceQuery ? '' : 'none';

    // Ajustar la cabecera de la tabla (th de la columna 6)
    const tableHeader = document.querySelector('#data-sources-table thead th:nth-child(6)');
    if (tableHeader) tableHeader.style.display = displayStyle;

    if (sources.length === 0) {
        elements.dataSourcesTbody.innerHTML = '<tr><td colspan="6">No se encontraron orígenes de datos para esta Data Extension.</td></tr>';
        return;
    }

    sources.forEach(source => {
        const row = document.createElement('tr');
        
        // Columna: Actividad
        const activityNameCell = document.createElement('td');
        activityNameCell.textContent = source.name || '---';
        row.appendChild(activityNameCell);

        // Columna: Tipo
        const typeCell = document.createElement('td');
        typeCell.textContent = source.type || '---';
        row.appendChild(typeCell);

        // Columna: Automatización
        const automationCell = document.createElement('td');
        automationCell.innerHTML = (source.automations && source.automations.length > 0)
            ? source.automations.map(auto => linkCell(auto.automationName || 'N/A', buildAutomationUrl(auto.automationId))).join('<br>')
            : '---';
        row.appendChild(automationCell);

        // Columna: Paso
        const stepCell = document.createElement('td');
        stepCell.innerHTML = (source.automations && source.automations.length > 0)
            ? source.automations.map(auto => auto.step ? `${auto.step}` : '---').join('<br>')
            : '---';
        row.appendChild(stepCell);

        // Columna: Acción
        const actionCell = document.createElement('td');
        actionCell.textContent = source.action || '---';
        row.appendChild(actionCell);

        // Columna: Descripción / Query (COLUMNA 6) — en caja acotada con resaltado.
        const descriptionQueryCell = document.createElement('td');
        descriptionQueryCell.innerHTML = sqlBox(source.description);

        // --- APLICAR VISIBILIDAD SEGÚN EL TOGGLE "Mostrar Query" ---
        descriptionQueryCell.style.display = displayStyle;
        
        row.appendChild(descriptionQueryCell);

        elements.dataSourcesTbody.appendChild(row);
    });
}