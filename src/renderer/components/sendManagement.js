import * as mcApiService from '../api/mc-api-service.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import elements from '../ui/dom-elements.js';

let getAuthenticatedConfig;
let scMasterList = [];
let spMasterList = [];
let tsMasterList = [];
let scFilteredList = [];
let spFilteredList = [];

const ITEMS_PER_PAGE = 10;
let currentPageSC = 1;
let currentPageSP = 1;
let currentSortColumn = 'name';
let currentSortDirection = 'asc';

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    setupEventListeners();
}

function setupEventListeners() {
    elements.refreshSendManagementBtn.addEventListener('click', fetchData);
    elements.downloadSendManagementCsvBtn.addEventListener('click', downloadCSV);

    ['scNameFilter', 'scProfileFilter', 'scTypeFilter'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => { currentPageSC = 1; applyFiltersSC(); });
    });
    ['spNameFilter', 'spFromNameFilter', 'spFromEmailFilter'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => { currentPageSP = 1; applyFiltersSP(); });
    });

    document.getElementById('prevPageBtnSC').addEventListener('click', () => { if (currentPageSC > 1) { currentPageSC--; renderTableSC(); }});
    document.getElementById('nextPageBtnSC').addEventListener('click', () => { if (currentPageSC < Math.ceil(scFilteredList.length / ITEMS_PER_PAGE)) { currentPageSC++; renderTableSC(); }});
    document.getElementById('prevPageBtnSP').addEventListener('click', () => { if (currentPageSP > 1) { currentPageSP--; renderTableSP(); }});
    document.getElementById('nextPageBtnSP').addEventListener('click', () => { if (currentPageSP < Math.ceil(spFilteredList.length / ITEMS_PER_PAGE)) { currentPageSP++; renderTableSP(); }});

    elements.sendManagementSection.addEventListener('click', (e) => {
        const header = e.target.closest('.sortable-header');
        if (!header) return;
        currentSortDirection = (currentSortColumn === header.dataset.sortBy && currentSortDirection === 'asc') ? 'desc' : 'asc';
        currentSortColumn = header.dataset.sortBy;
        const activeTab = document.querySelector('#sendManagement-section .tab-button.active').dataset.tab;
        if (activeTab === 'tab-send-classifications') renderTableSC();
        else renderTableSP();
    });

    document.querySelectorAll('#sendManagement-section .tab-button').forEach(btn => {
        btn.addEventListener('click', () => setTimeout(updateGlobalCount, 50));
    });

    elements.sendManagementSection.addEventListener('click', ui.handleExternalLink);
}

export async function view() {
    if (scMasterList.length === 0) await fetchData();
    else updateGlobalCount();
}

async function fetchData() {
    ui.blockUI('Cargando configuraciones de envío...');
    logger.startLogBuffering();
    mcApiService.setLogger(logger);

    try {
        const apiConfig = await getAuthenticatedConfig();
        [scMasterList, spMasterList] = await Promise.all([
            mcApiService.fetchAllSendClassifications(apiConfig),
            mcApiService.fetchAllSenderProfiles(apiConfig)
        ]);

        const triggeredSendIds = [...new Set(spMasterList.map(sp => sp.autoReplyTriggeredId).filter(id => id && id !== '---' && id !== 'null'))];
        if (triggeredSendIds.length > 0) {
            tsMasterList = await mcApiService.fetchTriggeredSendDetails(apiConfig, triggeredSendIds);
        }

        applyFiltersSC();
        applyFiltersSP();
    } catch (error) {
        ui.showCustomAlert("Error: " + error.message);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

function applyFiltersSC() {
    const nameFilter = document.getElementById('scNameFilter').value.toLowerCase();
    const profileFilter = document.getElementById('scProfileFilter').value.toLowerCase();
    const typeFilter = document.getElementById('scTypeFilter').value;
    const tokens = nameFilter.split(/[,;|]/).map(t => t.trim()).filter(Boolean);

    scFilteredList = scMasterList.filter(item => {
        const matchName = tokens.length === 0 || tokens.some(t => item.name.toLowerCase().includes(t) || item.customerKey.toLowerCase().includes(t));
        const matchProfile = item.senderProfile.toLowerCase().includes(profileFilter) || item.deliveryProfile.toLowerCase().includes(profileFilter);
        const matchType = !typeFilter || item.type === typeFilter;
        return matchName && matchProfile && matchType;
    });
    renderTableSC();
}

function renderTableSC() {
    sortData(scFilteredList);
    const paginated = scFilteredList.slice((currentPageSC - 1) * ITEMS_PER_PAGE, currentPageSC * ITEMS_PER_PAGE);
    const baseUrl = `https://members.exacttarget.com/Content/Administration/SendManagement/SendClassification.aspx?g=`;

    elements.sendClassificationsTbody.innerHTML = paginated.map(item => {
        const spMatch = spMasterList.find(sp => sp.customerKey === item.senderProfile);
        const spName = spMatch ? spMatch.name : item.senderProfile;

        return `<tr>
            <td style="text-align:left;"><a href="${baseUrl}${item.id}" class="external-link"><b>${item.name}</b></a><br><small style="color:#888;">${item.customerKey}</small></td>
            <td><span class="um-status-pill ${item.type === 'Marketing' ? 'um-status-active' : 'um-status-inactive'}" style="background-color: ${item.type === 'Marketing' ? '#28a745' : '#558ac7'};">${item.type === 'Marketing' ? 'Comercial' : 'Transaccional'}</span></td>
            <td style="text-align:left;"><b>${spName}</b><br><small style="color:#888;">${item.senderProfile}</small></td>
            <td>${item.deliveryProfile}</td>
            <td>${formatDate(item.modifiedDate)}</td>
        </tr>`;
    }).join('');
    updatePaginationUI('SC', scFilteredList.length, currentPageSC);
    updateGlobalCount();
}

function applyFiltersSP() {
    const nameFilter = document.getElementById('spNameFilter').value.toLowerCase();
    const fromNameFilter = document.getElementById('spFromNameFilter').value.toLowerCase();
    const fromEmailFilter = document.getElementById('spFromEmailFilter').value.toLowerCase();

    spFilteredList = spMasterList.filter(item => {
        const matchName = item.name.toLowerCase().includes(nameFilter) || item.customerKey.toLowerCase().includes(nameFilter);
        const matchFromName = item.fromName.toLowerCase().includes(fromNameFilter);
        const matchFromEmail = item.fromAddress.toLowerCase().includes(fromEmailFilter);
        return matchName && matchFromName && matchFromEmail;
    });
    renderTableSP();
}

function renderTableSP() {
    sortData(spFilteredList);
    const paginated = spFilteredList.slice((currentPageSP - 1) * ITEMS_PER_PAGE, currentPageSP * ITEMS_PER_PAGE);
    const baseUrl = `https://members.exacttarget.com/Content/Administration/SendManagement/SenderProfile.aspx?profileid=`;

    elements.senderProfilesTbody.innerHTML = paginated.map(item => {
        const tsMatch = tsMasterList.find(ts => ts.id === item.autoReplyTriggeredId);
        let autoReplyHtml = '❌';
        if (item.autoReply) {
            const tsName = tsMatch ? tsMatch.name : 'ID: ' + item.autoReplyTriggeredId;
            const tsKey = tsMatch ? `<br><small style="color:#888;">${tsMatch.customerKey}</small>` : '';
            autoReplyHtml = `✅ <b>${tsName}</b>${tsKey}`;
        }

        return `<tr>
            <td style="text-align:left;"><a href="${baseUrl}${item.id}" class="external-link"><b>${item.name}</b></a><br><small style="color:#888;">${item.customerKey}</small></td>
            <td>${item.fromName}</td>
            <td>${item.fromAddress}</td>
            <td style="text-align:left; font-size: 0.9em;">${autoReplyHtml}</td>
            <td style="text-align:left;"><small><b>Name:</b> ${item.autoForwardName}</small><br><small><b>Email:</b> ${item.autoForwardEmail}</small></td>
            <td>${formatDate(item.modifiedDate)}</td>
        </tr>`;
    }).join('');
    updatePaginationUI('SP', spFilteredList.length, currentPageSP);
    updateGlobalCount();
}

function updatePaginationUI(suffix, totalFiltered, current) {
    const totalPages = Math.ceil(totalFiltered / ITEMS_PER_PAGE) || 1;
    document.getElementById(`totalPages${suffix}`).textContent = `/ ${totalPages}`;
    document.getElementById(`pageInput${suffix}`).value = current;
    document.getElementById(`prevPageBtn${suffix}`).disabled = current === 1;
    document.getElementById(`nextPageBtn${suffix}`).disabled = current >= totalPages;
}

function updateGlobalCount() {
    const activeTab = document.querySelector('#sendManagement-section .tab-button.active')?.dataset.tab;
    const countSpan = document.getElementById('send-management-count');
    if (!activeTab || !countSpan) return;
    const filtered = activeTab === 'tab-send-classifications' ? scFilteredList.length : spFilteredList.length;
    const master = activeTab === 'tab-send-classifications' ? scMasterList.length : spMasterList.length;
    countSpan.textContent = `(${filtered} de ${master})`;
    updateSortIndicators();
}

function sortData(list) {
    const dir = currentSortDirection === 'asc' ? 1 : -1;
    list.sort((a, b) => {
        let valA = (a[currentSortColumn] || '').toString().toLowerCase();
        let valB = (b[currentSortColumn] || '').toString().toLowerCase();
        return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
}

function updateSortIndicators() {
    document.querySelectorAll('#sendManagement-section .sortable-header').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
        if (header.dataset.sortBy === currentSortColumn) {
            header.classList.add(currentSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

function downloadCSV() {
    const activeTab = document.querySelector('#sendManagement-section .tab-button.active').dataset.tab;
    let csv = "";
    if (activeTab === 'tab-send-classifications') {
        csv = "Nombre,ExternalKey,Tipo,SenderProfile,DeliveryProfile,Modificado\n";
        scFilteredList.forEach(i => csv += `"${i.name}","${i.customerKey}","${i.type}","${i.senderProfile}","${i.deliveryProfile}","${formatDate(i.modifiedDate)}"\n`);
    } else {
        csv = "Nombre,ExternalKey,FromName,FromEmail,AutoReply,AutoForwardEmail,Modificado\n";
        spFilteredList.forEach(i => csv += `"${i.name}","${i.customerKey}","${i.fromName}","${i.fromAddress}","${i.autoReply}","${i.autoForwardEmail}","${formatDate(i.modifiedDate)}"\n`);
    }
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = activeTab + ".csv";
    link.click();
}

function formatDate(ds) {
    if (!ds) return "---";
    const d = new Date(ds);
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}, ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}