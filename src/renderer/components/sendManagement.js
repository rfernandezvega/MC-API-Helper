import * as mcApiService from '../api/mc-api-service.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import elements from '../ui/dom-elements.js';

let getAuthenticatedConfig;
let scMasterList = [];
let spMasterList = [];
let tsMasterList = [];
let dpMasterList = [];
let scFilteredList = [];
let spFilteredList = [];
let dpFilteredList = [];

const ITEMS_PER_PAGE = 10;
let currentPageSC = 1;
let currentPageSP = 1;
let currentPageDP = 1;
let dpStack = 's50';
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
        else if (activeTab === 'tab-sender-profiles') renderTableSP();
        else renderTableDP();
    });

    document.querySelectorAll('#sendManagement-section .tab-button').forEach(btn => {
        btn.addEventListener('click', () => setTimeout(updateGlobalCount, 50));
    });

    // Delivery Profiles
    document.getElementById('dp-copy-script-btn').addEventListener('click', copyDPScript);
    document.getElementById('dp-json-input').addEventListener('input', e => processDPJson(e.target.value.trim()));
    ['dpNameFilter', 'dpIpFilter'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => { currentPageDP = 1; applyFiltersDP(); });
    });
    document.getElementById('prevPageBtnDP').addEventListener('click', () => { if (currentPageDP > 1) { currentPageDP--; renderTableDP(); } });
    document.getElementById('nextPageBtnDP').addEventListener('click', () => { if (currentPageDP < Math.ceil(dpFilteredList.length / ITEMS_PER_PAGE)) { currentPageDP++; renderTableDP(); } });

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
    sortData(scFilteredList);
    const paginated = scFilteredList.slice((currentPageSC - 1) * ITEMS_PER_PAGE, currentPageSC * ITEMS_PER_PAGE);
    const baseUrl = `https://members.${dpStack}.exacttarget.com/Content/Administration/SendManagement/SendClassification.aspx?g=`;

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
    const baseUrl = `https://members.${dpStack}.exacttarget.com/Content/Administration/SendManagement/SenderProfile.aspx?profileid=`;

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
            <td style="text-align:left; word-break:break-word; min-width:100px;">${item.fromName}</td>
            <td style="text-align:left; word-break:break-word; min-width:120px;">${item.fromAddress}</td>
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
    const filtered = activeTab === 'tab-send-classifications' ? scFilteredList.length
                   : activeTab === 'tab-sender-profiles'      ? spFilteredList.length
                   : dpFilteredList.length;
    const master   = activeTab === 'tab-send-classifications' ? scMasterList.length
                   : activeTab === 'tab-sender-profiles'      ? spMasterList.length
                   : dpMasterList.length;
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
        currentPageDP = 1;
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
    sortData(dpFilteredList);
    const paginated = dpFilteredList.slice((currentPageDP - 1) * ITEMS_PER_PAGE, currentPageDP * ITEMS_PER_PAGE);
    const baseUrl = `https://members.${dpStack}.exacttarget.com/Content/Administration/SendManagement/DeliveryProfile.aspx?g=`;

    document.getElementById('delivery-profiles-tbody').innerHTML = paginated.map(p => `
        <tr>
            <td style="text-align:left;">
                <a href="${baseUrl}${p.id}" class="external-link"><b>${p.name}</b></a>
                <br><small style="color:#888;">${p.externalKey}</small>
            </td>
            <td style="text-align:left;"><small>${p.description}</small></td>
            <td>${p.ipMode}</td>
            <td><code style="font-size:0.85em;">${p.ipAddress}</code></td>
            <td>${p.header}</td>
            <td>${p.footer}</td>
        </tr>
    `).join('');

    updatePaginationUI('DP', dpFilteredList.length, currentPageDP);
    updateGlobalCount();
}

function formatDate(ds) {
    if (!ds) return "---";
    const d = new Date(ds);
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}, ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}