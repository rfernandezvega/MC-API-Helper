// Fichero: src/renderer/components/content-finder.js
// Descripción: Módulo que encapsula la lógica del Buscador de Contenidos.

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
    elements.searchContentBtn.addEventListener('click', searchContent);
}

// --- 3. LÓGICA PRINCIPAL ---

/**
 * Orquesta la búsqueda de contenidos por nombre o ID y muestra los resultados con sus rutas.
 */
async function searchContent() {
    ui.blockUI("Buscando contenidos...");
    logger.startLogBuffering();
    elements.contentSearchResultsTbody.innerHTML = '<tr><td colspan="3">Buscando...</td></tr>';
    
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const value = elements.contentSearchValue.value.trim();
        if (!value) {
            throw new Error("El campo de búsqueda no puede estar vacío.");
        }

        logger.logMessage(`Buscando contenidos por nombre o ID con el término: "${value}"`);
        
        const contentList = await mcApiService.searchContentAssets(value, apiConfig);

        if (contentList.length === 0) {
            renderTable([]);
            logger.logMessage("No se encontraron contenidos.");
            return;
        }

        logger.logMessage(`Se encontraron ${contentList.length} contenidos. Obteniendo rutas de carpeta...`);

        // Usamos Promise.all para resolver todas las rutas en paralelo, es más eficiente.
        const pathPromises = contentList.map(async (asset) => {
            const folderPath = await mcApiService.getFolderPath(asset.category.id, apiConfig);
            return { 
                name: asset.name, 
                type: asset.assetType.displayName, 
                path: folderPath || 'Content Builder' // Si no tiene ruta, está en la raíz.
            };
        });

        const resultsWithPaths = await Promise.all(pathPromises);
        
        renderTable(resultsWithPaths);
        logger.logMessage("Visualización de resultados completada.");

    } catch (error) {
        logger.logMessage(`Error al buscar contenidos: ${error.message}`);
        elements.contentSearchResultsTbody.innerHTML = `<tr><td colspan="3" style="color: red;">Error: ${error.message}</td></tr>`;
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

// --- 4. RENDERIZADO DE LA TABLA ---

/**
 * Dibuja la tabla de resultados del buscador de contenidos.
 * @param {Array} results - Array de objetos con { name, type, path }.
 */
function renderTable(results) {
    elements.contentSearchResultsTbody.innerHTML = '';
    if (!results || results.length === 0) {
        elements.contentSearchResultsTbody.innerHTML = '<tr><td colspan="3">No se encontraron contenidos con ese criterio.</td></tr>';
        return;
    }

    // Ordenamos los resultados alfabéticamente por la ruta para agrupar carpetas
    results.sort((a, b) => (a.path + a.name).localeCompare(b.path + b.name));

    results.forEach(result => {
        const row = elements.contentSearchResultsTbody.insertRow();
        row.innerHTML = `<td>${result.name}</td><td>${result.type}</td><td>${result.path}</td>`;
    });
}