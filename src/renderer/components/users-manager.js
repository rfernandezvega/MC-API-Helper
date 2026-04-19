import * as mcApiService from '../api/mc-api-service.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import elements from '../ui/dom-elements.js';

// Scope raíz de toda la sección — todos los querySelector van contra este nodo
const ROOT_ID = 'gestion-usuarios-section';
const $ = (sel) => document.querySelector(`#${ROOT_ID} ${sel}`);
const $$ = (sel) => document.querySelectorAll(`#${ROOT_ID} ${sel}`);
const $id = (id) => document.getElementById(id);

let usersMasterList = [];
let selectedUserIds = [];   // máximo 2 elementos
let currentSortColumn = 'lastLogin';
let currentSortDirection = 'desc';
let statusFilter = 'all';
let selectedRoles = new Set();
const ITEMS_PER_PAGE = 10;
let currentPageUsers = 1;

let importedData = [];
let _lastFilteredCount = 0;
let onlyDiffsActive = false;
let isExpanded = true;

let getAuthenticatedConfig;
let _bound = false;

// ============================================================
// INIT — solo guarda dependencias
// ============================================================
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
}

// _bind se llama en view() cuando la sección ya es visible
function _bind() {
    if (_bound) return;
    _bound = true;

    $id('refreshUsersBtn')       ?.addEventListener('click', refreshData);
    $id('downloadUsersCsvBtn')   ?.addEventListener('click', downloadCSV);
    $id('prepareCapturBtn')      ?.addEventListener('click', generateInstructions);
    $id('userSearchInput')       ?.addEventListener('input', renderUserTable);
    $id('btn-toggle-diffs')      ?.addEventListener('click', toggleDiffFilter);
    $id('btn-expand-perms')      ?.addEventListener('click', toggleExpandCollapse);
    $id('users-filter-status')   ?.addEventListener('change', e => { statusFilter = e.target.value; renderUserTable(); });
    $id('users-role-dropdown-trigger')?.addEventListener('click', toggleRoleDropdown);
    $id('users-copy-script-btn') ?.addEventListener('click', copyScript);
    $id('users-json-input')      ?.addEventListener('input', e => processImportedData(e.target.value.trim()));

    // Ordenación — scoped al thead de esta sección
    $('table#users-table thead')?.addEventListener('click', handleSort);

    // Selección de filas — delegación sobre el tbody
    $id('users-tbody')?.addEventListener('click', handleRowSelection);

    // Pestañas — propias, no usan .tab-button
    $$('.um-tab-button').forEach(btn =>
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            switchTab(btn.dataset.umTab);
        })
    );

    $id('prevPageBtnUsers')?.addEventListener('click', () => {
        if (currentPageUsers > 1) { currentPageUsers--; renderUserTable(); }
    });
    $id('nextPageBtnUsers')?.addEventListener('click', () => {
        currentPageUsers++;
        renderUserTable();
    });
    $id('pageInputUsers')?.addEventListener('change', e => {
        const total = Math.ceil(_lastFilteredCount / ITEMS_PER_PAGE) || 1;
        currentPageUsers = Math.max(1, Math.min(parseInt(e.target.value) || 1, total));
        renderUserTable();
    });

    // Cerrar dropdown al hacer clic fuera
    document.addEventListener('mousedown', e => {
        const menu = $id('users-role-dropdown-menu');
        const trigger = $id('users-role-dropdown-trigger');
        if (!menu || menu.style.display === 'none') return;
        if (!trigger?.contains(e.target) && !menu.contains(e.target))
            menu.style.display = 'none';
    });
}

// ============================================================
// CAMBIO DE PESTAÑA — scoped a esta sección
// ============================================================
function switchTab(tabId) {
    $$('.um-tab-button').forEach(b => b.classList.remove('um-tab-active'));
    $$('.um-tab-content').forEach(c => c.classList.remove('um-tab-content-active'));
    $(`[data-um-tab="${tabId}"]`)?.classList.add('um-tab-active');
    $id(tabId)?.classList.add('um-tab-content-active');

    const expandControls = $id('users-expand-controls');
    if (expandControls)
        expandControls.style.display = (tabId === 'tab-user-detail' && importedData.length > 0) ? 'flex' : 'none';
}

// ============================================================
// VIEW
// ============================================================
export async function view() {
    _bind();
    if (usersMasterList.length === 0) {
        await refreshData();
    } else {
        renderUserTable();
    }
}

export function clearCache() {
    usersMasterList = [];
    selectedUserIds = [];
    selectedRoles = new Set();
    statusFilter = 'all';
    importedData = [];
    const tbody = $id('users-tbody');
    if (tbody) tbody.innerHTML = '';
}

// ============================================================
// DATOS (SOAP)
// ============================================================
async function refreshData() {
    ui.blockUI('Recuperando usuarios...');
    logger.startLogBuffering();
    mcApiService.setLogger(logger);
    try {
        const apiConfig = await getAuthenticatedConfig();
        const rawUsers = await mcApiService.fetchAllUsers(apiConfig);

        usersMasterList = rawUsers.map(u => ({
            ...u,
            rolesText: u.roles.map(r => r.name).join(', ')
        }));

        selectedUserIds = [];
        selectedRoles = new Set();
        statusFilter = 'all';

        const statusEl = $id('users-filter-status');
        if (statusEl) statusEl.value = 'all';

        buildRoleFilterDropdown();
        renderUserTable();
        updateButtons();
        setExpandControlsVisible(false);
    } catch (error) {
        ui.showCustomAlert(error.message);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

// ============================================================
// TABLA — renderiza; selección NO llama a esta función
// ============================================================
function renderUserTable() {
    const searchRaw = $id('userSearchInput')?.value || '';
    const tokens = searchRaw.split(/[,;|]/).map(t => t.trim().toLowerCase()).filter(Boolean);

    let data = usersMasterList.filter(u => {
        const nameMatch = tokens.length === 0 ||
            tokens.some(t => u.name.toLowerCase().includes(t) || u.userName.toLowerCase().includes(t));
        const statusMatch =
            statusFilter === 'all' ||
            (statusFilter === 'active' && u.isActive) ||
            (statusFilter === 'inactive' && !u.isActive);
        const roleMatch = selectedRoles.size === 0 ||
            [...selectedRoles].every(r => u.roles.some(ur => ur.name === r));
        return nameMatch && statusMatch && roleMatch;
    });

    // Si el filtro cambió (distinto total), volver a página 1
    if (data.length !== _lastFilteredCount) currentPageUsers = 1;
    _lastFilteredCount = data.length;

    sortData(data);

    const paginated = data.slice((currentPageUsers - 1) * ITEMS_PER_PAGE, currentPageUsers * ITEMS_PER_PAGE);

    const tbody = $id('users-tbody');
    if (!tbody) return;

    tbody.innerHTML = paginated.map(u => `
        <tr data-id="${u.id}" class="${selectedUserIds.includes(u.id) ? 'um-selected' : ''}">
            <td style="text-align:left;"><b>${u.name}</b><br><small style="color:#888;">${u.id}</small></td>
            <td style="text-align:left;">${u.userName}</td>
            <td>${u.isApi ? 'Sí' : 'No'}</td>
            <td>${formatDate(u.lastLogin)}</td>
            <td><span class="um-status-pill ${u.isActive ? 'um-status-active' : 'um-status-inactive'}">${u.isActive ? 'Activo' : 'Inactivo'}</span></td>
            <td style="text-align:left;"><small>${u.roles.map(r => r.name).join(', ')}</small></td>
        </tr>
    `).join('');

    updateSortIndicators();
    _updatePaginationUI();
}

function _updatePaginationUI() {
    const total = Math.ceil(_lastFilteredCount / ITEMS_PER_PAGE) || 1;
    if (currentPageUsers > total) currentPageUsers = total;
    $id('totalPagesUsers').textContent = `/ ${total}`;
    $id('pageInputUsers').value = currentPageUsers;
    $id('prevPageBtnUsers').disabled = currentPageUsers === 1;
    $id('nextPageBtnUsers').disabled = currentPageUsers >= total;
}

// Selección: SOLO manipula clases, nunca llama a renderUserTable
function handleRowSelection(e) {
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const tbody = $id('users-tbody');

    if (selectedUserIds.includes(id)) {
        // Deseleccionar
        selectedUserIds = selectedUserIds.filter(i => i !== id);
        row.classList.remove('um-selected');
    } else {
        // Si ya hay 2, quitar el más antiguo
        if (selectedUserIds.length >= 2) {
            const removedId = selectedUserIds.shift();
            tbody?.querySelector(`tr[data-id="${removedId}"]`)?.classList.remove('um-selected');
        }
        selectedUserIds.push(id);
        row.classList.add('um-selected');
    }

    updateButtons();
}

function handleSort(e) {
    const th = e.target.closest('.um-sortable');
    if (!th) return;
    const col = th.dataset.sortBy;
    currentSortDirection = (currentSortColumn === col && currentSortDirection === 'asc') ? 'desc' : 'asc';
    currentSortColumn = col;
    renderUserTable();
}

function sortData(data) {
    const dir = currentSortDirection === 'asc' ? 1 : -1;
    data.sort((a, b) => {
        const va = a[currentSortColumn], vb = b[currentSortColumn];
        if (va == null) return 1; if (vb == null) return -1;
        return String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' }) * dir;
    });
}

// ============================================================
// FILTROS
// ============================================================
function buildRoleFilterDropdown() {
    const allRoles = new Set();
    usersMasterList.forEach(u => u.roles.forEach(r => allRoles.add(r.name)));
    const list = $id('users-role-checkbox-list');
    if (!list) return;
    list.innerHTML = '';
    [...allRoles].sort().forEach(role => {
        const lbl = document.createElement('label');
        lbl.className = 'um-dropdown-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.value = role;
        cb.addEventListener('change', updateRoleFilter);
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(role));
        list.appendChild(lbl);
    });
    updateRoleDropdownLabel();
}

function toggleRoleDropdown() {
    const menu = $id('users-role-dropdown-menu');
    const trigger = $id('users-role-dropdown-trigger');
    if (!menu || !trigger) return;
    if (menu.style.display !== 'none') { menu.style.display = 'none'; return; }
    const rect = trigger.getBoundingClientRect();
    menu.style.width  = rect.width + 'px';
    menu.style.left   = rect.left + 'px';
    const spaceBelow  = window.innerHeight - rect.bottom;
    const menuH       = Math.min(220, menu.scrollHeight || 220);
    menu.style.top    = (spaceBelow < menuH + 10 && rect.top > menuH)
        ? (rect.top - menuH - 4) + 'px' : (rect.bottom + 4) + 'px';
    menu.style.display = 'block';
}

function updateRoleFilter() {
    selectedRoles = new Set();
    document.querySelectorAll('#users-role-checkbox-list input[type=checkbox]:checked')
        .forEach(cb => selectedRoles.add(cb.value));
    updateRoleDropdownLabel();
    renderUserTable();
}

function updateRoleDropdownLabel() {
    const label = $id('users-role-dropdown-label');
    if (!label) return;
    label.textContent = selectedRoles.size === 0 ? 'Todos los roles'
        : selectedRoles.size === 1 ? [...selectedRoles][0]
        : selectedRoles.size + ' roles seleccionados';
}

// ============================================================
// FLUJO DE CAPTURA
// ============================================================
function generateInstructions() {
    if (selectedUserIds.length === 0) return;

    const stackNumber = (elements.stackKeyInput?.value || '').replace(/S/i, '') || '50';
    const sfmcUrl = `https://members.s${stackNumber}.exacttarget.com/Content/Administration/Users/UserListing.aspx`;
    const sfmcLink = $id('users-sfmc-link');
    if (sfmcLink) {
        sfmcLink.dataset.url = sfmcUrl;
        sfmcLink.onclick = (e) => { e.preventDefault(); window.electronAPI.openExternalLink(sfmcUrl); };
    }

    importedData   = [];
    onlyDiffsActive = false;
    isExpanded      = true;

    const jsonInput    = $id('users-json-input');
    const permContainer = $id('users-permissions-container');
    const importUi     = $id('users-import-ui');

    if (jsonInput)     jsonInput.value = '';
    if (permContainer) { permContainer.style.display = 'none'; permContainer.innerHTML = ''; }
    if (importUi)      importUi.style.display = 'block';

    setExpandControlsVisible(false);

    const script = `(async function() {
    const ids = [${selectedUserIds.join(',')}];
    console.log("⏳ Recolectando detalle de permisos...");
    async function fetchTree(userId) {
        const r = await fetch("/Content/Administration/Users/UserPermissions.aspx?id=" + userId + "&buid=0");
        const html = await r.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const data = {}; let currentPath = [];
        const rows = doc.querySelectorAll('tr[c]');
        rows.forEach(tr => {
            const nameDiv = tr.querySelector('.PermissionNameText');
            if (!nameDiv) return;
            const isFolder = tr.getAttribute('c') === '1';
            const pad = parseInt(nameDiv.closest('td').style.paddingLeft || 0);
            const level = Math.floor((pad - 5) / 15);
            const cleanName = nameDiv.textContent.replace(/[\\r\\n\\t]/g, "").trim();
            if (isFolder) { currentPath[level] = cleanName; currentPath = currentPath.slice(0, level + 1); }
            else {
                const isAllow = tr.querySelector('input[id^="a_"]')?.checked || false;
                const isDeny  = tr.querySelector('input[id^="d_"]')?.checked || false;
                const states  = Array.from(tr.querySelectorAll('.PermissionStateText')).map(d => d.innerText.trim()).filter(t => t !== "");
                const result  = tr.querySelector('.ResultText')?.innerText.trim() || "";
                const breadcrumb = currentPath.join(" > ");
                if (!data[breadcrumb]) data[breadcrumb] = {};
                data[breadcrumb][cleanName] = {
                    indiv: isAllow ? 'ALLOW' : (isDeny ? 'DENY' : '---'),
                    roles: states.join(", ") || '---',
                    res:   result.toUpperCase()
                };
            }
        });
        return { id: userId, tree: data };
    }
    const results = await Promise.all(ids.map(id => fetchTree(id)));
    const payload = "SFMC_DATA:" + btoa(unescape(encodeURIComponent(JSON.stringify(results))));
    const ui = document.createElement('div');
    ui.style = "position:fixed;top:10%;left:15%;width:70%;background:white;z-index:999999;padding:30px;border:5px solid #69a3db;box-shadow:0 0 100px rgba(0,0,0,0.8);font-family:Arial;";
    ui.innerHTML = "<h3>✓ Datos listos</h3><textarea id='pbox' style='width:100%;height:150px;'>"+payload+"</textarea><br><button onclick='this.parentElement.remove()' style='width:100%;padding:10px;cursor:pointer'>CERRAR</button>";
    document.body.appendChild(ui); document.getElementById('pbox').select();
})();`;

    const scriptEl = $id('users-script-to-copy');
    if (scriptEl) scriptEl.textContent = script;

    const detailBtn = $id('tab-perms-detail-btn');
    if (detailBtn) detailBtn.disabled = false;
    switchTab('tab-user-detail');
}

function copyScript() {
    const code = $id('users-script-to-copy')?.textContent || '';
    navigator.clipboard.writeText(code);
    ui.showCustomAlert('Código copiado al portapapeles. Pégalo en la consola de SFMC.');
}

function processImportedData(val) {
    if (!val.startsWith('SFMC_DATA:')) return;
    try {
        importedData = JSON.parse(decodeURIComponent(escape(atob(val.split('SFMC_DATA:')[1]))));
        renderImportedView();
    } catch (e) {
        ui.showCustomAlert('Error de formato al procesar los datos.');
    }
}

function renderImportedView() {
    const container = $id('users-permissions-container');
    const importUi  = $id('users-import-ui');
    if (!container) return;

    if (importUi) importUi.style.display = 'none';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = importedData.length === 1 ? '1fr' : '1fr 1fr';
    container.innerHTML = '';

    importedData.forEach(userData => {
        const uBase = usersMasterList.find(u => u.id === String(userData.id));
        const col = document.createElement('div');
        col.className = 'um-perm-column';

        let html = `<h3 class="um-perm-col-title">${uBase ? uBase.name : userData.id}</h3>`;

        Object.keys(userData.tree).sort().forEach(cat => {
            let catHasDiff = false, catHtml = '';
            Object.keys(userData.tree[cat]).sort().forEach(p => {
                const item = userData.tree[cat][p];
                let diffClass = '';
                if (importedData.length === 2) {
                    const other = importedData.find(u => u.id !== userData.id);
                    if (other && (!other.tree[cat] || !other.tree[cat][p] || other.tree[cat][p].res !== item.res)) {
                        diffClass = 'um-diff'; catHasDiff = true;
                    }
                }
                catHtml += `
                    <div class="um-perm-row ${diffClass}">
                        <div class="um-p-name"><b>${p}</b></div>
                        <div class="um-p-val"><span class="um-p-label">Individual</span><span class="${item.indiv==='ALLOW'?'um-allowed':(item.indiv==='DENY'?'um-denied':'um-neutral')}">${item.indiv}</span></div>
                        <div class="um-p-val"><span class="um-p-label">Roles</span><span>${item.roles}</span></div>
                        <div class="um-p-val"><span class="um-p-label">Resultado</span><span class="${item.res==='ALLOWED'?'um-allowed':'um-denied'}">${item.res}</span></div>
                    </div>`;
            });
            html += `
                <div class="um-perm-cat ${catHasDiff ? 'um-has-diff' : ''}">
                    <div class="um-cat-title" data-action="toggle-cat"><span>${cat}</span><span class="um-t-icon">[-]</span></div>
                    <div class="um-perm-list">${catHtml}</div>
                </div>`;
        });

        col.innerHTML = html;
        col.querySelectorAll('[data-action="toggle-cat"]').forEach(title => {
            title.addEventListener('click', () => {
                const list = title.nextElementSibling;
                const icon = title.querySelector('.um-t-icon');
                const hide = list.style.display !== 'none';
                list.style.display = hide ? 'none' : 'block';
                icon.textContent   = hide ? '[+]' : '[-]';
            });
        });
        container.appendChild(col);
    });

    setExpandControlsVisible(true);
}

// ============================================================
// CSV
// ============================================================
function downloadCSV() {
    let csv = ['Nombre','ID','UserName','API User','Ultimo Login','Estado','Roles'].join(',') + '\n';
    usersMasterList.forEach(u => {
        csv += [`"${u.name}"`,`"${u.id}"`,`"${u.userName}"`,`"${u.isApi?'Sí':'No'}"`,
                `"${formatDate(u.lastLogin)}"`,`"${u.isActive?'Activo':'Inactivo'}"`,
                `"${u.roles.map(r=>r.name).join('|')}"`].join(',') + '\n';
    });
    const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {href:url, download:'Informe_Usuarios_SFMC.csv', style:'visibility:hidden'});
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ============================================================
// HELPERS
// ============================================================
function updateButtons() {
    const btn = $id('prepareCapturBtn');
    if (btn) btn.disabled = selectedUserIds.length === 0;
}

function setExpandControlsVisible(show) {
    const el = $id('users-expand-controls');
    if (el) el.style.display = show ? 'flex' : 'none';
    if (!show) {
        const td = $id('btn-toggle-diffs');
        const ep = $id('btn-expand-perms');
        if (td) { td.classList.remove('um-active-filter'); td.textContent = 'Solo Diferencias'; }
        if (ep) ep.textContent = 'Colapsar Todo';
    }
}

function updateSortIndicators() {
    $$('#users-table .um-sortable').forEach(th => {
        th.classList.remove('um-sort-asc', 'um-sort-desc');
        if (th.dataset.sortBy === currentSortColumn)
            th.classList.add(currentSortDirection === 'asc' ? 'um-sort-asc' : 'um-sort-desc');
    });
}

function formatDate(ds) {
    if (!ds || ds.startsWith('0001')) return '---';
    const d = new Date(ds);
    if (isNaN(d.getTime())) return '---';
    const p = n => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toggleDiffFilter() {
    onlyDiffsActive = !onlyDiffsActive;
    $id('users-permissions-container')?.classList.toggle('um-only-diffs', onlyDiffsActive);
    const btn = $id('btn-toggle-diffs');
    if (btn) { btn.classList.toggle('um-active-filter', onlyDiffsActive); btn.textContent = onlyDiffsActive ? 'Mostrar Todo' : 'Solo Diferencias'; }
}

function toggleExpandCollapse() {
    isExpanded = !isExpanded;
    $$('#users-permissions-container .um-perm-list').forEach(l => l.style.display = isExpanded ? 'block' : 'none');
    $$('#users-permissions-container .um-t-icon').forEach(i => i.textContent = isExpanded ? '[-]' : '[+]');
    const btn = $id('btn-expand-perms');
    if (btn) btn.textContent = isExpanded ? 'Colapsar Todo' : 'Expandir Todo';
}