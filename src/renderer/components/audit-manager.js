// Fichero: src/renderer/components/audit-manager.js
// Descripción: Módulo de auditoría técnica de la instancia de Marketing Cloud.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';

let getAuthenticatedConfig;

// Objeto global para almacenar los detalles de cada métrica clicable
let auditDrillData = {};
let currentDrillKey = null; 
let currentAuditApiCalls = 0; 

// Mapa de tipos de actividad
const ACTIVITY_TYPE_MAP = {
    42:   'Email',
    43:   'Importación (Import)',
    45:   'Group',
    53:   'File Transfer',
    73:   'Data Extract / Exportación',
    84:   'Report',
    300:  'SQL Query',
    303:  'Filter',
    423:  'Script (SSJS)',
    425:  'ELT (Data Transform)',
    427:  'Build Audience',
    467:  'Wait',
    724:  'Mobile List Refresh',
    725:  'MobileConnect',
    726:  'Mobile Import',
    733:  'Interaction Studio',
    736:  'Mobile Push',
    749:  'IS Event',
    756:  'IS Date Event',
    771:  'SF Send',
    783:  'GroupConnect',
    952:  'Journey Entry (Audience)',
    1000: 'Verification',
    1010: 'Thunderhead',
    1101: 'IS Decision',
    1701: 'Einstein Rec',
};

const TAB_IDS = ['users', 'autos', 'journeys', 'cp', 'sm'];

// ==========================================
// INIT + VIEW
// ==========================================

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    const btn = document.getElementById('runAuditBtn');
    if (btn) btn.addEventListener('click', handleRunAuditClick);

    // Event listener global para el Drill-down
    const section = document.getElementById('auditoria-section');
    if (section) {
        section.addEventListener('click', (e) => {
            const drillTarget = e.target.closest('[data-drill]');
            if (drillTarget) {
                const key = drillTarget.getAttribute('data-drill');
                showDrillDownModal(key);
            }
        });
    }

    const downloadBtn = document.getElementById('audit-drill-download');
    if(downloadBtn) downloadBtn.addEventListener('click', downloadDrillCsv);

    const closeBtn = document.getElementById('audit-drill-close');
    const modal = document.getElementById('audit-drill-modal');
    if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
    if (modal) modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}

async function handleRunAuditClick() {
    const optionsPanel = document.getElementById('audit-options');
    const dashboard = document.getElementById('audit-dashboard');
    
    if (optionsPanel.style.display === 'none') {
        document.getElementById('audit-cache-banner')?.remove();
        document.getElementById('audit-stats-container').innerHTML = ''; // Limpiar banner de arriba
        dashboard.style.display = 'none';
        optionsPanel.style.display = '';
        const btn = document.getElementById('runAuditBtn');
        if (btn) btn.innerHTML = '🔍 Iniciar Escaneo de Instancia';
    } else {
        await runAudit();
    }
}

export async function view() {
    const clientName = elements.clientNameInput?.value?.trim();

    document.getElementById('audit-options').style.display   = '';
    document.getElementById('audit-dashboard').style.display = 'none';
    const topBtn = document.getElementById('runAuditBtn');
    if (topBtn) topBtn.innerHTML = '🔍 Iniciar Escaneo de Instancia';
    
    document.getElementById('audit-cache-banner-options')?.remove(); 
    document.getElementById('audit-cache-banner')?.remove();
    document.getElementById('audit-stats-container').innerHTML = ''; // Limpiar banner de arriba

    if (!clientName) return;

    try {
        const result = await window.electronAPI.loadAuditCache(clientName);
        if (result?.success && result.data) {
            showCacheBannerInOptions(result.data);
        }
    } catch (e) {}
}

function showCacheBannerInOptions(cached) {
    const optionsPanel = document.getElementById('audit-options');
    const savedDate = cached.savedAt ? new Date(cached.savedAt).toLocaleString('es-ES') : 'fecha desconocida';
    
    const banner = document.createElement('div');
    banner.id = 'audit-cache-banner-options';
    banner.style.cssText = `
        background:#eafaf1; border-left:4px solid #27ae60; padding:14px 18px;
        font-size:0.95em; color:#2c3e50; display:flex; align-items:center;
        justify-content:space-between; gap:15px; margin-bottom: 25px; border-radius: 6px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    `;
    banner.innerHTML = `
        <span>✅ <strong>Datos guardados disponibles:</strong> Tienes una auditoría técnica realizada el <b>${savedDate}</b>.</span>
        <button id="view-cached-audit-btn" style="
            background:#27ae60; color:#fff; border:none; border-radius:6px;
            padding:8px 16px; font-size:0.9em; cursor:pointer; font-weight:bold;
            transition: background 0.2s; white-space: nowrap;
        " onmouseover="this.style.background='#219653'" onmouseout="this.style.background='#27ae60'">
            👁️ Ver resultados guardados
        </button>
    `;
    
    optionsPanel.insertBefore(banner, optionsPanel.firstChild);
    
    document.getElementById('view-cached-audit-btn').addEventListener('click', () => {
        renderCachedAudit(cached);
    });
}

function renderCachedAudit(cached) {
    auditDrillData = cached.drillData || {}; 
    
    const dashboard = document.getElementById('audit-dashboard');
    document.getElementById('audit-options').style.display = 'none';
    dashboard.style.display       = 'flex';
    dashboard.style.flexDirection = 'column';

    const topBtn = document.getElementById('runAuditBtn');
    if (topBtn) topBtn.innerHTML = '⚙️ Opciones de Escaneo';

    TAB_IDS.forEach(id => {
        const el = document.getElementById(`audit-tab-${id}`);
        if (el && cached.tabs?.[id]) el.innerHTML = cached.tabs[id];
    });

    document.getElementById('audit-cache-banner')?.remove();
    document.getElementById('audit-stats-container').innerHTML = '';

    // Renderizar Píldora de Stats arriba a la derecha si existe
    if (cached.stats) {
        document.getElementById('audit-stats-container').innerHTML = buildStatsBanner(cached.stats.timeStr, cached.stats.calls);
    }

    const savedDate = cached.savedAt ? new Date(cached.savedAt).toLocaleString('es-ES') : 'fecha desconocida';
    const banner = document.createElement('div');
    banner.id = 'audit-cache-banner';
    banner.style.cssText = `
        background:#eaf4fb; border-left:4px solid #3498db; padding:9px 16px;
        font-size:0.83em; color:#2c3e50; display:flex; align-items:center;
        justify-content:space-between; gap:12px; margin-bottom: 15px;
    `;
    banner.innerHTML = `
        <span>📂 Mostrando resultados de la auditoría del <b>${savedDate}</b>. Haz clic en las métricas resaltadas para ver el detalle.</span>
        <button id="audit-relaunch-btn" style="
            background:#3498db; color:#fff; border:none; border-radius:6px;
            padding:5px 14px; font-size:0.9em; cursor:pointer; white-space:nowrap;
        ">⚙️ Cambiar opciones de escaneo</button>
    `;
    dashboard.insertBefore(banner, dashboard.firstChild);
    
    document.getElementById('audit-relaunch-btn').addEventListener('click', () => {
        document.getElementById('audit-cache-banner')?.remove();
        document.getElementById('audit-stats-container').innerHTML = '';
        dashboard.style.display = 'none';
        document.getElementById('audit-options').style.display = '';
        if (topBtn) topBtn.innerHTML = '🔍 Iniciar Escaneo de Instancia';
    });
}

// ==========================================
// DRILL-DOWN LOGIC
// ==========================================

function initDrillData() {
    auditDrillData = {};
}

function registerDrill(key, title, columns) {
    if (!auditDrillData[key]) {
        auditDrillData[key] = { title, columns, rows: [] };
    }
}

function addDrillRow(key, rowArray) {
    if (auditDrillData[key]) {
        auditDrillData[key].rows.push(rowArray);
    }
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

function downloadDrillCsv() {
    if(!currentDrillKey || !auditDrillData[currentDrillKey]) return;
    const data = auditDrillData[currentDrillKey];
    
    const BOM = "\uFEFF";
    let csv = data.columns.map(c => `"${c}"`).join(',') + '\n';
    
    data.rows.forEach(row => {
        csv += row.map(cell => {
            const cleanCell = String(cell || '').replace(/"/g, '""');
            return `"${cleanCell}"`;
        }).join(',') + '\n';
    });
    
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Auditoria_${currentDrillKey}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function formatDate(ds) {
    if (!ds || ds.startsWith('0001')) return '---';
    const d = new Date(ds);
    if (isNaN(d.getTime())) return '---';
    const p = n => n.toString().padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ==========================================
// ESCANEO PRINCIPAL
// ==========================================

async function runAudit() {
    const isDetailedAutos    = document.getElementById('audit-opt-autos').checked;
    const isDetailedJourneys = document.getElementById('audit-opt-journeys').checked;

    if (!await ui.showCustomConfirm('El escaneo va a comenzar. No cierres la aplicación durante el proceso.')) return;

    document.getElementById('audit-cache-banner-options')?.remove();
    document.getElementById('audit-cache-banner')?.remove();
    document.getElementById('audit-stats-container').innerHTML = ''; // Limpiar banner de arriba
    document.getElementById('audit-options').style.display = 'none';
    
    const topBtn = document.getElementById('runAuditBtn');
    if (topBtn) topBtn.innerHTML = '⚙️ Opciones de Escaneo';

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

        ui.blockUI('1/5: Escaneando Usuarios…');
        await auditUsers(apiConfig);
        renderedTabs.users = document.getElementById('audit-tab-users').innerHTML;

        ui.blockUI('2/5: Escaneando Automatismos…');
        await auditAutomations(apiConfig, isDetailedAutos);
        renderedTabs.autos = document.getElementById('audit-tab-autos').innerHTML;

        ui.blockUI('3/5: Escaneando Journeys…');
        await auditJourneys(apiConfig, isDetailedJourneys);
        renderedTabs.journeys = document.getElementById('audit-tab-journeys').innerHTML;

        ui.blockUI('4/5: Escaneando Cloud Pages…');
        await auditCloudPages(apiConfig);
        renderedTabs.cp = document.getElementById('audit-tab-cp').innerHTML;

        ui.blockUI('5/5: Escaneando Send Management…');
        await auditSendManagement(apiConfig);
        renderedTabs.sm = document.getElementById('audit-tab-sm').innerHTML;

        // Cálculos de tiempo
        const durationMs = Date.now() - startTime;
        const min = Math.floor(durationMs / 60000);
        const sec = Math.floor((durationMs % 60000) / 1000);
        const timeStr = min > 0 ? `${min} min ${sec} s` : `${sec} s`;

        const stats = { timeStr, calls: currentAuditApiCalls };

        // Mostrar Stats Banner compacto arriba a la derecha
        document.getElementById('audit-stats-container').innerHTML = buildStatsBanner(timeStr, currentAuditApiCalls);

        const clientName = elements.clientNameInput?.value?.trim();
        if (clientName) {
            await window.electronAPI.saveAuditCache({
                clientName,
                auditData: {
                    savedAt: new Date().toISOString(),
                    options: { autos: isDetailedAutos, journeys: isDetailedJourneys },
                    tabs:    renderedTabs,
                    drillData: auditDrillData, 
                    stats:   stats
                }
            });
        }

        ui.showCustomAlert('Auditoría finalizada con éxito. Haz clic en las métricas para ver su detalle y descargar en CSV.');

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

    let activeCount = 0;
    let inactiveCount = 0;
    let apiCheckCount = 0;
    let inactiveOver3Months = 0; 
    let activeUsersForLogin = 0;

    const loginByYear = {};
    for (let y = currentYear; y >= currentYear - 3; y--) {
        loginByYear[String(y)] = 0;
        registerDrill(`users_login_${y}`, `Login en el año ${y}`, ['Nombre', 'Usuario', 'Último Login']);
    }
    loginByYear['Más antiguos'] = 0;
    const roles = {};

    registerDrill('users_total', 'Total Usuarios', ['Nombre', 'Usuario', 'Estado', 'Último Login']);
    registerDrill('users_active', 'Usuarios Activos', ['Nombre', 'Usuario', 'Último Login']);
    registerDrill('users_inactive', 'Usuarios Inactivos', ['Nombre', 'Usuario', 'Último Login']);
    registerDrill('users_api', 'Usuarios con check API', ['Nombre', 'Usuario', 'Estado']);
    registerDrill('users_api_no', 'Usuarios SIN check API', ['Nombre', 'Usuario', 'Estado']);
    registerDrill('users_inactive_3m', 'Usuarios sin actividad reciente (>3m)', ['Nombre', 'Usuario', 'Último Login']);
    registerDrill('users_login_old', 'Login en años anteriores', ['Nombre', 'Usuario', 'Último Login']);
    registerDrill('users_login_never', 'Sin registro de login', ['Nombre', 'Usuario', 'Último Login']);

    users.forEach(u => {
        const uLogin = formatDate(u.lastLogin);
        addDrillRow('users_total', [u.name, u.userName, u.isActive ? 'Activo' : 'Inactivo', uLogin]);

        if (u.isActive) {
            activeCount++;
            activeUsersForLogin++;
            addDrillRow('users_active', [u.name, u.userName, uLogin]);

            if (!u.lastLogin || u.lastLogin.startsWith('0001')) {
                inactiveOver3Months++;
                addDrillRow('users_inactive_3m', [u.name, u.userName, 'Nunca / Sin registro']);
                addDrillRow('users_login_never', [u.name, u.userName, '---']);
            } else {
                const loginDate = new Date(u.lastLogin);
                const loginYear = loginDate.getFullYear();

                if (loginDate < threeMonthsAgo) {
                    inactiveOver3Months++;
                    addDrillRow('users_inactive_3m', [u.name, u.userName, uLogin]);
                }

                const yearKey = String(loginYear);
                if (loginByYear.hasOwnProperty(yearKey)) {
                    loginByYear[yearKey]++;
                    addDrillRow(`users_login_${yearKey}`, [u.name, u.userName, uLogin]);
                } else {
                    loginByYear['Más antiguos']++;
                    addDrillRow('users_login_old', [u.name, u.userName, uLogin]);
                }
            }
        } else {
            inactiveCount++;
            addDrillRow('users_inactive', [u.name, u.userName, uLogin]);
        }

        if (u.isApi) {
            apiCheckCount++;
            addDrillRow('users_api', [u.name, u.userName, u.isActive ? 'Activo' : 'Inactivo']);
        } else {
            addDrillRow('users_api_no', [u.name, u.userName, u.isActive ? 'Activo' : 'Inactivo']);
        }

        (u.roles || []).forEach(r => { 
            roles[r.name] = (roles[r.name] || 0) + 1; 
            const dKey = `users_role_${r.name.replace(/[^a-z0-9]/gi,'')}`;
            registerDrill(dKey, `Usuarios con rol: ${r.name}`, ['Nombre', 'Usuario', 'Estado']);
            addDrillRow(dKey, [u.name, u.userName, u.isActive ? 'Activo' : 'Inactivo']);
        });
    });

    const inactiveOver3Pct = activeUsersForLogin > 0 ? Math.round((inactiveOver3Months / activeUsersForLogin) * 100) : 0;
    const inactivePct = total > 0 ? Math.round((inactiveCount / total) * 100) : 0;

    const callouts = [];
    if (inactiveOver3Pct > 20) callouts.push(buildCallout('danger', '⚠️ Cuentas activas sin actividad', `El ${inactiveOver3Pct}% de los activos llevan >3 meses sin conectarse.`));
    if (inactivePct > 40) callouts.push(buildCallout('warning', '⚠️ Alta proporción de inactivos', `El ${inactivePct}% de las cuentas están deshabilitadas.`));

    const loginBars = Object.entries(loginByYear).map(([label, value]) => {
        const color = label === String(currentYear) ? '#27ae60' : label === String(currentYear - 1) ? '#2980b9' : label === String(currentYear - 2) ? '#f39c12' : label === String(currentYear - 3) ? '#e67e22' : '#e74c3c';
        const dKey = label === 'Más antiguos' ? 'users_login_old' : `users_login_${label}`;
        return { label: `Login en ${label === 'Más antiguos' ? 'años anteriores' : label}`, value, total: activeUsersForLogin, color, drillKey: dKey };
    });

    const container = document.getElementById('audit-tab-users');
    container.innerHTML = buildTabWrapper(
        buildKpiRow([
            { value: total,               label: 'Total Usuarios',       color: '#69a3db', drillKey: 'users_total' },
            { value: activeCount,         label: 'Activos',              color: '#27ae60', drillKey: 'users_active' },
            { value: inactiveCount,       label: 'Inactivos',            color: '#bdc3c7', drillKey: 'users_inactive' },
            { value: apiCheckCount,       label: 'Con check "API User"', color: '#9b59b6', drillKey: 'users_api' },
            { value: inactiveOver3Months, label: 'Sin login >3 meses',   color: inactiveOver3Pct > 20 ? '#e74c3c' : '#f39c12', drillKey: 'users_inactive_3m' },
        ]) +
        callouts.join('') +
        buildGrid([
            buildMetricCard('Estado de cuentas', 'Habilitación de acceso sobre el total.', [
                { label: 'Activos',   value: activeCount,   total, color: '#27ae60', drillKey: 'users_active' },
                { label: 'Inactivos', value: inactiveCount, total, color: '#bdc3c7', drillKey: 'users_inactive' },
            ]),
            buildMetricCard('Check "API User"', 'Usuarios con flag API.', [
                { label: 'Con check API', value: apiCheckCount, total, color: '#9b59b6', drillKey: 'users_api' },
                { label: 'Sin check API', value: total - apiCheckCount, total, color: '#3498db', drillKey: 'users_api_no' },
            ]),
            buildMetricCard('Actividad de login (usuarios activos)', `Base: ${activeUsersForLogin} activos.`, loginBars),
            buildMetricCard('Top roles asignados', 'Roles más frecuentes.', Object.entries(roles).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value]) => ({ label, value, total, drillKey: `users_role_${label.replace(/[^a-z0-9]/gi,'')}` }))),
        ])
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
            if (clientName && configs && configs[clientName]) mid = configs[clientName].businessUnit;
        } catch (e) {}
    }

    if (mid) {
        autos = autos.filter(a => !a.name.startsWith(mid));
    }
    
    const ignoredSystemAutos = rawTotalAutos - autos.length;
    const totalAutos = autos.length;
    const currentYear = new Date().getFullYear();

    const status = {};
    const execByYear = {};
    
    for (let y = currentYear; y >= currentYear - 3; y--) {
        execByYear[String(y)] = 0;
        registerDrill(`auto_exec_year_${y}`, `Ejecutados en el año ${y}`, ['Nombre', 'Estado', 'Última Ejecución']);
    }
    execByYear['Más antiguos'] = 0;
    execByYear['Sin historial'] = 0;
    registerDrill('auto_exec_year_old', 'Ejecutados en años anteriores', ['Nombre', 'Estado', 'Última Ejecución']);

    const autoDescriptions = { 'Con descripción': 0, 'Sin descripción': 0 };
    const activityTypeCounts  = {};
    let journeyLaunchingCount = 0;
    let importCountAll        = 0;
    let exportCountAll        = 0;

    const execTypeCounts = {
        'Programado (Schedule)': 0, 'Por evento (Fire Trigger)': 0, 'FileDrop': 0, 'Manual / Sin clasificar': 0
    };

    registerDrill('auto_total', 'Total Automatismos', ['Nombre', 'Estado', 'Última Ejecución']);
    registerDrill('auto_active', 'Activos / Programados', ['Nombre', 'Estado', 'Última Ejecución']);
    registerDrill('auto_stale', 'Sin Historial de Ejecución', ['Nombre', 'Estado']);
    registerDrill('auto_launch_journey', 'Lanzan Journeys', ['Nombre', 'Estado']);
    registerDrill('auto_import', 'Automatismos con Importaciones', ['Nombre', 'Cant. Imports', 'Estado']);
    registerDrill('auto_export', 'Automatismos con Exportaciones', ['Nombre', 'Cant. Exports', 'Estado']);
    registerDrill('auto_desc_yes', 'Automatismos con Descripción', ['Nombre', 'Descripción']);
    registerDrill('auto_desc_no', 'Automatismos sin Descripción', ['Nombre', 'Estado']);

    const actTypeDrill = {};
    const detailedActTypeDrill = {}; 

    autos.forEach(a => {
        status[a.status] = (status[a.status] || 0) + 1;
        
        const dKeyStatus = `auto_status_${a.status}`;
        registerDrill(dKeyStatus, `Automatismos en estado: ${a.status}`, ['Nombre', 'Última Ejecución']);
        addDrillRow(dKeyStatus, [a.name, formatDate(a.lastRunTime)]);
        addDrillRow('auto_total', [a.name, a.status, formatDate(a.lastRunTime)]);

        if (!a.lastRunTime || a.lastRunTime.startsWith('0001')) {
            execByYear['Sin historial']++;
            addDrillRow('auto_stale', [a.name, a.status]);
        } else {
            const yearKey = String(new Date(a.lastRunTime).getFullYear());
            if (execByYear.hasOwnProperty(yearKey)) {
                execByYear[yearKey]++;
                addDrillRow(`auto_exec_year_${yearKey}`, [a.name, a.status, formatDate(a.lastRunTime)]);
            } else {
                execByYear['Más antiguos']++;
                addDrillRow('auto_exec_year_old', [a.name, a.status, formatDate(a.lastRunTime)]);
            }
        }

        if (['Scheduled', 'Ready', 'Running'].includes(a.status)) {
            addDrillRow('auto_active', [a.name, a.status, formatDate(a.lastRunTime)]);
        }

        if (a.description?.trim()) {
            autoDescriptions['Con descripción']++;
            addDrillRow('auto_desc_yes', [a.name, a.description]);
        } else {
            autoDescriptions['Sin descripción']++;
            addDrillRow('auto_desc_no', [a.name, a.status]);
        }

        let launchesJourney = false;
        let importAutoCount = 0;
        let exportAutoCount = 0;

        (a.processes || []).forEach(proc => {
            (proc.workerCounts || []).forEach(wc => {
                const typeLabel = ACTIVITY_TYPE_MAP[wc.objectTypeId] || `Tipo desconocido (${wc.objectTypeId})`;
                const n = wc.count || 1;
                activityTypeCounts[typeLabel] = (activityTypeCounts[typeLabel] || 0) + n;
                
                if (!actTypeDrill[typeLabel]) actTypeDrill[typeLabel] = [];
                actTypeDrill[typeLabel].push([a.name, n]);

                if (wc.objectTypeId === 952) launchesJourney = true;
                if (wc.objectTypeId === 43)  { importCountAll += n; importAutoCount += n; }
                if (wc.objectTypeId === 73)  { exportCountAll += n; exportAutoCount += n; }
            });
        });
        
        if (launchesJourney) {
            journeyLaunchingCount++;
            addDrillRow('auto_launch_journey', [a.name, a.status]);
        }
        if (importAutoCount > 0) addDrillRow('auto_import', [a.name, importAutoCount, a.status]);
        if (exportAutoCount > 0) addDrillRow('auto_export', [a.name, exportAutoCount, a.status]);

        const typeId = a.scheduleTypeId ?? a.schedule?.typeId ?? null;
        let execType = 'Manual / Sin clasificar';
        if (typeId === 1 || (!typeId && a.scheduledTime)) execType = 'Programado (Schedule)';
        else if (typeId === 3 || a.fileTrigger) execType = 'FileDrop';
        else if (typeId === 2 || a.isTriggered) execType = 'Por evento (Fire Trigger)';
        
        execTypeCounts[execType]++;
        const execKey = `auto_exec_${execType.replace(/[^a-z0-9]/gi,'')}`;
        registerDrill(execKey, `Ejecución: ${execType}`, ['Nombre', 'Estado']);
        addDrillRow(execKey, [a.name, a.status]);
    });

    const totalActivityInstances = Object.values(activityTypeCounts).reduce((s, v) => s + v, 0) || 1;
    
    const actTypeBars = Object.entries(activityTypeCounts).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([label, value]) => {
        const dKey = `auto_act_${label.replace(/[^a-z0-9]/gi,'')}`;
        if (!isDetailed) {
            registerDrill(dKey, `Actividades en uso: ${label}`, ['Automatismo Padre', 'Cantidad de este tipo']);
            (actTypeDrill[label] || []).forEach(row => addDrillRow(dKey, row));
        }
        return { label, value, total: totalActivityInstances, drillKey: dKey };
    });

    const execBars = Object.entries(execByYear).map(([label, value]) => {
        const color = label === String(currentYear) ? '#27ae60' : label === String(currentYear - 1) ? '#2980b9' : label === String(currentYear - 2) ? '#f39c12' : label === String(currentYear - 3) ? '#e67e22' : label === 'Sin historial' ? '#e74c3c' : '#bdc3c7';
        const dKey = label === 'Sin historial' ? 'auto_stale' : label === 'Más antiguos' ? 'auto_exec_year_old' : `auto_exec_year_${label}`;
        return { label: label === 'Sin historial' ? 'Sin historial de ejecución' : `Ejecutados en ${label}`, value, total: totalAutos, color, drillKey: dKey };
    });

    let detailedHtml = '';

    if (isDetailed) {
        const notifications   = { 'Con email de alerta': 0, 'Sin email de alerta': 0 };
        const actDescriptions = { 'Con descripción': 0, 'Sin descripción': 0 };
        const sharedMap       = { 'Exclusivas (solo 1 auto)': 0, 'Compartidas (varios autos)': 0 };
        const actOccurrences  = {};
        const alertEmailsData = {}; 
        let totalActivitiesFound = 0;

        registerDrill('auto_alert_yes', 'Con email de alerta por error', ['Automatismo', 'Emails de Aviso']);
        registerDrill('auto_alert_no', 'Sin email de alerta por error', ['Automatismo', 'Motivo']);
        registerDrill('auto_act_desc_yes', 'Actividades documentadas', ['Actividad', 'Tipo', 'Automatismo Padre', 'Descripción']);
        registerDrill('auto_act_desc_no', 'Actividades SIN documentar', ['Actividad', 'Tipo', 'Automatismo Padre']);

        for (let i = 0; i < autos.length; i++) {
            const auto = autos[i];
            ui.blockUI(`2/5: Analizando ${auto.name} (${i + 1}/${autos.length})…`);

            try {
                currentAuditApiCalls += 2; 
                const [detail, notifs] = await Promise.all([
                    mcApiService.fetchAutomationDetailsById(auto.id, apiConfig),
                    mcApiService.fetchAutomationNotifications(auto.id, apiConfig)
                ]);

                const errorWorkers = notifs?.workers?.filter(w => w.notificationType === 'Error') || [];
                if (errorWorkers.length > 0) {
                    let hasValidEmail = false;
                    let emailsFoundInAuto = [];
                    const uniqueEmailsInAuto = new Set();
                    
                    errorWorkers.forEach(w => {
                        const rawEmail = w.definition || w.email || w.toAddress || w.emailAddress || '';
                        if (rawEmail.trim().length > 0) {
                            hasValidEmail = true;
                            emailsFoundInAuto.push(rawEmail.trim());
                        }
                        rawEmail.split(',').forEach(part => {
                            const addr = part.trim().toLowerCase();
                            if (addr.includes('@')) uniqueEmailsInAuto.add(addr);
                        });
                    });
                    
                    if (hasValidEmail) {
                        notifications['Con email de alerta']++;
                        addDrillRow('auto_alert_yes', [auto.name, emailsFoundInAuto.join(', ')]);
                    } else {
                        notifications['Sin email de alerta']++;
                        addDrillRow('auto_alert_no', [auto.name, 'Configurado pero sin email válido']);
                    }

                    uniqueEmailsInAuto.forEach(email => {
                        if (!alertEmailsData[email]) alertEmailsData[email] = { count: 0, usages: [] };
                        alertEmailsData[email].count++;
                        alertEmailsData[email].usages.push(auto.name);
                    });

                } else {
                    notifications['Sin email de alerta']++;
                    addDrillRow('auto_alert_no', [auto.name, 'No hay alertas de error activadas']);
                }

                for (const step of (detail.steps || [])) {
                    for (const act of (step.activities || [])) {
                        totalActivitiesFound++;
                        let hasDesc = !!(act.description?.trim() || act.definition?.description?.trim());
                        let descText = act.description?.trim() || act.definition?.description?.trim() || '';

                        if (!hasDesc && act.activityObjectId) {
                            try {
                                if (act.objectTypeId === 300) {
                                    currentAuditApiCalls++;
                                    const q = await mcApiService.fetchQueryDefinitionDetails(act.activityObjectId, apiConfig);
                                    if (q?.description?.trim()) { hasDesc = true; descText = q.description; }
                                } else if (act.objectTypeId === 423) {
                                    currentAuditApiCalls++;
                                    const s = await mcApiService.fetchScriptDetails(act.activityObjectId, apiConfig);
                                    if (s?.description?.trim()) { hasDesc = true; descText = s.description; }
                                }
                            } catch (e) {}
                        }

                        const typeName = ACTIVITY_TYPE_MAP[act.objectTypeId] || act.objectTypeId;
                        
                        if (!detailedActTypeDrill[typeName]) detailedActTypeDrill[typeName] = [];
                        detailedActTypeDrill[typeName].push([act.name || 'Sin nombre', auto.name]);

                        if (hasDesc) {
                            actDescriptions['Con descripción']++;
                            addDrillRow('auto_act_desc_yes', [act.name, typeName, auto.name, descText]);
                        } else {
                            actDescriptions['Sin descripción']++;
                            addDrillRow('auto_act_desc_no', [act.name, typeName, auto.name]);
                        }

                        const actId = act.activityObjectId || act.id;
                        if (actId) {
                            if (!actOccurrences[actId]) actOccurrences[actId] = { count: 0, name: act.name, type: typeName, usages: [] };
                            actOccurrences[actId].count++;
                            actOccurrences[actId].usages.push(auto.name);
                        }
                    }
                }
            } catch (e) {
                notifications['Sin email de alerta']++;
                addDrillRow('auto_alert_no', [auto.name, 'Error al obtener detalles de la API']);
            }
        }

        Object.keys(detailedActTypeDrill).forEach(label => {
            const dKey = `auto_act_${label.replace(/[^a-z0-9]/gi,'')}`;
            auditDrillData[dKey] = {
                title: `Actividades en uso: ${label}`,
                columns: ['Nombre Actividad', 'Automatismo Padre'],
                rows: detailedActTypeDrill[label]
            };
        });

        registerDrill('auto_act_exclusive', 'Actividades Exclusivas (Solo en 1 Auto)', ['Actividad', 'Tipo', 'Automatismo Padre']);
        registerDrill('auto_act_shared', 'Actividades Compartidas (Reutilizadas)', ['Actividad', 'Tipo', 'Cantidad Autos', 'Encontrada en']);

        Object.values(actOccurrences).forEach(obj => {
            if (obj.count === 1) {
                sharedMap['Exclusivas (solo 1 auto)']++;
                addDrillRow('auto_act_exclusive', [obj.name, obj.type, obj.usages[0]]);
            } else {
                sharedMap['Compartidas (varios autos)']++;
                addDrillRow('auto_act_shared', [obj.name, obj.type, obj.count, obj.usages.join(', ')]);
            }
        });

        Object.keys(alertEmailsData).forEach(email => {
            const safeKey = email.replace(/[^a-z0-9]/gi,'');
            const dKey = `auto_email_${safeKey}`;
            registerDrill(dKey, `Automatismos con alerta a: ${email}`, ['Automatismo']);
            alertEmailsData[email].usages.forEach(autoName => {
                addDrillRow(dKey, [autoName]); 
            });
        });

        const noAlertPct   = totalAutos > 0 ? Math.round((notifications['Sin email de alerta'] / totalAutos) * 100) : 0;
        const noActDescPct = totalActivitiesFound  > 0 ? Math.round((actDescriptions['Sin descripción'] / totalActivitiesFound) * 100) : 0;
        const sharedTotal  = Object.keys(actOccurrences).length;

        const detailedCallouts = [];
        if (noAlertPct > 30) detailedCallouts.push(buildCallout('danger', '🔔 Automatismos sin email de alerta', `El ${noAlertPct}% de *todos* los automatismos no avisan por email al fallar.`));
        if (noActDescPct > 60) detailedCallouts.push(buildCallout('warning', '📝 Actividades sin documentar', `El ${noActDescPct}% de las actividades no tienen descripción.`));

        const alertEmailBars = Object.entries(alertEmailsData).sort((a, b) => b[1].count - a[1].count).map(([email, data]) => {
            const dKey = `auto_email_${email.replace(/[^a-z0-9]/gi,'')}`;
            return { label: email, value: data.count, total: notifications['Con email de alerta'] || 1, drillKey: dKey };
        });

        detailedHtml = detailedCallouts.join('') + buildSectionHeader('Análisis Detallado — Inspección Individual') + buildGrid([
            buildMetricCard('Email de alerta por error', `Base: ${totalAutos} automatismos.`, [
                { label: 'Con email de alerta', value: notifications['Con email de alerta'], total: totalAutos, color: '#27ae60', drillKey: 'auto_alert_yes' },
                { label: 'Sin email de alerta', value: notifications['Sin email de alerta'], total: totalAutos, color: '#e74c3c', drillKey: 'auto_alert_no' },
            ]),
            buildMetricCard('Emails de alertas de error', `Direcciones de email configuradas para recibir avisos.`, alertEmailBars.length > 0 ? alertEmailBars : [{ label: 'Sin alertas', value: 0, total: 1, color: '#bdc3c7' }]),
            buildMetricCard('Descripción del automatismo', `Campo descripción del proceso padre.`, [
                { label: 'Con descripción', value: autoDescriptions['Con descripción'], total: totalAutos, color: '#27ae60', drillKey: 'auto_desc_yes' },
                { label: 'Sin descripción', value: autoDescriptions['Sin descripción'], total: totalAutos, color: '#e74c3c', drillKey: 'auto_desc_no' },
            ]),
            buildMetricCard('Descripción de actividades internas', `Base: ${totalActivitiesFound} actividades identificadas.`, [
                { label: 'Con descripción', value: actDescriptions['Con descripción'], total: totalActivitiesFound, color: '#27ae60', drillKey: 'auto_act_desc_yes' },
                { label: 'Sin descripción', value: actDescriptions['Sin descripción'], total: totalActivitiesFound, color: '#e74c3c', drillKey: 'auto_act_desc_no' },
            ]),
            buildMetricCard('Reutilización de actividades', `Base: ${sharedTotal} actividades únicas.`, [
                { label: 'Exclusivas (solo 1 auto)',   value: sharedMap['Exclusivas (solo 1 auto)'],   total: sharedTotal, color: '#27ae60', drillKey: 'auto_act_exclusive' },
                { label: 'Compartidas (varios autos)', value: sharedMap['Compartidas (varios autos)'], total: sharedTotal, color: '#f39c12', drillKey: 'auto_act_shared' },
            ]),
        ]);
    } else {
        detailedHtml = buildCallout('info', 'ℹ️ Análisis profundo no ejecutado', 'Ejecuta con la opción marcada para obtener más información.');
    }

    const topCallouts = [];
    if (ignoredSystemAutos > 0) topCallouts.push(buildCallout('info', 'ℹ️ Procesos de sistema excluidos', `Se ignoraron <b>${ignoredSystemAutos} automatismos</b> (empiezan por ${mid}).`));
    if (execByYear['Sin historial'] > totalAutos * 0.3) topCallouts.push(buildCallout('warning', '⏱️ Automatismos sin actividad', `Muchos automatismos nunca se han ejecutado.`));

    const container = document.getElementById('audit-tab-autos');
    container.innerHTML = buildTabWrapper(
        buildKpiRow([
            { value: totalAutos,            label: 'Total Automatismos',    color: '#69a3db', drillKey: 'auto_total' },
            { value: autos.filter(a => ['Scheduled', 'Ready', 'Running'].includes(a.status)).length, label: 'Activos / Prog.', color: '#27ae60', drillKey: 'auto_active' },
            { value: execByYear['Sin historial'], label: 'Sin historial',   color: execByYear['Sin historial'] > totalAutos * 0.3 ? '#e74c3c' : '#f39c12', drillKey: 'auto_stale' },
            { value: journeyLaunchingCount, label: 'Lanzan Journeys',       color: '#9b59b6', drillKey: 'auto_launch_journey' },
            { value: importCountAll,        label: 'Acts. Import',          color: '#3498db', drillKey: 'auto_import' },
            { value: exportCountAll,        label: 'Acts. Export',          color: '#16a085', drillKey: 'auto_export' },
        ]) +
        topCallouts.join('') +
        buildGrid([
            buildMetricCard('Distribución por estado', 'Estado en Automation Studio.', Object.entries(status).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, total: totalAutos, drillKey: `auto_status_${label}` }))),
            buildMetricCard('Historial de ejecución', 'Último año registrado.', execBars),
            buildMetricCard('Tipo de ejecución', 'Cómo se dispara cada automatismo.', Object.entries(execTypeCounts).filter(([, v]) => v > 0).map(([label, value]) => {
                const color = label.includes('Schedule') ? '#27ae60' : label.includes('Fire') ? '#9b59b6' : label.includes('File') ? '#16a085' : '#bdc3c7';
                return { label, value, total: totalAutos, color, drillKey: `auto_exec_${label.replace(/[^a-z0-9]/gi,'')}` };
            })),
            buildMetricCard('Actividades en uso', 'Frecuencia general de actividades configuradas.', actTypeBars, { wide: true }),
        ]) + detailedHtml
    );
}

// ==========================================
// 3. JOURNEYS
// ==========================================
async function auditJourneys(apiConfig, isDetailed) {
    currentAuditApiCalls += 2;
    const [eventDefs, journeys] = await Promise.all([
        mcApiService.fetchAllEventDefinitions(apiConfig),
        mcApiService.fetchAllJourneys(apiConfig)
    ]);

    const total    = journeys.length;
    const status   = {};
    const entries  = {};
    const subtypes = {};
    const sfIntegration = { 'Con nodos Salesforce': 0, 'Sin nodos Salesforce': 0 };
    const channels = {};
    const mixJourneys = {}; 

    let withGoals = 0, withoutGoals = 0, withExits = 0, withoutExits = 0, publishedCount = 0, logicOnlyCount = 0;
    
    // Métricas de inactividad
    let activeNoActivity1m = 0, activeNoActivity3m = 0, activeNoActivity6m = 0, activeNoActivity9m = 0, activeNoActivity12m = 0;

    const now = new Date();
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    const nineMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 9, now.getDate());
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());

    // Registros Drill-down
    registerDrill('journey_total', 'Total Journeys', ['Nombre', 'Versión', 'Estado']);
    registerDrill('journey_published', 'Journeys Publicados', ['Nombre', 'Versión', 'Última Modificación']);
    registerDrill('journey_draft', 'Borradores', ['Nombre', 'Versión']);
    registerDrill('journey_stopped', 'Journeys Detenidos', ['Nombre', 'Versión']);
    registerDrill('journey_goal_yes', 'Con Goal Configurado', ['Nombre', 'Estado']);
    registerDrill('journey_goal_no', 'Sin Goal Configurado', ['Nombre', 'Estado']);
    registerDrill('journey_exit_yes', 'Con Criterio de Salida', ['Nombre', 'Estado']);
    registerDrill('journey_exit_no', 'Sin Criterio de Salida', ['Nombre', 'Estado']);
    
    registerDrill('journey_no_act_1m', 'Activos sin actividad > 1 mes', ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_no_act_3m', 'Activos sin actividad > 3 meses', ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_no_act_6m', 'Activos sin actividad > 6 meses', ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_no_act_9m', 'Activos sin actividad > 9 meses', ['Nombre', 'Versión', 'Última Actividad']);
    registerDrill('journey_no_act_12m', 'Activos sin actividad > 12 meses', ['Nombre', 'Versión', 'Última Actividad']);

    const eventMapByGuid = {};
    eventDefs.forEach(e => {
        if (e.eventDefinitionKey?.includes('-')) eventMapByGuid[e.eventDefinitionKey.substring(e.eventDefinitionKey.indexOf('-') + 1).toLowerCase()] = e;
    });

    for (let i = 0; i < journeys.length; i++) {
        const j = journeys[i];
        
        addDrillRow('journey_total', [j.name, j.version, j.status]);

        status[j.status] = (status[j.status] || 0) + 1;
        const dKeyStatus = `journey_status_${j.status}`;
        registerDrill(dKeyStatus, `Journeys: ${j.status}`, ['Nombre', 'Versión']);
        addDrillRow(dKeyStatus, [j.name, j.version]);

        if (j.status === 'Published') { 
            publishedCount++; 
            addDrillRow('journey_published', [j.name, j.version, formatDate(j.modifiedDate)]); 

            let lastActStr = 'Sin registro';
            let lastActDate = null;
            if (j.activity && j.activity.lastContactProcessed && !j.activity.lastContactProcessed.startsWith('0001')) {
                lastActDate = new Date(j.activity.lastContactProcessed);
                lastActStr = formatDate(j.activity.lastContactProcessed);
            }

            if (!lastActDate || lastActDate < oneMonthAgo) { activeNoActivity1m++; addDrillRow('journey_no_act_1m', [j.name, j.version, lastActStr]); }
            if (!lastActDate || lastActDate < threeMonthsAgo) { activeNoActivity3m++; addDrillRow('journey_no_act_3m', [j.name, j.version, lastActStr]); }
            if (!lastActDate || lastActDate < sixMonthsAgo) { activeNoActivity6m++; addDrillRow('journey_no_act_6m', [j.name, j.version, lastActStr]); }
            if (!lastActDate || lastActDate < nineMonthsAgo) { activeNoActivity9m++; addDrillRow('journey_no_act_9m', [j.name, j.version, lastActStr]); }
            if (!lastActDate || lastActDate < twelveMonthsAgo) { activeNoActivity12m++; addDrillRow('journey_no_act_12m', [j.name, j.version, lastActStr]); }
        }
        if (j.status === 'Draft') addDrillRow('journey_draft', [j.name, j.version]);
        if (j.status === 'Stopped') addDrillRow('journey_stopped', [j.name, j.version]);

        const sub = j.definitionType || 'Desconocido';
        subtypes[sub] = (subtypes[sub] || 0) + 1;
        const dKeySub = `journey_sub_${sub}`;
        registerDrill(dKeySub, `Subtipo: ${sub}`, ['Nombre', 'Estado']);
        addDrillRow(dKeySub, [j.name, j.status]);

        let type = 'No asociado / Desconocido';
        if (j.defaults?.email?.[0]) {
            const match = j.defaults.email[0].match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
            if (match && eventMapByGuid[match[0].toLowerCase()]) type = eventMapByGuid[match[0].toLowerCase()].type;
        }
        if (type === 'No asociado / Desconocido' && j.triggers?.[0]?.type) type = j.triggers[0].type;
        entries[type] = (entries[type] || 0) + 1;
        
        const dKeyEntry = `journey_entry_${type.replace(/[^a-z0-9]/gi,'')}`;
        registerDrill(dKeyEntry, `Entrada: ${type}`, ['Nombre', 'Estado']);
        addDrillRow(dKeyEntry, [j.name, j.status]);

        if (Array.isArray(j.goals) && j.goals.length > 0) { withGoals++; addDrillRow('journey_goal_yes', [j.name, j.status]); } 
        else { withoutGoals++; addDrillRow('journey_goal_no', [j.name, j.status]); }

        if (Array.isArray(j.exits) && j.exits.length > 0) { withExits++; addDrillRow('journey_exit_yes', [j.name, j.status]); }
        else { withoutExits++; addDrillRow('journey_exit_no', [j.name, j.status]); }

        if (isDetailed) {
            ui.blockUI(`3/5: Analizando ${j.name} (${i + 1}/${journeys.length})…`);
            let acts = Array.isArray(j.activities) && j.activities.length > 0 ? j.activities : null;
            if (!acts) {
                try {
                    currentAuditApiCalls++;
                    const detail = await mcApiService.fetchJourneyDetailsById(j.id, apiConfig);
                    acts = detail.activities || [];
                } catch (e) { acts = []; }
            }

            const activeChannels = new Set();
            let hasSF = false;

            acts.forEach(a => {
                const t = (a.type || '').toUpperCase();
                if (t === 'EMAILV2') activeChannels.add('Email');
                if (['SMS', 'SMSSYNC'].includes(t)) activeChannels.add('SMS');
                if (t === 'WHATSAPPACTIVITY') activeChannels.add('WhatsApp');
                if (['INAPP','INBOX','MOBILEPUSH','PUSHINBOXACTIVITY','PUSHNOTIFICATIONACTIVITY'].includes(t)) activeChannels.add('Push / In-App');
                if (['SALESFORCESALESCLOUDACTIVITY','SALESCLOUDACTIVITY','OBJECTACTIVITY','CAMPAIGNMEMBER','LEAD'].includes(t)) hasSF = true;
            });

            const combo = Array.from(activeChannels).sort().join(' + ') || 'Solo Lógica (Sin Envío)';
            channels[combo] = (channels[combo] || 0) + 1;
            
            if (!mixJourneys[combo]) mixJourneys[combo] = [];
            mixJourneys[combo].push([j.name, j.status]);

            if (combo === 'Solo Lógica (Sin Envío)') logicOnlyCount++;

            registerDrill('journey_sf_yes', 'Con Nodos Salesforce', ['Nombre', 'Estado']);
            registerDrill('journey_sf_no', 'Sin Nodos Salesforce', ['Nombre', 'Estado']);
            
            if (hasSF) { sfIntegration['Con nodos Salesforce']++; addDrillRow('journey_sf_yes', [j.name, j.status]); }
            else { sfIntegration['Sin nodos Salesforce']++; addDrillRow('journey_sf_no', [j.name, j.status]); }
        }
    }

    const channelBars = Object.entries(channels).sort((a, b) => b[1] - a[1]).map(([label, value]) => {
        const dKey = `journey_mix_${label.replace(/[^a-z0-9]/gi,'')}`;
        registerDrill(dKey, `Mix de canales: ${label}`, ['Nombre', 'Estado']);
        (mixJourneys[label] || []).forEach(row => addDrillRow(dKey, row));
        return { label, value, total, color: label === 'Solo Lógica (Sin Envío)' ? '#95a5a6' : undefined, drillKey: dKey };
    });

    const callouts = [];
    const noGoalPct = total > 0 ? Math.round((withoutGoals / total) * 100) : 0;
    if (noGoalPct > 50) {
        callouts.push(buildCallout('info', 'ℹ️ Mayoría de Journeys sin Goal configurado', `El ${noGoalPct}% de los Journeys no tienen un Goal definido.`));
    }
    
    const activeNoActivityPct = publishedCount > 0 ? Math.round((activeNoActivity1m / publishedCount) * 100) : 0;
    if (activeNoActivityPct > 30) {
        callouts.push(buildCallout('warning', '⚠️ Journeys activos sin uso', `El ${activeNoActivityPct}% de los Journeys publicados no han procesado contactos en el último mes.`));
    }

    if (isDetailed && logicOnlyCount > 0 && Math.round((logicOnlyCount / total) * 100) > 10) {
        callouts.push(buildCallout('info', 'ℹ️ Journeys sin actividades de envío', `${logicOnlyCount} journeys solo contienen nodos de lógica sin ningún canal de envío.`));
    }

    const deepSection = isDetailed ? buildGrid([
        buildMetricCard('Integración con CRM (Salesforce)', `Presencia de nodos de Sales/Service Cloud.`, [
            { label: 'Con nodos Salesforce', value: sfIntegration['Con nodos Salesforce'], total, color: '#9b59b6', drillKey: 'journey_sf_yes' },
            { label: 'Sin nodos Salesforce', value: sfIntegration['Sin nodos Salesforce'], total, color: '#bdc3c7', drillKey: 'journey_sf_no' },
        ]),
        buildMetricCard('Mix multicanal real', 'Combinación de canales detectada en las actividades.', channelBars),
    ]) : buildCallout('info', 'ℹ️ Análisis profundo no ejecutado', 'Activa la opción para ver canales reales y nodos Salesforce.');

    const container = document.getElementById('audit-tab-journeys');
    container.innerHTML = buildTabWrapper(
        buildKpiRow([
            { value: total,          label: 'Total Journeys',         color: '#69a3db', drillKey: 'journey_total' },
            { value: publishedCount, label: 'Publicados',             color: '#27ae60', drillKey: 'journey_published' },
            { value: status['Draft'] || 0, label: 'Borradores',       color: '#95a5a6', drillKey: 'journey_draft' },
            { value: status['Stopped'] || 0, label: 'Detenidos',      color: '#e74c3c', drillKey: 'journey_stopped' },
            { value: withGoals,      label: 'Con Goal',               color: '#27ae60', drillKey: 'journey_goal_yes' },
            { value: withExits,      label: 'Con salida',             color: '#3498db', drillKey: 'journey_exit_yes' },
        ]) +
        callouts.join('') +
        buildGrid([
            buildMetricCard('Estado de publicación', 'Estado operativo.', Object.entries(status).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, total, drillKey: `journey_status_${label}` }))),
            buildMetricCard('Subtipo de Journey', 'Multistep, Quicksend, etc.', Object.entries(subtypes).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, total, drillKey: `journey_sub_${label}` }))),
            buildMetricCard('Tipología del origen de entrada', 'Tipo de Event Definition.', Object.entries(entries).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, total, drillKey: `journey_entry_${label.replace(/[^a-z0-9]/gi,'')}` }))),
            buildMetricCard('Goals y criterios de salida', `Base: ${total} journeys.`, [
                { label: 'Con Goal definido',      value: withGoals,    total, color: '#27ae60', drillKey: 'journey_goal_yes' },
                { label: 'Sin Goal',               value: withoutGoals, total, color: '#e74c3c', drillKey: 'journey_goal_no' },
                { label: 'Con criterio de salida', value: withExits,    total, color: '#27ae60', drillKey: 'journey_exit_yes' },
                { label: 'Sin criterio de salida', value: withoutExits, total, color: '#f39c12', drillKey: 'journey_exit_no' },
            ]),
            buildMetricCard('Actividad reciente (Journeys Publicados)', `Base: ${publishedCount} journeys publicados. Tiempo sin procesar contactos.`, [
                { label: 'Sin actividad > 1 mes', value: activeNoActivity1m, total: publishedCount, color: '#f39c12', drillKey: 'journey_no_act_1m' },
                { label: 'Sin actividad > 3 meses', value: activeNoActivity3m, total: publishedCount, color: '#e67e22', drillKey: 'journey_no_act_3m' },
                { label: 'Sin actividad > 6 meses', value: activeNoActivity6m, total: publishedCount, color: '#e74c3c', drillKey: 'journey_no_act_6m' },
                { label: 'Sin actividad > 9 meses', value: activeNoActivity9m, total: publishedCount, color: '#c0392b', drillKey: 'journey_no_act_9m' },
                { label: 'Sin actividad > 12 meses', value: activeNoActivity12m, total: publishedCount, color: '#922b21', drillKey: 'journey_no_act_12m' },
            ], { wide: true })
        ]) + deepSection
    );
}

// ==========================================
// 4. CLOUD PAGES
// ==========================================
function extractCloudPageUrl(item) {
    try {
        if (item.content?.trim().startsWith('{')) {
            const cJson = JSON.parse(item.content);
            if (cJson.url) return cJson.url;
        }
        if (item.data?.site?.content?.trim().startsWith('{')) {
            const nJson = JSON.parse(item.data.site.content);
            if (nJson.url) return nJson.url;
        }
    } catch (e) {}
    return item.meta?.cloudPages?.url || item.views?.publishedUrl || item.publishedUrl || item.url || '';
}

async function auditCloudPages(apiConfig) {
    currentAuditApiCalls++;
    const pages = await mcApiService.fetchAllCloudPages(apiConfig);
    const total = pages.length;
    const types = {};
    let publishedCount = 0;
    let noDirectUrlCount = 0;

    registerDrill('cp_total', 'Total Cloud Pages', ['Nombre', 'Tipo', 'Estado']);
    registerDrill('cp_published', 'Publicadas', ['Nombre', 'Tipo', 'URL']);
    registerDrill('cp_unpublished', 'Sin publicar', ['Nombre', 'Tipo']);
    registerDrill('cp_no_url', 'Sin URL Directa', ['Nombre', 'Tipo']);

    pages.forEach(p => {
        const typeName = p.assetType?.displayName || 'Otros';
        types[typeName] = (types[typeName] || 0) + 1;
        const dKeyType = `cp_type_${typeName.replace(/[^a-z0-9]/gi,'')}`;
        registerDrill(dKeyType, `Tipo de Asset: ${typeName}`, ['Nombre', 'Publicada']);
        
        const pubDate = p.meta?.cloudPages?.publishDate || p.publishedDate;
        const isPublished = (pubDate && !pubDate.startsWith('0001'));
        if (isPublished) publishedCount++;

        const url = extractCloudPageUrl(p);
        const hasUrl = url && url.startsWith('http');
        if (!hasUrl) noDirectUrlCount++;

        addDrillRow('cp_total', [p.name, typeName, isPublished ? 'Publicada' : 'Borrador']);
        addDrillRow(dKeyType, [p.name, isPublished ? 'Sí' : 'No']);
        if (isPublished) addDrillRow('cp_published', [p.name, typeName, url]); else addDrillRow('cp_unpublished', [p.name, typeName]);
        if (!hasUrl) addDrillRow('cp_no_url', [p.name, typeName]);
    });

    const unpublishedCount = total - publishedCount;

    const container = document.getElementById('audit-tab-cp');
    container.innerHTML = buildTabWrapper(
        buildKpiRow([
            { value: total,            label: 'Total Cloud Pages', color: '#69a3db', drillKey: 'cp_total' },
            { value: publishedCount,   label: 'Publicadas',        color: '#27ae60', drillKey: 'cp_published' },
            { value: unpublishedCount, label: 'Sin publicar',      color: unpublishedCount > total * 0.5 ? '#f39c12' : '#bdc3c7', drillKey: 'cp_unpublished' },
            { value: noDirectUrlCount, label: 'Sin URL directa',   color: noDirectUrlCount > 0 ? '#9b59b6' : '#bdc3c7', drillKey: 'cp_no_url' },
        ]) +
        buildGrid([
            buildMetricCard('Tipos de asset', 'Volumetría por funcionalidad.', Object.entries(types).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, total, drillKey: `cp_type_${label.replace(/[^a-z0-9]/gi,'')}` }))),
            buildMetricCard('Estado de publicación', 'Distribución basada en fecha.', [
                { label: 'Publicadas (con fecha)', value: publishedCount,   total, color: '#27ae60', drillKey: 'cp_published' },
                { label: 'Sin publicar',           value: unpublishedCount, total, color: '#f39c12', drillKey: 'cp_unpublished' },
                { label: 'Sin URL directa',        value: noDirectUrlCount, total, color: '#9b59b6', drillKey: 'cp_no_url' },
            ]),
        ])
    );
}

// ==========================================
// 5. SEND MANAGEMENT
// ==========================================
async function auditSendManagement(apiConfig) {
    currentAuditApiCalls += 2;
    const [sc, sp] = await Promise.all([
        mcApiService.fetchAllSendClassifications(apiConfig),
        mcApiService.fetchAllSenderProfiles(apiConfig)
    ]);

    const usage  = { 'En uso': 0, 'Huérfanos (sin clasificación)': 0 };
    const config = { 'From dinámico (%%=)': 0, 'Con AutoReply': 0, 'Con Forward': 0 };
    const froms  = {};
    const usedKeys = new Set(sc.map(s => s.senderProfile).filter(Boolean));

    registerDrill('sm_sc', 'Send Classifications', ['Nombre', 'Sender Profile', 'Delivery Profile']);
    registerDrill('sm_sp', 'Sender Profiles', ['Nombre', 'From Name', 'From Email']);
    registerDrill('sm_in_use', 'Perfiles en Uso', ['Nombre', 'Asociado a']);
    registerDrill('sm_orphans', 'Perfiles Huérfanos', ['Nombre', 'Key']);
    registerDrill('sm_dynamic', 'From Dinámico', ['Nombre', 'From Name', 'From Email']);
    registerDrill('sm_reply', 'Con AutoReply', ['Nombre', 'From Email']);
    registerDrill('sm_forward', 'Con Forward', ['Nombre', 'Forward To']);

    sc.forEach(s => addDrillRow('sm_sc', [s.name, s.senderProfile, s.deliveryProfile]));

    sp.forEach(p => {
        addDrillRow('sm_sp', [p.name, p.fromName, p.fromAddress]);

        if (usedKeys.has(p.customerKey)) { usage['En uso']++; addDrillRow('sm_in_use', [p.name, sc.find(s=>s.senderProfile===p.customerKey)?.name || 'Sí']); }
        else { usage['Huérfanos (sin clasificación)']++; addDrillRow('sm_orphans', [p.name, p.customerKey]); }

        if ((p.fromAddress || '').includes('%%=') || (p.fromName || '').includes('%%=')) { config['From dinámico (%%=)']++; addDrillRow('sm_dynamic', [p.name, p.fromName, p.fromAddress]); }
        if (p.autoReply) { config['Con AutoReply']++; addDrillRow('sm_reply', [p.name, p.fromAddress]); }
        if (p.autoForwardEmail && p.autoForwardEmail !== '---') { config['Con Forward']++; addDrillRow('sm_forward', [p.name, p.autoForwardEmail]); }
        
        const fromKey = p.fromAddress || 'Sin dirección From';
        froms[fromKey] = (froms[fromKey] || 0) + 1;
        
        const dKeyFrom = `sm_from_${fromKey.replace(/[^a-z0-9]/gi,'')}`;
        registerDrill(dKeyFrom, `Sender Profiles con From: ${fromKey}`, ['Nombre', 'From Name']);
        addDrillRow(dKeyFrom, [p.name, p.fromName]);
    });

    const orphanCount = usage['Huérfanos (sin clasificación)'];

    const fromBars = Object.entries(froms).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ 
        label, value, total: sp.length, drillKey: `sm_from_${label.replace(/[^a-z0-9]/gi,'')}` 
    }));

    const container = document.getElementById('audit-tab-sm');
    container.innerHTML = buildTabWrapper(
        buildKpiRow([
            { value: sc.length,                     label: 'Send Classifications', color: '#69a3db', drillKey: 'sm_sc' },
            { value: sp.length,                     label: 'Sender Profiles',      color: '#3498db', drillKey: 'sm_sp' },
            { value: usage['En uso'],               label: 'Perfiles en uso',      color: '#27ae60', drillKey: 'sm_in_use' },
            { value: orphanCount,                   label: 'Perfiles huérfanos',   color: orphanCount > 0 ? '#e74c3c' : '#bdc3c7', drillKey: 'sm_orphans' },
            { value: config['From dinámico (%%=)'], label: 'From dinámico',        color: '#9b59b6', drillKey: 'sm_dynamic' },
        ]) +
        buildGrid([
            buildMetricCard('Gobernanza de perfiles', 'Identifica si el perfil está vinculado a una Send Classification.', [
                { label: 'En uso',                        value: usage['En uso'],                       total: sp.length, color: '#27ae60', drillKey: 'sm_in_use' },
                { label: 'Huérfanos (sin clasificación)', value: usage['Huérfanos (sin clasificación)'], total: sp.length, color: '#e74c3c', drillKey: 'sm_orphans' },
            ]),
            buildMetricCard('Funcionalidades avanzadas', 'Lógica programática y reglas.', [
                { label: 'From dinámico (%%=)', value: config['From dinámico (%%=)'], total: sp.length, color: '#9b59b6', drillKey: 'sm_dynamic' },
                { label: 'Con AutoReply',       value: config['Con AutoReply'],       total: sp.length, color: '#f39c12', drillKey: 'sm_reply' },
                { label: 'Con Forward',         value: config['Con Forward'],         total: sp.length, color: '#3498db', drillKey: 'sm_forward' },
            ]),
            buildMetricCard('Concentración de direcciones From', `Top 8 direcciones de remitente.`, fromBars, { wide: true }),
        ])
    );
}

// ==========================================
// HELPERS VISUALES (CON DRILL-DOWN Y STATS)
// ==========================================

function buildStatsBanner(timeStr, calls) {
    return `
        <div style="
            background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 20px;
            padding: 4px 12px; display: flex; gap: 12px;
            align-items: center; font-size: 0.75em; color: #475569; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        " title="El escaneo profundo consume llamadas adicionales para garantizar precisión.">
            <div>⏱️ <strong>${timeStr}</strong></div>
            <div style="width: 1px; height: 12px; background: #cbd5e1;"></div>
            <div>📡 <strong>${calls} llamadas</strong></div>
        </div>
    `;
}

function buildTabWrapper(content) {
    return `<div style="padding:20px 24px;">${content}</div>`;
}

function buildKpiRow(items) {
    const cards = items.map(({ value, label, color = '#69a3db', drillKey }) => {
        const drillAttr = drillKey ? `data-drill="${drillKey}" class="drillable" title="Ver detalle"` : '';
        return `
            <div ${drillAttr} style="background:#fff; border-radius:10px; padding:14px 16px; text-align:center;
                        box-shadow:0 1px 4px rgba(0,0,0,0.08); border-top:3px solid ${color};
                        min-width:90px; flex:1;">
                <div style="font-size:2em; font-weight:800; color:${color}; line-height:1.1;">${value}</div>
                <div style="font-size:0.71em; color:#777; margin-top:5px; font-weight:500;
                            text-transform:uppercase; letter-spacing:0.03em;">${label}</div>
            </div>
        `;
    }).join('');
    return `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px;">${cards}</div>`;
}

function buildCallout(type, title, message) {
    const styles = { danger: { bg: '#fdf2f2', border: '#e74c3c' }, warning: { bg: '#fef9e7', border: '#f39c12' }, info: { bg: '#eaf4fb', border: '#3498db' }, success: { bg: '#eafaf1', border: '#27ae60' } };
    const s = styles[type] || styles.info;
    return `<div style="background:${s.bg}; border-left:4px solid ${s.border}; border-radius:6px; padding:11px 15px; margin-bottom:12px; font-size:0.87em; line-height:1.55; color:#2c3e50;"><span style="font-weight:700;">${title}</span><br>${message}</div>`;
}

function buildSectionHeader(text) {
    return `<div style="font-size:0.82em; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#69a3db; border-bottom:1px solid #d5e8f7; padding-bottom:6px; margin:22px 0 14px 0;">${text}</div>`;
}

function buildGrid(cards) {
    return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">${cards.join('')}</div>`;
}

function buildMetricCard(title, help, bars, options = {}) {
    const barsHtml = (bars || []).map(({ label, value, total, color, drillKey }) => {
        const resolvedColor = color || resolveBarColor(label);
        const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
        const drillAttr = drillKey ? `data-drill="${drillKey}" class="drillable-bar" title="Haz clic para ver detalles"` : '';
        return `
            <div ${drillAttr} style="display:flex; align-items:center; gap:8px; margin-bottom:9px; font-size:0.86em; padding:4px;">
                <div style="flex:0 0 190px; color:#444; white-space:nowrap; overflow:hidden;
                            text-overflow:ellipsis; max-width:190px;">${label}</div>
                <div style="flex:1; background:#f0f0f0; border-radius:20px; height:9px; overflow:hidden; min-width:40px;">
                    <div style="background:${resolvedColor}; width:${pct}%; height:100%; border-radius:20px;"></div>
                </div>
                <div style="flex:0 0 32px; font-weight:700; color:${resolvedColor}; text-align:right;">${value}</div>
                <div style="flex:0 0 34px; color:#aaa; text-align:right; font-size:0.9em;">${pct}%</div>
            </div>
        `;
    }).join('');

    const span = options.wide ? 'grid-column:1 / -1' : '';
    return `
        <div style="background:#fff; border-radius:10px; padding:16px 18px; box-shadow:0 1px 3px rgba(0,0,0,0.07); ${span};">
            <div style="font-weight:700; font-size:0.93em; color:#2c3e50; margin-bottom:4px;">${title}</div>
            <div style="font-size:0.77em; color:#aaa; margin-bottom:14px; line-height:1.4;">${help}</div>
            ${barsHtml || '<div style="color:#ccc; font-size:0.85em; font-style:italic;">Sin datos disponibles.</div>'}
        </div>
    `;
}

function buildLoadingPlaceholder() {
    return `<div style="padding:40px; text-align:center; color:#bbb;"><div style="font-size:1.8em; margin-bottom:10px;">⏳</div><div style="font-size:0.9em;">Cargando datos del escaneo…</div></div>`;
}

function resolveBarColor(label) {
    const l = (label || '').toLowerCase();
    if (/^con |activos? con login|activos$|en uso|exclusiv|publicad|published|scheduled|^login en \d{4}/.test(l)) return '#27ae60';
    if (/^sin |huérfano|sin historial|stopped|inactiv|>3 meses|> \d+ mes/.test(l)) return '#e74c3c';
    if (/anterior|antiguo|paused|compartid|draft|solo lógica/.test(l)) return '#f39c12';
    if (/salesforce|crm/.test(l)) return '#9b59b6';
    if (/api|integrac/.test(l)) return '#8e44ad';
    if (/email/.test(l)) return '#2980b9';
    if (/sms/.test(l)) return '#16a085';
    if (/push|in-app/.test(l)) return '#d35400';
    if (/whatsapp/.test(l)) return '#1abc9c';
    if (/running/.test(l)) return '#3498db';
    if (/sql|query/.test(l)) return '#2980b9';
    if (/script|ssjs/.test(l)) return '#8e44ad';
    if (/import/.test(l)) return '#3498db';
    if (/export|extract/.test(l)) return '#16a085';
    if (/journey/.test(l)) return '#9b59b6';
    return '#69a3db';
}