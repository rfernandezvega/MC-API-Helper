// =======================================================================================
// --- Fichero: src/renderer/components/settings.js ---
// --- Descripción: Vista de Ajustes de la aplicación. Gestiona el tema (claro/oscuro),
// ---              el zoom, las filas por página de cada tabla, el cliente por defecto
// ---              al arrancar y el almacenamiento (tamaño y borrado de cachés, por
// ---              fichero). Todo se persiste en settings.json.
// =======================================================================================

import { showCustomConfirm, showCustomAlert } from '../ui/ui-helpers.js';
import { escapeHtml } from '../ui/format-utils.js';
import { getClientsWithBUs } from './org-manager.js';

// Claves usadas dentro de settings.json.
const THEME_KEY = 'theme';
const ZOOM_KEY = 'zoom';
const ROWS_KEY = 'rowsPerPage';      // objeto { automations, journeys, cloudpages, users, content }
const CLIENT_KEY = 'defaultClient';  // nombre del cliente por defecto
const BU_KEY = 'defaultBU';          // MID de la BU por defecto de ese cliente

// Datos de clientes y sus BUs, cacheados al abrir la vista para poblar los selectores.
let clientsData = [];

const TEMAS_VALIDOS = ['light', 'dark'];

// Zoom de la interfaz. Debe coincidir con los límites definidos en main.js.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.0;
const ZOOM_STEP = 0.05;
const ZOOM_DEFAULT = 0.85;
let currentZoom = ZOOM_DEFAULT;

// Filas por página: opciones y valor por defecto de cada vista (los originales).
const ROWS_OPTIONS = [10, 15, 25, 50, 100];
const ROWS_DEFAULTS = { automations: 15, journeys: 15, cloudpages: 10, users: 10, content: 15 };

// Copia en memoria de settings.json, cargada al arrancar. La leen otros módulos
// (getRowsPerPage / getDefaultClient) sin ir al disco en cada render.
let cachedSettings = {};

// --- Persistencia ---

/** Lee settings.json y actualiza la caché en memoria. */
async function fetchSettings() {
    try {
        cachedSettings = (await window.electronAPI.getSettings()) || {};
    } catch (e) {
        cachedSettings = {};
    }
    return cachedSettings;
}

/**
 * Guarda una clave en settings.json preservando el resto (re-lee antes de escribir
 * para no pisar cambios de otros módulos, p. ej. el estado de los menús colapsables).
 */
async function saveSetting(key, value) {
    const settings = (await window.electronAPI.getSettings()) || {};
    settings[key] = value;
    cachedSettings = settings;
    await window.electronAPI.saveSettings(settings);
}

// --- Getters consumidos por otros módulos ---

/**
 * Devuelve las filas por página configuradas para una vista concreta.
 * @param {string} view - 'automations' | 'journeys' | 'cloudpages' | 'users' | 'content'.
 */
export function getRowsPerPage(view) {
    const stored = cachedSettings[ROWS_KEY];
    const n = Number(stored && stored[view]);
    return ROWS_OPTIONS.includes(n) ? n : (ROWS_DEFAULTS[view] || 15);
}

/** Devuelve el nombre del cliente por defecto configurado (o cadena vacía). */
export function getDefaultClient() {
    return cachedSettings[CLIENT_KEY] || '';
}

/** Devuelve el MID de la BU por defecto configurada (o cadena vacía). */
export function getDefaultBU() {
    return cachedSettings[BU_KEY] || '';
}

// --- Tema ---

/** Aplica un tema al documento escribiendo data-theme en <html>. */
export function applyTheme(theme) {
    const t = TEMAS_VALIDOS.includes(theme) ? theme : 'light';
    document.documentElement.setAttribute('data-theme', t);
    updateThemeButtons(t);
}

/** Carga settings.json y aplica el tema guardado. Se llama al arrancar la app. */
export async function applyStoredTheme() {
    await fetchSettings();
    applyTheme(cachedSettings[THEME_KEY] || 'light');
}

function updateThemeButtons(theme) {
    document.querySelectorAll('.settings-theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.themeValue === theme);
    });
}

async function selectTheme(theme) {
    applyTheme(theme);
    await saveSetting(THEME_KEY, theme);
}

// --- Zoom ---

function renderZoom() {
    const label = document.getElementById('settings-zoom-value');
    if (label) label.textContent = `${Math.round(currentZoom * 100)}%`;
    const dec = document.getElementById('settings-zoom-dec');
    const inc = document.getElementById('settings-zoom-inc');
    if (dec) dec.disabled = currentZoom <= ZOOM_MIN + 1e-9;
    if (inc) inc.disabled = currentZoom >= ZOOM_MAX - 1e-9;
}

async function changeZoom(delta) {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(currentZoom + delta).toFixed(2)));
    if (next === currentZoom) return;
    currentZoom = next;
    renderZoom();
    await window.electronAPI.setZoom(currentZoom);
    await saveSetting(ZOOM_KEY, currentZoom);
}

// --- Filas por página (una por vista) ---

/** Rellena los desplegables de filas por página y marca el valor actual de cada vista. */
function renderRowsSelects() {
    document.querySelectorAll('.settings-rows-select').forEach(sel => {
        const view = sel.dataset.view;
        sel.innerHTML = ROWS_OPTIONS.map(n => `<option value="${n}">${n}</option>`).join('');
        sel.value = String(getRowsPerPage(view));
    });
}

/** Guarda las filas por página de una vista (dentro del objeto rowsPerPage). */
async function saveRowsPerPage(view, value) {
    const settings = (await window.electronAPI.getSettings()) || {};
    const rows = { ...(settings[ROWS_KEY] || {}) };
    rows[view] = value;
    settings[ROWS_KEY] = rows;
    cachedSettings = settings;
    await window.electronAPI.saveSettings(settings);
}

// --- Cliente + BU por defecto ---

/**
 * Rellena el desplegable de BU con las Business Units del cliente indicado y
 * selecciona la guardada (o la primera). Oculta la fila si no hay cliente/BUs.
 * @param {string} clientName
 * @param {string} selectedMid - MID a preseleccionar.
 */
function renderBUSelect(clientName, selectedMid) {
    const buSel = document.getElementById('settings-bu-select');
    const buRow = document.getElementById('settings-bu-row');
    if (!buSel) return;
    const client = clientsData.find(c => c.name === clientName);
    const bus = client ? client.bus : [];
    if (buRow) buRow.style.display = (clientName && bus.length) ? '' : 'none';
    buSel.innerHTML = bus.map(b =>
        `<option value="${escapeHtml(String(b.mid))}">${escapeHtml(b.name || String(b.mid))}</option>`
    ).join('');
    if (bus.some(b => String(b.mid) === String(selectedMid))) buSel.value = String(selectedMid);
    else if (bus.length) buSel.value = String(bus[0].mid);
}

/** Rellena el desplegable de cliente (y su BU) con los clientes guardados. */
async function populateClientSelect() {
    const clientSel = document.getElementById('settings-client-select');
    if (!clientSel) return;
    try {
        clientsData = await getClientsWithBUs();
    } catch (e) {
        clientsData = [];
    }
    clientSel.innerHTML = '<option value="">Ninguno (empezar sin cliente)</option>'
        + clientsData.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
    const savedClient = clientsData.some(c => c.name === getDefaultClient()) ? getDefaultClient() : '';
    clientSel.value = savedClient;
    renderBUSelect(savedClient, getDefaultBU());
}

/** Guarda el cliente + BU por defecto (juntos, en una sola escritura). */
async function saveDefaultContext(clientName, mid) {
    const settings = (await window.electronAPI.getSettings()) || {};
    settings[CLIENT_KEY] = clientName;
    settings[BU_KEY] = clientName ? mid : '';
    cachedSettings = settings;
    await window.electronAPI.saveSettings(settings);
}

// --- Almacenamiento (cachés) ---

/** Formatea un tamaño en bytes a una unidad legible. */
function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
}

/** Quita la extensión .json del nombre de un fichero de caché para mostrarlo. */
function cacheFileLabel(name) {
    return name.replace(/\.json$/i, '');
}

/** Recupera el tamaño de cada caché y sus ficheros, y pinta la lista con sus botones. */
async function renderCacheList() {
    const container = document.getElementById('settings-cache-list');
    if (!container) return;
    container.innerHTML = '<div class="settings-row-desc">Calculando tamaños…</div>';
    let info = [];
    try {
        info = (await window.electronAPI.getCacheInfo()) || [];
    } catch (e) {
        container.innerHTML = '<div class="settings-row-desc">No se pudo calcular el tamaño de las cachés.</div>';
        return;
    }
    const total = info.reduce((sum, c) => sum + (c.sizeBytes || 0), 0);

    container.innerHTML = info.map(c => {
        const filesHtml = c.files.length
            ? c.files.map(f => `
                <div class="settings-cache-file">
                    <span class="settings-cache-file-name" title="${escapeHtml(f.name)}">${escapeHtml(cacheFileLabel(f.name))}</span>
                    <span class="settings-cache-size">${formatBytes(f.sizeBytes)}</span>
                    <button type="button" class="action-button delete-btn settings-cache-btn" data-cat="${c.key}" data-file="${escapeHtml(f.name)}">Borrar</button>
                </div>`).join('')
            : '<div class="settings-cache-empty">Sin datos en caché.</div>';
        return `
            <details class="settings-cache-group">
                <summary class="settings-cache-head">
                    <span class="settings-cache-chevron">▶</span>
                    <span class="settings-cache-name">${c.label}</span>
                    <span class="settings-cache-size">${formatBytes(c.sizeBytes)}</span>
                    <button type="button" class="action-button delete-btn settings-cache-btn" data-cat="${c.key}" ${c.sizeBytes ? '' : 'disabled'}>Borrar todo</button>
                </summary>
                <div class="settings-cache-files">${filesHtml}</div>
            </details>`;
    }).join('')
        + `<div class="settings-cache-total">Total: <strong>${formatBytes(total)}</strong>
            <button type="button" class="action-button delete-btn settings-cache-btn" data-cat="all" ${total ? '' : 'disabled'}>Borrar todo</button></div>`;
}

/**
 * Gestiona el clic en cualquier botón de borrado de la lista de cachés:
 * un fichero concreto (data-file), una categoría entera o todas (data-cat="all").
 */
async function handleCacheClick(e) {
    const btn = e.target.closest('.settings-cache-btn');
    if (!btn) return;
    // Evita que al pulsar "Borrar" dentro de la cabecera se colapse/expanda el <details>.
    e.preventDefault();
    if (btn.disabled) return;

    const cat = btn.dataset.cat;
    const file = btn.dataset.file;
    let msg;
    if (file) {
        msg = `¿Seguro que quieres borrar la caché "${cacheFileLabel(file)}"? Se volverá a descargar al refrescar la vista.`;
    } else if (cat === 'all') {
        msg = '¿Seguro que quieres borrar TODAS las cachés? Los datos se volverán a descargar cuando refresques cada vista.';
    } else {
        const label = btn.closest('.settings-cache-group')?.querySelector('.settings-cache-name')?.textContent || 'esta categoría';
        msg = `¿Seguro que quieres borrar la caché de ${label}? Se volverá a descargar al refrescar esa vista.`;
    }
    if (!await showCustomConfirm(msg)) return;

    try {
        if (file) await window.electronAPI.deleteCacheFile(cat, file);
        else await window.electronAPI.clearCache(cat);
    } catch (err) {
        showCustomAlert('No se pudo borrar la caché.');
    }
    await renderCacheList();
}

// --- Ciclo de vida ---

/** Inicializa la vista: engancha todos los controles y carga el estado guardado. */
export async function init() {
    // Tema
    const themeContainer = document.getElementById('settings-theme-options');
    if (themeContainer) {
        themeContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.settings-theme-btn');
            if (btn) selectTheme(btn.dataset.themeValue);
        });
        updateThemeButtons(document.documentElement.getAttribute('data-theme') || 'light');
    }

    // Zoom (main.js ya lo aplicó al arrancar; aquí solo se refleja el valor guardado).
    const savedZoom = cachedSettings[ZOOM_KEY];
    if (typeof savedZoom === 'number') currentZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, savedZoom));
    renderZoom();
    document.getElementById('settings-zoom-dec')?.addEventListener('click', () => changeZoom(-ZOOM_STEP));
    document.getElementById('settings-zoom-inc')?.addEventListener('click', () => changeZoom(ZOOM_STEP));

    // Filas por página (un select por vista)
    renderRowsSelects();
    document.getElementById('settings-rows-card')?.addEventListener('change', (e) => {
        const sel = e.target.closest('.settings-rows-select');
        if (sel) saveRowsPerPage(sel.dataset.view, Number(sel.value));
    });

    // Cliente + BU por defecto (dependientes: al cambiar de cliente se repuebla la BU)
    document.getElementById('settings-client-select')?.addEventListener('change', async (e) => {
        const clientName = e.target.value;
        renderBUSelect(clientName, '');
        const buSel = document.getElementById('settings-bu-select');
        await saveDefaultContext(clientName, clientName && buSel ? buSel.value : '');
    });
    document.getElementById('settings-bu-select')?.addEventListener('change', (e) => {
        const clientName = document.getElementById('settings-client-select')?.value || '';
        saveDefaultContext(clientName, e.target.value);
    });

    // Almacenamiento
    document.getElementById('settings-cache-list')?.addEventListener('click', handleCacheClick);
}

/**
 * Refresca los datos dinámicos de la vista. Se llama cada vez que se abre Ajustes:
 * la lista de clientes y los tamaños/ficheros de caché pueden haber cambiado.
 */
export async function view() {
    renderRowsSelects();
    await populateClientSelect();
    await renderCacheList();
}
