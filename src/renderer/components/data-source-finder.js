// Fichero: src/renderer/components/data-source-finder.js
// Descripción: Módulo que encapsula la lógica del Buscador de Orígenes de Datos.

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

    elements.findDataSourcesBtn.addEventListener('click', findDataSources);
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
    if (sources.length === 0) {
        elements.dataSourcesTbody.innerHTML = '<tr><td colspan="6">No se encontraron orígenes de datos para esta Data Extension.</td></tr>';
        return;
    }
    sources.forEach(source => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${source.name || '---'}</td>
            <td>${source.type || '---'}</td>
            <td>${source.automationName || '---'}</td>
            <td>${source.step || '---'}</td>
            <td>${source.action || '---'}</td>
            <td style="white-space: pre-wrap; word-break: break-all;">${source.description || '---'}</td>
        `;
        elements.dataSourcesTbody.appendChild(row);
    });
}