// Fichero: src/renderer/components/query-text-finder.js
// Descripción: Módulo que encapsula la lógica del Buscador de Texto en Queries.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO DEL MÓDULO ---

let getAuthenticatedConfig; // Dependencia inyectada desde app.js
let currentOrgInfo; // Necesitamos esto para construir los enlaces

// --- 2. FUNCIONES PÚBLICAS ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.searchQueriesByTextBtn.addEventListener('click', searchQueriesByText);
    
    // Listener para mostrar/ocultar la columna de texto de la query
    elements.showQueryTextCheckbox.addEventListener('change', () => {
        const isChecked = elements.showQueryTextCheckbox.checked;
        const displayStyle = isChecked ? '' : 'none';
        const table = elements.querySearchResultsTable;
        table.querySelectorAll('thead th:nth-child(4), tbody td:nth-child(4)').forEach(cell => {
            cell.style.display = displayStyle;
        });
    });
}

/**
 * Actualiza la información de la organización (necesaria para los enlaces).
 * @param {object} orgInfo - El objeto de información de la organización de la API.
 */
export function updateOrgInfo(orgInfo) {
    currentOrgInfo = orgInfo;
}

// --- 3. LÓGICA PRINCIPAL ---

/**
 * Orquesta la búsqueda de queries que contienen un texto específico.
 */
async function searchQueriesByText() {
    ui.blockUI("Buscando en Queries...");
    logger.startLogBuffering();
    elements.querySearchResultsTbody.innerHTML = '<tr><td colspan="4">Buscando en todas las queries...</td></tr>';
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const searchText = elements.querySearchText.value.trim();
        if (!searchText) {
            throw new Error("El campo 'Texto a buscar' no puede estar vacío.");
        }

        logger.logMessage(`Buscando queries que contengan el texto: "${searchText}"`);

        const allQueries = await mcApiService.searchQueriesBySimpleFilter({
            property: 'QueryText',
            simpleOperator: 'like',
            value: searchText
        }, apiConfig);
        
        renderTable(allQueries);
        logger.logMessage(`Búsqueda completada. Se encontraron ${allQueries.length} queries.`);

    } catch (error) {
        logger.logMessage(`Error al buscar en queries: ${error.message}`);
        elements.querySearchResultsTbody.innerHTML = `<tr><td colspan="4" style="color: red;">Error: ${error.message}</td></tr>`;
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

// --- 4. RENDERIZADO DE LA TABLA ---

/**
 * Dibuja la tabla con los resultados de la búsqueda de queries.
 * @param {Array} queries - Array de queries encontradas.
 */
function renderTable(queries) {
    elements.querySearchResultsTbody.innerHTML = '';
    const showQuery = elements.showQueryTextCheckbox.checked;
    const displayStyle = showQuery ? '' : 'none';
    elements.querySearchResultsTable.querySelector('thead th:nth-child(4)').style.display = displayStyle;

    if (queries.length === 0) {
        elements.querySearchResultsTbody.innerHTML = '<tr><td colspan="4">No se encontraron queries con ese texto.</td></tr>';
        return;
    }

    queries.forEach(query => {
        const row = document.createElement('tr');
        const queryLink = constructQueryLink(query.objectID);
        const queryNameCell = queryLink 
            ? `<td><a href="${queryLink}" class="external-link" title="Abrir query en Marketing Cloud">${query.name}</a></td>` 
            : `<td>${query.name}</td>`;
        
        row.innerHTML = `
            ${queryNameCell}
            <td>${query.automationName || '---'}</td>
            <td>${query.step || '---'}</td>
            <td style="white-space: pre-wrap; word-break: break-all; display: ${displayStyle};">${query.description}</td>
        `;
        elements.querySearchResultsTbody.appendChild(row);
    });
}

// --- 5. HELPERS ---

/**
 * Construye la URL para abrir una Query Activity en la UI de Automation Studio.
 * @param {string} queryObjectId - El ObjectID de la Query Definition.
 * @returns {string|null} La URL completa o null si falta información.
 */
function constructQueryLink(queryObjectId) {
    if (!currentOrgInfo || !currentOrgInfo.stack_key || !elements.businessUnitInput.value) return null;
    const stack = currentOrgInfo.stack_key.toLowerCase();
    const mid = elements.businessUnitInput.value;
    // La URL usa el MID, pero lo obtenemos de los elementos del DOM que son globales.
    return `https://mc.${stack}.exacttarget.com/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23ActivityDetails/300/${queryObjectId}`;
}