// Fichero: src/renderer/components/de-finder.js
// Descripción: Módulo que encapsula la lógica del Buscador de Data Extensions.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { escapeHtml } from '../ui/format-utils.js';
import { downloadCsv, buildCsvFileName } from '../ui/csv-export.js';

// --- 1. ESTADO DEL MÓDULO ---

let getAuthenticatedConfig; // Dependencia inyectada desde app.js
let selectedDeName = null;  // Nombre de la DE seleccionada en la tabla de resultados
let lastResults = [];       // Últimos resultados pintados (origen de la descarga en CSV)

// --- 2. FUNCIONES PÚBLICAS ---

/**
 * Inicializa el módulo, configurando listeners y dependencias.
 * @param {object} dependencies - Objeto con dependencias externas.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.searchDEBtn.addEventListener('click', searchDE);
    ui.submitOnEnter(elements.deSearchValue, elements.searchDEBtn);

    // Conmutador "Compartidas": el texto es fijo, así que se sincroniza aria-pressed a mano
    // para que los lectores de pantalla anuncien el estado.
    elements.deSharedToggle.addEventListener('click', () => {
        const isActive = elements.deSharedToggle.classList.toggle('active');
        elements.deSharedToggle.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

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

    elements.downloadDeSearchCsvBtn?.addEventListener('click', downloadResultsCsv);
}

/** Descarga en CSV las Data Extensions encontradas, en el mismo orden que la tabla. */
function downloadResultsCsv() {
    downloadCsv({
        headers: ['Nombre Data Extension', 'External Key', 'Compartida', 'Ruta de Carpeta'],
        rows: lastResults.map(r => [r.name, r.key, r.shared ? 'Sí' : 'No', r.path]),
        fileName: buildCsvFileName('buscador_data_extensions')
    });
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
    elements.deSearchResultsTbody.innerHTML = '<tr><td colspan="4">Buscando...</td></tr>';
    ui.setResultsCount(elements.deSearchResultsTitle, null);
    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        const property = elements.deSearchProperty.value;
        const value = elements.deSearchValue.value.trim();
        if (!value) {
            throw new Error("El campo 'Valor' no puede estar vacío.");
        }
        const includeShared = elements.deSharedToggle.classList.contains('active');
        const sharedSuffix = includeShared ? ' (incluyendo Shared Data Extensions)' : '';

        logger.logMessage(`Buscando DE por ${property} que contenga: "${value}"${sharedSuffix}`);

        const deList = await mcApiService.searchDataExtensions(property, value, apiConfig, includeShared);

        if (deList.length === 0) {
            renderTable([]);
            logger.logMessage("No se encontraron resultados.");
            return;
        }

        logger.logMessage(`Se encontraron ${deList.length} DEs. Obteniendo rutas de carpeta...`);

        const folders = await resolveDeFolders(deList, apiConfig, includeShared);

        let resultsWithPaths = deList.map(deInfo => {
            const folder = folders.get(String(deInfo.categoryId));
            return {
                name: deInfo.deName,
                key: deInfo.customerKey,
                clientId: deInfo.clientId,
                shared: folder?.isShared === true,
                path: folder?.path || 'Data Extensions'
            };
        });

        if (includeShared) {
            resultsWithPaths = keepOwnAndSharedDEs(resultsWithPaths);
        }

        renderTable(resultsWithPaths);
        logger.logMessage("Visualización de resultados completada.");

    } catch (error) {
        logger.logMessage(`Error al buscar la DE: ${error.message}`);
        elements.deSearchResultsTbody.innerHTML = `<tr><td colspan="4" class="error-text">Error: ${escapeHtml(error.message)}</td></tr>`;
        ui.setResultsCount(elements.deSearchResultsTitle, null);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Resuelve en bloque la ruta de carpeta de cada DE y si está en Shared Data Extensions.
 * Se usa la resolución con QueryAllAccounts porque es la única que ve las carpetas
 * compartidas desde una BU hija y la que devuelve el ContentType para marcarlas.
 * Sin el conmutador activo, si esa consulta falla se repliega a la resolución estándar
 * (rutas sin marca de compartida) para que la búsqueda de siempre siga funcionando.
 * @param {Array} deList - DEs devueltas por searchDataExtensions (usa `categoryId`).
 * @param {object} apiConfig - Configuración autenticada de la API.
 * @param {boolean} includeShared - Si el conmutador "Compartidas" está activo.
 * @returns {Promise<Map<string, {path: string, isShared: boolean}>>} Datos de carpeta por ID.
 */
async function resolveDeFolders(deList, apiConfig, includeShared) {
    const categoryIds = deList.map(de => de.categoryId).filter(Boolean);
    try {
        return await mcApiService.resolveFolderPathsAllAccounts(categoryIds, apiConfig);
    } catch (error) {
        if (includeShared) throw error;
        logger.logMessage(`No se pudo comprobar si las carpetas son compartidas (${error.message}). Se resuelven solo las rutas.`);
        const paths = await mcApiService.resolveFolderPaths(categoryIds, apiConfig);
        const folders = new Map();
        paths.forEach((path, id) => folders.set(id, { path, isShared: false }));
        return folders;
    }
}

/**
 * Con QueryAllAccounts la API devuelve DEs de todas las BUs visibles para la credencial.
 * Se conservan solo las de la BU activa y las compartidas; el resto son privadas de otras BUs.
 * @param {Array} results - Resultados con `clientId` y `shared`.
 * @returns {Array} Resultados filtrados.
 */
function keepOwnAndSharedDEs(results) {
    const activeMid = elements.activeMidInput?.value?.trim() || '';
    if (!activeMid) {
        logger.logMessage('No hay MID de BU activa: no se pueden descartar las DEs privadas de otras BUs.');
        return results;
    }
    const filtered = results.filter(r => r.shared || !r.clientId || String(r.clientId) === activeMid);
    const discarded = results.length - filtered.length;
    if (discarded > 0) {
        logger.logMessage(`Se descartan ${discarded} DE(s) privadas de otras Business Units.`);
    }
    return filtered;
}

// --- 4. RENDERIZADO DE LA TABLA ---

/**
 * Dibuja la tabla de resultados del buscador de Data Extensions.
 * @param {Array} results - Array de objetos con { name, key, shared, path }.
 */
function renderTable(results) {
    // Cada nueva búsqueda resetea la selección y deshabilita el botón.
    selectedDeName = null;
    elements.deToSourcesBtn.disabled = true;
    elements.deSearchResultsTbody.innerHTML = '';
    lastResults = [];
    if (elements.downloadDeSearchCsvBtn) elements.downloadDeSearchCsvBtn.disabled = true;
    if (!results || results.length === 0) {
        elements.deSearchResultsTbody.innerHTML = '<tr><td colspan="4">No se encontraron Data Extensions con ese criterio.</td></tr>';
        ui.setResultsCount(elements.deSearchResultsTitle, 0);
        return;
    }

    // Ordenamos los resultados alfabéticamente para agrupar carpetas
    results.sort((a, b) => (a.path + a.name).localeCompare(b.path + b.name));

    lastResults = results;
    if (elements.downloadDeSearchCsvBtn) elements.downloadDeSearchCsvBtn.disabled = false;
    ui.setResultsCount(elements.deSearchResultsTitle, results.length);

    results.forEach(result => {
        const row = elements.deSearchResultsTbody.insertRow();
        row.dataset.deName = result.name;
        row.innerHTML = `<td>${escapeHtml(result.name)}</td><td>${escapeHtml(result.key || '')}</td><td>${result.shared ? 'Sí' : 'No'}</td><td>${escapeHtml(result.path)}</td>`;
    });
}