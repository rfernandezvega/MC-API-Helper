// Fichero: src/renderer/components/de-finder.js
// Descripción: Módulo que encapsula la lógica del Buscador de Data Extensions.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { escapeHtml } from '../ui/format-utils.js';

// --- 1. ESTADO DEL MÓDULO ---

let getAuthenticatedConfig; // Dependencia inyectada desde app.js
let selectedDeName = null;  // Nombre de la DE seleccionada en la tabla de resultados

// --- 2. FUNCIONES PÚBLICAS ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.searchDEBtn.addEventListener('click', searchDE);

    // Selección de una fila de resultados (para el botón "Origen de datos").
    elements.deSearchResultsTbody.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (!row || !row.dataset.deName) return;
        elements.deSearchResultsTbody.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        selectedDeName = row.dataset.deName;
        elements.deToSourcesBtn.disabled = false;
    });

    // Botón "Origen de datos": salta a la pestaña de Orígenes con la DE seleccionada
    // y lanza la búsqueda automáticamente.
    elements.deToSourcesBtn.addEventListener('click', goToDataSources);
}

/** Cambia a la pestaña "Origen de datos", rellena el nombre y busca sus orígenes. */
function goToDataSources() {
    if (!selectedDeName) return;
    const tabBtn = document.querySelector('.tab-button[data-tab="origenes-tab"]');
    if (tabBtn) tabBtn.click();
    elements.deNameToFindInput.value = selectedDeName;
    elements.findDataSourcesBtn.click();
}

// --- 3. LÓGICA PRINCIPAL ---

/**
 * Orquesta la búsqueda de una Data Extension por nombre o key y muestra los resultados.
 */
async function searchDE() {
    ui.blockUI("Buscando Data Extension...");
    logger.startLogBuffering();
    elements.deSearchResultsTbody.innerHTML = '<tr><td colspan="3">Buscando...</td></tr>';
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const property = elements.deSearchProperty.value;
        const value = elements.deSearchValue.value.trim();
        if (!value) {
            throw new Error("El campo 'Valor' no puede estar vacío.");
        }

        logger.logMessage(`Buscando DE por ${property} que contenga: "${value}"`);
        
        const deList = await mcApiService.searchDataExtensions(property, value, apiConfig);

        if (deList.length === 0) {
            renderTable([]);
            logger.logMessage("No se encontraron resultados.");
            return;
        }

        logger.logMessage(`Se encontraron ${deList.length} DEs. Obteniendo rutas de carpeta...`);

        const pathPromises = deList.map(async (deInfo) => {
            if (!deInfo.categoryId || parseInt(deInfo.categoryId) === 0) {
                return { name: deInfo.deName, key: deInfo.customerKey, path: 'Data Extensions' };
            }
            const folderPath = await mcApiService.getFolderPath(deInfo.categoryId, apiConfig);
            return { name: deInfo.deName, key: deInfo.customerKey, path: folderPath || 'Data Extensions' };
        });

        const resultsWithPaths = await Promise.all(pathPromises);
        
        renderTable(resultsWithPaths);
        logger.logMessage("Visualización de resultados completada.");

    } catch (error) {
        logger.logMessage(`Error al buscar la DE: ${error.message}`);
        elements.deSearchResultsTbody.innerHTML = `<tr><td colspan="3" class="error-text">Error: ${escapeHtml(error.message)}</td></tr>`;
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

// --- 4. RENDERIZADO DE LA TABLA ---

/**
 * Dibuja la tabla de resultados del buscador de Data Extensions.
 * @param {Array} results - Array de objetos con { name, path }.
 */
function renderTable(results) {
    // Cada nueva búsqueda resetea la selección y deshabilita el botón.
    selectedDeName = null;
    elements.deToSourcesBtn.disabled = true;
    elements.deSearchResultsTbody.innerHTML = '';
    if (!results || results.length === 0) {
        elements.deSearchResultsTbody.innerHTML = '<tr><td colspan="3">No se encontraron Data Extensions con ese criterio.</td></tr>';
        return;
    }

    // Ordenamos los resultados alfabéticamente para agrupar carpetas
    results.sort((a, b) => (a.path + a.name).localeCompare(b.path + b.name));

    results.forEach(result => {
        const row = elements.deSearchResultsTbody.insertRow();
        row.dataset.deName = result.name;
        row.innerHTML = `<td>${escapeHtml(result.name)}</td><td>${escapeHtml(result.key || '')}</td><td>${escapeHtml(result.path)}</td>`;
    });
}