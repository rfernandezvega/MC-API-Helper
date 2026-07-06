// Fichero: src/renderer/components/org-manager.js
// Descripción: Gestión de clientes (organizaciones) y sus Business Units.
// Un CLIENTE (tenant) guarda UNA sola credencial (clientId/secret/authUri) y una lista de BUs.
// Todas las BUs reutilizan esa credencial; el token de cada BU se acuña con account_id=MID.
// El selector de la barra lateral es de dos niveles: Cliente → Business Unit.

import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as logger from '../ui/logger.js';
import * as mcApiService from '../api/mc-api-service.js';
import { escapeHtml } from '../ui/format-utils.js';


// --- ESTADO DEL MÓDULO ---
let selectedConfigRow = null;
// Contexto activo. cacheKey = clave que usan las vistas como identidad de caché (única por cliente+BU).
let activeContext = { clientName: '', mid: '', buName: '', cacheKey: '' };

// Selector de dos niveles (Cliente → BU) de la barra lateral (menú flotante propio).
let sidebarClientsData = [];        // [{ name, bus: [{name, mid}] }]
let csMenuEl = null, csSubmenuEl = null, csSubmenuHideTimer = null, csOpen = false;

// Consola de la app de WhatsApp (para que el usuario consulte los channelId de cada canal).
const WA_CONSOLE_URL = 'https://mc.exacttarget.com/cloud/#app/WhatsApp/';

// --- DEPENDENCIAS INYECTADAS ---
let getAuthenticatedConfig;
let updateLoginStatus;
let customerFinder;
let calendar;
let automationsManager;
let journeysManager;
let cloudPagesManager;
let contentManager;
let usersManager;
let auditManager;

/** Devuelve el contexto activo (cliente + BU). Lo consume app.js para pedir el token correcto. */
export function getActiveContext() {
    return { ...activeContext };
}

/** Lista de BUs de un cliente, sembrando la principal si aún no hay lista guardada. */
function getBusFor(config = {}) {
    if (Array.isArray(config.businessUnits) && config.businessUnits.length) return config.businessUnits;
    if (config.businessUnit) return [{ name: 'Principal', mid: String(config.businessUnit) }];
    return [];
}

/** Sanea un texto para poder usarlo como nombre de fichero (quita caracteres ilegales). */
function sanitizeForFile(s) {
    return String(s || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}

/**
 * Clave de caché de un contexto. Por coherencia SIEMPRE es "Cliente - NombreBU" (también la
 * principal), saneada para ser un nombre de fichero válido.
 */
function computeCacheKey(clientName, mid, buName) {
    if (!clientName) return '';
    const bu = buName || mid || '';
    return sanitizeForFile(`${clientName} - ${bu}`);
}

/** Recoge la configuración del formulario que es segura para guardar. */
function getConfigToSave() {
    const principal = elements.businessUnitInput.value.trim();
    let businessUnits = getBuTableRows();
    // Garantizar que la BU principal está en la lista.
    if (principal && !businessUnits.some(b => String(b.mid) === principal)) {
        businessUnits.unshift({ name: 'Principal', mid: principal });
    }
    return {
        authUri: elements.authUriInput.value,
        businessUnit: principal,
        businessUnits,
        clientId: elements.clientIdInput.value,
        stackKey: elements.stackKeyInput.value,
        dvConfigs: getDvConfigsFromTable(),
        waChannels: getWaChannelsFromTable()
    };
}

/** Guarda la configuración del cliente del formulario. */
async function saveClientConfig() {
    logger.startLogBuffering();
    try {
        const clientName = elements.configClientNameInput.value.trim();
        if (!clientName) { ui.showCustomAlert('Introduzca un nombre de cliente.'); return; }

        let configs = await window.electronAPI.loadGlobalConfigs();
        // Merge: se conservan campos que gestionan otras vistas (p. ej. waChannels de WhatsApp por BU).
        configs[clientName] = { ...(configs[clientName] || {}), ...getConfigToSave() };
        await window.electronAPI.saveGlobalConfigs(configs);

        await loadConfigsIntoSelect();
        customerFinder.updateClientConfig(configs[clientName]);
        ui.showCustomAlert(`Configuración para "${clientName}" guardada.`);
    } finally { logger.endLogBuffering(); }
}

/** Inicia el proceso de login (con la BU principal del cliente). */
function startLogin() {
    logger.startLogBuffering();
    try {
        const clientName = elements.configClientNameInput.value.trim();
        if (!clientName) {
            ui.showCustomAlert('Introduzca un nombre para el cliente.');
            return;
        }

        const config = {
            clientName,
            authUri: elements.authUriInput.value.trim(),
            clientId: elements.clientIdInput.value.trim(),
            clientSecret: elements.clientSecretInput.value.trim(),
            businessUnit: elements.businessUnitInput.value.trim()
        };

        if (!config.authUri || !config.clientId || !config.clientSecret || !config.businessUnit) {
            ui.showCustomAlert('Se necesitan Auth URI, Client ID, Client Secret y el MID de la BU principal para el login.');
            return;
        }

        saveClientConfig();

        logger.logMessage("Configuración guardada. Iniciando login...");
        ui.blockUI("Iniciando login...");
        window.electronAPI.startLogin(config);
    } finally {
        logger.endLogBuffering();
    }
}

/** Cierra sesión y borra la configuración del cliente seleccionado en el formulario. */
async function logout() {
    logger.startLogBuffering();
    try {
        const clientName = elements.savedConfigsSelect.value || activeContext.clientName;
        if (!clientName) return;
        if (await ui.showCustomConfirm(`¿Borrar configuración de "${clientName}" (todas sus BUs)?`)) {
            let configs = await window.electronAPI.loadGlobalConfigs();
            delete configs[clientName];
            await window.electronAPI.saveGlobalConfigs(configs);
            window.electronAPI.logout(clientName);
            await window.electronAPI.deleteClientCache(clientName);
            if (activeContext.clientName === clientName) {
                activeContext = { clientName: '', mid: '', buName: '', cacheKey: '' };
            }
            await loadConfigsIntoSelect();
        }
    } finally { logger.endLogBuffering(); }
}

/** Rellena el formulario con la configuración de un cliente. */
function setClientConfigForm(config) {
    elements.businessUnitInput.value = config.businessUnit || '';
    elements.authUriInput.value = config.authUri || '';
    elements.clientIdInput.value = config.clientId || '';
    elements.stackKeyInput.value = config.stackKey || '';
    populateDvConfigsTable(config.dvConfigs);
    populateBuTable(getBusFor(config));
    populateWaChannelsTable(config.waChannels, getBusFor(config));
    elements.tokenField.value = '';
    elements.soapUriInput.value = '';
    elements.restUriInput.value = '';
    elements.clientSecretInput.value = '';
}

/** Carga las configuraciones guardadas: desplegable plano (editar) + selector de dos niveles (sidebar). */
export async function loadConfigsIntoSelect() {
    const configs = await window.electronAPI.loadGlobalConfigs();

    // Desplegable plano (para editar la configuración del cliente).
    elements.savedConfigsSelect.innerHTML = '<option value="">Seleccionar configuración...</option>';
    const names = Object.keys(configs).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    for (const name of names) elements.savedConfigsSelect.appendChild(new Option(name, name));
    elements.savedConfigsSelect.value = activeContext.clientName || '';

    // Selector de dos niveles de la barra lateral (solo BUs marcadas como visibles).
    sidebarClientsData = names.map(name => ({ name, bus: getBusFor(configs[name]).filter(b => !b.hidden) }));
    setSidebarLabel(activeContext.clientName, activeContext.buName);
}

/** Fija el texto del botón del selector de la barra lateral. */
function setSidebarLabel(clientName, buName) {
    if (!elements.clientSelectorLabel) return;
    elements.clientSelectorLabel.textContent = clientName
        ? `${clientName}${buName ? '  ·  ' + buName : ''}`
        : 'Ninguno seleccionado';
}

// ---- Menú flotante del selector de dos niveles (Cliente → BU) ----
// Se crea en <body> con position:fixed para que el flyout no lo recorte el overflow de la barra lateral.

function ensureSidebarMenuEls() {
    if (csMenuEl) return;
    csMenuEl = document.createElement('div');
    csMenuEl.className = 'client-selector-menu';
    csMenuEl.hidden = true;
    csSubmenuEl = document.createElement('div');
    csSubmenuEl.className = 'client-selector-submenu';
    csSubmenuEl.hidden = true;
    document.body.appendChild(csMenuEl);
    document.body.appendChild(csSubmenuEl);

    csSubmenuEl.addEventListener('mouseenter', () => clearTimeout(csSubmenuHideTimer));
    csSubmenuEl.addEventListener('mouseleave', scheduleHideSubmenu);

    document.addEventListener('click', (e) => {
        if (!csOpen) return;
        if (e.target.closest('#clientSelector') || e.target.closest('.client-selector-menu') || e.target.closest('.client-selector-submenu')) return;
        closeSidebarMenu();
    });
    window.addEventListener('resize', closeSidebarMenu);
}

function renderSidebarMenu() {
    ensureSidebarMenuEls();
    csMenuEl.innerHTML = '';
    if (!sidebarClientsData.length) {
        csMenuEl.innerHTML = '<div class="cs-empty">No hay clientes configurados</div>';
        return;
    }
    for (const client of sidebarClientsData) {
        const row = document.createElement('div');
        row.className = 'cs-client' + (client.name === activeContext.clientName ? ' active' : '');
        row.innerHTML = `<span class="cs-client-name">${escapeHtml(client.name)}</span><span class="cs-arrow">▸</span>`;
        row.addEventListener('mouseenter', () => openSubmenu(client, row));
        row.addEventListener('mouseleave', scheduleHideSubmenu);
        csMenuEl.appendChild(row);
    }
}

function openSubmenu(client, rowEl) {
    clearTimeout(csSubmenuHideTimer);
    csSubmenuEl.innerHTML = '';
    if (!client.bus.length) {
        csSubmenuEl.innerHTML = '<div class="cs-empty">Sin BUs (configúralas)</div>';
    } else {
        for (const bu of client.bus) {
            const item = document.createElement('div');
            const isActive = client.name === activeContext.clientName && String(bu.mid) === String(activeContext.mid);
            item.className = 'cs-bu' + (isActive ? ' active' : '');
            item.textContent = bu.name || bu.mid;
            item.addEventListener('click', () => {
                closeSidebarMenu();
                activateClientBU(client.name, String(bu.mid), bu.name || '');
            });
            csSubmenuEl.appendChild(item);
        }
    }
    const r = rowEl.getBoundingClientRect();
    csSubmenuEl.hidden = false;
    csSubmenuEl.style.top = `${r.top}px`;
    csSubmenuEl.style.left = `${r.right + 2}px`;
    const sh = csSubmenuEl.getBoundingClientRect();
    if (sh.bottom > window.innerHeight - 8) {
        csSubmenuEl.style.top = `${Math.max(8, window.innerHeight - 8 - sh.height)}px`;
    }
}

function scheduleHideSubmenu() {
    clearTimeout(csSubmenuHideTimer);
    csSubmenuHideTimer = setTimeout(() => { if (csSubmenuEl) csSubmenuEl.hidden = true; }, 180);
}

function openSidebarMenu() {
    renderSidebarMenu();
    const b = elements.clientSelectorBtn.getBoundingClientRect();
    csMenuEl.hidden = false;
    csMenuEl.style.top = `${b.bottom + 4}px`;
    csMenuEl.style.left = `${b.left}px`;
    csMenuEl.style.minWidth = `${b.width}px`;
    csOpen = true;
    elements.clientSelectorBtn.classList.add('open');
}

function closeSidebarMenu() {
    if (csMenuEl) csMenuEl.hidden = true;
    if (csSubmenuEl) csSubmenuEl.hidden = true;
    csOpen = false;
    elements.clientSelectorBtn?.classList.remove('open');
}

function toggleSidebarMenu() { csOpen ? closeSidebarMenu() : openSidebarMenu(); }

/**
 * Activa un contexto cliente+BU: limpia cachés si cambia, carga el formulario, fija la clave de
 * caché (clientNameInput) y el MID activo (activeMidInput), y valida la sesión.
 */
async function activateClientBU(clientName, mid, buName) {
    logger.startLogBuffering();
    try {
        const configs = await window.electronAPI.loadGlobalConfigs();
        const config = configs[clientName] || {};
        if (clientName && !mid) mid = String(config.businessUnit || '').trim();
        if (clientName && !buName) {
            buName = getBusFor(config).find(b => String(b.mid) === String(mid))?.name || 'Principal';
        }
        const cacheKey = clientName ? computeCacheKey(clientName, mid, buName) : '';

        if (cacheKey === activeContext.cacheKey && clientName === activeContext.clientName) {
            logger.logMessage(`Contexto "${cacheKey || 'ninguno'}" ya está activo.`);
            return;
        }

        logger.logMessage(`Cambiando contexto: "${activeContext.cacheKey || 'ninguno'}" → "${cacheKey || 'ninguno'}"`);

        // Limpiar cachés en memoria al cambiar de contexto.
        calendar.clearData();
        automationsManager.clearCache();
        journeysManager.clearCache();
        cloudPagesManager.clearCache();
        if (contentManager) contentManager.clearCache();
        if (usersManager) usersManager.clearCache();

        activeContext = { clientName: clientName || '', mid: mid || '', buName: buName || '', cacheKey };

        updateLoginStatus(false);

        if (clientName) {
            ui.blockUI("Cargando configuración...");
            customerFinder.updateClientConfig(config);
            setClientConfigForm(config);

            elements.configClientNameInput.value = clientName;
            elements.clientNameInput.value = cacheKey;   // clave de caché para las vistas
            elements.activeMidInput.value = mid || '';   // MID activo (account_id)
            elements.savedConfigsSelect.value = clientName;
            setSidebarLabel(clientName, buName);

            if (auditManager) auditManager.view();

            getAuthenticatedConfig()
                .catch(() => { /* error ya gestionado */ })
                .finally(ui.unblockUI);
        } else {
            setClientConfigForm({});
            elements.configClientNameInput.value = '';
            elements.clientNameInput.value = '';
            elements.activeMidInput.value = '';
            elements.savedConfigsSelect.value = '';
            setSidebarLabel('', '');
            if (auditManager) auditManager.view();
        }
    } finally {
        logger.endLogBuffering();
    }
}

/** Activa un cliente por su BU principal (usado por el desplegable plano y tras el login). */
export async function loadAndSyncClientConfig(clientName) {
    if (!clientName) { await activateClientBU('', '', ''); return; }
    const configs = await window.electronAPI.loadGlobalConfigs();
    const config = configs[clientName] || {};
    const mid = String(config.businessUnit || '').trim();
    const buName = getBusFor(config).find(b => String(b.mid) === mid)?.name || 'Principal';
    await activateClientBU(clientName, mid, buName);
}

/** Descubre las BUs del tenant vía SOAP y las fusiona en la tabla (requiere sesión activa). */
async function syncBusinessUnits() {
    logger.startLogBuffering();
    try {
        const clientName = elements.configClientNameInput.value.trim();
        if (!clientName) { ui.showCustomAlert('Selecciona o crea un cliente primero.'); return; }

        ui.blockUI('Descubriendo Business Units…');
        let apiConfig;
        try {
            apiConfig = await getAuthenticatedConfig();
        } catch (e) {
            ui.showCustomAlert('Necesitas iniciar sesión en el cliente antes de sincronizar sus BUs.');
            return;
        }

        // Volcar la petición/respuesta SOAP al panel de logs.
        mcApiService.setLogger(logger);
        const bus = await mcApiService.fetchBusinessUnits(apiConfig);
        if (!bus || !bus.length) {
            ui.showCustomAlert('No se han encontrado Business Units. Comprueba que el usuario tiene acceso a nivel Enterprise.');
            return;
        }

        // Fusionar con las existentes por MID (los descubiertos actualizan el nombre;
        // se conserva la visibilidad Mostrar/Ocultar que ya tuviera cada BU).
        const byMid = new Map(getBuTableRows().map(b => [String(b.mid), b]));
        for (const b of bus) {
            const prev = byMid.get(String(b.mid));
            byMid.set(String(b.mid), { name: b.name, mid: String(b.mid), hidden: prev?.hidden || false });
        }
        populateBuTable(Array.from(byMid.values()));

        await saveClientConfig();
        ui.showCustomAlert(`${bus.length} Business Unit(s) sincronizada(s).`);
    } catch (error) {
        logger.logMessage(`Error sincronizando BUs: ${error.message}`);
        ui.showCustomAlert(`Error al sincronizar BUs: ${error.message}`);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/** Exporta la configuración de búsqueda en DEs a CSV. */
async function exportDvConfig() {
    logger.startLogBuffering();
    try {
        const configs = getDvConfigsFromTable();
        const validConfigs = configs.filter(c => c.title || c.deKey || c.field);

        if (validConfigs.length === 0) {
            ui.showCustomAlert('No hay datos en la tabla para exportar.');
            return;
        }

        const headers = '"Nombre","External Key","Campo de Búsqueda"';
        const rows = validConfigs.map(c => `"${c.title}","${c.deKey}","${c.field}"`);
        const csvContent = [headers, ...rows].join('\n');

        const clientName = (elements.configClientNameInput.value.trim() || 'config').replace(/\s+/g, '_');
        const fileName = `config_busqueda_DEs_${clientName}.csv`;

        const result = await window.electronAPI.saveCsvFile({ content: csvContent, defaultName: fileName });
        if (result.success) {
            logger.logMessage(`Configuración exportada correctamente a: ${result.filePath}`);
            ui.showCustomAlert('Configuración exportada con éxito.');
        } else if (!result.canceled) {
            logger.logMessage(`Error al exportar la configuración: ${result.error}`);
            ui.showCustomAlert(`Error al exportar: ${result.error}`);
        }
    } catch (error) {
        logger.logMessage(`Error inesperado durante la exportación: ${error.message}`);
    } finally {
        logger.endLogBuffering();
    }
}

/** Importa configuración de búsqueda en DEs desde CSV, fusionando sin duplicar. */
async function importDvConfig() {
    logger.startLogBuffering();
    try {
        const result = await window.electronAPI.openCsvFile();
        if (result.canceled || !result.content) {
            logger.logMessage('Importación de CSV cancelada por el usuario.');
            return;
        }

        const existingConfigs = getDvConfigsFromTable().filter(c => c.deKey);
        const existingKeys = new Set(existingConfigs.map(c => c.deKey));

        const newConfigs = [];
        const lines = result.content.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split('","').map(p => p.replace(/"/g, ''));
            if (parts.length < 3) continue;

            const newConfig = { title: parts[0] || '', deKey: parts[1] || '', field: parts[2] || '' };

            if (newConfig.deKey && !existingKeys.has(newConfig.deKey)) {
                newConfigs.push(newConfig);
                existingKeys.add(newConfig.deKey);
            }
        }

        if (newConfigs.length > 0) {
            const mergedConfigs = [...existingConfigs, ...newConfigs];
            populateDvConfigsTable(mergedConfigs);
            saveClientConfig();
            logger.logMessage(`${newConfigs.length} nueva(s) configuracion(es) importada(s).`);
            ui.showCustomAlert(`Se han importado ${newConfigs.length} nuevas filas.`);
        } else {
            ui.showCustomAlert('El fichero no contenía ninguna configuración nueva.');
        }
    } catch (error) {
        logger.logMessage(`Error al importar el fichero CSV: ${error.message}`);
        ui.showCustomAlert(`Error al procesar el fichero: ${error.message}`);
    } finally {
        logger.endLogBuffering();
    }
}


// --- HELPERS: TABLA DE BUSINESS UNITS ---

function addBuRow(name = '', mid = '', hidden = false) {
    const row = elements.buListTbody.insertRow();
    const sel = `<select class="bu-visible">
        <option value="show"${hidden ? '' : ' selected'}>Mostrar</option>
        <option value="hide"${hidden ? ' selected' : ''}>Ocultar</option>
    </select>`;
    row.innerHTML = `<td contenteditable="true">${escapeHtml(name)}</td><td contenteditable="true">${escapeHtml(mid)}</td><td>${sel}</td>` +
        `<td class="ta-center"><button type="button" class="bu-del-btn row-del-btn" title="Eliminar fila">Eliminar</button></td>`;
}

function populateBuTable(bus = []) {
    elements.buListTbody.innerHTML = '';
    const rows = (bus && bus.length) ? bus : [{ name: '', mid: '', hidden: false }];
    rows.forEach(b => addBuRow(b.name || '', b.mid || '', !!b.hidden));
}

function getBuTableRows() {
    return Array.from(elements.buListTbody.querySelectorAll('tr')).map(row => ({
        name: row.cells[0].textContent.trim(),
        mid: row.cells[1].textContent.trim(),
        hidden: row.cells[2]?.querySelector('select')?.value === 'hide'
    })).filter(b => b.mid);
}


// --- HELPERS: CANALES WHATSAPP (por BU) ---

/** Construye el <select> de BU para una fila de canal, con la BU indicada preseleccionada. */
function buSelectHtml(bus, selectedMid) {
    const opts = (bus || []).map(b =>
        `<option value="${escapeHtml(b.mid)}"${String(b.mid) === String(selectedMid) ? ' selected' : ''}>${escapeHtml(b.name || b.mid)}</option>`
    ).join('');
    return `<select class="wa-bu-select">${opts}</select>`;
}

function addWaChannelRow(mid = '', channelId = '', name = '', bus = null) {
    const buList = bus || getBuTableRows();
    const row = elements.waChannelsTbody.insertRow();
    row.innerHTML = `<td>${buSelectHtml(buList, mid)}</td>` +
        `<td contenteditable="true">${escapeHtml(channelId)}</td>` +
        `<td contenteditable="true">${escapeHtml(name)}</td>` +
        `<td class="ta-center"><button type="button" class="wa-del-btn row-del-btn" title="Eliminar canal">Eliminar</button></td>`;
}

/** Pinta la tabla de canales a partir de waChannels ({mid: [{id, name}]}). */
function populateWaChannelsTable(waChannels = {}, bus = null) {
    elements.waChannelsTbody.innerHTML = '';
    const buList = bus || getBuTableRows();
    const entries = [];
    for (const mid of Object.keys(waChannels || {})) {
        for (const c of (waChannels[mid] || [])) entries.push({ mid, id: c.id, name: c.name });
    }
    if (!entries.length) { addWaChannelRow('', '', '', buList); return; }
    entries.forEach(e => addWaChannelRow(e.mid, e.id, e.name, buList));
}

/** Lee la tabla de canales y devuelve el objeto agrupado {mid: [{id, name}]}. */
function getWaChannelsFromTable() {
    const result = {};
    for (const row of elements.waChannelsTbody.querySelectorAll('tr')) {
        const mid = row.cells[0]?.querySelector('select')?.value?.trim();
        const id = row.cells[1]?.textContent.trim();
        const name = row.cells[2]?.textContent.trim();
        if (!mid || !id) continue;
        if (!result[mid]) result[mid] = [];
        if (!result[mid].some(c => c.id === id)) result[mid].push({ id, name: name || id });
    }
    return result;
}


// --- HELPERS: TABLA DE CONFIGURACIÓN DE BÚSQUEDA (DVs) ---

function getDvConfigsFromTable() {
    return Array.from(elements.sendsConfigTbody.querySelectorAll('tr')).map(row => ({
        title: row.cells[0].textContent.trim(),
        deKey: row.cells[1].textContent.trim(),
        field: row.cells[2].textContent.trim()
    }));
}

function populateDvConfigsTable(configs = []) {
    elements.sendsConfigTbody.innerHTML = '';
    if (!configs || configs.length === 0) {
        configs = [{ title: '', deKey: '', field: '' }];
    }
    configs.forEach(config => {
        const newRow = elements.sendsConfigTbody.insertRow();
        newRow.innerHTML = `<td contenteditable="true">${escapeHtml(config.title)}</td><td contenteditable="true">${escapeHtml(config.deKey)}</td><td contenteditable="true">${escapeHtml(config.field)}</td>` +
            `<td class="ta-center"><button type="button" class="dv-del-btn row-del-btn" title="Eliminar fila">Eliminar</button></td>`;
    });
}


/**
 * Inicializa el módulo: listeners, dependencias y migración de datos antiguos.
 * @param {object} dependencies
 */
export async function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;
    updateLoginStatus      = dependencies.updateLoginStatus;
    customerFinder         = dependencies.customerFinder;
    calendar               = dependencies.calendar;
    automationsManager     = dependencies.automationsManager;
    journeysManager        = dependencies.journeysManager;
    cloudPagesManager      = dependencies.cloudPagesManager;
    contentManager         = dependencies.contentManager;
    usersManager           = dependencies.usersManager;
    auditManager           = dependencies.auditManager;

    // Migración de datos antiguos de localStorage a fichero.
    const oldLocalData = localStorage.getItem('mcApiConfigs');
    if (oldLocalData) {
        try {
            const configs = JSON.parse(oldLocalData);
            await window.electronAPI.saveGlobalConfigs(configs);
            localStorage.removeItem('mcApiConfigs');
            logger.logMessage("Migración de datos a disco completada.");
        } catch (e) {
            console.error("Error durante la migración:", e);
        }
    }

    await loadConfigsIntoSelect();

    elements.saveConfigBtn.addEventListener('click', saveClientConfig);
    elements.loginBtn.addEventListener('click', startLogin);
    elements.logoutBtn.addEventListener('click', logout);
    elements.exportDvConfigBtn.addEventListener('click', exportDvConfig);
    elements.importDvConfigBtn.addEventListener('click', importDvConfig);

    // Business Units.
    elements.addBuRowBtn?.addEventListener('click', () => addBuRow('', ''));
    elements.syncBuBtn?.addEventListener('click', syncBusinessUnits);
    elements.buListTbody?.addEventListener('click', (e) => {
        if (e.target.matches('.bu-del-btn')) {
            e.target.closest('tr')?.remove();
        }
    });

    // Canales WhatsApp (por BU).
    elements.addWaChannelBtn?.addEventListener('click', () => addWaChannelRow('', '', ''));
    elements.waChannelsTbody?.addEventListener('click', (e) => {
        if (e.target.matches('.wa-del-btn')) e.target.closest('tr')?.remove();
    });
    elements.waConsoleLink?.addEventListener('click', (e) => {
        e.preventDefault();
        window.electronAPI.openExternalLink(WA_CONSOLE_URL);
    });

    // Desplegable plano (editar/activar por BU principal).
    elements.savedConfigsSelect.addEventListener('change', (e) => loadAndSyncClientConfig(e.target.value));

    // Selector de dos niveles (cliente → BU) de la barra lateral.
    ensureSidebarMenuEls();
    elements.clientSelectorBtn?.addEventListener('click', (e) => { e.stopPropagation(); toggleSidebarMenu(); });

    elements.addSendConfigRowBtn.addEventListener('click', () => {
        const newRow = elements.sendsConfigTbody.insertRow();
        newRow.innerHTML = `<td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td>` +
            `<td class="ta-center"><button type="button" class="dv-del-btn row-del-btn" title="Eliminar fila">Eliminar</button></td>`;
    });

    elements.sendsConfigTbody.addEventListener('click', (e) => {
        const targetRow = e.target.closest('tr');
        if (!targetRow) return;

        if (e.target.matches('.dv-del-btn')) {
            if (targetRow === selectedConfigRow) selectedConfigRow = null;
            targetRow.remove();
        } else {
            if (targetRow !== selectedConfigRow) {
                if (selectedConfigRow) selectedConfigRow.classList.remove('selected');
                targetRow.classList.add('selected');
                selectedConfigRow = targetRow;
            }
        }
    });

    elements.authUriInput.addEventListener('blur', () => {
        const uri = elements.authUriInput.value.trim();
        if (uri && !uri.endsWith('v2/token')) {
            elements.authUriInput.value = (uri.endsWith('/') ? uri : uri + '/') + 'v2/token';
        }
    });
}
