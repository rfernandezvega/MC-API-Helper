// Fichero: src/renderer/components/de-finder.js
// Descripción: Módulo que encapsula la lógica del Buscador de Data Extensions.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO DEL MÓDULO ---

let getAuthenticatedConfig; // Dependencia inyectada desde app.js

// --- 2. FUNCIONES PÚBLICAS ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.searchDEBtn.addEventListener('click', searchDE);
}

// --- 3. LÓGICA PRINCIPAL ---

/**
 * Orquesta la búsqueda de una Data Extension por nombre o key y muestra los resultados.
 */
async function searchDE() {
    ui.blockUI("Buscando Data Extension...");
    logger.startLogBuffering();
    elements.deSearchResultsTbody.innerHTML = '<tr><td colspan="2">Buscando...</td></tr>';
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
                return { name: deInfo.deName, path: 'Data Extensions' };
            }
            const folderPath = await mcApiService.getFolderPath(deInfo.categoryId, apiConfig);
            return { name: deInfo.deName, path: folderPath || 'Data Extensions' };
        });

        const resultsWithPaths = await Promise.all(pathPromises);
        
        renderTable(resultsWithPaths);
        logger.logMessage("Visualización de resultados completada.");

    } catch (error) {
        logger.logMessage(`Error al buscar la DE: ${error.message}`);
        elements.deSearchResultsTbody.innerHTML = `<tr><td colspan="2" style="color: red;">Error: ${error.message}</td></tr>`;
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
    elements.deSearchResultsTbody.innerHTML = '';
    if (!results || results.length === 0) {
        elements.deSearchResultsTbody.innerHTML = '<tr><td colspan="2">No se encontraron Data Extensions con ese criterio.</td></tr>';
        return;
    }

    // Ordenamos los resultados alfabéticamente para agrupar carpetas
    results.sort((a, b) => (a.path + a.name).localeCompare(b.path + b.name));

    results.forEach(result => {
        const row = elements.deSearchResultsTbody.insertRow();
        row.innerHTML = `<td>${result.name}</td><td>${result.path}</td>`;
    });
}