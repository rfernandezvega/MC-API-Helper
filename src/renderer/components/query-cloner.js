// Fichero: src/renderer/components/query-cloner.js
// Descripción: Módulo que encapsula toda la lógica del wizard para clonar Query Activities.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- 1. ESTADO DEL MÓDULO ---

let getAuthenticatedConfig; // Dependencia inyectada desde app.js

const state = {
    sourceQueryFolder: null,
    targetQueryFolder: null,
    targetDEFolder: null,
    queriesInSourceFolder: []
};

// --- 2. FUNCIONES PÚBLICAS (API del Módulo) ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    // Listeners del Paso 1: Configuración de Carpetas
    const queryClonerInputs = [elements.querySourceFolderNameInput, elements.queryTargetFolderNameInput, elements.deTargetFolderNameInput];
    queryClonerInputs.forEach(input => {
        input.addEventListener('input', () => {
            const allFilled = queryClonerInputs.every(i => i.value.trim() !== '');
            elements.queryClonerSearchFoldersBtn.disabled = !allFilled;
        });
    });

    elements.queryClonerSearchFoldersBtn.addEventListener('click', searchFolders);
    elements.queryClonerContinueBtn.addEventListener('click', displayQuerySelection);

    elements.querySourceFoldersTbody.addEventListener('click', (e) => handleFolderTableClick(e, 'sourceQueryFolder'));
    elements.queryTargetFoldersTbody.addEventListener('click', (e) => handleFolderTableClick(e, 'targetQueryFolder'));
    elements.deTargetFoldersTbody.addEventListener('click', (e) => handleFolderTableClick(e, 'targetDEFolder'));

    // Listeners del Paso 2: Selección y Clonación
    elements.queryClonerBackBtn.addEventListener('click', goBackToStep1);
    elements.queryClonerCloneBtn.addEventListener('click', cloneSelectedQueries);
    elements.selectAllQueriesCheckbox.addEventListener('change', handleSelectAllQueries);
    elements.querySelectionTbody.addEventListener('click', handleQuerySelection);
    elements.querySelectionTbody.addEventListener('input', handleNameEdits);
}

// --- 3. LÓGICA DE LOS PASOS DEL WIZARD ---

/**
 * Paso 1: Busca las carpetas especificadas por el usuario.
 */
async function searchFolders() {
    ui.blockUI("Buscando carpetas...");
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const sourceQueryName = elements.querySourceFolderNameInput.value.trim();
        const targetQueryName = elements.queryTargetFolderNameInput.value.trim();
        const targetDEName = elements.deTargetFolderNameInput.value.trim();

        resetFolderSelection();
        logger.logMessage("Iniciando búsqueda de carpetas...");

        const [sourceQueryFolders, targetQueryFolders, targetDEFolders] = await Promise.all([
            mcApiService.findDataFolders(sourceQueryName, 'queryactivity', apiConfig),
            mcApiService.findDataFolders(targetQueryName, 'queryactivity', apiConfig),
            mcApiService.findDataFolders(targetDEName, 'dataextension', apiConfig)
        ]);
        
        renderFolderResultsTable(elements.querySourceFoldersTbody, sourceQueryFolders);
        renderFolderResultsTable(elements.queryTargetFoldersTbody, targetQueryFolders);
        renderFolderResultsTable(elements.deTargetFoldersTbody, targetDEFolders);

        elements.queryClonerFolderResultsBlock.classList.remove('hidden');
    } catch (error) {
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Paso 2: Muestra la lista de queries de la carpeta de origen seleccionada.
 */
async function displayQuerySelection() {
    if (!state.sourceQueryFolder) {
        ui.showCustomAlert("No se ha seleccionado una carpeta de origen.");
        return;
    }

    ui.blockUI("Cargando Queries...");
    logger.startLogBuffering();
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const queries = await mcApiService.getQueriesFromFolder(state.sourceQueryFolder.id, apiConfig);
        state.queriesInSourceFolder = queries.map(q => ({
            ...q,
            newQueryName: `${q.name}_Copy`,
            newDeName: q.targetDE.name ? `${q.targetDE.name}_Copy` : '',
            selected: false
        }));
        
        renderQuerySelectionTable(state.queriesInSourceFolder);

        elements.queriesClonerStep1.style.display = 'none';
        elements.queriesClonerStep2.style.display = 'flex';
    } catch (error) {
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Acción Final: Ejecuta el proceso de clonación para las queries seleccionadas.
 */
async function cloneSelectedQueries() {
    const selectedQueries = state.queriesInSourceFolder.filter(q => q.selected);
    if (selectedQueries.length === 0) {
        ui.showCustomAlert("No has seleccionado ninguna query para clonar.");
        return;
    }

    if (!await ui.showCustomConfirm(`Se clonarán ${selectedQueries.length} Query Activities y sus Data Extensions. ¿Continuar?`)) return;

    logger.startLogBuffering();
    let successCount = 0;
    let failCount = 0;

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);
        logger.logMessage(`Iniciando clonación masiva de ${selectedQueries.length} queries...`);

        for (let i = 0; i < selectedQueries.length; i++) {
            const query = selectedQueries[i];
            const progress = `(${i + 1}/${selectedQueries.length})`;
            ui.blockUI(`${progress} Clonando "${query.name}"...`);

            try {
                logger.logMessage(`\n--- ${progress} Procesando Query: "${query.name}" ---`);
                if (!query.targetDE.customerKey) throw new Error("La query no tiene una DE de destino válida.");
                
                logger.logMessage(`  - Paso 1: Clonando DE de destino (Key: ${query.targetDE.customerKey})`);
                const clonedDE = await mcApiService.cloneDataExtension(query.targetDE.customerKey, query.newDeName, "", state.targetDEFolder.id, apiConfig);
                logger.logMessage(`  - Éxito: Nueva DE "${clonedDE.name}" creada con Key: ${clonedDE.customerKey}`);

                logger.logMessage(`  - Paso 2: Creando la nueva Query Activity...`);
                await mcApiService.createClonedQuery(query, clonedDE, query.newQueryName, state.targetQueryFolder.id, apiConfig);
                logger.logMessage(`  - Éxito: Query "${query.newQueryName}" creada.`);
                
                successCount++;
            } catch (cloneError) {
                logger.logMessage(`ERROR al procesar "${query.name}": ${cloneError.message}`);
                failCount++;
            }
        }

        ui.showCustomAlert(`Proceso finalizado.\nÉxitos: ${successCount}\nFallos: ${failCount}`);
        goBackToStep1();

    } catch (error) {
        ui.showCustomAlert(`Error fatal: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

// --- 4. MANIPULACIÓN DE EVENTOS Y UI ---

/**
 * Vuelve a la pantalla de selección de carpetas.
 */
function goBackToStep1() {
    elements.queriesClonerStep2.style.display = 'none';
    elements.queriesClonerStep1.style.display = 'flex';
    state.queriesInSourceFolder = [];
    elements.querySelectionTbody.innerHTML = '';
}

/**
 * Gestiona la selección de una carpeta en una de las tres tablas.
 * @param {Event} event - El evento de clic.
 * @param {string} stateKey - La clave del estado a actualizar ('sourceQueryFolder', etc.).
 */
function handleFolderTableClick(event, stateKey) {
    const clickedRow = event.target.closest('tr');
    if (!clickedRow?.dataset.folderId) return;

    const tbody = event.currentTarget;
    const previouslySelected = tbody.querySelector('tr.selected');
    if (previouslySelected) previouslySelected.classList.remove('selected');

    clickedRow.classList.add('selected');
    state[stateKey] = { id: clickedRow.dataset.folderId, name: clickedRow.dataset.folderName };

    elements.queryClonerContinueBtn.disabled = !(state.sourceQueryFolder && state.targetQueryFolder && state.targetDEFolder);
}

/**
 * Gestiona el clic en el checkbox "Seleccionar Todas".
 * @param {Event} e - El evento de cambio.
 */
function handleSelectAllQueries(e) {
    const isChecked = e.target.checked;
    state.queriesInSourceFolder.forEach(q => q.selected = isChecked);
    elements.querySelectionTbody.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = isChecked);
    elements.queryClonerCloneBtn.disabled = !isChecked;
}

/**
 * Gestiona el clic en un checkbox individual o en una fila de la tabla de queries.
 * @param {Event} e - El evento de clic.
 */
function handleQuerySelection(e) {
    const row = e.target.closest('tr');
    if (!row) return;

    const checkbox = row.querySelector('input[type="checkbox"]');
    if (e.target.type !== 'checkbox') {
        checkbox.checked = !checkbox.checked;
    }
    
    const queryIndex = parseInt(row.dataset.queryIndex, 10);
    state.queriesInSourceFolder[queryIndex].selected = checkbox.checked;

    elements.queryClonerCloneBtn.disabled = !state.queriesInSourceFolder.some(q => q.selected);
    elements.selectAllQueriesCheckbox.checked = state.queriesInSourceFolder.every(q => q.selected);
}

/**
 * Gestiona la edición de los nombres de la query y DE de destino.
 * @param {Event} e - El evento de input.
 */
function handleNameEdits(e) {
    const cell = e.target.closest('td[contenteditable="true"]');
    if (!cell) return;

    const row = cell.closest('tr');
    const index = parseInt(row.dataset.queryIndex, 10);
    const dataType = cell.dataset.type;
    const newValue = cell.textContent.trim();

    if (dataType === 'query-name') {
        state.queriesInSourceFolder[index].newQueryName = newValue;
    } else if (dataType === 'de-name') {
        state.queriesInSourceFolder[index].newDeName = newValue;
    }
}

// --- 5. RENDERIZADO Y HELPERS ---

/**
 * Pinta una tabla de resultados de búsqueda de carpetas.
 * @param {HTMLElement} tbody - El elemento tbody de la tabla.
 * @param {Array} folders - La lista de carpetas a mostrar.
 */
function renderFolderResultsTable(tbody, folders) {
    tbody.innerHTML = '';
    if (!folders || folders.length === 0) {
        tbody.innerHTML = '<tr><td>No se encontraron carpetas.</td></tr>';
        return;
    }
    folders.forEach(folder => {
        const row = tbody.insertRow();
        row.dataset.folderId = folder.id;
        row.dataset.folderName = folder.name;
        row.innerHTML = `<td>${folder.fullPath}</td>`;
    });
}

/**
 * Pinta la tabla de selección de queries.
 * @param {Array} queries - La lista de queries a mostrar.
 */
function renderQuerySelectionTable(queries) {
    elements.querySelectionTbody.innerHTML = '';
    elements.selectAllQueriesCheckbox.checked = false;
    if (!queries || queries.length === 0) {
        elements.querySelectionTbody.innerHTML = '<tr><td colspan="5">No se encontraron Queries en esta carpeta.</td></tr>';
        return;
    }
    queries.forEach((query, index) => {
        const row = elements.querySelectionTbody.insertRow();
        row.dataset.queryIndex = index;
        row.innerHTML = `
            <td><input type="checkbox"></td>
            <td>${query.name}</td>
            <td>${query.targetDE.name}</td>
            <td contenteditable="true" data-type="query-name">${query.newQueryName}</td>
            <td contenteditable="true" data-type="de-name">${query.newDeName}</td>
        `;
    });
}

/**
 * Resetea el estado y la UI de la selección de carpetas.
 */
function resetFolderSelection() {
    state.sourceQueryFolder = null;
    state.targetQueryFolder = null;
    state.targetDEFolder = null;
    [elements.querySourceFoldersTbody, elements.queryTargetFoldersTbody, elements.deTargetFoldersTbody].forEach(tbody => {
        tbody.innerHTML = '';
    });
    elements.queryClonerContinueBtn.disabled = true;
    elements.queryClonerFolderResultsBlock.classList.add('hidden');
}