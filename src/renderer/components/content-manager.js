// Fichero: src/renderer/components/content-manager.js
// Descripción: Módulo para la vista "Gestor de Contenidos".
// Los contenidos se obtienen por API (botón Refrescar) y se guardan en caché local.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { formatCodeWithIndentation, highlightCloudPageCode, buildCodeViewer } from '../ui/code-utils.js';
import { searchAndShowDetail } from './content-finder.js';

// --- CONFIGURACIÓN CENTRAL DE LA VISTA ---
// ===================================================================
// MAPA DE ASSET TYPE IDs
// ===================================================================
// ID   | Nombre técnico         | Tipo                    | Pestaña
// -----|------------------------|-------------------------|----------
//   4  | template               | Template                | Plantillas
// 193  | htmlemail              | HTML Email (legacy)     | Bloques
// 195  | contentarea            | Content Area            | Bloques
// 196  | textblock              | Text Block              | Bloques
// 197  | htmlblock              | HTML Block              | Bloques
// 199  | imageblock             | Image Block             | Bloques
// 201  | buttonblock            | Button Block            | Bloques
// 207  | templatebasedemail     | Template-Based Email    | Emails
// 208  | htmlemail              | HTML Email              | Emails
// 209  | textonlyemail          | Text-Only Email         | Emails
// 212  | freeformblock          | Free Form Block         | Bloques
// 213  | layoutblock            | Layout Block            | Bloques
// 220  | codesnippetblock       | Code Snippet Block      | Code Snippet
// 223  | referenceblock         | Reference Block         | Bloques
// 224  | smartcaptureblock      | Smart Capture Block     | Bloques
// 230  | jsonmessage            | JSON Message            | Push / SMS / WhatsApp
// 235  | jsonmessagetemplate    | JSON Message Template   | Otros
// ===================================================================
const CONTENT_TYPES_CONFIG = [
    { 
        id: 'emails', 
        displayName: 'Emails', 
        assetTypeIds: [207, 208, 209],
        headers: [
            { key: '_actions', label: '', width: '10%' },
            { key: 'id', label: 'ID', width: '7%' },
            { key: 'name', label: 'Nombre', width: '17%' },
            { key: 'assetTypeName', label: 'Tipo', width: '12%' },
            { key: 'modifiedDate', label: 'Modificado', width: '10%' },
            { key: 'templateName', label: 'Plantilla', width: '16%' },
            { key: 'attributes', label: 'Atributos', width: '24%' }
        ]
    },
    {
        id: 'plantillas',
        displayName: 'Plantillas',
        assetTypeIds: [4],
        headers: [
            { key: '_actions', label: '', width: '8%' },
            { key: 'id', label: 'ID', width: '10%' },
            { key: 'name', label: 'Nombre', width: '44%' },
            { key: 'modifiedDate', label: 'Modificado', width: '23%' },
            { key: 'assetTypeName', label: 'Tipo', width: '15%' }
        ]
    },
    { 
        id: 'push', 
        displayName: 'Push', 
        assetTypeIds: [230],
        filter: (item) => item.type === 'push', 
        headers: [
            { key: '_actions', label: '', width: '8%' },
            { key: 'id', label: 'ID', width: '8%' },
            { key: 'name', label: 'Nombre', width: '29%' },
            { key: 'modifiedDate', label: 'Modificado', width: '15%' },
            { key: 'title', label: 'Título', width: '15%' },
            { key: 'subtitle', label: 'Subtítulo', width: '10%' },
            { key: 'action', label: 'Acción', width: '15%' }
        ]
    },
    {
        id: 'sms',
        displayName: 'SMS',
        assetTypeIds: [230],
        filter: (item) => item.type === 'sms', 
        headers: [
            { key: '_actions', label: '', width: '8%' },
            { key: 'id', label: 'ID', width: '12%' },
            { key: 'name', label: 'Nombre', width: '50%' },
            { key: 'modifiedDate', label: 'Modificado', width: '30%' }
        ]
    },
    {
        id: 'whatsapp',
        displayName: 'Whatsapp',
        assetTypeIds: [230],
        filter: (item) => item.type === 'whatsapptemplate', 
        headers: [
            { key: '_actions', label: '', width: '8%' },
            { key: 'id', label: 'ID', width: '12%' },
            { key: 'name', label: 'Nombre', width: '50%' },
            { key: 'modifiedDate', label: 'Modificado', width: '30%' }
        ]
    },
    { 
        id: 'bloques', 
        displayName: 'Bloques', 
        assetTypeIds: [195, 197, 212, 223, 201, 193, 196, 213, 199, 224], 
        headers: [
            { key: '_actions', label: '', width: '8%' },
            { key: 'id', label: 'ID', width: '8%' },
            { key: 'name', label: 'Nombre', width: '39%' },
            { key: 'assetTypeName', label: 'Tipo', width: '20%' },
            { key: 'modifiedDate', label: 'Modificado', width: '25%' }
        ]
    },
    {
        id: 'codesnippet', 
        displayName: 'Code Snippet',
        assetTypeIds: [220],
        headers: [
            { key: '_actions', label: '', width: '8%' },
            { key: 'id', label: 'ID', width: '12%' },
            { key: 'name', label: 'Nombre', width: '50%' },
            { key: 'modifiedDate', label: 'Modificado', width: '30%' }
        ]
    },
    {
        id: 'otros',
        displayName: 'Otros',
        assetTypeIds: [235], 
        headers: [
            { key: '_actions', label: '', width: '8%' },
            { key: 'id', label: 'ID', width: '8%' },
            { key: 'name', label: 'Nombre', width: '39%' },
            { key: 'assetTypeName', label: 'Tipo', width: '20%' },
            { key: 'modifiedDate', label: 'Modificado', width: '25%' }
        ]
    }
];

const ITEMS_PER_PAGE = 15;

// --- ESTADO DEL MÓDULO ---
let fullContentList = [];
let getAuthenticatedConfig;
let tabsState = {};

// --- FUNCIONES PÚBLICAS ---

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    createDynamicTabs();
    setupEventListeners();

    // Botón Refrescar → obtiene datos de la API y machaca la caché
    elements.refreshContentBtn.addEventListener('click', async () => {
        const options = CONTENT_TYPES_CONFIG.map(t => ({ id: t.id, label: t.displayName }));
        const selected = await ui.showCheckboxSelectModal('¿Qué contenidos descargar?', options);
        if (!selected) return;

        const selectedConfig = CONTENT_TYPES_CONFIG.filter(t => selected.includes(t.id));
        fetchContentData(selectedConfig);
    });

    // Exportar → descarga CSV de la pestaña activa
    elements.exportContentCsvBtn.addEventListener('click', () => {
        const activeTab = elements.contentManagerTabButtons.querySelector('.tab-button.active');
        if (activeTab) {
            const tabId = activeTab.dataset.tab.replace('tab-content-', '');
            downloadCsvForTab(tabId);
        }
    });

    // --- Drawer de detalle ---
    const closeContentDrawer = () => {
        elements.contentDetailDrawer.classList.remove('open');
        elements.contentDetailBackdrop.classList.remove('active');
    };
    elements.contentDetailCloseBtn.addEventListener('click', closeContentDrawer);
    elements.contentDetailBackdrop.addEventListener('click', closeContentDrawer);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.contentDetailDrawer.classList.contains('open')) {
            closeContentDrawer();
        }
    });

    // Botón descargar código del drawer
    elements.contentDetailDownloadBtn.addEventListener('click', () => {
        const clientName = elements.clientNameInput.value.trim() || 'cliente';
        const contentName = (elements.contentDetailTitle.textContent || 'contenido').replace(/\s+/g, '_');
        const item = fullContentList.find(c => c.name === elements.contentDetailTitle.textContent);
        if (!item) return;
        const code = item.content || item.message || '';
        if (!code) return;
        const blob = new Blob([code], { type: 'text/html;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${clientName}_${contentName}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    });
}

export async function view() {
    logger.logMessage("Iniciando vista del Gestor de Contenidos.");
    const clientName = elements.clientNameInput.value.trim();

    if (!clientName) {
        ui.showCustomAlert("Por favor, selecciona un cliente para gestionar sus contenidos.");
        return;
    }

    ui.blockUI("Cargando contenidos...");
    try {
        const result = await window.electronAPI.loadClientContents(clientName);
        if (result.success && result.contents) {
            fullContentList = result.contents;
            enrichEmailsWithResolvedContent(fullContentList);
            logger.logMessage(`Cargados ${fullContentList.length} contenidos desde caché para "${clientName}".`);
        } else {
            logger.logMessage(`No hay contenidos en caché para "${clientName}". Pulsa Refrescar para obtenerlos.`);
            fullContentList = [];
        }
        renderAllTabs();
    } catch (error) {
        logger.logMessage(`Error al cargar contenidos: ${error.message}`);
    } finally {
        ui.unblockUI();
    }
}

export function clearCache() {
    fullContentList = [];
    createDynamicTabs();
    CONTENT_TYPES_CONFIG.forEach(tab => {
        const tbody = document.getElementById(`tbody-${tab.id}`);
        if (tbody) tbody.innerHTML = '';
    });
    elements.contentManagerFilter.value = '';
    logger.logMessage("Caché y tablas del Gestor de Contenidos limpiadas.");
}

// --- OBTENCIÓN DE DATOS POR API ---

async function fetchContentData(typesToFetch) {
    const clientName = elements.clientNameInput.value.trim();
    if (!clientName) {
        ui.showCustomAlert("Selecciona un cliente primero.");
        return;
    }

    ui.blockUI("Recuperando contenidos de Content Builder...");
    logger.startLogBuffering();

    try {
        mcApiService.setLogger(logger);

        const contents = await mcApiService.fetchAllContentAssets(
            typesToFetch,
            getAuthenticatedConfig,
            (msg) => ui.blockUI(msg),
            async (partialResults) => {
                await window.electronAPI.saveClientContents({ clientName, contents: partialResults });
                logger.logMessage(`💾 Caché guardada: ${partialResults.length} contenidos.`);
            }
        );

        enrichEmailsWithResolvedContent(contents);

        fullContentList = contents;
        renderAllTabs();
        ui.showCustomAlert(`Se han obtenido ${fullContentList.length} contenidos para "${clientName}".`);

    } catch (error) {
        logger.logMessage(`Error al obtener contenidos: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

// --- PESTAÑAS DINÁMICAS ---

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
        button.innerHTML = `<span class="tab-count" data-tab-count="${tab.id}" style="font-size:0.75em; color:#999; font-weight:normal;">0</span><br>${tab.displayName}`;
        buttonsContainer.appendChild(button);

        const contentDiv = document.createElement('div');
        contentDiv.id = `tab-content-${tab.id}`;
        contentDiv.className = `tab-content ${isActive ? 'active' : ''}`;

        const headersHtml = tab.headers.map(h =>
            `<th class="sortable-header" data-sort-by="${h.key}" data-tab-id="${tab.id}" style="${h.width ? 'width:' + h.width : ''}">${h.label}</th>`
        ).join('');

        contentDiv.innerHTML = `
            <div class="table-container">
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

    // Re-añadir el contador total
    const totalSpan = document.createElement('span');
    totalSpan.id = 'content-total-count';
    totalSpan.style.cssText = 'font-size:0.85em; color:#999; margin-left:auto; align-self:flex-end; padding-bottom:6px; white-space:nowrap;';
    buttonsContainer.appendChild(totalSpan);
    elements.contentTotalCount = totalSpan;
}

function setupEventListeners() {
    elements.contentManagerFilter.addEventListener('input', () => {
        for (const tabId in tabsState) { tabsState[tabId].currentPage = 1; }
        renderAllTabs();
    });

    elements.contentManagerTabButtons.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.tab-button');
        if (!tabBtn) return;
        elements.contentManagerTabButtons.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        elements.contentManagerTabContent.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        tabBtn.classList.add('active');
        document.getElementById(tabBtn.dataset.tab).classList.add('active');
    });

    elements.contentManagerTabContent.addEventListener('click', (e) => {
        // Botón de inspección de contenido
        const inspectBtn = e.target.closest('.cp-inspect-btn');
        if (inspectBtn) {
            const contentId = inspectBtn.dataset.contentId;
            if (contentId) openContentDetail(contentId);
            return;
        }

        // Botón de código resuelto
        const resolveBtn = e.target.closest('.cp-resolve-btn');
        if (resolveBtn) {
            const contentId = resolveBtn.dataset.contentId;
            if (contentId) openResolvedDetail(contentId);
            return;
        }

        const analyzeBtn = e.target.closest('.cp-analyze-btn');
        if (analyzeBtn) {
            const contentId = analyzeBtn.dataset.contentId;
            if (contentId) {
                document.querySelector('.macro-item[data-macro="buscadores"]').click();
                searchAndShowDetail(contentId);
            }
            return;
        }

        const target = e.target;
        if (target.matches('.action-button') && target.id.startsWith('download-')) {
            const tabId = target.id.replace('download-', '').replace('-csv', '');
            downloadCsvForTab(tabId);
            return;
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
            if (pageButton.id.startsWith('prev-') && tabState.currentPage > 1) tabState.currentPage--;
            else if (pageButton.id.startsWith('next-') && tabState.currentPage < totalPages) tabState.currentPage++;
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

// --- RENDERIZADO ---

function renderAllTabs() {
    const filterText = elements.contentManagerFilter.value.toLowerCase().trim();
    let filteredList = fullContentList;

    if (filterText) {
        filteredList = fullContentList.filter(item => {
            return (item.name && item.name.toLowerCase().includes(filterText)) ||
                   (item.content && item.content.toLowerCase().includes(filterText)) ||
                   (item.resolvedContent && item.resolvedContent.toLowerCase().includes(filterText)) ||
                   (item.subject && item.subject.toLowerCase().includes(filterText)) ||
                   (item.preheader && item.preheader.toLowerCase().includes(filterText)) ||
                   (item.attributes && item.attributes.toLowerCase().includes(filterText)) ||
                   (item.title && item.title.toLowerCase().includes(filterText)) ||
                   (item.subtitle && item.subtitle.toLowerCase().includes(filterText)) ||
                   (item.templateName && item.templateName.toLowerCase().includes(filterText)) ||
                   (item.message && item.message.toLowerCase().includes(filterText));
        });
    }

    CONTENT_TYPES_CONFIG.forEach(tab => renderTableForTab(tab.id, filteredList));
    
    // Actualizar contadores de cada pestaña
    CONTENT_TYPES_CONFIG.forEach(tab => {
        const count = tabsState[tab.id]?.currentFilteredList?.length || 0;
        const countSpan = document.querySelector(`[data-tab-count="${tab.id}"]`);
        if (countSpan) countSpan.textContent = count;
    });

    // Total
    if (elements.contentTotalCount) {
        elements.contentTotalCount.textContent = `Total: ${filteredList.length}`;
    }
}

/**
 * Genera el HTML del botón de inspección si el item tiene contenido.
 */
function actionBtnsHtml(item) {
    const hasCode = item.content || item.message;
    let html = '';
    if (hasCode) {
        html += `<span class="cp-inspect-btn" data-content-id="${item.id}" title="Ver código"><svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg></span>`;
    }
    // Botón de código resuelto solo para emails
    if (hasCode && [207, 208, 209].includes(item.assetTypeId)) {
        html += `<span class="cp-resolve-btn" data-content-id="${item.id}" title="Ver código resuelto"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#2e7d32;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg></span>`;
    }
    html += `<span class="cp-analyze-btn" data-content-id="${item.id}" title="Analizar en Buscadores"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#558ac7;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></span>`;
    return html;
}

function renderTableForTab(tabId, sourceData) {
    const tabConfig = CONTENT_TYPES_CONFIG.find(t => t.id === tabId);
    const tbody = document.getElementById(`tbody-${tabId}`);
    if (!tabConfig || !tabConfig.headers || tabConfig.headers.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="12">Funcionalidad pendiente de implementación.</td></tr>`;
        return;
    }

    const tabState = tabsState[tabId];
    const tabData = sourceData.filter(item => {
        const typeMatch = tabConfig.assetTypeIds.includes(item.assetTypeId);
        if (!typeMatch) return false;
        if (tabConfig.filter) return tabConfig.filter(item);
        return true;
    });

    tabState.currentFilteredList = tabData;
    sortData(tabData, tabState.sortColumn, tabState.sortDirection);

    const startIndex = (tabState.currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedItems = tabData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${tabConfig.headers.length}">No se encontraron resultados.</td></tr>`;
    } else {
        tbody.innerHTML = paginatedItems.map(item => {
            const actions = `<td style="text-align:center; white-space:nowrap;">${actionBtnsHtml(item)}</td>`;

            if (tabId === 'emails') {
                const attributesHtml = item.attributes ? item.attributes.replace(/\n/g, '<br>') : '---';
                return `<tr>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${item.assetTypeName || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                    <td title="${escapeHtml(item.templateName) || ''}">${item.templateName || '---'}</td>
                    <td title="${escapeHtml(item.attributes) || ''}">${attributesHtml}</td>
                </tr>`;
            } else if (tabId === 'plantillas') {
                return `<tr>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                    <td>${item.assetTypeName || '---'}</td>
                </tr>`;
            } else if (tabId === 'push') {
                const actionHtml = item.actionType ? `${item.actionType}: ${item.actionUrl || ''}` : '---';
                return `<tr>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                    <td title="${escapeHtml(item.title) || ''}">${item.title || '---'}</td>
                    <td title="${escapeHtml(item.subtitle) || ''}">${item.subtitle || '---'}</td>
                    <td title="${escapeHtml(actionHtml)}">${actionHtml}</td>
                </tr>`;
            } else if (tabId === 'sms') {
                return `<tr>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                </tr>`;
            } else if (tabId === 'whatsapp') {
                return `<tr>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                </tr>`;
            } else if (tabId === 'bloques') {
                return `<tr>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${item.assetTypeName || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                </tr>`;
            } else if (tabId === 'codesnippet') {
                return `<tr>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                </tr>`;
            } else if (tabId === 'otros') {
                return `<tr>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${item.assetTypeName || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                </tr>`;
            }
            return '';
        }).join('');
    }

    updatePaginationUI(tabId);
    updateSortIndicators(tabId);
}

// --- DRAWER DE DETALLE DE CONTENIDO ---

function openContentDetail(contentId) {
    const item = fullContentList.find(c => String(c.id) === String(contentId));
    if (!item) return;

    const code = item.content || item.message || '';
    if (!code) return;

    elements.contentDetailTitle.textContent = item.name || 'Contenido';

    // Metadatos del email (subject + preheader) antes del código
    let metaHtml = '';
    if (item.subject || item.preheader) {
        metaHtml = `<div class="cp-detail-deps-row">`;
        if (item.subject) {
            metaHtml += `<div class="cp-dep-block"><h4>Asunto</h4><div class="dep-items"><div class="dep-item">${escapeHtml(item.subject)}</div></div></div>`;
        }
        if (item.preheader) {
            metaHtml += `<div class="cp-dep-block"><h4>Preheader</h4><div class="dep-items"><div class="dep-item">${escapeHtml(item.preheader)}</div></div></div>`;
        }
        metaHtml += `</div>`;
    }

    const formatted = formatCodeWithIndentation(code);
    const highlighted = highlightCloudPageCode(formatted);

    elements.contentDetailCode.innerHTML = metaHtml + `
        <div class="code-header">Contenido</div>
        <pre><code>${highlighted}</code></pre>`;

    elements.contentDetailDrawer.classList.add('open');
    elements.contentDetailBackdrop.classList.add('active');
}

// --- HELPERS ---

function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatDate(dateString) {
    if (!dateString) return '---';
    try { return new Date(dateString).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }); }
    catch { return 'Fecha inválida'; }
}

function sortData(data, column, direction) {
    const dir = direction === 'asc' ? 1 : -1;
    data.sort((a, b) => {
        let valA = a[column], valB = b[column];
        if (valA == null) return 1;
        if (valB == null) return -1;
        if (column && column.includes('Date')) {
            if (!valA || !valB) return 0;
            return (new Date(valA) - new Date(valB)) * dir;
        }
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

async function downloadCsvForTab(tabId) {
    const tabConfig = CONTENT_TYPES_CONFIG.find(t => t.id === tabId);
    const tabState = tabsState[tabId];
    if (!tabState || tabState.currentFilteredList.length === 0) {
        ui.showCustomAlert("No hay datos en la tabla actual para exportar.");
        return;
    }

    const sortedData = [...tabState.currentFilteredList];
    sortData(sortedData, tabState.sortColumn, tabState.sortDirection);

    // Columnas extra para el CSV que no están en la tabla
    const extraCsvColumns = {
        emails: [
            { key: 'subject', label: 'Asunto' },
            { key: 'preheader', label: 'Preheader' }
        ],
        push: [{ key: 'message', label: 'Mensaje' }],
        sms: [{ key: 'message', label: 'Mensaje' }],
        whatsapp: [{ key: 'message', label: 'Mensaje' }]
    };

    const allColumns = [...tabConfig.headers, ...(extraCsvColumns[tabId] || [])];
    const headers = allColumns.map(h => h.label);
    const headerKeys = allColumns.map(h => h.key);

    const rows = sortedData.map(item => {
        return headerKeys.map(key => {
            let value = item[key];
            if (key === 'attributes' && value) value = value.replace(/<br>/g, ' | ');
            return formatCsvCell(value);
        }).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const BOM = "\uFEFF";
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

function formatCsvCell(value) {
    if (value == null) return '""';
    const s = String(value);
    if (s.includes(',') || s.includes('\n') || s.includes('"')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return `"${s}"`;
}

function openResolvedDetail(contentId) {
    const item = fullContentList.find(c => String(c.id) === String(contentId));
    if (!item || !item.content) return;

    // Crear mapa de bloques por ID
    const blockMap = new Map();
    for (const block of fullContentList) {
        if (block.id && block.content && ![207, 208, 209].includes(block.assetTypeId)) {
            blockMap.set(String(block.id), block.content);
        }
    }

    // Resolver ContentBlockByID/Key/Name
    let resolved = item.content;
    resolved = resolved.replace(/%%=ContentBlockby[Ii][Dd]\s*\(\s*["']?(\d+)["']?\s*\)=%%/gi, (match, id) => {
        return blockMap.get(id) || match;
    });
    resolved = resolved.replace(/%%=ContentBlockby[Kk]ey\s*\(\s*["']([^"']+)["']\s*\)=%%/gi, (match, key) => {
        const found = fullContentList.find(c => c.customerKey === key && c.content);
        return found ? found.content : match;
    });
    resolved = resolved.replace(/%%=ContentBlockby[Nn]ame\s*\(\s*["']([^"']+)["']\s*\)=%%/gi, (match, name) => {
        const found = fullContentList.find(c => c.name === name && c.content);
        return found ? found.content : match;
    });

    elements.contentDetailTitle.textContent = item.name || 'Contenido';

    let metaHtml = '';
    if (item.subject || item.preheader) {
        metaHtml = `<div class="cp-detail-deps-row">`;
        if (item.subject) {
            metaHtml += `<div class="cp-dep-block"><h4>Asunto</h4><div class="dep-items"><div class="dep-item">${escapeHtml(item.subject)}</div></div></div>`;
        }
        if (item.preheader) {
            metaHtml += `<div class="cp-dep-block"><h4>Preheader</h4><div class="dep-items"><div class="dep-item">${escapeHtml(item.preheader)}</div></div></div>`;
        }
        metaHtml += `</div>`;
    }

    const formatted = formatCodeWithIndentation(resolved);
    const highlighted = highlightCloudPageCode(formatted);

    elements.contentDetailCode.innerHTML = metaHtml + `
        <div class="code-header">Código Resuelto</div>
        <pre><code>${highlighted}</code></pre>`;

    elements.contentDetailDrawer.classList.add('open');
    elements.contentDetailBackdrop.classList.add('active');
}

function enrichEmailsWithResolvedContent(contents) {
    const blockMapById = new Map();
    const blockMapByKey = new Map();
    const blockMapByName = new Map();

    for (const item of contents) {
        if (!item.content || [207, 208, 209].includes(item.assetTypeId)) continue;
        if (item.id) blockMapById.set(String(item.id), item.content);
        if (item.customerKey) blockMapByKey.set(item.customerKey, item.content);
        if (item.name) blockMapByName.set(item.name, item.content);
    }

    for (const item of contents) {
        if (![207, 208, 209].includes(item.assetTypeId)) continue;
        if (!item.content) continue;

        let resolved = item.content;
        resolved = resolved.replace(/%%=ContentBlockby[Ii][Dd]\s*\(\s*["']?(\d+)["']?\s*\)=%%/gi, (match, id) => {
            return blockMapById.get(id) || match;
        });
        resolved = resolved.replace(/%%=ContentBlockby[Kk]ey\s*\(\s*["']([^"']+)["']\s*\)=%%/gi, (match, key) => {
            return blockMapByKey.get(key) || match;
        });
        resolved = resolved.replace(/%%=ContentBlockby[Nn]ame\s*\(\s*["']([^"']+)["']\s*\)=%%/gi, (match, name) => {
            return blockMapByName.get(name) || match;
        });

        if (resolved !== item.content) {
            item.resolvedContent = resolved;
        }
    }
}