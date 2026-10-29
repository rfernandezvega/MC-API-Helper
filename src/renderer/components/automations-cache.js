// Fichero: src/renderer/components/automations-cache.js
// Descripción: Caché de automatismos (pasos, actividades y DEs destino) por cliente+BU, compartida
// por la búsqueda de usos de DEs y el Analizador de Automatismos. Fuente: ClientAutomations/<cacheKey>.json.
// Solo se descarga o actualiza cuando el usuario lo pide, porque cuesta una llamada por automatismo.

import * as mcApiService from '../api/mc-api-service.js';

// Nombres legibles de los tipos de actividad de Automation Studio (objectTypeId).
export const AUTOMATION_ACTIVITY_TYPES = {
    42: 'Email', 43: 'Import', 45: 'Group', 53: 'File Transfer', 73: 'Data Extract', 84: 'Report',
    300: 'SQL Query', 303: 'Filter', 423: 'SSJS Script', 425: 'ELT', 427: 'Build Audience', 467: 'Wait',
    724: 'Mobile List Refresh', 725: 'MobileConnect', 726: 'Mobile Import', 733: 'InteractionStudio',
    736: 'MobilePush', 749: 'IS Event', 756: 'IS Date Event', 771: 'SF Send', 783: 'GroupConnect',
    1010: 'Thunderhead', 1101: 'IS Decision', 1701: 'Einstein Rec', 1000: 'Verification', 952: 'Journey Entry: Audience'
};

// Detalles que se piden a la vez y cada cuántas llamadas se renueva el token.
const CONCURRENCY = 4;
const TOKEN_REFRESH_EVERY = 25;

/**
 * Carga la caché de automatismos del contexto activo.
 * @param {string} clientName - Clave de caché (cliente + BU).
 * @returns {Promise<{automations: Array, lastRefresh: string}|null>} null si no hay caché.
 */
export async function loadAutomationsCache(clientName) {
    if (!clientName) return null;
    try {
        const result = await window.electronAPI.loadClientAutomations(clientName);
        if (result?.success && Array.isArray(result.automations)) {
            return { automations: result.automations, lastRefresh: result.lastRefresh };
        }
    } catch { /* sin caché */ }
    return null;
}

/**
 * Descarga el detalle de todos los automatismos de la BU y guarda la caché completa.
 * Los que fallan se guardan con su error para poder avisar, sin interrumpir el resto.
 * @param {object} opts
 * @param {Function} opts.getAuthenticatedConfig - Devuelve la config autenticada (se renueva durante la descarga).
 * @param {string} opts.clientName - Clave de caché (cliente + BU).
 * @param {Array} [opts.list] - Lista de automatismos ya descargada (si no, se pide).
 * @param {Function} [opts.onProgress] - Callback (hechos, total); el llamador lo crea con ui.makeEtaProgress.
 * @param {Function} [opts.log] - Función para registrar mensajes en el panel de logs.
 * @returns {Promise<{automations: Array, lastRefresh: string, apiCalls: number, failed: number}>}
 */
export async function refreshAutomationsCache({ getAuthenticatedConfig, clientName, list, onProgress, log }) {
    let apiConfig = await getAuthenticatedConfig();
    let apiCalls = 0;

    if (!list) {
        list = await mcApiService.fetchAllAutomations(apiConfig);
        apiCalls++;
    }
    // Se registran los campos de la lista para valorar en el futuro una actualización incremental.
    if (log && list[0]) log(`Campos de la lista de automatismos: ${Object.keys(list[0]).join(', ')}`);

    const automations = [];
    let failed = 0;

    for (let i = 0; i < list.length; i += CONCURRENCY) {
        if (i > 0 && i % TOKEN_REFRESH_EVERY < CONCURRENCY) apiConfig = await getAuthenticatedConfig();

        const chunk = list.slice(i, i + CONCURRENCY);
        const results = await Promise.all(chunk.map(async entry => {
            try {
                const detail = await mcApiService.fetchAutomationDetailsById(entry.id, apiConfig);
                return trimAutomation(entry, detail);
            } catch (error) {
                failed++;
                if (log) log(`No se pudo descargar el automatismo "${entry.name}": ${error.message}`);
                return { ...trimAutomation(entry, {}), steps: null, error: error.message };
            }
        }));
        apiCalls += chunk.length;
        automations.push(...results);

        if (onProgress) onProgress(Math.min(i + CONCURRENCY, list.length), list.length);
    }

    const lastRefresh = new Date().toISOString();
    const saved = await window.electronAPI.saveClientAutomations({ clientName, automations, lastRefresh });
    if (!saved?.success && log) log(`No se pudo guardar la caché de automatismos: ${saved?.error || 'error desconocido'}`);

    return { automations, lastRefresh, apiCalls, failed };
}

/**
 * Sustituye en la caché un automatismo por su detalle recién descargado (o lo añade si es nuevo) y la
 * guarda, sin cambiar la fecha general de la caché; la entrada lleva su propia fecha en refreshedAt.
 * Si no existe caché no hace nada, para no crear una caché parcial con un solo automatismo.
 * @param {string} clientName - Clave de caché (cliente + BU).
 * @param {object} detail - Detalle REST del automatismo (con id y steps).
 * @returns {Promise<{cache: {automations: Array, lastRefresh: string}|null, updated: boolean, saved: boolean}>}
 */
export async function updateAutomationInCache(clientName, detail) {
    const cache = await loadAutomationsCache(clientName);
    if (!cache || !detail?.id || !Array.isArray(detail.steps)) return { cache, updated: false, saved: false };

    const id = String(detail.id).toLowerCase();
    const index = cache.automations.findIndex(a => String(a.id || '').toLowerCase() === id);
    const previous = index >= 0 ? cache.automations[index] : {};
    const entry = {
        ...trimAutomation({ ...previous, status: detail.status || previous.status }, detail),
        refreshedAt: new Date().toISOString()
    };
    if (index >= 0) cache.automations[index] = entry;
    else cache.automations.push(entry);

    let saved = false;
    try {
        const result = await window.electronAPI.saveClientAutomations({ clientName, automations: cache.automations, lastRefresh: cache.lastRefresh });
        saved = !!result?.success;
    } catch { /* se sigue con la caché en memoria */ }
    return { cache, updated: true, saved };
}

/**
 * Reduce el detalle de un automatismo a lo que usan las búsquedas (pasos, actividades y DEs destino).
 * @param {object} entry - Elemento de la lista de automatismos.
 * @param {object} detail - Detalle REST del automatismo.
 * @returns {object}
 */
function trimAutomation(entry, detail) {
    return {
        id: detail.id || entry.id,
        name: detail.name || entry.name,
        key: detail.key || entry.key || entry.customerKey || null,
        status: entry.status || detail.status || null,
        categoryId: detail.categoryId ?? entry.categoryId ?? null,
        steps: (detail.steps || []).map(step => ({
            step: step.step,
            name: step.name || '',
            activities: (step.activities || []).map(act => ({
                id: act.id,
                name: act.name,
                objectTypeId: act.objectTypeId,
                activityObjectId: act.activityObjectId,
                targetDataExtensions: (act.targetDataExtensions || []).map(t => ({ id: t.id, name: t.name, key: t.key }))
            }))
        }))
    };
}

/**
 * Construye un índice "actividad → automatismos donde está", equivalente a findAutomationForActivity
 * pero sin llamadas. Se indexa por activityObjectId y por id de actividad, en minúsculas.
 * @param {Array} automations - Automatismos de la caché.
 * @returns {Map<string, Array<{automationName: string, step: string, automationId: string}>>}
 */
export function buildActivityLocationIndex(automations) {
    const index = new Map();
    const add = (key, location) => {
        if (!key) return;
        const k = String(key).toLowerCase();
        if (!index.has(k)) index.set(k, []);
        const list = index.get(k);
        if (!list.some(l => l.automationId === location.automationId && l.step === location.step)) list.push(location);
    };
    for (const auto of automations || []) {
        for (const step of auto.steps || []) {
            for (const act of step.activities || []) {
                const location = { automationName: auto.name, step: step.step, automationId: auto.id };
                add(act.activityObjectId, location);
                add(act.id, location);
            }
        }
    }
    return index;
}

/**
 * Devuelve las actividades de la caché que escriben en una DE (por su targetDataExtensions),
 * comparando por ObjectID, External Key o nombre sin distinguir mayúsculas.
 * @param {Array} automations - Automatismos de la caché.
 * @param {{name: string, key?: string, objectID?: string}} de - DE buscada.
 * @returns {Array<{automation: object, step: object, activity: object}>}
 */
export function findActivitiesTargetingDe(automations, de) {
    const eq = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
    const result = [];
    for (const automation of automations || []) {
        for (const step of automation.steps || []) {
            for (const activity of step.activities || []) {
                const targets = activity.targetDataExtensions || [];
                if (targets.some(t => eq(t.id, de.objectID) || eq(t.key, de.key) || eq(t.name, de.name))) {
                    result.push({ automation, step, activity });
                }
            }
        }
    }
    return result;
}
