// Fichero: src/renderer/components/audit-manager.js
// Descripción: Orquestador de la auditoría técnica de la instancia de Marketing Cloud.
// La lógica de cada pestaña vive en src/renderer/components/audit/ (un módulo por pestaña),
// el estado compartido (drill/PDF/usuarios) en audit/audit-state.js y los builders de render
// en audit/audit-ui.js. Aquí quedan: init, view, el escaneo completo (runAudit), la carga de
// auditorías cacheadas, el modal de drill-down y las descargas CSV/PDF.

import * as mcApiService from '../api/mc-api-service.js';
import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import { generateAuditPDF } from './audit-pdf-generator.js';
import { AUDIT_PALETTE, buildLoadingPlaceholder } from './audit/audit-ui.js';
import {
    initAuditState, getDrillEntry, getDrillData, setDrillData,
    getPdfData, setPdfData, getApiCalls,
} from './audit/audit-state.js';
import { auditUsers } from './audit/audit-users.js';
import { auditAutomations } from './audit/audit-automations.js';
import { auditJourneys } from './audit/audit-journeys.js';
import { auditCloudPages } from './audit/audit-cloudpages.js';
import { auditSendManagement } from './audit/audit-send-management.js';
import { auditDataExtensions } from './audit/audit-data-extensions.js';
import { auditContent } from './audit/audit-content.js';

let getAuthenticatedConfig;

let currentDrillKey = null;
let currentStats    = null;
let hasAuditResult  = false; // hay un panel de auditoría (recién ejecutado o de caché) al que volver

const TAB_IDS = ['users', 'autos', 'journeys', 'cp', 'sm', 'de', 'content'];

// ==========================================
// INIT + VIEW
// ==========================================

/**
 * Inicializa la vista de auditoría: registra los listeners de botones, del modal de drill-down
 * y el refresco del script de Data Extensions cuando cambia el stack detectado.
 * @param {object} dependencies - Dependencias inyectadas desde app.js ({ getAuthenticatedConfig }).
 */
export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    document.getElementById('runAuditBtn')
        ?.addEventListener('click', handleRunAuditClick);

    document.getElementById('downloadAuditPdfBtn')
        ?.addEventListener('click', () => generateAuditPDF(getPdfData(), currentStats, elements.clientNameInput?.value?.trim()));

    document.getElementById('downloadAuditDetailsBtn')
        ?.addEventListener('click', downloadAllDetailsCsv);

    document.getElementById('backToAuditBtn')
        ?.addEventListener('click', showAuditDashboard);

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
            btn.style.background = AUDIT_PALETTE.green;
            // Al restaurar se limpia el inline para que vuelva a mandar la clase .audit-prompt-copy
            setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 2000);
        });
    });

    let lastSeenStack = '';
    setInterval(() => {
        const current = elements.stackKeyInput?.value?.trim() || '';
        if (current !== lastSeenStack) {
            lastSeenStack = current;
            updateDeScript();
        }
    }, 1000);
    setTimeout(updateDeScript, 300);
}

/**
 * Renderiza el script copiable de extracción de Data Extensions con el stack dinámico
 * del cliente activo. Si el stack no está disponible muestra un aviso en su lugar.
 */
function updateDeScript() {
    const stackKey = elements.stackKeyInput?.value?.trim();
    const link = document.getElementById('audit-de-cb-link');
    const pre = document.getElementById('audit-de-script-pre');

    if (!link || !pre) return;

    // Si el stack no es válido, no renderizar script con URL errónea
    if (!stackKey || stackKey === 'No disponible' || stackKey === '') {
        link.href = "#";
        link.style.color = "#888";
        link.style.opacity = "0.6";
        pre.textContent = 'Stack no disponible. Haz login o realiza cualquier acción con la API para que se detecte el stack automáticamente.';
        pre._scriptContent = '';
        return;
    }

    const stackNum = stackKey.toLowerCase().replace('s', '');
    const finalStack = 's' + stackNum;
    const mcBaseUrl = `https://mc.${finalStack}.marketingcloudapps.com`;

    link.href = `${mcBaseUrl}/contactsmeta/fuelapi/data-internal/v1/customobjects/category/`;
    link.style.color = "#0070d2";
    link.style.opacity = "1";

    // El script que se copia a la consola del navegador (se ejecuta dentro de Marketing Cloud)
    const script = `(async () => {
        console.log("Iniciando extracción de Data Extensions en ${finalStack}...");
        const baseUrl = "${mcBaseUrl}";
        const allDEs = [];

        async function fetchApi(url) {
            try {
                const r = await fetch(url);
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return await r.json();
            } catch (err) {
                console.error('Error en', url, err);
                return null;
            }
        }

        async function processFolder(folderId, folderName) {
            console.log('Procesando:', folderName);
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
                    <h2 style="margin-top:0;color:#0070d2;">Extracción finalizada — \${allDEs.length} Data Extensions</h2>
                    <p>Copia el JSON de abajo y pégalo en MC API Helper.</p>
                    <div style="display:flex;gap:8px;margin-bottom:10px;">
                        <button id="de-copy-btn" style="padding:8px 16px;background:#0070d2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Copiar JSON</button>
                        <button id="de-close-btn" style="padding:8px 16px;background:#ccc;color:#333;border:none;border-radius:4px;cursor:pointer;">Cerrar</button>
                    </div>
                    <textarea id="de-json-area" style="flex:1;font-size:11px;font-family:monospace;resize:none;border:1px solid #ccc;border-radius:4px;padding:8px;">\${json}</textarea>
                \`;
                document.body.appendChild(modal);
                document.getElementById('de-copy-btn').onclick = () => {
                    navigator.clipboard.writeText(json).then(() => {
                        const btn = document.getElementById('de-copy-btn');
                        btn.textContent = 'Copiado';
                        btn.style.background = '#2e844a';
                        setTimeout(() => { btn.textContent = 'Copiar JSON'; btn.style.background = '#0070d2'; }, 2000);
                    });
                };
                document.getElementById('de-close-btn').onclick = () => modal.remove();
            } else { console.error('No se encontró la carpeta raíz de Data Extensions.'); }
        } else { console.error('No se pudo obtener el árbol de carpetas.'); }
    })();`;

    pre.textContent = script;
    pre._scriptContent = script;
}

/**
 * Alterna entre el panel de opciones y el de resultados. Desde las opciones, el botón
 * lanza siempre un nuevo escaneo; desde los resultados, vuelve a las opciones.
 */
async function handleRunAuditClick() {
    const optionsPanel = document.getElementById('audit-options');
    if (optionsPanel.style.display === 'none') {
        // Estamos en el panel de resultados → volver a las opciones (sin perder el panel).
        document.getElementById('audit-stats-container').innerHTML = '';
        document.getElementById('downloadAuditPdfBtn').style.display  = 'none';
        document.getElementById('downloadAuditDetailsBtn').style.display = 'none';
        document.getElementById('audit-dashboard').style.display    = 'none';
        optionsPanel.style.display = '';
        const btn = document.getElementById('runAuditBtn');
        if (btn) btn.innerHTML = 'Iniciar Escaneo de Instancia';
        // Si hay una auditoría ya calculada, ofrecer volver a ella sin re-escanear.
        document.getElementById('backToAuditBtn').style.display = hasAuditResult ? 'block' : 'none';
    } else {
        // El usuario pulsa "Iniciar Escaneo" explícitamente → siempre lanza un nuevo escaneo,
        // aunque haya caché. La caché solo se carga automáticamente al entrar en la vista.
        await runAudit();
    }
}

/** Vuelve a mostrar el panel de resultados ya calculado (sin re-escanear). */
function showAuditDashboard() {
    if (!hasAuditResult) return;
    const dashboard = document.getElementById('audit-dashboard');
    document.getElementById('audit-options').style.display = 'none';
    dashboard.style.display       = 'flex';
    dashboard.style.flexDirection = 'column';
    document.getElementById('downloadAuditPdfBtn').style.display     = 'block';
    document.getElementById('downloadAuditDetailsBtn').style.display = 'block';
    document.getElementById('backToAuditBtn').style.display = 'none';
    const topBtn = document.getElementById('runAuditBtn');
    if (topBtn) topBtn.innerHTML = 'Volver a Opciones';
}

/**
 * Entrada a la vista (la llama org-manager al entrar o al cambiar de cliente): resetea la UI
 * y carga la auditoría cacheada del cliente activo si existe.
 */
export async function view() {
    const clientName = elements.clientNameInput?.value?.trim();

    // Siempre resetear la UI antes de cargar, para no mostrar datos de otro cliente
    document.getElementById('audit-options').style.display          = '';
    document.getElementById('audit-dashboard').style.display        = 'none';
    document.getElementById('downloadAuditPdfBtn').style.display    = 'none';
    document.getElementById('downloadAuditDetailsBtn').style.display = 'none';
    document.getElementById('backToAuditBtn').style.display          = 'none';
    document.getElementById('audit-stats-container').innerHTML      = '';
    hasAuditResult = false; // aún no hay panel del cliente actual al que volver
    initAuditState(); // limpiar datos del cliente anterior
    currentStats = null;
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

/**
 * Pinta una auditoría guardada en caché: restaura el estado (drill/PDF/stats), el HTML de
 * las pestañas y el banner con la fecha de los datos.
 * @param {object} cached - Objeto guardado por saveAuditCache (tabs, drillData, pdfData, stats…).
 */
function renderCachedAudit(cached) {
    setDrillData(cached.drillData || {});
    setPdfData(cached.pdfData || {});
    currentStats = cached.stats || null;

    const dashboard = document.getElementById('audit-dashboard');
    document.getElementById('audit-options').style.display = 'none';
    dashboard.style.display       = 'flex';
    dashboard.style.flexDirection = 'column';
    document.getElementById('downloadAuditPdfBtn').style.display    = 'block';
    document.getElementById('downloadAuditDetailsBtn').style.display = 'block';
    const topBtn = document.getElementById('runAuditBtn');
    if (topBtn) topBtn.textContent = 'Volver a Opciones';
    document.getElementById('backToAuditBtn').style.display = 'none';
    hasAuditResult = true; // panel disponible para volver desde las opciones

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
        ? `<span class="audit-stats-line">Tiempo: <b>${cached.stats.timeStr}</b> &nbsp;·&nbsp; Llamadas API: <b>${cached.stats.calls}</b></span>`
        : '';
    const cacheHtml = `<span class="audit-stats-cache">Datos del ${savedDate}</span>`;
    document.getElementById('audit-stats-container').innerHTML =
        `<div class="audit-stats-box">${statsHtml}${cacheHtml}</div>`;
}

// ==========================================
// DRILL-DOWN + DESCARGAS
// ==========================================

/**
 * Abre el modal de detalle de una métrica pintando su tabla de filas registrada.
 * @param {string} key - Clave del drill registrado en audit-state.
 */
function showDrillDownModal(key) {
    const data = getDrillEntry(key);
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

/**
 * Convierte una entrada de drill a CSV (con BOM para que Excel respete UTF-8).
 * @param {{columns: string[], rows: Array[]}} data
 * @returns {string} Contenido CSV.
 */
function convertDrillToCsvString(data) {
    const BOM = String.fromCharCode(0xFEFF); // BOM para que Excel abra el CSV como UTF-8
    let csv = data.columns.map(c => `"${c}"`).join(',') + '\n';
    data.rows.forEach(row => {
        csv += row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',') + '\n';
    });
    return BOM + csv;
}

/** Descarga como CSV la tabla del drill actualmente abierto en el modal. */
function downloadDrillCsv() {
    const data = currentDrillKey ? getDrillEntry(currentDrillKey) : null;
    if (!data) return;
    const blob = new Blob([convertDrillToCsvString(data)], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `Auditoria_${currentDrillKey}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

/** Exporta todas las tablas de detalle (salvo las demasiado granulares) a una carpeta. */
async function downloadAllDetailsCsv() {
    const drillData = getDrillData();
    if (!drillData || Object.keys(drillData).length === 0) {
        ui.showCustomAlert('No hay datos de auditoría generados.'); return;
    }
    const folderPath = await window.electronAPI.selectFolder();
    if (!folderPath) return;

    ui.blockUI('Generando y guardando archivos CSV...');
    try {
        // Excluir claves demasiado granulares del export masivo
        const skipPrefixes = ['sm_from_', 'auto_email_', 'auto_noDesc_user_', 'auto_exec_year_', 'auto_status_', 'de_no_desc_', 'de_folder_'];
        const filesToSave = [];
        for (const [key, data] of Object.entries(drillData)) {
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

// ==========================================
// ESCANEO PRINCIPAL
// ==========================================

/**
 * Lanza el escaneo completo de la instancia: recorre las 7 pestañas en orden (cada módulo
 * pinta su pestaña y registra su drill/PDF en audit-state) y al terminar guarda el resultado
 * en la caché de auditoría del cliente activo.
 */
async function runAudit() {
    if (!await ui.showCustomConfirm('El escaneo va a comenzar. No cierres la aplicación durante el proceso.')) return;

    document.getElementById('audit-stats-container').innerHTML      = '';
    document.getElementById('downloadAuditPdfBtn').style.display    = 'none';
    document.getElementById('downloadAuditDetailsBtn').style.display = 'none';
    document.getElementById('backToAuditBtn').style.display          = 'none';
    document.getElementById('audit-options').style.display          = 'none';
    const topBtn = document.getElementById('runAuditBtn');
    if (topBtn) topBtn.innerHTML = 'Volver a Opciones';

    const dashboard = document.getElementById('audit-dashboard');
    dashboard.style.display       = 'flex';
    dashboard.style.flexDirection = 'column';
    TAB_IDS.forEach(id => {
        document.getElementById(`audit-tab-${id}`).innerHTML = buildLoadingPlaceholder();
    });

    initAuditState();
    const startTime = Date.now();
    logger.startLogBuffering();
    mcApiService.setLogger(logger);
    const renderedTabs = {};

    try {
        const apiConfig = await getAuthenticatedConfig();

        ui.blockUI('1/7: Escaneando Usuarios…');
        await auditUsers(apiConfig);
        renderedTabs.users = document.getElementById('audit-tab-users').innerHTML;

        ui.blockUI('2/7: Escaneando Automatismos…');
        await auditAutomations(apiConfig, true);
        renderedTabs.autos = document.getElementById('audit-tab-autos').innerHTML;

        ui.blockUI('3/7: Escaneando Journeys…');
        await auditJourneys(apiConfig);
        renderedTabs.journeys = document.getElementById('audit-tab-journeys').innerHTML;

        ui.blockUI('4/7: Escaneando Cloud Pages…');
        await auditCloudPages(apiConfig);
        renderedTabs.cp = document.getElementById('audit-tab-cp').innerHTML;

        ui.blockUI('5/7: Escaneando Send Management…');
        await auditSendManagement(apiConfig);
        renderedTabs.sm = document.getElementById('audit-tab-sm').innerHTML;

        const deJson = document.getElementById('audit-de-json')?.value?.trim();
        ui.blockUI('6/7: Analizando Data Extensions…');
        await auditDataExtensions(deJson);
        renderedTabs.de = document.getElementById('audit-tab-de').innerHTML;

        ui.blockUI('7/7: Analizando Contenidos (caché)…');
        await auditContent(elements.clientNameInput?.value?.trim());
        renderedTabs.content = document.getElementById('audit-tab-content').innerHTML;

        const durationMs = Date.now() - startTime;
        const min = Math.floor(durationMs / 60000);
        const sec = Math.floor((durationMs % 60000) / 1000);
        const timeStr = min > 0 ? `${min} m ${sec} s` : `${sec} s`;
        currentStats = { timeStr, calls: getApiCalls() };

        // Se muestra también la fecha del escaneo (coincide con la de la caché que se guarda).
        document.getElementById('audit-stats-container').innerHTML =
            `<div class="audit-stats-box">
                <span class="audit-stats-line">Tiempo: <b>${timeStr}</b> &nbsp;·&nbsp; Llamadas API: <b>${getApiCalls()}</b></span>
                <span class="audit-stats-cache">Datos del ${new Date().toLocaleString('es-ES')}</span>
            </div>`;
        document.getElementById('downloadAuditPdfBtn').style.display    = 'block';
        document.getElementById('downloadAuditDetailsBtn').style.display = 'block';
        hasAuditResult = true; // panel disponible para volver desde las opciones

        const clientName = elements.clientNameInput?.value?.trim();
        if (clientName) {
            await window.electronAPI.saveAuditCache({
                clientName,
                auditData: {
                    savedAt:   new Date().toISOString(),
                    options:   { autos: true, journeys: true },
                    deJson:    document.getElementById('audit-de-json')?.value?.trim() || '',
                    tabs:      renderedTabs,
                    drillData: getDrillData(),
                    pdfData:   getPdfData(),
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
