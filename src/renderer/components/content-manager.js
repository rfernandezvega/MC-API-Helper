// Fichero: src/renderer/components/content-manager.js
// Descripción: Módulo para la vista "Gestor de Contenidos".

import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

// --- CONFIGURACIÓN CENTRAL DE LA VISTA ---
const CONTENT_TYPES_CONFIG = [
     { 
        id: 'emails', 
        displayName: 'Emails', 
        assetTypeIds: [207, 208, 209],
        headers: [
            { key: 'id', label: 'ID' },
            { key: 'name', label: 'Nombre' },
            { key: 'assetTypeName', label: 'Tipo' },
            { key: 'createdDate', label: 'Creado' },
            { key: 'modifiedDate', label: 'Modificado' },
            { key: 'templateName', label: 'Plantilla' },
            { key: 'attributes', label: 'Atributos' },
            { key: 'subject', label: 'Asunto' },
            { key: 'preheader', label: 'Preheader' }
        ]
    }
];

const ITEMS_PER_PAGE = 5;

// --- ESTADO DEL MÓDULO ---
let fullContentList = [];
let getAuthenticatedConfig;
let tabsState = {};

/**
 * Inicializa el módulo.
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    createDynamicTabs();
    setupEventListeners();

    // Listeners para los botones de la modal.
    elements.contentManagerImportBtn.addEventListener('click', processPastedContents);
    elements.contentManagerCancelBtn.addEventListener('click', () => ui.hideModal(elements.contentManagerModal));
    elements.contentManagerCopyScriptBtn.addEventListener('click', copyScriptToClipboard);
    elements.contentManagerCbLink.addEventListener('click', ui.handleExternalLink);
}

/**
 * Prepara y muestra la vista.
 */
export async function view() {
    logger.logMessage("Iniciando vista del Gestor de Contenidos.");
    if (fullContentList.length === 0) {
        await showGetContentsModal();
    } else {
        renderAllTabs();
    }
}

/**
 * Limpia los datos del módulo.
 */
export function clearCache() {
    fullContentList = [];
    tabsState = {};
    CONTENT_TYPES_CONFIG.forEach(tab => {
        const tbody = document.getElementById(`tbody-${tab.id}`);
        if (tbody) tbody.innerHTML = '';
    });
    
}

/**
 * Muestra la modal con el script de extracción dinámico.
 */
async function showGetContentsModal() {
    try {
        const stackKey = elements.stackKeyInput.value;
        if (!stackKey || stackKey === 'No disponible') {
            ui.showCustomAlert("No se pudo determinar el stack. Por favor, selecciona un cliente y haz login.");
            return;
        }
        const stackNumber = stackKey.replace('S', '');
        
        const cbUrl = `https://content-builder.s${stackNumber}.marketingcloudapps.com/`;
        elements.contentManagerCbLink.href = cbUrl;
        elements.contentManagerCbLink.textContent = cbUrl;
        
        const allTypeIds = CONTENT_TYPES_CONFIG.flatMap(type => type.assetTypeIds);
        
        const scriptContent = `(async () => {
    const baseUrl = "https://content-builder.s${stackNumber}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/";
    const allTypeIds = [${allTypeIds.join(', ')}];
    const pageSize = 500;
    let page = 1;
    let allResults = [];
    console.log("🚀 Buscando assets de tipos:", allTypeIds);

    const extractData = (a) => {
        const attributes = a?.data?.email?.attributes
            ?.filter(attr => attr.value)
            .map(attr => \`\${attr.order}: \${attr.value}\`)
            .join('\\n') || null;

        return {
            id: a.id,
            name: a.name,
            assetTypeId: a.assetType?.id,
            assetTypeName: a.assetType?.displayName,
            createdDate: a.createdDate,
            modifiedDate: a.modifiedDate,
            templateId: a?.views?.html?.template?.id ?? null,
            templateName: a?.views?.html?.template?.name ?? null,
            attributes: attributes,
            subject: a?.views?.subjectline?.content ?? null,
            preheader: a?.views?.preheader?.content ?? null,
            content: a?.views?.html?.content ?? a.content ?? null
        };
    };

    while (true) {
        const url = \`\${baseUrl}?$page=\${page}&$pageSize=\${pageSize}&$orderBy=modifiedDate%20desc\`;
        console.log(\`📄 Consultando página \${page}...\`);
        const res = await fetch(url);
        if (!res.ok) { console.error(\`❌ Error: \${res.status}\`); break; }
        const data = await res.json();
        const items = data.items || [];
        if (items.length === 0) break;
        
        for(const item of items) {
            if (allTypeIds.includes(item?.assetType?.id)) {
                allResults.push(extractData(item));
            }
        }

        if (items.length < pageSize) break;
        page++;
    }

    const finalJson = { items: allResults };
    console.log("✅ Proceso completado. Se encontraron", allResults.length, "elementos.");
    console.log("👇 HAZ CLIC DERECHO en el objeto de abajo, selecciona 'Copy object' y pégalo en la aplicación.");
    console.log(finalJson);
})();`;

        elements.contentManagerFetchScript.textContent = scriptContent;
        elements.contentManagerPasteArea.value = '';
        ui.showModal(elements.contentManagerModal);

    } catch (error) {
        ui.showCustomAlert(`Error al preparar el modal: ${error.message}`);
    }
}

function copyScriptToClipboard() {
    navigator.clipboard.writeText(elements.contentManagerFetchScript.textContent)
        .then(() => ui.showCustomAlert("¡Código copiado!"))
        .catch(err => ui.showCustomAlert(`Error al copiar: ${err.message}`));
}

function processPastedContents() {
    const jsonText = elements.contentManagerPasteArea.value.trim();
    if (!jsonText) return ui.showCustomAlert("El área de texto está vacía.");
    
    try {
        const data = JSON.parse(jsonText);
        if (!Array.isArray(data?.items)) throw new Error("Formato de JSON no válido.");

        fullContentList = data.items;
        logger.logMessage(`Importados ${fullContentList.length} contenidos.`);
        ui.showCustomAlert(`Se han importado ${fullContentList.length} contenidos.`);
        
        ui.hideModal(elements.contentManagerModal);
        renderAllTabs();
    } catch (error) {
        logger.logMessage(`Error al procesar JSON: ${error.message}`);
        ui.showCustomAlert(`Error al procesar el JSON: ${error.message}`);
    }
}

function renderAllTabs() {
    const filterText = elements.contentManagerFilter.value.toLowerCase().trim();
    let filteredList = fullContentList;

    if (filterText) {
        filteredList = fullContentList.filter(item => {
            return (item.name && item.name.toLowerCase().includes(filterText)) ||
                   (item.content && item.content.toLowerCase().includes(filterText)) ||
                   (item.subject && item.subject.toLowerCase().includes(filterText)) ||
                   (item.preheader && item.preheader.toLowerCase().includes(filterText));
        });
    }

    CONTENT_TYPES_CONFIG.forEach(tab => renderTableForTab(tab.id, filteredList));
}

function renderTableForTab(tabId, sourceData) {
    const tabConfig = CONTENT_TYPES_CONFIG.find(t => t.id === tabId);
    const tbody = document.getElementById(`tbody-${tabId}`);

    if (!tabConfig || tabConfig.headers.length === 0) {
        if(tbody) tbody.innerHTML = `<tr><td colspan="10">Funcionalidad pendiente de implementación.</td></tr>`;
        return;
    }
    
    const tabState = tabsState[tabId];
    const tabData = sourceData.filter(item => tabConfig.assetTypeIds.includes(item.assetTypeId));
    tabState.currentFilteredList = tabData;

    sortData(tabData, tabState.sortColumn, tabState.sortDirection);

    const startIndex = (tabState.currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedItems = tabData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${tabConfig.headers.length}">No se encontraron resultados.</td></tr>`;
    } else {
        tbody.innerHTML = paginatedItems.map(item => {
            const attributesHtml = item.attributes ? item.attributes.replace(/\n/g, '<br>') : '---';
            return `
                <tr>
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${item.assetTypeName || '---'}</td>
                    <td>${formatDate(item.createdDate)}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                    <td>${item.templateName || '---'}</td>
                    <td style="white-space: pre-wrap; text-align: left; max-width: 200px; word-break: break-all;">${attributesHtml}</td>
                    <td style="max-width: 250px; word-break: break-all;">${item.subject || '---'}</td>
                    <td style="max-width: 250px; word-break: break-all;">${item.preheader || '---'}</td>
                </tr>
            `;
        }).join('');
    }
    
    updatePaginationUI(tabId);
    updateSortIndicators(tabId);
}

function formatDate(dateString) {
    if (!dateString) return '---';
    try {
        return new Date(dateString).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    } catch {
        return 'Fecha inválida';
    }
}

function sortData(data, column, direction) {
    const dir = direction === 'asc' ? 1 : -1;
    
    data.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        // Trata los nulos para que siempre vayan al final
        if (valA == null) return 1;
        if (valB == null) return -1;

        // Lógica específica para fechas
        if (column && column.includes('Date')) {
            // new Date(null) puede dar una fecha válida, así que comprobamos de nuevo
            if (!valA || !valB) return 0; 
            return (new Date(valA) - new Date(valB)) * dir;
        }
        
        // Lógica para todo lo demás (texto y números)
        // localeCompare con estas opciones es la forma más robusta de ordenar
        return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
}

function updatePaginationUI(tabId) {
    const tabState = tabsState[tabId];
    if (!tabState) return;
    const totalItems = tabState.currentFilteredList.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    
    document.getElementById(`total-pages-${tabId}`).textContent = `/ ${totalPages}`;
    document.getElementById(`page-input-${tabId}`).value = tabState.currentPage;
    document.getElementById(`page-input-${tabId}`).max = totalPages;
    document.getElementById(`prev-page-${tabId}`).disabled = tabState.currentPage === 1;
    document.getElementById(`next-page-${tabId}`).disabled = tabState.currentPage >= totalPages;
}

function updateSortIndicators(tabId) {
    const tabState = tabsState[tabId];
    if (!tabState) return;
    document.querySelectorAll(`#table-${tabId} .sortable-header`).forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
        if (header.dataset.sortBy === tabState.sortColumn) {
            header.classList.add(tabState.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

function createDynamicTabs() {
    const buttonsContainer = elements.contentManagerTabButtons;
    const contentContainer = elements.contentManagerTabContent;
    buttonsContainer.innerHTML = '';
    contentContainer.innerHTML = '';

    CONTENT_TYPES_CONFIG.forEach((tab, index) => {
        tabsState[tab.id] = {
            currentPage: 1,
            sortColumn: 'modifiedDate',
            sortDirection: 'desc',
            currentFilteredList: []
        };

        const isActive = index === 0;
        const button = document.createElement('button');
        button.className = `tab-button ${isActive ? 'active' : ''}`;
        button.dataset.tab = `tab-content-${tab.id}`;
        button.textContent = tab.displayName;
        buttonsContainer.appendChild(button);

        const contentDiv = document.createElement('div');
        contentDiv.id = `tab-content-${tab.id}`;
        contentDiv.className = `tab-content ${isActive ? 'active' : ''}`;

        const headersHtml = tab.headers.length > 0 
            ? tab.headers.map(h => `<th class="sortable-header" data-sort-by="${h.key}" data-tab-id="${tab.id}">${h.label}</th>`).join('')
            : '<th>Configuración pendiente</th>';

        contentDiv.innerHTML = `
            <div class="section-header" style="padding: 10px 0; margin-bottom: 10px; border-bottom: none;">
                <div class="header-actions"><button id="download-${tab.id}-csv" class="action-button">Exportar</button></div>
            </div>
            <div class="table-container">
                <!-- AÑADIMOS EL WRAPPER PARA EL SCROLL -->
                <div class="table-scroll-wrapper">
                    <table id="table-${tab.id}">
                        <thead><tr>${headersHtml}</tr></thead>
                        <tbody id="tbody-${tab.id}"></tbody>
                    </table>
                </div>
            </div>
            <div id="pagination-${tab.id}" class="pagination-controls">
                <button id="prev-page-${tab.id}" data-tab-id="${tab.id}" class="action-button pagination-arrow">&laquo;</button>
                <input type="number" id="page-input-${tab.id}" data-tab-id="${tab.id}" class="filter-input page-input" min="1" value="1">
                <span id="total-pages-${tab.id}">/ 1</span>
                <button id="next-page-${tab.id}" data-tab-id="${tab.id}" class="action-button pagination-arrow">&raquo;</button>
            </div>
        `;
        contentContainer.appendChild(contentDiv);
    });
}

function setupEventListeners() {
    elements.contentManagerFilter.addEventListener('input', () => {
        for (const tabId in tabsState) {
            tabsState[tabId].currentPage = 1;
        }
        renderAllTabs();
    });

    elements.contentManagerTabButtons.addEventListener('click', (e) => {
        if (!e.target.matches('.tab-button')) return;
        elements.contentManagerTabButtons.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        elements.contentManagerTabContent.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');
    });

    elements.contentManagerTabContent.addEventListener('click', (e) => {
        const target = e.target;
        if (target.matches('.action-button') && target.id.startsWith('download-')) {
            const tabId = target.id.replace('download-', '').replace('-csv', '');
            downloadCsvForTab(tabId);
            return; // Termina la ejecución aquí
        }

        const header = e.target.closest('.sortable-header');
        if (header) {
            const tabId = header.dataset.tabId;
            const newSortColumn = header.dataset.sortBy;
            const tabState = tabsState[tabId];
            if (tabState.sortColumn === newSortColumn) {
                tabState.sortDirection = tabState.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                tabState.sortColumn = newSortColumn;
                tabState.sortDirection = 'asc';
            }
            tabState.currentPage = 1;
            renderAllTabs();
            return;
        }

        const pageButton = e.target.closest('.pagination-arrow');
        if (pageButton) {
            const tabId = pageButton.dataset.tabId;
            const tabState = tabsState[tabId];
            const totalPages = Math.ceil(tabState.currentFilteredList.length / ITEMS_PER_PAGE) || 1;
            if (pageButton.id.startsWith('prev-') && tabState.currentPage > 1) {
                tabState.currentPage--;
            } else if (pageButton.id.startsWith('next-') && tabState.currentPage < totalPages) {
                tabState.currentPage++;
            }
            renderAllTabs();
        }
    });

    elements.contentManagerTabContent.addEventListener('change', (e) => {
        if (e.target.matches('.page-input')) {
            const tabId = e.target.dataset.tabId;
            const tabState = tabsState[tabId];
            const totalPages = Math.ceil(tabState.currentFilteredList.length / ITEMS_PER_PAGE) || 1;
            let newPage = parseInt(e.target.value, 10) || 1;
            if (newPage < 1) newPage = 1;
            if (newPage > totalPages) newPage = totalPages;
            tabState.currentPage = newPage;
            renderAllTabs();
        }
    });
}

/**
 * Prepara y descarga un fichero CSV para una pestaña específica.
 * @param {string} tabId - El ID de la pestaña (ej: 'emails').
 */
async function downloadCsvForTab(tabId) {
    const tabConfig = CONTENT_TYPES_CONFIG.find(t => t.id === tabId);
    const tabState = tabsState[tabId];

    if (!tabState || tabState.currentFilteredList.length === 0) {
        ui.showCustomAlert("No hay datos en la tabla actual para exportar.");
        return;
    }

    // 1. Crear una copia de los datos y ordenarla como en la tabla
    const sortedData = [...tabState.currentFilteredList];
    sortData(sortedData, tabState.sortColumn, tabState.sortDirection);

    // 2. Definir las cabeceras del CSV
    const headers = tabConfig.headers.map(h => h.label);
    const headerKeys = tabConfig.headers.map(h => h.key);

    // 3. Convertir cada objeto a una fila de CSV
    const rows = sortedData.map(item => {
        return headerKeys.map(key => {
            let value = item[key];
            // Formateo especial para los atributos para que se lean mejor en el CSV
            if (key === 'attributes' && value) {
                value = value.replace(/<br>/g, ' | ');
            }
            return formatCsvCell(value);
        }).join(',');
    });

    // 4. Unir todo el contenido
    const csvContent = [headers.join(','), ...rows].join('\n');
    
    // 5. Usar la API de Electron para guardar el fichero
    const BOM = "\uFEFF"; // Para compatibilidad con Excel
    const fileName = `export_${tabId}_${new Date().toISOString().slice(0, 10)}.csv`;

    try {
        const result = await window.electronAPI.saveCsvFile({ content: BOM + csvContent, defaultName: fileName });
        if (result.success) {
            logger.logMessage(`Exportación completada para ${tabId}.`);
            ui.showCustomAlert("Fichero exportado con éxito.");
        }
    } catch (error) {
        logger.logMessage(`Error al exportar CSV: ${error.message}`);
        ui.showCustomAlert(`Error al guardar el fichero: ${error.message}`);
    }
}

/**
 * Formatea un valor para que sea seguro en una celda de CSV.
 * Maneja comillas, comas y saltos de línea.
 * @param {*} value - El valor a formatear.
 * @returns {string} - El valor formateado para CSV.
 */
function formatCsvCell(value) {
    if (value == null) {
        return '""';
    }
    const stringValue = String(value);
    // Si el valor contiene comas, saltos de línea o comillas, lo envolvemos en comillas
    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        // Escapamos las comillas dobles existentes duplicándolas
        const escapedValue = stringValue.replace(/"/g, '""');
        return `"${escapedValue}"`;
    }
    return `"${stringValue}"`; // Envolvemos todo en comillas por seguridad
}