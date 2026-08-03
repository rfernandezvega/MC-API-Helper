import * as mcApiService from '../api/mc-api-service.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import elements from '../ui/dom-elements.js';
import { escapeHtml, formatDate } from '../ui/format-utils.js';
import { createTableSorter, createPaginator, renderStatusBadge } from '../ui/table-utils.js';

let getAuthenticatedConfig;
let scMasterList = [];
let spMasterList = [];
let tsMasterList = [];
let dpMasterList = [];
let scFilteredList = [];
let spFilteredList = [];
let dpFilteredList = [];

const ITEMS_PER_PAGE = 10;
let dpStack = 's50';

// Un sorter y un paginador por tabla (cada uno con su propio estado). Se crean en init().
let sorterSC, sorterSP, sorterDP;
let paginatorSC, paginatorSP, paginatorDP;

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    // Cada tabla tiene su propio controlador de ordenación (columna Modificado tratada como fecha)
    // y su propio paginador sobre los 4 controles con sufijo (SC/SP/DP).
    sorterSC = createTableSorter({
        tableSelector: '#table-send-classifications',
        initialColumn: 'name',
        types: { modifiedDate: 'date' },
        onSort: renderTableSC
    });
    sorterSP = createTableSorter({
        tableSelector: '#table-sender-profiles',
        initialColumn: 'name',
        types: { modifiedDate: 'date' },
        onSort: renderTableSP
    });
    sorterDP = createTableSorter({
        tableSelector: '#table-delivery-profiles',
        initialColumn: 'name',
        onSort: renderTableDP
    });

    paginatorSC = createPaginator(
        { pageInput: document.getElementById('pageInputSC'), totalLabel: document.getElementById('totalPagesSC'), prevBtn: document.getElementById('prevPageBtnSC'), nextBtn: document.getElementById('nextPageBtnSC') },
        { itemsPerPage: ITEMS_PER_PAGE, onPageChange: renderTableSC }
    );
    paginatorSP = createPaginator(
        { pageInput: document.getElementById('pageInputSP'), totalLabel: document.getElementById('totalPagesSP'), prevBtn: document.getElementById('prevPageBtnSP'), nextBtn: document.getElementById('nextPageBtnSP') },
        { itemsPerPage: ITEMS_PER_PAGE, onPageChange: renderTableSP }
    );
    paginatorDP = createPaginator(
        { pageInput: document.getElementById('pageInputDP'), totalLabel: document.getElementById('totalPagesDP'), prevBtn: document.getElementById('prevPageBtnDP'), nextBtn: document.getElementById('nextPageBtnDP') },
        { itemsPerPage: ITEMS_PER_PAGE, onPageChange: renderTableDP }
    );

    sorterSC.attach();
    sorterSP.attach();
    sorterDP.attach();

    setupEventListeners();
}

function setupEventListeners() {
    elements.refreshSendManagementBtn.addEventListener('click', fetchData);
    elements.downloadSendManagementCsvBtn.addEventListener('click', downloadCSV);

    ['scNameFilter', 'scProfileFilter', 'scTypeFilter'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => { paginatorSC.setPage(1); applyFiltersSC(); });
    });
    ['spNameFilter', 'spFromNameFilter', 'spFromEmailFilter'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => { paginatorSP.setPage(1); applyFiltersSP(); });
    });

    document.querySelectorAll('#sendManagement-section .tab-button').forEach(btn => {
        btn.addEventListener('click', () => setTimeout(updateGlobalCount, 50));
    });

    // Delivery Profiles
    document.getElementById('dp-copy-script-btn').addEventListener('click', copyDPScript);
    document.getElementById('dp-json-input').addEventListener('input', e => processDPJson(e.target.value.trim()));
    ['dpNameFilter', 'dpIpFilter'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => { paginatorDP.setPage(1); applyFiltersDP(); });
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

        initDPTab(apiConfig);
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
    sorterSC.sort(scFilteredList);
    const paginated = paginatorSC.paginate(scFilteredList);
    const baseUrl = `https://members.${dpStack}.exacttarget.com/Content/Administration/SendManagement/SendClassification.aspx?g=`;

    elements.sendClassificationsTbody.innerHTML = paginated.map(item => {
        const spMatch = spMasterList.find(sp => sp.customerKey === item.senderProfile);
        const spName = spMatch ? spMatch.name : item.senderProfile;

        // El tipo se pinta con los badges globales: Comercial (éxito) / Transaccional (info).
        const typeBadge = item.type === 'Marketing'
            ? `<span class="badge badge-success">Comercial</span>`
            : `<span class="badge badge-info">Transaccional</span>`;

        return `<tr>
            <td><a href="${baseUrl}${item.id}" class="external-link"><b>${escapeHtml(item.name)}</b></a><br><small class="u-muted">${escapeHtml(item.customerKey)}</small></td>
            <td>${typeBadge}</td>
            <td><b>${escapeHtml(spName)}</b><br><small class="u-muted">${escapeHtml(item.senderProfile)}</small></td>
            <td>${escapeHtml(item.deliveryProfile)}</td>
            <td>${formatDate(item.modifiedDate)}</td>
        </tr>`;
    }).join('');
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
    sorterSP.sort(spFilteredList);
    const paginated = paginatorSP.paginate(spFilteredList);
    const baseUrl = `https://members.${dpStack}.exacttarget.com/Content/Administration/SendManagement/SenderProfile.aspx?profileid=`;

    elements.senderProfilesTbody.innerHTML = paginated.map(item => {
        const tsMatch = tsMasterList.find(ts => ts.id === item.autoReplyTriggeredId);
        let autoReplyHtml = '&#10060;';
        if (item.autoReply) {
            const tsName = tsMatch ? escapeHtml(tsMatch.name) : 'ID: ' + escapeHtml(item.autoReplyTriggeredId);
            const tsKey = tsMatch ? `<br><small class="u-muted">${escapeHtml(tsMatch.customerKey)}</small>` : '';
            autoReplyHtml = `&#9989; <b>${tsName}</b>${tsKey}`;
        }

        return `<tr>
            <td><a href="${baseUrl}${item.id}" class="external-link"><b>${escapeHtml(item.name)}</b></a><br><small class="u-muted">${escapeHtml(item.customerKey)}</small></td>
            <td class="sm-cell-wrap">${escapeHtml(item.fromName)}</td>
            <td class="sm-cell-wrap">${escapeHtml(item.fromAddress)}</td>
            <td class="sm-cell-sm">${autoReplyHtml}</td>
            <td><small><b>Name:</b> ${escapeHtml(item.autoForwardName)}</small><br><small><b>Email:</b> ${escapeHtml(item.autoForwardEmail)}</small></td>
            <td>${formatDate(item.modifiedDate)}</td>
        </tr>`;
    }).join('');
    updateGlobalCount();
}

function updateGlobalCount() {
    const activeTab = document.querySelector('#sendManagement-section .tab-button.active')?.dataset.tab;
    const countSpan = document.getElementById('send-management-count');
    if (!activeTab || !countSpan) return;
    const filtered = activeTab === 'tab-send-classifications' ? scFilteredList.length
                   : activeTab === 'tab-sender-profiles'      ? spFilteredList.length
                   : dpFilteredList.length;
    const master   = activeTab === 'tab-send-classifications' ? scMasterList.length
                   : activeTab === 'tab-sender-profiles'      ? spMasterList.length
                   : dpMasterList.length;
    countSpan.textContent = `(${filtered} de ${master})`;
    // Cada tabla mantiene sus propios indicadores de ordenación.
    sorterSC.updateIndicators();
    sorterSP.updateIndicators();
    sorterDP.updateIndicators();
}

function downloadCSV() {
    const activeTab = document.querySelector('#sendManagement-section .tab-button.active').dataset.tab;
    let csv = "";
    if (activeTab === 'tab-send-classifications') {
        csv = "Nombre,ExternalKey,Tipo,SenderProfile,DeliveryProfile,Modificado\n";
        scFilteredList.forEach(i => csv += `"${i.name}","${i.customerKey}","${i.type}","${i.senderProfile}","${i.deliveryProfile}","${formatDate(i.modifiedDate)}"\n`);
    } else if (activeTab === 'tab-sender-profiles') {
        csv = "Nombre,ExternalKey,FromName,FromEmail,AutoReply,AutoForwardEmail,Modificado\n";
        spFilteredList.forEach(i => csv += `"${i.name}","${i.customerKey}","${i.fromName}","${i.fromAddress}","${i.autoReply}","${i.autoForwardEmail}","${formatDate(i.modifiedDate)}"\n`);
    } else {
        csv = "Nombre,ExternalKey,Descripcion,ModoIP,IPAddress,Header,Footer\n";
        dpFilteredList.forEach(i => csv += `"${i.name}","${i.externalKey}","${i.description}","${i.ipMode}","${i.ipAddress}","${i.header}","${i.footer}"\n`);
    }
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = activeTab + ".csv";
    link.click();
}

// ============================================================
// DELIVERY PROFILES
// ============================================================

function initDPTab(apiConfig) {
    const stackNumber = (elements.stackKeyInput?.value || '').replace(/S/i, '') || '50';
    dpStack = `s${stackNumber}`;

    const listingUrl = `https://members.${dpStack}.exacttarget.com/Content/Administration/SendManagement/DeliveryProfileListing.aspx`;
    const link = document.getElementById('dp-sfmc-link');
    if (link) {
        link.dataset.url = listingUrl;
        link.onclick = (e) => { e.preventDefault(); window.electronAPI.openExternalLink(listingUrl); };
    }

    // El script que el usuario pegará en la consola de SFMC.
    // Al terminar muestra un popup con el JSON limpio y un botón copiar.
    const script = `(async () => {
    function findGridContext() {
        if (window.grid1) return window;
        for (let f of document.querySelectorAll('iframe')) {
            try { if (f.contentWindow?.grid1) return f.contentWindow; } catch(e) {}
        }
        return null;
    }
    const context = findGridContext();
    if (!context) {
        alert("❌ No se encontró 'grid1'.\\nAsegúrate de estar en la página de Delivery Profiles y que haya cargado completamente.");
        return;
    }
    const profileList = context.grid1.Data.map(row => ({ id: row[1], gridName: row[2] }));
    const finalResults = [];
    for (const profile of profileList) {
        try {
            const doc = new DOMParser().parseFromString(
                await (await fetch(\`https://\${window.location.hostname}/Content/Administration/SendManagement/DeliveryProfile.aspx?g=\${profile.id}\`)).text(),
                'text/html'
            );
            const ipRadio = doc.querySelector('input[name="ip"]:checked');
            const ipSelect = doc.getElementById('ddlIPAddresses');
            let activeIp = "Account Default";
            if (ipRadio?.value === "2") {
                const sel = ipSelect?.querySelector('option[selected="selected"]') || ipSelect?.options[ipSelect?.selectedIndex];
                activeIp = sel ? sel.textContent.trim() : "Private (No IP selected)";
            }
            finalResults.push({
                name:        doc.getElementById('name')?.value        || '',
                externalKey: doc.getElementById('customerKey')?.value || '',
                description: doc.getElementById('description')?.value || '',
                configuration: {
                    ipMode:    ipRadio ? ipRadio.nextSibling.textContent.trim() : "Unknown",
                    ipAddress: activeIp,
                    header:    doc.querySelector('input[name="header"]:checked')?.nextSibling.textContent.trim() || "None",
                    footer:    doc.querySelector('input[name="footer"]:checked')?.nextSibling.textContent.trim() || "None"
                },
                id: profile.id
            });
        } catch(err) { console.error(\`Error en perfil \${profile.id}:\`, err); }
    }
    const json = JSON.stringify(finalResults, null, 2);
    const overlay = document.createElement('div');
    overlay.style = "position:fixed;top:10%;left:15%;width:70%;background:white;z-index:999999;padding:30px;border:5px solid #69a3db;box-shadow:0 0 100px rgba(0,0,0,0.8);font-family:Arial;border-radius:8px;";
    overlay.innerHTML = \`
        <h3 style="margin-top:0;color:#558ac7;">✅ \${finalResults.length} Delivery Profiles encontrados</h3>
        <textarea id="_dp_out" readonly style="width:100%;height:180px;font-family:monospace;font-size:11px;border:1px solid #ccc;border-radius:4px;padding:8px;box-sizing:border-box;resize:none;">\${json}</textarea>
        <div style="display:flex;gap:10px;margin-top:12px;">
            <button id="_dp_copy" style="flex:1;padding:10px;background:#28a745;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;font-size:14px;">📋 Copiar JSON</button>
            <button id="_dp_close" style="flex:1;padding:10px;background:#6c757d;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;font-size:14px;">Cerrar</button>
        </div>\`;
    document.body.appendChild(overlay);
    document.getElementById('_dp_close').addEventListener('click', () => overlay.remove());
    document.getElementById('_dp_copy').addEventListener('click', () => {
        navigator.clipboard.writeText(json).then(() => {
            const btn = document.getElementById('_dp_copy');
            btn.textContent = '✅ ¡Copiado!';
            btn.style.background = '#1a7232';
            setTimeout(() => { btn.textContent = '📋 Copiar JSON'; btn.style.background = '#28a745'; }, 2000);
        });
    });
})();`;

    const pre = document.getElementById('dp-script-to-copy');
    if (pre) pre.textContent = script;
}

function copyDPScript() {
    const code = document.getElementById('dp-script-to-copy')?.textContent || '';
    navigator.clipboard.writeText(code);
    ui.showCustomAlert('Código copiado al portapapeles. Pégalo en la consola de SFMC.');
}

function processDPJson(val) {
    if (!val) return;
    try {
        const raw = JSON.parse(val);
        dpMasterList = raw.map(p => ({
            id:          p.id,
            name:        p.name        || '---',
            externalKey: p.externalKey || '---',
            description: p.description || '---',
            ipMode:      p.configuration?.ipMode    || '---',
            ipAddress:   p.configuration?.ipAddress || '---',
            header:      p.configuration?.header    || 'None',
            footer:      p.configuration?.footer    || 'None',
        }));
        document.getElementById('dp-import-zone').classList.add('hidden');
        document.getElementById('dp-table-zone').classList.remove('hidden');
        paginatorDP.setPage(1);
        applyFiltersDP();
    } catch (e) {
        ui.showCustomAlert('Error al parsear el JSON. Revisa el formato.');
    }
}

function applyFiltersDP() {
    const nameF = document.getElementById('dpNameFilter').value.toLowerCase();
    const ipF   = document.getElementById('dpIpFilter').value.toLowerCase();
    dpFilteredList = dpMasterList.filter(p =>
        (p.name.toLowerCase().includes(nameF) || p.externalKey.toLowerCase().includes(nameF)) &&
        p.ipAddress.toLowerCase().includes(ipF)
    );
    renderTableDP();
}

function renderTableDP() {
    sorterDP.sort(dpFilteredList);
    const paginated = paginatorDP.paginate(dpFilteredList);
    const baseUrl = `https://members.${dpStack}.exacttarget.com/Content/Administration/SendManagement/DeliveryProfile.aspx?g=`;

    document.getElementById('delivery-profiles-tbody').innerHTML = paginated.map(p => `
        <tr>
            <td>
                <a href="${baseUrl}${p.id}" class="external-link"><b>${escapeHtml(p.name)}</b></a>
                <br><small class="u-muted">${escapeHtml(p.externalKey)}</small>
            </td>
            <td><small>${escapeHtml(p.description)}</small></td>
            <td>${escapeHtml(p.ipMode)}</td>
            <td><code class="sm-code">${escapeHtml(p.ipAddress)}</code></td>
            <td>${escapeHtml(p.header)}</td>
            <td>${escapeHtml(p.footer)}</td>
        </tr>
    `).join('');

    updateGlobalCount();
}