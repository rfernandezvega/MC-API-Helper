// =======================================================================================
// --- Fichero: src/renderer/ui/usage-tracker.js ---
// --- Descripción: Registro local de uso de la app: qué acciones se pulsan y cuántas
// ---              veces se accede a cada cliente/BU. Los datos NUNCA salen del equipo.
// ---
// --- Se captura con un único listener delegado sobre los botones de acción en vez de
// --- instrumentar cada componente: así cualquier botón nuevo queda registrado solo.
// --- Los contadores se acumulan en memoria y se vuelcan a disco en los mismos momentos
// --- que el contador de llamadas API (fin de operación y cierre), no en cada clic.
// =======================================================================================

// Contexto activo (cliente + BU). Lo inyecta app.js desde org-manager.
let getContext = () => ({ clientName: '', mid: '' });

// Eventos pendientes de volcar. Clave: cliente|MID|tipo|evento.
const pending = new Map();

// Evita enganchar los listeners dos veces si se llamara a init() más de una vez.
let started = false;

// Evita que un texto de botón largo se guarde entero como etiqueta.
const MAX_LABEL = 80;

// Modales genéricos cuyos botones no dicen nada de lo que estaba haciendo el usuario:
// "Aceptar" o "Confirmar" saldrían siempre los primeros del ranking sin aportar nada.
const IGNORED_SCOPES = new Set(['custom-alert-modal', 'custom-confirm-modal']);

/**
 * Arranca el registro: engancha la captura de clics y los volcados a disco.
 * @param {object} dependencies - { getContext } para saber a qué cliente/BU imputar.
 */
export function init(dependencies = {}) {
    if (dependencies.getContext) getContext = dependencies.getContext;
    // Un segundo init duplicaría los listeners y contaría cada clic dos veces.
    if (started) return;
    started = true;

    // En fase de captura para contar el clic aunque el handler del botón detenga la propagación.
    document.addEventListener('click', handleClick, true);

    // Mismos disparadores que el volcado de llamadas API: al terminar una operación y al cerrar.
    document.addEventListener('mc-operation-end', flush);
    window.addEventListener('beforeunload', flush);
}

/**
 * Cuenta el clic: la navegación del menú lateral se registra como visita a una vista y
 * los botones como acción. Los botones deshabilitados se ignoran porque el navegador no
 * llega a ejecutar su acción.
 * @param {MouseEvent} e
 */
function handleClick(e) {
    const menuItem = e.target?.closest?.('.macro-item[data-macro]');
    if (menuItem) {
        track('vista', menuItem.getAttribute('data-macro'), cut(menuItem.textContent.trim()));
        return;
    }

    const button = e.target?.closest?.('.action-button');
    if (!button || button.disabled) return;

    const { action, label } = describeButton(button);
    if (action) track('accion', action, label);
}

/**
 * Deriva de un botón su identificador estable y su etiqueta legible. El identificador
 * combina el ámbito (sección o modal), las pestañas abiertas y el id del botón, para que
 * dos "Refrescar" de vistas distintas —o dos "Buscar" de pestañas distintas del mismo
 * buscador— no se mezclen; la etiqueta es lo que el usuario ve en pantalla.
 * @param {HTMLElement} button
 * @returns {{action: string, label: string}}
 */
function describeButton(button) {
    const section = button.closest('.section');
    const modal = button.closest('.modal-overlay');
    const scopeId = section?.id || modal?.id || 'app';
    if (IGNORED_SCOPES.has(scopeId)) return { action: '', label: '' };

    const scopeLabel = section?.querySelector('h2')?.textContent?.trim()
        || modal?.querySelector('h3')?.textContent?.trim()
        || 'General';

    const text = (button.textContent || '').replace(/\s+/g, ' ').trim();
    const buttonId = button.id || slug(text);
    if (!buttonId) return { action: '', label: '' };

    // Los botones de cabecera viven fuera de la pestaña, así que si el botón no cuelga de
    // ninguna se usa la pestaña activa de la sección: es la que el usuario está mirando.
    const tabs = describeTabs(button, section);
    const tabKey = tabs.ids.length ? `${tabs.ids.join('/')}::` : '';
    const tabLabel = tabs.labels.length ? `${tabs.labels.join(' › ')} › ` : '';

    return {
        action: `${scopeId}::${tabKey}${buttonId}`,
        label: cut(`${scopeLabel} › ${tabLabel}${text || buttonId}`)
    };
}

/**
 * Devuelve las pestañas en las que se encuentra el botón (o la activa de la sección si
 * el botón está en la cabecera), de la más externa a la más interna.
 * @param {HTMLElement} button
 * @param {HTMLElement|null} section
 * @returns {{ids: Array<string>, labels: Array<string>}}
 */
function describeTabs(button, section) {
    const panels = [];
    let panel = button.closest('.tab-content');
    while (panel) {
        panels.unshift(panel);
        panel = panel.parentElement?.closest('.tab-content') || null;
    }
    if (panels.length === 0 && section) {
        const active = section.querySelector('.tab-content.active');
        if (active) panels.push(active);
    }

    const ids = [];
    const labels = [];
    panels.forEach(p => {
        if (!p.id) return;
        ids.push(p.id);
        const tabButton = document.querySelector(`.tab-button[data-tab="${p.id}"]`);
        labels.push((tabButton?.textContent || p.id).replace(/\s+/g, ' ').trim());
    });
    return { ids, labels };
}

/** Convierte un texto en un identificador utilizable como clave (botones sin id). */
function slug(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Recorta una etiqueta larga para que el fichero no crezca por textos kilométricos. */
function cut(text) {
    const clean = String(text || '');
    return clean.length > MAX_LABEL ? `${clean.slice(0, MAX_LABEL - 1)}…` : clean;
}

/**
 * Suma un evento al contador en memoria del contexto activo. Sin cliente activo no se
 * registra nada: no habría a quién imputarlo y ensuciaría las estadísticas.
 * @param {'accion'|'vista'} type - Tipo de evento.
 * @param {string} action - Identificador estable del evento.
 * @param {string} label - Etiqueta legible que se mostrará en Estadísticas.
 */
export function track(type, action, label) {
    const { clientName = '', mid = '' } = getContext() || {};
    if (!clientName) return;

    const key = `${clientName}|${mid}|${type}|${action}`;
    const entry = pending.get(key);
    if (entry) {
        entry.count++;
    } else {
        pending.set(key, { clientName, mid, type, action, label, count: 1 });
    }
}

/**
 * Registra un acceso al contexto activo. Lo llama org-manager al activar cliente + BU.
 */
export async function trackAccess() {
    const { clientName, mid } = getContext() || {};
    if (!clientName) return;
    try {
        await window.electronAPI.addUsageAccess(clientName, mid);
    } catch (e) { /* el acceso se perderá; no merece interrumpir al usuario */ }
}

/**
 * Descarta lo que quede sin volcar. Lo usa la vista de Estadísticas al borrar los datos,
 * para que los clics de ese propio borrado no reaparezcan justo después.
 */
export function discardPending() {
    pending.clear();
}

/**
 * Vuelca a disco las acciones acumuladas. Si la escritura falla, se devuelven al buffer
 * para intentarlo en el siguiente volcado.
 */
export async function flush() {
    if (pending.size === 0) return;

    const entries = Array.from(pending.values());
    pending.clear();

    try {
        await window.electronAPI.addUsageEvents(entries);
    } catch (e) {
        entries.forEach(entry => {
            const key = `${entry.clientName}|${entry.mid}|${entry.type}|${entry.action}`;
            const existing = pending.get(key);
            if (existing) existing.count += entry.count;
            else pending.set(key, entry);
        });
    }
}
