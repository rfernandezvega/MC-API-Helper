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
    // Ajustar colspan para 5 columnas si "Automatización" y "Paso" se combinan,
    // o mantener 6 si "Automatización" y "Paso" son dos columnas separadas.
    // Con la nueva estructura de lista, es mejor tener una columna para "Automatización".
    // Las cabeceras son: Actividad | Tipo | Automatización | Paso | Acción | Descripción / Query
    // -> Esto implica 6 columnas.
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
        
        // Columna: Actividad (Nombre de la actividad)
        const activityNameCell = document.createElement('td');
        activityNameCell.textContent = source.name || '---';
        row.appendChild(activityNameCell);

        // Columna: Tipo
        const typeCell = document.createElement('td');
        typeCell.textContent = source.type || '---';
        row.appendChild(typeCell);

        // Columna: Automatización (Modificado para mostrar múltiples líneas sin bullets)
        const automationCell = document.createElement('td');
        if (source.automations && source.automations.length > 0) {
            // Unir todos los nombres de automatización en líneas separadas
            automationCell.innerHTML = source.automations
                .map(auto => auto.automationName || 'N/A')
                .join('<br>'); // Usar <br> para saltos de línea
        } else {
            automationCell.textContent = '---'; // Mostrar "---" si no hay automatismos
        }
        row.appendChild(automationCell);

        // Columna: Paso (Modificado para mostrar múltiples líneas sin bullets)
        const stepCell = document.createElement('td');
        if (source.automations && source.automations.length > 0) {
            // Unir todos los pasos en líneas separadas
            stepCell.innerHTML = source.automations
                .map(auto => auto.step ? `${auto.step}` : '---')
                .join('<br>'); // Usar <br> para saltos de línea
        } else {
            stepCell.textContent = '---'; // Mostrar "---" si no hay pasos
        }
        row.appendChild(stepCell);

        // Columna: Acción (Solo relevante para Queries, aunque los Imports también tienen una "acción" implícita)
        const actionCell = document.createElement('td');
        actionCell.textContent = source.action || '---';
        row.appendChild(actionCell);

        // Columna: Descripción / Query (puede ser multi-línea)
        const descriptionQueryCell = document.createElement('td');
        descriptionQueryCell.style.whiteSpace = 'pre-wrap'; // Conserva saltos de línea y espacios
        descriptionQueryCell.style.wordBreak = 'break-all'; // Rompe palabras largas si es necesario
        descriptionQueryCell.textContent = source.description || '---';
        row.appendChild(descriptionQueryCell);

        elements.dataSourcesTbody.appendChild(row);
    });
}