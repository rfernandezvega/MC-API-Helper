// Fichero: src/renderer/components/audit-manager.js
// Descripción: Módulo de auditoría técnica de la instancia de Marketing Cloud.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { generateAuditPDF } from './audit-pdf-generator.js';

let getAuthenticatedConfig;

let auditDrillData      = {};
let currentDrillKey     = null;
let currentAuditApiCalls = 0;
let currentStats        = null;
let globalPdfData       = {};
let usersById           = {}; // id/userName -> user — rellenado en auditUsers, usado en auditAutomations

const ACTIVITY_TYPE_MAP = {
    42:   'Email',                   43:   'Importación (Import)',
    45:   'Group',                   53:   'File Transfer',
    73:   'Data Extract / Exportación', 84: 'Report',
    300:  'SQL Query',               303:  'Filter',
    423:  'Script (SSJS)',           425:  'ELT (Data Transform)',
    427:  'Build Audience',          467:  'Wait',
    724:  'Mobile List Refresh',     725:  'MobileConnect',
    726:  'Mobile Import',           733:  'Interaction Studio',
    736:  'Mobile Push',             749:  'IS Event',
    756:  'IS Date Event',           771:  'SF Send',
    783:  'GroupConnect',            952:  'Journey Entry (Audience)',
    1000: 'Verification',            1010: 'Thunderhead',
    1101: 'IS Decision',             1701: 'Einstein Rec',
};

const TAB_IDS = ['users', 'autos', 'journeys', 'cp', 'sm', 'de'];

// ==========================================
// INIT + VIEW
// ==========================================

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    document.getElementById('runAuditBtn')
        ?.addEventListener('click', handleRunAuditClick);

    document.getElementById('downloadAuditPdfBtn')
        ?.addEventListener('click', () => generateAuditPDF(globalPdfData, currentStats, elements.clientNameInput?.value?.trim()));

    document.getElementById('downloadAuditDetailsBtn')
        ?.addEventListener('click', downloadAllDetailsCsv);

    document.getElementById('auditoria-section')
        ?.addEventListener('click', e => {
            const t = e.target.closest('[data-drill]');
            if (t) showDrillDownModal(t.getAttribute('data-drill'));
        });

    document.getElementById('audit-drill-download')
        ?.addEventListener('click', downloadDrillCsv);

    document.getElementById('audit-de-cb-link')?.addEventListener('click', ui.handleExternalLink);

    // Modal: lógica simple — el modal está dentro de #auditoria-section
    // y su CSS position:fixed funciona correctamente en este contexto.
    const modal   = document.getElementById('audit-drill-modal');
    const closeBtn = document.getElementById('audit-drill-close');
    if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    if (modal)    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

    // NOTA: view() ya NO se registra aquí con IntersectionObserver ni con el evento change
    // de clientNameInput, porque org-manager.js llama a view() directamente cuando cambia
    // de cliente (igual que hace con calendar.clearData()). Esto garantiza que se cargue
    // la caché correcta tanto al entrar a la vista como al cambiar de cliente.

    

    document.getElementById('audit-de-copy-script')?.addEventListener('click', () => {
        const pre = document.getElementById('audit-de-script-pre');
        const txt = pre?._scriptContent || pre?.textContent || '';
        navigator.clipboard.writeText(txt).then(() => {
            const btn = document.getElementById('audit-de-copy-script');
            const orig = btn.textContent;
            btn.textContent = 'Copiado';
            btn.style.background = '#16a085';
            setTimeout(() => { btn.textContent = orig; btn.style.background = '#3b82f6'; }, 2000);
        });
    });

    elements.stackKeyInput?.addEventListener('change', updateDeScript);
    elements.stackKeyInput?.addEventListener('input',  updateDeScript);
    setTimeout(updateDeScript, 200);
}

// Renderizar el script copiable con el stack dinámico del cliente
 function updateDeScript() {
    const stackKey = elements.stackKeyInput?.value?.trim();
    const link = document.getElementById('audit-de-cb-link');
    const pre = document.getElementById('audit-de-script-pre');

    if (!link || !pre) return;

    // Variables para dinamizar el script
    let finalStack = 's50'; // Valor por defecto
    let mcBaseUrl = 'https://mc.s50.marketingcloudapps.com';

    // Si el stack no es válido
    if (!stackKey || stackKey === 'No disponible' || stackKey === '') {
        link.href = "#";
        link.style.color = "#888"; 
        link.style.opacity = "0.6";
    } else {
        const stackNum = stackKey.toLowerCase().replace('s', '');
        finalStack = 's' + stackNum;
        mcBaseUrl = `https://mc.${finalStack}.marketingcloudapps.com`;
        
        link.href = `${mcBaseUrl}/contactsmeta/fuelapi/data-internal/v1/customobjects/category/`;
        link.style.color = "#0070d2"; 
        link.style.opacity = "1";
    }

    // El script que se copia a la consola
    const script = `(async () => {
    console.log("🚀 Iniciando extracción de Data Extensions en ${finalStack}...");
    const baseUrl = "${mcBaseUrl}";
    const allDEs = [];

    async function fetchApi(url) {
        try { 
            const r = await fetch(url); 
            if (!r.ok) throw new Error('HTTP ' + r.status); 
            return await r.json(); 
        } catch (err) { 
            console.error('❌ Error en', url, err); 
            return null; 
        }
    }

    async function processFolder(folderId, folderName) {
        console.log('📂 Procesando:', folderName);
        let page = 1, pageSize = 200, hasMore = true;
        while (hasMore) {
            const deUrl = \`\${baseUrl}/contactsmeta/fuelapi/data-internal/v1/customobjects/category/\${folderId}?retrievalType=1&$page=\${page}&$pagesize=\${pageSize}&$orderBy=modifiedDate%20DESC\`;
            const data = await fetchApi(deUrl);
            if (data && data.items && data.items.length > 0) {
                data.items.forEach(item => {
                    allDEs.push({ 
                        name: item.name, 
                        key: item.key, 
                        description: item.description, 
                        categoryId: item.categoryId, 
                        folderPath: folderName, 
                        isSendable: item.isSendable, 
                        isTestable: item.isTestable, 
                        createdByName: item.createdByName, 
                        createdDate: item.createdDate, 
                        modifiedByName: item.modifiedByName, 
                        modifiedDate: item.modifiedDate, 
                        dataRetentionProperties: item.dataRetentionProperties, 
                        fieldCount: item.fieldCount, 
                        rowCount: item.rowCount 
                    });
                });
                if (data.items.length < pageSize) hasMore = false; else page++;
            } else hasMore = false;
        }
        const childrenUrl = \`\${baseUrl}/contactsmeta/fuelapi/legacy/v1/beta/folder/\${folderId}/children?Localization=true&$top=1000&$skip=0\`;
        const children = await fetchApi(childrenUrl);
        if (children && children.entry) {
            for (const child of children.entry) {
                await processFolder(child.id, \`\${folderName} > \${child.name}\`);
            }
        }
    }

    const rootUrl = \`\${baseUrl}/contactsmeta/fuelapi/legacy/v1/beta/folder?$where=allowedtypes%20in%20(%27synchronizeddataextension%27,%20%27dataextension%27,%20%27shared_data%27,%20%27salesforcedataextension%27,%20%27recyclebin%27)&Localization=true\`;
    const root = await fetchApi(rootUrl);
    
    if (root && root.entry) {
        const deRoot = root.entry.find(f => f.type === 'dataextension');
        if (deRoot) {
            await processFolder(deRoot.id, deRoot.name);
            const json = JSON.stringify(allDEs, null, 2);
            
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:10%;left:20%;width:60%;height:70%;background:#fff;border:2px solid #0070d2;border-radius:8px;z-index:999999;padding:20px;box-shadow:0 0 20px rgba(0,0,0,.5);display:flex;flex-direction:column;font-family:sans-serif;';
            modal.innerHTML = \`
                <h2 style="margin-top:0;color:#0070d2;">Extracción finalizada — \${allDEs.length} DEs</h2>
                <textarea style="flex-grow:1;font-family:monospace;font-size:11px;padding:8px;border:1px solid #ccc;margin-bottom:12px;" id="de-out">\${json}</textarea>
                <div style="display:flex;gap:10px;">
                    <button onclick="navigator.clipboard.writeText(document.getElementById('de-out').value);this.textContent='✅ Copiado';setTimeout(()=>this.textContent='Copiar al portapapeles',2000);" style="background:#0070d2;color:#fff;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;font-weight:bold;">Copiar al portapapeles</button>
                    <button onclick="this.closest('div').parentElement.remove();" style="background:#f4f6f9;border:1px solid #ccc;padding:10px 20px;border-radius:4px;cursor:pointer;">Cerrar</button>
                </div>\`;
            document.body.appendChild(modal);
        }
    }
})();`;

    pre.textContent = script;
    pre._scriptContent = script;
}

async function handleRunAuditClick() {
    const optionsPanel = document.getElementById('audit-options');
    const dashboard    = document.getElementById('audit-dashboard');
    if (optionsPanel.style.display === 'none') {
        document.getElementById('audit-stats-container').innerHTML = '';
        document.getElementById('downloadAuditPdfBtn').style.display  = 'none';
        document.getElementById('downloadAuditDetailsBtn').style.display = 'none';
        dashboard.style.display    = 'none';
        optionsPanel.style.display = '';
        const btn = document.getElementById('runAuditBtn');
        if (btn) btn.innerHTML = 'Iniciar Escaneo de Instancia';
    } else {
        // El usuario pulsa "Iniciar Escaneo" explícitamente → siempre lanza un nuevo escaneo,
        // aunque haya caché. La caché solo se carga automáticamente al entrar en la vista.
        await runAudit();
    }
}

export async function view() {
    const clientName = elements.clientNameInput?.value?.trim();

    // Siempre resetear la UI antes de cargar, para no mostrar datos de otro cliente
    document.getElementById('audit-options').style.display          = '';
    document.getElementById('audit-dashboard').style.display        = 'none';
    document.getElementById('downloadAuditPdfBtn').style.display    = 'none';
    document.getElementById('downloadAuditDetailsBtn').style.display = 'none';
    document.getElementById('audit-stats-container').innerHTML      = '';
    initDrillData(); // limpiar datos del cliente anterior
    const topBtn = document.getElementById('runAuditBtn');
    if (topBtn) topBtn.innerHTML = 'Iniciar Escaneo de Instancia';

    if (!clientName) return;

    try {
        const result = await window.electronAPI.loadAuditCache(clientName);

        // Guard de race condition: si el cliente cambió mientras esperábamos la respuesta IPC,
        // descartamos el resultado para no pintar datos del cliente equivocado
        if (elements.clientNameInput?.value?.trim() !== clientName) return;

        if (result?.success && result.data) {
            renderCachedAudit(result.data);
        }
        // result.data === null → sin caché → se queda en panel de opciones
    } catch (e) {
        console.error('[AuditManager] Error al cargar la caché:', e);
    } finally {
        setTimeout(updateDeScript, 100); 
    }
}

function renderCachedAudit(cached) {
    auditDrillData = cached.drillData || {};
    currentStats   = cached.stats    || null;
    globalPdfData  = cached.pdfData  || {};

    const dashboard = document.getElementById('audit-dashboard');
    document.getElementById('audit-options').style.display = 'none';
    dashboard.style.display       = 'flex';
    dashboard.style.flexDirection = 'column';
    document.getElementById('downloadAuditPdfBtn').style.display    = 'block';
    document.getElementById('downloadAuditDetailsBtn').style.display = 'block';
    const topBtn = document.getElementById('runAuditBtn');
    if (topBtn) topBtn.textContent = 'Volver a Opciones';

    TAB_IDS.forEach(id => {
        const el = document.getElementById(`audit-tab-${id}`);
        if (el && cached.tabs?.[id]) el.innerHTML = cached.tabs[id];
    });

    // Restaurar el JSON de DEs si se guardó
    if (cached.deJson) {
        const deArea = document.getElementById('audit-de-json');
        if (deArea) deArea.value = cached.deJson;
    }

    // Banner de estadísticas + aviso de caché (compacto para caber en la fila de pestañas)
    const savedDate = cached.savedAt ? new Date(cached.savedAt).toLocaleString('es-ES') : '';
    const statsHtml = cached.stats
        ? `<span style="font-size:0.78em; color:#64748b;">Tiempo: <b>${cached.stats.timeStr}</b> &nbsp;·&nbsp; Llamadas API: <b>${cached.stats.calls}</b></span>`
        : '';
    const cacheHtml = `<span style="font-size:0.75em; color:#94a3b8; font-style:italic;">Datos del ${savedDate}</span>`;
    document.getElementById('audit-stats-container').innerHTML =
        `<div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; line-height:1.3;">${statsHtml}${cacheHtml}</div>`;
}

// ==========================================
// DRILL-DOWN
// ==========================================

function initDrillData() { auditDrillData = {}; globalPdfData = {}; usersById = {}; }

function registerDrill(key, title, columns) {
    if (!auditDrillData[key]) auditDrillData[key] = { title, columns, rows: [] };
}

function addDrillRow(key, rowArray) {
    if (auditDrillData[key]) auditDrillData[key].rows.push(rowArray);
}

function registerPdfData(sectionId, kpis, cards, callouts = []) {
    globalPdfData[sectionId] = { kpis, cards, callouts };
}

function showDrillDownModal(key) {
    const data = auditDrillData[key];
    if (!data || data.rows.length === 0) {
        ui.showCustomAlert('No hay registros detallados para esta métrica.');
        return;
    }

    currentDrillKey = key;
    document.getElementById('audit-drill-title').textContent = `${data.title} (${data.rows.length})`;

    const thead = document.getElementById('audit-drill-thead');
    thead.innerHTML = `<tr>${data.columns.map(c => `<th>${c}</th>`).join('')}</tr>`;

    const tbody = document.getElementById('audit-drill-tbody');
    tbody.innerHTML = data.rows.map(row =>
        `<tr>${row.map(cell => `<td>${cell !== undefined && cell !== null ? cell : '---'}</td>`).join('')}</tr>`
    ).join('');

    const modal = document.getElementById('audit-drill-modal');
    modal.style.display = 'flex';
}

function convertDrillToCsvString(data) {
    const BOM = '\uFEFF';
    let csv = data.columns.map(c => `"${c}"`).join(',') + '\n';
    data.rows.forEach(row => {
        csv += row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',') + '\n';
    });
    return BOM + csv;
}

function downloadDrillCsv() {
    if (!currentDrillKey || !auditDrillData[currentDrillKey]) return;
    const data = auditDrillData[currentDrillKey];
    const blob = new Blob([convertDrillToCsvString(data)], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `Auditoria_${currentDrillKey}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function downloadAllDetailsCsv() {
    if (!auditDrillData || Object.keys(auditDrillData).length === 0) {
        ui.showCustomAlert('No hay datos de auditoría generados.'); return;
    }
    const folderPath = await window.electronAPI.selectFolder();
    if (!folderPath) return;

    ui.blockUI('Generando y guardando archivos CSV...');
    try {
        // Excluir claves demasiado granulares del export masivo
        const skipPrefixes = ['sm_from_', 'auto_email_', 'auto_noDesc_user_', 'auto_exec_year_', 'auto_status_', 'de_no_desc_', 'de_folder_'];
        const filesToSave = [];
        for (const [key, data] of Object.entries(auditDrillData)) {
            if (data.rows.length === 0) continue;
            if (skipPrefixes.some(p => key.startsWith(p))) continue;
            filesToSave.push({ filename: `Auditoria_${key}.csv`, content: convertDrillToCsvString(data) });
        }
        const result = await window.electronAPI.saveMultipleCsvs({ folderPath, files: filesToSave });
        if (result.success) ui.showCustomAlert(`Se han guardado ${filesToSave.length} archivos CSV en la carpeta seleccionada.`);
        else ui.showCustomAlert(`Error al guardar archivos: ${result.error}`);
    } catch (error) {
        ui.showCustomAlert(`Error inesperado: ${error.message}`);
    } finally {
        ui.unblockUI();
    }
}

function formatDate(ds) {
    if (!ds || ds.startsWith('0001')) return '---';
    const d = new Date(ds);
    if (isNaN(d.getTime())) return '---';
    const p = n => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Resuelve un owner a nombre legible.
 *  La API de automatismos devuelve createdBy/modifiedBy como objetos {id, name, email}.
 */
function getUserLabel(owner) {
    if (!owner) return 'Sin propietario';

    // Caso: objeto {id, name, email} devuelto por la API de automatismos
    if (typeof owner === 'object') {
        const name  = owner.name  || '';
        const email = owner.email || '';
        if (name && email) return `${name} (${email})`;
        if (name)          return name;
        if (email)         return email;
        if (owner.id)      return `ID: ${owner.id}`;
        return 'Sin propietario';
    }

    // Caso: ID primitivo (string o número)
    const str = String(owner).trim();
    if (!str) return 'Sin propietario';
    const u = usersById[str];
    if (u) return `${u.name} (${u.userName})`;
    if (isNaN(Number(str))) return str;   // texto legible
    return `ID: ${str}`;
}

// ==========================================
// ESCANEO PRINCIPAL
// ==========================================

async function runAudit() {
    const isDetailedAutos    = document.getElementById('audit-opt-autos').checked;
    const isDetailedJourneys = document.getElementById('audit-opt-journeys').checked;

    if (!await ui.showCustomConfirm('El escaneo va a comenzar. No cierres la aplicación durante el proceso.')) return;

    document.getElementById('audit-stats-container').innerHTML      = '';
    document.getElementById('downloadAuditPdfBtn').style.display    = 'none';
    document.getElementById('downloadAuditDetailsBtn').style.display = 'none';
    document.getElementById('audit-options').style.display          = 'none';
    const topBtn = document.getElementById('runAuditBtn');
    if (topBtn) topBtn.innerHTML = 'Volver a Opciones';

    const dashboard = document.getElementById('audit-dashboard');
    dashboard.style.display       = 'flex';
    dashboard.style.flexDirection = 'column';
    TAB_IDS.forEach(id => {
        document.getElementById(`audit-tab-${id}`).innerHTML = buildLoadingPlaceholder();
    });

    initDrillData();
    currentAuditApiCalls = 0;
    const startTime = Date.now();
    logger.startLogBuffering();
    mcApiService.setLogger(logger);
    const renderedTabs = {};

    try {
        const apiConfig = await getAuthenticatedConfig();

        ui.blockUI('1/6: Escaneando Usuarios…');
        await auditUsers(apiConfig);
        renderedTabs.users = document.getElementById('audit-tab-users').innerHTML;

        ui.blockUI('2/6: Escaneando Automatismos…');
        await auditAutomations(apiConfig, isDetailedAutos);
        renderedTabs.autos = document.getElementById('audit-tab-autos').innerHTML;

        ui.blockUI('3/6: Escaneando Journeys…');
        await auditJourneys(apiConfig, isDetailedJourneys);
        renderedTabs.journeys = document.getElementById('audit-tab-journeys').innerHTML;

        ui.blockUI('4/6: Escaneando Cloud Pages…');
        await auditCloudPages(apiConfig);
        renderedTabs.cp = document.getElementById('audit-tab-cp').innerHTML;

        ui.blockUI('5/6: Escaneando Send Management…');
        await auditSendManagement(apiConfig);
        renderedTabs.sm = document.getElementById('audit-tab-sm').innerHTML;

        const deJson = document.getElementById('audit-de-json')?.value?.trim();
        ui.blockUI('6/6: Analizando Data Extensions…');
        await auditDataExtensions(deJson);
        renderedTabs.de = document.getElementById('audit-tab-de').innerHTML;

        const durationMs = Date.now() - startTime;
        const min = Math.floor(durationMs / 60000);
        const sec = Math.floor((durationMs % 60000) / 1000);
        const timeStr = min > 0 ? `${min} m ${sec} s` : `${sec} s`;
        currentStats = { timeStr, calls: currentAuditApiCalls };

        document.getElementById('audit-stats-container').innerHTML =
            `<div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; line-height:1.3;">
                <span style="font-size:0.78em; color:#64748b;">Tiempo: <b>${timeStr}</b> &nbsp;·&nbsp; Llamadas API: <b>${currentAuditApiCalls}</b></span>
            </div>`;
        document.getElementById('downloadAuditPdfBtn').style.display    = 'block';
        document.getElementById('downloadAuditDetailsBtn').style.display = 'block';

        const clientName = elements.clientNameInput?.value?.trim();
        if (clientName) {
            await window.electronAPI.saveAuditCache({
                clientName,
                auditData: {
                    savedAt:   new Date().toISOString(),
                    options:   { autos: isDetailedAutos, journeys: isDetailedJourneys },
                    deJson:    document.getElementById('audit-de-json')?.value?.trim() || '',
                    tabs:      renderedTabs,
                    drillData: auditDrillData,
                    pdfData:   globalPdfData,
                    stats:     currentStats,
                }
            });
        }

        ui.showCustomAlert('Auditoría finalizada. Haz clic en cualquier métrica para ver su detalle o descarga los informes.');
    } catch (error) {
        console.error(error);
        ui.showCustomAlert(`Error crítico: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

// ==========================================
// 1. USUARIOS
// ==========================================
async function auditUsers(apiConfig) {
    currentAuditApiCalls++;
    const users = await mcApiService.fetchAllUsers(apiConfig);
    const total = users.length;
    const currentYear = new Date().getFullYear();
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());

    // Construir mapa para cruce en secciones posteriores
    users.forEach(u => {
        usersById[String(u.id)] = u;
        if (u.userName) usersById[u.userName] = u;
    });

    let noRolesCount = 0;
    let activeCount = 0, inactiveCount = 0, apiCheckCount = 0;
    let inactiveOver3Months = 0, activeUsersForLogin = 0;
    const loginByYear = {};
    for (let y = currentYear; y >= currentYear - 3; y--) {
        loginByYear[String(y)] = 0;
        registerDrill(`users_login_${y}`, `Login en el año ${y}`,
            ['Nombre', 'Usuario', 'Email', 'Último Login']);
    }
    loginByYear['Más antiguos'] = 0;
    const roles = {};

    registerDrill('users_total',       'Total Usuarios',                    ['Nombre', 'Usuario', 'Email', 'Estado', 'API User', 'Último Login', 'Fecha Creación', 'Roles']);
    registerDrill('users_active',      'Usuarios Activos',                  ['Nombre', 'Usuario', 'Email', 'Último Login', 'Roles']);
    registerDrill('users_inactive',    'Usuarios Inactivos',                ['Nombre', 'Usuario', 'Email', 'Último Login', 'Fecha Creación']);
    registerDrill('users_api',         'Con check API User',                ['Nombre', 'Usuario', 'Email', 'Estado']);
    registerDrill('users_api_no',      'Sin check API User',                ['Nombre', 'Usuario', 'Email', 'Estado']);
    registerDrill('users_inactive_3m', 'Sin actividad reciente (>3 meses)', ['Nombre', 'Usuario', 'Email', 'Último Login']);
    registerDrill('users_login_old',   'Login en años anteriores',          ['Nombre', 'Usuario', 'Email', 'Último Login']);
    registerDrill('users_no_roles', 'Usuarios sin roles asignados', ['Nombre', 'Usuario', 'Email', 'Estado', 'API User']);


    users.forEach(u => {
        const uLogin   = formatDate(u.lastLogin);
        const uCreated = formatDate(u.createdDate);
        const uRoles   = (u.roles || []).map(r => r.name).join(' | ');
        const uState   = u.isActive ? 'Activo' : 'Inactivo';
        const uApi     = u.isApi ? 'Sí' : 'No';

        addDrillRow('users_total', [u.name, u.userName, u.email, uState, uApi, uLogin, uCreated, uRoles]);

        if (u.isActive) {
            activeCount++; activeUsersForLogin++;
            addDrillRow('users_active', [u.name, u.userName, u.email, uLogin, uRoles]);

            if (!u.lastLogin || u.lastLogin.startsWith('0001')) {
                inactiveOver3Months++;
                addDrillRow('users_inactive_3m', [u.name, u.userName, u.email, 'Nunca / Sin registro']);
            } else {
                const loginDate = new Date(u.lastLogin);
                if (loginDate < threeMonthsAgo) {
                    inactiveOver3Months++;
                    addDrillRow('users_inactive_3m', [u.name, u.userName, u.email, uLogin]);
                }
                const yearKey = String(loginDate.getFullYear());
                if (loginByYear.hasOwnProperty(yearKey)) {
                    loginByYear[yearKey]++;
                    addDrillRow(`users_login_${yearKey}`, [u.name, u.userName, u.email, uLogin]);
                } else {
                    loginByYear['Más antiguos']++;
                    addDrillRow('users_login_old', [u.name, u.userName, u.email, uLogin]);
                }
            }
        } else {
            inactiveCount++;
            addDrillRow('users_inactive', [u.name, u.userName, u.email, uLogin, uCreated]);
        }

        if (u.isApi) { apiCheckCount++; addDrillRow('users_api', [u.name, u.userName, u.email, uState]); }
        else          addDrillRow('users_api_no', [u.name, u.userName, u.email, uState]);

        (u.roles || []).forEach(r => {
            roles[r.name] = (roles[r.name] || 0) + 1;
            const dKey = `users_role_${r.name.replace(/[^a-z0-9]/gi, '')}`;
            registerDrill(dKey, `Usuarios con rol: ${r.name}`, ['Nombre', 'Usuario', 'Email', 'Estado']);
            addDrillRow(dKey, [u.name, u.userName, u.email, uState]);
        });
        if ((u.roles || []).length === 0) {
            noRolesCount++;
            addDrillRow('users_no_roles', [u.name, u.userName, u.email, uState, uApi]);
        }
    });

    const inactiveOver3Pct = activeUsersForLogin > 0
        ? Math.round((inactiveOver3Months / activeUsersForLogin) * 100) : 0;
    const inactivePct = total > 0 ? Math.round((inactiveCount / total) * 100) : 0;

    const callouts = [];
    if (inactiveOver3Pct > 20) callouts.push(buildCallout('danger', 'Cuentas activas sin actividad reciente',
        `El ${inactiveOver3Pct}% de los usuarios activos llevan más de 3 meses sin conectarse. Valorar deshabilitar esas cuentas para reducir la superficie de acceso.`));
    if (inactivePct > 40) callouts.push(buildCallout('warning', 'Alta proporción de cuentas inactivas',
        `El ${inactivePct}% de las cuentas están deshabilitadas. Puede indicar limpieza de instancia pendiente.`));
    if (noRolesCount > 0) callouts.push(buildCallout('info', 'Usuarios sin roles asignados',
        `${noRolesCount} usuario${noRolesCount > 1 ? 's' : ''} no tienen ningún rol asignado. Revisar si son cuentas activas que necesitan configuración.`));

    const loginBars = Object.keys(loginByYear)
        .sort((a, b) => { if (a === 'Más antiguos') return 1; if (b === 'Más antiguos') return -1; return parseInt(b) - parseInt(a); })
        .map(label => {
            const value = loginByYear[label];
            const color = label === String(currentYear)   ? '#27ae60'
                : label === String(currentYear - 1)       ? '#2980b9'
                : label === String(currentYear - 2)       ? '#f39c12'
                : label === String(currentYear - 3)       ? '#e67e22'
                : '#e74c3c';
            const dKey = label === 'Más antiguos' ? 'users_login_old' : `users_login_${label}`;
            return { label: `Login en ${label === 'Más antiguos' ? 'años anteriores' : label}`, value, total: activeUsersForLogin, color, drillKey: dKey };
        });

    const kpis = [
        { value: total,               label: 'Total Usuarios',       color: '#69a3db', drillKey: 'users_total' },
        { value: activeCount,         label: 'Activos',              color: '#27ae60', drillKey: 'users_active' },
        { value: inactiveCount,       label: 'Inactivos',            color: '#bdc3c7', drillKey: 'users_inactive' },
        { value: apiCheckCount,       label: 'Con check "API User"', color: '#9b59b6', drillKey: 'users_api' },
        { value: inactiveOver3Months, label: 'Sin login >3 meses',   color: inactiveOver3Pct > 20 ? '#e74c3c' : '#f39c12', drillKey: 'users_inactive_3m' },
        { value: noRolesCount, label: 'Sin roles asignados', color: noRolesCount > 0 ? '#e67e22' : '#bdc3c7', drillKey: 'users_no_roles' },
    ];

    const cards = [
        { title: 'Estado de cuentas', help: 'Usuarios activos e inactivos.', bars: [
            { label: 'Activos',   value: activeCount,   total, color: '#27ae60', drillKey: 'users_active' },
            { label: 'Inactivos', value: inactiveCount, total, color: '#bdc3c7', drillKey: 'users_inactive' },
        ]},
        { title: 'Check "API User"', help: 'Usuarios con el check API habilitado en su perfil.', bars: [
            { label: 'Con check API', value: apiCheckCount,         total, color: '#9b59b6', drillKey: 'users_api' },
            { label: 'Sin check API', value: total - apiCheckCount, total, color: '#3498db', drillKey: 'users_api_no' },
        ]},
        { title: 'Usuarios sin roles', help: 'Usuarios que no tienen ningún rol asignado. Pueden ser cuentas huérfanas o pendientes de configurar.', bars: [
            { label: 'Con roles',    value: total - noRolesCount, total, color: '#27ae60' },
            { label: 'Sin roles',    value: noRolesCount,         total, color: '#e67e22', drillKey: 'users_no_roles' },
        ]},
        { title: 'Actividad de login (usuarios activos)', help: `Base: ${activeUsersForLogin} activos. Último login registrado para detectar cuentas realmente en uso.`, bars: loginBars },
        { title: 'Top roles asignados', help: 'Roles más frecuentes para evaluar la distribución de permisos.', bars:
            Object.entries(roles).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({
                label, value, total, drillKey: `users_role_${label.replace(/[^a-z0-9]/gi, '')}`,
            }))
        },
    ];

    registerPdfData('users', kpis, cards, callouts.map(c => parsePdfCallout(c)));
    document.getElementById('audit-tab-users').innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + callouts.join('') + buildGrid(cards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })))
    );
}

// ==========================================
// 2. AUTOMATISMOS
// ==========================================
async function auditAutomations(apiConfig, isDetailed) {
    currentAuditApiCalls++;
    let autos = await mcApiService.fetchAllAutomations(apiConfig);
    const rawTotalAutos = autos.length;

    let mid = elements.businessUnitInput?.value?.trim();
    if (!mid) {
        try {
            const clientName = elements.clientNameInput?.value?.trim();
            const configs = await window.electronAPI.loadGlobalConfigs();
            if (clientName && configs?.[clientName]) mid = configs[clientName].businessUnit;
        } catch (e) {}
    }
    if (mid) autos = autos.filter(a => !a.name.startsWith(mid));

    const ignoredSystemAutos = rawTotalAutos - autos.length;
    const totalAutos  = autos.length;
    const currentYear = new Date().getFullYear();

    const status = {};
    const execByYear = {};
    for (let y = currentYear; y >= currentYear - 3; y--) {
        execByYear[String(y)] = 0;
        registerDrill(`auto_exec_year_${y}`, `Ejecutados en el año ${y}`,
            ['Nombre', 'Estado', 'Tipo Ejecución', 'Última Ejecución', 'Descripción', 'Propietario']);
    }
    execByYear['Más antiguos'] = 0; execByYear['Sin historial'] = 0;
    registerDrill('auto_exec_year_old', 'Ejecutados en años anteriores',
        ['Nombre', 'Estado', 'Tipo Ejecución', 'Última Ejecución']);

    const autoDescriptions = { 'Con descripción': 0, 'Sin descripción': 0 };
    let testNameCount = 0;
    const activityTypeCounts = {};
    let journeyLaunchingCount = 0, importCountAll = 0, exportCountAll = 0;
    const execTypeCounts = {
        'Programado (Schedule)': 0, 'Por evento (Fire Trigger)': 0,
        'FileDrop': 0,             'Manual / Sin clasificar': 0,
    };
    const actTypeDrill     = {};
    const autoNoDescByUser = {}; // { ownerLabel: [{ name, status, execType }] }

    registerDrill('auto_total',          'Total Automatismos',             ['Nombre', 'Estado', 'Tipo Ejecución', 'Última Ejecución', 'Creado', 'Descripción', 'Propietario']);
    registerDrill('auto_active',         'Activos / Programados',          ['Nombre', 'Estado', 'Tipo Ejecución', 'Última Ejecución']);
    registerDrill('auto_stale',          'Sin Historial de Ejecución',     ['Nombre', 'Estado', 'Tipo Ejecución', 'Creado', 'Descripción', 'Propietario']);
    registerDrill('auto_launch_journey', 'Lanzan Journeys',                ['Nombre', 'Estado', 'Última Ejecución', 'Propietario']);
    registerDrill('auto_import',         'Con Importaciones',              ['Nombre', 'Cant. Imports', 'Estado', 'Propietario']);
    registerDrill('auto_export',         'Con Exportaciones',              ['Nombre', 'Cant. Exports', 'Estado', 'Propietario']);
    registerDrill('auto_desc_yes',       'Con Descripción',                ['Nombre', 'Estado', 'Descripción']);
    registerDrill('auto_desc_no',        'Sin Descripción',                ['Nombre', 'Estado', 'Tipo Ejecución', 'Propietario']);
    registerDrill('auto_test_name', 'Automatismos con nombre de prueba/test', ['Nombre', 'Estado', 'Tipo Ejecución', 'Propietario']);

    autos.forEach(a => {
        const ownerLabel  = getUserLabel(a.createdBy || a.modifiedBy || a.ownerId);
        const execTypeId  = a.scheduleTypeId ?? a.schedule?.typeId ?? null;
        let execType = 'Manual / Sin clasificar';
        if      (execTypeId === 1 || (!execTypeId && a.scheduledTime)) execType = 'Programado (Schedule)';
        else if (execTypeId === 3 || a.fileTrigger)                    execType = 'FileDrop';
        else if (execTypeId === 2 || a.isTriggered)                    execType = 'Por evento (Fire Trigger)';

        const lastRun = formatDate(a.lastRunTime);
        const created = formatDate(a.createdDate);
        const desc    = a.description?.trim() || '';

        status[a.status] = (status[a.status] || 0) + 1;
        const dKeyStatus = `auto_status_${a.status}`;
        registerDrill(dKeyStatus, `Estado: ${a.status}`, ['Nombre', 'Tipo Ejecución', 'Última Ejecución', 'Propietario']);
        addDrillRow(dKeyStatus, [a.name, execType, lastRun, ownerLabel]);
        addDrillRow('auto_total', [a.name, a.status, execType, lastRun, created, desc || '---', ownerLabel]);

        if (!a.lastRunTime || a.lastRunTime.startsWith('0001')) {
            execByYear['Sin historial']++;
            addDrillRow('auto_stale', [a.name, a.status, execType, created, desc || '---', ownerLabel]);
        } else {
            const yearKey = String(new Date(a.lastRunTime).getFullYear());
            if (execByYear.hasOwnProperty(yearKey)) {
                execByYear[yearKey]++;
                addDrillRow(`auto_exec_year_${yearKey}`, [a.name, a.status, execType, lastRun, desc || '---', ownerLabel]);
            } else {
                execByYear['Más antiguos']++;
                addDrillRow('auto_exec_year_old', [a.name, a.status, execType, lastRun]);
            }
        }

        if (['Scheduled', 'Ready', 'Running'].includes(a.status))
            addDrillRow('auto_active', [a.name, a.status, execType, lastRun]);

        if (desc) { autoDescriptions['Con descripción']++; addDrillRow('auto_desc_yes', [a.name, a.status, desc]); }
        else {
            autoDescriptions['Sin descripción']++;
            addDrillRow('auto_desc_no', [a.name, a.status, execType, ownerLabel]);
            if (!autoNoDescByUser[ownerLabel]) autoNoDescByUser[ownerLabel] = [];
            autoNoDescByUser[ownerLabel].push({ name: a.name, status: a.status, execType });
        }

        const TEST_PATTERNS = /test|prueba|tmp|borr/i;
        if (TEST_PATTERNS.test(a.name)) {
            testNameCount++;
            addDrillRow('auto_test_name', [a.name, a.status, execType, ownerLabel]);
        }

        let launchesJourney = false, importAutoCount = 0, exportAutoCount = 0;
        (a.processes || []).forEach(proc => {
            (proc.workerCounts || []).forEach(wc => {
                const typeLabel = ACTIVITY_TYPE_MAP[wc.objectTypeId] || `Tipo desconocido (${wc.objectTypeId})`;
                const n = wc.count || 1;
                activityTypeCounts[typeLabel] = (activityTypeCounts[typeLabel] || 0) + n;
                if (!actTypeDrill[typeLabel]) actTypeDrill[typeLabel] = [];
                actTypeDrill[typeLabel].push([a.name, n, a.status, ownerLabel]);
                if (wc.objectTypeId === 952) launchesJourney = true;
                if (wc.objectTypeId === 43)  { importCountAll += n; importAutoCount += n; }
                if (wc.objectTypeId === 73)  { exportCountAll += n; exportAutoCount += n; }
            });
        });

        if (launchesJourney) addDrillRow('auto_launch_journey', [a.name, a.status, lastRun, ownerLabel]);
        if (importAutoCount > 0) addDrillRow('auto_import', [a.name, importAutoCount, a.status, ownerLabel]);
        if (exportAutoCount > 0) addDrillRow('auto_export', [a.name, exportAutoCount, a.status, ownerLabel]);

        execTypeCounts[execType]++;
        const execKey = `auto_exec_${execType.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(execKey, `Ejecución: ${execType}`, ['Nombre', 'Estado', 'Propietario']);
        addDrillRow(execKey, [a.name, a.status, ownerLabel]);
    });

    const totalActivityInstances = Object.values(activityTypeCounts).reduce((s, v) => s + v, 0) || 1;
    const actTypeBars = Object.entries(activityTypeCounts).sort((a, b) => b[1] - a[1]).map(([label, value]) => {
        const dKey = `auto_act_${label.replace(/[^a-z0-9]/gi, '')}`;
        if (!isDetailed) {
            registerDrill(dKey, `Actividades: ${label}`, ['Automatismo Padre', 'Cantidad', 'Estado', 'Propietario']);
            (actTypeDrill[label] || []).forEach(row => addDrillRow(dKey, row));
        }
        return { label, value, total: totalActivityInstances, drillKey: dKey };
    });

    const execBars = Object.keys(execByYear)
        .sort((a, b) => {
            if (a === 'Sin historial') return 1; if (b === 'Sin historial') return -1;
            if (a === 'Más antiguos')  return 1; if (b === 'Más antiguos')  return -1;
            return parseInt(b) - parseInt(a);
        })
        .map(label => {
            const value = execByYear[label];
            const color = label === String(currentYear)   ? '#27ae60'
                : label === String(currentYear - 1)       ? '#2980b9'
                : label === String(currentYear - 2)       ? '#f39c12'
                : label === String(currentYear - 3)       ? '#e67e22'
                : label === 'Sin historial'               ? '#e74c3c'
                : '#bdc3c7';
            const dKey = label === 'Sin historial' ? 'auto_stale'
                : label === 'Más antiguos'          ? 'auto_exec_year_old'
                : `auto_exec_year_${label}`;
            return { label: label === 'Sin historial' ? 'Sin historial de ejecución' : `Ejecutados en ${label}`, value, total: totalAutos, color, drillKey: dKey };
        });

    const baseCards = [
        { title: 'Distribución por estado', help: 'Estado cuando se ha lanzado la auditoría.', bars:
            Object.entries(status).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, total: totalAutos, drillKey: `auto_status_${label}` }))
        },
        { title: 'Historial de ejecución', help: 'Último año de ejecución registrado.', bars: execBars },
        { title: 'Tipo de ejecución', help: 'Cómo se dispara cada automatismo: calendario (Schedule), llamada API (Fire Trigger), llegada de fichero (FileDrop) o sin tipo identificado.', bars:
            Object.entries(execTypeCounts).filter(([, v]) => v > 0).map(([label, value]) => {
                const color = label.includes('Schedule') ? '#27ae60' : label.includes('Fire') ? '#9b59b6' : label.includes('File') ? '#16a085' : '#bdc3c7';
                return { label, value, total: totalAutos, color, drillKey: `auto_exec_${label.replace(/[^a-z0-9]/gi, '')}` };
            })
        },        
        { title: 'Automatismos con nombre de prueba/test', help: 'Automatismos que contienen "test", "prueba", "tmp" o "borr" en el nombre. Candidatos a revisión o limpieza.', bars: [
            { label: 'Nombre normal', value: totalAutos - testNameCount, total: totalAutos, color: '#27ae60' },
            { label: 'Contiene test/prueba', value: testNameCount, total: totalAutos, color: '#e67e22', drillKey: 'auto_test_name' },
        ]},
        { title: 'Tipos de actividad más usados', help: 'Qué actividades son las más utilizadas en los automatismos.', bars: actTypeBars, wide: true },
    ];

    // --- ANÁLISIS DETALLADO ---
    let detailedCards = [];
    let detailedHtml  = '';

    if (isDetailed) {
        const notifications   = { 'Con email de alerta': 0, 'Sin email de alerta': 0 };
        const actDescriptions = { 'Con descripción': 0, 'Sin descripción': 0 };
        const sharedMap       = { 'Exclusivas (solo 1 auto)': 0, 'Compartidas (varios autos)': 0 };
        const actOccurrences  = {};
        const alertEmailsData = {};
        const detailedActTypeDrill = {};
        let totalActivitiesFound = 0;

        registerDrill('auto_alert_yes',    'Con email de alerta por error',   ['Automatismo', 'Estado', 'Emails de Aviso']);
        registerDrill('auto_alert_no',     'Sin email de alerta por error',   ['Automatismo', 'Estado', 'Motivo']);
        registerDrill('auto_act_desc_yes', 'Actividades documentadas',         ['Actividad', 'Tipo', 'Automatismo Padre', 'Descripción', 'Propietario Auto']);
        registerDrill('auto_act_desc_no',  'Actividades SIN documentar',       ['Actividad', 'Tipo', 'Automatismo Padre', 'Propietario Auto']);
        registerDrill('auto_act_exclusive','Actividades Exclusivas (1 auto)', ['Actividad', 'Tipo', 'Automatismo Padre']);
        registerDrill('auto_act_shared',   'Actividades Compartidas',         ['Actividad', 'Tipo', 'Nº Autos', 'Automatismos']);

        for (let i = 0; i < autos.length; i++) {
            const auto      = autos[i];
            const autoOwner = getUserLabel(auto.createdBy || auto.modifiedBy || auto.ownerId);
            ui.blockUI(`2/5: Analizando ${auto.name} (${i + 1}/${autos.length})…`);
            try {
                currentAuditApiCalls += 2;
                const [detail, notifs] = await Promise.all([
                    mcApiService.fetchAutomationDetailsById(auto.id, apiConfig),
                    mcApiService.fetchAutomationNotifications(auto.id, apiConfig),
                ]);

                const errorWorkers = notifs?.workers?.filter(w => w.notificationType === 'Error') || [];
                if (errorWorkers.length > 0) {
                    let hasValidEmail = false;
                    const emailsInAuto = [];
                    const uniqueEmails = new Set();
                    errorWorkers.forEach(w => {
                        const raw = w.definition || w.email || w.toAddress || w.emailAddress || '';
                        if (raw.trim()) { hasValidEmail = true; emailsInAuto.push(raw.trim()); }
                        raw.split(',').forEach(part => { const a = part.trim().toLowerCase(); if (a.includes('@')) uniqueEmails.add(a); });
                    });
                    if (hasValidEmail) {
                        notifications['Con email de alerta']++;
                        addDrillRow('auto_alert_yes', [auto.name, auto.status, emailsInAuto.join(', ')]);
                    } else {
                        notifications['Sin email de alerta']++;
                        addDrillRow('auto_alert_no', [auto.name, auto.status, 'Configurado pero sin email válido']);
                    }
                    uniqueEmails.forEach(email => {
                        if (!alertEmailsData[email]) alertEmailsData[email] = { count: 0, usages: [] };
                        alertEmailsData[email].count++;
                        alertEmailsData[email].usages.push(auto.name);
                    });
                } else {
                    notifications['Sin email de alerta']++;
                    addDrillRow('auto_alert_no', [auto.name, auto.status, 'No hay alertas de error activadas']);
                }

                for (const step of (detail.steps || [])) {
                    for (const act of (step.activities || [])) {
                        const typeName = ACTIVITY_TYPE_MAP[act.objectTypeId] || String(act.objectTypeId);
                        const actName  = act.name || 'Sin nombre';

                        // Registrar para el mapa de tipo de actividad (todos los tipos)
                        if (!detailedActTypeDrill[typeName]) detailedActTypeDrill[typeName] = [];
                        detailedActTypeDrill[typeName].push([actName, auto.name, autoOwner]);

                        // Registrar para reutilización de actividades (todos los tipos)
                        const actId = act.activityObjectId || act.id;
                        if (actId) {
                            if (!actOccurrences[actId]) actOccurrences[actId] = { count: 0, name: actName, type: typeName, usages: [] };
                            actOccurrences[actId].count++;
                            actOccurrences[actId].usages.push(auto.name);
                        }

                        // Verificación de descripción: SOLO para SQL (300) y SSJS (423).
                        // Las actividades del payload de steps no incluyen campo description;
                        // para otros tipos no hay forma de obtenerla sin llamadas adicionales.
                        if (act.objectTypeId !== 300 && act.objectTypeId !== 423) continue;

                        totalActivitiesFound++;
                        let hasDesc  = false;
                        let descText = '';

                        if (act.activityObjectId) {
                            try {
                                if (act.objectTypeId === 300) {
                                    currentAuditApiCalls++;
                                    const q = await mcApiService.fetchQueryDefinitionDetails(act.activityObjectId, apiConfig);
                                    if (q?.description?.trim()) { hasDesc = true; descText = q.description; }
                                } else {
                                    currentAuditApiCalls++;
                                    const s = await mcApiService.fetchScriptDetails(act.activityObjectId, apiConfig);
                                    if (s?.description?.trim()) { hasDesc = true; descText = s.description; }
                                }
                            } catch (e) {}
                        }

                        if (hasDesc) {
                            actDescriptions['Con descripción']++;
                            addDrillRow('auto_act_desc_yes', [actName, typeName, auto.name, descText, autoOwner]);
                        } else {
                            actDescriptions['Sin descripción']++;
                            addDrillRow('auto_act_desc_no', [actName, typeName, auto.name, autoOwner]);
                        }
                    }
                }
            } catch (e) {
                notifications['Sin email de alerta']++;
                addDrillRow('auto_alert_no', [auto.name, auto.status, 'Error al obtener detalles de la API']);
            }
        }

        // Drill de tipo detallado (sobrescribe el masivo con datos más ricos)
        Object.keys(detailedActTypeDrill).forEach(label => {
            const dKey = `auto_act_${label.replace(/[^a-z0-9]/gi, '')}`;
            auditDrillData[dKey] = { title: `Actividades: ${label}`, columns: ['Nombre Actividad', 'Automatismo Padre', 'Propietario'], rows: detailedActTypeDrill[label] };
        });

        // Actividades compartidas
        Object.values(actOccurrences).forEach(obj => {
            if (obj.count === 1) { sharedMap['Exclusivas (solo 1 auto)']++; addDrillRow('auto_act_exclusive', [obj.name, obj.type, obj.usages[0]]); }
            else                 { sharedMap['Compartidas (varios autos)']++; addDrillRow('auto_act_shared', [obj.name, obj.type, obj.count, obj.usages.join(', ')]); }
        });

        // Drill por email de alerta (no entra en export masivo por diseño)
        Object.keys(alertEmailsData).forEach(email => {
            const dKey = `auto_email_${email.replace(/[^a-z0-9]/gi, '')}`;
            registerDrill(dKey, `Alertas a: ${email}`, ['Automatismo']);
            alertEmailsData[email].usages.forEach(n => addDrillRow(dKey, [n]));
        });

        // Drills de responsable — un drill por usuario para ver el listado al hacer clic
        Object.entries(autoNoDescByUser).forEach(([owner, items]) => {
            const dKey = `auto_noDesc_user_${owner.replace(/[^a-z0-9]/gi, '')}`;
            registerDrill(dKey, `Sin descripción (autom.) — ${owner}`, ['Automatismo', 'Estado', 'Tipo Ejecución']);
            items.forEach(i => addDrillRow(dKey, [i.name, i.status, i.execType]));
        });

        const noAlertPct   = totalAutos > 0 ? Math.round((notifications['Sin email de alerta'] / totalAutos) * 100) : 0;
        const noActDescPct = totalActivitiesFound > 0 ? Math.round((actDescriptions['Sin descripción'] / totalActivitiesFound) * 100) : 0;
        const sharedTotal  = Object.keys(actOccurrences).length;

        const detailedCallouts = [];
        if (noAlertPct > 30) detailedCallouts.push(buildCallout('danger', 'Automatismos sin email de alerta',
            `El ${noAlertPct}% de los automatismos no avisan por email al fallar.`));
        if (noActDescPct > 60) detailedCallouts.push(buildCallout('warning', 'Actividades sin documentar',
            `El ${noActDescPct}% de las actividades SQL/SSJS no tienen descripción.`));

        const alertEmailBars = Object.entries(alertEmailsData)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([email, data]) => ({ label: email, value: data.count, total: notifications['Con email de alerta'] || 1, drillKey: `auto_email_${email.replace(/[^a-z0-9]/gi, '')}` }));

        const autoNoDescUserBars = Object.entries(autoNoDescByUser)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([owner, items]) => ({ label: owner, value: items.length, total: autoDescriptions['Sin descripción'] || 1, drillKey: `auto_noDesc_user_${owner.replace(/[^a-z0-9]/gi, '')}` }));

        detailedCards = [
            { title: 'Email de alerta por error', help: `Base: ${totalAutos} automatismos.`, bars: [
                { label: 'Con email de alerta', value: notifications['Con email de alerta'], total: totalAutos, color: '#27ae60', drillKey: 'auto_alert_yes' },
                { label: 'Sin email de alerta', value: notifications['Sin email de alerta'], total: totalAutos, color: '#e74c3c', drillKey: 'auto_alert_no' },
            ]},
            { title: 'Emails de alertas de error', help: 'Direcciones configuradas.', bars: alertEmailBars.length > 0 ? alertEmailBars : [{ label: 'Sin alertas configuradas', value: 0, total: 1, color: '#bdc3c7' }] },
            { title: 'Descripción del automatismo', help: 'Campo descripción del proceso padre.', bars: [
                { label: 'Con descripción', value: autoDescriptions['Con descripción'], total: totalAutos, color: '#27ae60', drillKey: 'auto_desc_yes' },
                { label: 'Sin descripción', value: autoDescriptions['Sin descripción'], total: totalAutos, color: '#e74c3c', drillKey: 'auto_desc_no' },
            ]},
            { title: 'Sin descripción — por propietario', help: 'Responsable del automatismo ordenado por número de procesos sin documentar.', bars: autoNoDescUserBars.length > 0 ? autoNoDescUserBars : [{ label: 'Todos documentados', value: 0, total: 1, color: '#27ae60' }] },
            { title: 'Descripción de actividades (SQL/SSJS)', help: `Base: ${totalActivitiesFound} SQL Queries y Scripts SSJS.`, bars: [
                { label: 'Con descripción', value: actDescriptions['Con descripción'], total: totalActivitiesFound, color: '#27ae60', drillKey: 'auto_act_desc_yes' },
                { label: 'Sin descripción', value: actDescriptions['Sin descripción'], total: totalActivitiesFound, color: '#e74c3c', drillKey: 'auto_act_desc_no' },
            ]},
            { title: 'Reutilización de actividades', help: `Base: ${sharedTotal} actividades únicas. Identifica queries/scripts se utilizan en más de 1 automatismo.`, bars: [
                { label: 'Exclusivas (solo 1 auto)',   value: sharedMap['Exclusivas (solo 1 auto)'],   total: sharedTotal, color: '#27ae60', drillKey: 'auto_act_exclusive' },
                { label: 'Compartidas (varios autos)', value: sharedMap['Compartidas (varios autos)'], total: sharedTotal, color: '#f39c12', drillKey: 'auto_act_shared' },
            ]},
        ];

        detailedHtml = detailedCallouts.join('') +
            buildSectionHeader('Análisis Detallado — Inspección Individual') +
            buildGrid(detailedCards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })));
    } else {
        detailedHtml = buildCallout('info', 'Análisis profundo no ejecutado',
            'Activa la opción para obtener: alertas de error, dominios de aviso, descripciones, responsables de contenido sin documentar y reutilización de actividades.');
    }

    const topCallouts = [];
    if (ignoredSystemAutos > 0) topCallouts.push(buildCallout('info', 'Procesos de sistema excluidos',
        `Se ignoraron <b>${ignoredSystemAutos} automatismos</b> (empiezan por ${mid}).`));
    if (execByYear['Sin historial'] > totalAutos * 0.3) topCallouts.push(buildCallout('warning', 'Automatismos sin actividad',
        'Muchos automatismos nunca se han ejecutado. Revisar si son borradores o procesos obsoletos.'));

    const kpis = [
        { value: totalAutos,               label: 'Total Automatismos',  color: '#69a3db', drillKey: 'auto_total' },
        { value: autos.filter(a => ['Scheduled','Ready','Running'].includes(a.status)).length, label: 'Activos / Prog.', color: '#27ae60', drillKey: 'auto_active' },
        { value: execByYear['Sin historial'], label: 'Sin historial',    color: execByYear['Sin historial'] > totalAutos * 0.3 ? '#e74c3c' : '#f39c12', drillKey: 'auto_stale' },
        { value: journeyLaunchingCount,    label: 'Lanzan Journeys',     color: '#9b59b6', drillKey: 'auto_launch_journey' },
        { value: importCountAll,           label: 'Acts. Import',        color: '#3498db', drillKey: 'auto_import' },
        { value: exportCountAll,           label: 'Acts. Export',        color: '#16a085', drillKey: 'auto_export' },
        { value: testNameCount, label: 'Nombre prueba/test', color: testNameCount > 0 ? '#e67e22' : '#bdc3c7', drillKey: 'auto_test_name' },
    ];

    registerPdfData('autos', kpis, [...baseCards, ...detailedCards], [...topCallouts, ...((typeof detailedCallouts !== 'undefined') ? detailedCallouts : [])].map(c => parsePdfCallout(c)));

    document.getElementById('audit-tab-autos').innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + topCallouts.join('') +
        buildGrid(baseCards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide }))) +
        detailedHtml
    );
}

// ==========================================
// 3. JOURNEYS
// ==========================================
async function auditJourneys(apiConfig, isDetailed) {
    currentAuditApiCalls += 2;
    const [eventDefs, journeys] = await Promise.all([
        mcApiService.fetchAllEventDefinitions(apiConfig),
        mcApiService.fetchAllJourneys(apiConfig),
    ]);

    const total    = journeys.length;
    const status   = {}, entries  = {}, subtypes = {};
    const sfIntegration = { 'Con nodos Salesforce': 0, 'Sin nodos Salesforce': 0 };
    const channels = {}, mixJourneys = {};

    let withGoals = 0, withoutGoals = 0, withExits = 0, withoutExits = 0;
    let publishedCount = 0, logicOnlyCount = 0;
    let activeNoActivity1m = 0, activeNoActivity3m = 0, activeNoActivity6m  = 0,
        activeNoActivity9m = 0, activeNoActivity12m = 0;
    let testNameCount = 0;

    const now = new Date();
    const [oneMonthAgo, threeMonthsAgo, sixMonthsAgo, nineMonthsAgo, twelveMonthsAgo] =
        [1, 3, 6, 9, 12].map(m => new Date(now.getFullYear(), now.getMonth() - m, now.getDate()));

    registerDrill('journey_total',     'Total Journeys',                ['Nombre', 'Versión', 'Estado', 'Subtipo', 'Tipo Entrada', 'Goals', 'Exits', 'Última Mod.']);
    registerDrill('journey_published', 'Journeys Publicados',           ['Nombre', 'Versión', 'Tipo Entrada', 'Goals', 'Exits', 'Última Mod.', 'Última Actividad']);
    registerDrill('journey_draft',     'Borradores',                    ['Nombre', 'Versión', 'Tipo Entrada']);
    registerDrill('journey_stopped',   'Journeys Detenidos',            ['Nombre', 'Versión', 'Tipo Entrada', 'Última Mod.']);
    registerDrill('journey_goal_yes',  'Con Goal Configurado',          ['Nombre', 'Estado', 'Tipo Entrada']);
    registerDrill('journey_goal_no',   'Sin Goal Configurado',          ['Nombre', 'Estado', 'Tipo Entrada']);
    registerDrill('journey_exit_yes',  'Con Criterio de Salida',        ['Nombre', 'Estado', 'Tipo Entrada']);
    registerDrill('journey_exit_no',   'Sin Criterio de Salida',        ['Nombre', 'Estado', 'Tipo Entrada']);
    registerDrill('journey_no_act_1m', 'Publicados sin actividad >1m',  ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_no_act_3m', 'Publicados sin actividad >3m',  ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_no_act_6m', 'Publicados sin actividad >6m',  ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_no_act_9m', 'Publicados sin actividad >9m',  ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_no_act_12m','Publicados sin actividad >12m', ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_test_name', 'Journeys con nombre de prueba/test', ['Nombre', 'Versión', 'Estado', 'Subtipo']);

    const eventMapByGuid = {};
    eventDefs.forEach(e => {
        if (e.eventDefinitionKey?.includes('-'))
            eventMapByGuid[e.eventDefinitionKey.substring(e.eventDefinitionKey.indexOf('-') + 1).toLowerCase()] = e;
    });

    for (let i = 0; i < journeys.length; i++) {
        const j       = journeys[i];
        const modDate = formatDate(j.modifiedDate);
        const hasGoal = Array.isArray(j.goals) && j.goals.length > 0;
        const hasExit = Array.isArray(j.exits) && j.exits.length > 0;
        const sub     = j.definitionType || 'Desconocido';

        let type = 'No asociado / Desconocido';
        if (j.defaults?.email?.[0]) {
            const match = j.defaults.email[0].match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
            if (match && eventMapByGuid[match[0].toLowerCase()]) type = eventMapByGuid[match[0].toLowerCase()].type;
        }
        if (type === 'No asociado / Desconocido' && j.triggers?.[0]?.type) type = j.triggers[0].type;

        addDrillRow('journey_total', [j.name, j.version, j.status, sub, type, hasGoal?'Sí':'No', hasExit?'Sí':'No', modDate]);

        status[j.status] = (status[j.status] || 0) + 1;
        registerDrill(`journey_status_${j.status}`, `Journeys: ${j.status}`, ['Nombre', 'Versión', 'Tipo Entrada', 'Goals', 'Exits']);
        addDrillRow(`journey_status_${j.status}`, [j.name, j.version, type, hasGoal?'Sí':'No', hasExit?'Sí':'No']);

        subtypes[sub] = (subtypes[sub] || 0) + 1;
        registerDrill(`journey_sub_${sub}`, `Subtipo: ${sub}`, ['Nombre', 'Estado', 'Tipo Entrada', 'Goals', 'Exits']);
        addDrillRow(`journey_sub_${sub}`, [j.name, j.status, type, hasGoal?'Sí':'No', hasExit?'Sí':'No']);

        entries[type] = (entries[type] || 0) + 1;
        registerDrill(`journey_entry_${type.replace(/[^a-z0-9]/gi,'')}`, `Entrada: ${type}`, ['Nombre', 'Estado', 'Subtipo', 'Goals', 'Exits']);
        addDrillRow(`journey_entry_${type.replace(/[^a-z0-9]/gi,'')}`, [j.name, j.status, sub, hasGoal?'Sí':'No', hasExit?'Sí':'No']);

        if (hasGoal) { withGoals++;   addDrillRow('journey_goal_yes', [j.name, j.status, type]); }
        else         { withoutGoals++; addDrillRow('journey_goal_no',  [j.name, j.status, type]); }
        if (hasExit) { withExits++;   addDrillRow('journey_exit_yes', [j.name, j.status, type]); }
        else         { withoutExits++; addDrillRow('journey_exit_no',  [j.name, j.status, type]); }

        if (j.status === 'Published') {
            publishedCount++;
            let lastActStr = 'Sin registro', lastActDate = null;
            if (j.activity?.lastContactProcessed && !j.activity.lastContactProcessed.startsWith('0001')) {
                lastActDate = new Date(j.activity.lastContactProcessed);
                lastActStr  = formatDate(j.activity.lastContactProcessed);
            }
            addDrillRow('journey_published', [j.name, j.version, type, hasGoal?'Sí':'No', hasExit?'Sí':'No', modDate, lastActStr]);
            if (!lastActDate || lastActDate < oneMonthAgo)    { activeNoActivity1m++;  addDrillRow('journey_no_act_1m',  [j.name, j.version, lastActStr]); }
            if (!lastActDate || lastActDate < threeMonthsAgo) { activeNoActivity3m++;  addDrillRow('journey_no_act_3m',  [j.name, j.version, lastActStr]); }
            if (!lastActDate || lastActDate < sixMonthsAgo)   { activeNoActivity6m++;  addDrillRow('journey_no_act_6m',  [j.name, j.version, lastActStr]); }
            if (!lastActDate || lastActDate < nineMonthsAgo)  { activeNoActivity9m++;  addDrillRow('journey_no_act_9m',  [j.name, j.version, lastActStr]); }
            if (!lastActDate || lastActDate < twelveMonthsAgo){ activeNoActivity12m++; addDrillRow('journey_no_act_12m', [j.name, j.version, lastActStr]); }
        }
        if (j.status === 'Draft')   addDrillRow('journey_draft',   [j.name, j.version, type]);
        if (j.status === 'Stopped') addDrillRow('journey_stopped', [j.name, j.version, type, modDate]);

        const TEST_PATTERNS = /test|prueba|tmp|borr/i;
        if (TEST_PATTERNS.test(j.name)) {
            testNameCount++;
            addDrillRow('journey_test_name', [j.name, j.version, j.status, sub]);
        }

        if (isDetailed) {
            ui.blockUI(`3/5: Analizando ${j.name} (${i + 1}/${journeys.length})…`);
            let acts = Array.isArray(j.activities) && j.activities.length > 0 ? j.activities : null;
            if (!acts) {
                try { currentAuditApiCalls++; const detail = await mcApiService.fetchJourneyDetailsById(j.id, apiConfig); acts = detail.activities || []; }
                catch (e) { acts = []; }
            }

            const activeChannels = new Set();
            let hasSF = false;
            acts.forEach(a => {
                const t = (a.type || '').toUpperCase();
                if (t === 'EMAILV2') activeChannels.add('Email');
                if (['SMS','SMSSYNC'].includes(t)) activeChannels.add('SMS');
                if (t === 'WHATSAPPACTIVITY') activeChannels.add('WhatsApp');
                if (['INAPP','INBOX','MOBILEPUSH','PUSHINBOXACTIVITY','PUSHNOTIFICATIONACTIVITY'].includes(t)) activeChannels.add('Push / In-App');
                if (['SALESFORCESALESCLOUDACTIVITY','SALESCLOUDACTIVITY','OBJECTACTIVITY','CAMPAIGNMEMBER','LEAD'].includes(t)) hasSF = true;
            });

            const combo = Array.from(activeChannels).sort().join(' + ') || 'Solo Lógica (Sin Envío)';
            channels[combo] = (channels[combo] || 0) + 1;
            if (!mixJourneys[combo]) mixJourneys[combo] = [];
            mixJourneys[combo].push([j.name, j.status, type, hasGoal?'Sí':'No', hasExit?'Sí':'No']);
            if (combo === 'Solo Lógica (Sin Envío)') logicOnlyCount++;

            registerDrill('journey_sf_yes', 'Con Nodos Salesforce', ['Nombre', 'Estado', 'Tipo Entrada']);
            registerDrill('journey_sf_no',  'Sin Nodos Salesforce', ['Nombre', 'Estado', 'Tipo Entrada']);
            if (hasSF) { sfIntegration['Con nodos Salesforce']++; addDrillRow('journey_sf_yes', [j.name, j.status, type]); }
            else       { sfIntegration['Sin nodos Salesforce']++; addDrillRow('journey_sf_no',  [j.name, j.status, type]); }
        }
    }

    const channelBars = Object.entries(channels).sort((a, b) => b[1] - a[1]).map(([label, value]) => {
        const dKey = `journey_mix_${label.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(dKey, `Mix: ${label}`, ['Nombre', 'Estado', 'Tipo Entrada', 'Goals', 'Exits']);
        (mixJourneys[label] || []).forEach(row => addDrillRow(dKey, row));
        return { label, value, total, color: label === 'Solo Lógica (Sin Envío)' ? '#95a5a6' : undefined, drillKey: dKey };
    });

    const callouts = [];
    const noGoalPct = total > 0 ? Math.round((withoutGoals / total) * 100) : 0;
    if (noGoalPct > 50) callouts.push(buildCallout('info', 'Mayoría de Journeys sin Goal',
        `El ${noGoalPct}% de los Journeys no tienen un Goal definido.`));
    const noActPct = publishedCount > 0 ? Math.round((activeNoActivity1m / publishedCount) * 100) : 0;
    if (noActPct > 30) callouts.push(buildCallout('warning', 'Journeys activos sin uso',
        `El ${noActPct}% de los Journeys publicados no han procesado contactos en el último mes.`));
    if (isDetailed && logicOnlyCount > 0 && Math.round((logicOnlyCount / total) * 100) > 10)
        callouts.push(buildCallout('info', 'Journeys sin actividades de envío',
            `${logicOnlyCount} journeys solo contienen nodos de lógica, sin ningún canal de envío.`));

    const kpis = [
        { value: total,               label: 'Total Journeys',        color: '#69a3db', drillKey: 'journey_total' },
        { value: publishedCount,      label: 'Publicados',            color: '#27ae60', drillKey: 'journey_published' },
        { value: status['Draft']  ||0,label: 'Borradores',            color: '#95a5a6', drillKey: 'journey_draft' },
        { value: status['Stopped']||0,label: 'Detenidos',             color: '#e74c3c', drillKey: 'journey_stopped' },
        { value: withGoals,           label: 'Con Goal',              color: '#27ae60', drillKey: 'journey_goal_yes' },
        { value: withExits,           label: 'Con salida',            color: '#3498db', drillKey: 'journey_exit_yes' },
        { value: testNameCount, label: 'Nombre prueba/test', color: testNameCount > 0 ? '#e67e22' : '#bdc3c7', drillKey: 'journey_test_name' },
    ];

    const baseCards = [
        { title: 'Estado de publicación', help: 'Estado operativo del Journey.', bars:
            Object.entries(status).sort((a, b) => b[1]-a[1]).map(([label, value]) => ({ label, value, total, drillKey: `journey_status_${label}` }))
        },
        { title: 'Subtipo de Journey', help: 'Clasificación del tipo: Multistep, Quicksend, Transactional…', bars:
            Object.entries(subtypes).sort((a, b) => b[1]-a[1]).map(([label, value]) => ({ label, value, total, drillKey: `journey_sub_${label}` }))
        },
        { title: 'Tipología del origen de entrada', help: 'Tipo de Event Definition.', bars:
            Object.entries(entries).sort((a, b) => b[1]-a[1]).map(([label, value]) => ({ label, value, total, drillKey: `journey_entry_${label.replace(/[^a-z0-9]/gi,'')}` }))
        },
        { title: 'Goals y criterios de salida', help: `Base: ${total} journeys.`, bars: [
            { label: 'Con Goal definido',      value: withGoals,    total, color: '#27ae60', drillKey: 'journey_goal_yes' },
            { label: 'Sin Goal',               value: withoutGoals, total, color: '#e74c3c', drillKey: 'journey_goal_no' },
            { label: 'Con criterio de salida', value: withExits,    total, color: '#27ae60', drillKey: 'journey_exit_yes' },
            { label: 'Sin criterio de salida', value: withoutExits, total, color: '#f39c12', drillKey: 'journey_exit_no' },
        ]},
        { title: 'Actividad reciente (Journeys Publicados)', help: `Base: ${publishedCount} publicados. Tiempo sin procesar contactos.`, bars: [
            { label: 'Sin actividad >1 mes',   value: activeNoActivity1m,  total: publishedCount, color: '#f39c12', drillKey: 'journey_no_act_1m' },
            { label: 'Sin actividad >3 meses', value: activeNoActivity3m,  total: publishedCount, color: '#e67e22', drillKey: 'journey_no_act_3m' },
            { label: 'Sin actividad >6 meses', value: activeNoActivity6m,  total: publishedCount, color: '#e74c3c', drillKey: 'journey_no_act_6m' },
            { label: 'Sin actividad >9 meses', value: activeNoActivity9m,  total: publishedCount, color: '#c0392b', drillKey: 'journey_no_act_9m' },
            { label: 'Sin actividad >12 meses',value: activeNoActivity12m, total: publishedCount, color: '#922b21', drillKey: 'journey_no_act_12m' },
        ]},
        { title: 'Journeys con nombre de prueba/test', help: 'Journeys que contienen "test", "prueba", "tmp" o "borr" en el nombre. Candidatos a revisión o limpieza.', bars: [
            { label: 'Nombre normal', value: total - testNameCount, total, color: '#27ae60' },
            { label: 'Contiene test/prueba', value: testNameCount, total, color: '#e67e22', drillKey: 'journey_test_name' },
        ]},
    ];

    const deepCards = isDetailed ? [
        { title: 'Integración con CRM (Salesforce)', help: 'Presencia de actividades de Salesforce.', bars: [
            { label: 'Con nodos Salesforce', value: sfIntegration['Con nodos Salesforce'], total, color: '#9b59b6', drillKey: 'journey_sf_yes' },
            { label: 'Sin nodos Salesforce', value: sfIntegration['Sin nodos Salesforce'], total, color: '#bdc3c7', drillKey: 'journey_sf_no' },
        ]},
        { title: 'Multicanalidad', help: 'Combinación de canales (Email, SMS, Push/In-App, WhatsApp).', bars: channelBars },
    ] : [];

    registerPdfData('journeys', kpis, [...baseCards, ...deepCards], callouts.map(c => parsePdfCallout(c)));

    const deepSection = isDetailed
        ? buildGrid(deepCards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })))
        : buildCallout('info', 'Análisis profundo no ejecutado', 'Activa la opción para ver el mix multicanal real y los nodos de Salesforce en el canvas.');

    document.getElementById('audit-tab-journeys').innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + callouts.join('') +
        buildGrid(baseCards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide }))) +
        deepSection
    );
}

// ==========================================
// 4. CLOUD PAGES
// ==========================================
function extractCloudPageUrl(item) {
    try {
        if (item.content?.trim().startsWith('{')) { const j = JSON.parse(item.content); if (j.url) return j.url; }
        if (item.data?.site?.content?.trim().startsWith('{')) { const j = JSON.parse(item.data.site.content); if (j.url) return j.url; }
    } catch (e) {}
    return item.meta?.cloudPages?.url || item.views?.publishedUrl || item.publishedUrl || item.url || '';
}

async function auditCloudPages(apiConfig) {
    currentAuditApiCalls++;
    const pages = await mcApiService.fetchAllCloudPages(apiConfig);
    const total = pages.length;
    const types = {};
    let publishedCount = 0, noDirectUrlCount = 0;

    registerDrill('cp_total',       'Total Cloud Pages', ['Nombre', 'Tipo', 'Publicada', 'URL', 'Fecha Publicación']);
    registerDrill('cp_published',   'Publicadas',        ['Nombre', 'Tipo', 'URL', 'Fecha Publicación']);
    registerDrill('cp_unpublished', 'Sin publicar',      ['Nombre', 'Tipo']);
    registerDrill('cp_no_url',      'Sin URL Directa',   ['Nombre', 'Tipo', 'Publicada']);

    pages.forEach(p => {
        const typeName  = p.assetType?.displayName || 'Otros';
        types[typeName] = (types[typeName] || 0) + 1;
        const dKeyType  = `cp_type_${typeName.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(dKeyType, `Tipo: ${typeName}`, ['Nombre', 'Publicada', 'URL', 'Fecha Publicación']);

        const pubDate     = p.meta?.cloudPages?.publishDate || p.publishedDate;
        const isPublished = !!(pubDate && !pubDate.startsWith('0001'));
        const pubDateStr  = isPublished ? formatDate(pubDate) : '---';
        if (isPublished) publishedCount++;

        const url    = extractCloudPageUrl(p);
        const hasUrl = !!(url && url.startsWith('http'));
        if (!hasUrl) noDirectUrlCount++;

        addDrillRow('cp_total',  [p.name, typeName, isPublished?'Sí':'No', url||'---', pubDateStr]);
        addDrillRow(dKeyType,    [p.name, isPublished?'Sí':'No', url||'---', pubDateStr]);
        if (isPublished) addDrillRow('cp_published',   [p.name, typeName, url||'---', pubDateStr]);
        else             addDrillRow('cp_unpublished', [p.name, typeName]);
        if (!hasUrl)     addDrillRow('cp_no_url',      [p.name, typeName, isPublished?'Publicada':'Sin publicar']);
    });

    const unpublishedCount = total - publishedCount;
    const callouts = [];
    if (noDirectUrlCount > 0) callouts.push(buildCallout('info', 'Páginas sin enlace directo',
        `${noDirectUrlCount} Cloud Pages no tienen URL publicada directa. Suelen ser páginas dentro de una colección o Code Resources.`));
    if (total > 0 && unpublishedCount > total * 0.5) callouts.push(buildCallout('warning', 'Mayoría de Cloud Pages sin publicar',
        `El ${Math.round((unpublishedCount/total)*100)}% no tienen fecha de publicación.`));

    const kpis = [
        { value: total,            label: 'Total Cloud Pages', color: '#69a3db', drillKey: 'cp_total' },
        { value: publishedCount,   label: 'Publicadas',        color: '#27ae60', drillKey: 'cp_published' },
        { value: unpublishedCount, label: 'Sin publicar',      color: unpublishedCount > total*0.5 ? '#f39c12' : '#bdc3c7', drillKey: 'cp_unpublished' },
        { value: noDirectUrlCount, label: 'Sin URL directa',   color: noDirectUrlCount > 0 ? '#9b59b6' : '#bdc3c7', drillKey: 'cp_no_url' },
    ];

    const cards = [
        { title: 'Tipos de asset', help: 'Volumetría por funcionalidad: Landing Pages, Code Resources, Microsites…', bars:
            Object.entries(types).sort((a,b)=>b[1]-a[1]).map(([label,value]) => ({ label, value, total, drillKey: `cp_type_${label.replace(/[^a-z0-9]/gi,'')}` }))
        },
        { title: 'Estado de publicación', help: 'Distribución basada en la presencia de fecha de publicación.', bars: [
            { label: 'Publicadas (con fecha)', value: publishedCount,   total, color: '#27ae60', drillKey: 'cp_published' },
            { label: 'Sin publicar',           value: unpublishedCount, total, color: '#f39c12', drillKey: 'cp_unpublished' },
            { label: 'Sin URL directa',        value: noDirectUrlCount, total, color: '#9b59b6', drillKey: 'cp_no_url' },
        ]},
    ];

    registerPdfData('cp', kpis, cards, callouts.map(c => parsePdfCallout(c)));
    document.getElementById('audit-tab-cp').innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + callouts.join('') + buildGrid(cards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })))
    );
}

// ==========================================
// 5. SEND MANAGEMENT
// ==========================================
async function auditSendManagement(apiConfig) {
    currentAuditApiCalls += 2;
    const [sc, sp] = await Promise.all([
        mcApiService.fetchAllSendClassifications(apiConfig),
        mcApiService.fetchAllSenderProfiles(apiConfig),
    ]);

    const usage  = { 'En uso': 0, 'Huérfanos (sin clasificación)': 0 };
    const config = { 'From dinámico (%%=)': 0, 'Con AutoReply': 0, 'Con Forward': 0 };
    const froms  = {};
    const usedKeys = new Set(sc.map(s => s.senderProfile).filter(Boolean));

    registerDrill('sm_sc',      'Send Classifications', ['Nombre', 'Customer Key', 'Sender Profile', 'Delivery Profile']);
    registerDrill('sm_sp',      'Sender Profiles',      ['Nombre', 'Customer Key', 'From Name', 'From Email', 'AutoReply', 'Forward']);
    registerDrill('sm_in_use',  'Perfiles en Uso',      ['Nombre', 'From Email', 'Send Classification Asociada']);
    registerDrill('sm_orphans', 'Perfiles Huérfanos',   ['Nombre', 'Customer Key', 'From Email']);
    registerDrill('sm_dynamic', 'From Dinámico',        ['Nombre', 'From Name', 'From Email']);
    registerDrill('sm_reply',   'Con AutoReply',        ['Nombre', 'From Email']);
    registerDrill('sm_forward', 'Con Forward',          ['Nombre', 'Forward To', 'From Email']);

    sc.forEach(s => addDrillRow('sm_sc', [s.name, s.customerKey, s.senderProfile, s.deliveryProfile]));

    sp.forEach(p => {
        const hasForward = p.autoForwardEmail && p.autoForwardEmail !== '---';
        addDrillRow('sm_sp', [p.name, p.customerKey, p.fromName, p.fromAddress, p.autoReply?'Sí':'No', hasForward?p.autoForwardEmail:'No']);

        if (usedKeys.has(p.customerKey)) {
            usage['En uso']++;
            addDrillRow('sm_in_use', [p.name, p.fromAddress, sc.find(s => s.senderProfile === p.customerKey)?.name || 'Sí']);
        } else {
            usage['Huérfanos (sin clasificación)']++;
            addDrillRow('sm_orphans', [p.name, p.customerKey, p.fromAddress]);
        }

        if ((p.fromAddress||'').includes('%%=') || (p.fromName||'').includes('%%=')) { config['From dinámico (%%=)']++; addDrillRow('sm_dynamic', [p.name, p.fromName, p.fromAddress]); }
        if (p.autoReply) { config['Con AutoReply']++; addDrillRow('sm_reply', [p.name, p.fromAddress]); }
        if (hasForward)  { config['Con Forward']++;   addDrillRow('sm_forward', [p.name, p.autoForwardEmail, p.fromAddress]); }

        const fromKey = p.fromAddress || 'Sin dirección From';
        froms[fromKey] = (froms[fromKey] || 0) + 1;
        const dKeyFrom = `sm_from_${fromKey.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(dKeyFrom, `Sender Profiles con From: ${fromKey}`, ['Nombre', 'From Name', 'Customer Key', 'AutoReply', 'Forward']);
        addDrillRow(dKeyFrom, [p.name, p.fromName, p.customerKey, p.autoReply?'Sí':'No', hasForward?p.autoForwardEmail:'No']);
    });

    const orphanCount = usage['Huérfanos (sin clasificación)'];
    const orphanPct   = sp.length > 0 ? Math.round((orphanCount / sp.length) * 100) : 0;

    const callouts = [];
    if (orphanCount > 0) callouts.push(buildCallout('warning', 'Sender Profiles huérfanos',
        `${orphanCount} perfil(es) (${orphanPct}%) no están asociados a ninguna Send Classification. Están configurados pero no se pueden usar en envíos.`));
    if (config['From dinámico (%%=)'] > 0) callouts.push(buildCallout('info', 'Remitente dinámico detectado',
        `${config['From dinámico (%%=)']} perfiles usan AMPscript (%%=) en el campo From. Verificar que la lógica de personalización sea intencionada.`));

    const fromBars = Object.entries(froms).sort((a,b)=>b[1]-a[1]).map(([label,value]) => ({
        label, value, total: sp.length, drillKey: `sm_from_${label.replace(/[^a-z0-9]/gi,'')}`,
    }));

    const kpis = [
        { value: sc.length,                     label: 'Send Classifications', color: '#69a3db', drillKey: 'sm_sc' },
        { value: sp.length,                     label: 'Sender Profiles',      color: '#3498db', drillKey: 'sm_sp' },
        { value: usage['En uso'],               label: 'Perfiles en uso',      color: '#27ae60', drillKey: 'sm_in_use' },
        { value: orphanCount,                   label: 'Perfiles huérfanos',   color: orphanCount > 0 ? '#e74c3c' : '#bdc3c7', drillKey: 'sm_orphans' },
        { value: config['From dinámico (%%=)'], label: 'From dinámico',        color: '#9b59b6', drillKey: 'sm_dynamic' },
    ];

    const cards = [
        { title: 'Gobernanza de perfiles', help: `Base: ${sp.length} Sender Profiles. Verifica vinculación con Send Classification.`, bars: [
            { label: 'En uso',                        value: usage['En uso'],                       total: sp.length, color: '#27ae60', drillKey: 'sm_in_use' },
            { label: 'Huérfanos (sin clasificación)', value: usage['Huérfanos (sin clasificación)'], total: sp.length, color: '#e74c3c', drillKey: 'sm_orphans' },
        ]},
        { title: 'Funcionalidades avanzadas', help: 'Revisa si el Sender contiene AMPScript además de AutoReply y Forward.', bars: [
            { label: 'From dinámico (%%=)', value: config['From dinámico (%%=)'], total: sp.length, color: '#9b59b6', drillKey: 'sm_dynamic' },
            { label: 'Con AutoReply',       value: config['Con AutoReply'],       total: sp.length, color: '#f39c12', drillKey: 'sm_reply' },
            { label: 'Con Forward',         value: config['Con Forward'],         total: sp.length, color: '#3498db', drillKey: 'sm_forward' },
        ]},
        { title: 'Concentración de direcciones From', help: 'Top 8 remitentes.', bars: fromBars, wide: true },
    ];

    registerPdfData('sm', kpis, cards, callouts.map(c => parsePdfCallout(c)));
    document.getElementById('audit-tab-sm').innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + callouts.join('') +
        buildGrid(cards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })))
    );
}


// ==========================================
// 6. DATA EXTENSIONS
// ==========================================
async function auditDataExtensions(jsonText) {
    const container = document.getElementById('audit-tab-de');

    if (!jsonText) {
        container.innerHTML = buildTabWrapper(
            buildCallout('info', 'Sin datos de Data Extensions',
                'Para auditar las Data Extensions, pega el JSON obtenido desde Contact Builder en el campo de la pantalla de configuración y vuelve a lanzar el escaneo.')
        );
        return;
    }

    let des = [];
    try {
        des = JSON.parse(jsonText);
        if (!Array.isArray(des)) throw new Error('El JSON debe ser un array.');
    } catch (e) {
        container.innerHTML = buildTabWrapper(
            buildCallout('danger', 'Error al parsear el JSON', 'Revisa que el texto pegado sea un JSON válido.')
        );
        return;
    }

    // Excluir DEs compartidas (shared) — no tienen folderPath propio o están en /Shared
    const ownDes = des.filter(d => !d.folderPath?.toLowerCase().includes('shared'));
    const total  = ownDes.length;

    // Métricas
    let noDescCount   = 0;
    let sendableCount = 0, testableCount = 0;
    let retentionCount = 0;
    let over1MCount   = 0;
    let emptyCount    = 0;
    let testNameCount = 0; // DEs con "test" o "prueba" en el nombre
    let totalFields   = 0;

    const retentionTypes   = {};
    const folderCounts     = {};
    const noDescByUser     = {};
    const fieldBuckets     = { '1-10': 0, '11-25': 0, '26-50': 0, '51+': 0 };

    registerDrill('de_total',        'Total Data Extensions',              ['Nombre', 'Key', 'Carpeta', 'Filas', 'Campos', 'Sendable', 'Testable', 'Descripción', 'Creado por']);
    registerDrill('de_no_desc',      'Sin Descripción',                    ['Nombre', 'Key', 'Carpeta', 'Creado por', 'Modificado por']);
    registerDrill('de_sendable',     'Sendable',                           ['Nombre', 'Key', 'Carpeta', 'Filas']);
    registerDrill('de_testable',     'Testable',                           ['Nombre', 'Key', 'Carpeta', 'Filas']);
    registerDrill('de_retention',    'Con Data Retention',                 ['Nombre', 'Key', 'Tipo Retención', 'Borrar al final', 'Reset en Import']);
    registerDrill('de_over1m',       'Con más de 1M de registros',         ['Nombre', 'Key', 'Carpeta', 'Filas']);
    registerDrill('de_empty',        'DEs sin registros (vacías)',          ['Nombre', 'Key', 'Carpeta', 'Creado por']);
    registerDrill('de_test_name',    'DEs con nombre de prueba/test',       ['Nombre', 'Key', 'Carpeta', 'Filas', 'Creado por']);
    registerDrill('de_no_desc_users','Sin descripción — por propietario',  ['Nombre', 'Key', 'Carpeta']);

    ownDes.forEach(d => {
        const folder     = d.folderPath || 'Sin carpeta';
        const rows       = d.rowCount   || 0;
        const fields     = d.fieldCount || 0;
        const hasDesc    = !!(d.description?.trim());
        const createdBy  = d.createdByName  || 'Sin propietario';
        const modifiedBy = d.modifiedByName || 'Sin propietario';

        addDrillRow('de_total', [d.name, d.key, folder, rows, fields, d.isSendable?'Sí':'No', d.isTestable?'Sí':'No', d.description||'---', createdBy]);

        folderCounts[folder] = (folderCounts[folder] || 0) + 1;
        totalFields += fields;

        if (!hasDesc) {
            noDescCount++;
            addDrillRow('de_no_desc', [d.name, d.key, folder, createdBy, modifiedBy]);
            if (!noDescByUser[createdBy]) noDescByUser[createdBy] = [];
            noDescByUser[createdBy].push([d.name, d.key, folder]);
        }

        if (d.isSendable) { sendableCount++; addDrillRow('de_sendable', [d.name, d.key, folder, rows]); }
        if (d.isTestable) { testableCount++; addDrillRow('de_testable', [d.name, d.key, folder, rows]); }

        if (rows > 1000000) { over1MCount++; addDrillRow('de_over1m', [d.name, d.key, folder, rows.toLocaleString('es-ES')]); }
        if (rows === 0) { emptyCount++; addDrillRow('de_empty', [d.name, d.key, folder, createdBy]); }

        // DEs con nombre de prueba/test (case-insensitive, cualquier posición)
        const TEST_PATTERNS = /test|prueba/i;
        if (TEST_PATTERNS.test(d.name)) {
            testNameCount++;
            addDrillRow('de_test_name', [d.name, d.key, folder, rows, createdBy]);
        }

        // Data Retention
        const ret = d.dataRetentionProperties;
        if (ret) {
            const hasRetention = ret.isDeleteAtEndOfRetentionPeriod || ret.isRowBasedRetention;
            if (hasRetention) {
                retentionCount++;
                const retType = ret.isRowBasedRetention ? 'Por fila (Row-based)' : 'Al final del período';
                retentionTypes[retType] = (retentionTypes[retType] || 0) + 1;
                addDrillRow('de_retention', [d.name, d.key, retType, ret.isDeleteAtEndOfRetentionPeriod?'Sí':'No', ret.isResetRetentionPeriodOnImport?'Sí':'No']);
            }
        }

        // Buckets de campos
        if      (fields <= 10) fieldBuckets['1-10']++;
        else if (fields <= 25) fieldBuckets['11-25']++;
        else if (fields <= 50) fieldBuckets['26-50']++;
        else                   fieldBuckets['51+']++;
    });

    // Carpetas con más de 10 DEs
    const bigFolders = Object.entries(folderCounts)
        .filter(([, n]) => n > 15)
        .sort((a, b) => b[1] - a[1]);

    registerDrill('de_big_folders', 'Carpetas con más de 15 DEs', ['Carpeta', 'Nº DEs']);
    bigFolders.forEach(([folder, n]) => {
        addDrillRow('de_big_folders', [folder, n]);
        // Generar key y título dinámicos
        const dKeyF = `de_folder_${folder.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(dKeyF, `DEs en: ${folder}`, ['Nombre', 'Key', 'Filas', 'Campos', 'Descripción']);
        ownDes.filter(d => (d.folderPath || 'Sin carpeta') === folder)
              .forEach(d => addDrillRow(dKeyF, [d.name, d.key, d.rowCount||0, d.fieldCount||0, d.description||'---']));
    });

    // Drills por propietario sin descripción
    Object.entries(noDescByUser).forEach(([owner, items]) => {
        // Generar key y título dinámicos
        const dKey = `de_no_desc_${owner.replace(/[^a-z0-9]/gi, '')}`;
        registerDrill(dKey, `Sin descripción — ${owner}`, ['Nombre', 'Key', 'Carpeta']);
        items.forEach(row => addDrillRow(dKey, row));
    });

    const noDescPct   = total > 0 ? Math.round((noDescCount / total) * 100) : 0;
    const avgFields   = total > 0 ? Math.round(totalFields / total) : 0;

    const callouts = [];
    if (noDescPct > 50) callouts.push(buildCallout('warning', 'Mayoría de DEs sin descripción',
        `El ${noDescPct}% de las Data Extensions no tienen descripción. Dificulta el mantenimiento y la búsqueda.`));
    if (over1MCount > 0) callouts.push(buildCallout('info', `${over1MCount} DEs superan 1M de registros`,
        'Revisar si tienen política de retención activa y si el volumen está justificado por el caso de uso.'));
    if (bigFolders.length > 0) callouts.push(buildCallout('info', 'Carpetas con gran volumen de DEs',
        `${bigFolders.length} carpeta(s) tienen más de 15 Data Extensions. Valorar si la estructura de carpetas es la adecuada.`));

    // Asignar el valor del drillKey dinámico para la tabla
    const noDescUserBars = Object.entries(noDescByUser)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([owner, items]) => ({ label: owner, value: items.length, total: noDescCount || 1, drillKey: `de_no_desc_${owner.replace(/[^a-z0-9]/gi, '')}` }));

    // Asignar el valor del drillKey dinámico para las carpetas
    const bigFolderBars = bigFolders.map(([folder, n]) => ({
        label: folder, value: n, total: total,
        drillKey: `de_folder_${folder.replace(/[^a-z0-9]/gi, '')}`
    }));

    const kpis = [
        { value: total,          label: 'Total DEs (propias)', color: '#69a3db', drillKey: 'de_total' },
        { value: noDescCount,    label: 'Sin descripción',     color: noDescPct > 50 ? '#e74c3c' : '#f39c12', drillKey: 'de_no_desc' },
        { value: sendableCount,  label: 'Sendable',            color: '#27ae60', drillKey: 'de_sendable' },
        { value: testableCount,  label: 'Testable',            color: '#3498db', drillKey: 'de_testable' },
        { value: retentionCount, label: 'Con Retención',       color: '#9b59b6', drillKey: 'de_retention' },
        { value: over1MCount,    label: '>1M registros',       color: over1MCount > 0 ? '#e74c3c' : '#bdc3c7', drillKey: 'de_over1m' },
        { value: emptyCount,     label: 'Sin registros',       color: emptyCount > total * 0.3 ? '#f39c12' : '#bdc3c7', drillKey: 'de_empty' },
        { value: testNameCount,  label: 'Nombre de prueba',    color: testNameCount > 0 ? '#e67e22' : '#bdc3c7', drillKey: 'de_test_name' },
    ];

    const cards = [
        { title: 'Descripción', help: 'Presencia de descripción en las Data Extensions propias.', bars: [
            { label: 'Con descripción', value: total - noDescCount, total, color: '#27ae60', drillKey: 'de_total' },
            { label: 'Sin descripción', value: noDescCount,         total, color: '#e74c3c', drillKey: 'de_no_desc' },
        ]},
        { title: 'Sin descripción — por propietario', help: 'Usuarios que más DEs sin documentar han creado.', bars: noDescUserBars.length > 0 ? noDescUserBars : [{ label: 'Todas documentadas', value: 0, total: 1, color: '#27ae60' }] },
        { title: 'Sendable y Testable', help: 'DEs configuradas para envío o pruebas.', bars: [
            { label: 'Sendable', value: sendableCount, total, color: '#27ae60', drillKey: 'de_sendable' },
            { label: 'Testable', value: testableCount, total, color: '#3498db', drillKey: 'de_testable' },
        ]},
        { title: 'Data Retention', help: 'DEs con política de retención de datos activa.', bars: [
            { label: 'Con retención',   value: retentionCount,         total, color: '#9b59b6', drillKey: 'de_retention' },
            { label: 'Sin retención',   value: total - retentionCount, total, color: '#bdc3c7' },
            ...Object.entries(retentionTypes).map(([label, value]) => ({ label, value, total: retentionCount || 1 })),
        ]},
        // Faltaba texto en "help:" y la variable label en el map.
        { title: 'DEs sin registros (vacías)', help: 'Data Extensions que actualmente no tienen ningún registro. Pueden ser de uso esporádico o candidatas a revisión.', bars: [
            { label: 'Con registros',    value: total - emptyCount, total, color: '#27ae60' },
            { label: 'Sin registros',    value: emptyCount,         total, color: '#f39c12', drillKey: 'de_empty' },
        ]},
        { title: 'DEs con nombre de prueba/test', help: 'DEs que contienen "test" o "prueba" en el nombre (sin distinción de mayúsculas). Candidatas a revisión o limpieza.', bars: [
            { label: 'Nombre normal',       value: total - testNameCount, total, color: '#27ae60' },
            { label: 'Contiene test/prueba',value: testNameCount,         total, color: '#e67e22', drillKey: 'de_test_name' },
        ]},
        { title: 'Carpetas con más de 15 DEs', help: 'Carpetas que concentran muchas DEs. Haz clic para ver su contenido.', wide: true, bars:
            bigFolderBars.length > 0 ? bigFolderBars : [{ label: 'Ninguna supera el umbral', value: 0, total: 1, color: '#27ae60' }]
        },
    ];

    registerPdfData('de', kpis, cards, callouts.map(c => parsePdfCallout(c)));
    container.innerHTML = buildTabWrapper(
        buildKpiRow(kpis) + callouts.join('') +
        buildGrid(cards.map(c => buildMetricCard(c.title, c.help, c.bars, { wide: c.wide })))
    );
}

// ==========================================
// HELPERS VISUALES
// ==========================================

function buildStatsBanner(timeStr, calls) {
    return `<div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:20px; padding:4px 12px; display:flex; gap:12px; align-items:center; font-size:0.75em; color:#475569; box-shadow:0 1px 2px rgba(0,0,0,0.05);" title="El escaneo profundo consume llamadas adicionales para garantizar precisión.">
        <div>Tiempo: <strong>${timeStr}</strong></div>
        <div style="width:1px; height:12px; background:#cbd5e1;"></div>
        <div>Llamadas API: <strong>${calls}</strong></div>
    </div>`;
}

function buildTabWrapper(content) {
    return `<div style="padding:20px 24px;">${content}</div>`;
}

function buildKpiRow(items) {
    const cards = items.map(({ value, label, color = '#69a3db', drillKey }) => {
        const drillAttr = drillKey ? `data-drill="${drillKey}" class="drillable" title="Ver detalle"` : '';
        return `<div ${drillAttr} style="background:#fff; border-radius:10px; padding:14px 16px; text-align:center; box-shadow:0 1px 4px rgba(0,0,0,0.08); border-top:3px solid ${color}; min-width:90px; flex:1;">
            <div style="font-size:2em; font-weight:800; color:${color}; line-height:1.1;">${value}</div>
            <div style="font-size:0.71em; color:#777; margin-top:5px; font-weight:500; text-transform:uppercase; letter-spacing:0.03em;">${label}</div>
        </div>`;
    }).join('');
    return `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px;">${cards}</div>`;
}

function buildCallout(type, title, message) {
    const s = { danger:{bg:'#fdf2f2',border:'#e74c3c'}, warning:{bg:'#fef9e7',border:'#f39c12'}, info:{bg:'#eaf4fb',border:'#3498db'}, success:{bg:'#eafaf1',border:'#27ae60'} }[type] || { bg:'#eaf4fb', border:'#3498db' };
    return `<div style="background:${s.bg}; border-left:4px solid ${s.border}; border-radius:6px; padding:11px 15px; margin-bottom:12px; font-size:0.87em; line-height:1.55; color:#2c3e50;"><span style="font-weight:700;">${title}</span><br>${message}</div>`;
}

function buildSectionHeader(text) {
    return `<div style="font-size:0.82em; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#69a3db; border-bottom:1px solid #d5e8f7; padding-bottom:6px; margin:22px 0 14px 0;">${text}</div>`;
}

function buildGrid(cards) {
    // Inline style en lugar de clase CSS: garantiza 2 columnas independientemente
    // de si el CSS externo carga correctamente en este contexto de Electron.
    return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">${cards.join('')}</div>`;
}

function buildMetricCard(title, help, bars, options = {}) {
    const barsHtml = (bars || []).map(({ label, value, total, color, drillKey }) => {
        const resolvedColor = color || resolveBarColor(label);
        const pct       = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
        const drillAttr = drillKey ? `data-drill="${drillKey}" class="drillable-bar" title="Ver detalle"` : '';
        return `<div ${drillAttr} style="display:flex; align-items:center; gap:8px; margin-bottom:9px; font-size:0.86em; padding:4px;">
            <div style="flex:0 0 190px; color:#444; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:190px;" title="${label}">${label}</div>
            <div style="flex:1; background:#f0f0f0; border-radius:20px; height:9px; overflow:hidden; min-width:40px;">
                <div style="background:${resolvedColor}; width:${pct}%; height:100%; border-radius:20px;"></div>
            </div>
            <div style="flex:0 0 32px; font-weight:700; color:${resolvedColor}; text-align:right;">${value}</div>
            <div style="flex:0 0 34px; color:#aaa; text-align:right; font-size:0.9em;">${pct}%</div>
        </div>`;
    }).join('');

    // wide: ocupa las 2 columnas del grid; normal: ocupa 1 columna
    const gridSpan = options.wide ? 'grid-column:1 / -1;' : '';
    return `<div style="background:#fff; border-radius:10px; padding:16px 18px; box-shadow:0 1px 3px rgba(0,0,0,0.07); ${gridSpan}">
        <div style="font-weight:700; font-size:0.93em; color:#2c3e50; margin-bottom:4px;">${title}</div>
        <div style="font-size:0.77em; color:#aaa; margin-bottom:14px; line-height:1.4;">${help}</div>
        ${barsHtml || '<div style="color:#ccc; font-size:0.85em; font-style:italic;">Sin datos disponibles.</div>'}
    </div>`;
}

function buildLoadingPlaceholder() {
    return `<div style="padding:40px; text-align:center; color:#bbb;"><div style="font-size:1.8em; margin-bottom:10px;">⏳</div><div style="font-size:0.9em;">Cargando datos del escaneo…</div></div>`;
}

function parsePdfCallout(htmlString) {
    const titleMatch = htmlString.match(/<span style="font-weight:700;">(.*?)<\/span>/);
    const msgMatch = htmlString.match(/<br>(.*?)<\/div>/s);
    const typeMatch = htmlString.match(/border-left:4px solid (#[a-f0-9]+)/i);
    return {
        title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '') : '',
        message: msgMatch ? msgMatch[1].replace(/<[^>]+>/g, '').trim() : '',
        color: typeMatch ? typeMatch[1] : '#3498db'
    };
}

function resolveBarColor(label) {
    const l = (label || '').toLowerCase();
    if (/^con |activos? con login|activos$|en uso|exclusiv|publicad|published|scheduled|^login en \d{4}/.test(l)) return '#27ae60';
    if (/^sin |huérfano|sin historial|stopped|inactiv|>.*mes/.test(l))    return '#e74c3c';
    if (/anterior|antiguo|paused|compartid|draft|solo lógica/.test(l))    return '#f39c12';
    if (/salesforce|crm/.test(l))   return '#9b59b6';
    if (/api|integrac/.test(l))     return '#8e44ad';
    if (/email/.test(l))            return '#2980b9';
    if (/sms/.test(l))              return '#16a085';
    if (/push|in-app/.test(l))      return '#d35400';
    if (/whatsapp/.test(l))         return '#1abc9c';
    if (/running/.test(l))          return '#3498db';
    if (/sql|query/.test(l))        return '#2980b9';
    if (/script|ssjs/.test(l))      return '#8e44ad';
    if (/import/.test(l))           return '#3498db';
    if (/export|extract/.test(l))   return '#16a085';
    if (/journey/.test(l))          return '#9b59b6';
    return '#69a3db';
}

