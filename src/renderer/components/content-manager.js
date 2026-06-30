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
// 235  | jsonmessagetemplate    | JSON Message Template   | Plantillas Whatsapp
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
            { key: '_actions', label: '', width: '60px' },
            { key: 'id', label: 'ID', width: '65px' },
            { key: 'name', label: 'Nombre', width: '25%' },
            { key: 'waTemplateName', label: 'Plantilla', width: '20%' },
            { key: 'waButtons', label: 'Botones', width: '10%' },
            { key: 'modifiedDate', label: 'Modificado', width: '15%' }
        ]
    },
    {
        id: 'plantillas_wa',
        displayName: 'Plantillas Whatsapp',
        assetTypeIds: [235], 
        headers: [
            { key: '_actions', label: '', width: '60px' },
            { key: 'id', label: 'ID', width: '65px' },
            { key: 'name', label: 'Nombre', width: '18%' },
            { key: 'waTemplateName', label: 'Template', width: '15%' },
            { key: 'waCategory', label: 'Categoría', width: '10%' },
            { key: 'waLanguages', label: 'Idiomas', width: '8%' },
            { key: 'waComponents', label: 'Componentes', width: '12%' },
            { key: 'waMediaType', label: 'Media', width: '6%' },
            { key: 'modifiedDate', label: 'Modificado', width: '12%' }
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
    }    
];

const ITEMS_PER_PAGE = 15;

// --- ESTADO DEL MÓDULO ---
let fullContentList = [];
let getAuthenticatedConfig;
let tabsState = {};
// Filtro de uso: 'all' | 'used' | 'unused'
let usageFilter = 'all';
// Filtro por uso en Journeys: 'all' | 'in' | 'out' (solo emails/push/sms/wa)
let journeyUsageFilter = 'all';
// Journeys cacheados (los descarga la vista de Journeys) y referencias de contenido extraídas
let journeysList = [];
let journeyEmailLegacyIds = new Set(); // triggeredSend.emailId (ID legacy) usado por los journeys
let journeyAssetIds = new Set();       // assetId (sms/push/wa) = id del asset 230
// Mapas: clave de referencia → lista de journeys {id, name, status, version} que la usan
let journeyRefsByEmailLegacyId = new Map();
let journeyRefsByAssetId = new Map();
// Caché de IDs de bloques/plantillas/snippets sin uso (se recalcula al cambiar los contenidos)
let blockUnusedIdsCache = null;
// Filtro: mostrar solo emails cuya plantilla ya no existe
let templateFilterActive = false;
let templateSetsCache = null;
// Selección de filas (ids como string) para borrado
let selectedContentIds = new Set();
// Fecha de la caché de contenidos cargada (para re-guardar tras un borrado sin cambiarla)
let contentLastRefresh = null;

// Tipos cuyo uso se determina por los Journeys
const EMAIL_ASSET_TYPE_IDS = [207, 208, 209];
const MESSAGE_ASSET_TYPE_IDS = [230];

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

    // Filtro "Plantilla inexistente" → solo emails con plantilla huérfana
    elements.contentMissingTemplateFilter.addEventListener('click', () => {
        templateFilterActive = !templateFilterActive;
        const btn = elements.contentMissingTemplateFilter;
        btn.style.backgroundColor = templateFilterActive ? '#558ac7' : '#f9f9f9';
        btn.style.color = templateFilterActive ? '#fff' : '';
        for (const tabId in tabsState) { tabsState[tabId].currentPage = 1; }
        renderAllTabs();
    });

    // Botón Borrar → elimina los contenidos seleccionados
    elements.deleteContentBtn.addEventListener('click', deleteSelectedContents);
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
        // Resetear filtros y selección al entrar en la vista
        usageFilter = 'all';
        if (elements.contentUsageFilter) elements.contentUsageFilter.value = 'all';
        journeyUsageFilter = 'all';
        if (elements.contentJourneyFilter) elements.contentJourneyFilter.value = 'all';
        resetTemplateFilter();
        resetDateFilter();
        selectedContentIds.clear();

        // Cargar caché de journeys (si existe) para poder filtrar por uso
        await loadCachedJourneys(clientName);

        const result = await window.electronAPI.loadClientContents(clientName);
        if (result.success && result.contents) {
            fullContentList = result.contents;
            blockUnusedIdsCache = null;
            templateSetsCache = null;
            contentLastRefresh = result.lastRefresh || null;
            enrichEmailsWithResolvedContent(fullContentList);
            logger.logMessage(`Cargados ${fullContentList.length} contenidos desde caché para "${clientName}".`);
            renderAllTabs();
            updateCacheDate(result.lastRefresh);
        } else {
            logger.logMessage(`No hay contenidos en caché para "${clientName}". Pulsa Refrescar para obtenerlos.`);
            fullContentList = [];
            blockUnusedIdsCache = null;
            templateSetsCache = null;
            contentLastRefresh = null;
            renderAllTabs();
            updateCacheDate(null);
        }
    } catch (error) {
        logger.logMessage(`Error al cargar contenidos: ${error.message}`);
    } finally {
        ui.unblockUI();
    }
}

export function clearCache() {
    fullContentList = [];
    journeysList = [];
    journeyEmailLegacyIds.clear();
    journeyAssetIds.clear();
    journeyRefsByEmailLegacyId.clear();
    journeyRefsByAssetId.clear();
    blockUnusedIdsCache = null;
    templateSetsCache = null;
    selectedContentIds.clear();
    contentLastRefresh = null;
    usageFilter = 'all';
    journeyUsageFilter = 'all';
    if (elements.contentJourneyFilter) elements.contentJourneyFilter.value = 'all';
    resetTemplateFilter();
    resetDateFilter();
    createDynamicTabs();
    CONTENT_TYPES_CONFIG.forEach(tab => {
        const tbody = document.getElementById(`tbody-${tab.id}`);
        if (tbody) tbody.innerHTML = '';
    });
    elements.contentManagerFilter.value = '';
    if (elements.contentUsageFilter) elements.contentUsageFilter.value = 'all';
    updateDeleteButtonState();
    logger.logMessage("Caché y tablas del Gestor de Contenidos limpiadas.");
}

/**
 * Resetea el filtro "Plantilla inexistente" y su botón.
 */
function resetTemplateFilter() {
    templateFilterActive = false;
    if (elements.contentMissingTemplateFilter) {
        elements.contentMissingTemplateFilter.style.backgroundColor = '#f9f9f9';
        elements.contentMissingTemplateFilter.style.color = '';
    }
}

/**
 * Resetea el filtro de rango de fechas.
 */
function resetDateFilter() {
    if (elements.contentDateField) elements.contentDateField.value = '';
    if (elements.contentDateFrom) elements.contentDateFrom.value = '';
    if (elements.contentDateTo) elements.contentDateTo.value = '';
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
                await window.electronAPI.saveClientContents({ 
                    clientName, 
                    contents: partialResults,
                    lastRefresh: new Date().toISOString()
                });
                logger.logMessage(`Caché guardada: ${partialResults.length} contenidos.`);
            }
        );

        enrichEmailsWithResolvedContent(contents);

        fullContentList = contents;
        blockUnusedIdsCache = null;
        templateSetsCache = null;
        selectedContentIds.clear();
        contentLastRefresh = new Date().toISOString();
        renderAllTabs();
        updateCacheDate(contentLastRefresh);
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

    // Re-añadir el contador total y fecha
    const totalSpan = document.createElement('span');
    totalSpan.id = 'content-total-count';
    totalSpan.style.cssText = 'font-size:0.85em; color:#999; margin-left:auto; align-self:flex-end; padding-bottom:6px; white-space:nowrap;';
    buttonsContainer.appendChild(totalSpan);
    elements.contentTotalCount = totalSpan;

    const cacheDate = document.createElement('span');
    cacheDate.id = 'content-cache-date';
    cacheDate.style.cssText = 'font-size:0.75em; color:#bbb; margin-left:8px; align-self:flex-end; padding-bottom:6px; white-space:nowrap;';
    buttonsContainer.appendChild(cacheDate);
    elements.contentCacheDate = cacheDate;

    const journeyDate = document.createElement('span');
    journeyDate.id = 'content-journey-cache-date';
    journeyDate.style.cssText = 'font-size:0.75em; color:#bbb; margin-left:8px; align-self:flex-end; padding-bottom:6px; white-space:nowrap;';
    buttonsContainer.appendChild(journeyDate);
    elements.contentJourneyCacheDate = journeyDate;
}

function setupEventListeners() {
    elements.contentManagerFilter.addEventListener('input', () => {
        for (const tabId in tabsState) { tabsState[tabId].currentPage = 1; }
        renderAllTabs();
    });

    if (elements.contentUsageFilter) {
        elements.contentUsageFilter.addEventListener('change', (e) => {
            usageFilter = e.target.value || 'all';
            if (usageFilter !== 'all' && journeysList.length === 0) {
                logger.logMessage('Aviso: no hay caché de Journeys. Emails, Push, SMS y WhatsApp no se pueden clasificar por uso (pulsa "Consultar Journeys").');
            }
            for (const tabId in tabsState) { tabsState[tabId].currentPage = 1; }
            renderAllTabs();
        });
    }

    if (elements.contentJourneyFilter) {
        elements.contentJourneyFilter.addEventListener('change', (e) => {
            journeyUsageFilter = e.target.value || 'all';
            if (journeyUsageFilter !== 'all' && journeysList.length === 0) {
                logger.logMessage('Aviso: no hay caché de Journeys. Cachéalos desde la vista de Journeys ("Descargar detalle") para filtrar por uso en Journeys.');
            }
            for (const tabId in tabsState) { tabsState[tabId].currentPage = 1; }
            renderAllTabs();
        });
    }

    const onDateFilterChange = () => {
        for (const tabId in tabsState) { tabsState[tabId].currentPage = 1; }
        renderAllTabs();
    };
    if (elements.contentDateField) elements.contentDateField.addEventListener('change', onDateFilterChange);
    if (elements.contentDateFrom) elements.contentDateFrom.addEventListener('change', onDateFilterChange);
    if (elements.contentDateTo) elements.contentDateTo.addEventListener('change', onDateFilterChange);

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


        // Botón de dónde se usa
        const refsBtn = e.target.closest('.cp-refs-btn');
        if (refsBtn) {
            const contentId = refsBtn.dataset.contentId;
            if (contentId) openReferencesDetail(contentId);
            return;
        }

        // Botón de journeys donde se usa
        const journeysBtn = e.target.closest('.cp-journeys-btn');
        if (journeysBtn) {
            const contentId = journeysBtn.dataset.contentId;
            if (contentId) openJourneysDetail(contentId);
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
            return;
        }

        // Selección de fila para borrado (clic en cualquier parte de la fila que no sea un botón)
        const row = e.target.closest('tr[data-content-id]');
        if (row) {
            const id = row.dataset.contentId;
            if (selectedContentIds.has(id)) {
                selectedContentIds.delete(id);
                row.classList.remove('selected');
            } else {
                selectedContentIds.add(id);
                row.classList.add('selected');
            }
            updateDeleteButtonState();
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
            return (item.id && String(item.id).includes(filterText)) ||
                    (item.name && item.name.toLowerCase().includes(filterText)) ||
                    (item.content && item.content.toLowerCase().includes(filterText)) ||
                    (item.resolvedContent && item.resolvedContent.toLowerCase().includes(filterText)) ||
                    (item.subject && item.subject.toLowerCase().includes(filterText)) ||
                    (item.preheader && item.preheader.toLowerCase().includes(filterText)) ||
                    (item.attributes && item.attributes.toLowerCase().includes(filterText)) ||
                    (item.title && item.title.toLowerCase().includes(filterText)) ||
                    (item.subtitle && item.subtitle.toLowerCase().includes(filterText)) ||
                    (item.templateName && item.templateName.toLowerCase().includes(filterText)) ||
                    (item.message && item.message.toLowerCase().includes(filterText)) ||
                    (item.waParams && item.waParams.toLowerCase().includes(filterText)) || 
                    (item.waButtons && item.waButtons.toLowerCase().includes(filterText));
        });
    }

    // Filtro por uso (En uso / Sin uso)
    if (usageFilter !== 'all') {
        if (!blockUnusedIdsCache) blockUnusedIdsCache = findUnusedContentIds();
        const blockUnusedIds = blockUnusedIdsCache;
        filteredList = filteredList.filter(item => {
            const status = getUsageStatus(item, blockUnusedIds);
            if (status === 'unknown') return false; // no clasificable (sin caché de journeys)
            return status === usageFilter;
        });
    }

    // Filtro por uso en Journeys (solo aplica a emails/push/sms/wa)
    if (journeyUsageFilter !== 'all') {
        filteredList = filteredList.filter(item => {
            const canBeInJourney = EMAIL_ASSET_TYPE_IDS.includes(item.assetTypeId) || MESSAGE_ASSET_TYPE_IDS.includes(item.assetTypeId);
            if (!canBeInJourney) return false;
            const inJourney = getJourneysForContent(item).length > 0;
            return journeyUsageFilter === 'in' ? inJourney : !inJourney;
        });
    }

    // Filtro "Plantilla inexistente": solo emails cuya plantilla ya no existe
    if (templateFilterActive) {
        const { idSet, nameSet } = getTemplateSets();
        filteredList = filteredList.filter(item => isEmailWithMissingTemplate(item, idSet, nameSet));
    }

    // Filtro por rango de fechas
    const dateField = elements.contentDateField ? elements.contentDateField.value : '';
    const dateFrom = elements.contentDateFrom ? elements.contentDateFrom.value : '';
    const dateTo = elements.contentDateTo ? elements.contentDateTo.value : '';
    if (dateField && (dateFrom || dateTo)) {
        filteredList = filteredList.filter(item => ui.isDateInRange(item[dateField], dateFrom, dateTo));
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

    // Precalcular qué contenidos tienen referencias
    updateReferencedFlags();

    // Estado del botón Borrar según selección
    updateDeleteButtonState();
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
    // Código resuelto solo para emails
    if (hasCode && [207, 208, 209].includes(item.assetTypeId)) {
        html += `<span class="cp-resolve-btn" data-content-id="${item.id}" title="Ver código resuelto"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#2e7d32;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg></span>`;
    }
    // Dónde se usa (contenidos) — solo si tiene referencias
    if (![207, 208, 209, 230].includes(item.assetTypeId) && item._isReferenced) {
        html += `<span class="cp-refs-btn" data-content-id="${item.id}" title="Dónde se usa"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#e65100;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></span>`;
    }
    // Journeys donde se usa — emails/push/sms/wa referenciados en algún journey cacheado
    if ([207, 208, 209, 230].includes(item.assetTypeId) && getJourneysForContent(item).length > 0) {
        html += `<span class="cp-journeys-btn" data-content-id="${item.id}" title="Journeys donde se usa"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#8e44ad;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></span>`;
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
                return `<tr data-content-id="${item.id}"${selectedContentIds.has(String(item.id)) ? ' class="selected"' : ''}>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${item.assetTypeName || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                    <td title="${escapeHtml(item.templateName) || ''}">${item.templateName || '---'}</td>
                    <td title="${escapeHtml(item.attributes) || ''}">${attributesHtml}</td>
                </tr>`;
            } else if (tabId === 'plantillas') {
                return `<tr data-content-id="${item.id}"${selectedContentIds.has(String(item.id)) ? ' class="selected"' : ''}>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                    <td>${item.assetTypeName || '---'}</td>
                </tr>`;
            } else if (tabId === 'push') {
                const actionHtml = item.actionType ? `${item.actionType}: ${item.actionUrl || ''}` : '---';
                return `<tr data-content-id="${item.id}"${selectedContentIds.has(String(item.id)) ? ' class="selected"' : ''}>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                    <td title="${escapeHtml(item.title) || ''}">${item.title || '---'}</td>
                    <td title="${escapeHtml(item.subtitle) || ''}">${item.subtitle || '---'}</td>
                    <td title="${escapeHtml(actionHtml)}">${actionHtml}</td>
                </tr>`;
            } else if (tabId === 'sms') {
                return `<tr data-content-id="${item.id}"${selectedContentIds.has(String(item.id)) ? ' class="selected"' : ''}>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                </tr>`;
            } else if (tabId === 'whatsapp') {
                const hasButtons = item.waButtons ? 'Sí' : 'No';
                return `<tr data-content-id="${item.id}"${selectedContentIds.has(String(item.id)) ? ' class="selected"' : ''}>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td title="${escapeHtml(item.waTemplateName) || ''}">${item.waTemplateName || '---'}</td>
                    <td>${hasButtons}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                </tr>`;
            } else if (tabId === 'bloques') {
                return `<tr data-content-id="${item.id}"${selectedContentIds.has(String(item.id)) ? ' class="selected"' : ''}>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${item.assetTypeName || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                </tr>`;
            } else if (tabId === 'codesnippet') {
                return `<tr data-content-id="${item.id}"${selectedContentIds.has(String(item.id)) ? ' class="selected"' : ''}>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td>${formatDate(item.modifiedDate)}</td>
                </tr>`;
            } else if (tabId === 'plantillas_wa') {
                const buttonsHtml = item.waButtons ? `<span title="${escapeHtml(item.waButtons)}">Sí</span>` : 'No';
                return `<tr data-content-id="${item.id}"${selectedContentIds.has(String(item.id)) ? ' class="selected"' : ''}>
                    ${actions}
                    <td>${item.id || '---'}</td>
                    <td>${item.name || '---'}</td>
                    <td title="${escapeHtml(item.waTemplateName) || ''}">${item.waTemplateName || '---'}</td>
                    <td>${item.waCategory || '---'}</td>
                    <td>${item.waLanguages || '---'}</td>
                    <td>${item.waComponents || '---'}</td>
                    <td>${item.waMediaType || '---'}</td>
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

    elements.contentDetailTitle.textContent = item.name || 'Contenido';

    // WhatsApp Templates (235) — vista especial
    if (item.assetTypeId === 235) {
        let metaHtml = '<div class="cp-detail-deps-row">';
        if (item.waTemplateName) {
            metaHtml += `<div class="cp-dep-block"><h4>Template</h4><div class="dep-items"><div class="dep-item">${escapeHtml(item.waTemplateName)}</div></div></div>`;
        }
        if (item.waCategory) {
            metaHtml += `<div class="cp-dep-block"><h4>Categoría</h4><div class="dep-items"><div class="dep-item">${item.waCategory}</div></div></div>`;
        }
        if (item.waLanguages) {
            metaHtml += `<div class="cp-dep-block"><h4>Idiomas</h4><div class="dep-items"><div class="dep-item">${item.waLanguages}</div></div></div>`;
        }
        if (item.waMediaType) {
            metaHtml += `<div class="cp-dep-block"><h4>Media</h4><div class="dep-items"><div class="dep-item">${item.waMediaType}</div></div></div>`;
        }
        metaHtml += `</div>`;

        if (item.waButtons) {
            metaHtml += `<div class="cp-detail-deps-row" style="margin-top:8px;">
                <div class="cp-dep-block"><h4>Botones</h4><div class="dep-items"><div class="dep-item">${escapeHtml(item.waButtons).replace(/\|/g, '<br>')}</div></div></div>
            </div>`;
        }

        if (item.waFooter) {
            metaHtml += `<div class="cp-detail-deps-row" style="margin-top:8px;">
                <div class="cp-dep-block"><h4>Footer</h4><div class="dep-items"><div class="dep-item">${escapeHtml(item.waFooter)}</div></div></div>
            </div>`;
        }

        if (item.waParams) {
            metaHtml += `<div class="cp-detail-deps-row" style="margin-top:8px;">
                <div class="cp-dep-block"><h4>Variables</h4><div class="dep-items">${item.waParams.split('\n').map(p => `<div class="dep-item">${escapeHtml(p)}</div>`).join('')}</div></div>
            </div>`;
        }

        const msg = item.message || '';
        const previewHtml = msg ? buildWhatsAppBubble(item) : '';
        elements.contentDetailCode.innerHTML = metaHtml
            + (previewHtml ? `<div style="margin-top:12px;"><div class="code-header">Preview</div>${previewHtml}</div>` : '')
            + (msg ? `<div style="margin-top:12px;"><div class="code-header">Mensaje</div><pre><code>${escapeHtml(msg)}</code></pre></div>` : '');

        elements.contentDetailDrawer.classList.add('open');
        elements.contentDetailBackdrop.classList.add('active');
        return;
    }

    // WhatsApp messages (230 con channel whatsapptemplate)
    if (item.assetTypeId === 230 && item.type === 'whatsapptemplate') {
        let metaHtml = '<div class="cp-detail-deps-row">';
        if (item.waTemplateName) {
            metaHtml += `<div class="cp-dep-block"><h4>Plantilla</h4><div class="dep-items"><div class="dep-item">${escapeHtml(item.waTemplateName)}</div></div></div>`;
        }
        metaHtml += `</div>`;

        if (item.waButtons) {
            metaHtml += `<div class="cp-detail-deps-row" style="margin-top:8px;">
                <div class="cp-dep-block"><h4>Botones</h4><div class="dep-items"><div class="dep-item">${escapeHtml(item.waButtons).replace(/\|/g, '<br>')}</div></div></div>
            </div>`;
        }

        if (item.waParams) {
            metaHtml += `<div class="cp-detail-deps-row" style="margin-top:8px;">
                <div class="cp-dep-block"><h4>Variables</h4><div class="dep-items">${item.waParams.split('\n').map(p => `<div class="dep-item">${escapeHtml(p)}</div>`).join('')}</div></div>
            </div>`;
        }

        const msg = item.message || '';
        elements.contentDetailTitle.textContent = item.name || 'WhatsApp';
        const previewHtml = msg ? buildWhatsAppBubble(item) : '';
        elements.contentDetailCode.innerHTML = metaHtml
            + (previewHtml ? `<div class="code-header">Preview</div>${previewHtml}` : '')
            + (msg ? `<div style="margin-top:12px;"><div class="code-header">Mensaje</div><pre><code>${escapeHtml(msg)}</code></pre></div>` : '');

        elements.contentDetailDrawer.classList.add('open');
        elements.contentDetailBackdrop.classList.add('active');
        return;
    }

    // Resto de contenidos
    const code = item.content || item.message || '';
    if (!code) return;

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

    // Para emails: tabla de componentes (solo template-based) + Data Extensions referenciadas
    // (desde caché, sin rutas). El código de abajo ocupa el resto del espacio disponible.
    if (EMAIL_ASSET_TYPE_IDS.includes(item.assetTypeId)) {
        const isTemplateBased = item.templateId != null || item.templateName || (item.slotBlockIds && item.slotBlockIds.length > 0);
        if (isTemplateBased) {
            const comps = getEmailComponents(item);
            if (comps.length) metaHtml += buildComponentsTableHtml(comps);
        }
        const des = getEmailReferencedDEs(item);
        if (des.length) metaHtml += buildDEsTableHtml(des);
    }

    const formatted = formatCodeWithIndentation(code);
    const highlighted = highlightCloudPageCode(formatted);
    const contentHeaderStyle = metaHtml ? ' style="margin-top:12px;"' : '';

    elements.contentDetailCode.innerHTML = metaHtml + `
        <div class="code-header"${contentHeaderStyle}>Contenido</div>
        <pre><code>${highlighted}</code></pre>`;

    elements.contentDetailDrawer.classList.add('open');
    elements.contentDetailBackdrop.classList.add('active');
}

// Cabecera de celda sticky reutilizable para las tablas del drawer.
const DRAWER_TH = 'position:sticky; top:0; z-index:2; background:#5a6d7e; color:#fff; padding:6px 8px; text-align:left;';

/**
 * Construye la tabla de componentes (ID, Nombre, Tipo) con altura acotada.
 */
function buildComponentsTableHtml(comps) {
    const inlineTag = '<span style="font-size:0.72em; color:#fff; background:#9b59b6; border-radius:3px; padding:0 5px; margin-left:6px;">inline</span>';
    const rows = comps.map(c => `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:5px 8px; color:#888;">${c.id || '---'}</td>
            <td style="padding:5px 8px;">${escapeHtml(c.name)}${c.inline ? inlineTag : ''}</td>
            <td style="padding:5px 8px; color:#666;">${escapeHtml(c.type) || '---'}</td>
            <td style="padding:5px 8px; color:#888; font-size:0.95em;">${escapeHtml(c.ref) || '---'}</td>
        </tr>`).join('');
    return `<div style="margin-top:12px; flex-shrink:0;">
        <div class="code-header">Componentes (${comps.length})</div>
        <div style="overflow:auto; max-height:240px; border:1px solid #e1e4e8; border-top:none; border-radius:0 0 4px 4px;">
            <table style="width:100%; border-collapse:collapse; font-size:0.85em;">
                <thead><tr><th style="${DRAWER_TH}">ID</th><th style="${DRAWER_TH}">Nombre</th><th style="${DRAWER_TH}">Tipo</th><th style="${DRAWER_TH}">Referenciado por</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

/**
 * Construye la tabla de Data Extensions referenciadas (Data Extension, Funciones) con altura acotada.
 */
function buildDEsTableHtml(des) {
    const rows = des.map(d => `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:5px 8px;">${escapeHtml(d.de)}</td>
            <td style="padding:5px 8px; color:#666;">${escapeHtml(d.functions)}</td>
        </tr>`).join('');
    return `<div style="margin-top:12px; flex-shrink:0;">
        <div class="code-header">Data Extensions (${des.length})</div>
        <div style="overflow:auto; max-height:180px; border:1px solid #e1e4e8; border-top:none; border-radius:0 0 4px 4px;">
            <table style="width:100%; border-collapse:collapse; font-size:0.85em;">
                <thead><tr><th style="${DRAWER_TH}">Data Extension</th><th style="${DRAWER_TH}">Funciones</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

/**
 * Devuelve los componentes de un email para la tabla del drawer (igual que el detalle del
 * Buscador, incluyendo bloques inline). Usa la estructura capturada al descargar (item.components)
 * resolviendo nombres/tipos de assets contra la caché, sin llamadas. Si la caché es antigua y no
 * tiene esa estructura, cae a un cálculo aproximado (plantilla + ContentBlockBy* + arrastrados).
 */
function getEmailComponents(item) {
    if (Array.isArray(item.components) && item.components.length > 0) {
        return item.components.map(resolveComponent).filter(Boolean);
    }

    // Fallback para caché antigua (sin estructura de componentes; no incluye inline)
    const comps = [];
    const seen = new Set();
    const add = (c, fallbackName, fallbackType) => {
        const key = c ? 'id:' + c.id : 'n:' + fallbackName;
        if (seen.has(key)) return;
        seen.add(key);
        comps.push({ id: c ? c.id : '', name: c ? c.name : fallbackName, type: c ? (c.assetTypeName || fallbackType) : fallbackType, ref: '', inline: false });
    };
    if (item.templateId != null || item.templateName) {
        const tpl = fullContentList.find(c => c.assetTypeId === 4 && (String(c.id) === String(item.templateId) || c.name === item.templateName));
        add(tpl, item.templateName || `Plantilla ${item.templateId}`, 'Template');
    }
    const text = item.content || '';
    for (const m of text.matchAll(/ContentBlockby[Ii][Dd]\s*\(\s*["']?(\d+)["']?\s*\)/gi)) {
        add(fullContentList.find(x => String(x.id) === m[1]), `ID ${m[1]}`, 'Bloque');
    }
    for (const m of text.matchAll(/ContentBlockby[Kk]ey\s*\(\s*["']([^"']+)["']\s*\)/gi)) {
        add(fullContentList.find(x => x.customerKey === m[1]), m[1], 'Bloque');
    }
    for (const m of text.matchAll(/ContentBlockby[Nn]ame\s*\(\s*["']([^"']+)["']\s*\)/gi)) {
        add(fullContentList.find(x => x.name === m[1]), m[1], 'Bloque');
    }
    if (item.slotBlockIds) {
        for (const id of item.slotBlockIds) {
            const c = fullContentList.find(x => String(x.id) === String(id));
            if (c) add(c, `ID ${id}`, 'Bloque');
        }
    }
    return comps;
}

/**
 * Resuelve un componente capturado (item.components) a {id, name, type, ref, inline} para la tabla.
 */
function resolveComponent(c) {
    if (!c) return null;
    if (c.kind === 'template') {
        const tpl = c.id
            ? fullContentList.find(x => String(x.id) === c.id)
            : (c.name ? fullContentList.find(x => x.assetTypeId === 4 && x.name === c.name) : null);
        return { id: c.id || (tpl ? tpl.id : ''), name: (tpl ? tpl.name : '') || c.name || 'Plantilla', type: 'Template', ref: c.ref || '', inline: false };
    }
    if (c.kind === 'inline') {
        return { id: c.id || '', name: c.name, type: c.type || 'Bloque', ref: c.ref || '', inline: true };
    }
    if (c.kind === 'ref') {
        const a = c.id ? fullContentList.find(x => String(x.id) === c.id) : null;
        return { id: c.id || '', name: a ? a.name : `ID ${c.id}`, type: (a ? a.assetTypeName : null) || c.type || 'Bloque', ref: c.ref || '', inline: false };
    }
    if (c.kind === 'macro') {
        let a = null;
        if (c.macroType === 'Id') a = fullContentList.find(x => String(x.id) === c.macroValue);
        else if (c.macroType === 'Key') a = fullContentList.find(x => x.customerKey === c.macroValue);
        else if (c.macroType === 'Name') a = fullContentList.find(x => x.name === c.macroValue);
        return { id: a ? a.id : (c.id || ''), name: a ? a.name : `${c.macroValue} (no encontrado)`, type: (a ? a.assetTypeName : null) || c.type, ref: c.ref || '', inline: false };
    }
    return null;
}

/**
 * Extrae las Data Extensions referenciadas en el código del email (AMPscript/SSJS) por regex,
 * sin resolver rutas ni hacer llamadas.
 */
function getEmailReferencedDEs(item) {
    const text = [item.content, item.resolvedContent].filter(Boolean).join('\n');
    if (!text) return [];

    const ampFns = ['Lookup', 'LookupRows', 'LookupOrderedRows', 'LookupRowsCS', 'LookupOrderedRowsCS',
        'ClaimRow', 'InsertDE', 'InsertData', 'UpdateDE', 'UpdateData', 'DeleteDE', 'DeleteData',
        'UpsertDE', 'UpsertData', 'DataExtensionRowCount'];
    const ssjsFns = ['Platform\\.Function\\.Lookup', 'Platform\\.Function\\.LookupRows',
        'Platform\\.Function\\.LookupOrderedRows', 'Platform\\.Function\\.InsertData',
        'Platform\\.Function\\.UpdateData', 'Platform\\.Function\\.DeleteData',
        'Platform\\.Function\\.UpsertData', 'DataExtension\\.Init'];

    const deMap = {};
    const scan = (fns, label) => {
        for (const fn of fns) {
            const re = new RegExp(fn + '\\s*\\(\\s*["\']([^"\']+)["\']', 'gi');
            let m;
            while ((m = re.exec(text)) !== null) {
                const de = m[1].trim();
                (deMap[de] = deMap[de] || new Set()).add(label ? label(fn) : fn);
            }
        }
    };
    scan(ampFns, null);
    scan(ssjsFns, p => p.replace(/\\\./g, '.'));

    return Object.entries(deMap)
        .map(([de, fns]) => ({ de, functions: [...fns].join(', ') }))
        .sort((a, b) => a.de.localeCompare(b.de));
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
        whatsapp: [{ key: 'message', label: 'Mensaje' }],
        plantillas_wa: [
            { key: 'waButtons', label: 'Botones' },
            { key: 'message', label: 'Mensaje' }
        ]
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

function findUnusedContentIds() {
    const emailTypeIds = [207, 208, 209, 230];
    const referencedIds = new Set();
    const referencedKeys = new Set();
    const referencedNames = new Set();
    const referencedTemplates = new Set();

    // 1. Recoger referencias directas desde emails/push/sms/wa
    for (const item of fullContentList) {
        if (!emailTypeIds.includes(item.assetTypeId)) continue;

        const searchIn = [item.content, item.resolvedContent, item.message, item.waParams].filter(Boolean).join('\n');
        if (searchIn) {
            for (const m of searchIn.matchAll(/ContentBlockby[Ii][Dd]\s*\(\s*["']?(\d+)["']?\s*\)/gi)) referencedIds.add(m[1]);
            for (const m of searchIn.matchAll(/ContentBlockby[Kk]ey\s*\(\s*["']([^"']+)["']\s*\)/gi)) referencedKeys.add(m[1]);
            for (const m of searchIn.matchAll(/ContentBlockby[Nn]ame\s*\(\s*["']([^"']+)["']\s*\)/gi)) referencedNames.add(m[1]);
        }
        if (item.templateName) referencedTemplates.add(item.templateName);
        if (item.slotBlockIds) {
            for (const id of item.slotBlockIds) referencedIds.add(id);
        }

        // Plantilla WhatsApp referenciada
        if (item.waTemplateRefId) {
            referencedIds.add(item.waTemplateRefId);
        }
    }

    // 2. Propagar cadena: desde los bloques referenciados, buscar sus hijos
    let changed = true;
    while (changed) {
        changed = false;
        for (const item of fullContentList) {
            if (emailTypeIds.includes(item.assetTypeId)) continue;
            if (!item.content) continue;

            const isReferenced =
                referencedIds.has(String(item.id)) ||
                (item.customerKey && referencedKeys.has(item.customerKey)) ||
                (item.name && referencedNames.has(item.name)) ||
                (item.assetTypeId === 4 && referencedTemplates.has(item.name));

            if (!isReferenced) continue;

            // Este bloque está en uso → buscar qué referencia él
            for (const m of item.content.matchAll(/ContentBlockby[Ii][Dd]\s*\(\s*["']?(\d+)["']?\s*\)/gi)) {
                if (!referencedIds.has(m[1])) { referencedIds.add(m[1]); changed = true; }
            }
            for (const m of item.content.matchAll(/ContentBlockby[Kk]ey\s*\(\s*["']([^"']+)["']\s*\)/gi)) {
                if (!referencedKeys.has(m[1])) { referencedKeys.add(m[1]); changed = true; }
            }
            for (const m of item.content.matchAll(/ContentBlockby[Nn]ame\s*\(\s*["']([^"']+)["']\s*\)/gi)) {
                if (!referencedNames.has(m[1])) { referencedNames.add(m[1]); changed = true; }
            }
        }
    }

    // 3. Marcar como sin uso los que no están referenciados
    const unused = new Set();
    for (const item of fullContentList) {
        if (emailTypeIds.includes(item.assetTypeId)) continue;

        const isReferenced =
            referencedIds.has(String(item.id)) ||
            (item.customerKey && referencedKeys.has(item.customerKey)) ||
            (item.name && referencedNames.has(item.name)) ||
            (item.assetTypeId === 4 && referencedTemplates.has(item.name));

        if (!isReferenced) unused.add(item.id);
    }

    return unused;
}

function openReferencesDetail(contentId) {
    const item = fullContentList.find(c => String(c.id) === String(contentId));
    if (!item) return;

    const id = String(item.id);
    const key = item.customerKey || '';
    const name = item.name || '';

    // Buscar quién referencia este componente
    const references = [];
    for (const other of fullContentList) {
        if (other.id === item.id) continue;
        const searchIn = [other.content, other.resolvedContent, other.message].filter(Boolean).join('\n');
        if (!searchIn) continue;

        let refType = null;

        // Por ID
        const idRegex = new RegExp(`ContentBlockby[Ii][Dd]\\s*\\(\\s*["']?${id}["']?\\s*\\)`, 'gi');
        if (idRegex.test(searchIn)) refType = `ContentBlockByID(${id})`;

        // Por Key
        if (!refType && key) {
            const keyRegex = new RegExp(`ContentBlockby[Kk]ey\\s*\\(\\s*["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']\\s*\\)`, 'gi');
            if (keyRegex.test(searchIn)) refType = `ContentBlockByKey("${key}")`;
        }

        // Por Name
        if (!refType && name) {
            const nameRegex = new RegExp(`ContentBlockby[Nn]ame\\s*\\(\\s*["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']\\s*\\)`, 'gi');
            if (nameRegex.test(searchIn)) refType = `ContentBlockByName("${name}")`;
        }

        // Por slotBlockIds (arrastrado)
        if (!refType && other.slotBlockIds && other.slotBlockIds.includes(id)) {
            refType = 'Bloque arrastrado';
        }

        // Por template
        if (!refType && item.assetTypeId === 4 && other.templateName === name) {
            refType = 'Template';
        }

        // WhatsApp message (230) que usa esta plantilla WA (235)
        if (!refType && item.assetTypeId === 235 && other.waTemplateRefId === id) {
            refType = 'Plantilla WhatsApp';
        }

        if (refType) {
            references.push({
                id: other.id,
                name: other.name,
                type: other.assetTypeName || '---',
                refType: refType
            });
        }
    }

    // Renderizar en el drawer
    elements.contentDetailTitle.textContent = `Dónde se usa: ${item.name}`;

    let html = '';
    if (references.length === 0) {
        html = '<div style="padding:20px; color:#999; text-align:center;">Este componente no está referenciado por ningún otro contenido.</div>';
    } else {
        html = `<div style="padding:8px 12px; font-size:0.85em; color:#666; border-bottom:1px solid #e2e8f0;">${references.length} referencia${references.length !== 1 ? 's' : ''} encontrada${references.length !== 1 ? 's' : ''}</div>`;
        html += `<div style="overflow:auto; flex-grow:1;"><table style="width:100%; border-collapse:collapse;">
            <thead><tr>
                <th style="position:sticky; top:0; z-index:2; background:#5a6d7e; color:#fff; padding:8px; text-align:left;">ID</th>
                <th style="position:sticky; top:0; z-index:2; background:#5a6d7e; color:#fff; padding:8px; text-align:left;">Nombre</th>
                <th style="position:sticky; top:0; z-index:2; background:#5a6d7e; color:#fff; padding:8px; text-align:left;">Tipo</th>
                <th style="position:sticky; top:0; z-index:2; background:#5a6d7e; color:#fff; padding:8px; text-align:left;">Cómo se referencia</th>
            </tr></thead><tbody>`;
        for (const ref of references) {
            html += `<tr style="border-bottom:1px solid #eee;">
                <td style="padding:6px 8px;">${ref.id}</td>
                <td style="padding:6px 8px;">${escapeHtml(ref.name)}</td>
                <td style="padding:6px 8px;">${escapeHtml(ref.type)}</td>
                <td style="padding:6px 8px; font-size:0.85em; color:#888;">${escapeHtml(ref.refType)}</td>
            </tr>`;
        }
        html += '</tbody></table></div>';
    }

    elements.contentDetailCode.innerHTML = html;
    elements.contentDetailDrawer.classList.add('open');
    elements.contentDetailBackdrop.classList.add('active');
}

/**
 * Muestra en el drawer la lista de journeys donde se usa un email/mensaje.
 */
function openJourneysDetail(contentId) {
    const item = fullContentList.find(c => String(c.id) === String(contentId));
    if (!item) return;

    const journeys = getJourneysForContent(item);
    elements.contentDetailTitle.textContent = `Journeys donde se usa: ${item.name}`;

    let html = '';
    if (journeys.length === 0) {
        html = '<div style="padding:20px; color:#999; text-align:center;">No se ha encontrado este contenido en ningún journey cacheado.</div>';
    } else {
        html = `<div style="padding:8px 12px; font-size:0.85em; color:#666; border-bottom:1px solid #e2e8f0;">${journeys.length} journey${journeys.length !== 1 ? 's' : ''} encontrado${journeys.length !== 1 ? 's' : ''}</div>`;
        html += `<div style="overflow:auto; flex-grow:1;"><table style="width:100%; border-collapse:collapse;">
            <thead><tr>
                <th style="position:sticky; top:0; z-index:2; background:#5a6d7e; color:#fff; padding:8px; text-align:left;">Journey</th>
                <th style="position:sticky; top:0; z-index:2; background:#5a6d7e; color:#fff; padding:8px; text-align:left;">Versión</th>
                <th style="position:sticky; top:0; z-index:2; background:#5a6d7e; color:#fff; padding:8px; text-align:left;">Estado</th>
            </tr></thead><tbody>`;
        for (const j of journeys) {
            html += `<tr style="border-bottom:1px solid #eee;">
                <td style="padding:6px 8px;">${escapeHtml(j.name)}</td>
                <td style="padding:6px 8px;">${j.version != null ? j.version : '---'}</td>
                <td style="padding:6px 8px;">${escapeHtml(j.status) || '---'}</td>
            </tr>`;
        }
        html += '</tbody></table></div>';
    }

    elements.contentDetailCode.innerHTML = html;
    elements.contentDetailDrawer.classList.add('open');
    elements.contentDetailBackdrop.classList.add('active');
}

function updateCacheDate(dateString) {
    if (!elements.contentCacheDate) return;
    if (!dateString) {
        elements.contentCacheDate.textContent = '';
        return;
    }
    const date = new Date(dateString);
    elements.contentCacheDate.textContent = `Última descarga: ${date.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`;
}

function updateJourneyCacheDate(dateString) {
    if (!elements.contentJourneyCacheDate) return;
    if (!dateString) {
        elements.contentJourneyCacheDate.textContent = '';
        return;
    }
    const date = new Date(dateString);
    elements.contentJourneyCacheDate.textContent = `Journeys: ${date.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`;
}

// ===================================================================
// ===== JOURNEYS: lectura de caché y cálculo de uso =================
// La descarga/caché de journeys la realiza la vista de Journeys.
// Aquí solo se consume el caché para clasificar Emails/Push/SMS/WhatsApp.
// ===================================================================

/**
 * Determina el estado de uso de un contenido.
 * - Emails (207/208/209): "en uso" si su legacyId aparece como triggeredSend.emailId
 *   en algún journey (o, en su defecto, si su asset id se referencia directamente).
 *   Si no hay caché de journeys, o el email no tiene legacyId (caché antigua) → 'unknown'.
 * - Mensajes Push/SMS/WhatsApp (230): "en uso" si su asset id aparece como assetId en algún journey.
 * - Bloques / Plantillas / Snippets / Plantillas WA: según la cadena de
 *   referencias entre contenidos (findUnusedContentIds).
 * @returns {'used'|'unused'|'unknown'}
 */
function getUsageStatus(item, blockUnusedIds) {
    if (EMAIL_ASSET_TYPE_IDS.includes(item.assetTypeId)) {
        if (!journeysList || journeysList.length === 0) return 'unknown';
        const legacy = item.legacyId != null ? String(item.legacyId) : null;
        if (legacy && journeyEmailLegacyIds.has(legacy)) return 'used';
        if (journeyAssetIds.has(String(item.id))) return 'used';        // email referenciado como asset
        if (journeyEmailLegacyIds.has(String(item.id))) return 'used';  // por si el id coincidiera
        if (!legacy) return 'unknown'; // caché de contenidos antigua sin legacyId → no clasificable
        return 'unused';
    }
    if (MESSAGE_ASSET_TYPE_IDS.includes(item.assetTypeId)) {
        if (!journeysList || journeysList.length === 0) return 'unknown';
        return journeyAssetIds.has(String(item.id)) ? 'used' : 'unused';
    }
    return blockUnusedIds.has(item.id) ? 'unused' : 'used';
}

/**
 * Recorre las actividades de los journeys cacheados y separa las referencias:
 *  - journeyEmailLegacyIds: triggeredSend.emailId (ID legacy del email clásico).
 *  - journeyAssetIds: assetId de actividades SMS/Push/WhatsApp (= id del asset 230).
 */
function recomputeJourneyReferences() {
    journeyEmailLegacyIds = new Set();
    journeyAssetIds = new Set();
    journeyRefsByEmailLegacyId = new Map();
    journeyRefsByAssetId = new Map();

    const addRef = (map, key, journey) => {
        const k = String(key);
        if (!map.has(k)) map.set(k, []);
        const arr = map.get(k);
        if (!arr.some(x => x.id === journey.id)) {
            arr.push({ id: journey.id, name: journey.name, status: journey.status, version: journey.version });
        }
    };

    for (const j of (journeysList || [])) {
        const acts = j.activities || [];
        for (const a of acts) {
            const cfg = a.configurationArguments || {};
            if (a.type === 'EMAILV2') {
                const emailId = cfg.triggeredSend?.emailId;
                if (emailId != null) {
                    journeyEmailLegacyIds.add(String(emailId));
                    addRef(journeyRefsByEmailLegacyId, emailId, j);
                }
            }
            if (cfg.assetId != null) {
                journeyAssetIds.add(String(cfg.assetId));
                addRef(journeyRefsByAssetId, cfg.assetId, j);
            }
        }
    }
    logger.logMessage(`Referencias en Journeys → emails(legacy): ${journeyEmailLegacyIds.size}, assets(sms/push/wa): ${journeyAssetIds.size}`);
}

/**
 * Devuelve la lista de journeys {id, name, status, version} donde se usa un contenido.
 */
function getJourneysForContent(item) {
    const result = [];
    const seen = new Set();
    const collect = (arr) => {
        for (const j of (arr || [])) {
            if (!seen.has(j.id)) { seen.add(j.id); result.push(j); }
        }
    };
    if (EMAIL_ASSET_TYPE_IDS.includes(item.assetTypeId)) {
        if (item.legacyId != null) collect(journeyRefsByEmailLegacyId.get(String(item.legacyId)));
        collect(journeyRefsByAssetId.get(String(item.id)));
        collect(journeyRefsByEmailLegacyId.get(String(item.id)));
    } else if (MESSAGE_ASSET_TYPE_IDS.includes(item.assetTypeId)) {
        collect(journeyRefsByAssetId.get(String(item.id)));
    }
    return result;
}

/**
 * Carga los journeys cacheados de un cliente (los descarga la vista de Journeys)
 * y recalcula las referencias de contenido usadas.
 */
async function loadCachedJourneys(clientName) {
    try {
        const result = await window.electronAPI.loadClientJourneys(clientName);
        if (result.success && result.journeys && result.journeys.length > 0) {
            journeysList = result.journeys;
            recomputeJourneyReferences();
            updateJourneyCacheDate(result.lastRefresh);
            logger.logMessage(`Cargados ${journeysList.length} journeys desde caché para "${clientName}".`);
        } else {
            journeysList = [];
            journeyEmailLegacyIds.clear();
            journeyAssetIds.clear();
            journeyRefsByEmailLegacyId.clear();
            journeyRefsByAssetId.clear();
            updateJourneyCacheDate(null);
        }
    } catch (error) {
        journeysList = [];
        journeyEmailLegacyIds.clear();
        journeyAssetIds.clear();
        journeyRefsByEmailLegacyId.clear();
        journeyRefsByAssetId.clear();
        updateJourneyCacheDate(null);
        logger.logMessage(`Error al cargar journeys: ${error.message}`);
    }
}

function updateReferencedFlags() {
    const referencedIds = new Set();

    for (const item of fullContentList) {
        const searchIn = [item.content, item.resolvedContent, item.message, item.waParams].filter(Boolean).join('\n');
        if (searchIn) {
            for (const m of searchIn.matchAll(/ContentBlockby[Ii][Dd]\s*\(\s*["']?(\d+)["']?\s*\)/gi)) referencedIds.add(m[1]);
        }
        if (item.slotBlockIds) item.slotBlockIds.forEach(id => referencedIds.add(id));
        if (item.templateId) referencedIds.add(String(item.templateId));
        if (item.waTemplateRefId) referencedIds.add(item.waTemplateRefId);
    }

    for (const item of fullContentList) {
        item._isReferenced = referencedIds.has(String(item.id));
    }
}

// ===================================================================
// ===== PLANTILLAS INEXISTENTES =====================================
// ===================================================================

/**
 * Construye (y memoiza) los conjuntos de ids y nombres de las plantillas existentes
 * (assetTypeId 4) presentes en la caché de contenidos.
 */
function getTemplateSets() {
    if (templateSetsCache) return templateSetsCache;
    const idSet = new Set();
    const nameSet = new Set();
    for (const item of fullContentList) {
        if (item.assetTypeId === 4) {
            if (item.id != null) idSet.add(String(item.id));
            if (item.name) nameSet.add(item.name);
        }
    }
    templateSetsCache = { idSet, nameSet };
    return templateSetsCache;
}

/**
 * Indica si un item es un email que referencia una plantilla que ya no existe
 * (no aparece en la pestaña de Plantillas).
 */
function isEmailWithMissingTemplate(item, idSet, nameSet) {
    if (!EMAIL_ASSET_TYPE_IDS.includes(item.assetTypeId)) return false;
    const hasTemplateRef = item.templateId != null || !!item.templateName;
    if (!hasTemplateRef) return false;
    if (item.templateId != null && idSet.has(String(item.templateId))) return false; // existe por id
    if (item.templateName && nameSet.has(item.templateName)) return false;            // existe por nombre
    return true;
}

// ===================================================================
// ===== BORRADO DE CONTENIDOS =======================================
// ===================================================================

function updateDeleteButtonState() {
    if (!elements.deleteContentBtn) return;
    const n = selectedContentIds.size;

    // Si alguno de los seleccionados está "en uso", el botón se deshabilita.
    let hasInUse = false;
    if (n > 0) {
        if (!blockUnusedIdsCache) blockUnusedIdsCache = findUnusedContentIds();
        for (const id of selectedContentIds) {
            const item = fullContentList.find(c => String(c.id) === String(id));
            if (item && getUsageStatus(item, blockUnusedIdsCache) === 'used') {
                hasInUse = true;
                break;
            }
        }
    }

    elements.deleteContentBtn.disabled = n === 0 || hasInUse;
    elements.deleteContentBtn.textContent = n > 0 ? `Borrar (${n})` : 'Borrar';
    elements.deleteContentBtn.title = hasInUse
        ? 'Hay elementos en uso seleccionados; deselecciónalos para poder borrar'
        : '';
}

/**
 * Borra los contenidos seleccionados vía API (previa confirmación), actualiza la caché
 * y descarga un CSV con los elementos eliminados.
 */
async function deleteSelectedContents() {
    const ids = [...selectedContentIds];
    if (ids.length === 0) return;

    // Clasificar los seleccionados: los que están "en uso" no se pueden borrar.
    if (!blockUnusedIdsCache) blockUnusedIdsCache = findUnusedContentIds();
    const blockUnusedIds = blockUnusedIdsCache;

    const deletable = [];
    const inUse = [];
    let unknownCount = 0; // uso no verificable (p.ej. emails/mensajes sin caché de journeys)
    for (const id of ids) {
        const item = fullContentList.find(c => String(c.id) === String(id));
        if (!item) continue;
        const status = getUsageStatus(item, blockUnusedIds);
        if (status === 'used') inUse.push(item);
        else {
            if (status === 'unknown') unknownCount++;
            deletable.push(item);
        }
    }

    if (deletable.length === 0) {
        ui.showCustomAlert(`No se puede borrar: ${inUse.length} elemento(s) seleccionado(s) están en uso.`);
        return;
    }

    let confirmMsg = '';
    if (inUse.length > 0) {
        confirmMsg += `${inUse.length} elemento(s) están en uso y NO se borrarán.\n`;
    }
    if (unknownCount > 0) {
        confirmMsg += `${unknownCount} elemento(s) cuyo uso en journeys no se ha podido verificar (cachea los journeys para mayor seguridad).\n`;
    }
    confirmMsg += `\n¿Seguro que quieres borrar ${deletable.length} elemento(s)? Esta acción no se puede deshacer.`;

    const confirmed = await ui.showCustomConfirm(confirmMsg);
    if (!confirmed) return;

    const clientName = elements.clientNameInput.value.trim();
    ui.blockUI(`Borrando 0/${deletable.length}...`);
    logger.startLogBuffering();

    const deleted = [];
    const failed = [];

    try {
        const apiConfig = await getAuthenticatedConfig();
        mcApiService.setLogger(logger);

        let i = 0;
        for (const item of deletable) {
            i++;
            ui.blockUI(`Borrando ${i}/${deletable.length}...`);
            try {
                await mcApiService.deleteContentAsset(item.id, apiConfig);
                deleted.push(item);
                logger.logMessage(`Eliminado: ${item.name} (${item.id})`);
            } catch (e) {
                failed.push({ id: item.id, name: item.name, error: e.message });
                logger.logMessage(`Error al eliminar ${item.id}: ${e.message}`);
            }
        }

        // Quitar los eliminados de la lista y reescribir la caché
        if (deleted.length > 0) {
            const deletedIds = new Set(deleted.map(d => String(d.id)));
            fullContentList = fullContentList.filter(c => !deletedIds.has(String(c.id)));
            blockUnusedIdsCache = null;
            templateSetsCache = null;
            try {
                await window.electronAPI.saveClientContents({
                    clientName,
                    contents: fullContentList,
                    lastRefresh: contentLastRefresh || new Date().toISOString()
                });
            } catch (e) {
                logger.logMessage(`Error al guardar la caché tras el borrado: ${e.message}`);
            }
            await downloadDeletedCsv(deleted);
        }

        selectedContentIds.clear();
        renderAllTabs();

        let msg = `${deleted.length} elemento(s) eliminado(s).`;
        if (inUse.length > 0) msg += ` ${inUse.length} omitido(s) por estar en uso.`;
        if (failed.length > 0) msg += ` ${failed.length} con error (revisa el log).`;
        ui.showCustomAlert(msg);
    } catch (error) {
        logger.logMessage(`Error en el borrado: ${error.message}`);
        ui.showCustomAlert(`Error: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Descarga un CSV con los contenidos eliminados.
 */
async function downloadDeletedCsv(items) {
    const headers = ['ID', 'Nombre', 'Tipo', 'CustomerKey', 'Plantilla', 'Modificado'];
    const rows = items.map(it => [
        formatCsvCell(it.id),
        formatCsvCell(it.name),
        formatCsvCell(it.assetTypeName),
        formatCsvCell(it.customerKey),
        formatCsvCell(it.templateName),
        formatCsvCell(it.modifiedDate ? formatDate(it.modifiedDate) : '')
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const BOM_CHAR = String.fromCharCode(0xFEFF);
    const clientName = elements.clientNameInput.value.trim() || 'cliente';
    const fileName = `eliminados_${clientName}_${new Date().toISOString().slice(0, 10)}.csv`;
    try {
        await window.electronAPI.saveCsvFile({ content: BOM_CHAR + csv, defaultName: fileName });
        logger.logMessage(`CSV de eliminados generado (${items.length}).`);
    } catch (e) {
        logger.logMessage(`Error al guardar el CSV de eliminados: ${e.message}`);
    }
}

function buildWhatsAppBubble(item) {
    if (!item || !item.message) return '';

    // Resolver variables en el mensaje
    let resolvedMsg = escapeHtml(item.message);
    if (item.waParams) {
        const params = item.waParams.split('\n');
        for (const p of params) {
            const match = p.match(/^\$\{(\d+)\}\s*→\s*(.+?)\s*\(/);
            if (match) {
                const varNum = match[1];
                const value = match[2].trim();
                resolvedMsg = resolvedMsg.replace(
                    new RegExp(`\\$\\{${varNum}\\}`, 'g'),
                    `<span class="wa-var-highlight">${escapeHtml(value)}</span>`
                );
            }
        }
    }

    // Media
    let mediaHtml = '';
    const mediaType = item.waMediaType || null;
    const mediaUpper = mediaType ? mediaType.toUpperCase() : null;
    if (mediaUpper === 'IMAGE' && item.waMediaUrl) {
        mediaHtml = `<div class="wa-bubble-media" style="background-image:url('${item.waMediaUrl}'); background-size:cover; background-position:center;"></div>`;
    } else if (mediaUpper === 'IMAGE') {
        mediaHtml = `<div class="wa-bubble-media">📷 IMAGE</div>`;
    } else if (mediaUpper === 'VIDEO') {
        mediaHtml = `<div class="wa-bubble-media video">🎬 VIDEO</div>`;
    }

    // Botones
    let buttonsHtml = '';
    if (item.waButtons) {
        const btns = item.waButtons.split(' | ');
        buttonsHtml = `<div class="wa-bubble-buttons">`;
        for (const btn of btns) {
            const titleMatch = btn.match(/^(.+?)\s*\(/);
            const title = titleMatch ? titleMatch[1] : btn;
            const isUrl = btn.includes('URL');
            const icon = isUrl
                ? `<svg viewBox="0 0 52 52"><path d="M48.7 2H29.6c-.8 0-1.6.5-1.6 1.3v3c0 .8.7 1.7 1.6 1.7h7.9c.9 0 1.4 1 .7 1.6l-17 17c-.6.6-.6 1.5 0 2.1l2.1 2.1c.6.6 1.5.6 2.1 0l17-17c.6-.6 1.6-.2 1.6.7v7.9c0 .8.8 1.7 1.6 1.7h2.9c.8 0 1.5-.9 1.5-1.7v-19c0-.9-.5-1.4-1.3-1.4z"/><path d="M36.3 25.5L32.9 29c-.6.6-.9 1.3-.9 2.1v11.4c0 .8-.7 1.5-1.5 1.5h-21c-.8 0-1.5-.7-1.5-1.5v-21c0-.8.7-1.5 1.5-1.5H21c.8 0 1.6-.3 2.1-.9l3.4-3.4c.6-.6.2-1.7-.7-1.7H6c-2.2 0-4 1.8-4 4v28c0 2.2 1.8 4 4 4h28c2.2 0 4-1.8 4-4V26.2c0-.9-1.1-1.3-1.7-.7z"/></svg>`
                : '';
            buttonsHtml += `<div class="wa-bubble-btn">${icon}${escapeHtml(title)}</div>`;
        }
        buttonsHtml += `</div>`;
    }

    // Footer
    const footerHtml = item.waFooter
        ? `<div class="wa-bubble-footer">${escapeHtml(item.waFooter)}</div>`
        : '';

    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    return `
        <div class="wa-preview">
            <div class="wa-bubble">
                ${mediaHtml}
                <div class="wa-bubble-body">${resolvedMsg}</div>
                ${footerHtml}
                <div class="wa-bubble-time">${timeStr}</div>
                ${buttonsHtml}
            </div>
        </div>`;
}